import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { diffRaw, contentVersion, applyOps } from '../scripts/lib/store/ops.mjs';
import { checkExpect } from '../scripts/lib/store/versions.mjs';
import { plan, apply } from '../scripts/lib/api.mjs';

const TODAY = { today: '2026-10-17' };
const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

// Two domains that do not touch: vendas and rh.
const base = () => ({
  raw: {
    archlens: '2.0', name: 'Empresa',
    model: {
      elements: [
        { id: 'vendas', type: 'application-component', name: 'Vendas', c4: { kind: 'softwareSystem' } },
        { id: 'vendas.api', type: 'application-component', name: 'API de Vendas', parent: 'vendas', c4: { kind: 'container' } },
        { id: 'rh', type: 'application-component', name: 'Recursos Humanos', c4: { kind: 'softwareSystem' } },
        { id: 'rh.folha', type: 'application-component', name: 'Folha de Pagamento', parent: 'rh', c4: { kind: 'container' } },
      ],
      relationships: [],
    },
    changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }],
  },
  notes: {},
});

const folder = kind => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-versions-'));
  const at = join(dir, 'architecture');
  mkdirSync(at);
  if (kind === 'markdown') writeFileSync(join(at, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'markdown' } }));
  const c = openStore(resolveBase(at, { create: true }));
  c.apply(diffRaw(c.read(), base()), { baseVersion: c.version() });
  return { dir, at, store: () => openStore(resolveBase(at)) };
};

const delta = (model, extra = {}) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
  model: { elements: [], relationships: [], ...model }, ...extra });
const container = (id, name, parent) => ({ id, type: 'application-component', name, parent, c4: { kind: 'container' } });

/** The final plan of `d`, answering its questions with `answers` (key → resolution; ops default to yes). */
function finalPlan(store, d, answers = {}) {
  const { plan: p } = plan(store, d, TODAY);
  if (p.state === 'final') return p;
  const given = new Map(p.items.filter(i => 'resolution' in i).map(i => [i.key, answers[i.key] ?? i.resolution ?? (i.class === 'op' ? 'yes' : null)]));
  const { plan: f } = plan(store, d, { ...TODAY, answers: given });
  assert.equal(f.state, 'final', JSON.stringify(f.items.filter(i => 'resolution' in i && i.resolution == null)));
  return f;
}

const snapshot = dir => {
  const out = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push([p, readFileSync(p, 'utf8')]); } };
  walk(dir);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};
const conflictOf = fn => {
  try { fn(); } catch (e) { assert.equal(e.code, 'E_STORE_CONFLICT', e.message); return e; }
  assert.fail('o apply deveria ser recusado');
};

const addVendas = () => delta({ elements: [container('vendas.cache', 'Cache de Pedidos', 'vendas')] });
const addRh = () => delta({ elements: [container('rh.portal', 'Portal do Colaborador', 'rh')] });

test('parallel plans on disjoint domains both apply', () => {
  const { store } = folder('markdown');
  const a = finalPlan(store(), addVendas());
  const b = finalPlan(store(), addRh());
  apply(store(), a);
  apply(store(), b);
  const ids = store().read().raw.model.elements.map(e => e.id);
  assert.ok(ids.includes('vendas.cache') && ids.includes('rh.portal'), ids.join(', '));
});

test('a plan that writes what another wrote is refused, listing the object', () => {
  const { at, store } = folder('markdown');
  const a = finalPlan(store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] }));
  const b = finalPlan(store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh', type: 'flow' }] }));
  apply(store(), a);
  const before = snapshot(at);
  const e = conflictOf(() => apply(store(), b));
  const c = e.conflicts.find(x => x.ref === 'element:vendas.api');
  assert.ok(c, JSON.stringify(e.conflicts));
  assert.equal(c.planned, b.objects['element:vendas.api']);
  assert.equal(c.current, store().objectVersions(['element:vendas.api']).get('element:vendas.api'));
  assert.notEqual(c.planned, c.current);
  assert.match(e.message, /API de Vendas/);
  assert.match(e.message, /archlens plan <base> --answers <plano> --out <novo>/);
  assert.deepEqual(snapshot(at), before);
});

