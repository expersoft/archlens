import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { scripted } from './ask/scripted.mjs';
import { runAsk } from './ask/agent.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const open = () => {
  const registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: join(root, 'examples/loja-online/architecture') }] }, { pollMs: 1e6 });
  return { registry, ctx: registry.get('loja') };
};
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (calls = []) => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `t${i}`, name, input })), ms: 1, usage: USAGE });
const text = t => ({ text: t, calls: [], ms: 1, usage: USAGE });
const SUPORTE = { notation: 'archimate', viewpoint: 'layered', anchor: 'bp-checkout', traverse: { mode: 'supporters' }, granularity: 'container' };
const REQ = { question: 'o que suporta o checkout?' };
const run = async (turns, opts = {}, scriptOpts) => {
  const { registry, ctx } = open();
  try {
    const provider = opts.provider ?? scripted(turns, scriptOpts);
    const events = [];
    const out = await runAsk(ctx, opts.req ?? REQ, { provider, emit: e => events.push(e), ...opts.run });
    return { ...out, provider, events };
  } finally { registry.close(); }
};

test('one round: show_view straight away', async () => {
  const { result, metrics, provider, events } = await run([turn([['show_view', { spec: SUPORTE }]])]);
  assert.equal(result.kind, 'view');
  assert.equal(metrics.rounds, 1);
  assert.equal(metrics.mode, 'tools');
  assert.ok(provider.seen[0].system[1].includes('bp-checkout'));
  assert.ok(events.some(e => e.type === 'stage' && e.stage === 'interpretando'));
});

test('query tools run and return together', async () => {
  const { result, metrics, provider, events } = await run([
    turn([['find_elements', { text: 'pedidos' }], ['element_card', { id: 'loja.pedidos' }]]),
    turn([['show_element', { id: 'loja.pedidos' }]]),
  ]);
  assert.equal(result.kind, 'element');
  assert.equal(provider.seen[1].input.results.length, 2);
  assert.equal(metrics.calls, 3);
  assert.equal(metrics.rounds, 2);
  assert.deepEqual(events.filter(e => e.type === 'tool').map(e => e.name), ['find_elements', 'element_card', 'show_element']);
});

test('spec inválida volta como erro e a correção vence', async () => {
  const { result, provider } = await run([
    turn([['show_view', { spec: { ...SUPORTE, anchor: 'inventado' } }]]),
    turn([['show_view', { spec: SUPORTE }]]),
  ]);
  assert.equal(provider.seen[1].input.results[0].isError, true);
  assert.equal(result.kind, 'view');
  assert.equal(result.spec.anchor, 'bp-checkout');
});

test('texto sem ferramenta recebe lembrete', async () => {
  const { result, provider } = await run([text('talvez'), turn([['clarify', { question: 'qual?', options: ['loja.pedidos'] }]])]);
  assert.ok(provider.seen[1].input.text.includes('show_view, show_element ou clarify'));
  assert.equal(result.kind, 'clarify');
});

test('round ceiling returns the best view with a warning', async () => {
  const { result, provider, metrics } = await run(Array.from({ length: 4 }, () => turn([['try_view', { spec: SUPORTE }]])));
  assert.equal(result.kind, 'view');
  assert.equal(result.spec.anchor, 'bp-checkout');
  assert.ok(result.warning.includes('teto de 4 rodadas'));
  assert.equal(provider.seen.length, 4);
  assert.equal(metrics.rounds, 4);
});

test('round ceiling without a best result gives none', async () => {
  const { result } = await run([text('a'), text('b')], { run: { maxRounds: 2 } });
  assert.equal(result.kind, 'none');
  assert.ok(result.warning.includes('teto de 2 rodadas'));
});

const waiting = () => ({
  name: 'w', model: 'w', tools: true,
  open: () => ({ send: (_i, { signal } = {}) => new Promise((_, rej) => {
    const stop = () => rej(Object.assign(new Error('busca cancelada'), { code: 'E_LLM_ABORT' }));
    if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
  }) }),
});

test('teto de tempo', async () => {
  const t0 = Date.now();
  const { result } = await run([], { provider: waiting(), run: { timeoutMs: 50 } });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(result.kind, 'none');
  assert.ok(result.warning.includes('teto'));
});

test('caller abort rejects', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(run([], { provider: waiting(), run: { signal: ac.signal } }), { code: 'E_LLM_ABORT' });
});

test('provider errors propagate', async () => {
  await assert.rejects(run([Object.assign(new Error('x'), { code: 'E_LLM_HTTP' })]), { code: 'E_LLM_HTTP' });
});

test('json mode: one retry on bad JSON', async () => {
  const { result, metrics, provider } = await run([text('texto solto'), text('{"show_element":{"id":"loja.pedidos"}}')], {}, { tools: false });
  assert.equal(result.kind, 'element');
  assert.equal(metrics.mode, 'json');
  assert.equal(provider.seen[0].tools, null);
  assert.ok(provider.seen[0].system[1].includes('## Relações'));
});

test('json mode: a second failure ends without a result', async () => {
  const { result, provider } = await run([text('a'), text('{"show_element":{"id":"nao.existe"}}')], {}, { tools: false });
  assert.equal(result.kind, 'none');
  assert.equal(provider.seen.length, 2);
});
