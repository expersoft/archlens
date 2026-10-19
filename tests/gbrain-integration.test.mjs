// Integration with a real gbrain (npm run test:gbrain, GBRAIN_TEST=1): gbrain run from its source in a temporary folder
// (scripts/test-env/gbrain-env.mjs), a bare git repository as the remote of the base and a clone of it as a gbrain source.
// Git mode: the success criteria 1, 2, 3, 5 and 6 of the spec, with the gbrain synced between the steps. MCP mode: the
// test plays the agent, running each call of the archlens requests against `gbrain serve` over stdio (the MCP server an
// agent's harness starts) and handing back the raw tool results; criterion 4 with a batch interrupted mid-way.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, cpSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from '../scripts/vendor/yaml/index.js';
import { gbrainEnv, findBun } from '../scripts/test-env/gbrain-env.mjs';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { initBase } from '../scripts/lib/store/config.mjs';
import { diffRaw, contentVersion, applyOps } from '../scripts/lib/store/ops.mjs';
import { plan, apply } from '../scripts/lib/api.mjs';
import { convertToGbrain, convertFromGbrain, finishConvertToMcp } from '../scripts/lib/store/convert.mjs';
import { gbrainMcpConnector } from '../scripts/lib/store/gbrain-mcp.mjs';
import { canonicalJson } from '../scripts/lib/merge.mjs';

// Hermetic git: no global or system config (identity, signing, hooks), messages in English.
Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C', LANG: 'C' });

const skip = process.env.GBRAIN_TEST !== '1' ? 'integração com o gbrain real: rode "npm run test:gbrain" (GBRAIN_TEST=1)'
  : !findBun() ? 'o bun não está no PATH: o gbrain roda com bun (https://bun.sh)' : false;
const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const TODAY = { today: '2026-10-17' };
// Each MCP base gets a gbrain source of its own (sourceId), the one its stdio session writes to (GBRAIN_SOURCE).
const MCP = { kind: 'gbrain', mode: 'mcp', server: 'gbrain' };

let env;
let n = 0;
const sh = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const head = src => sh(src.repoBare, 'rev-parse', 'refs/heads/main');
const refused = (fn, code) => {
  try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return e; }
  assert.fail(`deveria falhar com ${code}`);
};
/** A page of the gbrain source `src` as gbrain keeps it (get_page with its content), or null when gbrain has none. */
const gbrainPage = (src, slug) => {
  const r = env.call('get_page', { slug, include_content: true, content_only: true }, { source: src.id });
  if (!r.ok && r.error.code === 'page_not_found') return null;
  assert.ok(r.ok, JSON.stringify(r.error));
  return r.value;
};
const frontmatterOf = content => parseYaml(/^---\n([\s\S]*?)\n---/.exec(content)[1]);

/** A person with a clone of the remote of the gbrain source `src` and a base folder pointing to it (git mode). */
function user(name, src) {
  const clone = join(env.root, `${name}-${++n}-clone`);
  sh(env.root, 'clone', '-q', src.repoBare, clone);
  sh(clone, 'config', 'user.name', name);
  sh(clone, 'config', 'user.email', `${name}@example.com`);
  const dir = join(env.root, `${name}-${n}-base`);
  initBase(dir, { name: 'Empresa', store: { kind: 'gbrain', mode: 'git', repo: relative(dir, clone) } });
  return { clone, dir, store: () => openStore(resolveBase(dir)) };
}

// Two domains that do not touch: vendas and rh.
const base = () => ({
  raw: {
    archlens: '2.0', name: 'Empresa',
    model: {
      elements: [
        { id: 'vendas', type: 'application-component', name: 'Vendas', c4: { kind: 'softwareSystem' } },
        { id: 'vendas.api', type: 'application-component', name: 'API de Vendas', parent: 'vendas', c4: { kind: 'container' } },
        { id: 'rh', type: 'application-component', name: 'Recursos Humanos', c4: { kind: 'softwareSystem' } },
        { id: 'rh.folha', type: 'application-component', name: 'Folha de Pagamento', parent: 'rh', c4: { kind: 'container' },
          // Date-like strings: a YAML 1.1 reader (gbrain's) takes the unquoted ones for timestamps.
          since: '2026-10-18', properties: { implantado: '2026-01-05 08:00:00', codigo: '0b101' } },
      ],
      relationships: [{ id: 'r-vendas-rh', from: 'vendas', to: 'rh', type: 'serving' }],
    },
    changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }],
  },
  notes: { overview: 'Visão geral da empresa.' },
});
const seed = (s, b = base()) => s.apply(diffRaw(s.read(), b), { baseVersion: s.version() });
const delta = (model, extra = {}) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
  model: { elements: [], relationships: [], ...model }, ...extra });
