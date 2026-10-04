import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { summarize, deployablesOf, formatSummary } from '../scripts/lib/scan/summary.mjs';
import { norm, repoKey, toDelta } from '../scripts/lib/scan/to-delta.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { resolveView } from '../scripts/lib/query.mjs';

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

const a = (file, line) => ({ file, line });
const pedidosFacts = [
  { kind: 'service', name: 'pedidos-api', build: 'api', ports: ['8080'], at: a('docker-compose.yml', 3) },
  { kind: 'infra-image', service: 'pedidos-db', engine: 'postgres', category: 'database', version: '16', at: a('docker-compose.yml', 12) },
  { kind: 'depends-on', from: 'pedidos-api', to: 'pedidos-db', at: a('docker-compose.yml', 10) },
  { kind: 'env-ref', from: 'pedidos-api', var: 'PAGAMENTOS_URL', host: 'pagamentos', at: a('docker-compose.yml', 6) },
  { kind: 'api', title: 'API de Pedidos', version: '1.4.0', servers: [], operations: 3, tags: [], at: a('api/openapi.yaml', 3) },
  { kind: 'channel', name: 'pedido-criado', action: 'publish', message: 'PedidoCriado', at: a('api/asyncapi.yaml', 4) },
];
const el = (d, id) => d.model.elements.find(e => e.id === id);
const rel = (d, from, to) => d.model.relationships.find(r => r.from === from && r.to === to);
const find = (raw, id) => { let hit; const walk = l => l.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); }); walk(raw.model.elements); return hit; };
const applyNew = (delta, base = null) => {
  const plan = planMerge(base, delta);
  for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'possible-duplicate' ? 'different' : it.class === 'conflict' ? 'take' : 'yes';
  return applyPlan(base, plan).raw;
};

test('service role: the repo is one container in the given system; infra, api and topic around it', () => {
  const d = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  assert.equal(d['archlens-delta'], '1.0');
  assert.deepEqual(d.source, { kind: 'repo', ref: '/r/pedidos@abcdef1' });
  const own = el(d, 'loja.pedidos');
  assert.deepEqual([own.type, own.parent, own.properties], ['c4:container', 'loja', { repo: '/r/pedidos', repoRole: 'service' }]);
  assert.deepEqual(el(d, 'loja.pedidos-pedidos-db').tags, ['database']);
  assert.deepEqual([el(d, 'tech.postgres-16').type, el(d, 'tech.postgres-16').name], ['archimate:system-software', 'PostgreSQL 16']);
  assert.equal(rel(d, 'tech.postgres-16', 'loja.pedidos-pedidos-db').type, 'archimate:realization');
  assert.equal(rel(d, 'loja.pedidos', 'loja.pedidos-pedidos-db').type, 'uses');
  assert.equal(rel(d, 'loja.pedidos', 'loja.pedidos.api-api-de-pedidos').type, 'archimate:realization');
  assert.equal(rel(d, 'loja.pedidos', 'topic.pedido-criado').type, 'archimate:flow', 'publishing is a flow to the topic');
  const ext = el(d, 'ext.pagamentos');
  assert.deepEqual([ext.external, ext.inferred, ext.confidence], [true, true, 'baixa']);
  const r = rel(d, 'loja.pedidos', 'ext.pagamentos');
  assert.deepEqual([r.type, r.inferred, r.description], ['uses', true, 'via PAGAMENTOS_URL']);
  assert.deepEqual(own.sources[0], { kind: 'repo', ref: '/r/pedidos@abcdef1', path: '.', line: 1 });
  assert.deepEqual(el(d, 'loja.pedidos-pedidos-db').sources[0], { kind: 'repo', ref: '/r/pedidos@abcdef1', path: 'docker-compose.yml', line: 12 });
  assert.ok(!('inferred' in own) && !('inferred' in el(d, 'loja.pedidos-pedidos-db')), 'manifest facts are not inferred');
  assert.deepEqual(validateModel(applyNew(d)).errors, []);
});

