import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createProvider } from './ask/providers.mjs';
import { scripted } from './ask/scripted.mjs';

// Fake HTTP server: records requests, answers with `reply(req, index)`.
async function serve(reply) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const r = await reply(seen.at(-1), seen.length - 1);
      if (r === 'hang') return;
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json' });
      res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
    });
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { seen, url, close: () => { server.closeAllConnections?.(); server.close(); } };
}

const TOOLS = [
  { name: 'b_tool', description: 'B', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'a_tool', description: 'A', input_schema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
];
const aMsg = (content, extra = {}) => ({ status: 200, body: { id: 'm', type: 'message', role: 'assistant', model: 'm', content, stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 2 }, ...extra } });
const oMsg = message => ({ status: 200, body: { choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 1 } } } });
const anth = (url, extra = {}, env = { ANTHROPIC_API_KEY: 'sk-test-123' }) => createProvider({ provider: 'anthropic', endpoint: url, ...extra }, { env });
const oai = (url, extra = {}, env = { OPENAI_API_KEY: 'sk-test-123' }) => createProvider({ provider: 'openai', model: 'gpt-x', endpoint: `${url}/v1`, ...extra }, { env });
const ask = (p, input = { text: 'oi' }) => p.open({ system: ['s1', 's2'], tools: TOOLS }).send(input, {});

test('anthropic: system blocks cached, tools in order, auto tool choice', async () => {
  const s = await serve(() => aMsg([{ type: 'tool_use', id: 'tu1', name: 'a_tool', input: { x: 'k' } }], { stop_reason: 'tool_use' }));
  try {
    const r = await ask(anth(s.url));
    const b = s.seen[0].body;
    assert.equal(s.seen[0].url, '/v1/messages');
    assert.equal(b.model, 'claude-haiku-5-5');
    assert.deepEqual(b.system, [
      { type: 'text', text: 's1', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 's2', cache_control: { type: 'ephemeral' } }]);
    assert.deepEqual(b.tools.map(t => t.name), ['b_tool', 'a_tool']);
    assert.deepEqual(b.tool_choice, { type: 'auto' });
    assert.equal(b.output_config.effort, 'low');
    assert.deepEqual(r.calls, [{ id: 'tu1', name: 'a_tool', input: { x: 'k' } }]);
    assert.deepEqual(r.usage, { input: 5, output: 3, cacheRead: 2 });
    assert.equal(typeof r.ms, 'number');
  } finally { s.close(); }
});

test('anthropic: assistant content replayed verbatim', async () => {
  const content = [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }, { type: 'tool_use', id: 'tu1', name: 'a_tool', input: { x: 'k' } }];
  const s = await serve((_, i) => i === 0 ? aMsg(content, { stop_reason: 'tool_use' }) : aMsg([{ type: 'text', text: 'ok' }]));
  try {
    const conv = anth(s.url).open({ system: ['s'], tools: TOOLS });
    await conv.send({ text: 'oi' }, {});
    const r = await conv.send({ results: [{ id: 'tu1', content: 'res', isError: true }] }, {});
    assert.equal(r.text, 'ok');
    const m = s.seen[1].body.messages;
    assert.deepEqual(m[1], { role: 'assistant', content });
    assert.deepEqual(m[2].content, [{ type: 'tool_result', tool_use_id: 'tu1', content: 'res', is_error: true }]);
  } finally { s.close(); }
});

test('anthropic: refusal is an error', async () => {
  const s = await serve(() => aMsg([], { stop_reason: 'refusal' }));
  try { await assert.rejects(ask(anth(s.url)), e => e.code === 'E_LLM_REFUSAL'); } finally { s.close(); }
});