const container = (id, name, parent) => ({ id, type: 'application-component', name, parent, c4: { kind: 'container' } });
const addVendas = () => delta({ elements: [container('vendas.cache', 'Cache de Pedidos', 'vendas')] }, { summary: 'cache de pedidos' });
const addRh = () => delta({ elements: [container('rh.portal', 'Portal do Colaborador', 'rh')] });

/** The final plan of `d`, answering its questions with `answers` (key → resolution; ops default to yes). */
function finalPlan(store, d, answers = {}) {
  const { plan: p } = plan(store, d, TODAY);
  if (p.state === 'final') return p;
  const given = new Map(p.items.filter(i => 'resolution' in i).map(i => [i.key, answers[i.key] ?? i.resolution ?? (i.class === 'op' ? 'yes' : null)]));
  const { plan: f } = plan(store, d, { ...TODAY, answers: given });
  assert.equal(f.state, 'final', JSON.stringify(f.items.filter(i => 'resolution' in i && i.resolution == null)));
  return f;
}
const ids = s => s.read().raw.model.elements.map(e => e.id);

// The vault reads elements by id and gives each relationship an id; the json base keeps file order and bare ones.
const norm = ({ raw }) => {
  const key = r => `${r.from}|${r.type}|${r.to}|${r.description ?? ''}`;
  return canonicalJson({
    ...raw,
    model: {
      elements: [...raw.model.elements].sort((x, y) => (x.id < y.id ? -1 : 1)),
      relationships: raw.model.relationships.map(({ id, ...r }) => r).sort((x, y) => (key(x) < key(y) ? -1 : 1)),
    },
  });
};
/** A copy of examples/<ex>/architecture in the environment. */
function localCopy(ex) {
  const dir = join(env.root, `local-${++n}`, 'architecture');
  cpSync(join(EXAMPLES, ex, 'architecture'), dir, { recursive: true });
  return dir;
}

// ---- the agent (MCP mode) ------------------------------------------------------------------------------------------

/**
 * Runs the calls of an archlens request on the MCP session `s`, in order, and returns the response file: the raw MCP
 * tool result of each call (a tool error included, as MCP reports it). `stopAfter`: the agent stops after that many calls.
 */
async function agent(s, request, { stopAfter = Infinity } = {}) {
  const results = [];
  for (const { tool, arguments: args } of request.calls.slice(0, stopAfter)) {
    let r;
    try { r = await s.call(tool, args); } catch (e) { r = { isError: true, content: [{ type: 'text', text: e.message }] }; }
    results.push(r);
  }
  return JSON.parse(JSON.stringify({ 'archlens-remote': request['archlens-remote'], request: request.id, results }));
}
/** The raw value a tool returned on `s` (the JSON in content[0]); throws on a tool error. */
async function value(s, tool, args) {
  const r = await s.call(tool, args);
  assert.ok(!r.isError, r.content?.[0]?.text);
  return JSON.parse(r.content[0].text);
}
/** pull → the agent runs each request → ingest, until the mirror is up to date. */
async function pull(store, s) {
  let req = store.remote.pull();
  for (const steps = [];;) {
    steps.push(req.step);
    const res = store.remote.pullIngest([await agent(s, req)]);
    if (!res.request) return { ...res, steps };
    req = res.request;
  }
}
/** The MCP session an agent starts with the starter tool surface, widened by the session check archlens asks for. */
async function session(src) {
  return env.mcp(['--surface', 'starter'], { source: src.id });
}
/** A local base folder (json) with `b`, converted over MCP to the gbrain source `src` (prefix "archlens"), its mirror pulled. */
async function mcpBase(s, src, b = base()) {
  const dir = join(env.root, `mcp-${++n}`, 'architecture');
  initBase(dir, { name: 'Empresa', store: { kind: 'json' } });
  seed(openStore(resolveBase(dir)), b);
  const loc = resolveBase(dir);
  const store = { ...MCP, sourceId: src.id };
  const checker = gbrainMcpConnector(loc, { ...store, prefix: 'archlens' });
  const sess = checker.remote.checkIngest([await agent(s, checker.remote.check())]);
  assert.equal(sess.write, true, JSON.stringify(sess));
  const res = convertToGbrain(loc, store);
  const out = checker.remote.receipts([await agent(s, res.request)]);
  if (out.state === 'committed') {
    finishConvertToMcp(loc);
    await pull(openStore(resolveBase(dir)), s);
  }
  return { dir, loc, out, store: () => openStore(resolveBase(dir)) };
}

