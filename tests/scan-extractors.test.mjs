import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readYaml } from '../scripts/lib/scan/yaml.mjs';
import { k8sFacts } from '../scripts/lib/scan/k8s.mjs';
import { helmChartFacts, helmValuesFacts } from '../scripts/lib/scan/helm.mjs';
import { terraformFacts } from '../scripts/lib/scan/terraform.mjs';
import { openapiFacts } from '../scripts/lib/scan/openapi.mjs';
import { asyncapiFacts } from '../scripts/lib/scan/asyncapi.mjs';
import { scanDir } from '../scripts/lib/scan/index.mjs';

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
