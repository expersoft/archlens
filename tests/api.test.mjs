import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan, finalize, answersOf, isFinal, apply } from '../scripts/lib/api.mjs';
import { planMerge, applyPlan, canonicalJson, relationshipIds } from '../scripts/lib/merge.mjs';
import { applyOps, contentVersion } from '../scripts/lib/store/ops.mjs';
import { subgraphOf, conflictError } from '../scripts/lib/store/contract.mjs';
import { fileURLToPath } from 'node:url';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const SRC = { kind: 'prompt', ref: 'rodada 1', date: '2026-10-01' };
const TODAY = { today: '2026-10-01' };
const delta = (model = {}, extra = {}) => ({ 'archlens-delta': '1.0', source: SRC, summary: 'teste',
  model: { elements: [], relationships: [], ...model }, ...extra });
const answer = (p, map) => { for (const it of p.items) if (it.key in map) it.resolution = map[it.key]; return p; };
const answersMap = p => new Map(p.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution]));

/** In-memory connector over `base` ({ raw, notes } or null), recording each method called. */
function memStore(base) {
  let cur = base ? { raw: structuredClone(base), notes: {} } : null;
  const calls = [];
  const track = (name, fn) => (...a) => { calls.push(name); return fn(...a); };
  return {
    calls,
    locator: { path: '/x/architecture' },
    read: track('read', () => (cur ? structuredClone(cur) : null)),
    version: track('version', () => contentVersion(cur)),
    apply: track('apply', (ops, { baseVersion } = {}) => {
      const now = contentVersion(cur);
      if (baseVersion !== undefined && baseVersion !== now) throw conflictError(baseVersion, now);
      cur = applyOps(cur, ops);
      return { version: contentVersion(cur), preserved: [] };
    }),
    history: track('history', () => cur?.raw.changelog ?? []),
    readSubgraph: track('readSubgraph', opts => subgraphOf(cur.raw, opts)),
  };
}

