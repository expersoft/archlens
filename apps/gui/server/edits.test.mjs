import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEdits, composeDelta, screenConflicts, screenAnswers, applyEdit, originOf, findDeltaElement } from './plan/edits.mjs';

const rejects = (fn, re) => assert.throws(fn, e => e.code === 'E_GUI_DRAFT' && re.test(e.message));
const agent = (elements = [], extra = {}) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'chat' }, model: { elements, relationships: [] }, ...extra });
const draftOf = (delta, edits = {}, kept = []) => ({ delta, plan: null, edits, kept });

test('composeDelta sobrepõe a propriedade editada à do agente', () => {
  const delta = { 'archlens-delta': '1.0', model: { elements: [{ id: 'loja', properties: { criticidade: 'alta', x: '1' } }] } };
  const out = composeDelta(delta, { loja: { properties: { criticidade: 'média' } } }, new Set());
  assert.deepEqual(out.model.elements[0].properties, { criticidade: 'média', x: '1' });
  assert.deepEqual(delta.model.elements[0].properties, { criticidade: 'alta', x: '1' }, 'não altera o delta do agente');
});

test('composeDelta acrescenta elemento ausente e documentação', () => {
  const delta = agent([{ id: 'a', name: 'A' }], { docs: [{ id: 'a', text: 'do chat' }] });
  const out = composeDelta(delta, { loja: { properties: { owner: 'X' }, doc: 'da tela' }, a: { doc: 'meu' } }, new Set());
  assert.deepEqual(out.model.elements.find(e => e.id === 'loja'), { id: 'loja', properties: { owner: 'X' } });
  assert.deepEqual(out.docs, [{ id: 'a', text: 'meu' }, { id: 'loja', text: 'da tela' }]);
});

test('composeDelta sem delta cria um com source gui', () => {
  const out = composeDelta(null, { loja: { properties: { criticidade: null } } }, new Set());
  assert.equal(out['archlens-delta'], '1.0');
  assert.deepEqual(out.source, { kind: 'prompt', ref: 'gui' });
  assert.equal(out.summary, 'Edições feitas na tela');
  assert.deepEqual(out.model.elements, [{ id: 'loja', properties: { criticidade: null } }]);
});

test('composeDelta sem edições devolve o próprio delta', () => {
  const delta = agent();
  assert.equal(composeDelta(delta, {}, new Set()), delta);
  assert.equal(composeDelta(null, {}, new Set()), null);
});

test('composeDelta ignora nó removido pelo delta', () => {
  const delta = agent([], { ops: [{ op: 'remove', id: 'loja' }] });
  const edits = { loja: { properties: { owner: 'X' }, doc: 'texto' } };
  assert.equal(composeDelta(delta, edits, new Set(['loja'])), delta);
  const out = composeDelta(delta, { ...edits, a: { doc: 'ok' } }, new Set(['loja']));
  assert.deepEqual(out.model.elements, []);
  assert.deepEqual(out.docs, [{ id: 'a', text: 'ok' }]);
});

test('screenConflicts acusa valor diferente do agente e respeita kept', () => {
  const delta = agent([{ id: 'loja', properties: { criticidade: 'baixa', owner: 'Y' } }], { docs: [{ id: 'loja', text: 'chat' }] });
  const edits = { loja: { properties: { criticidade: 'média', owner: 'Y' }, doc: 'tela' } };
  assert.deepEqual(screenConflicts(delta, edits, []), [
    { id: 'loja', field: 'properties.criticidade', mine: 'média', theirs: 'baixa' },
    { id: 'loja', field: 'doc', mine: 'tela', theirs: 'chat' },
  ]);
  const kept = [{ id: 'loja', field: 'properties.criticidade', value: 'baixa' }, { id: 'loja', field: 'doc', value: 'chat' }];
  assert.deepEqual(screenConflicts(delta, edits, kept), []);
  const other = agent([{ id: 'loja', properties: { criticidade: 'nenhuma' } }]);
  assert.equal(screenConflicts(other, edits, kept).length, 1, 'valor novo do chat abre aviso novo');
  assert.deepEqual(screenConflicts(null, edits, []), []);
});

