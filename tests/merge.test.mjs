import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';

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
const answer = (plan, map) => { for (const it of plan.items) if (it.key in map) it.resolution = map[it.key]; return plan; };
const TODAY = { today: '2026-10-01' };

test('element matched by id: fills empty fields and adds the source without asking', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.api', type: 'c4:container', description: 'Pedidos e checkout', tags: ['core'] }] }), TODAY);
  assert.deepEqual(plan.summary, { enrich: 1 });
  assert.equal(plan.blocked, false);
  const { raw, entry } = applyPlan(shop(), plan, TODAY);
  const api = find(raw, 'loja.api');
  assert.equal(api.description, 'Pedidos e checkout');
  assert.deepEqual(api.tags, ['core']);
  assert.deepEqual(api.sources, [SRC]);
  assert.deepEqual(entry.changed, ['loja.api']);
  assert.equal(entry.id, '2026-10-01-01');
  assert.equal(raw.changelog.length, 1);
});

test('a different filled value is a conflict answered with keep, take or value', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }] }), TODAY);
  const c = plan.items.find(i => i.class === 'conflict');
  assert.deepEqual([c.key, c.field, c.base, c.delta, c.resolution], ['el:loja.api:technology', 'technology', 'Spring', 'Kotlin', null]);
  assert.throws(() => applyPlan(shop(), plan, TODAY), /E_PLAN_PENDING/);
  const run = res => find(applyPlan(shop(), answer(structuredClone(plan), { 'el:loja.api:technology': res }), TODAY).raw, 'loja.api').technology;
  assert.equal(run('keep'), 'Spring');
  assert.equal(run('take'), 'Kotlin');
  assert.equal(run('value:Kotlin / Spring Boot'), 'Kotlin / Spring Boot');
  const taken = applyPlan(shop(), answer(structuredClone(plan), { 'el:loja.api:technology': 'take' }), TODAY);
  assert.match(taken.entry.decisions[0], /conflito loja\.api\.technology: take "Kotlin"/);
  assert.throws(() => applyPlan(shop(), answer(structuredClone(plan), { 'el:loja.api:technology': 'talvez' }), TODAY), /E_PLAN_RESOLUTION/);
});

test('a new element is inserted under its parent, keeping the nesting', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja', technology: 'Node.js' }] }), TODAY);
  assert.deepEqual(plan.summary, { new: 1 });
  const { raw, entry } = applyPlan(shop(), plan, TODAY);
  const worker = find(raw, 'loja').children.find(c => c.id === 'loja.worker');
  assert.ok(worker);
  assert.equal(worker.parent, undefined);
  assert.deepEqual(worker.sources, [SRC]);
  assert.deepEqual(entry.added, ['loja.worker']);
});

test('elements match by alias in both directions and references are rewritten to the canonical id', () => {
  const base = shop();
  find(base, 'loja.api').aliases = ['orders-service'];
  const d = delta({ elements: [
    { id: 'orders-worker', type: 'c4:component', name: 'Consumidor', parent: 'orders-service' }, // child listed before its parent
    { id: 'orders-service', type: 'c4:container', description: 'Pedidos' },                    // delta id = base alias
    { id: 'gw', type: 'c4:softwareSystem', aliases: ['pagamentos'] },                          // delta alias = base id
  ] });
  const plan = planMerge(base, d, TODAY);
  assert.equal(plan.blocked, false, JSON.stringify(plan.errors));
  const { raw } = applyPlan(base, plan, TODAY);
  assert.ok(find(raw, 'loja.api').children.some(c => c.id === 'orders-worker'));
  assert.equal(find(raw, 'loja.api').description, 'Pedidos');
  assert.equal(find(raw, 'orders-service'), undefined);
  assert.equal(find(raw, 'gw'), undefined);
});

