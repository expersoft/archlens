import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewModel, previewSummary, annotateView } from '../scripts/lib/preview.mjs';
import { planMerge, applyPlan, canonicalJson } from '../scripts/lib/merge.mjs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const SRC = { kind: 'prompt', ref: 'rodada 1', date: '2026-10-01' };
const delta = (model = {}, extra = {}) => ({ 'archlens-delta': '1.0', source: SRC, summary: 'teste',
  model: { elements: [], relationships: [], ...model }, ...extra });
const find = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const TODAY = { today: '2026-10-01' };

test('added, changed, removed and retired elements are told apart', () => {
  const d = delta(
    { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }, { id: 'loja.web', type: 'c4:container', technology: 'Next.js 15' }] },
    { ops: [{ op: 'remove', id: 'loja.db' }, { op: 'status', id: 'k8s', status: 'retired', reason: 'ECS' }] },
  );
  const p = previewModel(shop(), { delta: d });
  assert.equal(p.changes.get('loja.worker').kind, 'added');
  assert.deepEqual(p.changes.get('loja.web'), { kind: 'changed', fields: [{ field: 'technology', before: 'Next.js', after: 'Next.js 15' }] });
  assert.equal(p.changes.get('loja.db').kind, 'removed');
  assert.equal(p.changes.get('k8s').kind, 'retired');
  assert.equal(p.changes.has('cliente'), false);
  assert.equal(previewSummary(p), '+1 ~1 −2, 3 decisão(ões) pendente(s)');
});

test('removed elements come back as ghosts under their parent, with the relationships that fall with them', () => {
  const p = previewModel(shop(), { delta: delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] }) });
  assert.ok(find(p.raw, 'loja').children.some(c => c.id === 'loja.api'), 'ghost nested in its old parent');
  assert.ok(find(p.raw, 'loja.api').children.some(c => c.id === 'loja.api.checkout'), 'descendants come back nested too');
  assert.equal(p.changes.get('loja.api.checkout').kind, 'removed');
  assert.equal([...p.relChanges.values()].filter(c => c.kind === 'removed').length, 7);
  assert.deepEqual(validateModel(p.raw).errors, [], 'the preview model is valid');
  assert.ok(p.keep.has('loja.api') && p.keep.has('loja.api.checkout'));
});

test('a duplicate answered "same" is a change of the base element, never removed + added', () => {
  const d = delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', description: 'Adquirente', external: true }] });
  const plan = planMerge(shop(), d, TODAY);
  plan.items.find(i => i.key === 'dup:gateway-pag').resolution = 'same';
  const p = previewModel(shop(), { plan });
  assert.equal(p.changes.has('gateway-pag'), false);
  assert.equal(p.changes.get('pagamentos').kind, 'changed');
  assert.ok([...p.changes.values()].every(c => c.kind !== 'removed'));
});

test('open questions are attached to what they are about; a possible duplicate shows on both sides', () => {
  const p = previewModel(shop(), { delta: delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos' }] }) });
  const [q] = p.pending.get('pagamentos');
  assert.equal(q.key, 'dup:gateway-pag');
  assert.equal(q.assumed, 'different');
  assert.match(q.question, /possível duplicata/);
  assert.equal(p.pending.get('gateway-pag')[0].key, 'dup:gateway-pag');
});

test('a plan uses its answers; open ones take the plan default', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }, { id: 'loja.web', technology: 'Remix' }] }), TODAY);
  plan.items.find(i => i.key === 'el:loja.api:technology').resolution = 'keep';
  const p = previewModel(shop(), { plan });
  assert.equal(find(p.raw, 'loja.api').technology, 'Spring');
  assert.equal(find(p.raw, 'loja.web').technology, 'Remix');
  assert.equal(p.pending.has('loja.api'), false);
  assert.equal(p.pending.get('loja.web')[0].assumed, 'take');
});

