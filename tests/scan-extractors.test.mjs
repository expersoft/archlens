import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readYaml } from '../scripts/lib/scan/yaml.mjs';
import { k8sFacts } from '../scripts/lib/scan/k8s.mjs';
import { helmChartFacts, helmValuesFacts } from '../scripts/lib/scan/helm.mjs';
import { terraformFacts } from '../scripts/lib/scan/terraform.mjs';
import { openapiFacts } from '../scripts/lib/scan/openapi.mjs';
import { asyncapiFacts } from '../scripts/lib/scan/asyncapi.mjs';
import { gradleModules, buildFacts } from '../scripts/lib/scan/build.mjs';
import { graphifyFacts } from '../scripts/lib/scan/graphify.mjs';
import { scanDir } from '../scripts/lib/scan/index.mjs';
import { summarize, formatSummary } from '../scripts/lib/scan/summary.mjs';
import { toDelta } from '../scripts/lib/scan/to-delta.mjs';

const fx = p => fileURLToPath(new URL(`./fixtures/repos/${p}`, import.meta.url));
const read = p => readFileSync(fx(p), 'utf8');
const pick = (facts, kind, ...keys) => facts.filter(f => f.kind === kind).map(f => keys.map(k => f[k]));

test('k8s: workloads, infra workloads, services, ingress and env hosts, every document, anchors ok', () => {
  const docs = readYaml(read('pagamentos/k8s/deploy.yaml'));
  const facts = k8sFacts('k8s/deploy.yaml', docs);
  assert.deepEqual(pick(facts, 'workload', 'kindK8s', 'name', 'image'), [['Deployment', 'pagamentos', 'ghcr.io/acme/pagamentos:2.1.0']]);
  assert.deepEqual(pick(facts, 'infra-image', 'service', 'engine', 'version'), [['pagamentos-db', 'postgres', '15']]);
  assert.deepEqual(pick(facts, 'k8s-service', 'name'), [['pagamentos']]);
  assert.deepEqual(pick(facts, 'ingress', 'host', 'service'), [['pagamentos.acme.com', 'pagamentos']]);
  assert.deepEqual(pick(facts, 'env-ref', 'from', 'var', 'host').sort(), [['pagamentos', 'KAFKA_BROKERS', 'kafka'], ['pagamentos', 'PEDIDOS_URL', 'pedidos-api']]);
  assert.equal(facts.find(f => f.kind === 'workload').at.line, 7, 'line of metadata.name');
  // Verify anchor alias resolved: metadata.labels and spec.selector.matchLabels should be the same
  const deploymentDoc = docs.find(d => d.data?.kind === 'Deployment');
  assert.deepEqual(deploymentDoc.data.metadata.labels, deploymentDoc.data.spec.selector.matchLabels, 'anchor alias resolved correctly');
});

test('helm: chart with known dependencies, values with image, ingress and env', () => {
  const chart = helmChartFacts('chart/Chart.yaml', read('pagamentos/chart/Chart.yaml'));
  assert.deepEqual(pick(chart, 'chart', 'name', 'dependencies'), [['pagamentos', ['redis']]]);
  assert.deepEqual(pick(chart, 'infra-image', 'service', 'engine'), [['redis', 'redis']]);
  const values = helmValuesFacts('chart/values.yaml', read('pagamentos/chart/values.yaml'), 'pagamentos');
  assert.deepEqual(pick(values, 'workload', 'kindK8s', 'name', 'image'), [['HelmValues', 'pagamentos', 'ghcr.io/acme/pagamentos:2.1.0']]);
  assert.deepEqual(pick(values, 'ingress', 'host', 'service'), [['pay.acme.com', 'pagamentos']]);
  assert.deepEqual(pick(values, 'env-ref', 'from', 'host'), [['pagamentos', 'antifraude.acme.com']]);
});

test('scanDir dispatches k8s and helm files', () => {
  const inv = scanDir(fx('pagamentos'));
  assert.equal(inv.files.k8s, 1);
  assert.equal(inv.files.helm, 2);
  assert.ok(inv.facts.some(f => f.kind === 'chart'));
});

