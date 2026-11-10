import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.mjs';
import { createBaseRegistry } from './bases.mjs';
import { scripted } from './ask/scripted.mjs';
import { newDraft } from './plan/draft.mjs';
import { defaultPreviewSpecs } from './plan/preview.mjs';
import { resolveView } from '../../../scripts/lib/query.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (calls = []) => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `t${i}`, name, input })), ms: 1, usage: USAGE });
const json = { 'content-type': 'application/json' };
const lines = async res => (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));

const ALTER = {
  'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' },
  model: { elements: [{ id: 'loja.pedidos', name: 'API de Pedidos', type: 'application-component', description: 'Descrição nova para o teste de prévia' }], relationships: [] },
};
const NEW = {
  'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' },
  model: { elements: [{ id: 'sistema-novo', name: 'Sistema Novo Zeta', type: 'application-component' }], relationships: [] },
};

const provider = scripted([turn([['reply', { text: 'ok' }]])]);
const notesProvider = scripted([turn([['reply', { text: 'ok' }]])]);

async function withPlan(fn, { provider = scripted([]), registry, config = {} } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-proutes-')), 'arch');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  const cfg = { port: 0, bases: [{ id: 'loja', path: dir }], llm: { provider: 'anthropic' }, plan: { maxRounds: 8, timeoutMs: 20000, maxTokens: 100000 }, ...config };
  const srv = await startServer({ config: cfg, provider, registry });
  try { await fn(srv.url, srv, dir); } finally { await srv.close(); }
}
const post = (url, path, body, headers = json) => fetch(`${url}/api/bases/loja/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
const draftWith = async (url, delta) => (await (await post(url, 'plan/open', { draft: { ...newDraft({ id: 'loja', version: '' }), delta } })).json()).draft;
const ctxOf = dir => {
  const reg = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 100000 });
  return { ctx: reg.get('loja'), close: () => reg.close() };
};

test('plan responde em NDJSON e devolve o rascunho atualizado', () => withPlan(async url => {
  const res = await post(url, 'plan', { message: 'altere a API de pedidos', history: [] });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/x-ndjson; charset=utf-8/);
  const evs = await lines(res);
  assert.ok(evs.some(e => e.type === 'stage'));
  const result = evs.find(e => e.type === 'result');
  assert.deepEqual(result.draft.delta, ALTER);
  assert.ok(result.draft.plan);
  assert.equal(result.reply.kind, 'text');
  assert.deepEqual(result.previews, []);
  const last = evs.at(-1);
  assert.equal(last.type, 'done');
  assert.equal(last.metrics.rounds, 3);
}, { provider: scripted([turn([['set_delta', { delta: ALTER }]]), turn([['plan_draft', {}]]), turn([['reply', { text: 'pronto' }]])]) }));

test('plan: erro do provedor devolve o rascunho com o trabalho feito', () => withPlan(async url => {
  const evs = await lines(await post(url, 'plan', { message: 'altere', history: [] }));
  const err = evs.find(e => e.type === 'error');
  assert.match(err.error, /429/);
  assert.deepEqual(err.draft.delta, ALTER);
  assert.equal(evs.at(-1).type, 'done');
}, { provider: scripted([turn([['set_delta', { delta: ALTER }]]), Object.assign(new Error('o provedor de LLM respondeu 429: limite'), { code: 'E_LLM_HTTP' })]) }));

test('plan: rascunho vindo do navegador passa por checkDraft', () => withPlan(async url => {
  const res = await post(url, 'plan', { draft: { 'archlens-draft': '9' }, message: 'x', history: [] });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'E_GUI_DRAFT');
  assert.equal((await post(url, 'plan', { history: [] })).status, 400);
}));

test('plan/open replaneja e avisa base mudada', () => withPlan(async url => {
  const draft = { ...newDraft({ id: 'loja', version: 'antiga' }), delta: NEW };
  const r = await post(url, 'plan/open', { draft });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.ok(out.draft.plan);
  assert.notEqual(out.draft.base.version, 'antiga');
  assert.match(out.warning, /base mudou/);
  assert.equal((await post(url, 'plan/open', { draft: { x: 1 } })).status, 400);
}));

test('plan/preview padrão traz a visão do que muda e as salvas afetadas', () => withPlan(async (url, _srv, dir) => {
  const draft = await draftWith(url, ALTER);
  const r = await post(url, 'plan/preview', { draft });
  assert.equal(r.status, 200);
  const { views, summary } = await r.json();
  assert.equal(typeof summary, 'string');
  assert.equal(views[0].kind, 'change');
  assert.equal(views[0].spec.key, 'delta');
  assert.equal(views[0].viewData.nodes['loja.pedidos'].change, 'changed');
  assert.ok(views[0].html.includes('data-node'));
  const saved = views.slice(1);
  assert.ok(saved.every(v => v.kind === 'saved'));
  // Every saved view whose result holds loja.pedidos, and no other.
  const { ctx, close } = ctxOf(dir);
  const expected = ctx.model.views.filter(v => resolveView(ctx.model, v).nodes.some(n => n.id === 'loja.pedidos')).map(v => v.key);
  close();
  assert.ok(expected.length > 0);
  assert.ok(expected.length < ctx.model.views.length);
  assert.deepEqual(saved.map(v => v.key).sort(), expected.sort());
  assert.ok(saved.every(v => v.viewData.nodes['loja.pedidos']));
}));

test('plan/preview traz a lista do delta (+ ~ −), as perguntas abertas e o relatório do plano', () => withPlan(async url => {
  const alter = await (await post(url, 'plan/preview', { draft: await draftWith(url, ALTER) })).json();
  assert.deepEqual(alter.changes.map(({ sign, kind, id, name }) => ({ sign, kind, id, name })), [{ sign: '~', kind: 'element', id: 'loja.pedidos', name: 'API de Pedidos' }]);
  assert.ok(alter.changes[0].type);
  assert.deepEqual(alter.changes[0].fields.map(f => f.field), ['description']);
  assert.equal(alter.changes[0].fields[0].after, 'Descrição nova para o teste de prévia');
  assert.equal(alter.questions.length, 1);
  assert.equal(alter.questions[0].key, 'el:loja.pedidos:description');
  assert.deepEqual(alter.questions[0].options, ['keep', 'take', 'value:<x>']);
  assert.match(alter.report, /^# Plano/);
  const added = await (await post(url, 'plan/preview', { draft: await draftWith(url, NEW) })).json();
  assert.deepEqual(added.changes, [{ sign: '+', kind: 'element', id: 'sistema-novo', name: 'Sistema Novo Zeta', type: 'Application Component', fields: [], origin: 'chat' }]);
  const rel = await (await post(url, 'plan/preview', { draft: await draftWith(url, delta({ relationships: [{ from: 'loja.bff', to: 'loja.cache', type: 'association', description: 'nova' }] })) })).json();
  assert.ok(rel.changes.some(c => c.sign === '+' && c.kind === 'relationship' && c.name.includes(" → ") && !c.name.includes("loja.")
    && c.type === 'association' && c.description === 'nova' && c.ends.join() === 'loja.bff,loja.cache'));
}));

test('plan/preview: notation escolhe a notação da visão do que muda', () => withPlan(async url => {
  const draft = await draftWith(url, ALTER);
  const c4 = await (await post(url, 'plan/preview', { draft, notation: 'c4' })).json();
  assert.equal(c4.views[0].spec.notation, 'c4');
  const am = await (await post(url, 'plan/preview', { draft, notation: 'archimate' })).json();
  assert.equal(am.views[0].kind, 'change');
  assert.equal(am.views[0].spec.notation, 'archimate');
  assert.ok(am.views[0].viewData.nodes['loja.pedidos']);
  assert.equal((await post(url, 'plan/preview', { draft, notation: 'uml' })).status, 400);
}));

test('plan/actions: o menu de contexto vale para o que o rascunho adiciona, com chave e título', () => withPlan(async url => {
  const draft = await draftWith(url, NEW);
  const r = await post(url, 'plan/actions', { draft, id: 'sistema-novo' });
  assert.equal(r.status, 200);
  const { actions } = await r.json();
  assert.ok(actions.length > 0);
  const withSpec = actions.filter(a => a.spec);
  assert.ok(withSpec.every(a => /^nav-[0-9a-f]{10}$/.test(a.spec.key) && a.spec.title));
  // the base alone does not know the element
  const base = await (await fetch(`${url}/api/bases/loja/elements/sistema-novo/actions`)).json();
  assert.ok(!base.actions?.length);
  // the action draws over the preview
  const { views } = await (await post(url, 'plan/preview', { draft, specs: [withSpec[0].spec] })).json();
  assert.ok(views[0].viewData.nodes['sistema-novo']);
  assert.equal((await post(url, 'plan/actions', { draft })).status, 400);
}));

test('plan/flip: a visão do que muda vira a outra notação dela; as demais vão para a outra notação', () => withPlan(async url => {
  const draft = await draftWith(url, ALTER);
  const [change] = (await (await post(url, 'plan/preview', { draft, notation: 'c4' })).json()).views;
  const flipped = (await (await post(url, 'plan/flip', { draft, spec: change.spec })).json()).spec;
  assert.equal(flipped.key, 'delta');
  assert.equal(flipped.notation, 'archimate');
  const other = (await (await post(url, 'plan/flip', { draft, spec: { notation: 'c4', level: 'context', scope: 'loja' } })).json()).spec;
  assert.equal(other.notation, 'archimate');
  assert.match(other.key, /^nav-/);
  assert.ok(other.title);
  assert.equal((await post(url, 'plan/flip', { draft })).status, 400);
}));

test('plan/preview com specs traz as visões pedidas, desenhadas com o delta', () => withPlan(async url => {
  const draft = await draftWith(url, NEW);
  const spec = { key: 'pedida', notation: 'c4', level: 'landscape', title: 'Panorama' };
  const { views } = await (await post(url, 'plan/preview', { draft, specs: [spec] })).json();
  assert.equal(views.length, 1);
  assert.equal(views[0].kind, 'asked');
  assert.equal(views[0].key, 'pedida');
  assert.deepEqual(views[0].spec, spec);
  assert.equal(views[0].viewData.nodes['sistema-novo'].change, 'added');
  const bad = await post(url, 'plan/preview', { draft, specs: [{ notation: 'c4', level: 'container', scope: 'nao-existe' }] });
  assert.equal(bad.status, 400);
  assert.equal((await post(url, 'plan/preview', { draft: newDraft({ id: 'loja', version: '' }) })).status, 400);
}));

test('defaultPreviewSpecs: ids tocados viram o foco da visão do que muda', () => withPlan(async (url, _srv, dir) => {
  const draft = await draftWith(url, ALTER);
  const { ctx, close } = ctxOf(dir);
  const specs = defaultPreviewSpecs(ctx, draft);
  close();
  assert.equal(specs[0].key, 'delta');
  assert.equal(specs[0].title, 'O que muda');
  assert.deepEqual(specs[0].focus, ['loja.pedidos']);
  assert.equal(specs[0].depth, 1);
}));

const delta = model => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' }, model: { elements: [], relationships: [], ...model } });

test('plan/preview: delta só de relação foca as duas pontas e lista as salvas com elas', () => withPlan(async (url, _srv, dir) => {
  const draft = await draftWith(url, delta({ relationships: [{ from: 'loja.bff', to: 'loja.cache', type: 'association', description: 'nova' }] }));
  const { views } = await (await post(url, 'plan/preview', { draft })).json();
  assert.equal(views[0].kind, 'change');
  assert.ok(views[0].viewData.nodes['loja.bff'] && views[0].viewData.nodes['loja.cache']);
  assert.ok(views[0].viewData.edges.some(e => e.change === 'added'));
  const { ctx, close } = ctxOf(dir);
  const expected = ctx.model.views.filter(v => { const ids = resolveView(ctx.model, v).nodes.map(n => n.id); return ids.includes('loja.bff') || ids.includes('loja.cache'); }).map(v => v.key);
  close();
  assert.ok(expected.length > 0);
  assert.deepEqual(views.slice(1).map(v => v.key).sort(), expected.sort());
}));

test('plan/preview: delta só ArchiMate (nó de tecnologia) ainda traz a visão do que muda', () => withPlan(async url => {
  const draft = await draftWith(url, delta({ elements: [{ id: 'no-novo', name: 'Nó Novo', type: 'node' }] }));
  const { views } = await (await post(url, 'plan/preview', { draft })).json();
  assert.equal(views[0].kind, 'change');
  assert.equal(views[0].error, undefined);
  assert.equal(views[0].viewData.nodes['no-novo'].change, 'added');
}));

test('plan/preview: remoção continua visível na visão do que muda', () => withPlan(async url => {
  const draft = await draftWith(url, { ...delta({}), ops: [{ op: 'remove', id: 'loja.cache' }] });
  const { views } = await (await post(url, 'plan/preview', { draft })).json();
  assert.equal(views[0].kind, 'change');
  assert.equal(views[0].error, undefined);
  assert.equal(views[0].viewData.nodes['loja.cache'].change, 'removed');
}));

test('plan/preview: mais de 20 specs é 400; rascunho de ~1,5 MB passa no plan/open', () => withPlan(async url => {
  const draft = await draftWith(url, NEW);
  const spec = { notation: 'c4', level: 'landscape' };
  assert.equal((await post(url, 'plan/preview', { draft, specs: Array(21).fill(spec) })).status, 400);
  const fat = { ...newDraft({ id: 'loja', version: '' }), note: 'x'.repeat(1_500_000) };
  const r = await post(url, 'plan/open', { draft: fat });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).draft.note.length, 1_500_000);
}));

test('POST sem Origin da própria GUI é recusado', () => withPlan(async url => {
  const evil = await post(url, 'plan', { message: 'x', history: [] }, { ...json, origin: 'http://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal((await evil.json()).code, 'E_GUI_ORIGIN');
  assert.equal((await post(url, 'plan/preview', {}, { ...json, origin: 'http://evil.example' })).status, 403);
  assert.equal((await post(url, 'plan/open', {}, { ...json, origin: 'http://evil.example' })).status, 403);
  assert.equal((await post(url, 'plan/open', {}, { 'content-type': 'text/plain' })).status, 415);
}));

test('base MCP → 409 E_GUI_PLAN_MCP', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-proutes-')), 'arch');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  const real = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 100000 });
  const registry = { list: () => real.list(), close: () => real.close(), inTurn: (id, fn) => real.inTurn(id, fn), get: id => ({ ...real.get(id), store: { ...real.get(id).store, remote: {} } }) };
  return withPlan(async url => {
    for (const p of ['plan', 'plan/open', 'plan/preview', 'plan/actions', 'plan/flip', 'plan/apply', 'plan/notes', 'plan/edit', 'plan/element']) {
      const r = await post(url, p, { draft: newDraft({ id: 'loja', version: '' }), message: 'x', history: [], confirm: 'x', notes: 'x', id: 'loja', spec: {} });
      assert.equal(r.status, 409);
      const e = await r.json();
      assert.equal(e.code, 'E_GUI_PLAN_MCP');
      assert.equal(e.error, 'planejar ainda não funciona numa base gbrain no modo MCP; use a skill archlens-plan');
    }
  }, { registry });
});

test('plan desligado: as rotas /plan* respondem 404', async () => {
  const srv = await startServer({ config: { port: 0, bases: [{ id: 'loja', path: join(root, 'examples/loja-online/architecture') }] } });
  try {
    for (const p of ['plan', 'plan/open', 'plan/preview']) assert.equal((await post(srv.url, p, {})).status, 404);
  } finally { await srv.close(); }
});

test('plan: credencial em URL do histórico ou da mensagem não chega ao modelo', () => withPlan(async (url, srv) => {
  const history = [{ role: 'user', text: 'leia\n(anexo: https://x-access-token:ghp_segredo@github.com/a/b.git)' }, { role: 'assistant', text: 'ok' }];
  const evs = await lines(await post(url, 'plan', { message: 'e ssh://git:senha2@h/x.git? e ssh://git@h/y.git', history }));
  assert.ok(evs.some(e => e.type === 'result'));
  const seen = JSON.stringify(provider.seen);
  assert.doesNotMatch(seen, /ghp_segredo|senha2/);
  assert.match(seen, /https:\/\/github\.com\/a\/b\.git/);
  assert.match(seen, /ssh:\/\/h\/x\.git/);
  assert.match(seen, /ssh:\/\/git@h\/y\.git/); // a bare ssh user is no secret
}, { provider }));

test('plan: applied vai ao agente; applied inválido → 400', () => withPlan(async url => {
  const applied = { summary: '+1 ~0 −0', added: ['sistema-novo'], changed: [], removed: [] };
  const evs = await lines(await post(url, 'plan', { message: 'rascunhe as notas', applied, history: [] }));
  assert.ok(evs.some(e => e.type === 'result'));
  assert.match(notesProvider.seen[0].input.text, /<conteudo-externo origem="rodada">[\s\S]*adicionados: sistema-novo/);
  for (const bad of ['x', { summary: 1, added: [], changed: [], removed: [] }, { summary: 's', added: [1], changed: [], removed: [] }, { summary: 's', added: [] }]) {
    const res = await post(url, 'plan', { message: 'x', applied: bad, history: [] });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
}, { provider: notesProvider }));

// --- Screen edits (Planejar): the layer of the draft apart from the agent's delta. ---
const edit = async (url, draft, e) => post(url, 'plan/edit', { draft, edit: e });
const edited = async (url, draft, e) => {
  const r = await edit(url, draft, e);
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
};

test('/plan/edit grava propriedade e devolve opsHash', () => withPlan(async url => {
  const out = await edited(url, newDraft({ id: 'loja', version: '' }), { op: 'properties', id: 'loja', properties: { criticidade: 'média', novo: 'sim' } });
  assert.deepEqual(out.draft.edits, { loja: { properties: { criticidade: 'média', novo: 'sim' } } });
  assert.equal(out.draft.delta, null, 'o delta do agente não muda');
  assert.equal(out.draft.plan.state, 'final', 'a edição responde a própria pergunta');
  assert.match(out.opsHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(out.screenConflicts, []);
  // the preview works with only screen edits
  const preview = await post(url, 'plan/preview', { draft: out.draft });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).opsHash, out.opsHash);
  const unknown = await edit(url, out.draft, { op: 'properties', id: 'nao-existe', properties: { a: '1' } });
  assert.equal(unknown.status, 400);
  assert.match((await unknown.json()).error, /nao-existe/);
  const blank = await edit(url, out.draft, { op: 'properties', id: 'loja', properties: { ' ': '1' } });
  assert.equal(blank.status, 400);
  assert.equal((await edit(url, out.draft)).status, 400);
}));

test('/plan/edit: documentação numa base JSON é 400 com a mensagem do núcleo', () => withPlan(async url => {
  const r = await edit(url, newDraft({ id: 'loja', version: '' }), { op: 'doc', id: 'loja', text: 'Texto.' });
  assert.equal(r.status, 400);
  const e = await r.json();
  assert.equal(e.code, 'E_STORE_DOC');
  assert.match(e.error, /^documentação do nó exige uma base markdown ou gbrain/);
}));

test('/plan/element mostra nó proposto pelo chat e removed para nó removido', () => withPlan(async url => {
  const draft = await draftWith(url, NEW);
  const r = await post(url, 'plan/element', { draft, id: 'sistema-novo' });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.card.element.name, 'Sistema Novo Zeta');
  assert.equal(out.card.element.typeLabel, 'Application Component');
  assert.equal(out.removed, false);
  assert.equal(out.doc, null);
  assert.equal(out.docs, false);
  // the base alone does not know it
  assert.equal((await fetch(`${url}/api/bases/loja/elements/sistema-novo`)).status, 400);
  const removing = await draftWith(url, { ...delta({}), ops: [{ op: 'remove', id: 'loja.cache' }] });
  const gone = await (await post(url, 'plan/element', { draft: removing, id: 'loja.cache' })).json();
  assert.equal(gone.removed, true);
  assert.equal(gone.card.element.id, 'loja.cache');
  const props = await edited(url, newDraft({ id: 'loja', version: '' }), { op: 'properties', id: 'loja', properties: { criticidade: 'média' } });
  const card = (await (await post(url, 'plan/element', { draft: props.draft, id: 'loja' })).json()).card;
  assert.equal(card.properties.criticidade, 'média', 'o cartão é o da prévia');
  const empty = await (await post(url, 'plan/element', { draft: newDraft({ id: 'loja', version: '' }), id: 'loja' })).json();
  assert.equal(empty.card.properties.criticidade, 'alta', 'rascunho vazio: o nó como na base');
  assert.equal(empty.removed, false);
  assert.equal((await post(url, 'plan/element', { draft, id: 'nao-existe' })).status, 400);
  assert.equal((await post(url, 'plan/element', { draft })).status, 400);
}));

test('deltaList separa properties por chave e marca a origem', () => withPlan(async url => {
  const chat = delta({ elements: [{ id: 'loja', properties: { chat: 'do chat' } }, { id: 'erp', properties: { sla: '99' } }] });
  const opened = await draftWith(url, chat);
  let out = await edited(url, opened, { op: 'properties', id: 'loja', properties: { 'a.b': 'com ponto', criticidade: null } });
  out = await edited(url, out.draft, { op: 'properties', id: 'loja.cache', properties: { tela: 'só tela' } });
  const { changes } = await (await post(url, 'plan/preview', { draft: out.draft })).json();
  const of = id => changes.find(c => c.kind === 'element' && c.id === id);
  const fields = c => Object.fromEntries(c.fields.map(f => [f.field, f]));
  const loja = fields(of('loja'));
  assert.deepEqual(Object.keys(loja).sort(), ['properties.a.b', 'properties.chat', 'properties.criticidade']);
  assert.deepEqual(loja['properties.a.b'], { field: 'properties.a.b', before: '—', after: 'com ponto', origin: 'tela' });
  assert.deepEqual(loja['properties.chat'], { field: 'properties.chat', before: '—', after: 'do chat', origin: 'chat' });
  assert.deepEqual(loja['properties.criticidade'], { field: 'properties.criticidade', before: 'alta', after: '—', origin: 'tela' });
  assert.equal(of('loja').origin, 'ambos');
  assert.equal(of('erp').origin, 'chat');
  assert.equal(fields(of('erp'))['properties.sla'].origin, 'chat');
  assert.equal(of('loja.cache').origin, 'tela');
}));

test('/plan/edit em nó novo aninhado em children do delta grava a edição', () => withPlan(async url => {
  const draft = await draftWith(url, delta({ elements: [{ id: 'sis-novo', name: 'Sis Novo', type: 'application-component',
    children: [{ id: 'sis-novo.api', name: 'API Nova', type: 'application-component' }] }] }));
  const out = await edited(url, draft, { op: 'properties', id: 'sis-novo.api', properties: { owner: 'Time X' } });
  assert.deepEqual(out.draft.edits, { 'sis-novo.api': { properties: { owner: 'Time X' } } });
}));

test('/plan/edit na propriedade que o chat propôs não abre aviso e deixa aplicar', () => withPlan(async url => {
  const draft = await draftWith(url, delta({ elements: [{ id: 'loja', properties: { criticidade: 'baixa' } }] }));
  const out = await edited(url, draft, { op: 'properties', id: 'loja', properties: { criticidade: 'média' } });
  assert.deepEqual(out.screenConflicts, []);
  assert.match(out.opsHash, /^[0-9a-f]{64}$/);
}));

test('/plan/edit que deixa o rascunho grande demais é 400 com a mensagem do teto', () => withPlan(async url => {
  const r = await edit(url, newDraft({ id: 'loja', version: '' }), { op: 'properties', id: 'loja', properties: { grande: 'x'.repeat(2_100_000) } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /grande demais/);
}));
