import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';

const model = () => normalizeModel(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const ids = v => v.nodes.map(n => n.id).sort();
const edge = (v, a, b) => v.edges.find(e => e.from === a && e.to === b);

// ---------- C4 ----------

test('c4 landscape shows people and software systems only', () => {
  const v = resolveView(model(), { key: 'l', notation: 'c4', level: 'landscape' });
  assert.deepEqual(ids(v), ['cliente', 'loja', 'pagamentos']);
  assert.ok(edge(v, 'cliente', 'loja'));
  assert.ok(edge(v, 'loja', 'pagamentos'));
});

test('c4 context lifts relationships to the scoped system', () => {
  const v = resolveView(model(), { key: 'c', notation: 'c4', level: 'context', scope: 'loja' });
  assert.deepEqual(ids(v), ['cliente', 'loja', 'pagamentos']);
  const e = edge(v, 'cliente', 'loja');
  assert.equal(e.label, 'Compra');
  assert.equal(v.nodes.find(n => n.id === 'loja').isScope, true);
});

test('c4 container view opens the scope boundary and aggregates lifted edges', () => {
  const v = resolveView(model(), { key: 'k', notation: 'c4', level: 'container', scope: 'loja' });
  assert.deepEqual(ids(v), ['cliente', 'loja.api', 'loja.db', 'loja.web', 'pagamentos']);
  assert.deepEqual(v.boundaries.map(b => b.id), ['loja']);
  assert.equal(v.nodes.find(n => n.id === 'loja.api').boundary, 'loja');
  const e = edge(v, 'loja.web', 'loja.api');
  assert.equal(e.count, 2);
  assert.match(e.label, /Fecha pedido/);
  assert.match(e.label, /Lista produtos/);
  assert.ok(edge(v, 'loja.api', 'loja.db'));
  assert.ok(edge(v, 'loja.api', 'pagamentos'));
  assert.ok(!v.nodes.some(n => n.id === 'k8s'), 'pure ArchiMate elements stay out of C4 views');
});

test('c4 component view shows sibling containers and external systems', () => {
  const v = resolveView(model(), { key: 'p', notation: 'c4', level: 'component', scope: 'loja.api' });
  assert.deepEqual(ids(v), ['loja.api.catalogo', 'loja.api.checkout', 'loja.db', 'loja.web', 'pagamentos']);
  assert.ok(edge(v, 'loja.web', 'loja.api.checkout'));
  assert.ok(edge(v, 'loja.api.checkout', 'loja.db'));
});

test('c4 focus + depth cuts the view down to the neighbourhood', () => {
  const v = resolveView(model(), { key: 'f', notation: 'c4', level: 'container', scope: 'loja', focus: ['loja.db'], depth: 1 });
  assert.deepEqual(ids(v), ['loja.api', 'loja.db']);
  assert.equal(v.nodes.find(n => n.id === 'loja.db').isFocus, true);
});

test('c4 exclude by tag and id', () => {
  const v = resolveView(model(), { key: 'x', notation: 'c4', level: 'container', scope: 'loja', exclude: ['tag:database', 'cliente'] });
  assert.deepEqual(ids(v), ['loja.api', 'loja.web', 'pagamentos']);
});

test('c4 dynamic view numbers the steps', () => {
  const v = resolveView(model(), {
    key: 'd', notation: 'c4', level: 'dynamic', scope: 'loja',
    steps: [
      { from: 'cliente', to: 'loja.web', description: 'Clica em comprar' },
      { from: 'loja.web', to: 'loja.api.checkout' },
      { from: 'loja.api.checkout', to: 'pagamentos' },
    ],
  });
  assert.deepEqual(v.edges.map(e => e.step), [1, 2, 3]);
  assert.equal(v.edges[0].label, 'Clica em comprar');
  assert.equal(v.edges[1].to, 'loja.api', 'step endpoints are lifted to the view level');
});

// ---------- ArchiMate ----------

test('archimate layer viewpoint without anchor keeps only that layer', () => {
  const v = resolveView(model(), { key: 'b', notation: 'archimate', viewpoint: 'business' });
  assert.deepEqual(ids(v), ['cliente', 'proc-checkout', 'svc-pedido', 'venda']);
  assert.ok(v.edges.every(e => ids(v).includes(e.from) && ids(v).includes(e.to)));
});

test('archimate supporters walks product → business → application → technology', () => {
  const v = resolveView(model(), { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } });
  const got = ids(v);
  for (const id of ['venda', 'svc-pedido', 'proc-checkout', 'app-svc-checkout', 'loja.api.checkout', 'loja.api', 'k8s', 'pg', 'loja.db', 'pagamentos']) {
    assert.ok(got.includes(id), `missing ${id}`);
  }
  for (const id of ['loja.api.catalogo', 'cliente', 'loja.web']) {
    assert.ok(!got.includes(id), `should not include ${id}`);
  }
  assert.equal(v.nodes.find(n => n.id === 'venda').isAnchor, true);
  assert.equal(v.nodes.find(n => n.id === 'svc-pedido').distance, 1);
  assert.deepEqual(v.layers, ['business', 'application', 'technology']);
});

