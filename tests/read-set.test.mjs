import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { planMerge, applyPlan, canonicalJson } from '../scripts/lib/merge.mjs';
import { plan, finalize } from '../scripts/lib/api.mjs';
import { refOf, writeSetOf, objectVersionsOf } from '../scripts/lib/store/versions.mjs';
import { asBase, memStore } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const SRC = { kind: 'prompt', ref: 'rodada 1', date: '2026-10-01' };
const TODAY = { today: '2026-10-01' };
const delta = (model = {}, extra = {}) => ({ 'archlens-delta': '1.0', source: SRC, summary: 'teste',
  model: { elements: [], relationships: [], ...model }, ...extra });
const el = (base, id) => base.model.elements.find(e => e.id === id);
/** shop with aliases on loja.api ("Backend") and loja.db ("Banco") and a grouping "plat" holding loja.web. */
const richShop = () => {
  const base = shop();
  el(base, 'loja.api').aliases = ['Backend'];
  el(base, 'loja.db').aliases = ['Banco'];
  base.model.elements.push({ id: 'plat', type: 'grouping', name: 'Plataforma' });
  el(base, 'loja.web').group = 'plat';
  return base;
};

/** Plans `d` against `base`, answers its questions (`answers`: key → resolution) and applies it. */
function merged(base, d, answers = {}) {
  const p = planMerge(base, d, { answers, ...TODAY });
  for (const it of p.items) if (it.key in answers) it.resolution = answers[it.key];
  return applyPlan(base, p, TODAY);
}
const readOf = (base, d, answers) => [...merged(base, d, answers).read].sort();
const sorted = list => [...list].sort();

test('matching by id or alias reads the matched element', () => {
  assert.deepEqual(readOf(richShop(), delta({ elements: [{ id: 'loja.api', type: 'c4:container', name: 'API' }] })), ['element:loja.api']);
  assert.deepEqual(readOf(richShop(), delta({ elements: [{ id: 'backend', type: 'c4:container', name: 'Backend' }] })), ['element:loja.api']);
});

test('a possible duplicate answered same or different reads the candidate', () => {
  const d = delta({ elements: [{ id: 'pedidos-online', type: 'archimate:business-service', name: 'Pedidos online' }] });
  const same = merged(shop(), d, { 'dup:pedidos-online': 'same', 'el:pedidos-online:name': 'keep' });
  assert.deepEqual([...same.read], ['element:svc-pedido']);
  assert.deepEqual(same.candidates, {});
  const different = merged(shop(), d, { 'dup:pedidos-online': 'different' });
  assert.deepEqual([...different.read], ['element:svc-pedido']);
});

test('a new element reads its parent and its group', () => {
  const d = delta({ elements: [{ id: 'loja.cache', type: 'c4:container', name: 'Cache', parent: 'loja', group: 'plat' }] });
  assert.deepEqual(readOf(richShop(), d), ['element:loja', 'element:plat']);
});

test('moving an element reads old and new parent', () => {
  const d = delta({ elements: [{ id: 'loja.api.catalogo', type: 'c4:component', name: 'Catalogo', parent: 'loja.web' }] });
  assert.deepEqual(readOf(shop(), d, { 'el:loja.api.catalogo:parent': 'take' }),
    ['element:loja.api', 'element:loja.api.catalogo', 'element:loja.web']);
});

test('a new relationship reads both ends', () => {
  assert.deepEqual(readOf(richShop(), delta({ relationships: [{ from: 'pg', to: 'Banco', type: 'archimate:serving' }] })),
    ['element:loja.db', 'element:pg']);
  // A relationship the delta changes is read too, with its ends.
  assert.deepEqual(readOf(richShop(), delta({ relationships: [{ from: 'k8s', to: 'Backend', type: 'archimate:serving', description: 'Hospeda' }] })),
    ['element:k8s', 'element:loja.api', 'relationship:k8s-serving-loja.api']);
});

