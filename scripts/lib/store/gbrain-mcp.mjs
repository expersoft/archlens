// The gbrain connector in MCP mode. The CLI cannot call the MCP server (its credentials live in the user's agent), so it
// keeps a mirror of the base in <base>/.archlens/mirror/ (the pages of gbrain-layout.mjs under the prefix, as archlens
// writes them; revisions.json, slug → gbrain revision; sync.json, where the last pull ended: what was updated after it is fetched again) and trades files with the agent: a
// request lists the exact tool calls to make, the response holds the raw result of each call, in order. plan, show and
// query read the mirror; the version of an object is the gbrain revision of its page. Writing (apply) comes next.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from '../../vendor/yaml/index.js';
import { contentVersion, relationshipsById } from './ops.mjs';
import { subgraphOf } from './contract.mjs';
import { writeFilesAtomically } from './atomic.mjs';
import { storeError } from './errors.mjs';
import { readVaultFiles } from './markdown.mjs';
import { toGbrainFiles, fromGbrainFiles, COMMON_TAG } from './gbrain-layout.mjs';
import { prefixOf } from './gbrain-git.mjs';

export const MIRROR = join('.archlens', 'mirror');
export const REMOTE = join('.archlens', 'remote'); // the requests in flight (and, without --out, their files)
export const SESSION = join('.archlens', 'session.json');
const REVISIONS = 'revisions.json';
const SYNC = 'sync.json';
const PROTOCOL = '1.0';
const LIMIT = 100; // list_pages rows per call (gbrain's cap for remote callers)
// Frontmatter keys gbrain adds to the pages it serves: the slug stamp, the content-quality markers, its own identity.
const GBRAIN_KEYS = ['slug', 'source_id', 'content_flag', 'quarantine'];
// What gbrain's serializer puts between the body and a timeline it split off (a "## Timeline" of dated bullets).
const TIMELINE = '\n\n<!-- timeline -->\n\n';
const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const json = v => JSON.stringify(v, null, 2) + '\n';
const rel = p => relative(process.cwd(), p) || '.';
const responseError = why => storeError('E_REMOTE_RESPONSE', `${why}; nada foi gravado no espelho`);

/**
 * A page as get_page gives it back (gbrain's canonical serialization: type and title first, the rest of the frontmatter
 * in its storage order, tags last, a blank line, the trimmed body, the timeline sentinel) as the page text the layout
 * reads: the keys gbrain added, the blank line and the sentinel go; the text after the archlens block stays.
 */
export function archlensPage(content) {
  const m = FRONTMATTER.exec(content);
  if (!m) return content;
  let fm;
  try { fm = parseYaml(m[1] ?? ''); } catch { return content; } // the layout reports the page
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return content;
  for (const k of GBRAIN_KEYS) delete fm[k];
  const body = content.slice(m[0].length).replace(/^\r?\n/, '').replace(TIMELINE, '\n\n');
  return `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n${body}`;
}

/**
 * The pages under `prefix` as archlens writes them: read through the layout and rendered again (key order, YAML style
 * and link names as archlens writes them, the text people wrote kept). Pages the layout does not own are left out.
 */
export function normalizeMirror(files, prefix) {
  return new Map([...toGbrainFiles(fromGbrainFiles(files, { prefix }), { prefix })].filter(([path]) => path.endsWith('.md')));
}