test('terraform: known categories only, literal attributes, references between them', () => {
  const facts = terraformFacts('main.tf', read('infra/main.tf'));
  assert.deepEqual(pick(facts, 'cloud-resource', 'type', 'name', 'category'), [
    ['aws_db_instance', 'pedidos', 'database'], ['aws_msk_cluster', 'eventos', 'messaging'], ['aws_eks_cluster', 'principal', 'cluster']]);
  const db = facts.find(f => f.name === 'pedidos');
  assert.equal(db.attrs.engine_version, '16.3');
  assert.equal(db.at.line, 1);
  assert.deepEqual(pick(facts, 'tf-ref', 'from', 'to'), [['aws_eks_cluster.principal', 'aws_msk_cluster.eventos']], 'refs to unknown kinds (security group) are dropped');
});

test('openapi: title, version, servers, operation count and tags', () => {
  const [doc] = readYaml(read('pedidos/api/openapi.yaml'));
  const [api] = openapiFacts('api/openapi.yaml', doc);
  assert.deepEqual([api.title, api.version, api.servers, api.operations, api.tags], ['API de Pedidos', '1.4.0', ['https://pedidos.acme.com'], 3, ['pedidos']]);
  assert.equal(api.at.line, 3);
});

test('asyncapi: 2.x subscribe means the app sends; 3.x send/receive', () => {
  const [v2] = readYaml(read('pedidos/api/asyncapi.yaml'));
  assert.deepEqual(pick(asyncapiFacts('api/asyncapi.yaml', v2), 'channel', 'name', 'action', 'message'), [['pedido-criado', 'publish', 'PedidoCriado']]);
  const v3 = { data: JSON.parse(read('pagamentos/asyncapi.json')), lineOf: () => 1 };
  assert.deepEqual(pick(asyncapiFacts('asyncapi.json', v3), 'channel', 'name', 'action').sort(), [['pagamento-aprovado', 'publish'], ['pedido-criado', 'subscribe']]);
});

test('scanDir dispatches terraform, openapi (yaml) and asyncapi (yaml and json)', () => {
  const ped = scanDir(fx('pedidos'));
  assert.equal(ped.files.openapi, 1);
  assert.equal(ped.files.asyncapi, 1);
  assert.equal(scanDir(fx('pagamentos')).files.asyncapi, 1);
  assert.equal(scanDir(fx('infra')).files.terraform, 1);
});

test('terraform: interpolated strings are not extracted; literals and references in interpolations are', () => {
  const tf = `resource "aws_db_instance" "test" {
  name = "\${var.x}-db"
  bucket = "fixed"
  url = "https://x.com"
  arn = "\${aws_msk_cluster.eventos.arn}"
}

resource "aws_msk_cluster" "eventos" {
  cluster_name = "eventos"
}`;
  const facts = terraformFacts('test.tf', tf);
  const db = facts.find(f => f.kind === 'cloud-resource' && f.name === 'test');
  assert.equal(db.attrs.name, undefined, 'interpolated string name omitted');
  assert.equal(db.attrs.bucket, 'fixed', 'literal string extracted');
  assert.equal(db.attrs.url, 'https://x.com', 'URL literal extracted');
  assert.ok(pick(facts, 'tf-ref', 'to').some(r => r[0] === 'aws_msk_cluster.eventos'), 'reference to emitted resource found');
});

test('terraform: heredocs do not swallow following resources', () => {
  const tf = `resource "aws_security_group" "db" {
  description = <<EOF
this has { and } inside
EOF
}
resource "aws_db_instance" "pedidos" {
  engine = "postgres"
}`;
  const facts = terraformFacts('test.tf', tf);
  const resources = pick(facts, 'cloud-resource', 'type', 'name');
  assert.deepEqual(resources, [['aws_db_instance', 'pedidos']], 'only known resource extracted, heredoc did not swallow the closing brace');
});

test('terraform: unclosed block throws error', () => {
  const tf = `resource "aws_db_instance" "pedidos" {
  engine = "postgres"`;
  assert.throws(() => terraformFacts('test.tf', tf), /bloco HCL não fechado.*resource.*pedidos/);
});

