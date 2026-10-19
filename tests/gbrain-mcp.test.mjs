import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { initBase } from '../scripts/lib/store/config.mjs';
import { vaultFiles } from '../scripts/lib/store/markdown.mjs';
import { toGbrainFiles } from '../scripts/lib/store/gbrain-layout.mjs';
import { archlensPage, normalizeMirror, MIRROR } from '../scripts/lib/store/gbrain-mcp.mjs';
import { contentVersion } from '../scripts/lib/store/ops.mjs';
import { checkConnector } from '../scripts/lib/store/contract.mjs';
import { plan } from '../scripts/lib/api.mjs';
import { fakeGbrain } from './helpers/fake-gbrain.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

const base = (extra = []) => ({
  raw: {
    archlens: '2.0', name: 'Empresa',
    model: {
      elements: [
        { id: 'vendas', type: 'application-component', name: 'Vendas', c4: { kind: 'softwareSystem' }, properties: { area: 'comercial', tier: 'gold' } }, // in jsonb key order, the order gbrain gives nested keys back in
        { id: 'vendas.api', type: 'application-component', name: 'API de Vendas', parent: 'vendas', c4: { kind: 'container' } },
        { id: 'rh', type: 'application-component', name: 'Recursos Humanos', c4: { kind: 'softwareSystem' } },
        ...extra,
      ],
      relationships: [{ id: 'r-vendas-rh', from: 'vendas', to: 'rh', type: 'serving' }],
    },
    views: [{ key: 'landscape', title: 'Panorama', notation: 'c4', kind: 'landscape' }],
    changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }],
  },
  notes: { overview: 'Visão geral da empresa.' },
});

/** The gbrain pages (slug.md → archlens bytes) of `b` under `prefix`; `userText` goes after the block of the page of vendas. */
function pagesOf(b, { prefix = 'archlens', userText } = {}) {
  const vault = vaultFiles(b, null, {});
  if (userText) {
    const rel = 'application-component/vendas.md';
    vault.set(rel, vault.get(rel).replace(/<!-- archlens:end -->\n$/, `<!-- archlens:end -->\n${userText}`));
  }
  return new Map([...toGbrainFiles(vault, { prefix })].filter(([rel]) => rel.endsWith('.md')));
}

function world({ ceiling, sourceId, prefix } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-gbrain-mcp-')), 'architecture');
  initBase(dir, { name: 'Empresa', store: { kind: 'gbrain', mode: 'mcp', server: 'gbrain', ...(sourceId ? { sourceId } : {}), ...(prefix ? { prefix } : {}) } });
  const gbrain = fakeGbrain({ ceiling, ...(sourceId ? { sourceId } : {}) });
  return { dir, gbrain, store: () => openStore(resolveBase(dir)) };
}

/** pull → the agent runs each request → ingest, until the mirror is up to date; the requests made, in order. */
function pull(store, gbrain) {
  const requests = [];
  let req = store.remote.pull();
  for (;;) {
    requests.push(req);
    const res = store.remote.pullIngest([gbrain.run(req)]);
    if (!res.request) return { requests, ...res };
    req = res.request;
  }
}

/** Every file under the mirror (path → text). */
function mirrorFiles(dir) {
  const out = new Map();
  const root = join(dir, MIRROR);
  const walk = d => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else out.set(relative(root, p), readFileSync(p, 'utf8'));
    }
  };
  walk(root);
  return out;
}
const revisions = dir => JSON.parse(readFileSync(join(dir, MIRROR, 'revisions.json'), 'utf8'));
const getSlugs = requests => requests.filter(r => r.step === 'get').flatMap(r => r.calls.map(c => c.arguments.slug)).sort();

test('the connector reads the mirror, declares object versioning and refuses apply until the next task', () => {
  const w = world();
  const store = checkConnector(w.store());
  assert.equal(store.kind, 'gbrain');
  assert.equal(store.versioning, 'object');
  assert.match(store.describe(), /gbrain mcp/);
  assert.throws(() => store.apply([]), /E_STORE_UNSUPPORTED/);
});

