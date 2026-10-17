import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateRaw } from '../scripts/lib/migrate.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { asBase } from './helpers.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const TODAY = { today: '2026-10-17' };

test('migrateRaw converts a 1.x base, checks equivalence and records the round', () => {
  const res = migrateRaw(shop(), TODAY);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.diffs, []);
  const { changelog, ...rest } = res.raw;
  assert.deepEqual(rest, asBase(shop()));
  assert.equal(changelog.length, 1);
  assert.equal(changelog[0].summary, 'migração para o formato 2.0');
  assert.ok(changelog[0].decisions.some(d => /5 relação\(ões\) "uses"/.test(d)), changelog[0].decisions.join('\n'));
  assert.deepEqual(validateModel(res.raw).errors, []);
});

test('relationship ids that change (accesses to a 1.x database) are rewritten in dynamic steps', () => {
  const r = shop();
  r.model.relationships.push({ id: 'leitura', from: 'loja.web', to: 'loja.db', type: 'archimate:access', accessType: 'read' });
  r.model.relationships.push({ from: 'loja.api.catalogo', to: 'loja.db', type: 'archimate:access' });
  r.views.push({ key: 'din', notation: 'c4', level: 'dynamic', scope: 'loja', steps: [{ rel: 'loja.api.catalogo-access-loja.db' }, { rel: 'leitura' }] });
  const res = migrateRaw(r, TODAY);
  assert.deepEqual(res.diffs, []);
  assert.equal(res.idMap.get('loja.api.catalogo-access-loja.db'), 'loja.db-serving-loja.api.catalogo');
  assert.deepEqual(res.raw.views.find(v => v.key === 'din').steps.map(s => s.rel), ['loja.db-serving-loja.api.catalogo', 'leitura']);
  assert.deepEqual(res.raw.model.relationships.find(x => x.id === 'leitura').properties, { accessType: 'read' });
});

test('an invalid 1.x base is reported with its 1.x errors and nothing is converted', () => {
  const r = shop();
  r.model.relationships.push({ from: 'loja.api', to: 'nada', type: 'uses' });
  const res = migrateRaw(r, TODAY);
  assert.ok(res.errors.some(e => e.code === 'E_UNKNOWN_REF'));
  assert.equal(res.raw, null);
});