test('openai-compatible: tool calls round trip', async () => {
  const s = await serve((_, i) => i === 0
    ? oMsg({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'a_tool', arguments: '{"x":"k"}' } }] })
    : oMsg({ role: 'assistant', content: 'pronto' }));
  try {
    const conv = oai(s.url, { headers: { 'X-Extra': 'e1' } }).open({ system: ['s1', 's2'], tools: TOOLS });
    const r = await conv.send({ text: 'oi' }, {});
    const h = s.seen[0].headers, b = s.seen[0].body;
    assert.equal(s.seen[0].url, '/v1/chat/completions');
    assert.equal(h.authorization, 'Bearer sk-test-123');
    assert.equal(h['x-extra'], 'e1');
    assert.equal(b.tool_choice, 'auto');
    assert.deepEqual(b.tools[0], { type: 'function', function: { name: 'b_tool', description: 'B', parameters: TOOLS[0].input_schema } });
    assert.deepEqual(r.calls, [{ id: 'c1', name: 'a_tool', input: { x: 'k' } }]);
    assert.deepEqual(r.usage, { input: 7, output: 4, cacheRead: 1 });
    const r2 = await conv.send({ results: [{ id: 'c1', content: 'res' }] }, {});
    assert.equal(r2.text, 'pronto');
    assert.deepEqual(s.seen[1].body.messages.at(-1), { role: 'tool', tool_call_id: 'c1', content: 'res' });
  } finally { s.close(); }
});

test('openai-compatible: no tools in JSON mode', async () => {
  const s = await serve(() => oMsg({ role: 'assistant', content: '{}' }));
  try {
    await oai(s.url, { tools: false }).open({ system: ['s'], tools: null }).send({ text: 'oi' }, {});
    assert.equal('tools' in s.seen[0].body, false);
    assert.equal('tool_choice' in s.seen[0].body, false);
  } finally { s.close(); }
});

