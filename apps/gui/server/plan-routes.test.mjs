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

test('plan/preview com specs traz as visões pedidas, desenhadas com o delta', () => withPlan(async url => {
  const draft = await draftWith(url, NEW);
  const spec = { key: 'pedida', notation: 'c4', level: 'landscape', title: 'Panorama' };
  const { views } = await (await post(url, 'plan/preview', { draft, specs: [spec] })).json();
  assert.equal(views.length, 1);
  assert.equal(views[0].kind, 'asked');
  assert.equal(views[0].key, 'pedida');
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
  const registry = { list: () => real.list(), close: () => real.close(), get: id => ({ ...real.get(id), store: { ...real.get(id).store, remote: {} } }) };
  return withPlan(async url => {
    for (const p of ['plan', 'plan/open', 'plan/preview']) {
      const r = await post(url, p, { draft: newDraft({ id: 'loja', version: '' }), message: 'x', history: [] });
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