test('pull fills the mirror and plan reads it', () => {
  const w = world();
  const pages = pagesOf(base(), { userText: '\nTexto escrito por uma pessoa.\n' });
  w.gbrain.write(pages);
  const store = w.store();
  const { requests } = pull(store, w.gbrain);
  assert.deepEqual(requests.map(r => r.step), ['list', 'get']);
  assert.deepEqual(requests[0].calls, [{ tool: 'list_pages', arguments: { tag: 'archlens', include_deleted: true, sort: 'updated_asc', limit: 100 } }]);
  assert.deepEqual(requests[1].calls[0].arguments, { slug: requests[1].calls[0].arguments.slug, include_content: true, content_only: true });
  assert.deepEqual(getSlugs(requests), [...pages.keys()].map(p => p.replace(/\.md$/, '')).sort());
  // gbrain gives the pages back in its own serialization; the mirror holds the archlens bytes again.
  assert.notEqual(w.gbrain.content('archlens/application-component/vendas'), pages.get('archlens/application-component/vendas.md'));
  const files = mirrorFiles(w.dir);
  for (const [rel, text] of pages) assert.equal(files.get(rel), text, rel);
  assert.equal(revisions(w.dir)['archlens/application-component/vendas'], w.gbrain.page('archlens/application-component/vendas').revision);

  const read = store.read();
  assert.equal(contentVersion(read), contentVersion(base()));
  assert.equal(read.raw.store, undefined); // where the base lives is the local archlens.json's to say
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 'cache',
    model: { elements: [{ id: 'vendas.cache', type: 'application-component', name: 'Cache de Pedidos', parent: 'vendas', c4: { kind: 'container' } }], relationships: [] } };
  const { plan: p } = plan(store, d, { today: '2026-10-18' });
  assert.equal(p.state, 'final');
  assert.equal(p.objects['element:vendas'], w.gbrain.page('archlens/application-component/vendas').revision);
  assert.equal(p.objects['element:vendas.cache'], null);
  assert.equal(store.objectVersions(['relationship:r-vendas-rh', 'view:landscape', 'note:overview', 'manifest', 'element:nada']).get('relationship:r-vendas-rh'),
    w.gbrain.page('archlens/application-component/vendas').revision);
  const v = store.objectVersions(['view:landscape', 'note:overview', 'manifest', 'element:nada']);
  assert.equal(v.get('view:landscape'), w.gbrain.page('archlens/views/landscape').revision);
  assert.equal(v.get('note:overview'), w.gbrain.page('archlens/notes/overview').revision);
  assert.equal(v.get('manifest'), w.gbrain.page('archlens/manifest').revision);
  assert.equal(v.get('element:nada'), null);
  assert.equal(store.vault().base.ctx.pages.get('vendas').userText, '\n\nTexto escrito por uma pessoa.\n');
});

test('a second pull only fetches what changed', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const store = w.store();
  pull(store, w.gbrain);
  // Someone else changes one element and the history (what an apply writes).
  const next = base();
  next.raw.model.elements[2].name = 'Gente e Gestão';
  next.raw.changelog.push({ id: '2026-10-18-01', date: '2026-10-18', summary: 'rh renomeado', added: [], changed: ['rh'], status: {}, removed: [], decisions: [] });
  const changed = ['archlens/application-component/rh.md', 'archlens/changelog.md', 'archlens/application-component/vendas.md'];
  const all = pagesOf(next);
  w.gbrain.write(new Map(changed.map(rel => [rel, all.get(rel)])));
  const { requests } = pull(store, w.gbrain);
  // Every pull lists the metadata from the start; only the pages updated after the last pull are fetched.
  assert.deepEqual(requests[0].calls, [{ tool: 'list_pages', arguments: { tag: 'archlens', include_deleted: true, sort: 'updated_asc', limit: 100 } }]);
  assert.deepEqual(getSlugs(requests), changed.map(r => r.replace(/\.md$/, '')).sort());
  assert.equal(store.read().raw.model.elements.find(e => e.id === 'rh').name, 'Gente e Gestão');
  assert.equal(revisions(w.dir)['archlens/application-component/rh'], w.gbrain.page('archlens/application-component/rh').revision);
  // Nothing changed since: one list call, nothing fetched.
  const again = pull(store, w.gbrain);
  assert.deepEqual(again.requests.map(r => r.step), ['list']);
});