test('applyEdit resolve mine grava kept; theirs tira o campo', () => {
  const delta = agent([{ id: 'loja', properties: { criticidade: 'baixa' } }]);
  const d = draftOf(delta, { loja: { properties: { criticidade: 'média', owner: 'X' } } });
  const mine = applyEdit(d, { op: 'resolve', id: 'loja', field: 'properties.criticidade', choice: 'mine' });
  assert.deepEqual(mine.kept, [{ id: 'loja', field: 'properties.criticidade', value: 'baixa' }]);
  assert.deepEqual(mine.edits, d.edits);
  const theirs = applyEdit(d, { op: 'resolve', id: 'loja', field: 'properties.criticidade', choice: 'theirs' });
  assert.deepEqual(theirs.edits, { loja: { properties: { owner: 'X' } } });
  assert.equal(originOf(theirs.edits, 'loja', 'properties.criticidade'), 'chat');
  assert.equal(originOf(theirs.edits, 'loja', 'properties.owner'), 'tela');
  assert.equal(originOf(theirs.edits, 'loja'), 'tela');
  assert.equal(originOf(theirs.edits, 'outro'), 'chat');
  rejects(() => applyEdit(d, { op: 'resolve', id: 'loja', field: 'properties.owner', choice: 'mine' }), /conflito/);
});

test('applyEdit undo apaga edits e kept do nó', () => {
  const d = draftOf(agent(), { loja: { doc: 'x' }, a: { doc: 'y' } }, [{ id: 'loja', field: 'doc', value: 'z' }, { id: 'a', field: 'doc', value: 'w' }]);
  const out = applyEdit(d, { op: 'undo', id: 'loja' });
  assert.deepEqual(out.edits, { a: { doc: 'y' } });
  assert.deepEqual(out.kept, [{ id: 'a', field: 'doc', value: 'w' }]);
});

test('applyEdit properties tira da camada o valor igual ao da base', () => {
  const d = draftOf(null);
  const base = { owner: 'Squad Checkout', criticidade: 'alta' };
  const out = applyEdit(d, { op: 'properties', id: 'loja', properties: { owner: 'Squad Checkout', criticidade: 'média', nova: null } }, base);
  assert.deepEqual(out.edits, { loja: { properties: { criticidade: 'média' } } });
  assert.deepEqual(applyEdit(out, { op: 'properties', id: 'loja', properties: { criticidade: 'alta' } }, base).edits, {});
  // O chat propõe outro valor: manter o da base precisa ficar na camada.
  const withChat = draftOf(agent([{ id: 'loja', properties: { criticidade: 'baixa', x: '1' } }]));
  assert.deepEqual(applyEdit(withChat, { op: 'properties', id: 'loja', properties: { criticidade: 'alta', x: null } }, base).edits,
    { loja: { properties: { criticidade: 'alta', x: null } } });
});

test('applyEdit properties substitui as editadas e reabre a resposta de quem saiu da camada', () => {
  const plan = { 'archlens-plan': '1.0', items: [
    { key: 'el:loja:properties.criticidade', class: 'conflict', resolution: 'take' },
    { key: 'doc:loja:0123456789ab', class: 'conflict', resolution: 'take' },
    { key: 'el:loja:properties.owner', class: 'conflict', resolution: 'keep' },
  ] };
  const d = { ...draftOf(null, { loja: { properties: { criticidade: 'média', owner: 'X' }, doc: 't' } }), plan };
  const out = applyEdit(d, { op: 'properties', id: 'loja', properties: { owner: 'X' } }, {});
  assert.deepEqual(out.edits, { loja: { properties: { owner: 'X' }, doc: 't' } });
  assert.deepEqual(out.plan.items.map(i => i.resolution), [null, 'take', 'keep']);
  const undone = applyEdit(d, { op: 'undo', id: 'loja' });
  assert.deepEqual(undone.plan.items.map(i => i.resolution), [null, null, null]);
  assert.equal(d.plan.items[0].resolution, 'take', 'não altera o rascunho de entrada');
});

