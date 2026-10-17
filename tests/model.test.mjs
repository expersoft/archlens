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

import { canonicalRel } from '../scripts/lib/model.mjs';
import { addSources } from '../scripts/lib/sources.mjs';

const findRaw = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const shopWith = mut => { const r = raw(); mut(r); return r; };

test('normalizeModel reads status, aliases and sources, accepting the legacy source string', () => {
  const m = normalizeModel(shopWith(r => {
    Object.assign(findRaw(r, 'loja.api'), { status: 'deprecated', statusReason: 'migração', aliases: ['orders-service'],
      sources: [{ kind: 'repo', ref: 'github.com/x/orders@a1b2c3d', path: 'compose.yml' }] });
    findRaw(r, 'loja.web').source = 'a vitrine é em Next.js';
  }));
  const api = m.elements.get('loja.api');
  assert.equal(api.status, 'deprecated');
  assert.equal(api.statusReason, 'migração');
  assert.deepEqual(api.aliases, ['orders-service']);
  assert.equal(api.sources[0].kind, 'repo');
  assert.deepEqual(m.elements.get('loja.web').sources, [{ kind: 'prompt', excerpt: 'a vitrine é em Next.js' }]);
  assert.equal(m.elements.get('cliente').status, 'active');
  assert.deepEqual(m.elements.get('cliente').sources, []);
  assert.equal(m.relationships[0].status, 'active');
});

test('validate flags invalid status, sources and alias conflicts', () => {
  const codes = validateModel(shopWith(r => {
    findRaw(r, 'loja.api').status = 'morto';
    findRaw(r, 'loja.web').sources = [{ kind: 'git', ref: 'x' }, { kind: 'repo' }];
    findRaw(r, 'loja.db').aliases = ['Loja API']; // aliasKey("Loja API") === aliasKey("loja.api")
    r.model.relationships[0].status = 'zumbi';
  })).errors.map(e => e.code);
  assert.equal(codes.filter(c => c === 'E_STATUS').length, 2);
  assert.equal(codes.filter(c => c === 'E_SOURCE').length, 2);
  assert.ok(codes.includes('E_ALIAS_CONFLICT'));
});

test('validate warns when something active depends on a retired element', () => {
  const w = validateModel(shopWith(r => { findRaw(r, 'k8s').status = 'retired'; })).warnings.filter(x => x.code === 'W_RETIRED_DEPENDENCY');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /loja\.api/);
});

test('canonicalRel reads uses as inverted serving, or access to passive targets', () => {
  const types = { web: 'application-component', api: 'application-component', db: 'data-object' };
  const typeOf = id => types[id];
  assert.deepEqual(canonicalRel({ from: 'web', to: 'api', type: 'uses' }, typeOf), { type: 'serving', from: 'api', to: 'web' });
  assert.deepEqual(canonicalRel({ from: 'api', to: 'db' }, typeOf), { type: 'access', from: 'api', to: 'db', accessType: 'readwrite' });
  assert.deepEqual(canonicalRel({ from: 'api', to: 'web', type: 'archimate:serving' }, typeOf), { type: 'serving', from: 'api', to: 'web' });
  assert.equal(canonicalRel({ from: 'a', to: 'b', type: 'banana' }, () => undefined).error, 'E_REL_TYPE');
});

test('addSources deduplicates by kind+ref+path and migrates a legacy source string', () => {
  const el = { id: 'x', source: 'trecho antigo' };
  assert.equal(addSources(el, [{ kind: 'repo', ref: 'r@1', path: 'a.yml' }, { kind: 'repo', ref: 'r@1', path: 'a.yml', date: '2026-10-01' }]), 1);
  assert.equal(el.source, undefined);
  assert.deepEqual(el.sources, [{ kind: 'prompt', excerpt: 'trecho antigo' }, { kind: 'repo', ref: 'r@1', path: 'a.yml' }]);
  assert.equal(addSources(el, []), 0);
});

test('validate reports a saved view whose status is not a list of known statuses', () => {
  const r = raw();
  r.views.push({ key: 's1', notation: 'c4', level: 'landscape', status: 'planned' });
  r.views.push({ key: 's2', notation: 'c4', level: 'landscape', status: ['vivo'] });
  r.views.push({ key: 's3', notation: 'c4', level: 'landscape', status: ['planned', 'active'] });
  const { errors } = validateModel(r);
  assert.deepEqual(errors.filter(e => e.code === 'E_VIEW_STATUS').map(e => e.path), ['views[2].status', 'views[3].status']);
});

test('aliases that are not a list are a schema error, not a crash', () => {
  const r = raw();
  r.model.elements[0].aliases = 'cliente final';
  let res;
  assert.doesNotThrow(() => { res = validateModel(r); });
  const e = res.errors.find(x => x.code === 'E_SCHEMA');
  assert.equal(e?.path, 'model.elements[0].aliases');
  assert.match(e.hint, /lista/);
  assert.deepEqual(res.model.elements.get('cliente').aliases, []);
});