test('a page deleted in gbrain leaves the mirror', () => {
  const w = world();
  w.gbrain.write(pagesOf(base([{ id: 'legado', type: 'application-component', name: 'Legado' }])));
  const store = w.store();
  pull(store, w.gbrain);
  assert.ok(store.read().raw.model.elements.some(e => e.id === 'legado'));
  // An apply elsewhere removes the element: its page is soft-deleted (updated_at unchanged) and the history moves.
  w.gbrain.remove('archlens/application-component/legado');
  const b = base();
  b.raw.changelog.push({ id: '2026-10-18-01', date: '2026-10-18', summary: 'legado removido', added: [], changed: [], status: {}, removed: ['legado'], decisions: [] });
  w.gbrain.write(new Map([['archlens/changelog.md', pagesOf(b).get('archlens/changelog.md')]]));
  const { requests } = pull(store, w.gbrain);
  assert.deepEqual(getSlugs(requests), ['archlens/changelog']);
  assert.ok(!store.read().raw.model.elements.some(e => e.id === 'legado'));
  assert.ok(!mirrorFiles(w.dir).has('archlens/application-component/legado.md'));
  assert.equal(revisions(w.dir)['archlens/application-component/legado'], undefined);

  // A page deleted by hand, with nothing else changed, leaves the mirror too; nothing is fetched for it.
  w.gbrain.remove('archlens/views/landscape');
  assert.deepEqual(pull(store, w.gbrain).requests.map(r => r.step), ['list']);
  assert.equal(store.read().raw.views, undefined);
  assert.equal(revisions(w.dir)['archlens/views/landscape'], undefined);
  // Restored, it comes back.
  w.gbrain.call('request_tools', { surface: 'full' });
  w.gbrain.call('restore_page', { slug: 'archlens/views/landscape', request_id: 'r-1' });
  assert.deepEqual(getSlugs(pull(store, w.gbrain).requests), ['archlens/views/landscape']);
  assert.equal(store.read().raw.views[0].key, 'landscape');
});

test('pages without the archlens tag are ignored', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  // A page a person wrote under the prefix, without the tag; another base (other prefix) in the same brain.
  w.gbrain.write(new Map([['archlens/application-component/solta.md', '---\ntype: application-component\nid: solta\ntitle: Solta\n---\n# Solta\n']]));
  w.gbrain.write(pagesOf(base([{ id: 'outra', type: 'application-component', name: 'Outra' }]), { prefix: 'outra-base' }));
  const store = w.store();
  const { requests } = pull(store, w.gbrain);
  assert.ok(getSlugs(requests).every(s => s.startsWith('archlens/')));
  assert.ok(!getSlugs(requests).includes('archlens/application-component/solta'));
  assert.ok([...mirrorFiles(w.dir).keys()].every(k => k.startsWith('archlens/') || k.endsWith('.json')));
  assert.deepEqual(store.read().raw.model.elements.map(e => e.id).sort(), ['rh', 'vendas', 'vendas.api']);
});