const renameApi = () => delta({ elements: [{ id: 'loja.api', type: 'c4:container', name: 'API Nova' }] });
const addCache = () => delta({ elements: [{ id: 'loja.cache', type: 'c4:container', name: 'Cache', parent: 'loja' }] });
const agendaBase = () => {
  const base = shop();
  const extra = asBase({ archlens: '1.0', model: { elements: [{ id: 'sys', type: 'c4:softwareSystem', name: 'Agenda', children: [
    { id: 'sys.agenda', type: 'c4:container', name: 'API de Agendamento', technology: 'Node.js' },
    { id: 'sys.db', type: 'c4:container', name: 'Banco de agendas', technology: 'PostgreSQL', tags: ['database'] },
  ] }], relationships: [{ from: 'sys.agenda', to: 'sys.db', type: 'uses', description: 'Lê e grava agendas' }] } }).model;
  base.model.elements.push(...extra.elements);
  base.model.relationships.push(...extra.relationships);
  return base;
};
const dupDelta = () => delta({
  elements: [{ id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' }],
  relationships: [{ from: 'api-agenda', to: 'sys.db', type: 'uses', description: 'grava' }],
});

test('an unanswered plan is open and equals merge --plan', () => {
  const store = memStore(shop());
  const d = renameApi();
  const { plan: p } = plan(store, d, TODAY);
  const storeVersion = contentVersion({ raw: shop(), notes: {} });
  assert.deepEqual(p, { ...planMerge(shop(), d, { base: 'architecture', storeVersion, today: '2026-10-01' }), state: 'open' });
  assert.equal(p.state, 'open');
  assert.ok(!('ops' in p) && !('entry' in p));
  assert.equal(isFinal(p), false);
});

test('a plan with every question answered is final, with store ops ending in appendHistory', () => {
  const d = renameApi();
  const open = plan(memStore(shop()), d, TODAY).plan;
  const key = open.items.find(i => i.class === 'conflict').key;
  const { plan: p } = plan(memStore(shop()), d, { ...TODAY, answers: answersMap(answer(open, { [key]: 'keep' })) });
  assert.equal(p.state, 'final');
  assert.equal(isFinal(p), true);
  assert.equal(p.ops.at(-1).op, 'appendHistory');
  assert.deepEqual(p.ops.at(-1).entry, p.entry);
  assert.deepEqual(p.entry, applyPlan(shop(), p, TODAY).entry);
});

test('a delta without questions is final on the first plan', () => {
  const { plan: p } = plan(memStore(shop()), addCache(), TODAY);
  assert.equal(p.state, 'final');
  assert.ok(p.ops.some(o => o.op === 'upsertElement' && o.element.id === 'loja.cache'));
  assert.equal(p.ops.at(-1).op, 'appendHistory');
});

test('a blocked plan stays open', () => {
  const d = delta({ relationships: [{ from: 'loja', to: 'nao-existe', type: 'uses' }] });
  const { plan: p } = plan(memStore(shop()), d, TODAY);
  assert.equal(p.blocked, true);
  assert.equal(p.state, 'open');
  assert.ok(!('ops' in p));
});

test('a duplicate answered same can reopen the plan with follow-up questions', () => {
  const open = plan(memStore(agendaBase()), dupDelta(), TODAY).plan;
  assert.equal(open.state, 'open');
  answer(open, { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'keep' });
  const { plan: p } = plan(memStore(agendaBase()), dupDelta(), { ...TODAY, answers: answersMap(open) });
  assert.equal(p.state, 'open');
  const rel = p.items.find(i => i.key === 'rel:0:description');
  assert.equal(rel.resolution, null);
});

test('a plan that changes nothing is final with no ops and no entry', () => {
  const { plan: p } = plan(memStore(shop()), delta(), TODAY);
  assert.equal(p.state, 'final');
  assert.deepEqual(p.ops, []);
  assert.equal(p.entry, null);
});

test('a plan on a missing base has storeVersion null and starts with setManifest', () => {
  const store = memStore(null);
  const { plan: p } = plan(store, delta({ elements: [{ id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }] }), TODAY);
  assert.equal(p.storeVersion, null);
  assert.equal(p.state, 'final');
  assert.equal(p.ops[0].op, 'setManifest');
});

test('answersOf reads open and final plans alike; without a delta it uses the plan\'s', () => {
  const d = renameApi();
  const open = plan(memStore(shop()), d, TODAY).plan;
  const key = open.items.find(i => i.class === 'conflict').key;
  answer(open, { [key]: 'keep' });
  const { plan: fin } = plan(memStore(shop()), d, { ...TODAY, answers: answersMap(open) });
  const a = answersOf(open), b = answersOf(fin);
  assert.deepEqual(a.answers, b.answers);
  assert.equal(a.answers.get(key), 'keep');
  assert.deepEqual(a.delta, open.delta);
  assert.equal(a.otherDelta, false);
  assert.equal(answersOf(fin, d).otherDelta, false);
  const other = answersOf(fin, addCache());
  assert.equal(other.otherDelta, true);
  assert.deepEqual(other.delta, addCache());
});

test('answers that no longer match are ignored and leave the plan open', () => {
  const { plan: p } = plan(memStore(agendaBase()), dupDelta(), { ...TODAY, answers: new Map([['nao:existe', 'x'], ['dup:api-agenda', 'talvez']]) });
  assert.equal(p.items.find(i => i.key === 'dup:api-agenda').resolution, null);
  assert.equal(p.state, 'open');
});

test('answersOf refuses what is not a plan', () => {
  assert.throws(() => answersOf(renameApi()), e => e.code === 'E_PLAN_SCHEMA');
  assert.throws(() => answersOf(null), e => e.code === 'E_PLAN_SCHEMA');
});

test('finalize keeps applyPlan errors for pending answers and stale plans', () => {
  const d = renameApi();
  const open = plan(memStore(shop()), d, TODAY).plan;
  assert.throws(() => finalize(memStore(shop()), open, TODAY), e => e.code === 'E_PLAN_PENDING');
  const key = open.items.find(i => i.class === 'conflict').key;
  answer(open, { [key]: 'keep' });
  const { plan: fin } = finalize(memStore(shop()), open, TODAY);
  assert.equal(fin.state, 'final');
  assert.equal(fin.ops.at(-1).op, 'appendHistory');
  // store changed since the plan: version mismatch
  const moved = shop();
  moved.model.elements.push({ id: 'x', type: 'c4:softwareSystem', name: 'X' });
  assert.throws(() => finalize(memStore(moved), open, TODAY), e => e.code === 'E_STORE_CONFLICT');
  // plan without storeVersion: applyPlan checks the base hash
  const legacy = structuredClone(open);
  delete legacy.storeVersion;
  assert.throws(() => finalize(memStore(moved), legacy, TODAY), e => e.code === 'E_PLAN_STALE');
});

// --- apply ---
const find = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const parallelBase = () => {
  const base = shop();
  base.model.relationships.push(
    { from: 'pagamentos', to: 'cliente', type: 'serving', description: 'lê' },
    { from: 'pagamentos', to: 'cliente', type: 'serving', description: 'grava' },
  );
  return base;
};
const aliased = () => { const b = shop(); find(b, 'loja.api').aliases = ['orders-service']; return b; };
// The ops carry the generated id of each relationship they write, which merge --apply leaves implicit: same base.
const sameBase = raw => {
  const out = structuredClone(raw);
  const ids = relationshipIds(out);
  for (const r of out.model.relationships) if (r.id === ids.get(r)) delete r.id;
  return canonicalJson(out);
};
const finalPlan = (store, d, answers) => plan(store, d, { ...TODAY, answers: new Map(Object.entries(answers ?? {})) }).plan;

test('apply writes only through the connector and never replays the merge', () => {
  const store = memStore(shop());
  const { plan: p } = plan(store, addCache(), TODAY);
  const hollow = { ...p, delta: {}, items: [] };
  store.calls.length = 0;
  const res = apply(store, hollow);
  assert.ok(store.calls.every(c => ['read', 'version', 'apply'].includes(c)), store.calls.join());
  assert.ok(store.calls.includes('apply'));
  assert.deepEqual(res.entry, p.entry);
  assert.ok(find(store.read().raw, 'loja.cache'));
});

// base, delta and answers of the merge-test scenarios; each one must end up with the same base through the api as
// through planMerge + applyPlan (a "same" answer needs a second plan, as in the real flow).
const SCENARIOS = {
  'enrich by id': [shop, delta({ elements: [{ id: 'loja.api', type: 'c4:container', description: 'Pedidos e checkout', tags: ['core'] }] }), {}],
  'conflict take': [shop, delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }] }), { 'el:loja.api:technology': 'take' }],
  'conflict value': [shop, delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }] }), { 'el:loja.api:technology': 'value:Kotlin / Spring Boot' }],
  'new element': [shop, delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja', technology: 'Node.js' }] }), {}],
  'alias matching': [aliased, delta({ elements: [
    { id: 'orders-worker', type: 'c4:component', name: 'Consumidor', parent: 'orders-service' },
    { id: 'orders-service', type: 'c4:container', description: 'Pedidos' },
    { id: 'gw', type: 'c4:softwareSystem', aliases: ['pagamentos'] },
  ] }), {}],
  'removed element moves relationships': [shop, delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', external: true }],
    relationships: [{ from: 'loja.api', to: 'gateway-pag', type: 'uses', description: 'cobra' }] },
  { ops: [{ op: 'remove', id: 'pagamentos', reason: 'substituído por gateway-pag' }] }), { 'op:0': 'yes' }],
  'uses matches serving': [shop, delta({ relationships: [{ from: 'loja.api', to: 'k8s', type: 'uses', technology: 'containerd' }] }), {}],
  'relationship conflict': [shop, delta({ relationships: [
    { from: 'cliente', to: 'loja.web', description: 'Navega e compra' },
    { from: 'loja.api.checkout', to: 'loja.api.catalogo', description: 'Consulta preço' },
  ] }), { 'rel:0:description': 'keep' }],
  'views and assumptions': [aliased, delta({}, {
    views: [{ key: 'comp', notation: 'c4', level: 'component', scope: 'orders-service' },
      { key: 'ctx', notation: 'c4', level: 'context', scope: 'loja', title: 'Contexto' }],
    assumptions: ['O ERP é SaaS'],
  }), { 'view:ctx': 'take' }],
  'rename and alias': [shop, delta({}, { ops: [{ op: 'rename', id: 'loja.api', name: 'Orders API' }, { op: 'alias', id: 'loja.api', add: ['orders-service'] }] }), {}],
  'status': [shop, delta({}, { ops: [
    { op: 'status', id: 'pagamentos', status: 'deprecated', reason: 'troca de adquirente' },
    { op: 'status', id: 'k8s', status: 'retired', reason: 'migrado para ECS' },
  ] }), { 'op:1': 'no' }],
  'remove cascade': [shop, delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] }), { 'op:0': 'yes' }],
  'remove relationship id': [shop, delta({}, { ops: [{ op: 'remove', id: 'k8s-serving-loja.api' }] }), { 'op:0': 'yes' }],
  'duplicate same with relationship': [agendaBase, dupDelta(), { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'keep', 'rel:0:description': 'take' }],
  'remove parallel relationship': [parallelBase, delta({}, { ops: [{ op: 'remove', id: 'pagamentos-serving-cliente#2' }] }), { 'op:0': 'yes' }],
  'duplicate same adds aliases': [agendaBase, delta({ elements: [{ id: 'api-agenda', type: 'c4:container', name: 'API Agendamento', parent: 'sys' }] }),
    { 'dup:api-agenda': 'same', 'el:api-agenda:name': 'keep' }],
};