for (const [name, make, ok] of [
  ['anthropic', anth, () => aMsg([{ type: 'text', text: 'x' }])],
  ['openai', oai, () => oMsg({ role: 'assistant', content: 'x' })]]) {
  test(`erro HTTP sem a chave (${name})`, async () => {
    const s = await serve(() => ({ status: 401, body: '{"error":"bad key sk-test-123 tok-9"}' }));
    try {
      const p = make(s.url, { headersEnv: { 'X-Tenant': 'TENANT' } }, { ANTHROPIC_API_KEY: 'sk-test-123', OPENAI_API_KEY: 'sk-test-123', TENANT: 'tok-9' });
      await assert.rejects(ask(p), e => {
        assert.equal(e.code, 'E_LLM_HTTP');
        assert.match(e.message, /401/);
        assert.doesNotMatch(e.message, /sk-test-123|tok-9/);
        return true;
      });
    } finally { s.close(); }
  });

  test(`auth forms (${name})`, async () => {
    const s = await serve(ok);
    try {
      const env = { ANTHROPIC_API_KEY: 'k1', OPENAI_API_KEY: 'k1' };
      await ask(make(s.url, { auth: 'bearer' }, env));
      await ask(make(s.url, { auth: { header: 'api-key' } }, env));
      await ask(make(s.url, { auth: 'none' }, {}));
      const [a, b, c] = s.seen.map(r => r.headers);
      assert.equal(a.authorization, 'Bearer k1'); assert.equal(a['x-api-key'], undefined);
      assert.equal(b['api-key'], 'k1'); assert.equal(b.authorization, undefined); assert.equal(b['x-api-key'], undefined);
      assert.equal(c.authorization, undefined); assert.equal(c['x-api-key'], undefined); assert.equal(c['api-key'], undefined);
    } finally { s.close(); }
  });

  test(`headersEnv and query (${name})`, async () => {
    const s = await serve(ok);
    try {
      const p = make(s.url, { headersEnv: { 'X-Tenant': 'TENANT' }, query: { 'api-version': '2026-06-01' } },
        { ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', TENANT: 't1' });
      await ask(p);
      assert.equal(s.seen[0].headers['x-tenant'], 't1');
      assert.ok(s.seen[0].url.endsWith('?api-version=2026-06-01'), s.seen[0].url);
    } finally { s.close(); }
  });

  test(`abort stops the request (${name})`, async () => {
    const s = await serve(() => 'hang');
    try {
      const ctl = new AbortController();
      const p = make(s.url).open({ system: ['s'], tools: TOOLS }).send({ text: 'oi' }, { signal: ctl.signal });
      setTimeout(() => ctl.abort(), 50);
      await assert.rejects(p, e => e.code === 'E_LLM_ABORT');
    } finally { s.close(); }
  });

  test(`missing key is a config error (${name})`, () => {
    assert.throws(() => make('http://x', {}, {}), e => e.code === 'E_GUI_CONFIG' && /(ANTHROPIC|OPENAI)_API_KEY/.test(e.message));
    assert.throws(() => make('http://x', { headersEnv: { H: 'NOPE' } }, { ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k' }),
      e => e.code === 'E_GUI_CONFIG' && /NOPE/.test(e.message));
  });
}

test('openai: model is required', () => {
  assert.throws(() => createProvider({ provider: 'openai' }, { env: { OPENAI_API_KEY: 'k' } }), e => e.code === 'E_GUI_CONFIG');
});

test('scripted: replies in order, records input, errors past the end', async () => {
  const reply = text => ({ text, calls: [], ms: 0, usage: { input: 0, output: 0, cacheRead: 0 } });
  const p = scripted([reply('a'), input => reply(input.text), new Error('boom')]);
  const c = p.open({ system: ['s'], tools: TOOLS });
  assert.equal((await c.send({ text: '1' }, {})).text, 'a');
  assert.equal((await c.send({ text: '2' }, {})).text, '2');
  await assert.rejects(c.send({ text: '3' }, {}), /boom/);
  await assert.rejects(c.send({ text: '4' }, {}), /scripted: sem resposta/);
  assert.equal(p.seen.length, 4);
  assert.deepEqual(p.seen[0], { system: ['s'], tools: TOOLS, input: { text: '1' } });
});

test('anthropic: SDK ignores ambient credentials and custom headers', async () => {
  const saved = { t: process.env.ANTHROPIC_AUTH_TOKEN, h: process.env.ANTHROPIC_CUSTOM_HEADERS };
  process.env.ANTHROPIC_AUTH_TOKEN = 'ambient-tok';
  process.env.ANTHROPIC_CUSTOM_HEADERS = 'X-Ambient: leak';
  const s = await serve(() => aMsg([{ type: 'text', text: 'x' }]));
  try {
    const env = { ANTHROPIC_API_KEY: 'k1' };
    await ask(anth(s.url, {}, env));
    await ask(anth(s.url, { auth: { header: 'api-key' } }, env));
    await ask(anth(s.url, { auth: 'none' }, {}));
    await ask(anth(s.url, { auth: 'bearer' }, env));
    const [x, h, n, b] = s.seen.map(r => r.headers);
    assert.equal(x['x-api-key'], 'k1');
    assert.equal(h['api-key'], 'k1');
    for (const hd of [x, h, n, b]) assert.equal(hd['x-ambient'], undefined);
    for (const hd of [x, h, n]) assert.equal(hd.authorization, undefined);
    for (const hd of [h, n, b]) assert.equal(hd['x-api-key'], undefined);
    assert.equal(b.authorization, 'Bearer k1');
  } finally {
    for (const [k, v] of [['ANTHROPIC_AUTH_TOKEN', saved.t], ['ANTHROPIC_CUSTOM_HEADERS', saved.h]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    s.close();
  }
});

for (const [name, make] of [['anthropic', anth], ['openai', oai]]) {
  test(`redaction covers the 300-char cut and JSON escapes (${name})`, async () => {
    const key = 'sk-' + 'a"b\\c'.repeat(4);
    const pad = 'x'.repeat(295);
    const s = await serve(() => ({ status: 500, body: JSON.stringify({ error: pad + key }) }));
    try {
      const p = make(s.url, {}, { ANTHROPIC_API_KEY: key, OPENAI_API_KEY: key });
      await assert.rejects(ask(p), e => {
        assert.doesNotMatch(e.message, /sk-|a"b|a\\"b/);
        assert.ok(e.message.length < 400);
        return true;
      });
    } finally { s.close(); }
  });
}

test('openai: stalled body is a timeout or abort error', async () => {
  const server = http.createServer((req, res) => { req.resume(); res.writeHead(200); res.write('{'); });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const p = oai(url, { timeoutMs: 150 });
    await assert.rejects(ask(p), e => e.code === 'E_LLM_HTTP' && /a tempo/.test(e.message));
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 50);
    await assert.rejects(oai(url).open({ system: ['s'], tools: null }).send({ text: 'x' }, { signal: ctl.signal }), e => e.code === 'E_LLM_ABORT');
  } finally { server.closeAllConnections(); server.close(); }
});
