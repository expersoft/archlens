import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliasKey, similarity, findCandidates, FUZZY_THRESHOLD } from '../scripts/lib/match.mjs';

test('aliasKey ignores accents, case and punctuation', () => {
  assert.equal(aliasKey('API de Notificações'), 'api de notificacoes');
  assert.equal(aliasKey('orders-service'), aliasKey('Orders Service'));
  assert.equal(aliasKey('loja.api'), 'loja api');
});

test('similarity ignores generic words and tolerates small spelling changes', () => {
  assert.equal(FUZZY_THRESHOLD, 0.75);
  assert.equal(similarity('API de Agendamento', 'Agendamento API'), 1);
  assert.equal(similarity('Worker de Notificações', 'worker-notificacoes'), 1);
  assert.ok(similarity('Gateway de Pagamento', 'Gateway Pagamentos') >= FUZZY_THRESHOLD);
  assert.ok(similarity('Portal Médico', 'Portal do Paciente') < FUZZY_THRESHOLD);
  assert.equal(similarity('API', 'App'), 0);
});

test('findCandidates: same type only; same parent and technology still need some name overlap', () => {
  const pool = [
    { id: 'tele.api', names: ['API de Agendamento'], type: 'application-component', parent: 'tele', technology: 'Node.js' },
    { id: 'tele.notificador', names: ['Worker de Notificações'], type: 'application-component', parent: 'tele', technology: 'Node.js' },
    { id: 'bp-agendar', names: ['Agendamento'], type: 'business-process', parent: null },
  ];
  const c = findCandidates({ id: 'api-agenda', names: ['API Agendamento'], type: 'application-component', parent: 'tele', technology: 'node.js' }, pool);
  assert.deepEqual(c.map(x => x.id), ['tele.api']);
  assert.match(c[0].why, /nome parecido/);
  assert.deepEqual(findCandidates({ id: 'x', names: ['Gateway Fiscal'], type: 'application-component', parent: 'tele', technology: 'Node.js' }, pool), []);
  const slot = findCandidates({ id: 'y', names: ['Agendamento Online'], type: 'application-component', parent: 'tele', technology: 'Node.js' }, pool);
  assert.deepEqual(slot.map(x => x.id), ['tele.api']);
  assert.match(slot[0].why, /mesmo pai e mesma tecnologia/);
  assert.deepEqual(findCandidates({ id: 'z', names: ['API Agendamento'], type: null, parent: null }, pool), []);
});
