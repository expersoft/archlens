// An in-memory gbrain for the MCP-mode tests: the tools archlens asks the agent to call (list_pages, get_page, put_pages,
// delete_page, restore_page, whoami, request_tools), with the behaviors archlens depends on, as read in the gbrain source
// (v0.60.304): pages keep type/title/tags in columns and the rest of the frontmatter in a jsonb (keys come back in jsonb
// order); get_page's `content` is the canonical serialization (type, title, the rest, tags; a blank line; the trimmed body;
// the `<!-- timeline -->` sentinel before a timeline); every write gets a new revision; expected_revision guards writes;
// request_id replays a write; a soft delete keeps updated_at (only a restore or a write moves it); a put_pages batch may
// end `partial` or `pending` (pages still publishing, settled by a poll); put_pages, delete_page and restore_page are
// only on the full tool surface; a remote write stamps `trust_tier: agent_written` and its provenance (ingested_at, source_kind,
// ingested_via) into the frontmatter; the frontmatter is read as gbrain's js-yaml reads it (unquoted dates are timestamps,
// kept as ISO strings); without a sentinel, the first "## Timeline" / "## History" section
// of dated bullets moves to the timeline (splitBody rule 4); a full list_pages page carries a listing_truncated notice; a
// remote put keeps the tags the page had (union), and remove_tag / add_tag change them.
// run(request) plays the agent: it executes the calls of an archlens request file and returns the response file.
import { parse as parseYaml, stringify as stringifyYaml } from '../../scripts/vendor/yaml/index.js';

const SURFACES = ['verbs', 'starter', 'full'];
const WRITE_TOOLS = new Set(['put_pages', 'delete_page', 'restore_page', 'remove_tag', 'add_tag']);
const REMOTE_CAP = 100;

// gbrain's error JSON names the code twice: `error` (the frozen wire value) and `code` (the canonical one).
const opError = (code, message, extra = {}) => Object.assign(new Error(`${code}: ${message}`), { code, json: { error: code, code, message, ...extra } });
/** jsonb orders object keys by length, then bytewise; at every depth. */
const jsonbOrder = v => {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (!v || typeof v !== 'object') return v;
  const keys = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(keys.map(k => [k, jsonbOrder(v[k])]));
};

