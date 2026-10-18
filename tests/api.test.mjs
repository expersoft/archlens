import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plan, finalize, answersOf, isFinal } from '../scripts/lib/api.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { applyOps, contentVersion } from '../scripts/lib/store/ops.mjs';
import { subgraphOf, conflictError } from '../scripts/lib/store/contract.mjs';
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
      return {};
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
