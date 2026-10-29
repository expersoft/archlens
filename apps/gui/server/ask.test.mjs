import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.mjs';
import { scripted } from './ask/scripted.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const config = () => ({ port: 0, bases: [{ id: 'loja', path: join(root, 'examples/loja-online/architecture') }] });
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (calls = []) => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `t${i}`, name, input })), ms: 1, usage: USAGE });
const SUPORTE = { notation: 'archimate', viewpoint: 'layered', anchor: 'bp-checkout', traverse: { mode: 'supporters' }, granularity: 'container' };

async function withServer(opts, fn) {
  const srv = await startServer({ config: config(), ...opts });
  try { await fn(srv.url, srv); } finally { await srv.close(); }
}
const ask = (url, body, init = {}) => fetch(`${url}/api/bases/loja/ask`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init });
const lines = async res => (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
const Q = { question: 'o que suporta o checkout?' };

test('ask streams stages, result with view, then done', () => withServer({ provider: scripted([turn([['show_view', { spec: SUPORTE }]])]) }, async url => {
  const res = await ask(url, Q);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/x-ndjson; charset=utf-8/);
  const evs = await lines(res);
  assert.ok(evs.some(e => e.type === 'stage'));
  const result = evs.find(e => e.type === 'result');
  assert.equal(result.result.kind, 'view');
  assert.ok(result.view.html.includes('data-node'));
  const last = evs.at(-1);
  assert.equal(last.type, 'done');
  assert.equal(last.metrics.rounds, 1);
  assert.equal(typeof last.metrics.render, 'number');
}));

test('answer: true brings the markdown', () => withServer({ provider: scripted([turn([['show_view', { spec: SUPORTE, answer: true }]])]) }, async url => {
  const r = (await lines(await ask(url, Q))).find(e => e.type === 'result');
  assert.ok(r.markdown.startsWith('# '));
  assert.ok(r.answer.sections.length > 0);
}));

test('ask disabled is 503', () => withServer({}, async url => {
  const res = await ask(url, Q);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'E_GUI_ASK_OFF');
  assert.equal((await (await fetch(`${url}/api/info`)).json()).ask.enabled, false);
}));

test('info describes the enabled search', () => withServer({ provider: scripted([]) }, async url => {
  assert.deepEqual((await (await fetch(`${url}/api/info`)).json()).ask, { enabled: true, provider: 'scripted', model: 'scripted', mode: 'tools' });
}));

test('empty or huge question is 400', () => withServer({ provider: scripted([]) }, async url => {
  assert.equal((await ask(url, { question: '  ' })).status, 400);
  assert.equal((await ask(url, {})).status, 400);
  assert.equal((await ask(url, { question: 'x'.repeat(2001) })).status, 400);
  assert.equal((await fetch(`${url}/api/bases/nao-existe/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Q) })).status, 400);
}));

test('provider error ends the stream with error', () => withServer({
  provider: scripted([Object.assign(new Error('o provedor de LLM respondeu 429: limite'), { code: 'E_LLM_HTTP' })]),
}, async url => {
  const evs = await lines(await ask(url, Q));
  const err = evs.find(e => e.type === 'error');
  assert.match(err.error, /429/);
  assert.equal(err.code, 'E_LLM_HTTP');
  assert.equal(evs.at(-1).type, 'done');
}));

test('conexão fechada aborta o agente', () => {
  let sig;
  const provider = {
    name: 'espera', model: 'm', tools: true,
    open: () => ({ send: (_i, { signal }) => { sig = signal; return new Promise(() => {}); } }),
  };
  return withServer({ provider }, async url => {
    const ctl = new AbortController();
    const p = ask(url, Q, { signal: ctl.signal }).catch(() => {});
    for (let i = 0; i < 100 && !sig; i++) await new Promise(r => setTimeout(r, 10));
    assert.ok(sig, 'o provedor foi chamado');
    ctl.abort();
    await p;
    for (let i = 0; i < 50 && !sig.aborted; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(sig.aborted, true);
  });
});

test('telemetry records without the question by default', () => withServer({ provider: scripted([turn([['show_view', { spec: SUPORTE }]])]) }, async (url, srv) => {
  await (await ask(url, Q)).text();
  const s = await (await fetch(`${url}/api/telemetry`)).json();
  assert.equal(s.n, 1);
  assert.equal(s.byOutcome.view, 1);
  const e = srv.telemetry.recent()[0];
  assert.ok(!('question' in e));
  assert.equal(e.base, 'loja');
  assert.equal(e.rounds, 1);
}));

test('POST cross-site: text/plain é 415 e o provedor não é chamado; origem de fora é 403; a mesma origem passa', () => {
  const provider = scripted([turn([['show_view', { spec: SUPORTE }]])]);
  return withServer({ provider }, async url => {
    const plain = await fetch(`${url}/api/bases/loja/ask`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(Q) });
    assert.equal(plain.status, 415);
    assert.equal((await plain.json()).code, 'E_GUI_CONTENT_TYPE');
    assert.equal(provider.seen.length, 0);
    const json = { 'content-type': 'application/json; charset=utf-8' };
    const evil = await ask(url, Q, { headers: { ...json, origin: 'http://evil.example' } });
    assert.equal(evil.status, 403);
    assert.equal((await evil.json()).code, 'E_GUI_ORIGIN');
    const site = await ask(url, Q, { headers: { ...json, 'sec-fetch-site': 'cross-site' } });
    assert.equal(site.status, 403);
    assert.equal(provider.seen.length, 0);
    const ok = await ask(url, Q, { headers: { ...json, origin: new URL(url).origin } });
    assert.equal(ok.status, 200);
    await ok.text();
  });
});
