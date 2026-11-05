import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { newDraft } from './plan/draft.mjs';
import { runPlan } from './plan/agent.mjs';
import { scripted } from './ask/scripted.mjs';
import { openQuestions } from '../../../scripts/lib/merge.mjs';
import { plan as planDelta } from '../../../scripts/lib/api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DUP = {
  'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' },
  model: { elements: [{ id: 'cliente-novo', name: 'Cliente', type: 'business-actor' }], relationships: [] },
};
const NEW = {
  'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' },
  model: { elements: [{ id: 'sistema-novo', name: 'Sistema Novo Zeta', type: 'application-component' }], relationships: [] },
};

function withBase(fn) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-pagent-')), 'arch');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  const reg = createBaseRegistry({ port: 1, bases: [{ id: 'loja-online', path: dir }] }, { pollMs: 100000 });
  const ctx = reg.get('loja-online');
  return Promise.resolve(fn(ctx)).finally(() => reg.close());
}
const U = { input: 10, output: 5, cacheRead: 0 };
const turn = (calls, usage = U) => ({ text: '', calls: calls.map((c, i) => ({ id: `c${i}`, ...c })), usage, ms: 1 });
const call = (name, input = {}) => ({ name, input });
const opts = (provider, extra = {}) => ({ provider, maxRounds: 8, timeoutMs: 5000, maxTokens: 100000, ...extra });
const req = (ctx, extra = {}) => ({ draft: newDraft(ctx), message: 'adicione o cliente', history: [], ...extra });

const dupKey = ctx => openQuestions(planDelta(ctx.store, DUP).plan)[0].key;
const abortErr = () => Object.assign(new Error('x'), { code: 'E_LLM_ABORT' });

test('uma falha leva o que já foi gasto', () => withBase(async ctx => {
  const p = scripted([turn([call('set_delta', { delta: DUP })]), new Error('provedor caiu')]);
  await assert.rejects(runPlan(ctx, req(ctx), opts(p)), e => {
    assert.deepEqual(e.metrics.usage, U);
    assert.equal(e.metrics.rounds, 2);
    return true;
  });
}));

test('texto, set_delta, plan_draft e ask_decision terminam em decisão', () => withBase(async ctx => {
  const events = [];
  const p = scripted([
    turn([call('set_delta', { delta: DUP })]),
    turn([call('plan_draft')]),
    turn([call('ask_decision', { key: dupKey(ctx), recommendation: 'same', reason: 'mesmo nome' })]),
  ]);
  const r = await runPlan(ctx, req(ctx), opts(p, { emit: e => events.push(e) }));
  assert.equal(r.reply.kind, 'decision');
  assert.deepEqual(r.draft.delta, DUP);
  assert.ok(r.draft.plan);
  assert.deepEqual(r.previews, []);
  assert.equal(r.metrics.rounds, 3);
  assert.deepEqual(r.metrics.usage, { input: 30, output: 15, cacheRead: 0 });
  assert.deepEqual(events.filter(e => e.type === 'tool').map(e => e.name), ['set_delta', 'plan_draft', 'ask_decision']);
  assert.ok(events.some(e => e.type === 'stage' && e.stage === 'lendo o pedido'));
  assert.ok(events.some(e => e.type === 'stage' && e.stage === 'planejando'));
  assert.deepEqual(p.seen[0].tools.map(t => t.name).slice(-9), ['ask_decision', 'ask_user', 'reply', 'draft_notes', 'read_notes', 'read_doc', 'scan_repo', 'read_file', 'grep']);
  assert.match(p.seen[0].input.text, /adicione o cliente/);
}));

test('answer replaneja antes do modelo', () => withBase(async ctx => {
  const first = planDelta(ctx.store, DUP).plan;
  const draft = { ...newDraft(ctx), delta: DUP, plan: first };
  const p = scripted([turn([call('reply', { text: 'pronto' })])]);
  const r = await runPlan(ctx, { draft, history: [], answer: { key: dupKey(ctx), resolution: 'different' } }, opts(p));
  assert.equal(r.reply.kind, 'text');
  assert.equal(r.draft.plan.state, 'final');
  assert.match(p.seen[0].input.text, /plano final|final/);
  assert.equal(openQuestions(r.draft.plan).length, 0);
}));

