import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