for (const [name, [base, d, answers]] of Object.entries(SCENARIOS)) {
  test(`apply reproduces merge --apply: ${name}`, () => {
    const store = memStore(base());
    const given = new Map(Object.entries(answers));
    let p = plan(store, d, { ...TODAY, answers: given }).plan;
    if (p.state === 'open') p = plan(store, d, { ...TODAY, answers: answersOf(p).answers }).plan;
    assert.equal(p.state, 'final', JSON.stringify(p.items.filter(i => 'resolution' in i && i.resolution == null)));
    let ref = planMerge(base(), d, { ...TODAY, answers: given });
    if (Object.keys(answers).some(k => k.startsWith('dup:'))) ref = planMerge(base(), d, { ...TODAY, answers: answersMap(ref) });
    apply(store, p);
    assert.equal(sameBase(store.read().raw), sameBase(applyPlan(base(), ref, TODAY).raw));
  });
}

test('apply reproduces merge --apply for telemedicina delta-02', () => {
  const dir = fileURLToPath(new URL('../examples/telemedicina/', import.meta.url));
  const loaded = openStore(resolveBase('ARCHITECTURE.md', { cwd: dir })).read();
  const base = () => structuredClone(loaded.raw);
  const d = JSON.parse(readFileSync(new URL('../examples/telemedicina/delta-02.json', import.meta.url)));
  const open = planMerge(base(), d, TODAY);
  const byN = { 3: 'take', 5: 'same', 6: 'keep', 12: 'yes' };
  const fill = p => { for (const it of p.items) if (it.n in byN && 'resolution' in it) it.resolution = byN[it.n]; return p; };
  const second = planMerge(base(), d, { ...TODAY, answers: answersMap(fill(open)) });
  const refPlan = planMerge(base(), d, { ...TODAY, answers: answersMap(fill(second)) });
  const mem = memStore(loaded.raw);
  const answers = new Map(answersMap(fill(second)));
  let p = plan(mem, d, { ...TODAY, answers }).plan;
  if (p.state === 'open') p = plan(mem, d, { ...TODAY, answers: new Map([...answers, ...answersOf(fill(p)).answers]) }).plan;
  assert.equal(p.state, 'final', JSON.stringify(p.items.filter(i => i.resolution === null)));
  apply(mem, p);
  assert.equal(sameBase(mem.read().raw), sameBase(applyPlan(base(), refPlan, TODAY).raw));
});

