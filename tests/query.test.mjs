import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';

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

const findRaw = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const modelWith = mut => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
  mut(r);
  return normalizeModel(r);
};

test('views hide retired elements by default and show them on request', () => {
  const m = modelWith(r => { findRaw(r, 'loja.db').status = 'retired'; findRaw(r, 'pagamentos').status = 'deprecated'; });
  const v = resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' });
  assert.ok(!ids(v).includes('loja.db'));
  assert.equal(v.nodes.find(n => n.id === 'pagamentos').status, 'deprecated');
  assert.equal(v.nodes.find(n => n.id === 'loja.web').status, 'active');
  const all = resolveView(m, { key: 'c2', notation: 'c4', level: 'container', scope: 'loja', status: ['planned', 'active', 'deprecated', 'retired'] });
  assert.ok(ids(all).includes('loja.db'));
});

test('children of a hidden element are hidden too (C4 and ArchiMate)', () => {
  const m = modelWith(r => { findRaw(r, 'loja').status = 'retired'; });
  assert.deepEqual(ids(resolveView(m, { key: 'l', notation: 'c4', level: 'landscape' })), ['cliente', 'pagamentos']);
  const s = resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } });
  assert.ok(!ids(s).some(id => id.startsWith('loja')));
});

test('a view scoped on a hidden element explains the status filter', () => {
  const m = modelWith(r => { findRaw(r, 'loja').status = 'retired'; });
  assert.throws(() => resolveView(m, { key: 'c', notation: 'c4', level: 'context', scope: 'loja' }), /E_VIEW_STATUS.*oculto/);
  assert.throws(() => resolveView(m, { key: 'x', notation: 'c4', level: 'landscape', status: ['vivo'] }), /E_VIEW_STATUS/);
});

test('a view whose status is not an array is refused with E_VIEW_STATUS, not a crash', () => {
  assert.throws(() => resolveView(model(), { key: 'x', notation: 'c4', level: 'landscape', status: 'planned' }), /E_VIEW_STATUS/);
});

test('draft items are visible by default and carry their status and reason', () => {
  const m = modelWith(r => {
    Object.assign(findRaw(r, 'loja.web'), { status: 'draft', statusReason: 'em discussão com o time de canais' });
    r.model.relationships.find(x => x.from === 'k8s').status = 'draft';
  });
  const v = resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' });
  const web = v.nodes.find(n => n.id === 'loja.web');
  assert.equal(web.status, 'draft');
  assert.equal(web.statusReason, 'em discussão com o time de canais');
  const s = resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } });
  assert.equal(s.edges.find(e => e.from === 'k8s').status, 'draft');
  const asIs = resolveView(m, { key: 'a', notation: 'c4', level: 'container', scope: 'loja', status: ['active', 'deprecated'] });
  assert.ok(!ids(asIs).includes('loja.web'));
});

test('resolveView can keep ids visible that the status filter would hide (preview ghosts)', () => {
  const m = modelWith(r => { findRaw(r, 'loja.db').status = 'retired'; });
  assert.ok(!ids(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' })).includes('loja.db'));
  assert.ok(ids(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: new Set(['loja.db']) })).includes('loja.db'));
});

test('dynamic steps over parallel relationships use them in order', () => {
  const m = modelWith(r => r.model.relationships.push(
    { from: 'loja.api.checkout', to: 'pagamentos', description: 'Captura', technology: 'POST /captures' },
  ));
  const v = resolveView(m, { key: 'd', notation: 'c4', level: 'dynamic', scope: 'loja', steps: [
    { from: 'loja.api.checkout', to: 'pagamentos', description: 'Autoriza' },
    { from: 'loja.api.checkout', to: 'pagamentos', description: 'Captura' },
  ] });
  assert.deepEqual(v.edges.map(e => e.technology), ['HTTPS', 'POST /captures']);
});

// ---------- groupings ----------


const plat = () => normalizeModel(JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url))));
const BOTH = ['plat-aut', 'plat-cred'];

test('groups.only keeps the members of the listed groups and the relations among them, with frames', () => {
  const v = resolveView(plat(), { key: 'g', notation: 'c4', level: 'landscape', groups: { only: BOTH } });
  assert.deepEqual(ids(v), ['autorizador', 'limites', 'motor', 'tokenizacao']);
  assert.ok(edge(v, 'autorizador', 'tokenizacao'));
  assert.ok(edge(v, 'autorizador', 'motor'), 'container relation lifted to the systems');
  assert.ok(edge(v, 'motor', 'limites'));
  assert.deepEqual(v.groups.map(g => g.id).sort(), BOTH);
  assert.equal(v.groups.find(g => g.id === 'plat-aut').name, 'Plataforma de Autorização');
  assert.equal(v.nodes.find(n => n.id === 'motor').group, 'plat-cred');
});

test('groups.crossOnly keeps only what crosses between the listed groups', () => {
  const v = resolveView(plat(), { key: 'g', notation: 'c4', level: 'landscape', groups: { only: BOTH, crossOnly: true } });
  assert.deepEqual(ids(v), ['autorizador', 'motor']);
  assert.deepEqual(v.edges.map(e => `${e.from}>${e.to}`), ['autorizador>motor']);
});

