import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { ELEMENT_TYPES, resolveType } from '../scripts/lib/registry.mjs';

const raw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));

test('registry covers ArchiMate 3.2 core layers', () => {
  for (const t of ['business-actor', 'business-process', 'product', 'application-component',
    'application-service', 'data-object', 'node', 'system-software', 'artifact', 'capability',
    'value-stream', 'goal', 'requirement', 'work-package', 'equipment', 'grouping', 'location']) {
    assert.ok(ELEMENT_TYPES[t], `missing ${t}`);
  }
  assert.equal(ELEMENT_TYPES['business-process'].layer, 'business');
  assert.equal(ELEMENT_TYPES['data-object'].aspect, 'passive');
});

test('resolveType maps c4 types onto the ArchiMate metamodel', () => {
  assert.deepEqual(resolveType('c4:person', {}), { type: 'business-actor', c4Kind: 'person' });
  assert.deepEqual(resolveType('c4:container', {}), { type: 'application-component', c4Kind: 'container' });
  assert.deepEqual(resolveType('c4:container', { tags: ['database'] }), { type: 'data-object', c4Kind: 'container' });
  assert.deepEqual(resolveType('archimate:node', {}), { type: 'node', c4Kind: null });
  assert.deepEqual(resolveType('node', {}), { type: 'node', c4Kind: null });
  assert.deepEqual(resolveType('c4:container', { archimate: 'system-software' }), { type: 'system-software', c4Kind: 'container' });
  assert.equal(resolveType('c4:banana', {}).error, 'E_UNKNOWN_TYPE');
});

test('normalizeModel flattens children and keeps parent links', () => {
  const m = normalizeModel(raw());
  const checkout = m.elements.get('loja.api.checkout');
  assert.equal(checkout.parent, 'loja.api');
  assert.equal(checkout.c4.kind, 'component');
  assert.equal(m.elements.get('loja.api').parent, 'loja');
  assert.equal(m.elements.get('loja.db').type, 'data-object');
  assert.equal(m.elements.get('pagamentos').c4.external, true);
  assert.equal(m.elements.get('venda').layer, 'business');
});

test('c4 "uses" becomes reversed serving, or access when the target is passive', () => {
  const m = normalizeModel(raw());
  const web = m.relationships.find(r => r.c4 && r.c4.from === 'cliente');
  assert.equal(web.type, 'serving');
  assert.equal(web.from, 'loja.web');
  assert.equal(web.to, 'cliente');
  assert.equal(web.technology, 'HTTPS');
  const db = m.relationships.find(r => r.to === 'loja.db');
  assert.equal(db.type, 'access');
  assert.equal(db.from, 'loja.api.checkout');
  assert.deepEqual(db.c4, { from: 'loja.api.checkout', to: 'loja.db' });
  assert.ok(m.relationships.every(r => r.id), 'every relationship gets an id');
});

test('valid model has no errors', () => {
  const { errors } = validateModel(raw());
  assert.deepEqual(errors, []);
});

test('validation reports stable codes', () => {
  const r = raw();
  r.model.elements.push({ id: 'cliente', type: 'c4:person', name: 'dup' });
  r.model.elements.push({ id: 'x', type: 'c4:banana', name: 'x' });
  r.model.elements.push({ id: 'sys2', type: 'c4:softwareSystem', name: 's', children: [{ id: 'bad', type: 'c4:component', name: 'b' }] });
  r.model.relationships.push({ from: 'loja.api', to: 'nope', type: 'uses' });
  r.model.relationships.push({ from: 'loja.api', to: 'k8s', type: 'archimate:access' });
  r.model.relationships.push({ from: 'proc-checkout', to: 'k8s', type: 'archimate:serving' });
  const { errors, warnings } = validateModel(r);
  const codes = errors.map(e => e.code);
  for (const c of ['E_DUPLICATE_ID', 'E_UNKNOWN_TYPE', 'E_C4_HIERARCHY', 'E_UNKNOWN_REF', 'E_REL_INVALID']) {
    assert.ok(codes.includes(c), `expected ${c} in ${codes}`);
  }
  assert.ok(warnings.some(w => w.code === 'W_REL_DIRECTION'));
  assert.ok(errors.every(e => e.message && e.hint), 'errors carry message + hint');
});