test('scanDir: invalid JSON is ignored, not unreadable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-test-'));
  try {
    writeFileSync(join(dir, 'broken.json'), '{', 'utf8');
    const inv = scanDir(dir);
    assert.equal(inv.files.ignored, 1, 'broken JSON counts as ignored');
    assert.ok(!inv.facts.some(f => f.kind === 'unreadable'), 'no unreadable facts for invalid JSON');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('terraform: references only between emitted resources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-test-'));
  try {
    writeFileSync(join(dir, 'db.tf'), 'resource "aws_db_instance" "d" {\n  arn = "${aws_sqs_queue.ghost.arn}"\n  msk = "${aws_msk_cluster.eventos.arn}"\n}', 'utf8');
    writeFileSync(join(dir, 'msk.tf'), 'resource "aws_msk_cluster" "eventos" {\n  cluster_name = "eventos"\n}', 'utf8');
    const inv = scanDir(dir);
    const refs = pick(inv.facts, 'tf-ref', 'to');
    assert.ok(refs.some(r => r[0] === 'aws_msk_cluster.eventos'), 'cross-file ref to emitted resource kept');
    assert.ok(!refs.some(r => r[0] === 'aws_sqs_queue.ghost'), 'ref to non-emitted resource dropped');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('terraform: unclosed block in scanDir records unreadable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-test-'));
  try {
    writeFileSync(join(dir, 'broken.tf'), 'resource "aws_db_instance" "d" {\n  engine = "postgres"', 'utf8');
    const inv = scanDir(dir);
    assert.ok(inv.facts.some(f => f.kind === 'unreadable' && f.at.file.endsWith('broken.tf')), 'unclosed block recorded as unreadable');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('terraform: heredoc markers in strings/comments are not detected', () => {
  const tf = 'resource "aws_db_instance" "d" {\n  url = "https://docs.example.com/<<EOF"\n  # this is a comment with <<EOF\n  engine = "postgres"\n}';
  const facts = terraformFacts('test.tf', tf);
  const db = facts.find(f => f.kind === 'cloud-resource');
  assert.equal(db.attrs.engine, 'postgres', 'resource closed normally, heredoc markers in string/comment ignored');
});

test('gradle: modules, executable by plugin, project() dependencies', () => {
  assert.deepEqual(gradleModules('include(":app", ":domain")\ninclude ":data"\n'), ['app', 'domain', 'data']);
  const facts = buildFacts('settings.gradle.kts', read('app-modular/settings.gradle.kts'), { root: fx('app-modular') });
  assert.deepEqual(pick(facts, 'module', 'name', 'executable'), [['app', true], ['domain', false], ['data', false]]);
  assert.deepEqual(pick(facts, 'module-dep', 'from', 'to').sort(), [['app', 'data'], ['app', 'domain'], ['data', 'domain']]);
});

test('npm workspaces: packages, executable by start/bin, dependencies between them', () => {
  const facts = buildFacts('package.json', read('web-workspaces/package.json'), { root: fx('web-workspaces') });
  assert.deepEqual(pick(facts, 'module', 'name', 'executable').sort(), [['packages/ui', false], ['packages/web', true]]);
  assert.deepEqual(pick(facts, 'module-dep', 'from', 'to'), [['packages/web', 'packages/ui']]);
});

test('graphify: modules, aggregated dependencies, flows, domain concepts, stale graph', () => {
  const facts = graphifyFacts('graphify-out/graph.json', read('app-modular/graphify-out/graph.json'), { root: fx('app-modular'), commit: 'abc1234def' });
  assert.deepEqual(pick(facts, 'module', 'name').sort(), [['app'], ['data'], ['domain']]);
  const deps = Object.fromEntries(facts.filter(f => f.kind === 'module-dep').map(f => [`${f.from}>${f.to}`, f.count]));
  assert.deepEqual(deps, { 'app>domain': 2, 'data>domain': 2 });
  const [flow, docFlow] = facts.filter(f => f.kind === 'flow');
  assert.deepEqual([flow.label, flow.participants.sort(), flow.confidence], ['Registrar dose tomada', ['app', 'data', 'domain'], 'média']);
  assert.deepEqual(docFlow.participants, ['domain'], 'document node borrows modules of linked code nodes');
  assert.deepEqual(pick(facts, 'domain-concept', 'label', 'module'), [['Treatment', 'domain'], ['DoseEvent', 'domain']], 'tests excluded, most connected first');
  assert.equal(facts.find(f => f.kind === 'domain-concept').at.line, 10);
  assert.deepEqual(pick(facts, 'graph-stale', 'builtAt', 'commit'), [['0000000', 'abc1234def']]);
});

test('scanDir: graphify and build files are counted', () => {
  const inv = scanDir(fx('app-modular'));
  assert.equal(inv.files.graphify, 1);
  assert.equal(inv.files.build, 1);
});

test('gradleModules: comments, includeBuild, multi-line and Groovy forms', () => {
  assert.deepEqual(gradleModules('includeBuild("../x")\n// include ":c"\n/* include ":d" */\ninclude(\n ":a",\n ":b"\n)\n'), ['a', 'b']);
  assert.deepEqual(gradleModules("include ':a', ':b'\n"), ['a', 'b']);
  assert.deepEqual(gradleModules('include(":x:y")'), ['x/y']);
});

test('gradle: duplicate project() dependencies aggregate into one fact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gr-'));
  try {
    mkdirSync(join(dir, 'a')); writeFileSync(join(dir, 'settings.gradle.kts'), 'include(":a", ":b")');
    writeFileSync(join(dir, 'a/build.gradle.kts'), 'dependencies {\n implementation(project(":b"))\n testImplementation(project(":b"))\n}\n');
    const deps = buildFacts('settings.gradle.kts', 'include(":a", ":b")', { root: dir }).filter(f => f.kind === 'module-dep');
    assert.deepEqual(deps.map(d => [d.from, d.to, d.count, d.at.line]), [['a', 'b', 2, 2]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('graphify communities: the largest named ones as component suggestions, test-ish names left out (item 3)', () => {
  const facts = graphifyFacts('graphify-out/graph.json', read('app-modular/graphify-out/graph.json'), { root: fx('app-modular'), commit: null });
  assert.deepEqual(pick(facts, 'community', 'name', 'size'), [['Tela de hoje', 2], ['Tratamentos', 2], ['Persistência', 1]]);
  const s = summarize(scanDir(fx('app-modular')), null);
  assert.deepEqual(s.communities.map(c => c.name), ['Tela de hoje', 'Tratamentos', 'Persistência']);
  assert.match(formatSummary(s), /comunidades \(sugestões de componentes\): Tela de hoje \(2\), Tratamentos \(2\), Persistência \(1\)/);
  assert.ok(!toDelta(scanDir(fx('app-modular')), { role: 'system' }).model.elements.some(e => /Tela de hoje/.test(e.name ?? '')), 'to-delta ignores communities');
});

const withPath = (path, fn) => { const old = process.env.PATH; process.env.PATH = path; try { return fn(); } finally { process.env.PATH = old; } };

test('--helm-render: helm template output read as k8s; without helm a warning, never a silent skip (item 3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-helm-'));
  mkdirSync(join(dir, 'chart/templates'), { recursive: true });
  writeFileSync(join(dir, 'chart/Chart.yaml'), 'apiVersion: v2\nname: pay\nversion: 0.1.0\n');
  writeFileSync(join(dir, 'chart/templates/d.yaml'), 'kind: Deployment\nmetadata:\n  name: "{{ .Release.Name }}"\n');
  const empty = mkdtempSync(join(tmpdir(), 'archlens-nohelm-'));
  const missing = withPath(empty, () => scanDir(dir, { helmRender: true }));
  assert.deepEqual(pick(missing.facts, 'warning', 'message'), [['helm não encontrado: --helm-render ignorado']]);
  assert.ok(summarize(missing, null).warnings.includes('helm não encontrado: --helm-render ignorado'));
  assert.deepEqual(pick(scanDir(dir).facts, 'warning', 'message'), [], 'no warning without --helm-render');
  const bin = mkdtempSync(join(tmpdir(), 'archlens-helmbin-'));
  writeFileSync(join(bin, 'helm'), '#!/bin/sh\n[ "$1" = template ] || exit 2\ncat <<EOT\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: pay\nspec:\n  template:\n    spec:\n      containers:\n        - image: acme/pay:1.0\nEOT\n', { mode: 0o755 });
  const rendered = withPath(`${bin}:${process.env.PATH}`, () => scanDir(dir, { helmRender: true }));
  assert.deepEqual(pick(rendered.facts, 'workload', 'name', 'image'), [['pay', 'acme/pay:1.0']]);
  assert.deepEqual(rendered.facts.find(f => f.kind === 'workload').at, { file: 'chart/templates (helm template)', line: 1 });
});