test('applyEdit doc grava o texto', () => {
  assert.deepEqual(applyEdit(draftOf(null), { op: 'doc', id: 'loja', text: '# Loja' }).edits, { loja: { doc: '# Loja' } });
  rejects(() => applyEdit(draftOf(null), { op: 'doc', id: 'loja', text: 3 }), /documentação/);
  rejects(() => applyEdit(draftOf(null), { op: 'nada', id: 'loja' }), /edição/);
});

test('checkEdits recusa chave só com espaços e aceita "a.b"', () => {
  assert.deepEqual(checkEdits({ loja: { properties: { 'a.b': '1' } } }, []), { edits: { loja: { properties: { 'a.b': '1' } } }, kept: [] });
  assert.deepEqual(checkEdits(undefined, undefined), { edits: {}, kept: [] });
  rejects(() => checkEdits({ loja: { properties: { ' ': '1' } } }, []), /chave/);
  rejects(() => checkEdits({ loja: { properties: { '': '1' } } }, []), /chave/);
  rejects(() => checkEdits({ loja: { properties: { a: { x: 1 } } } }, []), /valor/);
  rejects(() => checkEdits({ loja: { properties: { a: [1] } } }, []), /valor/);
  rejects(() => checkEdits({ loja: { doc: 1 } }, []), /documentação/);
  rejects(() => checkEdits({ loja: { outro: 1 } }, []), /outro/);
  rejects(() => checkEdits([], []), /edições/);
  rejects(() => checkEdits({}, [{ id: 'loja', field: 'nome', value: 1 }]), /kept|conflito/);
  assert.deepEqual(checkEdits({ loja: { properties: { n: 1, b: true, l: ['x'], r: null } } }, [{ id: 'loja', field: 'properties.n', value: 2 }]).kept,
    [{ id: 'loja', field: 'properties.n', value: 2 }]);
});

test('screenAnswers responde take às perguntas que a tela já responde', () => {
  const plan = { 'archlens-plan': '1.0', items: [
    { key: 'el:loja:properties.criticidade', class: 'conflict', resolution: null },
    { key: 'el:loja:properties.owner', class: 'conflict', resolution: null },
    { key: 'doc:loja:0123456789ab', class: 'conflict', kind: 'doc', resolution: null },
    { key: 'doc:a:0123456789ab', class: 'conflict', kind: 'doc', resolution: null },
  ] };
  assert.deepEqual(screenAnswers(plan, { loja: { properties: { criticidade: 'média' }, doc: 'x' } }),
    { 'el:loja:properties.criticidade': 'take', 'doc:loja:0123456789ab': 'take' });
  assert.deepEqual(screenAnswers(null, { loja: { doc: 'x' } }), {});
});

test('applyEdit: editar o valor que o chat já propôs não abre aviso; um valor novo do chat depois abre', () => {
  const delta = agent([{ id: 'loja', properties: { criticidade: 'baixa', owner: 'Y' } }], { docs: [{ id: 'loja', text: 'do chat' }] });
  let d = applyEdit(draftOf(delta), { op: 'properties', id: 'loja', properties: { criticidade: 'média', owner: 'Y' } }, { criticidade: 'alta' });
  d = applyEdit(d, { op: 'doc', id: 'loja', text: 'do chat\nmais uma linha' });
  assert.deepEqual(screenConflicts(d.delta, d.edits, d.kept), []);
  assert.deepEqual(d.kept, [{ id: 'loja', field: 'properties.criticidade', value: 'baixa' }, { id: 'loja', field: 'doc', value: 'do chat' }]);
  const later = agent([{ id: 'loja', properties: { criticidade: 'nenhuma', owner: 'Y' } }], { docs: [{ id: 'loja', text: 'outro texto' }] });
  assert.deepEqual(screenConflicts(later, d.edits, d.kept).map(c => c.field), ['properties.criticidade', 'doc']);
});