test('a similar name of the same type is only a possible duplicate', () => {
  const d = delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', description: 'Adquirente', external: true }] });
  const plan = planMerge(shop(), d, TODAY);
  const dup = plan.items.find(i => i.class === 'possible-duplicate');
  assert.equal(dup.key, 'dup:gateway-pag');
  assert.equal(dup.candidate, 'pagamentos');
  assert.ok(dup.score >= 0.75);
  assert.equal(plan.summary.new, 1, 'simulated as different');
  const same = applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'same', 'el:gateway-pag:name': 'keep' }), TODAY);
  const pag = find(same.raw, 'pagamentos');
  assert.deepEqual(pag.aliases, ['gateway-pag']);
  assert.equal(pag.description, 'Adquirente');
  assert.equal(find(same.raw, 'gateway-pag'), undefined);
  const diff = applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'different' }), TODAY);
  assert.ok(find(diff.raw, 'gateway-pag'));
});

test('fields that differ from a possible duplicate become conditional conflicts', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', external: false }] }), TODAY);
  const cond = plan.items.find(i => i.class === 'conflict' && i.field === 'external');
  assert.deepEqual([cond.key, cond.when, cond.resolution], ['el:gateway-pag:external', 'dup:gateway-pag=same', null]);
  assert.equal(plan.summary.conflict, undefined, 'conditional items are not counted');
  assert.doesNotThrow(() => applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'different' }), TODAY));
  assert.throws(() => applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'same' }), TODAY), /E_PLAN_PENDING/);
});

test('touching an element migrates its legacy source string into sources', () => {
  const base = shop();
  find(base, 'loja.web').source = 'a vitrine é em Next.js';
  const { raw } = applyPlan(base, planMerge(base, delta({ elements: [{ id: 'loja.web', type: 'c4:container' }] }), TODAY), TODAY);
  const web = find(raw, 'loja.web');
  assert.equal(web.source, undefined);
  assert.deepEqual(web.sources, [{ kind: 'prompt', excerpt: 'a vitrine é em Next.js' }, SRC]);
});

test('applying the same delta twice changes nothing the second time', () => {
  const d = delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] });
  const first = applyPlan(shop(), planMerge(shop(), d, TODAY), TODAY);
  const plan2 = planMerge(first.raw, d, TODAY);
  assert.deepEqual(plan2.summary, { unchanged: 1 });
  const second = applyPlan(first.raw, plan2, TODAY);
  assert.equal(second.entry, null);
  assert.equal(second.raw.changelog.length, 1);
});

test('a plan is refused when the base changed after it was made, including re-applying it', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }), TODAY);
  const { raw } = applyPlan(shop(), plan, TODAY);
  assert.throws(() => applyPlan(raw, plan, TODAY), /E_PLAN_STALE/);
});

test('changelog ids are sequential within a day', () => {
  const a = applyPlan(shop(), planMerge(shop(), delta({ elements: [{ id: 'loja.a', type: 'c4:container', name: 'Alfa', parent: 'loja' }] }), TODAY), TODAY);
  const b = applyPlan(a.raw, planMerge(a.raw, delta({ elements: [{ id: 'loja.b', type: 'c4:container', name: 'Beta', parent: 'loja' }] }), TODAY), TODAY);
  assert.deepEqual(b.raw.changelog.map(e => e.id), ['2026-10-01-01', '2026-10-01-02']);
});

test('a missing base is created from the first delta', () => {
  const d = delta({ elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }] }, { name: 'Nova base', description: 'Criada do zero' });
  const plan = planMerge(null, d, TODAY);
  assert.equal(plan.baseHash, 'none');
  const { raw, entry } = applyPlan(null, plan, TODAY);
  assert.equal(raw.name, 'Nova base');
  assert.equal(raw.description, 'Criada do zero');
  assert.deepEqual(entry.added, ['sis']);
});

test('a delta that breaks validation blocks the plan, and apply writes nothing', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'x', type: 'c4:banana' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_UNKNOWN_TYPE'));
  assert.throws(() => applyPlan(shop(), plan, TODAY), /E_MERGE_INVALID/);
});

test('files that are not deltas or plans are refused', () => {
  assert.throws(() => planMerge(shop(), { model: {} }, TODAY), /E_DELTA_SCHEMA/);
  assert.throws(() => applyPlan(shop(), { items: [] }, TODAY), /E_PLAN_SCHEMA/);
});
