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
import { contentVersion, applyOps, diffRaw } from '../scripts/lib/store/ops.mjs';
import { checkConnector } from '../scripts/lib/store/contract.mjs';
import { plan, apply } from '../scripts/lib/api.mjs';
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

test('the connector reads the mirror, declares object versioning and refuses writing without a checked session', () => {
  const w = world();
  const store = checkConnector(w.store());
  assert.equal(store.kind, 'gbrain');
  assert.equal(store.versioning, 'object');
  assert.match(store.describe(), /gbrain mcp/);
  assert.throws(() => store.apply([]), /E_STORE_GBRAIN_SURFACE/);
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
  w.gbrain.call('request_tools', { surface: 'full' });
  const put = w.gbrain.call('put_pages', { request_id: 'outro-apply', pages: changed.map(rel => ({
    slug: rel.replace(/\.md$/, ''), content: all.get(rel), expected_revision: w.gbrain.page(rel.replace(/\.md$/, '')).revision })) });
  assert.equal(put.state, 'committed');
  assert.equal(w.gbrain.page('archlens/application-component/rh').frontmatter.trust_tier, 'agent_written');
  const { requests } = pull(store, w.gbrain);
  // Every pull lists the metadata from the start; only the pages updated after the last pull are fetched.
  assert.deepEqual(requests[0].calls, [{ tool: 'list_pages', arguments: { tag: 'archlens', include_deleted: true, sort: 'updated_asc', limit: 100 } }]);
  assert.deepEqual(getSlugs(requests), changed.map(r => r.replace(/\.md$/, '')).sort());
  assert.equal(store.read().raw.model.elements.find(e => e.id === 'rh').name, 'Gente e Gestão');
  assert.ok(store.read().raw.model.elements.every(e => !('trust_tier' in e))); // gbrain's stamp is not an element field
  assert.equal(mirrorFiles(w.dir).get('archlens/application-component/rh.md'), all.get('archlens/application-component/rh.md'));
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

test('results recorded as the MCP tool result are read from content[0], past gbrain\'s notice blocks', () => {
  const w = world();
  const many = Array.from({ length: 105 }, (_, i) => ({ id: `app-${String(i).padStart(3, '0')}`, type: 'application-component', name: `App ${i}` }));
  w.gbrain.write(pagesOf(base(many)));
  const store = w.store();
  const first = w.gbrain.run(store.remote.pull(), { wrapped: true });
  assert.equal(first.results[0].content.length, 2); // a full page of rows comes with a listing_truncated notice
  let res = store.remote.pullIngest([first]);
  while (res.request) res = store.remote.pullIngest([w.gbrain.run(res.request, { wrapped: true })]);
  assert.equal(store.read().raw.model.elements.length, 108);
});

test('a write stamped before the last listing (its transaction started earlier) is still fetched', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const store = w.store();
  pull(store, w.gbrain);
  const rh = pagesOf(base()).get('archlens/application-component/rh.md').replace('Recursos Humanos', 'RH');
  w.gbrain.write(new Map([['archlens/application-component/rh.md', rh]]), { at: '2026-10-18T11:59:59.000000Z' });
  assert.deepEqual(getSlugs(pull(store, w.gbrain).requests), ['archlens/application-component/rh']);
  assert.equal(store.read().raw.model.elements.find(e => e.id === 'rh').name, 'RH');
  assert.equal(revisions(w.dir)['archlens/application-component/rh'], w.gbrain.page('archlens/application-component/rh').revision);
});

test('a "## History" of dated bullets in a description or in people\'s text stays where it was', () => {
  const w = world();
  const history = '## History\n\n- 2026-10-01: criado\n- 2026-10-10: revisto';
  const b = base();
  const description = `Área de pessoas.\n\n${history}\n\n## Contexto\n\nTexto.`;
  b.raw.model.elements[2].description = description;
  const pages = pagesOf(b, { userText: `\nNotas.\n\n${history}\n` });
  // Without the sentinel that ends every page, gbrain would move the section to its timeline.
  const rel = 'archlens/application-component/rh.md';
  const g = fakeGbrain();
  g.write(new Map([[rel, pages.get(rel).replace(/\n<!-- timeline -->\n$/, '')]]));
  assert.match(g.content('archlens/application-component/rh'), /<!-- timeline -->\n\n## History/);
  w.gbrain.write(pages);
  const store = w.store();
  pull(store, w.gbrain);
  assert.ok(!w.gbrain.content('archlens/application-component/rh').includes('<!-- timeline -->'));
  assert.equal(store.read().raw.model.elements.find(e => e.id === 'rh').description, description);
  assert.equal(store.vault().base.ctx.pages.get('vendas').userText, `\n\nNotas.\n\n${history}\n`);
  for (const [r, text] of pages) assert.equal(mirrorFiles(w.dir).get(r), text, r);
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
  assert.ok(pages.get('archlens/application-component/vendas.md').endsWith('criado\n\n<!-- timeline -->\n'));
  const rel = 'archlens/application-component/vendas.md';
  // What get_page returns for that page: type and title first, the jsonb order, tags last (sorted), keys gbrain stamped
  // (slug, trust_tier, content_flag), a blank line after the frontmatter and the trimmed body; the sentinel that ended
  // the page split off an empty timeline, so it is not served back.
  const canonical = [
    '---',
    'type: application-component',
    'title: Vendas',
    'c4: softwareSystem',
    'id: vendas',
    'slug: archlens/application-component/vendas',
    'trust_tier: agent_written',
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
    '## Timeline',
    '',
    '- 2026-10-01: criado',
    '',
  ].join('\n');
  const page = archlensPage(canonical);
  assert.ok(!/^(slug|content_flag|trust_tier):/m.test(page));
  assert.ok(page.endsWith('<!-- archlens:end -->\n\nNotas da equipe.\n\n## Timeline\n\n- 2026-10-01: criado\n'));
  assert.equal(archlensPage(`${canonical}\n<!-- timeline -->\n`), page); // a sentinel ending the page goes too
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

// ---- apply in MCP mode -------------------------------------------------------------------------------------------

/** A base in the fake gbrain, pulled into the mirror, with the session checked (`ceiling`: the widest tool surface). */
function ready({ ceiling = 'full', extra = [] } = {}) {
  const w = world({ ceiling });
  w.gbrain.write(pagesOf(base(extra)));
  const store = w.store();
  pull(store, w.gbrain);
  store.remote.checkIngest([w.gbrain.run(store.remote.check())]);
  return { ...w, store };
}
const deltaOf = (elements, relationships = []) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 'cache', model: { elements, relationships } });
const cache = { id: 'vendas.cache', type: 'application-component', name: 'Cache de Pedidos', parent: 'vendas', c4: { kind: 'container' } };
const cacheToRh = { id: 'r-cache-rh', from: 'vendas.cache', to: 'rh', type: 'serving' };
const children = ['fila', 'motor', 'painel', 'relatorios', 'cobranca', 'agenda'].map(id => ({ id: `vendas.${id}`, type: 'application-component', name: `Vendas ${id}`, parent: 'vendas', c4: { kind: 'container' } }));

function finalPlan(w, elements, relationships) {
  const { plan: p } = plan(w.store, deltaOf(elements, relationships), { today: '2026-10-18' });
  assert.equal(p.state, 'final');
  return p;
}
/** apply → (read-check) → the apply request: { request, apply }. */
function requestApply(w, p) {
  const first = apply(w.store, p);
  return first.request.step === 'read-check' ? apply(w.store, p, { readCheck: [w.gbrain.run(first.request)] }) : first;
}
const journal = (dir, id) => JSON.parse(readFileSync(join(dir, '.archlens', 'applies', `${id}.json`), 'utf8'));
const pagesIn = calls => calls.filter(c => c.tool === 'put_pages').flatMap(c => c.arguments.pages ?? []);
const mdOf = files => new Map([...files].filter(([k]) => k.endsWith('.md')));
/** Another writer records a round in gbrain's history page. */
function otherRound(w, n) {
  const b = base();
  for (let i = 1; i <= n; i++) b.raw.changelog.push({ id: `2026-10-18-${String(i).padStart(2, '0')}`, date: '2026-10-18', summary: `outro apply ${i}`, added: [], changed: [], status: {}, removed: [], decisions: [] });
  w.gbrain.write(new Map([['archlens/changelog.md', pagesOf(b).get('archlens/changelog.md')]]));
}

test('a full apply round trip through the fake gbrain', () => {
  const w = ready();
  const p = finalPlan(w, [cache], [cacheToRh]);
  const before = w.store.read();
  const expected = contentVersion(applyOps(before, p.ops));
  const first = apply(w.store, p);
  assert.equal(first.request.step, 'read-check');
  assert.ok(first.request.calls.every(c => c.tool === 'get_page' && c.arguments.include_content === true && c.arguments.content_only === true));
  const reread = first.request.calls.map(c => c.arguments.slug);
  assert.ok(reread.includes('archlens/application-component/rh'));
  assert.ok(existsSync(join(w.dir, '.archlens', 'remote', 'read-check.json')));

  const second = apply(w.store, p, { readCheck: [w.gbrain.run(first.request)] });
  const req = second.request;
  assert.equal(req.step, 'apply');
  assert.equal(req['archlens-remote'], '1.0');
  const written = pagesIn(req.calls);
  const page = slug => written.find(pg => pg.slug === slug);
  assert.ok(reread.every(s => !page(s))); // a page read only is reread, never rewritten
  assert.equal(page('archlens/application-component/vendas').expected_revision, p.objects['element:vendas']);
  assert.ok(!('expected_revision' in page('archlens/application-component/vendas.cache'))); // new: create only
  assert.deepEqual(req.calls.at(-1).arguments.pages.map(pg => pg.slug), ['archlens/changelog']); // the history goes last
  assert.equal(req.calls.at(-1).arguments.pages[0].expected_revision, w.gbrain.page('archlens/changelog').revision);
  assert.equal(new Set(req.calls.map(c => c.arguments.request_id)).size, req.calls.length);
  const j = journal(w.dir, second.apply);
  assert.equal(j.state, 'requested');
  assert.deepEqual(j.plan, p);
  assert.deepEqual(j.calls, req.calls);
  assert.deepEqual(j.before['archlens/application-component/vendas'], { content: mirrorFiles(w.dir).get('archlens/application-component/vendas.md'), revision: p.objects['element:vendas'] });
  assert.deepEqual(j.before['archlens/application-component/vendas.cache'], { content: null, revision: null });

  const done = w.store.remote.receipts([w.gbrain.run(req)]);
  assert.equal(done.state, 'committed');
  assert.equal(done.entry.id, '2026-10-18-01');
  assert.equal(journal(w.dir, second.apply).state, 'committed');
  assert.equal(contentVersion(w.store.read()), expected);
  for (const { slug } of written) assert.equal(revisions(w.dir)[slug], w.gbrain.page(slug).revision, slug);
  // The receipts carry no updated_at: the next pull fetches the pages written once and finds the same base (nested keys,
  // such as those of "sources", come back in gbrain's jsonb order).
  const again = pull(w.store, w.gbrain);
  assert.deepEqual(getSlugs(again.requests), written.map(pg => pg.slug).sort());
  assert.equal(contentVersion(w.store.read()), expected);
  assert.deepEqual(pull(w.store, w.gbrain).requests.map(r => r.step), ['list']);
});

test('a read-set page changed in gbrain after the plan is refused at read-check', () => {
  const w = ready();
  const p = finalPlan(w, [cache], [cacheToRh]);
  const first = apply(w.store, p);
  const rh = 'archlens/application-component/rh';
  w.gbrain.write(new Map([[`${rh}.md`, pagesOf(base()).get(`${rh}.md`).replace('Recursos Humanos', 'RH')]]));
  assert.throws(() => apply(w.store, p, { readCheck: [w.gbrain.run(first.request)] }), e => e.code === 'E_STORE_CONFLICT'
    && e.conflicts.some(c => c.ref === 'element:rh' && c.planned === p.objects['element:rh'] && c.current === w.gbrain.page(rh).revision)
    && /Recursos Humanos/.test(e.message) && /--answers/.test(e.message));
  assert.ok(!existsSync(join(w.dir, '.archlens', 'applies')) || !readdirSync(join(w.dir, '.archlens', 'applies')).length);
  assert.equal(w.gbrain.page('archlens/application-component/vendas.cache'), null);
});

test('a partial batch is completed by --resume', () => {
  for (const pending of [false, true]) {
    const w = ready();
    const p = finalPlan(w, children);
    const expected = contentVersion(applyOps(w.store.read(), p.ops));
    const { request: req, apply: id } = requestApply(w, p);
    w.gbrain.failAfter(3, { pending });
    const res = w.store.remote.receipts([w.gbrain.run(req)]);
    assert.equal(res.state, 'partial');
    assert.equal(res.committed.length, 3);
    assert.ok(res.pending.includes('archlens/changelog'));
    assert.equal(journal(w.dir, id).state, 'partial');
    for (const slug of res.committed) assert.equal(revisions(w.dir)[slug], w.gbrain.page(slug).revision); // the mirror has what was written
    w.gbrain.failAfter(Infinity);
    const resumed = w.store.remote.resume();
    assert.equal(resumed.request.step, 'apply');
    const old = req.calls.map(c => c.arguments.request_id);
    if (pending) {
      // Still publishing: the same batches are read again by their request_id, without resending the pages.
      assert.deepEqual(resumed.request.calls, old.map(rid => ({ tool: 'put_pages', arguments: { request_id: rid } })));
    } else {
      // Failed: the pages left are sent again in new batches; the history last.
      assert.ok(resumed.request.calls.every(c => !old.includes(c.arguments.request_id)));
      assert.deepEqual(pagesIn(resumed.request.calls).map(pg => pg.slug).sort(), [...res.pending].sort());
      assert.deepEqual(resumed.request.calls.at(-1).arguments.pages.map(pg => pg.slug), ['archlens/changelog']);
    }
    const done = w.store.remote.receipts([w.gbrain.run(resumed.request)]);
    assert.equal(done.state, 'committed', `pending: ${pending}`);
    assert.equal(contentVersion(w.store.read()), expected);
    pull(w.store, w.gbrain);
    assert.equal(contentVersion(w.store.read()), expected);
    assert.throws(() => w.store.remote.resume(), /E_STORE_APPLY/); // nothing left
  }
});

test('a partial batch is undone by --undo', () => {
  const w = ready();
  const original = mdOf(mirrorFiles(w.dir));
  const p = finalPlan(w, children);
  const { request: req, apply: id } = requestApply(w, p);
  w.gbrain.failAfter(3);
  const res = w.store.remote.receipts([w.gbrain.run(req)]);
  assert.equal(res.state, 'partial');
  w.gbrain.failAfter(Infinity);
  const j = journal(w.dir, id);
  const undo = w.store.remote.undo();
  assert.equal(undo.request.step, 'undo');
  // Each page the apply wrote goes back: its earlier content, or deleted when the apply created it; expected_revision is
  // the revision the apply wrote.
  for (const slug of res.committed) {
    const { content } = j.before[slug];
    if (content === null) {
      assert.ok(undo.request.calls.some(c => c.tool === 'delete_page' && c.arguments.slug === slug && c.arguments.expected_revision === j.pages[slug].revision), slug);
    } else {
      const pg = pagesIn(undo.request.calls).find(x => x.slug === slug);
      assert.deepEqual(pg, { slug, content, expected_revision: j.pages[slug].revision });
    }
  }
  assert.equal(pagesIn(undo.request.calls).length + undo.request.calls.filter(c => c.tool === 'delete_page').length, res.committed.length);
  const done = w.store.remote.receipts([w.gbrain.run(undo.request)]);
  assert.equal(done.state, 'undone');
  assert.equal(journal(w.dir, id).state, 'undone');
  assert.equal(contentVersion(w.store.read()), contentVersion(base()));
  pull(w.store, w.gbrain);
  assert.equal(contentVersion(w.store.read()), contentVersion(base()));
  assert.deepEqual(mdOf(mirrorFiles(w.dir)), original);
  assert.throws(() => w.store.remote.undo(), /E_STORE_APPLY/);
});

test('a history revision conflict is retried by rereading', () => {
  const w = ready();
  const p = finalPlan(w, [cache]);
  const { request: req, apply: id } = requestApply(w, p);
  otherRound(w, 1); // another apply records its round first
  let res = w.store.remote.receipts([w.gbrain.run(req)]);
  assert.equal(res.state, 'partial');
  assert.deepEqual(res.request.calls, [{ tool: 'get_page', arguments: { slug: 'archlens/changelog', include_content: true, content_only: true } }]);
  res = w.store.remote.receipts([w.gbrain.run(res.request)]);
  assert.equal(res.request.calls.length, 1);
  assert.deepEqual(res.request.calls[0].arguments.pages.map(pg => [pg.slug, pg.expected_revision]), [['archlens/changelog', w.gbrain.page('archlens/changelog').revision]]);
  res = w.store.remote.receipts([w.gbrain.run(res.request)]);
  assert.equal(res.state, 'committed');
  assert.equal(res.entry.id, '2026-10-18-02'); // numbered when written, after the other round
  assert.equal(journal(w.dir, id).entry.id, '2026-10-18-02');
  pull(w.store, w.gbrain);
  assert.deepEqual(w.store.read().raw.changelog.map(r => r.id), ['2026-10-01-01', '2026-10-18-01', '2026-10-18-02']);
  assert.ok(w.store.read().raw.model.elements.some(e => e.id === 'vendas.cache'));

  // Up to 5 rereads; then E_STORE_HISTORY_RETRY, with the rest written and the round kept for --resume.
  const w2 = ready();
  const p2 = finalPlan(w2, [cache]);
  const r2 = requestApply(w2, p2);
  let n = 1;
  otherRound(w2, n);
  res = w2.store.remote.receipts([w2.gbrain.run(r2.request)]);
  for (let i = 0; i < 5; i++) {
    res = w2.store.remote.receipts([w2.gbrain.run(res.request)]); // the reread: the history put
    otherRound(w2, ++n);
    if (i < 4) res = w2.store.remote.receipts([w2.gbrain.run(res.request)]);
  }
  assert.throws(() => w2.store.remote.receipts([w2.gbrain.run(res.request)]), e => e.code === 'E_STORE_HISTORY_RETRY' && /--resume/.test(e.message));
  assert.equal(journal(w2.dir, r2.apply).state, 'partial');
  assert.ok(w2.gbrain.page('archlens/application-component/vendas.cache')); // the rest is written
  const resumed = w2.store.remote.resume();
  assert.deepEqual(resumed.request.calls.map(c => c.tool), ['get_page']);
  res = w2.store.remote.receipts([w2.gbrain.run(resumed.request)]);
  res = w2.store.remote.receipts([w2.gbrain.run(res.request)]);
  assert.equal(res.state, 'committed');
  assert.equal(res.entry.id, '2026-10-18-07');
});

test('writing with the starter surface is refused with E_STORE_GBRAIN_SURFACE', () => {
  // Never checked.
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const store = w.store();
  pull(store, w.gbrain);
  const p = (() => { const { plan: x } = plan(store, deltaOf([cache]), { today: '2026-10-18' }); return x; })();
  assert.throws(() => apply(store, p), /E_STORE_GBRAIN_SURFACE.*remote .*check/);
  // Checked, but the server only allows the starter surface.
  const s = ready({ ceiling: 'starter' });
  assert.throws(() => apply(s.store, finalPlan(s, [cache])), e => e.code === 'E_STORE_GBRAIN_SURFACE' && /modo git/.test(e.message));
  assert.ok(!existsSync(join(s.dir, '.archlens', 'remote', 'read-check.json')));
  // pull, plan and query still work with it.
  assert.ok(s.store.read().raw);
});

test('batches respect 50 pages and 8 MB', () => {
  const w = ready();
  const cur = w.store.read();
  const many = Array.from({ length: 120 }, (_, i) => ({ id: `vendas.m${String(i).padStart(3, '0')}`, type: 'application-component', name: `Módulo ${i}`, parent: 'vendas', c4: { kind: 'container' } }));
  const big = [1, 2, 3].map(i => ({ id: `vendas.big${i}`, type: 'application-component', name: `Grande ${i}`, parent: 'vendas', c4: { kind: 'container' }, description: 'x'.repeat(3 * 1024 * 1024) }));
  const next = structuredClone(cur.raw);
  next.model.elements.push(...big.slice(0, 1), ...many, ...big.slice(1));
  next.changelog.push({ id: '2026-10-18-01', date: '2026-10-18', summary: 'muitos', added: [...many, ...big].map(e => e.id), changed: [], status: {}, removed: [], decisions: [] });
  const ops = diffRaw(cur, { raw: next, notes: cur.notes });
  const { request } = w.store.apply(ops, { baseVersion: contentVersion(cur) });
  const puts = request.calls.filter(c => c.tool === 'put_pages');
  for (const c of puts) {
    assert.ok(c.arguments.pages.length <= 50);
    assert.ok(c.arguments.pages.reduce((n, pg) => n + Buffer.byteLength(pg.content), 0) <= 8 * 1024 * 1024);
  }
  assert.ok(puts.some(c => c.arguments.pages.length === 50));
  assert.ok(puts.slice(0, -1).some(c => c.arguments.pages.length < 50 && c.arguments.pages.some(pg => pg.slug.includes('big')))); // cut by size
  const slugs = pagesIn(puts).map(pg => pg.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs.length, 124 + 1); // the new pages, vendas (its children) and the history
  assert.deepEqual(puts.at(-1).arguments.pages.map(pg => pg.slug), ['archlens/changelog']);
  const done = w.store.remote.receipts([w.gbrain.run(request)]);
  assert.equal(done.state, 'committed');
  assert.equal(w.store.read().raw.model.elements.length, 3 + 123);
});

test('receipts for another request are refused', () => {
  const w = ready();
  const p = finalPlan(w, [cache], [cacheToRh]);
  const first = apply(w.store, p);
  const checked = w.gbrain.run(first.request);
  assert.throws(() => w.store.remote.receipts([checked]), /E_REMOTE_RESPONSE/); // the read-check is not a receipt
  const second = apply(w.store, p, { readCheck: [checked] });
  assert.throws(() => apply(w.store, p, { readCheck: [checked] }), /E_REMOTE_RESPONSE/); // answered already
  const answer = w.gbrain.run(second.request);
  const j = journal(w.dir, second.apply);
  const mirror = mirrorFiles(w.dir);
  const bad = [
    { ...answer, request: 'outro-pedido' },
    { ...answer, 'archlens-remote': '9.9' },
    { ...answer, results: [...answer.results, answer.results[0]] },
    (() => { const x = structuredClone(answer); x.results[0].batch_request_id = 'outro-lote'; return x; })(),
    (() => { const x = structuredClone(answer); x.results[0].pages[0].slug = 'archlens/application-component/outro'; return x; })(),
    (() => { const x = structuredClone(answer); delete x.results[0].pages[0].revision; return x; })(),
    (() => { const x = structuredClone(answer); x.results[0] = { nada: true }; return x; })(),
  ];
  for (const r of bad) assert.throws(() => w.store.remote.receipts([r]), /E_REMOTE_RESPONSE/);
  assert.deepEqual(journal(w.dir, second.apply), j);
  assert.deepEqual(mirrorFiles(w.dir), mirror);
  assert.equal(w.store.remote.receipts([answer]).state, 'committed');
  assert.throws(() => w.store.remote.receipts([answer]), /E_REMOTE_RESPONSE/); // nothing in flight any more
});

test('archlens apply in MCP mode through the CLI: read-check, receipts, resume and undo', () => {
  const w = world();
  w.gbrain.write(pagesOf(base()));
  const cwd = join(w.dir, '..');
  pull(w.store(), w.gbrain);
  const { plan: p } = plan(w.store(), deltaOf([cache], [cacheToRh]), { today: '2026-10-18' });
  writeFileSync(join(cwd, 'p.json'), JSON.stringify(p));
  let r = cli(['apply', 'architecture', 'p.json'], cwd);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_GBRAIN_SURFACE/);
  w.store().remote.checkIngest([w.gbrain.run(w.store().remote.check())]);
  const remote = step => join(w.dir, '.archlens', 'remote', `${step}-request.json`);
  const answer = (step, out) => writeFileSync(join(cwd, out), JSON.stringify(w.gbrain.run(JSON.parse(readFileSync(remote(step), 'utf8')))));
  r = cli(['apply', 'architecture', 'p.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /read-check/);
  assert.match(r.stdout, /--read-check/);
  answer('read-check', 'rc.json');
  r = cli(['apply', 'architecture', 'p.json', '--read-check', 'rc.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--receipts/);
  w.gbrain.failAfter(1);
  answer('apply', 'recibos.json');
  r = cli(['apply', 'architecture', '--receipts', 'recibos.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /parcial/);
  assert.match(r.stdout, /--resume/);
  assert.match(r.stdout, /--undo/);
  w.gbrain.failAfter(Infinity);
  r = cli(['apply', 'architecture', '--resume'], cwd);
  assert.equal(r.status, 0, r.stderr);
  answer('apply', 'recibos-2.json');
  r = cli(['apply', 'architecture', '--receipts', 'recibos-2.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rodada 2026-10-18-01/);
  assert.ok(existsSync(join(cwd, 'ARCHITECTURE.md')));
  assert.match(readFileSync(join(cwd, 'ARCHITECTURE.md'), 'utf8'), /Cache de Pedidos/);
  r = cli(['apply', 'architecture', '--undo'], cwd);
  assert.equal(r.status, 0, r.stderr);
  answer('undo', 'desfaz.json');
  r = cli(['apply', 'architecture', '--receipts', 'desfaz.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /desfeito/);
  assert.equal(contentVersion(w.store().read()), contentVersion(base()));
  // --receipts and friends only apply to a base in gbrain's MCP mode.
  const other = mkdtempSync(join(tmpdir(), 'archlens-json-'));
  initBase(join(other, 'architecture'), { name: 'X', store: { kind: 'json' } });
  r = cli(['apply', 'architecture', '--resume'], other);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /mcp/);
});