test('rename, alias and status read their target; remove reads the whole cascade', () => {
  const ops = list => delta({}, { ops: list });
  assert.deepEqual(readOf(shop(), ops([{ op: 'rename', id: 'loja.web', name: 'Portal' }])), ['element:loja.web']);
  assert.deepEqual(readOf(shop(), ops([{ op: 'alias', id: 'pagamentos', add: ['PSP'] }])), ['element:pagamentos']);
  assert.deepEqual(readOf(shop(), ops([{ op: 'status', id: 'loja.db', status: 'deprecated' }])), ['element:loja.db']);
  assert.deepEqual(readOf(shop(), ops([{ op: 'remove', id: 'loja.api' }]), { 'op:0': 'yes' }), sorted([
    'element:loja.api', 'element:loja.api.checkout', 'element:loja.api.catalogo',
    'relationship:loja.api.checkout-serving-loja.web', 'relationship:loja.api.catalogo-serving-loja.web',
    'relationship:loja.db-serving-loja.api.checkout', 'relationship:pagamentos-serving-loja.api.checkout',
    'relationship:loja.api.checkout-realization-app-svc-checkout', 'relationship:k8s-serving-loja.api', 'relationship:pg-serving-loja.api',
  ]));
  assert.deepEqual(readOf(shop(), ops([{ op: 'remove', id: 'venda' }]), { 'op:0': 'yes' }),
    ['element:venda', 'relationship:venda-aggregation-svc-pedido', 'view:suporte-venda']);
  // A grouping's cascade is its members.
  assert.deepEqual(readOf(richShop(), ops([{ op: 'remove', id: 'plat' }]), { 'op:0': 'yes' }), ['element:loja.web', 'element:plat']);
});

test('rewritten views are read', () => {
  const d = delta({}, { views: [
    { key: 'ctx', notation: 'c4', level: 'context', scope: 'Backend' },
    { key: 'nova', notation: 'c4', level: 'container', scope: 'loja' },
  ] });
  assert.deepEqual(readOf(richShop(), d, { 'view:ctx': 'take' }), ['element:loja', 'element:loja.api', 'view:ctx']);
});

test('knownCandidates lists, per new element, the candidates found at plan time', () => {
  const d = delta({ elements: [
    { id: 'pedidos-online', type: 'archimate:business-service', name: 'Pedidos online' },
    { id: 'loja.cache', type: 'c4:container', name: 'Cache', parent: 'loja' },
  ] });
  const store = memStore(shop());
  const { plan: p } = plan(store, d, { answers: new Map([['dup:pedidos-online', 'different']]), ...TODAY });
  assert.equal(p.state, 'final');
  assert.deepEqual(p.knownCandidates, { 'loja.cache': [], 'pedidos-online': ['svc-pedido'] });
  // Nothing new, nothing known.
  const { plan: q } = plan(memStore(shop()), delta({}, { ops: [{ op: 'rename', id: 'loja.web', name: 'Portal' }] }), TODAY);
  assert.deepEqual(q.knownCandidates, {});
});