test('draft is a valid status for elements and relationships', () => {
  const r = shopWith(r => { findRaw(r, 'loja.api').status = 'draft'; r.model.relationships[0].status = 'draft'; });
  assert.deepEqual(validateModel(r).errors, []);
  assert.equal(normalizeModel(r).elements.get('loja.api').status, 'draft');
});

const platforms = () => JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));

test('group: direct membership, inheritance down the hierarchy, groupings have none', () => {
  const m = normalizeModel(platforms());
  assert.equal(m.elements.get('autorizador').group, 'plat-aut');
  assert.equal(m.elements.get('autorizador').groupId, 'plat-aut');
  assert.equal(m.elements.get('autorizador.api').group, null);
  assert.equal(m.elements.get('autorizador.api').groupId, 'plat-aut', 'containers inherit');
  assert.equal(m.elements.get('pg').groupId, null);
  assert.equal(m.elements.get('plat-aut').groupId, null);
  assert.deepEqual(validateModel(platforms()).errors, []);
});

test('a container may override the inherited group', () => {
  const r = platforms();
  r.model.elements.find(e => e.id === 'autorizador').children[1].group = 'plat-cred';
  const m = normalizeModel(r);
  assert.equal(m.elements.get('autorizador.regras').groupId, 'plat-cred');
});

test('group errors: unknown or non-grouping target, nested groupings, relationships with a grouping', () => {
  const codes = r => validateModel(r).errors.map(e => e.code);
  const a = platforms(); a.model.elements.find(e => e.id === 'pg').group = 'nada';
  assert.ok(codes(a).includes('E_GROUP_REF'));
  const b = platforms(); b.model.elements.find(e => e.id === 'pg').group = 'motor';
  assert.ok(codes(b).includes('E_GROUP_REF'));
  const c = platforms(); c.model.elements.find(e => e.id === 'plat-cred').group = 'plat-aut';
  assert.ok(codes(c).includes('E_GROUP_NESTED'));
  const d = platforms(); d.model.relationships.push({ from: 'motor', to: 'plat-aut', type: 'archimate:association' });
  assert.ok(codes(d).includes('E_GROUP_REL'));
});

test('an empty grouping is a warning, and groupings are never reported as orphans', () => {
  const r = platforms();
  r.model.elements.push({ id: 'plat-vazia', type: 'grouping', name: 'Vazia' });
  const { warnings } = validateModel(r);
  assert.ok(warnings.some(w => w.code === 'W_GROUP_EMPTY' && /plat-vazia/.test(w.message)));
  assert.ok(!warnings.some(w => w.code === 'W_ORPHAN' && /plat-(aut|cred|vazia)/.test(w.message)));
});

test('schemas accept "group" on elements', async () => {
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  const s = buildSchemas();
  assert.deepEqual(s.model.$defs.element.properties.group, { type: ['string', 'null'] });
});

// A base where the credit systems sit inside their grouping (nested, or with "parent") instead of using "group".
const nestedInGrouping = form => {
  const r = platforms();
  const cred = r.model.elements.find(e => e.id === 'plat-cred');
  const take = id => { const i = r.model.elements.findIndex(e => e.id === id); return r.model.elements.splice(i, 1)[0]; };
  const motor = take('motor'), limites = take('limites');
  delete motor.group; delete limites.group;
  if (form === 'nested') cred.children = [motor, limites];
  else { motor.parent = 'plat-cred'; limites.parent = 'plat-cred'; r.model.elements.push(motor, limites); }
  return r;
};

for (const form of ['nested', 'parent']) {
  test(`elements under a grouping (${form}) are treated as its members, with W_GROUP_CHILD`, () => {
    const r = nestedInGrouping(form);
    const m = normalizeModel(r);
    assert.equal(m.elements.get('motor').parent, null);
    assert.equal(m.elements.get('motor').group, 'plat-cred');
    assert.equal(m.elements.get('limites').groupId, 'plat-cred');
    const { errors, warnings } = validateModel(r);
    assert.deepEqual(errors, []);
    assert.ok(warnings.some(w => w.code === 'W_GROUP_CHILD' && /motor/.test(w.message) && /plat-cred/.test(w.message)));
  });
}

test('a grouping nested in another grouping is still E_GROUP_NESTED', () => {
  const r = platforms();
  const cred = r.model.elements.find(e => e.id === 'plat-cred');
  r.model.elements.splice(r.model.elements.indexOf(cred), 1);
  r.model.elements.find(e => e.id === 'plat-aut').children = [cred];
  assert.ok(validateModel(r).errors.some(e => e.code === 'E_GROUP_NESTED'));
});

test('"group": null means no group (not a schema error)', async () => {
  const r = platforms();
  r.model.elements.find(e => e.id === 'pg').group = null;
  assert.deepEqual(validateModel(r).errors, []);
  assert.equal(normalizeModel(r).elements.get('pg').groupId, null);
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  assert.deepEqual(buildSchemas().delta.$defs.element.properties.group, { type: ['string', 'null'] });
});