test('archimate dependents finds everything impacted by a component', () => {
  const v = resolveView(model(), { key: 'i', notation: 'archimate', viewpoint: 'layered', anchor: 'loja.api', traverse: { mode: 'dependents' } });
  const got = ids(v);
  for (const id of ['loja.api.checkout', 'app-svc-checkout', 'proc-checkout', 'svc-pedido', 'venda', 'loja.web', 'cliente']) {
    assert.ok(got.includes(id), `missing ${id}`);
  }
  assert.ok(!got.includes('k8s'));
});

test('archimate both mode tags roles and builds an impact matrix', () => {
  const v = resolveView(model(), { key: 'm', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.api', traverse: { mode: 'both' }, output: ['diagram', 'matrix'] });
  assert.equal(v.nodes.find(n => n.id === 'k8s').role, 'supporter');
  assert.equal(v.nodes.find(n => n.id === 'venda').role, 'dependent');
  assert.ok(Array.isArray(v.matrix) && v.matrix.length > 0);
  const row = v.matrix.find(r => r.id === 'venda');
  assert.equal(row.layer, 'business');
  assert.equal(row.role, 'dependent');
  assert.ok(row.path.length >= 1);
});

test('archimate derivation bridges hidden layers', () => {
  const v = resolveView(model(), {
    key: 'dv', notation: 'archimate', viewpoint: 'custom', layers: ['business', 'technology'],
    anchor: 'venda', traverse: { mode: 'supporters' }, derive: true,
  });
  assert.ok(!ids(v).includes('loja.api'));
  const d = edge(v, 'k8s', 'proc-checkout');
  assert.ok(d, 'expected derived edge k8s → proc-checkout');
  assert.equal(d.derived, true);
  assert.equal(d.type, 'serving');
  assert.ok(d.via.length >= 2);
});

test('archimate collapse hides a type and derives through it', () => {
  const v = resolveView(model(), {
    key: 'co', notation: 'archimate', viewpoint: 'layered', anchor: 'venda',
    traverse: { mode: 'supporters' }, collapse: ['application-service'],
  });
  assert.ok(!ids(v).includes('app-svc-checkout'));
  const d = edge(v, 'loja.api.checkout', 'proc-checkout');
  assert.ok(d && d.derived && d.type === 'serving');
});

test('unknown anchor or scope raises a helpful error', () => {
  assert.throws(() => resolveView(model(), { key: 'e', notation: 'archimate', anchor: 'zzz' }), /E_UNKNOWN_REF/);
  assert.throws(() => resolveView(model(), { key: 'e', notation: 'c4', level: 'container' }), /E_VIEW_SCOPE/);
});

test('archimate granularity "container" lifts C4 components and hides the enclosing system', () => {
  const v = resolveView(model(), { key: 'g', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.api', traverse: { mode: 'both' } });
  const got = ids(v);
  assert.ok(!got.includes('loja.api.checkout'), 'components hidden at container granularity');
  assert.ok(!got.includes('loja'), 'enclosing software system hidden when its containers are shown');
  const d = edge(v, 'loja.api', 'app-svc-checkout');
  assert.ok(d && d.derived && d.type === 'realization', 'container realizes the service through its hidden component');
  const full = resolveView(model(), { key: 'g2', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.api', traverse: { mode: 'both' }, granularity: 'component' });
  assert.ok(ids(full).includes('loja.api.checkout'));
});
