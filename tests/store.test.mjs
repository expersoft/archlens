import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFolder, saveFolder } from '../scripts/lib/store/folder.mjs';

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