describe('gbrain real', { skip }, () => {
  before(() => {
    const t = Date.now();
    env = gbrainEnv.up();
    console.log(`# ${env.version} (${env.root}), pronto em ${((Date.now() - t) / 1000).toFixed(1)} s`);
  });
  after(() => gbrainEnv.down());

  // ---- git mode ----------------------------------------------------------------------------------------------------

  test('criterion 1: plans on disjoint domains made on the same version both apply, and gbrain syncs both', () => {
    const src = env.addSource('c1');
    const a = user('a', src);
    const b = user('b', src);
    seed(a.store());
    env.sync(src.id);
    const start = head(src);
    const pa = finalPlan(a.store(), addVendas());
    const pb = finalPlan(b.store(), addRh());
    apply(a.store(), pa);
    apply(b.store(), pb);
    assert.equal(sh(src.repoBare, 'rev-list', '--count', `${start}..main`), '2');
    env.sync(src.id);
    assert.equal(gbrainPage(src, 'archlens/application-component/vendas.cache').title, 'Cache de Pedidos');
    assert.equal(gbrainPage(src, 'archlens/application-component/rh.portal').title, 'Portal do Colaborador');
    assert.match(gbrainPage(src, 'archlens/changelog').content, /2026-10-17-02/);
    assert.deepEqual(a.store().history().map(e => e.id), ['2026-10-01-01', '2026-10-17-01', '2026-10-17-02']);
  });

  test('criterion 2: a plan that writes what another wrote, or relies on what another removed, is refused and nothing is written', () => {
    const src = env.addSource('c2');
    const a = user('a', src);
    const b = user('b', src);
    seed(a.store());
    const pa = finalPlan(a.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] }));
    const pb = finalPlan(b.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh', type: 'flow' }] }));
    apply(a.store(), pa);
    let at = head(src);
    let e = refused(() => apply(b.store(), pb), 'E_STORE_CONFLICT');
    assert.ok(e.conflicts.some(c => c.ref === 'element:vendas.api'), JSON.stringify(e.conflicts));
    assert.match(e.message, /API de Vendas/);
    assert.match(e.message, /--answers/);
    assert.equal(head(src), at);
    env.sync(src.id);
    const api = frontmatterOf(gbrainPage(src, 'archlens/application-component/vendas.api').content);
    assert.deepEqual(api.serving, ['[[archlens/application-component/rh.folha|Folha de Pagamento]]']);
    assert.equal(api.flow, undefined);

    const pc = finalPlan(b.store(), delta({ relationships: [{ from: 'vendas', to: 'rh.folha', type: 'flow' }] }));
    apply(a.store(), finalPlan(a.store(), delta({}, { ops: [{ op: 'remove', id: 'rh.folha' }] })));
    at = head(src);
    e = refused(() => apply(b.store(), pc), 'E_STORE_CONFLICT');
    assert.ok(e.conflicts.some(c => c.ref === 'element:rh.folha' && c.current === null), JSON.stringify(e.conflicts));
    assert.equal(head(src), at);
    env.sync(src.id);
    assert.equal(gbrainPage(src, 'archlens/application-component/rh.folha'), null);
  });

  test('criterion 3: an apply is one commit, and a failure before the push leaves the remote (and gbrain) unchanged', () => {
    const src = env.addSource('c3');
    const a = user('a', src);
    seed(a.store());
    const at = head(src);
    const hook = join(src.repoBare, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "sem permissao de escrita" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const pa = finalPlan(a.store(), addVendas());
    try {
      const e = refused(() => apply(a.store(), pa), 'E_STORE_GIT');
      assert.match(e.message, /sem permissao de escrita/);
      assert.equal(head(src), at);
    } finally {
      rmSync(hook);
    }
    env.sync(src.id);
    assert.equal(gbrainPage(src, 'archlens/application-component/vendas.cache'), null);
    apply(a.store(), pa);
    assert.equal(sh(src.repoBare, 'rev-list', '--count', `${at}..main`), '1');
    assert.equal(sh(src.repoBare, 'log', '-1', '--format=%s', 'main'), 'docs(arquitetura): cache de pedidos');
    env.sync(src.id);
    assert.equal(gbrainPage(src, 'archlens/application-component/vendas.cache').title, 'Cache de Pedidos');
    // gbrain reads the date-like strings as written (archlens quotes them for gbrain's YAML 1.1 reader).
    const folha = frontmatterOf(gbrainPage(src, 'archlens/application-component/rh.folha').content);
    assert.equal(folha.since, '2026-10-18');
    assert.deepEqual(folha.properties, { codigo: '0b101', implantado: '2026-01-05 08:00:00' });
  });

  for (const [ex, back] of [['loja-online', 'json'], ['telemedicina', 'json'], ['repos', 'markdown'], ['loja-online-vault', 'markdown']]) {
    test(`criterion 5: ${ex} goes to the gbrain (git mode) and back unchanged, and gbrain syncs every page`, () => {
      const src = env.addSource(`c5-${ex}`);
      const dir = localCopy(ex);
      const before = openStore(resolveBase(dir)).read();
      const { clone } = user('conv', src);
      const res = convertToGbrain(resolveBase(dir), { kind: 'gbrain', mode: 'git', repo: relative(dir, clone) });
      const there = openStore(resolveBase(dir)).read();
      assert.equal(norm(there), norm(before));
      assert.equal(contentVersion(there), contentVersion(before));
      env.sync(src.id);
      // Every .md page under the prefix is a gbrain page (the schema pack is the only other file), none held by the sync.
      const status = JSON.parse(env.gbrain(['sources', 'status', src.id, '--json']).stdout);
      const row = (status.sources ?? [status]).find(x => x.source_id === src.id);
      assert.equal(row.total_pages, res.pages - 1, JSON.stringify(row));
      let listed = 0;
      for (let cursor = null; ;) {
        const r = env.call('list_pages', { tag: 'archlens', sort: 'updated_asc', limit: 100, ...(cursor ?? {}) }, { source: src.id });
        assert.ok(r.ok, JSON.stringify(r.error));
        listed += r.value.length;
        if (r.value.length < 100) break;
        cursor = { updated_after: r.value.at(-1).updated_at_iso, updated_after_slug: r.value.at(-1).slug };
      }
      assert.equal(listed, res.pages - 1);
      convertFromGbrain(resolveBase(dir), back);
      const after = openStore(resolveBase(dir));
      assert.equal(after.kind, back);
      assert.equal(norm(after.read()), norm(before));
      assert.equal(contentVersion(after.read()), contentVersion(before));
      assert.deepEqual(after.read().notes, before.notes);
    });
  }

  test('criterion 6: after the sync, traverse_graph from a container gives its neighbours with ArchiMate types; list_pages lists manifest, views, notes and history', () => {
    const src = env.addSource('c6');
    const dir = localCopy('loja-online');
    mkdirSync(join(dir, 'notes'), { recursive: true });
    writeFileSync(join(dir, 'notes', 'overview.md'), 'A loja online e o back-office.\n');
    const { clone } = user('c6', src);
    convertToGbrain(resolveBase(dir), { kind: 'gbrain', mode: 'git', repo: relative(dir, clone) });
    // The schema pack archlens writes next to the pages, active in this gbrain (`gbrain schema use`, the environment's job).
    env.schemaUse(sh(src.repoBare, 'show', 'main:archlens/gbrain-pack.yaml'));
    env.sync(src.id);
    const r = env.call('traverse_graph', { slug: 'archlens/application-component/loja.pedidos', depth: 1 }, { source: src.id });
    assert.ok(r.ok, JSON.stringify(r.error));
    const root = r.value.find(x => x.depth === 0);
    const typed = new Set(root.links.map(l => `${l.link_type} ${l.to_slug}`));
    for (const link of ['serving archlens/application-component/crm', 'realization archlens/application-service/as-consulta',
      'realization archlens/requirement/req-latencia', 'part_of archlens/application-component/loja']) assert.ok(typed.has(link), `${link}: ${[...typed].join(', ')}`);
    assert.ok(r.value.some(x => x.depth === 1 && x.slug === 'archlens/application-component/crm'));
    const listed = type => {
      const res = env.call('list_pages', { tag: 'archlens', type, limit: 100 }, { source: src.id });
      assert.ok(res.ok, JSON.stringify(res.error));
      return res.value.map(p => p.slug).sort();
    };
    assert.deepEqual(listed('archlens-manifest'), ['archlens/manifest']);
    assert.deepEqual(listed('archlens-changelog'), ['archlens/changelog']);
    assert.deepEqual(listed('archlens-note'), ['archlens/notes/overview']);
    const views = JSON.parse(readFileSync(join(EXAMPLES, 'loja-online', 'architecture', 'views.json'), 'utf8')).map(v => `archlens/views/${v.key}`).sort();
    assert.deepEqual(listed('archlens-view'), views);
  });

  // gbrain's managed sync also keeps the tags a page had (src/core/persistence/sync-prepare.ts:717): archlens reads its
  // base from git and stays right; what gbrain shows for the page is recorded here.
  test('git mode: a tag taken off an element, as gbrain shows it after the sync', () => {
    const src = env.addSource('c7');
    const a = user('a', src);
    const tagged = base();
    tagged.raw.model.elements.find(e => e.id === 'rh').tags = ['legado'];
    seed(a.store(), tagged);
    env.sync(src.id);
    const slug = 'archlens/application-component/rh';
    assert.ok(gbrainPage(src, slug).tags.includes('archlens/tag/legado'));
    const s = a.store();
    const { tags, ...untagged } = s.read().raw.model.elements.find(e => e.id === 'rh');
    s.apply([{ op: 'upsertElement', element: untagged }], { baseVersion: s.version() });
    assert.equal(a.store().read().raw.model.elements.find(e => e.id === 'rh').tags, undefined); // the base, read from git
    env.sync(src.id);
    const after = gbrainPage(src, slug);
    // gbrain keeps the tag on its page (its tag index goes stale; the base, read from git, does not): to be documented.
    assert.ok(after.tags.includes('archlens/tag/legado'), JSON.stringify(after.tags));
    assert.ok(frontmatterOf(after.content).tags.includes('archlens/tag/legado'));
    // A later apply and sync still go through.
    apply(a.store(), finalPlan(a.store(), addVendas()));
    env.sync(src.id);
    assert.equal(gbrainPage(src, 'archlens/application-component/vendas.cache').title, 'Cache de Pedidos');
  });

  // ---- MCP mode (the test is the agent) ------------------------------------------------------------------------------

  test('MCP: a base converted over MCP comes back from gbrain the same, without the keys gbrain stamps, dates as written, people\'s text in place', async () => {
    const src = env.addSource('m1');
    const s = await session(src);
    try {
      const dir = localCopy('loja-online-vault');
      const page = join(dir, 'business-actor', 'cliente.md');
      // A date-like field, and people's text with a "## History" of dated bullets (gbrain's timeline shape).
      writeFileSync(page, readFileSync(page, 'utf8').replace('c4: person\n', 'c4: person\ndesde: 2026-10-18\n').replace(/\n*$/, '\n')
        + '\n## History\n\n- 2026-10-01 o cliente ligou\n- 2026-10-02 retorno\n');
      const pageBefore = readFileSync(page, 'utf8');
      const loc = resolveBase(dir);
      const before = openStore(loc).read();
      assert.equal(before.raw.model.elements.find(e => e.id === 'cliente').desde, '2026-10-18');
      const store = { ...MCP, sourceId: src.id };
      const checker = gbrainMcpConnector(loc, { ...store, prefix: 'archlens' });
      const sess = checker.remote.checkIngest([await agent(s, checker.remote.check())]);
      assert.equal(sess.write, true, JSON.stringify(sess));
      assert.equal(sess.identity.transport, 'stdio');
      const res = convertToGbrain(loc, store);
      const answer = await agent(s, res.request);
      const done = checker.remote.receipts([answer]);
      assert.equal(done.state, 'committed', JSON.stringify(answer.results).slice(0, 4000));
      finishConvertToMcp(loc);
      // gbrain stamps its own keys into what it keeps.
      const got = await value(s, 'get_page', { slug: 'archlens/business-actor/cliente', include_content: true, content_only: true, source_id: src.id });
      const stamped = frontmatterOf(got.content);
      for (const k of ['trust_tier', 'ingested_at', 'source_kind', 'ingested_via']) assert.ok(k in stamped, `${k}: ${got.content}`);
      assert.equal(stamped.desde, '2026-10-18');
      // Every page written left sync.json: the pull reads them all back from gbrain.
      const mcpStore = openStore(resolveBase(dir));
      const pulled = await pull(mcpStore, s);
      assert.equal(pulled.done.fetched.length, res.pages);
      const there = mcpStore.read();
      assert.equal(norm(there), norm(before));
      assert.equal(contentVersion(there), contentVersion(before));
      assert.match(mcpStore.vault().base.ctx.pages.get('cliente').userText, /## History\n\n- 2026-10-01 o cliente ligou\n- 2026-10-02 retorno\n$/);
      // And back to a vault, byte for byte.
      convertFromGbrain(resolveBase(dir), 'markdown');
      assert.equal(readFileSync(page, 'utf8'), pageBefore);
    } finally {
      await s.close();
    }
  });

  test('MCP criterion 4: an apply the agent stopped mid-way is completed by --resume, after a read-check', async () => {
    const src = env.addSource('m4');
    const s = await session(src);
    try {
      const b = await mcpBase(s, src);
      const st = b.store();
      const original = contentVersion(st.read());
      const cacheDelta = () => delta({ elements: [container('vendas.cache', 'Cache de Pedidos', 'vendas')],
        relationships: [{ from: 'vendas.cache', to: 'rh', type: 'serving' }] }, { summary: 'cache' });
      const p = finalPlan(st, cacheDelta());
      const expected = contentVersion(applyOps(st.read(), p.ops));
      // A page the plan only read changed in gbrain after the plan: refused at the read-check, nothing asked to write.
      const first = apply(st, p);
      assert.equal(first.request.step, 'read-check');
      assert.ok(first.request.calls.some(c => c.arguments.slug === 'archlens/application-component/rh'));
      const rh = await value(s, 'get_page', { slug: 'archlens/application-component/rh', include_content: true, content_only: true, source_id: src.id });
      const edited = rh.content.replace(/<!-- archlens:end -->\n?$/, '<!-- archlens:end -->\n\nNota escrita direto no gbrain.\n');
      const put = await value(s, 'put_pages', { request_id: randomUUID(), source_id: src.id, pages: [{ slug: rh.slug, content: edited, expected_revision: rh.revision }] });
      assert.equal(put.state, 'committed', JSON.stringify(put));
      const e = await (async () => { try { apply(st, p, { readCheck: [await agent(s, first.request)] }); } catch (x) { return x; } return null; })();
      assert.equal(e?.code, 'E_STORE_CONFLICT', e?.message);
      assert.ok(e.conflicts.some(c => c.ref === 'element:rh' && c.current === put.pages[0].revision), JSON.stringify(e.conflicts));
      // Pulled again (the edit is free text after the archlens block: the base is the same), the plan goes through.
      await pull(st, s);
      assert.equal(contentVersion(st.read()), original);
      assert.match(st.vault().base.ctx.pages.get('rh').userText, /Nota escrita direto no gbrain\./);
      const p2 = finalPlan(st, cacheDelta());
      const rc = apply(st, p2);
      const req = apply(st, p2, { readCheck: [await agent(s, rc.request)] });
      assert.equal(req.request.step, 'apply');
      assert.ok(req.request.calls.length >= 2, JSON.stringify(req.request.calls.map(c => c.tool)));
      // The agent stops after the first call: the history (the last call) is never sent.
      const partial = st.remote.receipts([await agent(s, req.request, { stopAfter: 1 })]);
      assert.equal(partial.state, 'partial', JSON.stringify(partial));
      assert.ok(partial.committed.includes('archlens/application-component/vendas.cache'));
      assert.ok(partial.pending.includes('archlens/changelog'));
      const resumed = st.remote.resume();
      const sent = new Set(req.request.calls.map(c => c.arguments.request_id));
      assert.ok(resumed.request.calls.every(c => sent.has(c.arguments.request_id))); // the same request_id: gbrain runs it once
      const done = st.remote.receipts([await agent(s, resumed.request)]);
      assert.equal(done.state, 'committed', JSON.stringify(done));
      assert.equal(done.entry.id, '2026-10-17-01');
      assert.equal(contentVersion(st.read()), expected);
      await pull(st, s);
      assert.equal(contentVersion(st.read()), expected);
      assert.ok(ids(st).includes('vendas.cache'));
      assert.match(st.vault().base.ctx.pages.get('rh').userText, /Nota escrita direto no gbrain\./);
    } finally {
      await s.close();
    }
  });

  test('MCP criterion 4: an apply the agent stopped mid-way is undone by --undo (delete_page, restore_page and put_pages)', async () => {
    const src = env.addSource('m5');
    const s = await session(src);
    try {
      const b = await mcpBase(s, src);
      const st = b.store();
      const original = contentVersion(st.read());
      // Removing rh.folha: its page is deleted, rh's page (its children) rewritten, the history appended.
      const p = finalPlan(st, delta({}, { ops: [{ op: 'remove', id: 'rh.folha' }] }));
      let req = apply(st, p);
      if (req.request.step === 'read-check') req = apply(st, p, { readCheck: [await agent(s, req.request)] });
      const tools = req.request.calls.map(c => c.tool);
      assert.ok(tools.includes('delete_page'), tools.join(', '));
      const partial = st.remote.receipts([await agent(s, req.request, { stopAfter: tools.length - 1 })]);
      assert.equal(partial.state, 'partial', JSON.stringify(partial));
      assert.ok(partial.committed.includes('archlens/application-component/rh.folha'));
      assert.ok((await s.call('get_page', { slug: 'archlens/application-component/rh.folha', source_id: src.id })).isError);
      const undo = st.remote.undo();
      assert.ok(undo.request.calls.some(c => c.tool === 'restore_page'), JSON.stringify(undo.request.calls.map(c => c.tool)));
      const done = st.remote.receipts([await agent(s, undo.request)]);
      assert.equal(done.state, 'undone', JSON.stringify(done));
      assert.equal(contentVersion(st.read()), original);
      await pull(st, s);
      assert.equal(contentVersion(st.read()), original);
      assert.ok(ids(st).includes('rh.folha'));
    } finally {
      await s.close();
    }
  });

  test('MCP: a page gbrain files as a duplicate of another page of the source is not taken as written', async () => {
    const src = env.addSource('m6');
    const s = await session(src);
    try {
      assert.equal((await mcpBase(s, src)).out.state, 'committed');
      // A second base with the same elements in the same source, under another prefix: gbrain keeps one page per
      // frontmatter id and content (src/core/import-identity.ts), so the pages that come out identical are not written.
      const dir = join(env.root, `mcp-${++n}`, 'architecture');
      initBase(dir, { name: 'Empresa', store: { kind: 'json' } });
      seed(openStore(resolveBase(dir)));
      const loc = resolveBase(dir);
      const store = { ...MCP, sourceId: src.id, prefix: 'outra' };
      const checker = gbrainMcpConnector(loc, store);
      checker.remote.checkIngest([await agent(s, checker.remote.check())]);
      const out = checker.remote.receipts([await agent(s, convertToGbrain(loc, store).request)]);
      assert.equal(out.state, 'partial', JSON.stringify(out));
      assert.ok(out.pending.includes('outra/application-component/rh.folha'), JSON.stringify(out));
      assert.ok(out.duplicates.some(d => d.slug === 'outra/application-component/rh.folha' && d.of === 'archlens/application-component/rh.folha'), JSON.stringify(out));
      assert.ok(!out.committed.includes('outra/application-component/rh.folha'));
      assert.ok((await s.call('get_page', { slug: 'outra/application-component/rh.folha', source_id: src.id })).isError);
    } finally {
      await s.close();
    }
  });

  // gbrain's put_page keeps the tags the page had and adds the ones sent (src/core/persistence/page-prepare.ts:832,
  // tags = union of the stored and the parsed ones): the apply takes off the tags it drops with remove_tag.
  test('MCP: a tag taken off an element leaves gbrain\'s page too (a guarded remove_tag after the put), and --undo puts it back', async () => {
    const src = env.addSource('m7');
    const s = await session(src);
    const tagCalls = req => (req?.calls ?? []).filter(c => c.tool === 'remove_tag' || c.tool === 'add_tag');
    /** --receipts of the agent's answer to `req`, then of each follow-up request: the summaries. */
    const settle = async (st, req) => { const out = []; for (let r = req; r;) { const res = st.remote.receipts([await agent(s, r)]); out.push(res); r = res.request; } return out; };
    const rhTags = st => [...(st.read().raw.model.elements.find(e => e.id === 'rh').tags ?? [])].sort(); // gbrain gives them back sorted
    const RH = 'archlens/application-component/rh';
    try {
      const tagged = base();
      tagged.raw.model.elements.find(e => e.id === 'rh').tags = ['legado', 'erp'];
      const st = (await mcpBase(s, src, tagged)).store();
      assert.deepEqual(rhTags(st), ['erp', 'legado']);
      const original = contentVersion(st.read());
      const retag = tags => st.apply([{ op: 'upsertElement', element: { ...st.read().raw.model.elements.find(e => e.id === 'rh'), tags } }], { baseVersion: st.version() });
      const req = retag(['erp']);
      assert.deepEqual(tagCalls(req.request), []); // never with the page writes
      const steps = await settle(st, req.request);
      assert.equal(steps.at(-1).state, 'committed', JSON.stringify(steps));
      assert.deepEqual(tagCalls(steps[0].request).map(c => c.arguments.tag), ['archlens/tag/legado']);
      const page = await value(s, 'get_page', { slug: RH, source_id: src.id });
      assert.ok(!page.tags.includes('archlens/tag/legado'), JSON.stringify(page.tags));
      await pull(st, s);
      assert.deepEqual(rhTags(st), ['erp']);
      const undoSteps = await settle(st, st.remote.undo().request);
      assert.equal(undoSteps.at(-1).state, 'undone', JSON.stringify(undoSteps));
      await pull(st, s);
      assert.equal(contentVersion(st.read()), original);
      assert.deepEqual(rhTags(st), ['erp', 'legado']);

      // Someone writes the page between archlens's put and its remove_tag: gbrain refuses the guarded call.
      const race = retag(['legado']);
      const first = st.remote.receipts([await agent(s, race.request)]);
      assert.equal(tagCalls(first.request).length, 1);
      const cur = await value(s, 'get_page', { slug: RH, include_content: true, content_only: true, source_id: src.id });
      const edit = await value(s, 'put_pages', { request_id: randomUUID(), source_id: src.id, pages: [{ slug: RH, expected_revision: cur.revision,
        content: cur.content.replace(/\n$/, '\n\nNota de outra pessoa.\n') }] });
      assert.equal(edit.state, 'committed', JSON.stringify(edit));
      const res = st.remote.receipts([await agent(s, first.request)]);
      assert.equal(res.state, 'partial', JSON.stringify(res));
      assert.ok(res.conflicts.includes(`${RH} (remove_tag archlens/tag/erp)`), JSON.stringify(res));
      assert.ok((await value(s, 'get_page', { slug: RH, source_id: src.id })).tags.includes('archlens/tag/erp'));
    } finally {
      await s.close();
    }
  });
});