test('teto de rodadas preserva o rascunho', () => withBase(async ctx => {
  const p = scripted([turn([call('set_delta', { delta: NEW })]), turn([call('plan_draft')]), turn([call('show_plan')])]);
  const r = await runPlan(ctx, req(ctx), opts(p, { maxRounds: 2 }));
  assert.equal(r.reply.kind, 'none');
  assert.equal(r.reply.warning, 'teto de 2 rodadas');
  assert.deepEqual(r.draft.delta, NEW);
  assert.ok(r.draft.plan);
}));

test('teto de tokens por mensagem', () => withBase(async ctx => {
  const big = { input: 600, output: 500, cacheRead: 0 };
  const p = scripted([turn([call('set_delta', { delta: NEW })], big), turn([call('plan_draft')], big), turn([call('reply', { text: 'x' })])]);
  const r = await runPlan(ctx, req(ctx), opts(p, { maxTokens: 1000 }));
  assert.equal(r.reply.kind, 'none');
  assert.match(r.reply.warning, /teto de 1000 tokens/);
  assert.deepEqual(r.draft.delta, NEW);
}));

test('cancelamento', () => withBase(async ctx => {
  const ctl = new AbortController();
  const p = scripted([() => new Promise(() => {})]);
  const draft = newDraft(ctx);
  const run = runPlan(ctx, req(ctx, { draft }), opts(p, { signal: ctl.signal }));
  setTimeout(() => ctl.abort(), 10);
  await assert.rejects(run, { code: 'E_LLM_ABORT' });
  assert.equal(draft.delta, null);
  const p2 = scripted([abortErr()]);
  await assert.rejects(runPlan(ctx, req(ctx), opts(p2)), { code: 'E_LLM_ABORT' });
}));

test('segredos fora do prompt', () => withBase(async ctx => {
  const old = { k: process.env.OPENROUTER_API_KEY, t: process.env.GIT_TOKEN };
  process.env.OPENROUTER_API_KEY = 'sk-xyz'; process.env.GIT_TOKEN = 'ghp_abc';
  try {
    const p = scripted([turn([call('set_delta', { delta: NEW })]), turn([call('plan_draft')]), turn([call('reply', { text: 'ok' })])]);
    const draft = { ...newDraft(ctx), note: 'nota', repo: { url: 'https://github.com/a/b', commit: 'abc' } };
    await runPlan(ctx, req(ctx, { draft, history: [{ role: 'user', text: 'oi' }] }), opts(p));
    const all = JSON.stringify(p.seen);
    assert.ok(!all.includes('sk-xyz') && !all.includes('ghp_abc'));
    assert.match(p.seen[0].input.text, /<conteudo-externo origem="rascunho">/);
  } finally {
    for (const [n, v] of [['OPENROUTER_API_KEY', old.k], ['GIT_TOKEN', old.t]]) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
  }
}));

test('resposta sem ferramenta: um lembrete, depois texto', () => withBase(async ctx => {
  const p = scripted([{ text: 'penso...', calls: [], usage: U, ms: 1 }, { text: 'fala final', calls: [], usage: U, ms: 1 }]);
  const r = await runPlan(ctx, req(ctx), opts(p));
  assert.deepEqual(r.reply, { kind: 'text', text: 'fala final' });
  assert.equal(p.seen.length, 2);
  assert.match(p.seen[1].input.text, /reply|ask_user|ask_decision/);
}));

test('histórico limitado às últimas 12 mensagens', () => withBase(async ctx => {
  const history = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `msg-${i}` }));
  const p = scripted([turn([call('reply', { text: 'ok' })])]);
  await runPlan(ctx, req(ctx, { history }), opts(p));
  const t = p.seen[0].input.text;
  assert.ok(!t.includes('msg-2') && t.includes('msg-3') && t.includes('msg-14'));
}));

test('abort e erro do provedor levam o trabalho já feito no erro', () => withBase(async ctx => {
  const ctl = new AbortController();
  const p = scripted([turn([call('set_delta', { delta: NEW })]), () => new Promise(() => {})]);
  const run = runPlan(ctx, req(ctx), opts(p, { signal: ctl.signal }));
  setTimeout(() => ctl.abort(), 30);
  await assert.rejects(run, e => e.code === 'E_LLM_ABORT' && !!e.draft.delta?.model && Array.isArray(e.previews));
  const p2 = scripted([turn([call('set_delta', { delta: NEW })]), new Error('boom')]);
  await assert.rejects(runPlan(ctx, req(ctx), opts(p2)), e => e.message === 'boom' && !!e.draft.delta?.model);
}));

