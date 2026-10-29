import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffRaw, applyOps, contentVersion, manifestOf, OPS } from '../scripts/lib/store/ops.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const TODAY = { today: '2026-10-17' };
const delta = (model = {}, extra = {}) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
  model: { elements: [], relationships: [], ...model }, ...extra });
const answerAll = plan => { for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'op' ? 'yes' : 'take'; return plan; };
const merged = (base, d) => applyPlan(base, answerAll(planMerge(base, d, TODAY)), TODAY).raw;
const roundTrip = (before, after) => applyOps(before, diffRaw(before, after));

// Pairs of bases the merge produces: new, removed, renamed, moved and retyped elements, parallel relationships, views, notes.
const pairs = () => {
  const base = shop();
  const withNotes = { raw: base, notes: { overview: 'Visão.' } };
  return [
    ['novo elemento e relação', withNotes, { raw: merged(base, delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }],
      relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses', description: 'grava' }] })), notes: { overview: 'Visão.' } }],
    ['remoção em cascata', withNotes, { raw: merged(base, delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] })), notes: { overview: 'Visão.' } }],
    ['rename e status', withNotes, { raw: merged(base, delta({}, { ops: [{ op: 'rename', id: 'loja.web', name: 'Vitrine' }, { op: 'status', id: 'k8s', status: 'deprecated' }] })), notes: { overview: 'Visão.' } }],
    ['mudança de pai', withNotes, { raw: merged(base, delta({ elements: [{ id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }, { id: 'loja.web', type: 'c4:container', parent: 'novo' }] })), notes: { overview: 'Visão.' } }],
    ['relações paralelas', withNotes, { raw: merged(base, delta({ relationships: [{ from: 'cliente', to: 'pagamentos', type: 'uses', description: 'lê' }, { from: 'cliente', to: 'pagamentos', type: 'uses', description: 'grava' }] })), notes: { overview: 'Visão.' } }],
    ['visão nova e nota mudada', withNotes, { raw: merged(base, delta({}, { views: [{ key: 'nova', notation: 'c4', level: 'landscape' }] })), notes: { overview: 'Visão nova.', notes: 'Riscos.' } }],
    ['base nova', null, { raw: base, notes: {} }],
  ];
};

for (const [name, before, after] of pairs()) {
  test(`applyOps(before, diffRaw(before, after)) reproduces after: ${name}`, () => {
    assert.equal(contentVersion(roundTrip(before, after)), contentVersion(after));
  });
}

test('diffRaw of a base with itself is empty, and contentVersion ignores order, explicit ids and empty fields', () => {
  const b = { raw: shop(), notes: { notes: 'N.' } };
  assert.deepEqual(diffRaw(b, structuredClone(b)), []);
  const shuffled = structuredClone(b);
  shuffled.raw.model.elements.reverse();
  shuffled.raw.model.relationships.forEach(r => { r.id ??= `${r.from}-${r.type}-${r.to}`; });
  shuffled.raw.model.elements[0].aliases = [];
  assert.equal(contentVersion(shuffled), contentVersion(b));
  assert.notEqual(contentVersion({ ...b, notes: { notes: 'Outra.' } }), contentVersion(b));
  assert.equal(contentVersion(null), null);
  assert.match(contentVersion(b), /^sha256:[0-9a-f]{64}$/);
});

test('diffRaw orders ops: manifest, relationship and element removals, element upserts parents first, relationships, views, notes, history', () => {
  const before = { raw: shop(), notes: {} };
  const after = { raw: merged(before.raw, delta({ elements: [{ id: 'novo.c', type: 'c4:container', name: 'C', parent: 'novo' }, { id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }],
    relationships: [{ from: 'novo.c', to: 'loja.api', type: 'uses' }] }, { ops: [{ op: 'remove', id: 'pg' }], name: 'Outro nome' })), notes: { overview: 'O.' } };
  after.raw.name = 'Outro nome';
  const kinds = diffRaw(before, after).map(o => o.op);
  const firstOf = k => kinds.indexOf(k), lastOf = k => kinds.lastIndexOf(k);
  assert.equal(kinds[0], 'setManifest');
  assert.ok(lastOf('removeRelationship') < firstOf('removeElement'));
  assert.ok(lastOf('removeElement') < firstOf('upsertElement'));
  assert.ok(lastOf('upsertElement') < firstOf('upsertRelationship'));
  assert.ok(lastOf('upsertRelationship') < firstOf('putNote'));
  assert.equal(kinds.at(-1), 'appendHistory');
  const ups = diffRaw(before, after).filter(o => o.op === 'upsertElement').map(o => o.element.id);
  assert.ok(ups.indexOf('novo') < ups.indexOf('novo.c'), 'parents first');
  assert.ok(diffRaw(before, after).filter(o => o.op === 'upsertRelationship').every(o => typeof o.relationship.id === 'string'));
});

test('history only grows; bad ops are refused before anything changes', () => {
  const b = { raw: { ...shop(), changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'a' }] }, notes: {} };
  const rewritten = structuredClone(b);
  rewritten.raw.changelog[0].summary = 'outro';
  assert.throws(() => diffRaw(b, rewritten), e => e.code === 'E_STORE_HISTORY');
  for (const bad of [[{ op: 'apagarTudo' }], [{ op: 'upsertElement', element: { name: 'sem id' } }], [{ op: 'putNote', name: 'diario', text: 'x' }], 'nao-lista']) {
    assert.throws(() => applyOps(b, bad), e => e.code === 'E_STORE_OP', JSON.stringify(bad));
  }
  assert.deepEqual(OPS, ['setManifest', 'upsertElement', 'removeElement', 'upsertRelationship', 'removeRelationship', 'putView', 'removeView', 'putNote', 'appendHistory']);
  assert.ok(!('model' in manifestOf(b.raw)) && !('changelog' in manifestOf(b.raw)) && manifestOf(b.raw).name === 'Loja Mini');
});