test('without ghosts, the preview of a fully answered plan is exactly what apply writes', () => {
  const d = delta({
    elements: [{ id: 'loja.api', technology: 'Kotlin' }, { id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }],
    relationships: [{ from: 'loja.worker', to: 'loja.db' }],
  });
  const plan = planMerge(shop(), d, TODAY);
  for (const it of plan.items) if ('resolution' in it) it.resolution = 'take';
  const p = previewModel(shop(), { plan });
  const { changelog, ...applied } = applyPlan(shop(), plan, TODAY).raw;
  assert.equal(canonicalJson(p.raw), canonicalJson(applied));
});

test('a blocked plan cannot be previewed; inputs are never mutated; exactly one input is required', () => {
  const base = shop();
  assert.throws(() => previewModel(base, { delta: delta({ relationships: [{ from: 'loja.api', to: 'pagamentoz' }] }) }), /E_PREVIEW_BLOCKED/);
  const d = delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }, { ops: [{ op: 'remove', id: 'loja.db' }] });
  const copy = structuredClone(d);
  previewModel(base, { delta: d });
  assert.deepEqual(base, shop());
  assert.deepEqual(d, copy);
  assert.throws(() => previewModel(base, {}), /E_PREVIEW_INPUT/);
  assert.throws(() => previewModel(base, { delta: d, plan: planMerge(base, d, TODAY) }), /E_PREVIEW_INPUT/);
});

test('a delta on a missing base previews everything as added', () => {
  const p = previewModel(null, { delta: delta({ elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }] }, { name: 'Nova' }) });
  assert.deepEqual([...p.changes], [['sis', { kind: 'added' }]]);
  assert.equal(previewSummary(p), '+1 ~0 −0');
});

test('a relationship whose canonical id flips is one changed relationship, not removed + added', () => {
  const base = { archlens: '1.0', name: 'X', model: {
    elements: [{ id: 'sys', type: 'c4:softwareSystem', name: 'Sys', children: [
      { id: 'app', type: 'c4:container', name: 'App' }, { id: 'store', type: 'c4:container', name: 'Store' }] }],
    relationships: [{ from: 'app', to: 'store', type: 'uses' }] } };
  const p = previewModel(base, { delta: delta({ elements: [{ id: 'store', type: 'archimate:data-object' }] }) });
  const kinds = [...p.relChanges.values()].map(c => c.kind);
  assert.deepEqual(kinds, ['changed']);
  const [c] = p.relChanges.values();
  assert.equal(c.fields[0].field, 'id');
  assert.notEqual(c.fields[0].before, c.fields[0].after);
  assert.equal(p.raw.model.relationships.filter(r => [r.from, r.to].sort().join() === 'app,store').length, 1);
});

test('ghosts keep a top-level parent when the child is listed before it', () => {
  const base = { archlens: '1.0', name: 'X', model: {
    elements: [{ id: 'c', type: 'c4:container', name: 'C', parent: 'a' }, { id: 'a', type: 'c4:softwareSystem', name: 'A' }],
    relationships: [] } };
  const p = previewModel(base, { delta: delta({}, { ops: [{ op: 'remove', id: 'a' }] }) });
  const a = find(p.raw, 'a');
  const c = find(p.raw, 'c');
  assert.ok(c.parent === 'a' || (a.children || []).some(x => x.id === 'c'));
  assert.deepEqual(validateModel(p.raw).errors, []);
});

test('views keep ghosts and retired-in-this-delta items visible, and are annotated', () => {
  const d = delta(
    { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] },
    { ops: [{ op: 'remove', id: 'loja.db' }, { op: 'status', id: 'pagamentos', status: 'retired' }] },
  );
  const p = previewModel(shop(), { delta: d });
  const v = annotateView(resolveView(normalizeModel(p.raw), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: p.keep }), p);
  const node = id => v.nodes.find(n => n.id === id);
  assert.equal(node('loja.worker').change, 'added');
  assert.equal(node('loja.db').change, 'removed');
  assert.equal(node('pagamentos').change, 'retired');
  assert.equal(node('loja.db').pending[0].key, 'op:0');
  assert.equal(node('loja.web').change, undefined);
  const toDb = v.edges.find(e => e.to === 'loja.db');
  assert.equal(toDb.change, 'removed');
});
