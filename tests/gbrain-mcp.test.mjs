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
import { convertToGbrain, convertFromGbrain, convertFolder, finishConvertToMcp, pendingConvertToMcp } from '../scripts/lib/store/convert.mjs';
import { gbrainMcpConnector } from '../scripts/lib/store/gbrain-mcp.mjs';
import { canonicalJson } from '../scripts/lib/merge.mjs';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

const base = (extra = []) => ({
  raw: {
    archlens: '2.0', name: 'Empresa',
    model: {
      elements: [
        { id: 'vendas', type: 'application-component', name: 'Vendas', c4: { kind: 'softwareSystem' }, properties: { area: 'comercial', tier: 'gold' } }, // in jsonb key order, the order gbrain gives nested keys back in
        { id: 'vendas.api', type: 'application-component', name: 'API de Vendas', parent: 'vendas', c4: { kind: 'container' } },
        { id: 'rh', type: 'application-component', name: 'Recursos Humanos', c4: { kind: 'softwareSystem' }, since: '2026-10-18' }, // gbrain reads an unquoted date as a timestamp
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
function ready({ ceiling = 'full', extra = [], sourceId } = {}) {
  const w = world({ ceiling, sourceId });
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

  // An undo whose page changed in gbrain after the apply stops there, and says so.
  const v = ready();
  const { request: r2 } = requestApply(v, finalPlan(v, [cache]));
  assert.equal(v.store.remote.receipts([v.gbrain.run(r2)]).state, 'committed');
  const vendas = 'archlens/application-component/vendas';
  v.gbrain.write(new Map([[`${vendas}.md`, v.gbrain.content(vendas).replace('# Vendas', '# Vendas (editado)')]]));
  const u = v.store.remote.undo();
  const partial = v.store.remote.receipts([v.gbrain.run(u.request)]);
  assert.equal(partial.state, 'undo-partial');
  assert.deepEqual(partial.conflicts, [vendas]);
  assert.throws(() => v.store.remote.undo(), e => e.code === 'E_STORE_APPLY' && e.message.includes(vendas));
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

test('a call without a result, whether it ran or not, is replayed with the same request_id by --resume', () => {
  for (const ran of [true, false]) {
    const w = ready();
    const p = finalPlan(w, [cache]);
    const { request: req } = requestApply(w, p);
    // The agent stopped before recording the last result: the call ran (lost result), or it was never sent.
    const answer = ran ? w.gbrain.run(req) : w.gbrain.run({ ...req, calls: req.calls.slice(0, -1) });
    const res = w.store.remote.receipts([{ ...answer, results: answer.results.slice(0, req.calls.length - 1) }]);
    assert.equal(res.state, 'partial');
    assert.deepEqual(res.pending, ['archlens/changelog']);
    const resumed = w.store.remote.resume();
    assert.deepEqual(resumed.request.calls, [req.calls.at(-1)], `ran: ${ran}`); // the same call, the same request_id
    const done = w.store.remote.receipts([w.gbrain.run(resumed.request)]);
    assert.equal(done.state, 'committed', `ran: ${ran}`);
    pull(w.store, w.gbrain);
    assert.deepEqual(w.store.read().raw.changelog.map(r => r.id), ['2026-10-01-01', '2026-10-18-01']); // the round once
  }
});

test('a journal still waiting for its receipts is replayed unchanged, and a receipt without revision is taken', () => {
  const w = ready();
  const p = finalPlan(w, [cache]);
  const { request: req } = requestApply(w, p);
  const resumed = w.store.remote.resume();
  assert.deepEqual(resumed.request.calls, req.calls);
  const answer = w.gbrain.run(resumed.request);
  const slug = answer.results[0].pages[0].slug;
  answer.results[0].pages[0].revision = null; // gbrain's receipt had none
  assert.equal(w.store.remote.receipts([answer]).state, 'committed');
  assert.equal(revisions(w.dir)[slug], undefined); // left for the next pull
  assert.ok(getSlugs(pull(w.store, w.gbrain).requests).includes(slug));
  assert.equal(revisions(w.dir)[slug], w.gbrain.page(slug).revision);
});

test('a page gbrain filed as a duplicate of another page was not written: it is not taken as committed', () => {
  const w = ready();
  const p = finalPlan(w, [cache]);
  const { request: req, apply: id } = requestApply(w, p);
  const answer = w.gbrain.run(req);
  const slug = 'archlens/application-component/vendas.cache';
  const k = req.calls.findIndex(c => c.arguments.pages?.some(pg => pg.slug === slug));
  const entry = answer.results[k].pages.find(pg => pg.slug === slug);
  // gbrain's receipt when the content matches another page with the same frontmatter id (src/core/import-identity.ts):
  // committed, no revision, the page it duplicates.
  Object.assign(entry, { state: 'committed', revision: null, status: 'duplicate', duplicate_of: 'outra/application-component/vendas.cache' });
  const res = w.store.remote.receipts([answer]);
  assert.equal(res.state, 'partial');
  assert.ok(res.pending.includes(slug));
  assert.ok(!res.committed.includes(slug));
  assert.deepEqual(res.duplicates, [{ slug, of: 'outra/application-component/vendas.cache' }]);
  assert.equal(journal(w.dir, id).pages[slug].state, 'failed');
  assert.equal(journal(w.dir, id).pages[slug].duplicateOf, 'outra/application-component/vendas.cache');
  assert.equal(revisions(w.dir)[slug], undefined);
  assert.equal(mirrorFiles(w.dir).has(`${slug}.md`), false);
});

// gbrain's put_page keeps the tags a page had (it adds the ones sent): the tags an apply drops are taken off with
// remove_tag in a follow-up request, once the page's put committed, each guarded by the revision the last write gave.
const legado = { id: 'legado', type: 'application-component', name: 'Sistema Legado', tags: ['legado', 'erp'] };
const LEGADO = 'archlens/application-component/legado';
const retag = (w, tags = ['novo']) => {
  const el = w.store.read().raw.model.elements.find(e => e.id === 'legado');
  const entry = { id: '2026-10-18-01', date: '2026-10-18', summary: 'etiquetas', added: [], changed: ['legado'], status: {}, removed: [], decisions: [] };
  return w.store.apply([{ op: 'upsertElement', element: { ...el, tags } }, { op: 'appendHistory', entry }], { baseVersion: w.store.version() });
};
const tagsOfEl = w => w.store.read().raw.model.elements.find(e => e.id === 'legado').tags;
const tagCallsIn = req => (req?.calls ?? []).filter(c => c.tool === 'remove_tag' || c.tool === 'add_tag');
/** --receipts of `req`, then of each follow-up request, until none: the summaries, in order. */
function settle(w, req) {
  const out = [];
  for (let r = req; r;) { const res = w.store.remote.receipts([w.gbrain.run(r)]); out.push(res); r = res.request; }
  return out;
}
/** A write by someone else to `slug` in the fake (its content with one more line of people's text). */
const someoneWrites = (w, slug) => w.gbrain.write(new Map([[`${slug}.md`, w.gbrain.content(slug).replace(/\n$/, '\nNota de outra pessoa.\n')]]));

test('the tags an apply drops are taken off after the put committed, one guarded remove_tag at a time; undo puts them back', () => {
  const w = ready({ extra: [legado] });
  const original = contentVersion(w.store.read());
  const { request: req } = retag(w);
  assert.deepEqual(tagCallsIn(req), []); // never with the page writes
  const first = w.store.remote.receipts([w.gbrain.run(req)]);
  assert.equal(first.state, 'partial');
  const putRevision = w.gbrain.page(LEGADO).revision;
  assert.deepEqual(tagCallsIn(first.request).map(c => ({ ...c.arguments, request_id: undefined })),
    [{ slug: LEGADO, tag: 'archlens/tag/erp', expected_revision: putRevision, request_id: undefined }]);
  const second = w.store.remote.receipts([w.gbrain.run(first.request)]);
  const afterFirst = w.gbrain.page(LEGADO).revision;
  assert.notEqual(afterFirst, putRevision);
  assert.deepEqual(tagCallsIn(second.request).map(c => [c.arguments.tag, c.arguments.expected_revision]), [['archlens/tag/legado', afterFirst]]); // chained
  assert.equal(w.store.remote.receipts([w.gbrain.run(second.request)]).state, 'committed');
  assert.deepEqual(w.gbrain.page(LEGADO).tags, ['archlens', 'archlens/application-component', 'archlens/tag/novo']);
  assert.equal(revisions(w.dir)[LEGADO], w.gbrain.page(LEGADO).revision);
  pull(w.store, w.gbrain);
  assert.deepEqual(tagsOfEl(w), ['novo']);

  const undo = w.store.remote.undo();
  assert.deepEqual(tagCallsIn(undo.request), []);
  const steps = settle(w, undo.request);
  assert.equal(steps.at(-1).state, 'undone', JSON.stringify(steps.at(-1)));
  assert.deepEqual(w.gbrain.page(LEGADO).tags, ['archlens', 'archlens/application-component', 'archlens/tag/erp', 'archlens/tag/legado']);
  pull(w.store, w.gbrain);
  assert.equal(contentVersion(w.store.read()), original);
});

test('a page someone changed before the apply ran: its put is refused and no tag call is made', () => {
  const w = ready({ extra: [legado] });
  const before = revisions(w.dir)[LEGADO];
  const { request: req } = retag(w);
  someoneWrites(w, LEGADO);
  const theirs = w.gbrain.page(LEGADO);
  const res = w.store.remote.receipts([w.gbrain.run(req)]);
  assert.equal(res.state, 'partial');
  assert.ok(res.conflicts.includes(LEGADO));
  assert.deepEqual(tagCallsIn(res.request), []);
  assert.deepEqual(w.gbrain.page(LEGADO).tags, theirs.tags);
  assert.equal(w.gbrain.page(LEGADO).revision, theirs.revision);
  assert.equal(revisions(w.dir)[LEGADO], before);
  const undo = w.store.remote.undo();
  assert.deepEqual(tagCallsIn(undo.request), []); // nothing to put back on a page the apply did not write
});

test('a page someone changed between the committed put and its remove_tag: the tag call is refused and reported', () => {
  const w = ready({ extra: [legado] });
  const { request: req } = retag(w, ['erp', 'novo']);
  const first = w.store.remote.receipts([w.gbrain.run(req)]);
  const putRevision = w.gbrain.page(LEGADO).revision;
  assert.equal(tagCallsIn(first.request).length, 1);
  someoneWrites(w, LEGADO);
  const theirs = w.gbrain.page(LEGADO);
  const res = w.store.remote.receipts([w.gbrain.run(first.request)]);
  assert.equal(res.state, 'partial');
  assert.ok(res.conflicts.includes(`${LEGADO} (remove_tag archlens/tag/legado)`), JSON.stringify(res));
  assert.equal(res.request, undefined);
  assert.deepEqual(w.gbrain.page(LEGADO).tags, theirs.tags);
  assert.equal(revisions(w.dir)[LEGADO], putRevision); // never the other writer's revision
  assert.throws(() => w.store.remote.resume(), e => e.code === 'E_STORE_APPLY' && e.message.includes(LEGADO));
  // The undo cannot put the page back either (it changed): a conflict, and no tag call for it.
  const steps = settle(w, w.store.remote.undo().request);
  assert.equal(steps.at(-1).state, 'undo-partial');
  assert.ok(steps.at(-1).conflicts.includes(LEGADO));
  assert.ok(steps.every(r => !tagCallsIn(r.request).some(c => c.arguments.slug === LEGADO)));
});

test('undo: a page someone changed between the put that restores it and its add_tag is left as they wrote it', () => {
  const w = ready({ extra: [legado] });
  assert.equal(settle(w, retag(w, ['erp', 'novo']).request).at(-1).state, 'committed');
  const first = w.store.remote.receipts([w.gbrain.run(w.store.remote.undo().request)]);
  assert.equal(tagCallsIn(first.request).length, 1, JSON.stringify(first));
  const restored = w.gbrain.page(LEGADO).revision;
  someoneWrites(w, LEGADO);
  const theirs = w.gbrain.page(LEGADO);
  const res = w.store.remote.receipts([w.gbrain.run(first.request)]);
  assert.equal(res.state, 'undo-partial');
  assert.ok(res.conflicts.some(c => c.startsWith(`${LEGADO} (`)), JSON.stringify(res));
  assert.deepEqual(w.gbrain.page(LEGADO).tags, theirs.tags);
  assert.equal(revisions(w.dir)[LEGADO], restored);
});

test('a tag call the agent did not run is sent again by --resume with the same request_id and guard', () => {
  const w = ready({ extra: [legado] });
  const { request: req } = retag(w, ['erp', 'novo']);
  const first = w.store.remote.receipts([w.gbrain.run(req)]);
  const call = tagCallsIn(first.request)[0];
  const lost = w.store.remote.receipts([{ 'archlens-remote': '1.0', request: first.request.id, results: [] }]);
  assert.equal(lost.state, 'partial');
  assert.ok(lost.pending.includes(`${LEGADO} (remove_tag archlens/tag/legado)`), JSON.stringify(lost.pending));
  const resumed = w.store.remote.resume();
  assert.deepEqual(tagCallsIn(resumed.request).map(c => c.arguments), [call.arguments]);
  assert.equal(w.store.remote.receipts([w.gbrain.run(resumed.request)]).state, 'committed');
  pull(w.store, w.gbrain);
  assert.deepEqual(tagsOfEl(w), ['erp', 'novo']);
});

test('tag calls carry no source_id (gbrain refuses it: they write to the session\'s source)', () => {
  const w = ready({ extra: [legado], sourceId: 'arquitetura' });
  const { request: req } = retag(w);
  assert.ok(req.calls.filter(c => c.tool === 'put_pages').every(c => c.arguments.source_id === 'arquitetura'));
  const steps = settle(w, req);
  assert.equal(steps.at(-1).state, 'committed');
  assert.ok(steps.every(r => tagCallsIn(r.request).every(c => !('source_id' in c.arguments))));
  assert.deepEqual(w.gbrain.page(LEGADO).tags, ['archlens', 'archlens/application-component', 'archlens/tag/novo']);
});

test('the CLI says which pages gbrain filed as duplicates, and offers --undo, not --resume', () => {
  const w = ready();
  const cwd = join(w.dir, '..');
  writeFileSync(join(cwd, 'p.json'), JSON.stringify(finalPlan(w, [cache])));
  let r = cli(['apply', 'architecture', 'p.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  const remote = step => JSON.parse(readFileSync(join(w.dir, '.archlens', 'remote', `${step}-request.json`), 'utf8'));
  if (/--read-check/.test(r.stdout)) {
    writeFileSync(join(cwd, 'rc.json'), JSON.stringify(w.gbrain.run(remote('read-check'))));
    r = cli(['apply', 'architecture', 'p.json', '--read-check', 'rc.json'], cwd);
    assert.equal(r.status, 0, r.stderr);
  }
  const answer = w.gbrain.run(remote('apply'));
  const slug = 'archlens/application-component/vendas.cache';
  Object.assign(answer.results.flatMap(x => x.pages ?? []).find(pg => pg.slug === slug), { revision: null, status: 'duplicate', duplicate_of: 'outra/application-component/vendas.cache' });
  writeFileSync(join(cwd, 'recibos.json'), JSON.stringify(answer));
  r = cli(['apply', 'architecture', '--receipts', 'recibos.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /o gbrain não gravou archlens\/application-component\/vendas\.cache \(cópia de outra\/application-component\/vendas\.cache\)/);
  assert.doesNotMatch(r.stdout, /--resume/);
  assert.match(r.stdout, /--undo/);
});

test('a poll receipt rebuilt from the admitted pages only is read', () => {
  // The fake polls as gbrain does: a page refused before admission comes back without slug, not_admitted.
  const g = fakeGbrain({ surface: 'full' });
  g.write(new Map([['x/a.md', '---\ntitle: A\n---\nA\n']]));
  g.call('put_pages', { request_id: 'lote', pages: [{ slug: 'x/a', content: '---\ntitle: A\n---\nB\n' }, { slug: 'x/b', content: '---\ntitle: B\n---\nB\n' }] });
  assert.deepEqual(g.call('put_pages', { request_id: 'lote' }).pages[0], { index: 0, slug: '', state: 'not_admitted' });

  for (const at of [0, 1]) {
    const w = ready();
    const p = finalPlan(w, [cache]);
    const { request: req } = requestApply(w, p);
    w.gbrain.failAfter(1, { pending: true });
    let res = w.store.remote.receipts([w.gbrain.run(req)]);
    const resumed = w.store.remote.resume();
    assert.ok(resumed.request.calls.every(c => !c.arguments.pages));
    const answer = w.gbrain.run(resumed.request);
    const page = answer.results[0].pages[at];
    answer.results[0].pages[at] = { index: at, slug: '', state: 'not_admitted' };
    res = w.store.remote.receipts([answer]);
    if (at === 0) {
      // A page already committed, no longer waiting on the batch: nothing new about it.
      assert.equal(res.state, 'committed');
    } else {
      // A page that was waiting on the batch and has no row: it failed, and goes again in a new call.
      assert.equal(res.state, 'partial');
      assert.deepEqual(res.pending, [page.slug]);
      const again = w.store.remote.resume();
      assert.ok(!old(req).includes(again.request.calls[0].arguments.request_id));
    }
  }
  function old(r) { return r.calls.map(c => c.arguments.request_id); }
});

test('a lost poll result, or a batch still publishing at the poll, is polled again with the same request_id', () => {
  for (const lost of [true, false]) {
    const w = ready();
    const p = finalPlan(w, [cache]);
    const { request: req } = requestApply(w, p);
    w.gbrain.failAfter(1, { pending: true });
    const first = w.store.remote.receipts([w.gbrain.run(req)]);
    assert.equal(first.committed.length, 1);
    const polls = w.store.remote.resume().request;
    let answer;
    if (lost) answer = { ...w.gbrain.run(polls), results: [] }; // the agent lost every poll result
    else {
      answer = w.gbrain.run(polls);
      for (const r of answer.results) for (const pg of r.pages) if (!first.committed.includes(pg.slug)) { pg.state = 'queued'; delete pg.revision; } // still publishing
    }
    const res = w.store.remote.receipts([answer]);
    assert.equal(res.state, 'partial');
    assert.deepEqual(res.committed, first.committed); // what was committed stays committed
    assert.deepEqual(res.pending, first.pending);
    const again = w.store.remote.resume().request;
    assert.deepEqual(again.calls, polls.calls, `lost: ${lost}`);
    assert.equal(w.store.remote.receipts([w.gbrain.run(again)]).state, 'committed', `lost: ${lost}`);
  }
});

test('a page committed without revision is read again before --undo puts it back, and left out if it changed', () => {
  for (const changed of [false, true]) {
    const w = ready();
    const original = contentVersion(w.store.read());
    const { request: req } = requestApply(w, finalPlan(w, [cache]));
    const answer = w.gbrain.run(req);
    const slug = answer.results[0].pages[0].slug;
    answer.results[0].pages[0].revision = null;
    assert.equal(w.store.remote.receipts([answer]).state, 'committed');
    const u = w.store.remote.undo();
    // No unguarded write: the page is read again first.
    assert.ok(u.request.calls.some(c => c.tool === 'get_page' && c.arguments.slug === slug));
    assert.ok(!u.request.calls.some(c => c.tool !== 'get_page' && (c.arguments.slug === slug || (c.arguments.pages ?? []).some(pg => pg.slug === slug))));
    if (changed) w.gbrain.write(new Map([[`${slug}.md`, `${w.gbrain.content(slug)}\nTexto novo de uma pessoa.\n`]]));
    let res = w.store.remote.receipts([w.gbrain.run(u.request)]);
    if (!changed) {
      // Still as the apply wrote it: put back with the revision it has now.
      const call = res.request.calls[0];
      const rev = w.gbrain.page(slug).revision;
      assert.ok(call.tool === 'delete_page' ? call.arguments.expected_revision === rev : call.arguments.pages[0].expected_revision === rev);
      res = w.store.remote.receipts([w.gbrain.run(res.request)]);
      assert.equal(res.state, 'undone');
      pull(w.store, w.gbrain);
      assert.equal(contentVersion(w.store.read()), original);
    } else {
      assert.equal(res.state, 'undo-partial');
      assert.deepEqual(res.conflicts, [slug]);
      assert.equal(res.request, undefined);
      assert.match(w.gbrain.content(slug), /Texto novo/); // never overwritten
      assert.throws(() => w.store.remote.undo(), e => e.code === 'E_STORE_APPLY' && e.message.includes(slug));
    }
  }
});

test('a page gone from gbrain at a reread is an answer: undo leaves it out, the apply stops on a deleted history', () => {
  // Undo: a page committed without revision is deleted in gbrain before the reread; the other undo writes are recorded.
  const w = ready();
  const { request: req } = requestApply(w, finalPlan(w, [cache]));
  const answer = w.gbrain.run(req);
  const slug = answer.results[0].pages[0].slug;
  answer.results[0].pages[0].revision = null;
  w.store.remote.receipts([answer]);
  const u = w.store.remote.undo();
  w.gbrain.remove(slug);
  const res = w.store.remote.receipts([w.gbrain.run(u.request)]);
  assert.equal(res.state, 'undo-partial');
  assert.deepEqual(res.conflicts, [slug]);
  assert.ok(res.committed.length >= 1); // the other pages went back
  assert.throws(() => w.store.remote.undo(), e => e.code === 'E_STORE_APPLY' && e.message.includes(slug));

  // Apply: the history page is deleted between the conflict and its reread.
  const v = ready();
  const r = requestApply(v, finalPlan(v, [cache]));
  otherRound(v, 1);
  const get = v.store.remote.receipts([v.gbrain.run(r.request)]).request;
  v.gbrain.remove('archlens/changelog');
  assert.throws(() => v.store.remote.receipts([v.gbrain.run(get)]), e => e.code === 'E_STORE_HISTORY_RETRY' && e.message.includes('archlens/changelog'));
  const j = journal(v.dir, r.apply);
  assert.equal(j.state, 'partial');
  assert.equal(j.request, null); // nothing left in flight: --resume or --undo can start
  assert.ok(v.gbrain.page('archlens/application-component/vendas.cache'));
  // Restored, --resume finishes.
  v.gbrain.call('restore_page', { slug: 'archlens/changelog', request_id: 'restaura' });
  let res2 = v.store.remote.receipts([v.gbrain.run(v.store.remote.resume().request)]);
  res2 = v.store.remote.receipts([v.gbrain.run(res2.request)]);
  assert.equal(res2.state, 'committed');
});

// store convert in MCP mode: a local base goes to the gbrain as one create-only apply, and comes back from the mirror.
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
const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const MCP = { kind: 'gbrain', mode: 'mcp', server: 'gbrain' };

/** A copy of examples/<ex>/architecture with a file of its own, a fake gbrain and a checked session (writing allowed). */
function convWorld(ex, { prefix } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-mconvert-')), 'architecture');
  cpSync(join(EXAMPLES, ex, 'architecture'), dir, { recursive: true });
  writeFileSync(join(dir, 'minha-nota.txt'), 'meu\n');
  const gbrain = fakeGbrain();
  const loc = resolveBase(dir);
  const store = { ...MCP, ...(prefix ? { prefix } : {}) };
  const checker = gbrainMcpConnector(loc, { ...store, prefix: prefix ?? 'archlens' });
  checker.remote.checkIngest([gbrain.run(checker.remote.check())]);
  return { dir, loc, gbrain, store };
}
const finish = (w, res) => {
  const conn = gbrainMcpConnector(w.loc, { ...MCP, prefix: 'archlens', ...w.store });
  let out = conn.remote.receipts([w.gbrain.run(res.request)]);
  return { conn, out };
};

for (const [ex, back] of [['loja-online', 'json'], ['telemedicina', 'json'], ['repos', 'markdown']]) {
  test(`a local base goes to the fake gbrain and back unchanged (${ex})`, () => {
    const w = convWorld(ex);
    const before = openStore(w.loc).read();
    const manifestBefore = readFileSync(join(w.dir, 'archlens.json'), 'utf8');
    const res = convertToGbrain(w.loc, w.store);
    assert.equal(res.request.step, 'apply');
    assert.ok(res.pages > 1);
    // Every page is create-only, the history last, and no read-check precedes it.
    const sent = res.request.calls.flatMap(c => c.arguments.pages ?? []);
    assert.equal(sent.length, res.pages);
    assert.ok(sent.every(p => p.expected_revision === undefined));
    assert.equal(sent.at(-1).slug, 'archlens/changelog');
    // Nothing local changes before the receipts.
    assert.equal(readFileSync(join(w.dir, 'archlens.json'), 'utf8'), manifestBefore);

    const { conn, out } = finish(w, res);
    assert.equal(out.state, 'committed');
    finishConvertToMcp(w.loc);
    assert.deepEqual(JSON.parse(readFileSync(join(w.dir, 'archlens.json'), 'utf8')),
      { archlens: '2.0', name: before.raw.name, store: { ...MCP, prefix: 'archlens' } });
    for (const f of ['model.json', 'views.json', 'changelog.json', 'gbrain-pack.yaml', 'business-actor']) assert.equal(existsSync(join(w.dir, f)), false, f);
    assert.equal(readFileSync(join(w.dir, 'minha-nota.txt'), 'utf8'), 'meu\n');
    const there = openStore(resolveBase(w.dir)).read();
    assert.equal(norm(there), norm(before));
    assert.equal(contentVersion(there), contentVersion(before));
    assert.deepEqual(there.notes, before.notes);
    assert.ok(conn);

    const done = convertFromGbrain(resolveBase(w.dir), back);
    assert.equal(done.to, back);
    const after = openStore(resolveBase(w.dir));
    assert.equal(after.kind, back);
    assert.equal(norm(after.read()), norm(before));
    assert.equal(contentVersion(after.read()), contentVersion(before));
    assert.deepEqual(after.read().notes, before.notes);
    assert.equal(readFileSync(join(w.dir, 'minha-nota.txt'), 'utf8'), 'meu\n');
    assert.equal(existsSync(join(w.dir, '.archlens', 'mirror')), false);
  });
}

test('pages already present make creation fail per page and the convert reports them', () => {
  const w = convWorld('loja-online');
  const before = readFileSync(join(w.dir, 'archlens.json'), 'utf8');
  const res = convertToGbrain(w.loc, w.store);
  const slugs = res.request.calls.flatMap(c => c.arguments.pages).map(p => p.slug);
  const taken = slugs.find(s => s !== 'archlens/changelog' && s !== 'archlens/manifest');
  w.gbrain.write(new Map([[`${taken}.md`, '---\ntype: note\ntitle: Alheia\n---\n\nnão é do archlens\n']]));
  const { conn, out } = finish(w, res);
  assert.equal(out.state, 'partial');
  assert.deepEqual(out.conflicts, [taken]);
  assert.throws(() => finishConvertToMcp(w.loc), e => e.code === 'E_STORE_CONVERT');
  assert.equal(readFileSync(join(w.dir, 'archlens.json'), 'utf8'), before); // nothing local changed
  assert.ok(existsSync(join(w.dir, 'model.json')));
  // --resume does not force the page; --undo takes down only what the convert created.
  assert.throws(() => conn.remote.resume(), e => e.code === 'E_STORE_APPLY' && e.message.includes(taken));
  const undone = conn.remote.receipts([w.gbrain.run(conn.remote.undo().request)]);
  assert.equal(undone.state, 'undone');
  assert.match(w.gbrain.content(taken), /não é do archlens/);
  assert.equal(w.gbrain.page(slugs.find(s => s !== taken && s !== 'archlens/changelog')).deleted_at !== null, true);
});

test('a convert to MCP is refused without a checked session, and ids are checked before any request', () => {
  const w = convWorld('loja-online');
  rmSync(join(w.dir, '.archlens', 'session.json'));
  assert.throws(() => convertToGbrain(w.loc, w.store), e => e.code === 'E_STORE_GBRAIN_SURFACE');
  const v = convWorld('loja-online');
  const model = JSON.parse(readFileSync(join(v.dir, 'model.json'), 'utf8'));
  model.elements[0].id = 'Loja Online';
  writeFileSync(join(v.dir, 'model.json'), JSON.stringify(model, null, 2));
  assert.throws(() => convertToGbrain(v.loc, v.store), e => e.code === 'E_STORE_GBRAIN_SLUG');
  assert.equal(existsSync(join(v.dir, '.archlens', 'applies')), false);
});

test('converting an MCP base to json or markdown without a mirror fails with E_REMOTE_STALE', () => {
  const w = world();
  assert.throws(() => convertFolder(resolveBase(w.dir), 'json'), e => e.code === 'E_REMOTE_STALE');
});

test('human text and notes/removidos of a vault survive markdown -> gbrain (MCP) -> markdown byte for byte', () => {
  const w = convWorld('loja-online-vault');
  const page = 'business-actor/cliente.md';
  const human = '\n## Minhas observações\n\nO cliente ligou ontem.\n';
  writeFileSync(join(w.dir, page), readFileSync(join(w.dir, page), 'utf8').replace(/\n*$/, '\n') + human);
  const kept = '# Antigo ("antigo")\n\n## Antigo ("antigo"): elemento removido da base; texto escrito em x.md\n\nTexto de quem removeu.\n';
  mkdirSync(join(w.dir, 'notes', 'removidos', 'business-actor'), { recursive: true });
  writeFileSync(join(w.dir, 'notes', 'removidos', 'business-actor', 'antigo.md'), kept);
  const pageBefore = readFileSync(join(w.dir, page), 'utf8');
  const res = convertToGbrain(w.loc, w.store);
  assert.deepEqual(res.dropped, []);
  const { out } = finish(w, res);
  assert.equal(out.state, 'committed');
  assert.match(w.gbrain.content('archlens/business-actor/cliente'), /O cliente ligou ontem\./);
  assert.match(w.gbrain.content('archlens/notes/removidos/business-actor/antigo'), /Texto de quem removeu\./);
  finishConvertToMcp(w.loc);
  convertFromGbrain(resolveBase(w.dir), 'markdown');
  assert.equal(readFileSync(join(w.dir, page), 'utf8'), pageBefore);
  assert.equal(readFileSync(join(w.dir, 'notes', 'removidos', 'business-actor', 'antigo.md'), 'utf8'), kept);
});

test('the CLI converts to the gbrain in MCP mode, completes with --receipts and converts back', () => {
  const w = convWorld('loja-online');
  const cwd = join(w.dir, '..');
  const r = cli(['store', 'convert', 'architecture', '--to', 'gbrain', '--mode', 'mcp', '--server', 'gbrain'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /apply-request\.json/);
  assert.match(r.stdout, /archlens apply architecture --receipts/);
  assert.equal(JSON.parse(readFileSync(join(w.dir, 'archlens.json'), 'utf8')).store, undefined); // still local
  const req = JSON.parse(readFileSync(join(w.dir, '.archlens', 'remote', 'apply-request.json'), 'utf8'));
  writeFileSync(join(cwd, 'recibos.json'), JSON.stringify(w.gbrain.run(req)));
  const done = cli(['apply', 'architecture', '--receipts', 'recibos.json'], cwd);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /agora usa o conector gbrain/);
  assert.deepEqual(JSON.parse(readFileSync(join(w.dir, 'archlens.json'), 'utf8')).store, { ...MCP, prefix: 'archlens' });
  assert.ok(existsSync(join(cwd, 'ARCHITECTURE.md')));
  const back = cli(['store', 'convert', 'architecture', '--to', 'json'], cwd);
  assert.equal(back.status, 0, back.stderr);
  assert.ok(existsSync(join(w.dir, 'model.json')));
  assert.equal(cli(['validate', 'architecture'], cwd).status, 0);
});

test('the CLI reports a partial convert and how to --resume or --undo; the session check works on a local base', () => {
  const w = convWorld('loja-online');
  rmSync(join(w.dir, '.archlens', 'session.json'));
  const cwd = join(w.dir, '..');
  let r = cli(['store', 'convert', 'architecture', '--to', 'gbrain', '--mode', 'mcp', '--server', 'gbrain'], cwd);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_GBRAIN_SURFACE/);
  assert.match(r.stderr, /remote architecture check --server gbrain/);
  r = cli(['remote', 'architecture', 'check', '--server', 'gbrain'], cwd);
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(cwd, 'sessao.json'), JSON.stringify(w.gbrain.run(JSON.parse(readFileSync(join(w.dir, '.archlens', 'remote', 'tools-request.json'), 'utf8')))));
  r = cli(['remote', 'architecture', 'check', '--server', 'gbrain', '--ingest', 'sessao.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  r = cli(['store', 'convert', 'architecture', '--to', 'gbrain', '--mode', 'mcp', '--server', 'gbrain'], cwd);
  assert.equal(r.status, 0, r.stderr);
  const req = JSON.parse(readFileSync(join(w.dir, '.archlens', 'remote', 'apply-request.json'), 'utf8'));
  w.gbrain.failAfter(3);
  writeFileSync(join(cwd, 'recibos.json'), JSON.stringify(w.gbrain.run(req)));
  r = cli(['apply', 'architecture', '--receipts', 'recibos.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /parcial/);
  assert.match(r.stdout, /--resume/);
  assert.match(r.stdout, /--undo/);
  assert.ok(existsSync(join(w.dir, 'model.json'))); // nothing local changed
  w.gbrain.failAfter(Infinity);
  r = cli(['apply', 'architecture', '--resume'], cwd);
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(cwd, 'recibos-2.json'), JSON.stringify(w.gbrain.run(JSON.parse(readFileSync(join(w.dir, '.archlens', 'remote', 'apply-request.json'), 'utf8')))));
  r = cli(['apply', 'architecture', '--receipts', 'recibos-2.json'], cwd);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /agora usa o conector gbrain/);
  assert.equal(existsSync(join(w.dir, 'model.json')), false);
});

test('a finished convert that came back to json is not in flight: converting again works and --receipts ignores the old journal', () => {
  const w = convWorld('loja-online');
  const cwd = join(w.dir, '..');
  finish(w, convertToGbrain(w.loc, w.store));
  finishConvertToMcp(w.loc);
  convertFromGbrain(resolveBase(w.dir), 'json');
  assert.equal(pendingConvertToMcp(resolveBase(w.dir)), null);
  const r = cli(['apply', 'architecture', '--receipts', 'nada.json'], cwd);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /mcp/);
  // The session was dropped with the mirror: check again, then convert onto another prefix.
  const gbrain = w.gbrain;
  const checker = gbrainMcpConnector(w.loc, { ...MCP, prefix: 'segundo' });
  checker.remote.checkIngest([gbrain.run(checker.remote.check())]);
  const again = convertToGbrain(resolveBase(w.dir), { ...MCP, prefix: 'segundo' });
  assert.ok(again.request);
});