test('teto de tokens é por mensagem; o rascunho só acumula o total', () => withBase(async ctx => {
  const draft = { ...newDraft(ctx), usage: { tokens: 990 } };
  const p = scripted([turn([call('set_delta', { delta: NEW })]), turn([call('reply', { text: 'x' })])]);
  const r = await runPlan(ctx, req(ctx, { draft }), opts(p, { maxTokens: 1000 }));
  assert.equal(p.seen.length, 2);
  assert.equal(r.reply.kind, 'text');
  assert.equal(r.draft.usage.tokens, 990 + 2 * 15);
}));

test('o estado do rascunho traz contagens e respostas dadas; avisos se juntam', () => withBase(async ctx => {
  const draft = { ...newDraft(ctx), base: { id: ctx.id, version: 'antiga' }, delta: DUP, plan: planDelta(ctx.store, DUP).plan };
  const p = scripted([turn([call('set_delta', { delta: DUP })])]);
  const r = await runPlan(ctx, { draft, history: [], answer: { key: dupKey(ctx), resolution: 'different' } }, opts(p, { maxRounds: 1 }));
  const t = p.seen[0].input.text;
  assert.match(t, new RegExp(`respostas já dadas: ${dupKey(ctx)} = different`));
  assert.match(t, /itens do plano:/);
  assert.match(r.reply.warning, /a base mudou.*; teto de 1 rodadas/);
}));

test('o catálogo da base vai ao system como conteúdo externo', () => withBase(async ctx => {
  const p = scripted([turn([call('reply', { text: 'ok' })])]);
  await runPlan(ctx, req(ctx), opts(p));
  const [head, catalog] = p.seen[0].system;
  assert.doesNotMatch(head, /^<conteudo-externo/);
  assert.ok(catalog.startsWith('<conteudo-externo origem="base">\n'), catalog.slice(0, 80));
  assert.ok(catalog.endsWith('\n</conteudo-externo>'));
}));

test('delta grande vai ao modelo resumido: contagens e ids', () => withBase(async ctx => {
  const elements = Array.from({ length: 300 }, (_, i) => ({ id: `big-${i}`, name: `Grande ${i}`, type: 'application-component', description: `DESCRICAO-LONGA ${'d'.repeat(100)}` }));
  const relationships = [{ id: 'r-big', source: 'big-0', target: 'big-1', type: 'flow' }];
  const delta = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' }, model: { elements, relationships } };
  const p = scripted([turn([call('reply', { text: 'ok' })])]);
  await runPlan(ctx, req(ctx, { draft: { ...newDraft(ctx), delta } }), opts(p));
  const t = p.seen[0].input.text;
  assert.doesNotMatch(t, /DESCRICAO-LONGA/);
  assert.match(t, /300 elemento\(s\), 1 relação\(ões\)/);
  assert.match(t, /big-0 \(Grande 0\)/);
  assert.match(t, /r-big \(big-0 → big-1\)/);
  assert.ok(t.length < 20000, String(t.length));
}));

test('delta pequeno vai inteiro', () => withBase(async ctx => {
  const p = scripted([turn([call('reply', { text: 'ok' })])]);
  await runPlan(ctx, req(ctx, { draft: { ...newDraft(ctx), delta: NEW } }), opts(p));
  assert.ok(p.seen[0].input.text.includes(JSON.stringify(NEW)));
}));

test('o pedido de notas leva a rodada aplicada como conteúdo externo', () => withBase(async ctx => {
  const p = scripted([turn([call('reply', { text: 'ok' })])]);
  const applied = { summary: '+1 ~1 −0', added: ['sistema-novo'], changed: ['loja.pedidos'], removed: [] };
  await runPlan(ctx, req(ctx, { message: 'rascunhe as notas', applied }), opts(p));
  const t = p.seen[0].input.text;
  assert.match(t, /<conteudo-externo origem="rodada">\nresumo: \+1 ~1 −0\nadicionados: sistema-novo\nalterados: loja\.pedidos\nremovidos: nenhum\n<\/conteudo-externo>/);
}));