const DATED = /^\s*[-*+]\s+\**\d{4}\b/;
/** Lines outside fenced code blocks (``` or ~~~). */
const unfenced = lines => { let open = false; return lines.map(l => { const fence = /^\s*(`{3,}|~{3,})/.test(l); const out = !open && !fence; if (fence) open = !open; return out; }); };

/** splitBody: at the first `<!-- timeline -->` line, or (rule 4) around the first bare timeline section of dated bullets. */
function splitBody(body) {
  const lines = body.split('\n');
  const free = unfenced(lines);
  const at = lines.findIndex((l, i) => free[i] && l.trim() === '<!-- timeline -->');
  if (at >= 0) return { compiled: lines.slice(0, at).join('\n'), timeline: lines.slice(at + 1).join('\n') };
  const first = lines.findIndex(l => l.trim());
  for (let i = first + 1; i > 0 && i < lines.length; i++) {
    if (!free[i] || !/^##\s+(timeline|history)\b/i.test(lines[i].trim())) continue;
    let end = lines.length, bullets = 0, shaped = true;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (/^##\s+\S/.test(t)) { end = j; break; }
      if (!t) continue;
      if (DATED.test(lines[j])) { bullets++; continue; }
      if (bullets && /^\s{2,}\S/.test(lines[j])) continue;
      shaped = false;
      break;
    }
    if (shaped && bullets) return { compiled: [...lines.slice(0, i), ...lines.slice(end)].join('\n'), timeline: lines.slice(i, end).join('\n') };
  }
  return { compiled: body, timeline: '' };
}

/** What gbrain keeps of a page it is given: columns, the jsonb frontmatter and the body split at the timeline sentinel. */
function parsePage(slug, content) {
  const m = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(content);
  const fm = (m && parseYaml(m[1] ?? '', { customTags: ['timestamp'] })) || {};
  const body = m ? content.slice(m[0].length) : content;
  const { type, title, tags, slug: _slug, ...rest } = fm;
  const split = splitBody(body);
  const compiled = split.compiled.trim();
  const timeline = split.timeline.trim();
  const h1 = /^# (.+)$/m.exec(compiled)?.[1];
  return {
    type: typeof type === 'string' && type ? type : 'note',
    title: String(title ?? h1 ?? slug).trim(),
    tags: [...new Set((Array.isArray(tags) ? tags : []).filter(t => typeof t === 'string'))].sort(),
    frontmatter: JSON.parse(JSON.stringify(rest)),
    compiled_truth: compiled,
    timeline,
  };
}

/** serializePageToMarkdown: type and title first, the stored frontmatter, tags last; the body after a blank line. */
function serialize(page) {
  const fm = { type: page.type, title: page.title, ...jsonbOrder(page.frontmatter), ...(page.tags.length ? { tags: page.tags } : {}) };
  const body = page.compiled_truth + (page.timeline ? `\n\n<!-- timeline -->\n\n${page.timeline}` : '');
  return `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n\n${body}\n`;
}

/**
 * `ceiling`: the widest tool surface the server allows; `surface`: the one this client starts with; `sourceId`: the
 * source writes and reads default to.
 */
export function fakeGbrain({ ceiling = 'full', surface = 'starter', sourceId = 'default' } = {}) {
  const pages = new Map(); // `${source}\0${slug}` → page
  const receipts = new Map(); // request_id → receipt (a replay returns it, nothing is written twice)
  const queued = new Map(); // batch request_id → its pages still publishing (index → { slug, content, expected_revision })
  let clock = 0;
  let revs = 0;
  let budget = Infinity; // page writes left before the next ones fail, or stay queued (failAfter)
  let pendMode = false;
  const key = (source, slug) => `${source}\0${slug}`;
  // One timestamp per call: a bulk write stamps one now() across its transaction, as gbrain does.
  const now = () => `2026-10-18T12:00:00.${String(++clock).padStart(6, '0')}Z`;
  const revision = () => `rev-${String(++revs).padStart(4, '0')}`;
  const sourceOf = args => args?.source_id ?? sourceId;
  const live = (source, slug) => { const p = pages.get(key(source, slug)); return p && !p.deleted_at ? p : null; };

  function write(source, slug, content, ts, { remote = false } = {}) {
    const before = pages.get(key(source, slug));
    const page = { slug, source_id: source, ...parsePage(slug, content), revision: revision(), created_at: before?.created_at ?? ts, updated_at_iso: ts, deleted_at: null };
    // A put_page keeps the tags the page had and adds the ones sent (page-prepare.ts:832): only remove_tag takes one off.
    if (remote && before && !before.deleted_at) page.tags = [...new Set([...before.tags, ...page.tags])].sort();
    if (remote) {
      // The lower-only marker a below-owner write stamps, and the provenance of the first write (page-prepare.ts putProvenance).
      const first = before?.frontmatter ?? {};
      Object.assign(page.frontmatter, { trust_tier: 'agent_written', ingested_at: first.ingested_at ?? ts,
        source_kind: first.source_kind ?? 'mcp:put_page', ingested_via: first.ingested_via ?? 'mcp:put_page' });
    }
    pages.set(key(source, slug), page);
    return page;
  }

  /** The revision check of a write: null when it may go, or the refusal. */
  function guard(source, slug, expected) {
    const cur = live(source, slug);
    if (!cur && expected) return opError('revision_conflict', `${slug} does not exist`, { current_revision: null });
    if (cur && !expected) return opError('revision_required', `${slug} exists; pass expected_revision`, { current_revision: cur.revision });
    if (cur && expected !== cur.revision) return opError('revision_conflict', `${slug} changed`, { current_revision: cur.revision });
    return null;
  }

  /** The batch receipt's state and counts from its pages (gbrain's batchReceipt). */
  function recount(receipt) {
    const pages = receipt.pages;
    const committed = pages.filter(p => p.state === 'committed').length;
    const pending = pages.filter(p => ['queued', 'running', 'recovering'].includes(p.state)).length;
    const failed = pages.length - committed - pending;
    return Object.assign(receipt, { state: pending ? 'pending' : !failed ? 'committed' : committed ? 'partial' : 'failed', terminal: !pending,
      counts: { total: pages.length, committed, pending, failed } });
  }

  /**
   * The receipt of a batch read again: the pages that were still publishing commit now (each checked as it lands). A poll
   * rebuilds it from the admitted rows only, as gbrain does: a page refused before admission has no row and comes back as
   * { slug: '', state: 'not_admitted' }.
   */
  function settle(id, { poll = false } = {}) {
    const receipt = receipts.get(id);
    const q = queued.get(id);
    if (q) {
      const ts = now();
      for (const [index, { slug, content, expected_revision }] of q.pages) {
        const refused = guard(q.source, slug, expected_revision);
        receipt.pages[index] = refused ? { index, slug, state: 'failed', error: refused.json }
          : { index, slug, request_id: `${id}:${index}`, state: 'committed', revision: write(q.source, slug, content, ts, { remote: true }).revision, status: 'written' };
      }
      queued.delete(id);
      recount(receipt);
    }
    if (!poll) return structuredClone(receipt);
    const pages = receipt.pages.map(p => (p.state === 'refused' ? { index: p.index, slug: '', state: 'not_admitted' } : p));
    return recount({ ...structuredClone(receipt), pages: structuredClone(pages) });
  }

  /** remove_tag / add_tag: idempotent by request_id, guarded by expected_revision; no change, no new revision (noop). */
  function tagOp(args, add) {
    // The tag tools have no source_id parameter, and a write refuses unknown ones: they write to the session's source.
    if ('source_id' in args) throw opError('invalid_params', '1 unknown parameter not declared in the tool schema; nothing was written.', { suggestion: 'Unknown parameter "source_id".' });
    if (receipts.has(args.request_id)) return receipts.get(args.request_id);
    const source = sourceId;
    const p = live(source, args.slug);
    if (!p) throw Object.assign(new Error('page_not_found'), { json: { error: 'page_identity_changed', code: 'page_not_found', message: 'The accepted page no longer exists.' } });
    if (args.expected_revision !== undefined && args.expected_revision !== p.revision) throw opError('revision_conflict', `${args.slug} changed`, { current_revision: p.revision });
    const noop = p.tags.includes(args.tag) === add;
    if (!noop) Object.assign(p, { tags: add ? [...p.tags, args.tag].sort() : p.tags.filter(t => t !== args.tag), revision: revision(), updated_at_iso: now() });
    const receipt = { tag: args.tag, noop, slug: p.slug, status: 'ok', revision: p.revision, source_id: source, request_id: args.request_id, state: 'committed' };
    receipts.set(args.request_id, receipt);
    return receipt;
  }

  const tools = {
    whoami: () => ({ transport: 'oauth', client_id: 'fake-client', client_name: 'archlens-test', scopes: ['read', 'write'], expires_at: null, source_id: sourceId }),

    request_tools(args = {}) {
      if (args.surface === undefined) return { catalog: Object.keys(tools), total_tools: Object.keys(tools).length };
      if (!SURFACES.includes(args.surface)) throw opError('invalid_params', 'surface must be one of: verbs, starter, full');
      if (SURFACES.indexOf(args.surface) > SURFACES.indexOf(ceiling)) {
        throw opError('permission_denied', `surface '${args.surface}' is above this server's ceiling '${ceiling}'`);
      }
      surface = args.surface;
      return { persisted: true, surface, note: 're-issue tools/list to see the new catalog' };
    },

    list_pages(args = {}) {
      if (args.updated_after_slug !== undefined && args.updated_after === undefined) throw opError('invalid_params', 'updated_after_slug requires updated_after');
      const source = sourceOf(args);
      let rows = [...pages.values()].filter(p => p.source_id === source && (args.include_deleted === true || !p.deleted_at)
        && (args.tag === undefined || p.tags.includes(args.tag)) && (args.type === undefined || p.type === args.type));
      const keyset = args.updated_after_slug !== undefined;
      if (args.updated_after !== undefined) {
        rows = rows.filter(p => p.updated_at_iso > args.updated_after || (keyset && p.updated_at_iso === args.updated_after && p.slug > args.updated_after_slug));
      }
      const sort = keyset ? 'updated_asc' : args.sort ?? 'updated_desc';
      const cmp = (a, b) => (a.updated_at_iso < b.updated_at_iso ? -1 : a.updated_at_iso > b.updated_at_iso ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
      rows.sort(sort === 'slug' ? (a, b) => (a.slug < b.slug ? -1 : 1) : sort === 'updated_asc' ? cmp : (a, b) => cmp(b, a));
      const limit = Math.min(args.limit ?? 50, REMOTE_CAP);
      return rows.slice(args.offset ?? 0, (args.offset ?? 0) + limit).map(p => ({
        slug: p.slug, source_id: p.source_id, type: p.type, title: p.title, updated_at: p.updated_at_iso, updated_at_iso: p.updated_at_iso,
        ...(p.deleted_at ? { deleted_at: p.deleted_at } : {}),
      }));
    },

    get_page(args = {}) {
      const p = pages.get(key(sourceOf(args), args.slug));
      if (!p || (p.deleted_at && args.include_deleted !== true)) throw opError('page_not_found', `Page not found: ${args.slug}`);
      const deleted = p.deleted_at ? { deleted_at: p.deleted_at } : {};
      if (args.include_content === true && args.content_only === true) {
        return { slug: p.slug, source_id: p.source_id, type: p.type, title: p.title, revision: p.revision, tags: p.tags, content: serialize(p), ...deleted };
      }
      return { ...p, frontmatter: jsonbOrder(p.frontmatter), ...(args.include_content === true ? { content: serialize(p) } : {}) };
    },

    put_pages(args = {}) {
      if (receipts.has(args.request_id)) return settle(args.request_id, { poll: args.pages === undefined }); // a replay, or a poll (only request_id)
      if (args.pages === undefined) throw opError('not_found', 'No accessible put_pages batch has that request_id.');
      if (!Array.isArray(args.pages) || !args.pages.length || args.pages.length > 50) throw opError('invalid_params', 'pages: 1-50 pages');
      const bytes = args.pages.reduce((n, p) => n + Buffer.byteLength(p.content ?? ''), 0);
      if (bytes > 8 * 1024 * 1024) throw opError('invalid_params', `This batch carries ${bytes} bytes of content; the limit is 8388608 bytes per put_pages call. Nothing was written.`);
      const source = sourceOf(args);
      const ts = now();
      const later = new Map();
      const out = args.pages.map(({ slug, content, expected_revision }, index) => {
        const refused = guard(source, slug, expected_revision);
        if (refused) return { index, slug, state: 'refused', error: refused.json };
        if (budget <= 0) {
          if (!pendMode) return { index, slug, state: 'failed', error: { error: 'interrupted', code: 'interrupted', message: 'the batch was interrupted' } };
          later.set(index, { slug, content, expected_revision });
          return { index, slug, request_id: `${args.request_id}:${index}`, state: 'queued' };
        }
        budget--;
        return { index, slug, request_id: `${args.request_id}:${index}`, state: 'committed', revision: write(source, slug, content, ts, { remote: true }).revision, status: 'written' };
      });
      const receipt = { batch_request_id: args.request_id, source_id: source, pages: out };
      receipts.set(args.request_id, recount(receipt));
      if (later.size) queued.set(args.request_id, { source, pages: later });
      return structuredClone(receipt);
    },

    delete_page(args = {}) {
      if (receipts.has(args.request_id)) return receipts.get(args.request_id);
      const source = sourceOf(args);
      const refused = live(source, args.slug) ? guard(source, args.slug, args.expected_revision) : opError('page_not_found', `Page not found: ${args.slug}`);
      if (refused) throw refused;
      const p = pages.get(key(source, args.slug));
      p.deleted_at = now(); // updated_at stays: a list cursor past it does not see the delete
      p.revision = revision();
      const receipt = { request_id: args.request_id, state: 'committed', status: 'deleted', slug: p.slug, revision: p.revision };
      receipts.set(args.request_id, receipt);
      return receipt;
    },

    remove_tag: (args = {}) => tagOp(args, false),
    add_tag: (args = {}) => tagOp(args, true),

    restore_page(args = {}) {
      if (receipts.has(args.request_id)) return receipts.get(args.request_id);
      const p = pages.get(key(sourceOf(args), args.slug));
      if (!p?.deleted_at) throw opError('page_not_found', `No soft-deleted page: ${args.slug}`);
      if (args.expected_revision !== undefined && args.expected_revision !== p.revision) throw opError('revision_conflict', `${args.slug} changed`, { current_revision: p.revision });
      Object.assign(p, { deleted_at: null, updated_at_iso: now(), revision: revision() });
      const receipt = { request_id: args.request_id, state: 'committed', status: 'restored', slug: p.slug, revision: p.revision };
      receipts.set(args.request_id, receipt);
      return receipt;
    },
  };

  /** One MCP tool call; throws the tool's error. Write tools need the full surface. */
  function call(tool, args = {}) {
    if (!tools[tool]) throw opError('unknown_tool', `unknown tool: ${tool}`);
    if (WRITE_TOOLS.has(tool) && surface !== 'full') throw opError('unknown_tool', `${tool} is not on this client's tool surface (${surface})`);
    return JSON.parse(JSON.stringify(tools[tool](JSON.parse(JSON.stringify(args)))));
  }

  return {
    call,
    /**
     * Plays the agent: every call of the request, in order; a tool error is recorded as MCP reports it. `wrapped`: each
     * result recorded as the MCP tool result (the JSON in content[0], one more text block per notice).
     */
    run(request, { wrapped = false } = {}) {
      const results = request.calls.map(({ tool, arguments: args }) => {
        let value;
        try { value = call(tool, args); } catch (e) { return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.json ?? { message: e.message }) }] }; }
        if (!wrapped) return value;
        const full = tool === 'list_pages' && value.length >= Math.min(args?.limit ?? 50, REMOTE_CAP);
        return { content: [{ type: 'text', text: JSON.stringify(value) }, ...(full ? [{ type: 'text', text: '[notice listing_truncated] More rows may follow: page with updated_after + updated_after_slug.' }] : [])] };
      });
      return { 'archlens-remote': '1.0', request: request.id, results };
    },
    /**
     * Writes pages as a trusted local writer would (no surface, no revision check): path `<slug>.md` → content. `at`: the
     * updated_at to stamp (a transaction that started before a listing and committed after it).
     */
    write(files, { source = sourceId, at } = {}) {
      const ts = at ?? now();
      for (const [path, content] of files) write(source, path.replace(/\.md$/, ''), content, ts);
    },
    /** Soft-deletes a page directly, as delete_page does. */
    remove(slug, { source = sourceId } = {}) {
      const p = live(source, slug);
      if (!p) throw new Error(`no page ${slug}`);
      p.deleted_at = now();
      p.revision = revision();
    },
    page: (slug, { source = sourceId } = {}) => pages.get(key(source, slug)) ?? null,
    content: (slug, { source = sourceId } = {}) => serialize(pages.get(key(source, slug))),
    /**
     * The next `n` page writes go through; the ones after fail (a batch ends `partial`), or, with `pending`, stay queued
     * (the batch ends `pending`) and commit when the batch is read again (put_pages with its request_id).
     */
    failAfter(n, { pending = false } = {}) { budget = n; pendMode = pending; },
    get surface() { return surface; },
  };
}
