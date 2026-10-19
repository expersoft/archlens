// The gbrain connector in MCP mode. The CLI cannot call the MCP server (its credentials live in the user's agent), so it
// keeps a mirror of the base in <base>/.archlens/mirror/ (the pages of gbrain-layout.mjs under the prefix, as archlens
// writes them; revisions.json, slug → gbrain revision; sync.json, the updated_at of each page as last listed: a page listed with another one is fetched again) and trades files with the agent: a
// request lists the exact tool calls to make, the response holds the raw result of each call, in order. plan, show and
// query read the mirror; the version of an object is the gbrain revision of its page. apply builds the exact write calls
// (see the apply section below) and keeps a journal of them in <base>/.archlens/applies/<id>.json.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from '../../vendor/yaml/index.js';
import { canonicalJson } from '../merge.mjs';
import { ELEMENT_TYPES } from '../registry.mjs';
import { applyOps, contentVersion, relationshipsById } from './ops.mjs';
import { writeSetOf, checkExpect } from './versions.mjs';
import { subgraphOf, conflictError, objectConflictError, appendedEntry } from './contract.mjs';
import { writeFilesAtomically } from './atomic.mjs';
import { storeError } from './errors.mjs';
import { readVaultFiles, vaultFiles } from './markdown.mjs';
import { toGbrainFiles, fromGbrainFiles, assertGbrainIds, unseal, COMMON_TAG, GBRAIN_FRONTMATTER_KEYS } from './gbrain-layout.mjs';
import { prefixOf } from './gbrain-git.mjs';

export const MIRROR = join('.archlens', 'mirror');
export const REMOTE = join('.archlens', 'remote'); // the requests in flight (and, without --out, their files)
export const SESSION = join('.archlens', 'session.json');
export const APPLIES = join('.archlens', 'applies'); // the journal of each apply: what it asked, what gbrain answered, what was there before
const REVISIONS = 'revisions.json';
const SYNC = 'sync.json';
const PROTOCOL = '1.0';
const LIMIT = 100; // list_pages rows per call (gbrain's cap for remote callers)
const BATCH_PAGES = 50; // put_pages limits (gbrain src/core/persistence/page-batch.ts)
const BATCH_BYTES = 8 * 1024 * 1024;
const HISTORY_RETRIES = 5; // rereads of the history page after a revision_conflict
// Error codes of a write refused because the page is not at the revision given (or exists when created, or is gone).
const CONFLICT_CODES = new Set(['revision_conflict', 'revision_required', 'page_not_found']);
const PENDING_STATES = new Set(['queued', 'running', 'recovering']); // a batch page accepted and still publishing
const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const json = v => JSON.stringify(v, null, 2) + '\n';
const rel = p => relative(process.cwd(), p) || '.';
const responseError = why => storeError('E_REMOTE_RESPONSE', `${why}; nada foi gravado no espelho`);

/**
 * A page as get_page gives it back (gbrain's canonical serialization: type and title first, the rest of the frontmatter
 * in its storage order, tags last, a blank line, the trimmed body) as the page text the layout reads: the keys gbrain
 * stamped, the blank line and a sentinel ending the page go; the text after the archlens block stays. The layout ends
 * every page with the sentinel, so gbrain never splits a timeline off it.
 */
