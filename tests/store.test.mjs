import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFolder, saveFolder } from '../scripts/lib/store/folder.mjs';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const tmp = () => mkdtempSync(join(tmpdir(), 'archlens-store-'));
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');

test('a folder round-trips the raw model and the notes', () => {
  const dir = tmp();
  const raw = { ...shop(), extra: { team: 'arq' }, changelog: [] };
  saveFolder(dir, raw, { notes: { overview: 'Propósito.\n\nDecisões.', notes: 'Riscos.' } });
  for (const f of ['archlens.json', 'model.json', 'views.json', 'changelog.json', 'notes/overview.md', 'notes/notes.md']) {
    assert.ok(existsSync(join(dir, f)), f);
  }
  assert.ok(!existsSync(join(dir, 'notes/assumptions.md')));
  const back = loadFolder(dir);
  assert.deepEqual(back.raw, raw);
  assert.deepEqual(back.notes, { overview: 'Propósito.\n\nDecisões.', notes: 'Riscos.' });
  assert.equal(back.layout, undefined);
});

test('the reloaded raw serializes exactly like the original (plan hashes survive)', () => {
  const dir = tmp();
  saveFolder(dir, shop());
  assert.equal(JSON.stringify(loadFolder(dir).raw), JSON.stringify(shop()));
});

test('saving the same raw twice writes the same bytes, in the stable format', () => {
  const dir = tmp();
  saveFolder(dir, shop());
  const files = ['archlens.json', 'model.json', 'views.json'];
  const first = files.map(f => read(dir, f));
  const { raw, notes, origins, layout } = loadFolder(dir);
  saveFolder(dir, raw, { notes, origins, layout });
  assert.deepEqual(files.map(f => read(dir, f)), first);
  assert.equal(read(dir, 'model.json'), JSON.stringify(shop().model, null, 2) + '\n');
  assert.ok(!existsSync(join(dir, 'changelog.json')), 'no changelog key, no changelog file');
});

const splitBase = () => {
  const dir = tmp();
  mkdirSync(join(dir, 'model'));
  writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '1.0', name: 'Split', layout: { model: 'model/' } }));
  writeFileSync(join(dir, 'model/b-pag.json'), JSON.stringify({
    elements: [{ id: 'pag', type: 'c4:softwareSystem', name: 'Pagamentos', children: [{ id: 'pag.api', type: 'c4:container', name: 'API Pag' }] }],
    relationships: [],
  }));
  writeFileSync(join(dir, 'model/a-loja.json'), JSON.stringify({
    elements: [{ id: 'loja', type: 'c4:softwareSystem', name: 'Loja' }],
    relationships: [{ from: 'loja', to: 'pag', type: 'uses' }],
  }));
  return dir;
};

test('model/*.json files are joined in name order and remember where each item came from', () => {
  const { raw, origins, layout } = loadFolder(splitBase());
  assert.deepEqual(raw.model.elements.map(e => e.id), ['loja', 'pag']);
  assert.equal(raw.model.relationships.length, 1);
  assert.equal(origins.elements.get('pag'), 'model/b-pag.json');
  assert.equal([...origins.relationships.values()][0], 'model/a-loja.json');
  assert.deepEqual(layout, { model: 'model/' });
  assert.ok(!('layout' in raw));
});

test('saving a split model: new items next to their parent, relations with their source, the rest in the default file', () => {
  const dir = splitBase();
  const { raw, origins, notes, layout } = loadFolder(dir);
  raw.model.elements.push({ id: 'pag.worker', type: 'c4:container', name: 'Worker', parent: 'pag' });
  raw.model.elements.find(e => e.id === 'pag').children[0].children = [{ id: 'pag.api.auth', type: 'c4:component', name: 'Auth' }];
  raw.model.elements.push({ id: 'erp', type: 'c4:softwareSystem', name: 'ERP' });
  raw.model.relationships.push({ from: 'pag.api', to: 'erp', type: 'uses' });
  raw.model.elements = raw.model.elements.filter(e => e.id !== 'loja');
  raw.model.relationships = raw.model.relationships.filter(r => r.from !== 'loja');
  saveFolder(dir, raw, { notes, origins, layout });
  const file = f => JSON.parse(read(dir, f));
  assert.deepEqual(file('model/b-pag.json').elements.map(e => e.id), ['pag', 'pag.worker']);
  assert.equal(file('model/b-pag.json').elements[0].children[0].children[0].id, 'pag.api.auth');
  assert.deepEqual(file('model/b-pag.json').relationships, [{ from: 'pag.api', to: 'erp', type: 'uses' }]);
  assert.deepEqual(file('model/geral.json').elements.map(e => e.id), ['erp']);
  assert.deepEqual(file('model/a-loja.json'), { elements: [], relationships: [] });
  assert.deepEqual(file('archlens.json').layout, { model: 'model/' });
});