test('domain concepts: no methods, members or id value types (item 10)', () => {
  const facts = graphifyFacts('graphify-out/graph.json', read('app-modular/graphify-out/graph.json'), { root: fx('app-modular'), commit: null });
  const labels = pick(facts, 'domain-concept', 'label').flat();
  for (const bad of ['fromJson()', '.toEntity', 'TreatmentId', 'DoseID']) assert.ok(!labels.includes(bad), bad);
  assert.deepEqual(labels, ['Treatment', 'DoseEvent']);
});

test('graphify from Windows: backslashes in source_file become slashes (item 14)', () => {
  const g = { nodes: [
    { id: 'a', label: 'Main', file_type: 'code', source_file: 'app\\src\\Main.kt' },
    { id: 'b', label: 'Dose', file_type: 'code', source_file: 'domain\\src\\Dose.kt', source_location: 'L7' }],
  links: [{ source: 'a', target: 'b', relation: 'imports' }], hyperedges: [{ id: 'h', label: 'Tomar dose', nodes: ['a', 'b'], source_file: 'docs\\spec.md' }] };
  const facts = graphifyFacts('graphify-out/graph.json', JSON.stringify(g), { root: fx('app-modular'), commit: null });
  assert.deepEqual(pick(facts, 'module', 'name').sort(), [['app'], ['domain']]);
  assert.deepEqual(pick(facts, 'module-dep', 'from', 'to'), [['app', 'domain']]);
  assert.deepEqual(facts.find(f => f.kind === 'domain-concept').at, { file: 'domain/src/Dose.kt', line: 7 });
  assert.deepEqual(facts.find(f => f.kind === 'flow').at.file, 'docs/spec.md');
});