test('system role: deployables are containers, libraries become components of their main user, graphify flows and concepts', () => {
  const facts = [
    { kind: 'module', name: 'app', executable: true, at: a('settings.gradle.kts', 1) },
    { kind: 'module', name: 'domain', executable: false, at: a('settings.gradle.kts', 1) },
    { kind: 'module', name: 'wear', executable: true, at: a('settings.gradle.kts', 1) },
    { kind: 'module-dep', from: 'app', to: 'domain', count: 312, at: a('graphify-out/graph.json', 1) },
    { kind: 'module-dep', from: 'wear', to: 'domain', count: 20, at: a('graphify-out/graph.json', 1) },
    { kind: 'module-dep', from: 'wear', to: 'app', count: 11, at: a('graphify-out/graph.json', 1) },
    { kind: 'flow', label: 'Registrar dose tomada', participants: ['app', 'domain'], confidence: 'média', at: a('docs/spec.md', 1) },
    { kind: 'domain-concept', label: 'Treatment', module: 'domain', degree: 129, at: a('domain/src/Treatment.kt', 10) },
  ];
  const d = toDelta(inv(facts, { path: '/r/medi', name: 'medi-reminder-app' }), { role: 'system' });
  assert.deepEqual([el(d, 'medi-reminder-app').type, el(d, 'medi-reminder-app').properties.repoRole], ['c4:softwareSystem', 'system']);
  assert.equal(el(d, 'medi-reminder-app.app').type, 'c4:container');
  const lib = el(d, 'medi-reminder-app.app.domain');
  assert.deepEqual([lib.type, lib.parent, lib.inferred], ['c4:component', 'medi-reminder-app.app', true]);
  assert.equal(rel(d, 'medi-reminder-app.wear', 'medi-reminder-app.app').description, '11 referência(s) no código');
  assert.ok(rel(d, 'medi-reminder-app.wear', 'medi-reminder-app.app.domain'));
  assert.ok(!rel(d, 'medi-reminder-app.app', 'medi-reminder-app.app.domain'), 'no uses from a container to its own component');
  const proc = el(d, 'proc.registrar-dose-tomada');
  assert.deepEqual([proc.type, proc.inferred, proc.confidence], ['archimate:business-process', true, 'média']);
  assert.equal(rel(d, 'medi-reminder-app.app', 'proc.registrar-dose-tomada').type, 'archimate:serving');
  assert.equal(el(d, 'obj.treatment').type, 'archimate:business-object');
  assert.equal(rel(d, 'medi-reminder-app.app.domain', 'obj.treatment').type, 'archimate:access');
  assert.deepEqual(validateModel(applyNew(d)).errors, []);
});

test('a known module of the base is enriched, never recreated (terminus.assignment)', () => {
  const base = terminus();
  const d = toDelta(inv([{ kind: 'service', name: 'api', build: '.', ports: [], at: a('compose.yml', 2) }]), { role: 'service', system: 'terminus', id: 'terminus.assignment', base });
  const own = el(d, 'terminus.assignment');
  assert.ok(!('name' in own) && !('type' in own) && !('parent' in own), 'existing element: only id + enrichment');
  assert.equal(own.properties.repoRole, 'service');
  const sys = el(d, 'terminus');
  assert.ok(!('name' in sys) && !('type' in sys), 'the existing system goes out only with the provenance');
});

test('re-reading: what vanished from this repo becomes a retired question; other sources are untouched', () => {
  const first = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  const raw = applyNew(first);
  raw.model.elements.push({ id: 'loja.manual', type: 'c4:container', name: 'Manual', parent: 'loja', sources: [{ kind: 'prompt', ref: 'r1' }] });
  const base = normalizeModel(raw);
  const without = pedidosFacts.filter(f => f.kind !== 'api');
  const second = toDelta(inv(without, { path: '/r/pedidos', name: 'pedidos', commit: 'fffffff999' }), { role: 'service', system: 'loja', base });
  const ops = second.ops ?? [];
  assert.deepEqual(ops.map(o => [o.op, o.id, o.status]), [['status', 'loja.pedidos.api-api-de-pedidos', 'retired']]);
  assert.match(ops[0].reason, /não encontrado em \/r\/pedidos@fffffff/);
  const same = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja', base: normalizeModel(applyNew(first)) });
  assert.equal(same.ops, undefined);
  assert.deepEqual(Object.keys(planMerge(applyNew(first), same).summary), ['unchanged'], 'same commit, nothing changes');
});

test('an empty repository gives only the repository element', () => {
  const d = toDelta(inv([], { path: '/r/vazio', name: 'vazio' }), { role: 'service', system: 'loja' });
  assert.deepEqual(d.model.elements.map(e => e.id).sort(), ['loja', 'loja.vazio']);
});