test('a pull pages through more than 100 pages and uses source_id when set', () => {
  const w = world({ sourceId: 'arquitetura' });
  const many = Array.from({ length: 120 }, (_, i) => ({ id: `app-${String(i).padStart(3, '0')}`, type: 'application-component', name: `App ${i}` }));
  w.gbrain.write(pagesOf(base(many)));
  const store = w.store();
  const { requests } = pull(store, w.gbrain);
  assert.deepEqual(requests.map(r => r.step), ['list', 'list', 'get']);
  assert.ok(requests.every(r => r.calls.every(c => c.arguments.source_id === 'arquitetura')));
  // All pages share one timestamp (one write): the keyset's slug is what moves the second page of the listing on.
  const [first, second] = requests.map(r => r.calls[0].arguments);
  assert.equal(first.updated_after, undefined);
  assert.match(second.updated_after_slug, /^archlens\//);
  assert.equal(second.updated_after, w.gbrain.page(second.updated_after_slug, { source: 'arquitetura' }).updated_at_iso);
  assert.equal(store.read().raw.model.elements.length, 123);
});

test('plan, show and query on a base never pulled fail with E_REMOTE_STALE', () => {
  const w = world();
  assert.throws(() => w.store().read(), /E_REMOTE_STALE/);
  const cwd = join(w.dir, '..');
  writeFileSync(join(cwd, 'delta.json'), JSON.stringify({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's', model: { elements: [], relationships: [] } }));
  writeFileSync(join(cwd, 'plano.json'), '{}');
  for (const args of [['plan', 'architecture', 'delta.json', '--out', 'p.json'], ['show', 'architecture', 'plano.json'], ['query', 'architecture', '--element', 'vendas']]) {
    const r = cli(args, cwd);
    assert.notEqual(r.status, 0, args.join(' '));
    assert.match(r.stderr, /E_REMOTE_STALE/, args.join(' '));
    assert.match(r.stderr, /archlens remote architecture pull/);
  }
  // Pulled from an empty gbrain, there is simply no base yet (plan can create one).
  pull(w.store(), w.gbrain);
  assert.equal(w.store().read(), null);
});

test('a response to another request is refused with E_REMOTE_RESPONSE and the mirror is unchanged', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const store = w.store();
  pull(store, w.gbrain);
  const before = mirrorFiles(w.dir);
  w.gbrain.write(new Map([['archlens/application-component/rh.md', pagesOf(base()).get('archlens/application-component/rh.md').replace('Recursos Humanos', 'RH')]]));
  const list = store.remote.pull();
  const answer = w.gbrain.run(list);
  assert.throws(() => store.remote.pullIngest([{ ...answer, request: 'outro-pedido' }]), /E_REMOTE_RESPONSE/);
  assert.throws(() => store.remote.pullIngest([{ ...answer, results: [] }]), /E_REMOTE_RESPONSE/);
  assert.throws(() => store.remote.pullIngest([{ ...answer, results: [{ nada: true }] }]), /E_REMOTE_RESPONSE/);
  assert.throws(() => store.remote.pullIngest([{ ...answer, 'archlens-remote': '9.9' }]), /E_REMOTE_RESPONSE/);
  let res = store.remote.pullIngest([answer]);
  while (res.request?.step === 'list') res = store.remote.pullIngest([w.gbrain.run(res.request)]);
  const get = res.request;
  assert.equal(get.step, 'get');
  // The list response again (it answered the request before this one).
  assert.throws(() => store.remote.pullIngest([answer]), /E_REMOTE_RESPONSE/);
  const got = w.gbrain.run(get);
  const noContent = structuredClone(got);
  delete noContent.results[0].content;
  assert.throws(() => store.remote.pullIngest([noContent]), /E_REMOTE_RESPONSE/);
  const otherSlug = structuredClone(got);
  otherSlug.results[0].slug = 'archlens/application-component/outro';
  assert.throws(() => store.remote.pullIngest([otherSlug]), /E_REMOTE_RESPONSE/);
  const failed = { ...got, results: [{ isError: true, content: [{ type: 'text', text: '{"code":"page_not_found"}' }]}, ...got.results.slice(1)] };
  assert.throws(() => store.remote.pullIngest([failed]), /E_REMOTE_RESPONSE.*page_not_found/);
  assert.deepEqual(mirrorFiles(w.dir), before);
  // The right one still goes in.
  store.remote.pullIngest([got]);
  assert.equal(store.read().raw.model.elements.find(e => e.id === 'rh').name, 'RH');
});

test('results recorded as the MCP tool result (content as text) are read too', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const store = w.store();
  const wrap = res => ({ ...res, results: res.results.map(r => ({ content: [{ type: 'text', text: JSON.stringify(r) }] })) });
  let res = store.remote.pullIngest([wrap(w.gbrain.run(store.remote.pull()))]);
  res = store.remote.pullIngest([wrap(w.gbrain.run(res.request))]);
  assert.equal(res.request, undefined);
  assert.equal(contentVersion(store.read()), contentVersion(base()));
});

test('check records whether writing is allowed (starter vs full)', () => {
  for (const [ceiling, write] of [['starter', false], ['full', true]]) {
    const w = world({ ceiling });
    const store = w.store();
    const req = store.remote.check();
    assert.equal(req.step, 'tools');
    assert.deepEqual(req.calls, [{ tool: 'whoami', arguments: {} }, { tool: 'request_tools', arguments: { surface: 'full' } }]);
    const session = store.remote.checkIngest([w.gbrain.run(req)]);
    assert.equal(session.write, write, ceiling);
    const saved = JSON.parse(readFileSync(join(w.dir, '.archlens', 'session.json'), 'utf8'));
    assert.equal(saved.write, write);
    assert.equal(saved.server, 'gbrain');
    assert.equal(saved.identity.transport, 'oauth');
    assert.throws(() => store.remote.checkIngest([w.gbrain.run(req)]), /E_REMOTE_RESPONSE/); // answered already
  }
});