export function archlensPage(content) {
  const m = FRONTMATTER.exec(content);
  if (!m) return content;
  let fm;
  try { fm = parseYaml(m[1] ?? ''); } catch { return content; } // the layout reports the page
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return content;
  for (const k of GBRAIN_FRONTMATTER_KEYS) delete fm[k];
  const body = unseal(content.slice(m[0].length).replace(/^\r?\n/, ''));
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

/**
 * The raw result of a call: as the tool returned it, or as the MCP tool result that carries it (structuredContent, or
 * the JSON in content[0]; gbrain adds one text block per notice after it). { error } when the tool failed.
 */
function unwrap(result, where) {
  const envelope = result && typeof result === 'object' && !Array.isArray(result) && Array.isArray(result.content);
  const text = envelope && result.content[0]?.type === 'text' ? result.content[0].text : null;
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
   * updated_at of each page listed. All or nothing.
   */
  function commit({ fetched, removed, listed }) {
    const cur = existsSync(join(mirror, SYNC)) ? readTree(mirror, prefix) : new Map();
    const revs = revisions();
    const files = new Map(cur);
    for (const slug of removed) { files.delete(`${slug}.md`); delete revs[slug]; }
    for (const { slug, revision, content } of fetched) { files.set(`${slug}.md`, archlensPage(content)); revs[slug] = revision; }
    const next = files.has(manifestPage) ? normalizeMirror(files, prefix) : files;
    const changes = new Map();
    for (const path of new Set([...cur.keys(), ...next.keys()])) if (cur.get(path) !== next.get(path)) changes.set(path, next.get(path) ?? null);
    changes.set(REVISIONS, json(Object.fromEntries(Object.entries(revs).sort(([a], [b]) => (a < b ? -1 : 1)))));
    changes.set(SYNC, json({ pages: listed, pulledAt: new Date().toISOString() }));
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

  // ---- apply --------------------------------------------------------------------------------------------------------
  // apply <plan> asks first for the pages the plan only read (read-check: get_page), then for the writes (apply: put_pages
  // batches with each page's expected_revision, delete_page, the history page last, one request_id per call) and opens
  // the journal; --receipts takes gbrain's answer page by page (committed, revision_conflict, pending; failed or unsent
  // when the call did not run) into the mirror and the journal; --resume asks again for what is left, --undo puts back
  // what the apply wrote. A receipt carries no updated_at, so the pages written leave sync.json: the next pull fetches
  // them once (and finds the bytes archlens wrote).
  const historySlug = `${prefix}/changelog`;
  const journalRel = id => join(APPLIES, `${id}.json`);
  const sha = v => createHash('sha256').update(canonicalJson(v)).digest('hex');
  const strip = calls => calls.map(({ tool, arguments: a }) => ({ tool, arguments: a }));
  const asRequest = r => ({ 'archlens-remote': PROTOCOL, id: r.id, step: r.step, calls: strip(r.calls) });
  const opsOf = j => j.plan?.ops ?? j.ops;

  /** Writing needs a session checked by "remote check" with gbrain's full tool surface; E_STORE_GBRAIN_SURFACE otherwise. */
  function assertWrite() {
    const s = readJsonFile(join(dir, SESSION), null);
    if (s?.write === true && s.server === store.server) return;
    const why = s?.server === store.server ? `a sessão conferida não tem esse conjunto (${s.reason ?? s.surface})` : 'a sessão do MCP ainda não foi conferida';
    throw storeError('E_STORE_GBRAIN_SURFACE', `${describe}: gravar pelo MCP exige o conjunto completo de ferramentas do gbrain (put_pages, delete_page, restore_page) e ${why}. `
      + `Rode "archlens remote ${rel(dir)} check" e siga o pedido; se o servidor não liberar o conjunto completo, use o modo git`);
  }

  /** The pages `next` changes over the mirror `cur` ({ files, flat, base }): [{ slug, op: 'put', content } | { slug, op: 'delete' }]. */
  function writesOf(cur, next) {
    const vault = new Map(cur.flat);
    for (const [r, text] of vaultFiles(next, cur.base, { read: r => cur.flat.get(r) })) { if (text === null) vault.delete(r); else vault.set(r, text); }
    const files = new Map([...toGbrainFiles(vault, { prefix })].filter(([path]) => path.endsWith('.md')));
    const out = [];
    for (const [path, content] of files) if (cur.files.get(path) !== content) out.push({ slug: path.slice(0, -3), op: 'put', content });
    // Element and view pages that are no longer in the base go; anything else under the prefix stays.
    const owned = path => { const r = path.slice(prefix.length + 1); return /^views\/[^/]+\.md$/.test(r) || (/^[^/]+\/[^/]+\.md$/.test(r) && !!ELEMENT_TYPES[r.split('/')[0]]); };
    for (const path of cur.files.keys()) if (owned(path) && !files.has(path)) out.push({ slug: path.slice(0, -3), op: 'delete' });
    return out;
  }

  /** Pages in put_pages batches of at most BATCH_PAGES pages and BATCH_BYTES of content, in order. */
  function batches(pages) {
    const out = [];
    let at = [], bytes = 0;
    for (const p of pages) {
      const n = Buffer.byteLength(p.content);
      if (n > BATCH_BYTES) throw storeError('E_STORE_GBRAIN_SIZE', `a página ${p.slug} tem ${n} bytes; o put_pages do gbrain aceita até ${BATCH_BYTES} bytes por chamada`);
      if (at.length === BATCH_PAGES || (at.length && bytes + n > BATCH_BYTES)) { out.push(at); at = []; bytes = 0; }
      at.push(p);
      bytes += n;
    }
    if (at.length) out.push(at);
    return out;
  }
  // A call as the journal keeps it: the tool call, plus the slugs it writes (in the order of its receipt).
  const withRevision = r => (r ? { expected_revision: r } : {}); // none: create only
  const putCall = pages => ({ tool: 'put_pages', arguments: { request_id: randomUUID(), pages: pages.map(p => ({ slug: p.slug, content: p.content, ...withRevision(p.expected) })), ...scope }, slugs: pages.map(p => p.slug) });
  const oneCall = (tool, p) => ({ tool, arguments: { slug: p.slug, ...withRevision(p.expected), request_id: randomUUID(), ...scope }, slugs: [p.slug] });
  const getCall = (slug, { deleted = false } = {}) => ({ tool: 'get_page', arguments: { slug, include_content: true, content_only: true, ...(deleted ? { include_deleted: true } : {}), ...scope }, slugs: [slug] });
  const isPoll = call => call.tool === 'put_pages' && !call.arguments.pages;
  const isHistory = call => call.slugs.includes(historySlug);

  /**
   * The calls that write `items` ({ slug, op: put | delete | restore, content?, expected? }): put batches, deletes,
   * restores, the history last; each item is marked requested by its call.
   */
  function writeCalls(items) {
    const rest = items.filter(i => i.slug !== historySlug);
    const calls = [...batches(rest.filter(i => i.op === 'put')).map(putCall),
      ...rest.filter(i => i.op !== 'put').map(i => oneCall(i.op === 'delete' ? 'delete_page' : 'restore_page', i)),
      ...items.filter(i => i.slug === historySlug).map(i => (i.op === 'put' ? putCall([i]) : oneCall('delete_page', i)))];
    const bySlug = new Map(items.map(i => [i.slug, i]));
    for (const c of calls) for (const slug of c.slugs) Object.assign(bySlug.get(slug), { state: 'requested', request_id: c.arguments.request_id });
    return calls;
  }

  /**
   * The calls for the pages of `pages` (slug → page of the journal) not written yet: a batch still publishing is read
   * again by its request_id; a call without a receipt (never answered, or not sent: the response cannot tell a call that
   * did not run from one that ran before the agent stopped) is sent again exactly as it was, same request_id, which gbrain
   * executes once (it runs if it never ran, it returns its first receipt if it did); only a page that failed for good
   * (not a conflict) goes in a new call. The history last.
   */
  function retryCalls(j, pages) {
    // The call a request_id was first sent with (the one with its pages; polls reuse the id).
    const sent = new Map();
    for (const c of j.calls) if (!sent.has(c.arguments.request_id)) sent.set(c.arguments.request_id, c);
    const slugsOf = c => (c.arguments.pages ? c.arguments.pages.map(p => p.slug) : [c.arguments.slug]);
    const again = new Map();
    const fresh = [];
    for (const [slug, p] of Object.entries(pages)) {
      if (p.state === 'pending' || p.state === 'requested' || p.state === 'unsent') {
        const call = sent.get(p.request_id);
        if (!again.has(p.request_id)) {
          again.set(p.request_id, p.state === 'pending' && call.tool === 'put_pages'
            ? { tool: 'put_pages', arguments: { request_id: p.request_id, ...scope }, slugs: slugsOf(call) }
            : { ...structuredClone(call), slugs: slugsOf(call) });
        }
      } else if (p.state === 'failed') fresh.push(Object.assign(p, { slug }));
      else if (p.state === 'reread') again.set(`get:${slug}`, getCall(slug, { deleted: p.op === 'restore' }));
    }
    const calls = [...again.values(), ...writeCalls(fresh)];
    return [...calls.filter(c => !isHistory(c)), ...calls.filter(isHistory)];
  }

  const readJournal = id => {
    const path = join(dir, journalRel(id));
    if (!existsSync(path)) throw storeError('E_STORE_APPLY', `não há o apply ${id} em ${rel(join(dir, APPLIES))}`);
    return JSON.parse(readFileSync(path, 'utf8'));
  };
  const journals = () => {
    const d = join(dir, APPLIES);
    return existsSync(d) ? readdirSync(d).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(d, f), 'utf8')))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)) : [];
  };
  const journalFile = j => [journalRel(j.id), json({ ...j, updatedAt: new Date().toISOString() })];
  const saveJournal = j => writeFilesAtomically(dir, new Map([journalFile(j)]));
  /** Puts `calls` in flight for `j`; the request file for the agent. */
  function issue(j, step, calls) {
    j.request = { id: randomUUID(), step, calls };
    j.calls.push(...strip(calls));
    return asRequest(j.request);
  }
  const UNDO_STATES = ['undoing', 'undone', 'undo-partial'];
  const summary = (j, request) => {
    const pages = UNDO_STATES.includes(j.state) ? j.undo.pages : j.pages;
    const slugs = Object.keys(pages).sort();
    const by = test => slugs.filter(s => test(pages[s].state));
    return { id: j.id, state: j.state, entry: j.entry, committed: by(s => s === 'committed'), conflicts: by(s => s === 'revision_conflict'),
      pending: by(s => s !== 'committed' && s !== 'revision_conflict'), ...(request ? { request } : {}) };
  };

  /** The code of a tool error (gbrain's error JSON: `error`, else `code`), or null. */
  const codeOf = text => { try { const e = JSON.parse(text); return e?.error ?? e?.code ?? null; } catch { return null; } };

  /**
   * What a call's result says of each page it writes: [{ slug, state, revision?, current? }] (E_REMOTE_RESPONSE when it is
   * not its receipt). `pages`: the journal's pages, for a poll's receipt, which gbrain rebuilds from the admitted pages only.
   */
  function outcomesOf(call, res, i, pages) {
    const where = `resultado ${i + 1} (${call.tool})`;
    if (call.tool === 'get_page') {
      // A page gone from gbrain (deleted, or a soft delete purged) is an answer too: page null.
      const gone = res.error && codeOf(res.error) === 'page_not_found';
      return [{ slug: call.arguments.slug, state: 'reread', page: gone ? null : pageOfResult(res, call, i) }];
    }
    const all = state => call.slugs.map(slug => ({ slug, state }));
    if (res.error) {
      const code = codeOf(res.error);
      return all(code === 'write_pending' ? 'pending' : CONFLICT_CODES.has(code) ? 'revision_conflict' : 'failed');
    }
    const v = res.value;
    const id = call.arguments.request_id;
    if (call.tool !== 'put_pages') {
      if (!v || typeof v !== 'object' || (v.slug !== undefined && v.slug !== call.slugs[0]) || (v.request_id !== undefined && v.request_id !== id)) {
        throw responseError(`${where}: não é o recibo de ${call.slugs[0]} (request_id ${id})`);
      }
      return [{ slug: call.slugs[0], state: v.state === 'committed' ? 'committed' : 'pending', revision: typeof v.revision === 'string' ? v.revision : null }];
    }
    if (!v || !Array.isArray(v.pages)) throw responseError(`${where}: não é o recibo de um lote (falta "pages")`);
    if (v.batch_request_id !== id && v.client_request_id !== id) throw responseError(`${where}: o recibo é do lote ${JSON.stringify(v.batch_request_id)}, não do lote ${id}`);
    if (v.pages.length !== call.slugs.length) throw responseError(`${where}: o lote tem ${call.slugs.length} página(s) e o recibo traz ${v.pages.length}`);
    const poll = !call.arguments.pages;
    return v.pages.flatMap((pg, k) => {
      const slug = call.slugs[k];
      if (poll && pg?.state === 'not_admitted' && !pg.slug) {
        // Refused before admission, so no row: no news of a page that has left this batch or is not waiting on it.
        const p = pages[slug];
        return p?.request_id === id && p.state === 'pending' ? [{ slug, state: 'failed' }] : [];
      }
      if (pg?.slug !== slug) throw responseError(`${where}: a página ${k + 1} do recibo deveria ser ${slug} (veio ${JSON.stringify(pg?.slug)})`);
      if (pg.state === 'committed') {
        // gbrain reports `revision: null` when the receipt has none: the page then leaves revisions.json, and the next pull fetches it.
        if (typeof pg.revision !== 'string' && pg.revision !== null) throw responseError(`${where}: ${slug} gravada sem "revision"`);
        return { slug, state: 'committed', revision: pg.revision };
      }
      const code = pg.error?.error ?? pg.error?.code ?? null;
      if (CONFLICT_CODES.has(code)) return { slug, state: 'revision_conflict', current: pg.error.current_revision ?? null };
      return { slug, state: PENDING_STATES.has(pg.state) ? 'pending' : 'failed' };
    });
  }

  /**
   * The apply of `ops` over the mirror, checked against `expect` (or `baseVersion`) and `recheck`: the read-check request
   * first (the pages the plan only read), then, with its response (`readCheck`), the apply request; the journal opens
   * with it. { request, apply?: journal id, entry? }.
   */
  function apply(ops, { expect, baseVersion = null, recheck, plan, readCheck } = {}) {
    assertWrite();
    const cur = load();
    const snapshot = cur.base && { raw: cur.base.raw, notes: cur.base.notes };
    if (expect) {
      const conflicts = [...checkExpect(c.objectVersions(Object.keys(expect), snapshot), expect), ...(recheck?.(snapshot) ?? [])];
      if (conflicts.length) throw objectConflictError(conflicts);
    } else if (contentVersion(snapshot) !== baseVersion) throw conflictError(baseVersion, contentVersion(snapshot));
    const next = applyOps(snapshot, ops);
    assertGbrainIds(next.raw);
    const writes = writesOf(cur, next);
    const written = new Set(writes.map(w => w.slug));
    // The pages the plan only read: gbrain is asked for them again right before the writes, which carry their own revision.
    const readSet = new Map();
    const writeSet = writeSetOf(ops, snapshot);
    for (const ref of Object.keys(expect ?? {})) {
      const slug = writeSet.has(ref) ? null : pageOf(ref, snapshot, prefix);
      if (slug && !written.has(slug)) readSet.set(slug, [...(readSet.get(slug) ?? []), ref]);
    }
    const planKey = sha(plan ?? ops);
    if (!readCheck && readSet.size) {
      const req = request('read-check', strip([...readSet.keys()].sort().map(getCall)));
      keep('read-check', { request: req, plan: planKey });
      return { request: req };
    }
    if (readCheck) {
      const { state, results } = resultsOf('read-check', readCheck);
      const asked = state.request.calls.map(call => call.arguments.slug);
      if (state.plan !== planKey || canonicalJson(asked) !== canonicalJson([...readSet.keys()].sort())) {
        throw responseError(`a releitura é de outro plano, ou o espelho mudou depois dela; rode "archlens apply ${rel(dir)} <plano>" de novo`);
      }
      const conflicts = [];
      results.forEach((res, i) => {
        const call = state.request.calls[i];
        const current = res.error && codeOf(res.error) === 'page_not_found' ? null : pageOfResult(res, call, i).revision;
        for (const ref of readSet.get(call.arguments.slug)) if ((expect[ref] ?? null) !== current) conflicts.push({ ref, planned: expect[ref] ?? null, current });
      });
      rmSync(pendingPath('read-check'), { force: true });
      if (conflicts.length) throw objectConflictError(conflicts);
    }
    const entry = appendedEntry(next, ops);
    if (!writes.length) return { version: contentVersion(next), entry, preserved: [] };
    const revs = revisions();
    const before = {};
    const pages = {};
    for (const w of writes) {
      before[w.slug] = { content: cur.files.get(`${w.slug}.md`) ?? null, revision: revs[w.slug] ?? null };
      // The mirror's revision; for the plan's objects it is the one in plan.objects (checked above).
      pages[w.slug] = { ...w, expected: revs[w.slug] ?? null };
    }
    const calls = writeCalls(Object.values(pages));
    for (const p of Object.values(pages)) delete p.slug;
    const j = { 'archlens-apply': PROTOCOL, id: randomUUID(), createdAt: new Date().toISOString(), plan: plan ?? null, ...(plan ? {} : { ops }),
      entry, before, pages, history: { tries: 0 }, calls: [], state: 'requested' };
    const req = issue(j, 'apply', calls);
    saveJournal(j);
    return { request: req, apply: j.id, entry };
  }

  /** The history page with the apply's round appended again to `page` (gbrain's history now), over the mirror `files`. */
  function historyAgain(j, files, page) {
    const all = new Map(files);
    all.set(`${historySlug}.md`, archlensPage(page.content));
    const normalized = normalizeMirror(all, prefix);
    const flat = fromGbrainFiles(normalized, { prefix });
    const cur = { files: normalized, flat, base: readVaultFiles(flat) };
    const next = applyOps({ raw: cur.base.raw, notes: cur.base.notes }, opsOf(j).filter(o => o.op === 'appendHistory'));
    const content = writesOf(cur, next).find(w => w.slug === historySlug)?.content;
    return { entry: next.raw.changelog.at(-1), content, before: normalized.get(`${historySlug}.md`) };
  }

  /**
   * Whether `page` (get_page, gbrain's serialization) is still what the apply wrote at `slug`: deleted, for a page the
   * apply deleted; otherwise the same base and the same text people wrote as the mirror `files` hold with the apply's
   * bytes (compared as content: gbrain gives nested keys back in another order).
   */
  function stillWritten(j, files, slug, page) {
    if (j.pages[slug].op === 'delete') return !!page.deleted_at;
    if (page.deleted_at) return false;
    const view = fs => {
      const flat = fromGbrainFiles(normalizeMirror(fs, prefix), { prefix });
      const b = readVaultFiles(flat);
      return canonicalJson({ version: contentVersion(b), text: [...b.ctx.pages].map(([id, x]) => [id, x.userText ?? '']),
        removed: [...flat].filter(([k]) => k.startsWith('notes/removidos/')) });
    };
    const mine = new Map(files);
    mine.set(`${slug}.md`, j.pages[slug].content);
    const theirs = new Map(files);
    theirs.set(`${slug}.md`, archlensPage(page.content));
    return view(mine) === view(theirs);
  }

  /** Takes the receipts of the request in flight of an apply (or of its undo) into the mirror and the journal. */
  function receipts(responses) {
    for (const r of responses) if (r?.['archlens-remote'] !== PROTOCOL) throw responseError(`a resposta não é do protocolo archlens-remote ${PROTOCOL}`);
    const id = responses[0]?.request;
    if (responses.some(r => r.request !== id)) throw responseError('as respostas são de pedidos diferentes');
    const j = journals().find(x => x.request?.id === id);
    if (!j) throw responseError(`a resposta é do pedido ${JSON.stringify(id)}, que nenhum apply espera (os applies ficam em ${rel(join(dir, APPLIES))})`);
    const results = [];
    for (const r of responses) {
      if (!Array.isArray(r.results)) throw responseError('a resposta não tem a lista "results"');
      results.push(...r.results);
    }
    const calls = j.request.calls;
    if (results.length > calls.length) throw responseError(`o pedido ${id} tem ${calls.length} chamada(s) e a resposta traz ${results.length} resultado(s)`);
    // A call without a result was not sent (the agent stopped before it).
    const undoing = j.request.step === 'undo';
    const pages = undoing ? j.undo.pages : j.pages;
    const outcomes = calls.flatMap((call, i) => (i < results.length ? outcomesOf(call, unwrap(results[i], `resultado ${i + 1} (${call.tool})`), i, pages)
      // A lost poll or reread says nothing new: its pages stay as they were (pending, committed, or waiting for the reread).
      : call.tool === 'get_page' || isPoll(call) ? [] : call.slugs.map(slug => ({ slug, state: 'unsent' }))).map(o => ({ ...o, request_id: call.arguments.request_id })));
    for (const o of outcomes) if (o.state !== 'reread' && !pages[o.slug]) throw responseError(`${o.slug} não faz parte deste ${undoing ? 'undo' : 'apply'}`);

    const files = readTree(mirror, prefix);
    const revs = revisions();
    const listed = sync() ?? { pages: {} };
    const changed = new Map();
    const rereads = new Map();
    let historyConflict = false;
    for (const o of outcomes) {
      if (o.state === 'reread') { rereads.set(o.slug, o.page); continue; }
      const p = pages[o.slug];
      if (p.request_id !== o.request_id) continue; // a call the page has left: it went again in another one
      if (o.state === 'unsent' && p.state === 'committed') continue;
      p.state = o.state;
      if (o.state === 'revision_conflict') { p.current = o.current; if (o.slug === historySlug) historyConflict = true; }
      if (o.state !== 'committed') continue;
      p.revision = o.revision;
      const content = p.op === 'delete' ? null : p.content;
      const path = `${o.slug}.md`;
      if (content === null) files.delete(path); else files.set(path, content);
      changed.set(path, content);
      if (content !== null && o.revision) revs[o.slug] = o.revision; else delete revs[o.slug];
      delete listed.pages[o.slug];
    }

    let next = null;
    let exhausted = false;
    let historyGone = false;
    const hist = pages[historySlug];
    const reread = rereads.get(historySlug);
    if (undoing && rereads.size) {
      // Undo of pages whose receipt had no revision: put back only a page still as the apply wrote it, with the revision
      // it has now; one that changed since is left out (a conflict).
      const ready = [];
      for (const [slug, page] of rereads) {
        const u = pages[slug];
        if (u?.state !== 'reread') continue;
        if (page && stillWritten(j, files, slug, page)) ready.push(Object.assign(u, { slug, expected: page.revision }));
        else Object.assign(u, { state: 'revision_conflict', current: page?.revision ?? null });
      }
      if (ready.length) next = writeCalls(ready);
      for (const u of ready) delete u.slug;
    } else if (!undoing && hist && rereads.has(historySlug) && !reread) {
      // Someone deleted the history page: the apply stops there rather than write a history of its own over it.
      Object.assign(hist, { state: 'revision_conflict', current: null });
      historyGone = true;
    } else if (!undoing && reread && hist) {
      const again = historyAgain(j, files, reread);
      j.entry = again.entry;
      j.before[historySlug] = { content: again.before, revision: reread.revision };
      Object.assign(hist, { op: 'put', content: again.content, expected: reread.revision });
      delete hist.current;
      next = writeCalls([Object.assign(hist, { slug: historySlug })]);
      delete hist.slug;
    } else if (!undoing && historyConflict) {
      if (j.history.tries >= HISTORY_RETRIES) exhausted = true;
      else { j.history.tries++; next = [getCall(historySlug)]; }
    }
    const done = Object.values(pages).every(p => p.state === 'committed');
    j.state = undoing ? (done ? 'undone' : 'undo-partial') : done ? 'committed' : 'partial';
    j.request = null;
    if (next && undoing) j.state = 'undoing';
    const request = next ? issue(j, undoing ? 'undo' : 'apply', next) : null;
    const out = new Map([...changed].map(([path, text]) => [join(MIRROR, path), text]));
    out.set(join(MIRROR, REVISIONS), json(Object.fromEntries(Object.entries(revs).sort(([a], [b]) => (a < b ? -1 : 1)))));
    out.set(join(MIRROR, SYNC), json(listed));
    out.set(...journalFile(j));
    writeFilesAtomically(dir, out);
    if (historyGone) {
      throw storeError('E_STORE_HISTORY_RETRY', `a página de histórico ${historySlug} sumiu do gbrain (removida por alguém) enquanto este apply gravava a rodada; as outras páginas já gravadas ficam, `
        + `e a rodada está guardada em ${rel(join(dir, journalRel(j.id)))}. Restaure a página (restore_page) e rode "archlens apply ${rel(dir)} --resume ${j.id}", ou desfaça com --undo ${j.id}`);
    }
    if (exhausted) {
      throw storeError('E_STORE_HISTORY_RETRY', `o histórico do gbrain mudou ${HISTORY_RETRIES + 1} vezes enquanto este apply gravava a rodada; as outras páginas já gravadas ficam, `
        + `e a rodada está guardada em ${rel(join(dir, journalRel(j.id)))}. Rode "archlens apply ${rel(dir)} --resume ${j.id}" para tentar de novo`);
    }
    return summary(j, request);
  }

  /** The request with what an apply has left to write (`id`, or the last one not finished). */
  function resume(id) {
    const open = ['partial', 'requested'];
    const j = id ? readJournal(id) : journals().filter(x => open.includes(x.state)).at(-1);
    if (!j) throw storeError('E_STORE_APPLY', `nenhum apply para retomar em ${rel(join(dir, APPLIES))}`);
    if (!open.includes(j.state)) throw storeError('E_STORE_APPLY', `o apply ${j.id} está "${j.state}": não há o que retomar`);
    const conflicts = Object.keys(j.pages).filter(s => s !== historySlug && j.pages[s].state === 'revision_conflict');
    if (conflicts.length) {
      throw storeError('E_STORE_APPLY', `o apply ${j.id} tem página(s) que mudaram no gbrain depois do plano (${conflicts.join(', ')}); o resto do plano não é forçado. `
        + `Desfaça com "archlens apply ${rel(dir)} --undo ${j.id}" e refaça o plano`);
    }
    const calls = retryCalls(j, j.pages);
    if (j.pages[historySlug]?.state === 'revision_conflict') { j.history.tries = 0; calls.push(getCall(historySlug)); }
    if (!calls.length) throw storeError('E_STORE_APPLY', `o apply ${j.id} não tem nada a retomar`);
    const request = issue(j, 'apply', calls);
    saveJournal(j);
    return { id: j.id, request };
  }

  /** The request that puts back what an apply wrote (`id`, or the last one written): the content before, or a delete for what it created. */
  function undo(id) {
    const j = id ? readJournal(id) : journals().filter(x => ['committed', 'partial', 'undo-partial'].includes(x.state)).at(-1);
    if (!j) throw storeError('E_STORE_APPLY', `nenhum apply para desfazer em ${rel(join(dir, APPLIES))}`);
    if (j.state === 'requested' || j.state === 'undoing') {
      throw storeError('E_STORE_APPLY', `o apply ${j.id} ainda espera os recibos do pedido em aberto; rode "archlens apply ${rel(dir)} --receipts <resposta.json>" antes`);
    }
    if (j.state === 'undone') throw storeError('E_STORE_APPLY', `o apply ${j.id} já foi desfeito`);
    let calls;
    if (j.state === 'undo-partial') calls = retryCalls(j, j.undo.pages);
    else {
      const items = Object.entries(j.pages).filter(([, p]) => p.state === 'committed').map(([slug, p]) => {
        const b = j.before[slug];
        if (p.op === 'delete') return { slug, op: 'restore', content: b.content, expected: p.revision };
        if (b.content === null) return { slug, op: 'delete', expected: p.revision };
        return { slug, op: 'put', content: b.content, expected: p.revision };
      });
      if (!items.length) throw storeError('E_STORE_APPLY', `o apply ${j.id} não gravou nenhuma página: nada a desfazer`);
      // A page whose receipt had no revision is never written unguarded: it is read again first (see receipts).
      const known = items.filter(i => i.expected);
      const unknown = items.filter(i => !i.expected);
      calls = [...writeCalls(known), ...unknown.map(i => getCall(i.slug, { deleted: i.op === 'restore' }))];
      for (const i of unknown) i.state = 'reread';
      j.undo = { pages: Object.fromEntries(items.map(({ slug, ...i }) => [slug, i])) };
    }
    if (!calls.length) {
      const stuck = Object.keys(j.undo.pages).filter(s => j.undo.pages[s].state === 'revision_conflict').sort();
      throw storeError('E_STORE_APPLY', `o undo do apply ${j.id} não tem mais o que pedir: ${stuck.length ? `as página(s) ${stuck.join(', ')} mudaram no gbrain depois do apply e não são forçadas` : 'nada ficou por desfazer'}`);
    }
    const skipped = Object.keys(j.pages).filter(s => ['pending', 'requested', 'unsent'].includes(j.pages[s].state)).sort();
    j.state = 'undoing';
    const request = issue(j, 'undo', calls);
    saveJournal(j);
    return { id: j.id, request, skipped };
  }

  const remote = {
    /** Where a request goes without --out. */
    requestPath: req => join(dir, REMOTE, `${req.step}-request.json`),

    /**
     * The first list request of a pull. Every pull lists the metadata of all the archlens pages from the start: a delete
     * does not move a page's updated_at in gbrain, and a write stamps the time its transaction started, which may come
     * before a listing made while it ran. A page is fetched when it is new to the mirror or listed with another
     * updated_at than the last time; the pages not listed alive leave the mirror.
     */
    pull() {
      const req = request('list', [listCall(null)]);
      keep('pull', { request: req, listed: {}, deleted: [] });
      return req;
    },

    /** Takes the response to the pull request in flight: { request } (the next one) or { done: { fetched, removed } }. */
    pullIngest(responses) {
      const { state, results } = resultsOf('pull', responses);
      if (state.request.step === 'get') {
        const fetched = results.map((r, i) => pageOfResult(r, state.request.calls[i], i))
          .map(p => ({ slug: p.slug, revision: p.revision, content: p.content, gone: !!p.deleted_at }));
        const gone = fetched.filter(p => p.gone).map(p => p.slug);
        const listed = Object.fromEntries(Object.entries(state.listed).filter(([slug]) => !gone.includes(slug)));
        return { done: commit({ fetched: fetched.filter(p => !p.gone), removed: [...state.removed, ...gone], listed }) };
      }
      const rows = rowsOf(results[0], 0);
      const listed = { ...state.listed };
      const deleted = new Set(state.deleted);
      for (const row of rows) {
        if (!row.slug.startsWith(`${prefix}/`)) continue; // another base in the same brain
        if (row.deleted_at) { deleted.add(row.slug); delete listed[row.slug]; } else { listed[row.slug] = row.updated_at_iso; deleted.delete(row.slug); }
      }
      if (rows.length >= LIMIT) {
        const last = rows.at(-1);
        const req = request('list', [listCall({ since: last.updated_at_iso, slug: last.slug })]); // the next page of the listing
        keep('pull', { request: req, listed, deleted: [...deleted] });
        return { request: req };
      }
      const before = sync()?.pages ?? {};
      const revs = revisions();
      const known = new Set([...Object.keys(before), ...Object.keys(revs)]);
      const removed = [...new Set([...deleted, ...[...known].filter(s => !(s in listed))])].filter(s => known.has(s)).sort();
      const get = Object.keys(listed).filter(s => before[s] !== listed[s] || !(s in revs)).sort();
      if (!get.length) return { done: commit({ fetched: [], removed, listed }) };
      const req = request('get', get.map(slug => ({ tool: 'get_page', arguments: { slug, include_content: true, content_only: true, ...scope } })));
      keep('pull', { request: req, removed, listed });
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

    /** apply <base> --receipts | --resume [id] | --undo [id] (see the apply section). */
    receipts,
    resume,
    undo,
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
    assertWrite,
    apply,
  };
  return c;
}