test('findDeltaElement acha o nó aninhado em children', () => {
  const delta = agent([{ id: 'sis', name: 'Sis', children: [{ id: 'sis.api', name: 'API', children: [{ id: 'sis.api.x', name: 'X' }] }] }]);
  assert.equal(findDeltaElement(delta, 'sis.api.x').name, 'X');
  assert.equal(findDeltaElement(delta, 'sis').name, 'Sis');
  assert.equal(findDeltaElement(delta, 'nada'), undefined);
  assert.equal(findDeltaElement(null, 'sis'), undefined);
});

test('composeDelta e screenConflicts usam o nó aninhado em children, sem entrada duplicada', () => {
  const delta = agent([{ id: 'sis', name: 'Sis', children: [{ id: 'loja', properties: { criticidade: 'baixa', x: '1' } }] }]);
  const edits = { loja: { properties: { criticidade: 'média' } } };
  const out = composeDelta(delta, edits, new Set());
  assert.equal(out.model.elements.length, 1, 'nenhuma entrada solta para "loja"');
  assert.deepEqual(out.model.elements[0].children[0].properties, { criticidade: 'média', x: '1' });
  assert.deepEqual(screenConflicts(delta, edits, []), [{ id: 'loja', field: 'properties.criticidade', mine: 'média', theirs: 'baixa' }]);
});

test('checkEdits recusa as chaves __proto__, constructor e prototype', () => {
  for (const k of ['__proto__', 'constructor', 'prototype']) {
    rejects(() => checkEdits(JSON.parse(`{"loja":{"properties":{"${k}":"x"}}}`), []), new RegExp(`"${k}"`));
    rejects(() => applyEdit(draftOf(null), { op: 'properties', id: 'loja', properties: JSON.parse(`{"${k}":"x"}`) }), /reservad/);
  }
});

test('applyEdit: editar outra propriedade do nó não fecha o aviso pendente como "Manter o seu"', () => {
  const before = agent([{ id: 'loja', properties: { k: 'B' } }], { docs: [{ id: 'loja', text: 'do chat' }] });
  let d = applyEdit(draftOf(before), { op: 'properties', id: 'loja', properties: { k: 'A' } }, {});
  d = applyEdit(d, { op: 'doc', id: 'loja', text: 'meu texto' });
  // o chat propõe valores novos: os dois avisos ficam pendentes
  d = { ...d, delta: agent([{ id: 'loja', properties: { k: 'C', j: 'chat' } }], { docs: [{ id: 'loja', text: 'outro do chat' }] }) };
  assert.deepEqual(screenConflicts(d.delta, d.edits, d.kept).map(c => c.field), ['properties.k', 'doc']);
  // o usuário edita só j (o painel reenvia k com o mesmo valor) e regrava a doc sem mudar o texto
  d = applyEdit(d, { op: 'properties', id: 'loja', properties: { k: 'A', j: 'x' } }, {});
  d = applyEdit(d, { op: 'doc', id: 'loja', text: 'meu texto' });
  assert.deepEqual(screenConflicts(d.delta, d.edits, d.kept).map(c => c.field), ['properties.k', 'doc'], 'os avisos continuam esperando resposta');
  assert.deepEqual(d.kept.filter(k => k.field !== 'properties.j').map(k => k.value), ['B', 'do chat']);
  assert.deepEqual(d.kept.find(k => k.field === 'properties.j'), { id: 'loja', field: 'properties.j', value: 'chat' }, 'j mudou: a edição responde ao chat');
});
