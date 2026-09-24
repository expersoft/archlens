import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainEdge, GLOSSARY } from '../scripts/lib/explain.mjs';
import { RELATIONSHIP_TYPES } from '../scripts/lib/registry.mjs';

const nodes = {
  k8s: { name: 'Hospedagem', type: 'technology-service' },
  api: { name: 'API de Pedidos', type: 'application-component' },
  ctrl: { name: 'Checkout Controller', type: 'application-component' },
  svc: { name: 'Serviço de Checkout', type: 'application-service' },
  proc: { name: 'Checkout', type: 'business-process' },
  pedido: { name: 'Pedido', type: 'business-object' },
  medico: { name: 'Médico', type: 'business-actor' },
  papel: { name: 'Comprador', type: 'business-role' },
  req: { name: 'p95 < 2s', type: 'requirement' },
  jar: { name: 'pedidos.jar', type: 'artifact' },
  node: { name: 'Cluster', type: 'node' },
  web: { name: 'Web', type: 'application-component' },
};
const ex = (e, notation = 'archimate') => explainEdge({ id: 'e', ...e }, nodes, notation);

test('serving explains who uses whom, the impact and the C4 inversion', () => {
  const h = ex({ from: 'k8s', to: 'api', type: 'serving' });
  assert.equal(h.sentence, 'Hospedagem serve API de Pedidos.');
  assert.match(h.meaning, /API de Pedidos usa/);
  assert.match(h.impact, /Se Hospedagem falhar, há impacto em API de Pedidos/);
  assert.match(h.c4, /API de Pedidos usa Hospedagem/);
  assert.match(h.reading, /sentido oposto/);
});

test('access direction depends on read/write', () => {
  assert.match(ex({ from: 'proc', to: 'pedido', type: 'access', accessType: 'write' }).sentence, /Checkout grava Pedido/);
  const read = ex({ from: 'proc', to: 'pedido', type: 'access', accessType: 'read' });
  assert.match(read.sentence, /Checkout lê Pedido/);
  assert.match(read.reading, /aponta para quem lê/);
  assert.match(ex({ from: 'proc', to: 'pedido', type: 'access', accessType: 'readwrite' }).sentence, /lê e grava/);
});

test('composition and aggregation: the part supports the whole', () => {
  const c = ex({ from: 'api', to: 'ctrl', type: 'composition' });
  assert.match(c.sentence, /API de Pedidos contém Checkout Controller como parte integrante/);
  assert.match(c.meaning, /não existe sem/);
  assert.match(c.impact, /Se Checkout Controller falhar, há impacto em API de Pedidos/);
  assert.match(ex({ from: 'api', to: 'ctrl', type: 'aggregation' }).meaning, /pode existir/);
});

test('assignment adapts to the element types', () => {
  assert.match(ex({ from: 'medico', to: 'proc', type: 'assignment' }).sentence, /Médico executa Checkout/);
  assert.match(ex({ from: 'medico', to: 'papel', type: 'assignment' }).sentence, /Médico desempenha o papel Comprador/);
  assert.match(ex({ from: 'node', to: 'jar', type: 'assignment' }).sentence, /pedidos.jar roda em Cluster/);
});

test('realization adapts to motivation targets', () => {
  assert.match(ex({ from: 'ctrl', to: 'svc', type: 'realization' }).meaning, /abstrat/);
  assert.match(ex({ from: 'api', to: 'req', type: 'realization' }).sentence, /API de Pedidos atende a p95 < 2s/);
});

test('derived edges carry the chain and a caveat', () => {
  const h = ex({ from: 'k8s', to: 'proc', type: 'serving', derived: true, via: ['API de Pedidos', 'Serviço de Checkout'] });
  assert.match(h.title, /derivada/i);
  assert.match(h.derived, /API de Pedidos → Serviço de Checkout/);
  assert.match(h.derived, /indireta/);
});

test('C4 uses reads consumer → provider and keeps label + technology', () => {
  const h = ex({ from: 'web', to: 'api', type: 'uses', label: 'Fecha pedido', technology: 'REST', count: 2 }, 'c4');
  assert.equal(h.sentence, 'Web usa API de Pedidos.');
  assert.match(h.meaning, /Fecha pedido/);
  assert.match(h.meaning, /REST/);
  assert.match(h.meaning, /2 relações/);
  assert.match(h.impact, /Se API de Pedidos falhar, há impacto em Web/);
});

test('every relationship type has a sentence and a glossary entry', () => {
  for (const type of Object.keys(RELATIONSHIP_TYPES)) {
    const h = ex({ from: 'api', to: 'web', type });
    assert.ok(h.sentence.endsWith('.'), type);
    const g = GLOSSARY.types[type];
    assert.ok(g && g.label && g.notation && g.meaning && g.reading && g.example, `glossary ${type}`);
  }
  assert.ok(GLOSSARY.types.uses);
  assert.ok(GLOSSARY.confusions.length >= 4);
});