test('apply refuses a stale plan and writes nothing', () => {
  const store = memStore(shop());
  const { plan: p } = plan(store, addCache(), TODAY);
  apply(memStore(shop()), p); // sanity: the plan is good on the base it was made for
  const moved = shop();
  moved.model.elements.push({ id: 'x', type: 'c4:softwareSystem', name: 'X' });
  const other = memStore(moved);
  const before = contentVersion(other.read());
  assert.throws(() => apply(other, p), e => e.code === 'E_STORE_CONFLICT' && /nada foi gravado/.test(e.message)
    && /archlens plan <base> --answers <plano> --out <novo>/.test(e.message));
  assert.equal(contentVersion(other.read()), before);
});

test('apply refuses a plan made for another base', () => {
  const { plan: p } = plan(memStore(shop()), addCache(), TODAY);
  assert.throws(() => apply(memStore(agendaBase()), p), e => e.code === 'E_STORE_CONFLICT');
  assert.throws(() => apply(memStore(null), p), e => e.code === 'E_STORE_CONFLICT');
});

test('apply creates a missing base', () => {
  const d = delta({ elements: [{ id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }] }, { name: 'Nova base' });
  const store = memStore(null);
  const { plan: p } = plan(store, d, TODAY);
  const res = apply(store, p);
  assert.equal(store.read().raw.name, 'Nova base');
  assert.ok(find(store.read().raw, 'novo'));
  assert.deepEqual(res.entry, p.entry);
});