test('gbrain\'s canonical content is read back as the archlens page', () => {
  const pages = pagesOf(base(), { userText: '\nNotas da equipe.\n\n## Timeline\n\n- 2026-10-01: criado\n' });
  const rel = 'archlens/application-component/vendas.md';
  // What get_page returns for that page: type and title first, the jsonb order, tags last (sorted), a slug stamp and a
  // content flag gbrain added, a blank line after the frontmatter, the trimmed body and the timeline sentinel.
  const canonical = [
    '---',
    'type: application-component',
    'title: Vendas',
    'c4: softwareSystem',
    'id: vendas',
    'slug: archlens/application-component/vendas',
    'aliases:',
    '  - Vendas',
    'serving:',
    '  - "[[archlens/application-component/rh|Recursos Humanos]]"',
    'properties:',
    '  area: comercial',
    '  tier: gold',
    'content_flag:',
    '  reason: odd',
    '  detail: looks odd',
    'relationships:',
    '  - id: r-vendas-rh',
    '    to: rh',
    '    type: serving',
    'tags:',
    '  - archlens',
    '  - archlens/application-component',
    '  - archlens/c4/softwareSystem',
    '---',
    '',
    '# Vendas',
    '',
    '<!-- archlens:begin -->',
    '',
    '## Relações',
    '',
    '- **serving** → [[archlens/application-component/rh|Recursos Humanos]]',
    '',
    '## Contém',
    '',
    '- [[archlens/application-component/vendas.api|API de Vendas]]',
    '',
    '<!-- archlens:end -->',
    '',
    'Notas da equipe.',
    '',
    '<!-- timeline -->',
    '',
    '## Timeline',
    '',
    '- 2026-10-01: criado',
    '',
  ].join('\n');
  const page = archlensPage(canonical);
  assert.ok(!/^slug:|^content_flag:/m.test(page));
  assert.ok(!page.includes('<!-- timeline -->'));
  const files = new Map([...pages].map(([r, t]) => [r, r === rel ? page : t]));
  assert.equal(normalizeMirror(files, 'archlens').get(rel), pages.get(rel));
});

test('archlens remote pull and check through the CLI', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const cwd = join(w.dir, '..');
  let r = cli(['remote', 'architecture', 'pull', '--out', 'pedido.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pedido\.json/);
  for (let i = 0; ; i++) {
    const req = JSON.parse(readFileSync(join(cwd, 'pedido.json'), 'utf8'));
    assert.equal(req['archlens-remote'], '1.0');
    writeFileSync(join(cwd, `resposta-${i}.json`), JSON.stringify(w.gbrain.run(req)));
    r = cli(['remote', 'architecture', 'pull', '--ingest', `resposta-${i}.json`, '--out', 'pedido.json'], cwd);
    assert.equal(r.status, 0, r.stderr);
    if (!/pedido\.json/.test(r.stdout)) break;
  }
  assert.match(r.stdout, /espelho/);
  r = cli(['query', 'architecture', '--element', 'vendas'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Vendas/);
  // A request without --out goes under .archlens/remote/.
  r = cli(['remote', 'architecture', 'check'], cwd);
  assert.equal(r.status, 0, r.stderr);
  const path = join(w.dir, '.archlens', 'remote', 'tools-request.json');
  writeFileSync(join(cwd, 'check.json'), JSON.stringify(w.gbrain.run(JSON.parse(readFileSync(path, 'utf8')))));
  r = cli(['remote', 'architecture', 'check', '--ingest', 'check.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /gravar/);
  // remote only applies to a base in gbrain's MCP mode.
  const other = mkdtempSync(join(tmpdir(), 'archlens-json-'));
  initBase(join(other, 'architecture'), { name: 'X', store: { kind: 'json' } });
  r = cli(['remote', 'architecture', 'pull'], other);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /mcp/);
});