test('producer and consumer repos are linked by the topic; the producer impact reaches the consumer', () => {
  const prod = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  let raw = applyNew(prod);
  const cons = toDelta(inv([{ kind: 'workload', kindK8s: 'Deployment', name: 'pagamentos', at: a('k8s/deploy.yaml', 8) },
    { kind: 'channel', name: 'pedido-criado', action: 'subscribe', at: a('asyncapi.json', 1) }], { path: '/r/pagamentos', name: 'pagamentos' }),
  { role: 'service', system: 'financeiro', base: normalizeModel(raw) });
  raw = applyNew(cons, raw);
  const m = normalizeModel(raw);
  assert.ok(m.relationships.some(r => r.from === 'topic.pedido-criado' && r.to === 'financeiro.pagamentos' && r.type === 'flow'));
  const impact = resolveView(m, { key: 'i', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.pedidos' });
  assert.ok(impact.nodes.some(n => n.id === 'financeiro.pagamentos'), 'consumer appears as dependent of the producer');
});

test('re-reading the producer links the host to the real container, not to a stale ext.*, which is retired', () => {
  const prod = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  let raw = applyNew(prod);
  const cons = toDelta(inv([{ kind: 'workload', kindK8s: 'Deployment', name: 'pagamentos', at: a('k8s/deploy.yaml', 8) }], { path: '/r/pagamentos', name: 'pagamentos' }),
    { role: 'service', system: 'financeiro', base: normalizeModel(raw) });
  // the consumer reading claims ext.pagamentos; declining that removal leaves the placeholder for the re-read to retire
  const plan = planMerge(raw, cons);
  for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'op' && it.op === 'remove' ? 'no' : it.class === 'possible-duplicate' ? 'different' : it.class === 'conflict' ? 'take' : 'yes';
  raw = applyPlan(raw, plan).raw;
  const again = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos', commit: 'fffffff999' }), { role: 'service', system: 'loja', base: normalizeModel(raw) });
  const r = rel(again, 'loja.pedidos', 'financeiro.pagamentos');
  assert.deepEqual([r?.type, r?.description], ['uses', 'via PAGAMENTOS_URL']);
  assert.ok(!rel(again, 'loja.pedidos', 'ext.pagamentos'));
  assert.deepEqual((again.ops ?? []).map(o => [o.op, o.id, o.status]), [['status', 'ext.pagamentos', 'retired']]);
});

test('service role: the own container remembers its runtime names (compose service, workload, chart) as aliases', () => {
  const d = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  assert.ok(el(d, 'loja.pedidos').aliases.includes('pedidos-api'));
  const k = toDelta(inv([{ kind: 'workload', kindK8s: 'Deployment', name: 'pagamentos', at: a('k8s/deploy.yaml', 8) },
    { kind: 'chart', name: 'pagamentos-chart', dependencies: [], at: a('chart/Chart.yaml', 2) }], { path: '/r/pagamentos', name: 'pagamentos' }), { role: 'service', system: 'financeiro' });
  assert.deepEqual(el(k, 'financeiro.pagamentos').aliases, ['pagamentos-chart'], 'names equal to the repo name are not aliases');
});

const consumerFacts = [
  { kind: 'workload', kindK8s: 'Deployment', name: 'pagamentos', at: a('k8s/deploy.yaml', 8) },
  { kind: 'env-ref', from: 'pagamentos', var: 'PEDIDOS_URL', host: 'pedidos-api', at: a('k8s/deploy.yaml', 20) },
  { kind: 'channel', name: 'pedido-criado', action: 'subscribe', message: 'PedidoCriado', at: a('asyncapi.json', 1) },
];
const readCons = base => toDelta(inv(consumerFacts, { path: '/r/pagamentos', name: 'pagamentos' }), { role: 'service', system: 'financeiro', base });
const readProd = base => toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja', base });
const placeholdersFor = (m, names) => [...m.elements.values()].filter(e => e.id.startsWith('ext.') && names.includes(norm(e.name)));

test('consumer first, then producer: the producer reading claims ext.pedidos-api (remove + retarget with the consumer provenance)', () => {
  let raw = applyNew(readCons(null));
  const before = normalizeModel(raw);
  assert.ok(before.elements.has('ext.pedidos-api'));
  const baseRel = before.relationships.find(r => r.c4?.from === 'financeiro.pagamentos' && r.c4?.to === 'ext.pedidos-api');
  const d = readProd(before);
  assert.deepEqual((d.ops ?? []).map(o => [o.op, o.id]), [['remove', 'ext.pedidos-api']]);
  assert.match(d.ops[0].reason, /substituído por loja\.pedidos \(lido em \/r\/pedidos@abcdef1\)/);
  assert.ok(!el(d, 'ext.pedidos-api'));
  const moved = rel(d, 'financeiro.pagamentos', 'loja.pedidos');
  assert.deepEqual([moved?.type, moved?.description, moved?.inferred], ['uses', 'via PEDIDOS_URL', true]);
  assert.deepEqual(moved.sources, baseRel.sources, 'the consumer fact keeps the consumer provenance');
  assert.ok(moved.sources.every(s => s.ref.startsWith('/r/pagamentos@')));
  const plan = planMerge(raw, d);
  assert.ok(!plan.items.some(i => i.class === 'possible-duplicate' && [i.target, i.candidate].includes('ext.pedidos-api')), 'no duplicate question for the placeholder');
  raw = applyNew(d, raw);
  const m = normalizeModel(raw);
  assert.deepEqual(validateModel(raw).errors, []);
  assert.ok(!m.elements.has('ext.pedidos-api'));
  const own = m.elements.get('loja.pedidos');
  assert.ok(!own.c4.external && !own.inferred, 'the real container is neither external nor inferred');
  assert.ok(m.relationships.some(r => r.c4?.from === 'financeiro.pagamentos' && r.c4?.to === 'loja.pedidos'));
  assert.ok(m.relationships.some(r => r.c4?.from === 'loja.pedidos' && r.c4?.to === 'financeiro.pagamentos'));
  assert.deepEqual(placeholdersFor(m, ['pedidos', 'pedidos-api', 'pagamentos']), []);
  const impact = resolveView(m, { key: 'i', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.pedidos' });
  assert.ok(impact.nodes.some(n => n.id === 'financeiro.pagamentos'));
  assert.ok(!impact.nodes.some(n => n.id.startsWith('ext.')));
});

test('producer first, then consumer: the consumer reading claims ext.pagamentos and links to loja.pedidos by its runtime name', () => {
  let raw = applyNew(readProd(null));
  assert.ok(normalizeModel(raw).elements.has('ext.pagamentos'));
  const d = readCons(normalizeModel(raw));
  assert.deepEqual((d.ops ?? []).map(o => [o.op, o.id]), [['remove', 'ext.pagamentos']]);
  assert.ok(!el(d, 'ext.pedidos-api'), 'pedidos-api resolves to loja.pedidos by alias');
  const moved = rel(d, 'loja.pedidos', 'financeiro.pagamentos');
  assert.ok(moved.sources.every(s => s.ref.startsWith('/r/pedidos@')));
  raw = applyNew(d, raw);
  const m = normalizeModel(raw);
  assert.deepEqual(validateModel(raw).errors, []);
  assert.deepEqual(placeholdersFor(m, ['pedidos', 'pedidos-api', 'pagamentos']), []);
  assert.ok(m.relationships.some(r => r.c4?.from === 'loja.pedidos' && r.c4?.to === 'financeiro.pagamentos'));
  assert.ok(m.relationships.some(r => r.c4?.from === 'financeiro.pagamentos' && r.c4?.to === 'loja.pedidos'));
  assert.ok(!m.elements.get('financeiro.pagamentos').c4.external);
});

test('a placeholder with provenance other than repositories is never claimed', () => {
  const raw = applyNew(readProd(null));
  find(raw, 'ext.pagamentos').sources.push({ kind: 'prompt', ref: 'rodada 1' });
  const d = readCons(normalizeModel(raw));
  assert.ok(!(d.ops ?? []).some(o => o.op === 'remove'));
});

test('a host equal to a topic id suffix does not link to the topic', () => {
  const base = terminus();
  const d = toDelta(inv([{ kind: 'service', name: 'api', build: '.', ports: [], at: a('compose.yml', 2) },
    { kind: 'env-ref', from: 'api', var: 'REQ_URL', host: 'assignment-requested', at: a('compose.yml', 4) }]), { role: 'service', system: 'terminus', id: 'terminus.assignment', base });
  assert.ok(!rel(d, 'terminus.assignment', 'topic.assignment-requested'));
  assert.ok(rel(d, 'terminus.assignment', 'ext.assignment-requested'));
});

test('without a commit the reference keeps "sem-commit" whole', () => {
  const d = toDelta(inv([], { path: '/r/vazio', name: 'vazio', commit: undefined }), { role: 'service', system: 'loja' });
  assert.equal(d.source.ref, '/r/vazio@sem-commit');
  assert.equal(el(d, 'loja.vazio').sources[0].ref, '/r/vazio@sem-commit');
});

test('sibling-image compose services are not this repo\'s deployables: hosts, never aliases (item 1)', () => {
  const facts = [
    { kind: 'service', name: 'pedidos-api', build: 'api', ports: [], at: a('docker-compose.yml', 2) },
    { kind: 'service', name: 'pagamentos', image: 'ghcr.io/acme/pagamentos:2.1', ports: [], at: a('docker-compose.yml', 8) },
    { kind: 'depends-on', from: 'pedidos-api', to: 'pagamentos', at: a('docker-compose.yml', 5) },
    { kind: 'env-ref', from: 'pagamentos', var: 'X_URL', host: 'antifraude', at: a('docker-compose.yml', 9) },
  ];
  const i = inv(facts, { path: '/r/pedidos', name: 'pedidos' });
  assert.deepEqual(deployablesOf(i), ['pedidos-api']);
  assert.equal(summarize(i, null).role.suggested, 'service');
  const d = toDelta(i, { role: 'service', system: 'loja' });
  assert.deepEqual(el(d, 'loja.pedidos').aliases, ['pedidos-api'], 'no alias pagamentos');
  assert.equal(rel(d, 'loja.pedidos', 'ext.pagamentos')?.description, 'depends_on');
  assert.equal(el(d, 'ext.pagamentos').external, true);
  assert.ok(!d.model.relationships.some(r => r.to === 'ext.antifraude'), 'facts of a sibling service are not this repo\'s');
  assert.equal(planMerge(null, d).blocked, false);
  // same image name as the repository: it is this repo's own image
  assert.deepEqual(deployablesOf(inv([{ kind: 'service', name: 'web', image: 'acme/pedidos:1', ports: [], at }], { name: 'pedidos' })), ['web']);
  // system role: the sibling is not a container of the system; a known base element is reused
  const base = normalizeModel({ archlens: '1.0', name: 'T', model: { elements: [{ id: 'financeiro', type: 'c4:softwareSystem', name: 'Financeiro',
    children: [{ id: 'financeiro.pagamentos', type: 'c4:container', name: 'Pagamentos' }] }], relationships: [] } });
  const ds = toDelta(inv([...facts, { kind: 'service', name: 'worker', build: 'worker', ports: [], at }], { path: '/r/pedidos', name: 'pedidos' }), { role: 'system', base });
  assert.ok(!el(ds, 'pedidos.pagamentos'));
  assert.equal(rel(ds, 'pedidos.pedidos-api', 'financeiro.pagamentos')?.description, 'depends_on');
});

test('module provenance prefers the build file; dependency keeps the larger count (item 9)', () => {
  const facts = [
    { kind: 'module', name: 'app', executable: true, at: a('graphify-out/graph.json', 1) },
    { kind: 'module', name: 'domain', executable: false, at: a('graphify-out/graph.json', 1) },
    { kind: 'module-dep', from: 'app', to: 'domain', count: 40, at: a('graphify-out/graph.json', 1) },
    { kind: 'module', name: 'app', executable: true, at: a('settings.gradle.kts', 2) },
    { kind: 'module', name: 'domain', executable: false, at: a('settings.gradle.kts', 2) },
    { kind: 'module-dep', from: 'app', to: 'domain', count: 1, at: a('app/build.gradle.kts', 3) },
  ];
  const d = toDelta(inv(facts, { path: '/r/medi', name: 'medi' }), { role: 'service', system: 'saude' });
  assert.deepEqual(el(d, 'saude.medi.domain').sources.map(s => [s.path, s.line]), [['settings.gradle.kts', 2]]);
  const r = rel(d, 'saude.medi.app', 'saude.medi.domain');
  assert.deepEqual(r.sources.map(s => [s.path, s.line]), [['app/build.gradle.kts', 3]]);
  assert.equal(r.description, '40 referência(s) no código');
  const g = toDelta(inv(facts.slice(0, 3), { path: '/r/medi', name: 'medi' }), { role: 'service', system: 'saude' });
  assert.deepEqual(el(g, 'saude.medi.domain').sources.map(s => s.path), ['graphify-out/graph.json'], 'graphify alone still counts');
});

test('--id of an existing container: infrastructure ids take its prefix (item 7)', () => {
  const d = toDelta(inv([{ kind: 'service', name: 'api', build: '.', ports: [], at },
    { kind: 'infra-image', service: 'redis', engine: 'redis', category: 'cache', at }]), { role: 'service', system: 'terminus', id: 'terminus.assignment', base: terminus() });
  assert.deepEqual([el(d, 'terminus.assignment-redis')?.parent, el(d, 'terminus.assignment-redis')?.tags], ['terminus', ['cache']]);
  assert.ok(!d.model.elements.some(e => e.id.startsWith('terminus.terminus-assignment-api')), 'no id from the repository name');
});
