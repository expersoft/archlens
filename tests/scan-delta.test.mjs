import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { summarize, deployablesOf, formatSummary } from '../scripts/lib/scan/summary.mjs';
import { norm, repoKey } from '../scripts/lib/scan/to-delta.mjs';

const inv = (facts, repo = {}) => ({ 'archlens-inventory': '1.0', repo: { path: '/r/terminus-assignment-api', name: 'terminus-assignment-api', commit: 'abcdef1234', dirty: false, scannedAt: '2026-10-03', ...repo },
  files: { compose: 0, k8s: 0, helm: 0, terraform: 0, openapi: 0, asyncapi: 0, graphify: 0, build: 0, ignored: 0 }, facts });
const at = { file: 'x', line: 1 };
const terminus = (extra = {}) => normalizeModel({ archlens: '1.0', name: 'T', model: { elements: [
  { id: 'terminus', type: 'c4:softwareSystem', name: 'Terminus', children: [
    { id: 'terminus.assignment', type: 'c4:container', name: 'Assignment API' },
    { id: 'terminus.scheduler', type: 'c4:container', name: 'Scheduler' }] },
  { id: 'topic.assignment-requested', type: 'c4:container', name: 'assignment-requested', tags: ['topic'] },
  { id: 'billing', type: 'c4:softwareSystem', name: 'Billing' }, ...(extra.elements ?? [])],
  relationships: [{ from: 'terminus.scheduler', to: 'topic.assignment-requested', type: 'archimate:flow' }] } });

test('norm and repoKey', () => {
  assert.equal(norm('Pedidos API (v2)'), 'pedidos-api-v2');
  assert.equal(norm('Ação'), 'acao');
  assert.equal(repoKey({ url: 'https://u:t@github.com/o/r.git', path: 'x' }), 'https://github.com/o/r');
  assert.equal(repoKey({ path: '/r/x' }), '/r/x');
});

test('suggested role: one deployable → service, two or more → system, none → service with a note', () => {
  assert.equal(summarize(inv([{ kind: 'service', name: 'api', at }]), null).role.suggested, 'service');
  const s = summarize(inv([{ kind: 'service', name: 'api', at }, { kind: 'module', name: 'worker', executable: true, at }]), null);
  assert.equal(s.role.suggested, 'system');
  assert.match(s.role.why, /2 deployáveis/);
  assert.match(summarize(inv([]), null).role.why, /nenhum deployável/);
  assert.deepEqual(deployablesOf(inv([{ kind: 'service', name: 'api', at }, { kind: 'workload', name: 'api', at }])), ['api']);
});

test('existing element: by properties.repo first, then by name similarity', () => {
  const byName = summarize(inv([]), terminus());
  assert.deepEqual([byName.existing.id, byName.existing.by], ['terminus.assignment', 'name']);
  const known = terminus({ elements: [{ id: 'terminus.x', type: 'c4:container', name: 'Outro', parent: 'terminus', properties: { repo: '/r/terminus-assignment-api', repoRole: 'service' } }] });
  const byRepo = summarize(inv([{ kind: 'service', name: 'a', at }, { kind: 'service', name: 'b', at }]), known);
  assert.deepEqual([byRepo.existing.id, byRepo.existing.by, byRepo.existing.role], ['terminus.x', 'repo', 'service']);
  assert.ok(byRepo.warnings.some(w => /registrado como service/.test(w)));
});

test('probable systems come with reasons (name prefix, topic) and are never chosen for the user', () => {
  const s = summarize(inv([{ kind: 'channel', name: 'assignment-requested', action: 'subscribe', at }]), terminus());
  assert.equal(s.systems[0].id, 'terminus');
  assert.ok(s.systems[0].why.some(w => /prefixo|começa com/.test(w)));
  assert.ok(s.systems[0].why.some(w => /tópico assignment-requested/.test(w)));
  assert.ok(!s.systems.some(x => x.id === 'billing'));
  assert.equal(s.role.suggested, 'service', 'still only a suggestion');
});

test('warnings: graphify missing, stale graph, dirty tree, outside git, unreadable files', () => {
  const w = summarize(inv([{ kind: 'graph-stale', builtAt: '1', commit: '2', at }, { kind: 'unreadable', error: 'x', at }], { dirty: true, commit: null }), null).warnings.join('\n');
  assert.match(w, /graphify ausente/);
  assert.match(w, /desatualizado/);
  assert.match(w, /não commitadas/);
  assert.match(w, /fora de git/);
  assert.match(w, /1 arquivo/);
  assert.match(formatSummary(summarize(inv([]), terminus())), /terminus\.assignment/);
});
