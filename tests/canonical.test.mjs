import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalType, canonicalElements, canonicalRelationship, sortParentsFirst, toCanonical, FORMAT, isCanonicalFormat,
} from '../scripts/lib/canonical.mjs';
import { normalizeLegacy, legacyKindOf } from '../scripts/lib/canonical-legacy.mjs';
import { asBase } from './helpers.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));

test('canonicalType maps the free vocabulary onto ArchiMate types and C4 kinds', () => {
  assert.deepEqual(canonicalType('c4:person'), { type: 'business-actor', c4Kind: 'person' });
  for (const k of ['softwareSystem', 'container', 'component']) {
    assert.deepEqual(canonicalType(`c4:${k}`), { type: 'application-component', c4Kind: k });
  }
  assert.deepEqual(canonicalType('c4:deploymentNode'), { type: 'node', c4Kind: 'deploymentNode' });
  assert.deepEqual(canonicalType('c4:infrastructureNode'), { type: 'node', c4Kind: 'infrastructureNode' });
  assert.deepEqual(canonicalType('archimate:node'), { type: 'node', c4Kind: null });
  assert.deepEqual(canonicalType('data-object'), { type: 'data-object', c4Kind: null });
  assert.deepEqual(canonicalType('c4:container', { archimate: 'archimate:system-software' }), { type: 'system-software', c4Kind: 'container' });
  assert.equal(canonicalType('c4:banana').error, 'E_UNKNOWN_TYPE');
  assert.equal(canonicalType('c4:container', { archimate: 'banana' }).error, 'E_UNKNOWN_TYPE');
});

test('a database container stays an application-component with its tag', () => {
  const lookup = id => (id === 'sys' ? { type: 'application-component', kind: 'softwareSystem' } : null);
  const { elements, databases } = canonicalElements([{ id: 'db', type: 'c4:container', name: 'DB', tags: ['database'], parent: 'sys' }], { lookup });
  assert.deepEqual(elements, [{ id: 'db', type: 'application-component', name: 'DB', tags: ['database'], parent: 'sys', c4: { kind: 'container' } }]);
  assert.deepEqual([...databases], ['db']);
});

test('children become a flat list with "parent", parents first, and kinds are inferred by depth', () => {
  const { elements, inferred } = canonicalElements([
    { id: 'c', type: 'application-component', name: 'C', parent: 'b' },
    { id: 'a', type: 'application-component', name: 'A', children: [{ id: 'b', type: 'application-component', name: 'B' }] },
    { id: 'p', type: 'business-role', name: 'P' },
  ]);
  assert.deepEqual(elements.map(e => [e.id, e.parent ?? null, e.c4?.kind ?? null]),
    [['a', null, 'softwareSystem'], ['b', 'a', 'container'], ['c', 'b', 'component'], ['p', null, 'person']]);
  assert.deepEqual([...inferred].sort(), ['a', 'b', 'c', 'p']);
  assert.ok(elements.every(e => !('children' in e)));
});

test('kinds are not inferred for elements the base already has, and a grouping parent counts as no parent', () => {
  const lookup = id => ({ 'loja.api': { type: 'application-component', kind: 'container' }, plat: { type: 'grouping', kind: null } })[id] ?? null;
  const { elements, inferred } = canonicalElements([
    { id: 'loja.api', type: 'application-component', technology: 'Kotlin' },
    { id: 'motor', type: 'application-component', name: 'Motor', parent: 'plat' },
  ], { lookup });
  assert.equal(elements[0].c4, undefined);
  assert.equal(elements[1].c4.kind, 'softwareSystem');
  assert.deepEqual([...inferred], ['motor']);
});

test('canonicalRelationship reads uses as reversed serving, or access to a passive target', () => {
  const types = { web: 'application-component', api: 'application-component', dados: 'data-object' };
  const typeOf = id => types[id];
  assert.deepEqual(canonicalRelationship({ from: 'web', to: 'api', type: 'uses', description: 'chama' }, typeOf),
    { from: 'api', to: 'web', type: 'serving', description: 'chama' });
  assert.deepEqual(canonicalRelationship({ from: 'api', to: 'dados' }, typeOf), { from: 'api', to: 'dados', type: 'access', accessType: 'readwrite' });
  assert.deepEqual(canonicalRelationship({ from: 'api', to: 'web', type: 'c4:uses', accessType: 'read' }, typeOf),
    { from: 'web', to: 'api', type: 'serving', properties: { accessType: 'read' } });
  assert.deepEqual(canonicalRelationship({ from: 'a', to: 'b', type: 'archimate:flow' }, typeOf), { from: 'a', to: 'b', type: 'flow' });
  assert.equal(canonicalRelationship({ from: 'a', to: 'b', type: 'banana' }, typeOf), null);
});

test('toCanonical turns a 1.x base into 2.0: flat, ArchiMate types, c4 kinds, no uses; it is idempotent', () => {
  const { raw, report, databases } = toCanonical(shop());
  assert.equal(raw.archlens, FORMAT);
  assert.ok(isCanonicalFormat(raw.archlens) && !isCanonicalFormat('1.0') && !isCanonicalFormat(undefined));
  const el = id => raw.model.elements.find(e => e.id === id);
  assert.deepEqual(el('loja.api.checkout'), { id: 'loja.api.checkout', type: 'application-component', name: 'Checkout', parent: 'loja.api', c4: { kind: 'component' } });
  assert.equal(el('loja.db').type, 'application-component');
  assert.deepEqual([...databases], ['loja.db']);
  assert.equal(el('pagamentos').external, true);
  assert.ok(raw.model.relationships.every(r => r.type !== 'uses' && !String(r.type).includes(':')));
  assert.deepEqual(raw.model.relationships.find(r => r.from === 'loja.db'),
    { from: 'loja.db', to: 'loja.api.checkout', type: 'serving', description: 'Grava pedido', technology: 'JDBC' });
  assert.deepEqual(report, { types: 14, kinds: 0, databases: 1, uses: 5 });
  assert.deepEqual(toCanonical(raw).raw, raw);
  assert.deepEqual(asBase(shop()), raw);
});

test('an explicit access to a 1.x database becomes serving from it, keeping read/write in properties', () => {
  const r = shop();
  r.model.relationships.push({ from: 'loja.web', to: 'loja.db', type: 'archimate:access', accessType: 'read' });
  assert.deepEqual(toCanonical(r).raw.model.relationships.at(-1), { from: 'loja.db', to: 'loja.web', type: 'serving', properties: { accessType: 'read' } });
});

test('sortParentsFirst moves parents ahead of their children and keeps the rest in order', () => {
  const list = [{ id: 'c', parent: 'b' }, { id: 'x' }, { id: 'b', parent: 'a' }, { id: 'a' }];
  assert.deepEqual(sortParentsFirst(list).map(e => e.id), ['a', 'b', 'c', 'x']);
});

test('the frozen 1.x reader still reads a 1.x base as archlens 0.3 did', () => {
  const m = normalizeLegacy(shop());
  assert.equal(m.elements.get('loja.db').type, 'data-object');
  assert.equal(legacyKindOf(m, m.elements.get('loja.api.checkout')), 'component');
  assert.equal(m.relationships.find(r => r.to === 'loja.db').type, 'access');
  assert.deepEqual(m.issues.filter(i => i.level === 'error'), []);
});