test('inventory secrets: terraform credential attributes dropped, userinfo stripped from OpenAPI servers (item 11)', () => {
  const tf = 'resource "aws_db_instance" "db" {\n  engine = "postgres"\n  password = "s3cr3t"\n  master_password = "x"\n  api_token = "t"\n  kms_key_id = "k"\n  secret_name = "n"\n  credentials = "c"\n  Passphrase = "p"\n}\n';
  assert.deepEqual(terraformFacts('main.tf', tf)[0].attrs, { engine: 'postgres' });
  const doc = { data: { openapi: '3.0.0', info: { title: 'A', version: '1' }, servers: [{ url: 'https://u:pw@api.acme.com/v1' }, { url: 'https://api2.acme.com' }] }, lineOf: () => 1 };
  assert.deepEqual(openapiFacts('o.yaml', doc)[0].servers, ['https://api.acme.com/v1', 'https://api2.acme.com']);
  const sw = { data: { swagger: '2.0', info: { title: 'B' }, host: 'u:pw@old.acme.com', basePath: '/v2' }, lineOf: () => 1 };
  assert.deepEqual(openapiFacts('s.yaml', sw)[0].servers, ['https://old.acme.com/v2']);
});

test('detected but skipped files are reported: too big, or an API contract that does not parse (item 12)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-big-'));
  writeFileSync(join(dir, 'compose.yml'), `services:\n  a:\n    build: .\n# ${'x'.repeat(2.2 * 1024 * 1024)}\n`);
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ x: 'y'.repeat(2.2 * 1024 * 1024) }));
  writeFileSync(join(dir, 'openapi.json'), '{ "openapi": "3.0.0", ');
  writeFileSync(join(dir, 'asyncapi-eventos.json'), '{ nope');
  writeFileSync(join(dir, 'other.json'), '{ nope');
  const inv = scanDir(dir);
  const bad = Object.fromEntries(inv.facts.filter(f => f.kind === 'unreadable').map(f => [f.at.file, f.error]));
  assert.deepEqual(Object.keys(bad).sort(), ['asyncapi-eventos.json', 'compose.yml', 'openapi.json']);
  assert.match(bad['compose.yml'], /^arquivo grande demais \(2\.2 MB\)$/);
  assert.equal(inv.files.ignored, 2, 'big generic json and unparsable generic json stay ignored');
  assert.deepEqual(inv.skipped, [{ path: 'compose.yml', reason: 'grande demais' }], 'a recognised file skipped by size is listed (follow-up 1)');
  assert.match(formatSummary(summarize(inv, null)), /arquivos reconhecidos e pulados: 1 \(grande demais: compose\.yml\)/);
});