/** Every .md file under `<root>/<sub>/`, as root-relative path (with "/") → text. */
function readTree(root, sub) {
  const out = new Map();
  const walk = at => {
    const abs = join(root, at);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = `${at}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && e.name.endsWith('.md')) out.set(r, readFileSync(join(root, r), 'utf8'));
    }
  };
  walk(sub);
  return out;
}

const readJsonFile = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);
/** (updated_at_iso, slug) of `row` comes after `cursor` ({ since, slug }): the order of gbrain's list keyset. */
const after = (row, cursor) => row.updated_at_iso > cursor.since || (row.updated_at_iso === cursor.since && row.slug > cursor.slug);

/**
 * The raw result of a call: as the tool returned it, or as the MCP tool result that carries it ({ content: [{ type:
 * "text", text }] } or structuredContent). { error } when the tool failed.
 */
function unwrap(result, where) {
  const envelope = result && typeof result === 'object' && !Array.isArray(result) && Array.isArray(result.content);
  const text = envelope ? result.content.filter(c => c?.type === 'text').map(c => c.text).join('') : null;
  if (result?.isError) return { error: text || JSON.stringify(result) };
  if (!envelope) return { value: result };
  if (result.structuredContent !== undefined) return { value: result.structuredContent };
  try { return { value: JSON.parse(text) }; } catch { throw responseError(`${where}: o resultado não é o JSON que a ferramenta devolve`); }
}

/** `<prefix>/...` page slug of an object of `snapshot`, or null when the object is not there. */
export function pageOf(ref, snapshot, prefix) {
  const raw = snapshot?.raw;
  if (!raw) return null;
  const at = ref.indexOf(':');
  const [kind, id] = at < 0 ? [ref, null] : [ref.slice(0, at), ref.slice(at + 1)];
  const elementPage = eid => { const e = (raw.model?.elements ?? []).find(x => x?.id === eid); return e ? `${prefix}/${e.type}/${e.id}` : null; };
  switch (kind) {
    case 'element': return elementPage(id);
    case 'relationship': { const r = relationshipsById(raw).get(id); return r ? elementPage(r.from) : null; } // it lives on its origin's page
    case 'view': return (raw.views ?? []).some(v => v?.key === id) ? `${prefix}/views/${id}` : null;
    case 'note': return snapshot.notes?.[id] != null ? `${prefix}/notes/${id}` : null;
    case 'manifest': return `${prefix}/manifest`;
    default: return null;
  }
}

/**
 * `store` is the validated `store` of archlens.json ({ kind: 'gbrain', mode: 'mcp', server, sourceId?, prefix }).
 * `remote` builds the request files and takes in their responses (archlens remote <base> pull | check).
 */
export function gbrainMcpConnector(locator, store, { describe = `${rel(locator.path)}/ (gbrain mcp)` } = {}) {
  const dir = locator.path;
  const prefix = prefixOf(store.prefix);
  const mirror = join(dir, MIRROR);
  const scope = store.sourceId ? { source_id: store.sourceId } : {};
  const manifestPage = `${prefix}/manifest.md`;
  const stale = () => storeError('E_REMOTE_STALE',
    `${describe}: a base está no gbrain (modo mcp) e o espelho local ainda não foi sincronizado; rode "archlens remote ${rel(dir)} pull" e siga os pedidos`);

  const revisions = () => readJsonFile(join(mirror, REVISIONS), {});
  const sync = () => readJsonFile(join(mirror, SYNC), null);

  /** The mirror: { files, flat, base } (base null when gbrain has no manifest under the prefix); E_REMOTE_STALE before a pull. */
  function load() {
    if (!existsSync(join(mirror, SYNC))) throw stale();
    const files = readTree(mirror, prefix);
    if (!files.has(manifestPage)) return { files, flat: new Map(), base: null };
    const flat = fromGbrainFiles(files, { prefix });
    return { files, flat, base: readVaultFiles(flat) };
  }
  const read = () => { const { base } = load(); return base && { raw: base.raw, notes: base.notes }; };

  // The request in flight of each flow (pull, check): a response must answer it, and a new request replaces it.
  const pendingPath = flow => join(dir, REMOTE, `${flow}.json`);
  const pending = flow => readJsonFile(pendingPath(flow), null);
  const keep = (flow, state) => writeFilesAtomically(join(dir, REMOTE), new Map([[`${flow}.json`, json(state)]]));
  const request = (step, calls) => ({ 'archlens-remote': PROTOCOL, id: randomUUID(), step, calls });

  /** The results of the responses to the request in flight, in order (several files are joined); E_REMOTE_RESPONSE otherwise. */
  function resultsOf(flow, responses) {
    const state = pending(flow);
    if (!state) throw responseError(`nenhum pedido de ${flow} em aberto; rode "archlens remote ${rel(dir)} ${flow}"`);
    const req = state.request;
    const results = [];
    for (const r of responses) {
      if (r?.['archlens-remote'] !== PROTOCOL) throw responseError(`a resposta não é do protocolo archlens-remote ${PROTOCOL}`);
      if (r.request !== req.id) throw responseError(`a resposta é do pedido ${JSON.stringify(r.request)}, não do pedido em aberto (${req.id}, passo ${req.step})`);
      if (!Array.isArray(r.results)) throw responseError('a resposta não tem a lista "results"');
      results.push(...r.results);
    }
    if (results.length !== req.calls.length) throw responseError(`o pedido ${req.id} tem ${req.calls.length} chamada(s) e a resposta traz ${results.length} resultado(s)`);
    return { state, results: results.map((r, i) => unwrap(r, `resultado ${i + 1} (${req.calls[i].tool})`)) };
  }

  const listCall = cursor => ({ tool: 'list_pages', arguments: {
    tag: COMMON_TAG, include_deleted: true, sort: 'updated_asc', limit: LIMIT,
    ...(cursor ? { updated_after: cursor.since, updated_after_slug: cursor.slug } : {}), ...scope } });

  /**
   * Writes what a pull found: the pages fetched (archlens bytes again), without the ones gone; their revisions; the
   * cursor. All or nothing.
   */
  function commit({ fetched, removed, cursor }) {
    const cur = existsSync(join(mirror, SYNC)) ? readTree(mirror, prefix) : new Map();
    const revs = revisions();
    const files = new Map(cur);
    for (const slug of removed) { files.delete(`${slug}.md`); delete revs[slug]; }
    for (const { slug, revision, content } of fetched) { files.set(`${slug}.md`, archlensPage(content)); revs[slug] = revision; }
    const next = files.has(manifestPage) ? normalizeMirror(files, prefix) : files;
    const changes = new Map();
    for (const path of new Set([...cur.keys(), ...next.keys()])) if (cur.get(path) !== next.get(path)) changes.set(path, next.get(path) ?? null);
    changes.set(REVISIONS, json(Object.fromEntries(Object.entries(revs).sort(([a], [b]) => (a < b ? -1 : 1)))));
    changes.set(SYNC, json({ cursor, pulledAt: new Date().toISOString() }));
    writeFilesAtomically(mirror, changes);
    rmSync(pendingPath('pull'), { force: true });
    return { fetched: fetched.map(f => f.slug), removed };
  }

  /** The rows of a list_pages result; E_REMOTE_RESPONSE when it is not one. */
  function rowsOf(res, i) {
    if (res.error) throw responseError(`a chamada ${i + 1} (list_pages) falhou: ${res.error}`);
    const ok = Array.isArray(res.value) && res.value.every(r => r && typeof r.slug === 'string' && typeof r.updated_at_iso === 'string');
    if (!ok) throw responseError(`o resultado ${i + 1} (list_pages) não é uma lista de páginas com "slug" e "updated_at_iso"`);
    return res.value;
  }

  /** The page of a get_page result; E_REMOTE_RESPONSE when it is not the page asked for, with its content and revision. */
  function pageOfResult(res, call, i) {
    const slug = call.arguments.slug;
    if (res.error) throw responseError(`a chamada ${i + 1} (get_page ${slug}) falhou: ${res.error}; rode o pull de novo`);
    const p = res.value;
    if (!p || p.slug !== slug) throw responseError(`o resultado ${i + 1} deveria ser a página ${slug} (veio ${JSON.stringify(p?.slug)})`);
    if (typeof p.content !== 'string' || typeof p.revision !== 'string') throw responseError(`o resultado ${i + 1} (${slug}) não traz "content" e "revision" (get_page com include_content e content_only)`);
    if (store.sourceId && p.source_id !== undefined && p.source_id !== store.sourceId) throw responseError(`a página ${slug} veio da fonte ${p.source_id}, não de ${store.sourceId}`);
    return p;
  }

  const remote = {
    /** Where a request goes without --out. */
    requestPath: req => join(dir, REMOTE, `${req.step}-request.json`),

    /**
     * The first list request of a pull. Every pull lists the metadata of all the archlens pages from the start (a delete
     * does not move a page's updated_at in gbrain, so a listing from the last cursor would miss it); only the pages new
     * to the mirror or updated after the last pull are fetched, and those not listed alive leave the mirror.
     */
    pull() {
      const last = existsSync(join(mirror, SYNC)) ? sync().cursor ?? null : null;
      const req = request('list', [listCall(null)]);
      keep('pull', { request: req, since: last, cursor: last, changed: [], deleted: [], live: [] });
      return req;
    },

    /** Takes the response to the pull request in flight: { request } (the next one) or { done: { fetched, removed } }. */
    pullIngest(responses) {
      const { state, results } = resultsOf('pull', responses);
      if (state.request.step === 'get') {
        const fetched = results.map((r, i) => pageOfResult(r, state.request.calls[i], i))
          .map(p => ({ slug: p.slug, revision: p.revision, content: p.content, gone: !!p.deleted_at }));
        const gone = fetched.filter(p => p.gone).map(p => p.slug);
        return { done: commit({ fetched: fetched.filter(p => !p.gone), removed: [...state.removed, ...gone], cursor: state.cursor }) };
      }
      const rows = rowsOf(results[0], 0);
      const known = revisions();
      const changed = new Set(state.changed), deleted = new Set(state.deleted), live = new Set(state.live);
      let cursor = state.cursor;
      for (const row of rows) {
        const c = { since: row.updated_at_iso, slug: row.slug };
        if (!cursor || after(row, cursor)) cursor = c;
        if (!row.slug.startsWith(`${prefix}/`)) continue; // another base in the same brain
        if (row.deleted_at) { deleted.add(row.slug); changed.delete(row.slug); continue; }
        live.add(row.slug);
        if (!(row.slug in known) || !state.since || after(row, state.since)) changed.add(row.slug);
      }
      if (rows.length < LIMIT) {
        const removed = [...new Set([...deleted, ...Object.keys(known).filter(s => !live.has(s))])].sort();
        const get = [...changed].filter(s => !removed.includes(s)).sort();
        if (!get.length) return { done: commit({ fetched: [], removed, cursor }) };
        const req = request('get', get.map(slug => ({ tool: 'get_page', arguments: { slug, include_content: true, content_only: true, ...scope } })));
        keep('pull', { request: req, removed, cursor });
        return { request: req };
      }
      const last = rows.at(-1);
      const req = request('list', [listCall({ since: last.updated_at_iso, slug: last.slug })]); // the next page of the listing
      keep('pull', { ...state, request: req, cursor, changed: [...changed], deleted: [...deleted], live: [...live] });
      return { request: req };
    },

    /** The session check: who the MCP says we are, and the full tool surface (writing needs put_pages, delete_page, restore_page). */
    check() {
      const req = request('tools', [{ tool: 'whoami', arguments: {} }, { tool: 'request_tools', arguments: { surface: 'full' } }]);
      keep('check', { request: req });
      return req;
    },

    /** Takes the response to the check in flight and records in .archlens/session.json whether writing is allowed. */
    checkIngest(responses) {
      const { results: [who, tools] } = resultsOf('check', responses);
      if (who.error) throw responseError(`whoami falhou (o MCP "${store.server}" está configurado e conectado?): ${who.error}`);
      if (typeof who.value?.transport !== 'string') throw responseError('o resultado de whoami não tem "transport"');
      const identity = Object.fromEntries(['transport', 'client_id', 'client_name', 'token_name', 'scopes', 'source_id']
        .filter(k => who.value[k] !== undefined).map(k => [k, who.value[k]]));
      const surface = tools.value?.surface ?? null;
      const write = !tools.error && surface === 'full';
      const reason = write ? undefined : tools.error ?? tools.value?.reason ?? `conjunto de ferramentas "${surface ?? 'desconhecido'}"`;
      const session = { server: store.server, checkedAt: new Date().toISOString(), identity, surface, write, ...(reason ? { reason } : {}) };
      writeFilesAtomically(dir, new Map([[SESSION, json(session)]]));
      rmSync(pendingPath('check'), { force: true });
      return session;
    },
  };

  const c = {
    kind: 'gbrain', mode: 'mcp', writable: true, locator, versioning: 'object', remote,
    describe: () => describe,
    read,
    readSubgraph(query) {
      const r = read();
      if (!r) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${describe}`);
      return subgraphOf(r.raw, query);
    },
    version: () => contentVersion(read()),
    /** The gbrain revision of each object's page in the mirror (null when the object is not in the base). */
    objectVersions(refs, snapshot = read()) {
      const revs = revisions();
      return new Map([...refs].map(ref => { const slug = pageOf(ref, snapshot, prefix); return [ref, slug ? revs[slug] ?? null : null]; }));
    },
    history: () => read()?.raw.changelog ?? [],
    /** The mirror's base as the vault reads it ({ base: { raw, notes, ctx }, files }), with the text people wrote; null when none. */
    vault() { const { base, flat } = load(); return base && { base, files: flat }; },
    apply() { throw storeError('E_STORE_UNSUPPORTED', `${describe}: gravar no gbrain pelo MCP ainda não está disponível; use o modo git`); },
  };
  return c;
}
