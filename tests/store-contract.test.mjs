import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { checkConnector, CONNECTOR_METHODS } from '../scripts/lib/store/contract.mjs';
import { writeFilesAtomically } from '../scripts/lib/store/atomic.mjs';
import { diffRaw, contentVersion } from '../scripts/lib/store/ops.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const sample = () => ({ raw: { ...shop(), changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }] },
  notes: { overview: 'Propósito.', notes: 'Riscos.' } });

// Connector factories: an empty folder ready to become a base of that kind.
export const KINDS = [
  ['json', dir => dir],
  ['json com model/', dir => { writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', layout: { model: 'model/' } })); return dir; }],
  ['markdown', dir => { writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'markdown' } })); return dir; }],
];
const fresh = prepare => { const dir = mkdtempSync(join(tmpdir(), 'archlens-contract-')); prepare(dir); return dir; };
const connectorAt = dir => checkConnector(openStore(resolveBase(dir, { create: true })));
const create = (dir, base = sample()) => {
  const c = connectorAt(dir);
  const cur = c.read();
  c.apply(diffRaw(cur, base), { baseVersion: c.version() });
  return connectorAt(dir);
};
const snapshot = dir => {
  const out = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push([p, readFileSync(p, 'utf8')]); } };
  walk(dir);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};
const TODAY = { today: '2026-10-17' };
const mergedWith = (base, delta) => {
  const plan = planMerge(base.raw, delta, TODAY);
  for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'op' ? 'yes' : 'take';
  return { raw: applyPlan(base.raw, plan, TODAY).raw, notes: base.notes };
};

for (const [kind, prepare] of KINDS) {
  test(`[${kind}] the connector offers the contract`, () => {
    const c = connectorAt(fresh(prepare));
    for (const m of CONNECTOR_METHODS) assert.equal(typeof c[m], 'function', m);
  });

  test(`[${kind}] read after apply returns the base, for a new base and for a merge`, () => {
    const dir = fresh(prepare);
    const c = create(dir);
    assert.equal(contentVersion(c.read()), contentVersion(sample()));
    const next = mergedWith(c.read(), { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
      model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }], relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses' }] },
      ops: [{ op: 'remove', id: 'pagamentos' }] });
    c.apply(diffRaw(c.read(), next), { baseVersion: c.version() });
    assert.equal(contentVersion(connectorAt(dir).read()), contentVersion(next));
    assert.deepEqual(validateModel(connectorAt(dir).read().raw).errors, []);
  });

  test(`[${kind}] version changes with an effective apply and not with an empty one`, () => {
    const c = create(fresh(prepare));
    const v0 = c.version();
    assert.equal(c.apply([], { baseVersion: v0 }).version, v0);
    assert.equal(c.version(), v0);
    const v1 = c.apply([{ op: 'putNote', name: 'notes', text: 'Outro risco.' }], { baseVersion: v0 }).version;
    assert.notEqual(v1, v0);
    assert.equal(c.version(), v1);
  });

  test(`[${kind}] a stale version, a bad op or a failing write leave every file as it was`, () => {
    const dir = fresh(prepare);
    const c = create(dir);
    const before = snapshot(dir);
    assert.throws(() => c.apply([{ op: 'putNote', name: 'notes', text: 'x' }], { baseVersion: 'sha256:velha' }), e => e.code === 'E_STORE_CONFLICT');
    assert.throws(() => c.apply([{ op: 'putNote', name: 'notes', text: 'x' }, { op: 'apagar' }], { baseVersion: c.version() }), e => e.code === 'E_STORE_OP');
    assert.deepEqual(snapshot(dir), before);
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      // Read-only folders (the base and notes/, where the note lives): the first temp file already fails.
      const dirs = [dir, join(dir, 'notes')];
      for (const d of dirs) chmodSync(d, 0o555);
      try { assert.throws(() => c.apply([{ op: 'putNote', name: 'notes', text: 'x' }], { baseVersion: c.version() })); } finally { for (const d of dirs) chmodSync(d, 0o755); }
      assert.deepEqual(snapshot(dir), before);
    }
  });

  test(`[${kind}] history returns the rounds in order`, () => {
    const c = create(fresh(prepare));
    const entry = n => ({ id: `2026-10-17-0${n}`, date: '2026-10-17', summary: `r${n}`, added: [], changed: [], status: {}, removed: [], decisions: [] });
    c.apply([{ op: 'appendHistory', entry: entry(1) }], { baseVersion: c.version() });
    c.apply([{ op: 'appendHistory', entry: entry(2) }], { baseVersion: c.version() });
    assert.deepEqual(c.history().map(e => e.summary), ['início', 'r1', 'r2']);
  });

  test(`[${kind}] readSubgraph follows seeds, depth, via and parents, and the result validates`, () => {
    const c = create(fresh(prepare));
    const ids = q => c.readSubgraph(q).raw.model.elements.map(e => e.id).sort();
    assert.deepEqual(ids({ seeds: ['loja.api.checkout'], depth: 0 }), ['loja', 'loja.api', 'loja.api.checkout']);
    const one = ids({ seeds: ['loja.api.checkout'], depth: 1 });
    for (const id of ['loja.db', 'pagamentos', 'app-svc-checkout', 'loja.api']) assert.ok(one.includes(id), id);
    assert.ok(!ids({ seeds: ['loja.api.checkout'], depth: 1, via: ['realization'] }).includes('pagamentos'));
    assert.deepEqual(validateModel(c.readSubgraph({ seeds: ['loja.api.checkout'], depth: 1 }).raw).errors, []);
    assert.throws(() => c.readSubgraph({ seeds: ['nada'] }), e => e.code === 'E_UNKNOWN_REF');
  });

  test(`[${kind}] files the base does not own survive any apply`, () => {
    const dir = fresh(prepare);
    const c = create(dir);
    mkdirSync(join(dir, 'diagrams')); writeFileSync(join(dir, 'diagrams', 'a.html'), '<html></html>');
    mkdirSync(join(dir, '.obsidian')); writeFileSync(join(dir, '.obsidian', 'app.json'), '{}');
    writeFileSync(join(dir, 'solto.md'), '# Solto\n');
    const empty = { raw: { ...c.read().raw, model: { elements: [], relationships: [] }, views: [] }, notes: c.read().notes };
    c.apply(diffRaw(c.read(), empty), { baseVersion: c.version() });
    for (const f of ['diagrams/a.html', '.obsidian/app.json', 'solto.md']) assert.ok(existsSync(join(dir, f)), f);
  });
}

test('a manifest with an unknown store kind is refused', () => {
  const dir = fresh(d => writeFileSync(join(d, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'neo4j' } })));
  assert.throws(() => openStore(resolveBase(dir)), e => e.code === 'E_STORE_UNSUPPORTED');
});

test('a failed atomic write removes the folders it created for its temp files, and only those', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-atomic-'));
  mkdirSync(join(dir, 'node'));
  const fail = () => { throw new Error('mudou'); };
  assert.throws(() => writeFilesAtomically(dir, new Map([['device/a.md', 'a'], ['x/y/z/b.md', 'b'], ['node/c.md', 'c']]), { check: fail }), /mudou/);
  assert.deepEqual(readdirSync(dir).sort(), ['node']);
  assert.deepEqual(readdirSync(join(dir, 'node')), [], 'the folder that was there stays, without temp files');
});