test('the same element id in two model files is refused', () => {
  const dir = splitBase();
  writeFileSync(join(dir, 'model/c-dup.json'), JSON.stringify({ elements: [{ id: 'pag.api', type: 'c4:container' }], relationships: [] }));
  assert.throws(() => loadFolder(dir), e => e.code === 'E_STORE_DUP_ID' && /model\/b-pag\.json/.test(e.message) && /model\/c-dup\.json/.test(e.message));
});

test('invalid JSON names the file; an external "store" is refused for now; no manifest is not a base', () => {
  const dir = tmp();
  saveFolder(dir, shop());
  writeFileSync(join(dir, 'views.json'), '[{');
  assert.throws(() => loadFolder(dir), e => e.code === 'E_STORE_JSON' && /views\.json/.test(e.message));
  const d2 = tmp();
  saveFolder(d2, shop());
  writeFileSync(join(d2, 'archlens.json'), JSON.stringify({ archlens: '1.0', name: 'x', store: { kind: 's3' } }));
  assert.throws(() => loadFolder(d2), e => e.code === 'E_STORE_UNSUPPORTED');
  assert.throws(() => loadFolder(tmp()), e => e.code === 'E_STORE_NOT_BASE');
});

const legacyMd = (raw, keeps = {}) => [
  '---', `name: ${raw.name}`, '---', '', `# ${raw.name}`, '',
  ...Object.entries(keeps).flatMap(([k, v]) => [`<!-- keep:${k} -->`, v, `<!-- /keep:${k} -->`, '']),
  '## Modelo canônico', '', '```archlens-json', JSON.stringify(raw, null, 2), '```', '',
].join('\n');

test('legacy: reads the block and the hand-written keep blocks (guide texts dropped); writing is refused', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop(), {
    overview: 'Visão à mão.', assumptions: '- p1', notes: '_Decisões, riscos e pendências._',
  }));
  const loc = resolveBase('ARCHITECTURE.md', { cwd: dir });
  assert.equal(loc.kind, 'legacy');
  assert.equal(loc.docPath, join(dir, 'ARCHITECTURE.md'));
  const store = openStore(loc);
  const { raw, notes } = store.load();
  assert.deepEqual(raw, shop());
  assert.deepEqual(notes, { overview: 'Visão à mão.', assumptions: '- p1' });
  assert.equal(store.writable, false);
  assert.throws(() => store.save(raw), e => e.code === 'E_STORE_LEGACY' && /archlens migrate/.test(e.message));
  assert.throws(() => store.assertWritable(), e => e.code === 'E_STORE_LEGACY');
});

test('legacy: a raw model .json is read-only too', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'm.json'), JSON.stringify(shop()));
  const store = openStore(resolveBase('m.json', { cwd: dir }));
  assert.equal(store.kind, 'legacy');
  assert.deepEqual(store.load().raw, shop());
  assert.deepEqual(store.load().notes, {});
});

test('resolveBase: folder, manifest, generated .md (source:), and the folder found from a subdirectory', () => {
  const dir = tmp();
  saveFolder(join(dir, 'architecture'), shop());
  writeFileSync(join(dir, 'ARCHITECTURE.md'), '---\nname: "Loja"\nsource: architecture/\n---\n# Loja\n');
  mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
  const base = join(dir, 'architecture');
  for (const [arg, cwd] of [['architecture', dir], ['architecture/archlens.json', dir], ['ARCHITECTURE.md', dir], [undefined, join(dir, 'src', 'deep')]]) {
    const loc = resolveBase(arg, { cwd });
    assert.equal(loc.kind, 'folder', String(arg));
    assert.equal(loc.path, base, String(arg));
    assert.equal(loc.docPath, join(dir, 'ARCHITECTURE.md'), String(arg));
    assert.equal(loc.exists, true);
  }
  assert.deepEqual(openStore(resolveBase('architecture', { cwd: dir })).load().raw, shop());
});

