import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { formatPlanReport } from '../scripts/lib/merge-report.mjs';

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
  assert.deepEqual(pag.aliases, ['Gateway Pagamentos', 'gateway-pag'], 'kept delta name and delta id become aliases');
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

test('plan and apply agree: a simulated take cannot create a fuzzy match apply never saw', () => {
  const d = delta({ elements: [
    { id: 'pagamentos', name: 'Adquirente XYZ' },
    { id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos' },
  ] });
  const plan = planMerge(shop(), d, TODAY);
  const dups = plan.items.filter(i => i.class === 'possible-duplicate');
  for (const res of ['keep', 'take']) {
    const p = answer(structuredClone(plan), { 'el:pagamentos:name': res });
    if (dups.length) answer(p, { 'dup:gateway-pag': 'different' });
    assert.doesNotThrow(() => applyPlan(shop(), p, TODAY), res);
  }
  const p2 = answer(structuredClone(plan), { 'el:pagamentos:name': 'keep', 'dup:gateway-pag': 'different' });
  const gone = structuredClone(p2);
  gone.items = gone.items.filter(i => i.key !== 'el:pagamentos:name');
  assert.throws(() => applyPlan(shop(), gone, TODAY), /E_PLAN_REPLAN/);
});

test('planning and applying never mutate the delta or leak simulated values over a keep', () => {
  const d = delta({ elements: [
    { id: 'loja.a', type: 'c4:container', parent: 'loja', properties: { x: 1 } },
    { id: 'b', aliases: ['loja.a'], properties: { x: 2 } },
  ] });
  const before = structuredClone(d);
  const plan = planMerge(shop(), d, TODAY);
  assert.deepEqual(d, before);
  assert.deepEqual(plan.delta.model.elements[0].properties, { x: 1 });
  const { raw } = applyPlan(shop(), answer(structuredClone(plan), { 'el:b:properties.x': 'keep' }), TODAY);
  assert.equal(find(raw, 'loja.a').properties.x, 1);
  assert.deepEqual(plan.delta, before);
});

test('moving an element under its own descendant is a blocking error, not a silent delete', () => {
  const base = shop();
  base.model.elements.push({ id: 'x', type: 'c4:softwareSystem', name: 'X', children: [{ id: 'x.y', type: 'c4:container', name: 'Y' }] });
  const snapshot = structuredClone(base);
  const plan = planMerge(base, delta({ elements: [{ id: 'x', parent: 'x.y' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_PARENT_CYCLE'));
  assert.throws(() => applyPlan(base, plan, TODAY), /E_MERGE_INVALID/);
  assert.deepEqual(base, snapshot);
});

test('uses in the delta matches the equivalent serving already in the base', () => {
  const plan = planMerge(shop(), delta({ relationships: [{ from: 'loja.api', to: 'k8s', type: 'uses', technology: 'containerd' }] }), TODAY);
  assert.deepEqual(plan.summary, { enrich: 1 });
  const { raw } = applyPlan(shop(), plan, TODAY);
  assert.equal(raw.model.relationships.length, shop().model.relationships.length);
  assert.equal(raw.model.relationships.find(r => r.from === 'k8s' && r.to === 'loja.api').technology, 'containerd');
});

test('relationship fields that differ are conflicts; new ones get a stable id and the source', () => {
  const plan = planMerge(shop(), delta({ relationships: [
    { from: 'cliente', to: 'loja.web', description: 'Navega e compra' },
    { from: 'loja.api.checkout', to: 'loja.api.catalogo', description: 'Consulta preço' },
  ] }), TODAY);
  const c = plan.items.find(i => i.class === 'conflict');
  assert.deepEqual([c.key, c.base, c.delta], ['rel:0:description', 'Compra', 'Navega e compra']);
  const { raw } = applyPlan(shop(), answer(plan, { 'rel:0:description': 'keep' }), TODAY);
  const added = raw.model.relationships.at(-1);
  assert.equal(added.id, 'loja.api.catalogo-serving-loja.api.checkout');
  assert.deepEqual(added.sources, [SRC]);
});

test('relationships may point at elements by alias', () => {
  const base = shop();
  find(base, 'loja.api').aliases = ['orders-service'];
  const { raw } = applyPlan(base, planMerge(base, delta({ relationships: [{ from: 'orders-service', to: 'pagamentos', description: 'Estorna' }] }), TODAY), TODAY);
  assert.equal(raw.model.relationships.at(-1).from, 'loja.api');
});

test('a relationship to an unknown element blocks the plan (typo protection)', () => {
  const plan = planMerge(shop(), delta({ relationships: [{ from: 'loja.api', to: 'pagamentoz' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_UNKNOWN_REF'));
  assert.throws(() => applyPlan(shop(), plan, TODAY), /E_MERGE_INVALID/);
});

test('new relationships do not share nested objects with the delta', () => {
  const d = delta({ relationships: [{ from: 'loja.api', to: 'pagamentos', tags: ['x'], properties: { a: '1' } }] });
  const { raw } = applyPlan(shop(), planMerge(shop(), d, TODAY), TODAY);
  const added = raw.model.relationships.at(-1);
  added.tags.push('y'); added.properties.b = '2';
  assert.deepEqual(d.model.relationships[0].tags, ['x']);
  assert.deepEqual(d.model.relationships[0].properties, { a: '1' });
});

test('views: new keys are added with references rewritten; a changed spec is a keep/take conflict', () => {
  const base = shop();
  find(base, 'loja.api').aliases = ['orders-service'];
  const d = delta({}, {
    views: [
      { key: 'comp', notation: 'c4', level: 'component', scope: 'orders-service' },
      { key: 'ctx', notation: 'c4', level: 'context', scope: 'loja', title: 'Contexto' },
    ],
    assumptions: ['O ERP é SaaS'],
  });
  const plan = planMerge(base, d, TODAY);
  const c = plan.items.find(i => i.kind === 'view' && i.class === 'conflict');
  assert.equal(c.key, 'view:ctx');
  assert.throws(() => applyPlan(base, answer(structuredClone(plan), { 'view:ctx': 'value:x' }), TODAY), /E_PLAN_RESOLUTION/);
  const { raw } = applyPlan(base, answer(plan, { 'view:ctx': 'take' }), TODAY);
  assert.equal(raw.views.find(v => v.key === 'comp').scope, 'loja.api');
  assert.equal(raw.views.find(v => v.key === 'ctx').title, 'Contexto');
  assert.deepEqual(raw.assumptions, ['O ERP é SaaS']);
  const again = planMerge(raw, d, TODAY);
  assert.deepEqual(again.summary, { unchanged: 2 });
});

test('assumptions: duplicates inside the delta are appended once', () => {
  const { raw } = applyPlan(shop(), planMerge(shop(), delta({}, { assumptions: ['A', 'A'] }), TODAY), TODAY);
  assert.deepEqual(raw.assumptions, ['A']);
});

test('rename keeps the old name as an alias; alias op adds names', () => {
  const d = delta({}, { ops: [{ op: 'rename', id: 'loja.api', name: 'Orders API' }, { op: 'alias', id: 'loja.api', add: ['orders-service'] }] });
  const { raw } = applyPlan(shop(), planMerge(shop(), d, TODAY), TODAY);
  const api = find(raw, 'loja.api');
  assert.equal(api.name, 'Orders API');
  assert.deepEqual(api.aliases, ['API', 'orders-service']);
});

test('status changes are applied; retiring needs confirmation', () => {
  const plan = planMerge(shop(), delta({}, { ops: [
    { op: 'status', id: 'pagamentos', status: 'deprecated', reason: 'troca de adquirente' },
    { op: 'status', id: 'k8s', status: 'retired', reason: 'migrado para ECS' },
  ] }), TODAY);
  assert.equal(plan.items.find(i => i.key === 'op:0').resolution, undefined);
  assert.equal(plan.items.find(i => i.key === 'op:1').resolution, null);
  const { raw, entry } = applyPlan(shop(), answer(plan, { 'op:1': 'no' }), TODAY);
  assert.equal(find(raw, 'pagamentos').status, 'deprecated');
  assert.equal(find(raw, 'pagamentos').statusReason, 'troca de adquirente');
  assert.equal(find(raw, 'k8s').status, undefined);
  assert.deepEqual(entry.status, { pagamentos: 'deprecated' });
});

test('remove cascades to children and relationships, and needs confirmation', () => {
  const plan = planMerge(shop(), delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] }), TODAY);
  const it = plan.items.find(i => i.key === 'op:0');
  assert.deepEqual([...it.cascade.elements].sort(), ['loja.api', 'loja.api.catalogo', 'loja.api.checkout']);
  assert.equal(it.cascade.relationships.length, 7);
  const { raw, entry } = applyPlan(shop(), answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.equal(find(raw, 'loja.api'), undefined);
  assert.ok(!raw.model.relationships.some(r => [r.from, r.to].some(x => x.startsWith('loja.api'))));
  assert.deepEqual([...entry.removed].sort(), ['loja.api', 'loja.api.catalogo', 'loja.api.checkout']);
});

test('remove trims view lists and drops views scoped on what is removed', () => {
  const base = shop();
  base.views.push({ key: 'f', notation: 'c4', level: 'container', scope: 'loja', focus: ['loja.db', 'loja.web'] });
  const plan = planMerge(base, delta({}, { ops: [{ op: 'remove', id: 'loja.db' }] }), TODAY);
  assert.deepEqual(plan.items[0].cascade.views, [{ key: 'f', action: 'trim' }]);
  const { raw } = applyPlan(base, answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.deepEqual(raw.views.find(v => v.key === 'f').focus, ['loja.web']);
  const gone = planMerge(shop(), delta({}, { ops: [{ op: 'remove', id: 'loja' }] }), TODAY);
  assert.deepEqual(gone.items[0].cascade.views, [{ key: 'ctx', action: 'remove' }]);
});

test('remove also works on a relationship id', () => {
  const plan = planMerge(shop(), delta({}, { ops: [{ op: 'remove', id: 'k8s-serving-loja.api' }] }), TODAY);
  const { raw } = applyPlan(shop(), answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.ok(!raw.model.relationships.some(r => r.from === 'k8s'));
});

test('an op on an unknown id or with an invalid status blocks the plan', () => {
  const plan = planMerge(shop(), delta({}, { ops: [
    { op: 'status', id: 'nada', status: 'deprecated' },
    { op: 'status', id: 'k8s', status: 'morto' },
    { op: 'explode', id: 'k8s' },
  ] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.errors.map(e => e.code), ['E_UNKNOWN_REF', 'E_STATUS', 'E_OP']);
});

// --- possible duplicate answered "same": re-plan with earlier answers (plan and apply must agree) ---
const agendaBase = () => {
  const base = shop();
  base.model.elements.push({ id: 'sys', type: 'c4:softwareSystem', name: 'Agenda', children: [
    { id: 'sys.agenda', type: 'c4:container', name: 'API de Agendamento', technology: 'Node.js' },
    { id: 'sys.db', type: 'c4:container', name: 'Banco de agendas', technology: 'PostgreSQL', tags: ['database'] },
  ] });
  base.model.relationships.push({ from: 'sys.agenda', to: 'sys.db', type: 'uses', description: 'Lê e grava agendas' });
  return base;
};
const answersOf = plan => Object.fromEntries(plan.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution]));

test('duplicate answered same: re-planning with the answers asks the questions apply will meet (relationship)', () => {
  const d = delta({
    elements: [{ id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' }],
    relationships: [{ from: 'api-agenda', to: 'sys.db', type: 'uses', description: 'grava' }],
  });
  const plan = planMerge(agendaBase(), d, TODAY);
  assert.equal(plan.items.find(i => i.key === 'dup:api-agenda')?.candidate, 'sys.agenda');
  answer(plan, { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'keep' });
  assert.throws(() => applyPlan(agendaBase(), plan, TODAY), e => e.code === 'E_PLAN_REPLAN' && /--answers/.test(e.message));
  const plan2 = planMerge(agendaBase(), d, { ...TODAY, answers: answersOf(plan) });
  assert.equal(plan2.items.find(i => i.key === 'dup:api-agenda').resolution, 'same', 'earlier answer pre-filled');
  const rel = plan2.items.find(i => i.key === 'rel:0:description');
  assert.ok(rel, 'the relationship conflict against the base element is now asked');
  assert.equal(rel.resolution, null);
  assert.ok(!plan2.items.some(i => i.class === 'new' && i.kind === 'relationship'));
  const { raw } = applyPlan(agendaBase(), answer(plan2, { 'rel:0:description': 'take' }), TODAY);
  assert.equal(find(raw, 'api-agenda'), undefined);
  const rels = raw.model.relationships.filter(r => r.from === 'sys.agenda' && r.to === 'sys.db');
  assert.equal(rels.length, 1);
  assert.equal(rels[0].description, 'grava');
  assert.equal(raw.model.relationships.length, agendaBase().model.relationships.length);
});

test('duplicate answered same: a new child of the duplicate is nested under the base element', () => {
  const d = delta({ elements: [
    { id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' },
    { id: 'api-agenda.slots', type: 'c4:component', name: 'Slots', parent: 'api-agenda' },
  ] });
  const plan = planMerge(agendaBase(), d, TODAY);
  assert.equal(plan.items.find(i => i.key === 'el:api-agenda.slots').parent, 'api-agenda', 'simulated as different');
  answer(plan, { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'keep' });
  const plan2 = planMerge(agendaBase(), d, { ...TODAY, answers: new Map(Object.entries(answersOf(plan))) });
  assert.equal(plan2.items.filter(i => i.resolution === null).length, 0, JSON.stringify(plan2.items));
  assert.equal(plan2.items.find(i => i.key === 'el:api-agenda.slots').parent, 'sys.agenda', 'planned against the base element');
  assert.ok(!plan2.items.some(i => i.key === 'el:api-agenda' && i.class === 'new'));
  const { raw } = applyPlan(agendaBase(), plan2, TODAY);
  assert.ok(find(raw, 'sys.agenda').children.some(c => c.id === 'api-agenda.slots'));
  assert.equal(find(raw, 'api-agenda'), undefined);
});

test('earlier answers that are invalid for their question are ignored when re-planning', () => {
  const d = delta({ elements: [{ id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' }] });
  const plan = planMerge(agendaBase(), d, { ...TODAY, answers: { 'dup:api-agenda': 'talvez' } });
  assert.equal(plan.items.find(i => i.key === 'dup:api-agenda').resolution, null);
});

// --- parallel id-less relationships get the same ids normalizeModel gives them ---
const parallelBase = () => {
  const base = shop();
  base.model.relationships.push(
    { from: 'cliente', to: 'pagamentos', type: 'uses', description: 'lê' },
    { from: 'cliente', to: 'pagamentos', type: 'uses', description: 'grava' },
  );
  return base;
};

test('remove on the second of two parallel relationships uses the #2 id and removes only it', () => {
  const plan = planMerge(parallelBase(), delta({}, { ops: [{ op: 'remove', id: 'pagamentos-serving-cliente#2' }] }), TODAY);
  assert.equal(plan.blocked, false, JSON.stringify(plan.errors));
  assert.deepEqual(plan.items[0].cascade.relationships, ['pagamentos-serving-cliente#2']);
  const { raw } = applyPlan(parallelBase(), answer(plan, { 'op:0': 'yes' }), TODAY);
  const left = raw.model.relationships.filter(r => r.from === 'cliente' && r.to === 'pagamentos');
  assert.deepEqual(left.map(r => r.description), ['lê']);
});

test('remove on the first of two parallel relationships keeps the other one', () => {
  const plan = planMerge(parallelBase(), delta({}, { ops: [{ op: 'remove', id: 'pagamentos-serving-cliente' }] }), TODAY);
  assert.deepEqual(plan.items[0].cascade.relationships, ['pagamentos-serving-cliente']);
  const { raw } = applyPlan(parallelBase(), answer(plan, { 'op:0': 'yes' }), TODAY);
  const left = raw.model.relationships.filter(r => r.from === 'cliente' && r.to === 'pagamentos');
  assert.deepEqual(left.map(r => r.description), ['grava']);
});

test('removing an element lists and removes each parallel relationship once', () => {
  const plan = planMerge(parallelBase(), delta({}, { ops: [{ op: 'remove', id: 'pagamentos' }] }), TODAY);
  const rels = plan.items[0].cascade.relationships;
  assert.ok(rels.includes('pagamentos-serving-cliente') && rels.includes('pagamentos-serving-cliente#2'), rels.join());
  const { raw } = applyPlan(parallelBase(), answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.ok(!raw.model.relationships.some(r => r.from === 'pagamentos' || r.to === 'pagamentos'));
  assert.equal(raw.model.relationships.length, parallelBase().model.relationships.length - rels.length);
});

test('a delta view with a non-list status blocks the plan', () => {
  const plan = planMerge(shop(), delta({}, { views: [{ key: 'tobe', notation: 'c4', level: 'landscape', status: 'planned' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_VIEW_STATUS'));
});

test('a delta element with non-list aliases blocks the plan instead of matching letters', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'novo', type: 'c4:softwareSystem', name: 'Novo', aliases: 'loja' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_SCHEMA'));
});

// --- names the user kept become aliases, so the same delta does not ask again ---
test('duplicate answered same adds the delta id and name as aliases; re-planning asks nothing', () => {
  const d = delta({ elements: [{ id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' }] });
  const plan = planMerge(agendaBase(), d, TODAY);
  answer(plan, { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'keep' });
  const plan2 = planMerge(agendaBase(), d, { ...TODAY, answers: answersOf(plan) });
  const { raw } = applyPlan(agendaBase(), plan2, TODAY);
  const el = find(raw, 'sys.agenda');
  assert.equal(el.name, 'API de Agendamento');
  assert.deepEqual(el.aliases, ['API Agendamento', 'api-agenda']);
  const again = planMerge(raw, d, TODAY);
  assert.deepEqual(again.items.filter(i => 'resolution' in i), [], JSON.stringify(again.items));
  assert.equal(applyPlan(raw, again, TODAY).entry, null);
});

test('duplicate answered same with the name taken does not keep the new name as an alias', () => {
  const d = delta({ elements: [{ id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' }] });
  const plan = planMerge(agendaBase(), d, { ...TODAY, answers: { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'take' } });
  const { raw } = applyPlan(agendaBase(), plan, TODAY);
  assert.equal(find(raw, 'sys.agenda').name, 'API Agendamento');
  assert.deepEqual(find(raw, 'sys.agenda').aliases, ['api-agenda']);
});

test('a name conflict answered keep adds the delta name as an alias', () => {
  const d = delta({ elements: [{ id: 'loja.api', name: 'Orders API' }] });
  const plan = planMerge(shop(), d, { ...TODAY, answers: { 'el:loja.api:name': 'keep' } });
  const { raw, entry } = applyPlan(shop(), plan, TODAY);
  assert.equal(find(raw, 'loja.api').name, 'API');
  assert.deepEqual(find(raw, 'loja.api').aliases, ['Orders API']);
  assert.deepEqual(entry.changed, ['loja.api']);
  const again = planMerge(raw, d, TODAY);
  assert.ok(!again.items.some(i => i.class === 'conflict'), JSON.stringify(again.items));
});

// --- the note class reflects taken conflicts ---
test('an item whose only change is a taken conflict is enrich; kept is unchanged', () => {
  const d = delta({
    elements: [{ id: 'loja.api', technology: 'Kotlin' }],
    relationships: [{ from: 'cliente', to: 'loja.web', description: 'Navega' }],
  });
  const cls = (answers, key) => planMerge(shop(), d, { ...TODAY, answers }).items.find(i => i.key === key).class;
  assert.equal(cls({ 'el:loja.api:technology': 'take' }, 'el:loja.api'), 'enrich');
  assert.equal(cls({ 'el:loja.api:technology': 'keep' }, 'el:loja.api'), 'unchanged');
  assert.equal(cls({ 'rel:0:description': 'value:Navega e compra' }, 'rel:0'), 'enrich');
  assert.equal(cls({ 'rel:0:description': 'keep' }, 'rel:0'), 'unchanged');
});

test('retiring an element lists the saved views it would break (scope, anchor or focus, also via children)', () => {
  const base = shop();
  base.views.push(
    { key: 'comp', notation: 'c4', level: 'component', scope: 'loja.api' },
    { key: 'foco', notation: 'c4', level: 'container', scope: 'loja', focus: ['loja.api.checkout'] },
    { key: 'asis', notation: 'c4', level: 'component', scope: 'loja.api', status: ['active', 'retired'] },
  );
  const plan = planMerge(base, delta({}, { ops: [{ op: 'status', id: 'loja.api', status: 'retired' }] }), TODAY);
  assert.deepEqual(plan.items[0].views, ['comp', 'foco']);
  assert.match(formatPlanReport(plan), /status loja\.api: active → retired; visões que deixam de abrir: comp, foco/);
  const quiet = planMerge(base, delta({}, { ops: [{ op: 'status', id: 'pg', status: 'retired' }] }), TODAY);
  assert.equal(quiet.items[0].views, undefined);
});