test('a plan whose duplicate answer relied on an element another renamed is refused', () => {
  const { store } = folder('markdown');
  const d = delta({ elements: [container('rh.folha2', 'Folha de Pagamentos', 'rh')] });
  const { plan: open } = plan(store(), d, TODAY);
  const dup = open.items.find(i => i.class === 'possible-duplicate');
  assert.equal(dup?.candidate, 'rh.folha');
  const b = finalPlan(store(), d, { [dup.key]: 'different' });
  assert.ok(!b.ops.some(o => o.op === 'upsertElement' && o.element.id === 'rh.folha')); // read, not written
  const rename = delta({ elements: [{ id: 'rh.folha', type: 'application-component', name: 'Sistema de Holerites', parent: 'rh', c4: { kind: 'container' } }] });
  const { plan: ro } = plan(store(), rename, TODAY);
  const a = finalPlan(store(), rename, Object.fromEntries(ro.items.filter(i => i.class === 'conflict').map(i => [i.key, 'take'])));
  apply(store(), a);
  assert.equal(store().read().raw.model.elements.find(x => x.id === 'rh.folha').name, 'Sistema de Holerites');
  const e = conflictOf(() => apply(store(), b));
  assert.deepEqual(e.conflicts.map(x => x.ref), ['element:rh.folha']);
});

test('a new relationship to an element another removed is refused', () => {
  const { store } = folder('markdown');
  const b = finalPlan(store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] }));
  const a = finalPlan(store(), delta({}, { ops: [{ op: 'remove', id: 'rh.folha' }] }));
  apply(store(), a);
  const e = conflictOf(() => apply(store(), b));
  const c = e.conflicts.find(x => x.ref === 'element:rh.folha');
  assert.ok(c, JSON.stringify(e.conflicts));
  assert.equal(c.current, null);
  assert.ok(!e.conflicts.some(x => x.ref === 'element:vendas.api')); // A did not touch the origin
});

test('two plans creating the same concept with different ids: the second is refused as possible-duplicate', () => {
  const { store } = folder('markdown');
  const da = delta({ elements: [container('vendas.crm', 'CRM de Clientes', 'vendas')] });
  const db = delta({ elements: [container('rh.crm', 'CRM de Clientes', 'rh')] });
  const a = finalPlan(store(), da);
  const b = finalPlan(store(), db);
  apply(store(), a);
  const e = conflictOf(() => apply(store(), b));
  assert.deepEqual(e.conflicts, [{ ref: 'element:rh.crm', reason: 'possible-duplicate', candidate: 'vendas.crm' }]);
  assert.match(e.message, /CRM de Clientes/);
  assert.match(e.message, /--answers/);
  assert.ok(!store().read().raw.model.elements.some(x => x.id === 'rh.crm'));
  // Redone with the answers, the new plan asks about the duplicate.
  const { plan: again } = plan(store(), db, { ...TODAY, answers: new Map() });
  assert.ok(again.items.some(i => i.class === 'possible-duplicate' && i.candidate === 'vendas.crm'));
});

test('two applies on the same day get -01 and -02', () => {
  const { store } = folder('markdown');
  const a = finalPlan(store(), addVendas());
  const b = finalPlan(store(), addRh());
  assert.equal(a.entry.id, '2026-10-17-01');
  assert.equal(b.entry.id, '2026-10-17-01'); // provisional
  apply(store(), a);
  apply(store(), b);
  assert.deepEqual(store().history().map(e => e.id), ['2026-10-01-01', '2026-10-17-01', '2026-10-17-02']);
});

test('the apply returns the final entry id', () => {
  const { store } = folder('markdown');
  const a = finalPlan(store(), addVendas());
  const b = finalPlan(store(), addRh());
  assert.equal(apply(store(), a).entry.id, '2026-10-17-01');
  const res = apply(store(), b);
  assert.equal(res.entry.id, '2026-10-17-02');
  assert.deepEqual(res.entry, store().history().at(-1));
});