test('groups.only with depth brings the direct neighbours outside the groups', () => {
  const v = resolveView(plat(), { key: 'g', notation: 'c4', level: 'landscape', groups: { only: ['plat-aut'] }, depth: 1 });
  assert.deepEqual(ids(v), ['autorizador', 'bandeira', 'motor', 'portador', 'tokenizacao']);
});

test('frames: off by default, on with only, forced either way by the view', () => {
  const m = plat();
  const nodeKeys = v => v.nodes.filter(n => !('group' in n)).map(n => n.id).sort();
  const plain = resolveView(m, { key: 'a', notation: 'c4', level: 'landscape' });
  assert.equal(plain.groups, undefined);
  assert.deepEqual(nodeKeys(plain), ['bandeira', 'portador'], 'only members carry "group"');
  const forced = resolveView(m, { key: 'b', notation: 'c4', level: 'landscape', groups: { frames: true } });
  assert.deepEqual(forced.groups.map(g => g.id).sort(), BOTH);
  assert.equal(forced.nodes.length, plain.nodes.length, 'frames alone do not cut');
  const off = resolveView(m, { key: 'c', notation: 'c4', level: 'landscape', groups: { only: BOTH, frames: false } });
  assert.equal(off.groups, undefined);
  assert.equal(off.nodes.length, 4);
});

test('container view: the opened boundary carries the group of its system', () => {
  const v = resolveView(plat(), { key: 'c', notation: 'c4', level: 'container', scope: 'autorizador', groups: { frames: true } });
  assert.equal(v.boundaries[0].group, 'plat-aut');
  assert.equal(v.nodes.find(n => n.id === 'motor').group, 'plat-cred');
  assert.deepEqual(v.groups.map(g => g.id).sort(), BOTH);
});

test('archimate: groupings are never nodes; groups.only cuts every layer', () => {
  const m = plat();
  const all = resolveView(m, { key: 'l', notation: 'archimate', viewpoint: 'layered', granularity: 'system' });
  assert.ok(!all.nodes.some(n => n.type === 'grouping'));
  const v = resolveView(m, { key: 'g', notation: 'archimate', viewpoint: 'layered', granularity: 'system', groups: { only: BOTH } });
  assert.deepEqual(ids(v), ['autorizador', 'kafka', 'limites', 'motor', 'proc-autorizar', 'proc-limite', 'tokenizacao']);
  assert.ok(edge(v, 'kafka', 'autorizador'));
  assert.deepEqual(v.groups.map(g => g.id).sort(), BOTH);
});

test('E_VIEW_GROUP: unknown or non-grouping ids, crossOnly with one group; saved views are validated too', () => {
  const m = plat();
  assert.throws(() => resolveView(m, { key: 'x', notation: 'c4', level: 'landscape', groups: { only: ['motor'] } }), /E_VIEW_GROUP/);
  assert.throws(() => resolveView(m, { key: 'x', notation: 'c4', level: 'landscape', groups: { only: ['plat-aut'], crossOnly: true } }), /E_VIEW_GROUP/);
  const r = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  r.views = [{ key: 'x', notation: 'c4', level: 'landscape', groups: { only: ['nada'] } }];
  assert.ok(validateModel(r).errors.some(e => e.code === 'E_VIEW_GROUP'));
});

test('a retired grouping draws no frame and cannot be listed in only', () => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  r.model.elements.find(e => e.id === 'plat-cred').status = 'retired';
  const m = normalizeModel(r);
  const v = resolveView(m, { key: 'a', notation: 'c4', level: 'landscape', groups: { frames: true } });
  assert.deepEqual(v.groups.map(g => g.id), ['plat-aut']);
  assert.ok(v.nodes.some(n => n.id === 'motor'), 'members stay, loose');
  assert.ok(!('group' in v.nodes.find(n => n.id === 'motor')), 'no dangling group reference');
  assert.throws(() => resolveView(m, { key: 'b', notation: 'c4', level: 'landscape', groups: { only: ['plat-cred'] } }), /E_VIEW_GROUP[\s\S]*status/);
});

test('crossOnly with no relation between the groups gives an empty view, not an error', () => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  r.model.relationships = r.model.relationships.filter(x => x.from !== 'autorizador.regras');
  const v = resolveView(normalizeModel(r), { key: 'x', notation: 'c4', level: 'landscape', groups: { only: BOTH, crossOnly: true } });
  assert.deepEqual(v.nodes, []);
});

test('views without groups resolve exactly as before', () => {
  const m = model();
  for (const spec of [{ key: 'l', notation: 'c4', level: 'landscape' }, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } }]) {
    const v = resolveView(m, spec);
    assert.equal(v.groups, undefined);
    assert.ok(v.nodes.every(n => !('group' in n)));
  }
});

test('context scope stays even when it is outside groups.only', () => {
  const v = resolveView(plat(), { key: 'x', notation: 'c4', level: 'context', scope: 'autorizador', groups: { only: ['plat-cred'] } });
  assert.ok(v.nodes.some(n => n.id === 'autorizador'));
  assert.ok(v.nodes.some(n => n.id === 'motor'));
});