test('the final plan carries objects for read ∪ write set, from the plan\'s own snapshot', () => {
  const d = delta({
    elements: [{ id: 'loja.cache', type: 'c4:container', name: 'Cache', parent: 'loja' }],
    relationships: [{ from: 'loja.cache', to: 'loja.api', type: 'archimate:serving' }],
  });
  const refs = ['element:loja', 'element:loja.api', 'element:loja.cache', 'relationship:loja.cache-serving-loja.api'];
  // Without objectVersions on the connector: computed from the snapshot.
  const { plan: p } = plan(memStore(shop()), d, TODAY);
  assert.deepEqual(Object.keys(p.objects).sort(), refs);
  const snapshot = { raw: shop(), notes: {} };
  assert.deepEqual(p.objects, Object.fromEntries(objectVersionsOf(snapshot, refs)));
  assert.equal(p.objects['element:loja.cache'], null);
  assert.match(p.objects['element:loja'], /^sha256:[0-9a-f]{64}$/);
  // With it: asked once, for those refs, over the same snapshot the plan was made from (plan and finalize).
  for (const run of [s => plan(s, d, TODAY), s => finalize(s, planMerge(shop(), d, { storeVersion: s.version(), ...TODAY }), TODAY)]) {
    const store = memStore(shop());
    const asked = [];
    let read;
    const inner = store.read;
    store.read = () => (read = inner());
    store.objectVersions = (rs, snap) => { asked.push([[...rs].sort(), snap]); return new Map([...rs].map(r => [r, `v:${r}`])); };
    const { plan: f } = run(store);
    assert.equal(asked.length, 1);
    assert.deepEqual(asked[0][0], refs);
    assert.equal(asked[0][1], read, 'the snapshot the plan was made from');
    assert.deepEqual(f.objects, Object.fromEntries(refs.map(r => [r, `v:${r}`])));
  }
});

test('objectVersionsOf: an element carries its outgoing relationships; a relationship has its origin\'s version', () => {
  const snap = { raw: shop(), notes: { notes: 'Nota.' } };
  const v = objectVersionsOf(snap, ['element:loja.api.checkout', 'relationship:loja.api.checkout-serving-loja.web',
    'element:nada', 'relationship:nada', 'view:ctx', 'view:nada', 'note:notes', 'note:overview', 'manifest']);
  const sha = x => `sha256:${createHash('sha256').update(x).digest('hex')}`;
  assert.equal(v.get('relationship:loja.api.checkout-serving-loja.web'), v.get('element:loja.api.checkout'));
  assert.equal(v.get('element:nada'), null);
  assert.equal(v.get('relationship:nada'), null);
  assert.equal(v.get('view:ctx'), sha(canonicalJson(snap.raw.views[0])));
  assert.equal(v.get('view:nada'), null);
  assert.equal(v.get('note:notes'), sha('Nota.'));
  assert.equal(v.get('note:overview'), null);
  assert.equal(v.get('manifest'), sha(canonicalJson({ archlens: '2.0', name: 'Loja Mini' })));
  // An outgoing relationship is part of the element; an incoming one is not.
  const changed = structuredClone(snap);
  changed.raw.model.relationships.find(r => r.from === 'loja.api.checkout' && r.to === 'loja.web').description = 'Outra';
  const w = objectVersionsOf(changed, ['element:loja.api.checkout', 'element:loja.web']);
  assert.notEqual(w.get('element:loja.api.checkout'), v.get('element:loja.api.checkout'));
  assert.equal(w.get('element:loja.web'), objectVersionsOf(snap, ['element:loja.web']).get('element:loja.web'));
  assert.deepEqual([...objectVersionsOf(null, ['element:loja', 'manifest']).values()], [null, null]);
});

test('writeSetOf: the objects the ops write', () => {
  const snap = { raw: shop(), notes: {} };
  const ops = [
    { op: 'setManifest', manifest: {} },
    { op: 'upsertElement', element: { id: 'a' } },
    { op: 'removeElement', id: 'b' },
    { op: 'upsertRelationship', relationship: { id: 'r1', from: 'a', to: 'c', type: 'serving' } },
    { op: 'removeRelationship', id: 'k8s-serving-loja.api' },
    { op: 'putView', view: { key: 'v1' } },
    { op: 'removeView', key: 'v2' },
    { op: 'putNote', name: 'notes', text: 'x' },
    { op: 'appendHistory', entry: {} },
  ];
  assert.equal(refOf('element', 'a'), 'element:a');
  assert.deepEqual([...writeSetOf(ops, snap)].sort(), ['element:a', 'element:b', 'element:k8s', 'manifest', 'note:notes',
    'relationship:k8s-serving-loja.api', 'relationship:r1', 'view:v1', 'view:v2']);
});