test('apply refuses an open plan', () => {
  const store = memStore(shop());
  const { plan: p } = plan(store, renameApi(), TODAY);
  assert.throws(() => apply(store, p), e => e.code === 'E_PLAN_OPEN' && /1 pergunta\(s\) sem resposta: item\(ns\) 1;/.test(e.message)
    && /archlens plan <base> --answers <plano> --out <novo>/.test(e.message));
  assert.ok(!store.calls.includes('apply'));
});

test('apply refuses what is not a plan', () => {
  const store = memStore(shop());
  assert.throws(() => apply(store, renameApi()), e => e.code === 'E_PLAN_SCHEMA');
  assert.throws(() => apply(store, {}), e => e.code === 'E_PLAN_SCHEMA');
});

test('apply with no ops returns without touching the connector', () => {
  const store = memStore(shop());
  const { plan: p } = plan(store, delta(), TODAY);
  store.calls.length = 0;
  assert.deepEqual(apply(store, p), { version: null, entry: null, preserved: [] });
  assert.ok(!store.calls.includes('apply'));
});

test('apply refuses a hand-edited plan that breaks the model', () => {
  const store = memStore(shop());
  const { plan: p } = plan(store, addCache(), TODAY);
  const bad = { ...p, ops: [{ op: 'upsertRelationship', relationship: { id: 'x-serving-loja', from: 'nao-existe', to: 'loja', type: 'serving' } }, ...p.ops] };
  const before = contentVersion(store.read());
  assert.throws(() => apply(store, bad), e => e.code === 'E_MERGE_INVALID' && e.errors.length > 0);
  assert.equal(contentVersion(store.read()), before);
});

test('apply words a conflict raised by the connector itself like a stale plan', () => {
  const store = memStore(shop());
  const { plan: p } = plan(store, addCache(), TODAY);
  const racing = { ...store, apply: () => { throw conflictError(p.storeVersion, 'sha256:abc'); } };
  assert.throws(() => apply(racing, p), e => e.code === 'E_STORE_CONFLICT' && /a base mudou depois do plano \(/.test(e.message));
});