test('resolveBase: a hand-written .md is not a base, and the message says what to do', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'ARCHITECTURE.md'), '# Minha arquitetura\n\nTexto livre.\n');
  assert.throws(() => resolveBase('ARCHITECTURE.md', { cwd: dir }),
    e => e.code === 'E_STORE_NOT_BASE' && /texto livre/.test(e.message) && /merge/.test(e.message));
});

test('resolveBase: missing bases are created only when asked', () => {
  const dir = tmp();
  assert.throws(() => resolveBase(undefined, { cwd: dir }), e => e.code === 'E_STORE_NOT_FOUND');
  assert.throws(() => resolveBase('architecture', { cwd: dir }), e => e.code === 'E_STORE_NOT_FOUND');
  const viaMd = resolveBase('ARCHITECTURE.md', { cwd: dir, create: true });
  assert.deepEqual([viaMd.kind, viaMd.path, viaMd.exists, viaMd.docPath], ['folder', join(dir, 'architecture'), false, join(dir, 'ARCHITECTURE.md')]);
  assert.equal(openStore(viaMd).load().raw, null);
  assert.equal(resolveBase(undefined, { cwd: dir, create: true }).path, join(dir, 'architecture'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), '---\nsource: architecture/\n---\n');
  assert.throws(() => resolveBase('ARCHITECTURE.md', { cwd: dir }), e => e.code === 'E_STORE_NOT_FOUND');
});

test('resolveBase: an existing non-empty folder without manifest is never taken as a base', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'architecture'));
  writeFileSync(join(dir, 'architecture', 'leia-me.txt'), 'outra coisa');
  assert.throws(() => resolveBase('architecture', { cwd: dir, create: true }), e => e.code === 'E_STORE_NOT_BASE');
});

test('resolveBase: a generated .md with CRLF line endings still points to its folder', () => {
  const dir = tmp();
  saveFolder(join(dir, 'architecture'), shop());
  writeFileSync(join(dir, 'ARCHITECTURE.md'), '---\r\nname: "Loja"\r\nsource: architecture/\r\n---\r\n# Loja\r\n');
  const loc = resolveBase('ARCHITECTURE.md', { cwd: dir });
  assert.equal(loc.kind, 'folder');
  assert.equal(loc.path, join(dir, 'architecture'));
});

test('a layout that would write model files the folder never reads is refused (E_STORE_LAYOUT)', () => {
  const outside = splitBase();
  const manifest = JSON.parse(read(outside, 'archlens.json'));
  writeFileSync(join(outside, 'archlens.json'), JSON.stringify({ ...manifest, layout: { model: 'model/', defaultFile: 'outro/geral.json' } }));
  assert.throws(() => loadFolder(outside), e => e.code === 'E_STORE_LAYOUT');
  assert.throws(() => saveFolder(tmp(), shop(), { layout: { model: 'model/', defaultFile: 'outro/geral.json' } }), e => e.code === 'E_STORE_LAYOUT');
  for (const layout of [{ model: '../x/' }, { model: '/abs/' }, { model: 'model' }, { model: 'model/', defaultFile: 'model/sub/a.json' }]) {
    assert.throws(() => saveFolder(tmp(), shop(), { layout }), e => e.code === 'E_STORE_LAYOUT', JSON.stringify(layout));
  }
  const up = tmp();
  saveFolder(up, shop());
  writeFileSync(join(up, 'archlens.json'), JSON.stringify({ archlens: '1.0', name: 'x', layout: { model: '../x/' } }));
  assert.throws(() => loadFolder(up), e => e.code === 'E_STORE_LAYOUT');
});

test('a note file without a trailing newline is left untouched by save', () => {
  const dir = tmp();
  saveFolder(dir, shop());
  mkdirSync(join(dir, 'notes'));
  writeFileSync(join(dir, 'notes', 'notes.md'), 'Sem quebra no fim.');
  const { raw, notes, origins, layout } = loadFolder(dir);
  saveFolder(dir, raw, { notes, origins, layout });
  assert.equal(read(dir, 'notes/notes.md'), 'Sem quebra no fim.');
});