test('appendHistory numbers the round over the history it is appended to', () => {
  const cur = base();
  const entry = { id: '2026-10-01-01', date: '2026-10-01', summary: 'outra', added: [], changed: [], status: {}, removed: [], decisions: [] };
  const next = applyOps(cur, [{ op: 'appendHistory', entry }, { op: 'appendHistory', entry: { ...entry, id: '2026-10-01-01' } }]);
  assert.deepEqual(next.raw.changelog.map(e => e.id), ['2026-10-01-01', '2026-10-01-02', '2026-10-01-03']);
  // A history copied as it is (store convert) keeps its ids.
  assert.deepEqual(applyOps(null, diffRaw(null, cur)).raw.changelog, cur.raw.changelog);
});

test('the json connector keeps whole-base versioning', () => {
  const { at, store } = folder('json');
  assert.equal(store().versioning, 'base');
  const a = finalPlan(store(), addVendas());
  const b = finalPlan(store(), addRh());
  apply(store(), a);
  const before = snapshot(at);
  conflictOf(() => apply(store(), b));
  assert.deepEqual(snapshot(at), before);
});

test('a plan without objects (older archlens) is checked against the whole base on an object connector', () => {
  const { store } = folder('markdown');
  assert.equal(store().versioning, 'object');
  const strip = ({ objects, knownCandidates, ...rest }) => rest;
  const a = strip(finalPlan(store(), addVendas()));
  const b = strip(finalPlan(store(), addRh()));
  apply(store(), a);
  conflictOf(() => apply(store(), b));
});

test('the connector checks the expected versions itself, before writing', () => {
  const { at, store } = folder('markdown');
  const s = store();
  const refs = ['element:vendas.api', 'element:rh.novo'];
  const expect = Object.fromEntries(s.objectVersions(refs));
  assert.equal(expect['element:rh.novo'], null);
  assert.deepEqual(checkExpect(s.objectVersions(refs), expect), []);
  const stale = { ...expect, 'element:vendas.api': 'sha256:velha' };
  assert.deepEqual(checkExpect(s.objectVersions(refs), stale), [{ ref: 'element:vendas.api', planned: 'sha256:velha', current: expect['element:vendas.api'] }]);
  const before = snapshot(at);
  const e = conflictOf(() => s.apply([{ op: 'putNote', name: 'notes', text: 'x' }], { expect: stale }));
  assert.deepEqual(e.conflicts.map(c => c.ref), ['element:vendas.api']);
  assert.deepEqual(snapshot(at), before);
  assert.equal(contentVersion(store().read()), contentVersion(s.read()));
});

test('CLI: a conflict names the objects and how to redo the plan with --answers', () => {
  const { dir } = folder('markdown');
  writeFileSync(join(dir, 'a.json'), JSON.stringify(delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] })));
  writeFileSync(join(dir, 'b.json'), JSON.stringify(delta({ relationships: [{ from: 'vendas.api', to: 'rh', type: 'flow' }] })));
  writeFileSync(join(dir, 'c.json'), JSON.stringify(addRh()));
  for (const x of ['a', 'b', 'c']) assert.equal(run(['plan', 'architecture', `${x}.json`, '--out', `p${x}.json`], dir).status, 0);
  let r = run(['apply', 'architecture', 'pa.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  r = run(['apply', 'architecture', 'pc.json'], dir); // disjoint: applies, and says its final round
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2026-\d\d-\d\d-02/);
  r = run(['apply', 'architecture', 'pb.json'], dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /E_STORE_CONFLICT/);
  assert.match(r.stderr, /API de Vendas/);
  assert.match(r.stderr, /archlens plan architecture --answers pb\.json --out pb-2\.json/);
  assert.doesNotMatch(r.stderr, /<base>|<plano>|<novo>/);
});
