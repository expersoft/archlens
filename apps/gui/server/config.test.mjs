import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';

const dir = mkdtempSync(join(tmpdir(), 'archlens-cfg-'));
const write = extra => { const f = join(dir, 'gui.json'); writeFileSync(f, JSON.stringify({ bases: [{ id: 'a', path: 'x' }], ...extra })); return f; };
const bad = llm => assert.throws(() => loadConfig({ file: write({ llm }) }), e => e.code === 'E_GUI_CONFIG');

test('llm inválido dá E_GUI_CONFIG', () => {
  bad({ provider: 'x' });
  bad({ provider: 'anthropic', maxRounds: 0 });
  bad({ provider: 'anthropic', maxRounds: 11 });
  bad({ provider: 'anthropic', timeoutMs: 999 });
  bad({ provider: 'openai' });
  bad({ provider: 'anthropic', auth: 'basic' });
  bad({ provider: 'anthropic', auth: { header: 7 } });
  bad({ provider: 'anthropic', headersEnv: { X: 1 } });
  bad({ provider: 'anthropic', headers: 'x' });
  bad({ provider: 'anthropic', query: { a: 1 } });
  bad({ provider: 'anthropic', tools: 'false' });
  bad({ provider: 'anthropic', effort: 5 });
  bad({ provider: 'anthropic', effort: '' });
  bad('anthropic');
});

test('llm válido, formas de auth e padrões', () => {
  const f = write({ llm: { provider: 'openai', model: 'm', auth: { header: 'api-key' }, maxRounds: 3, timeoutMs: 30000, headersEnv: { X: 'V' }, query: { v: '1' } } });
  const c = loadConfig({ file: f });
  assert.equal(c.llm.provider, 'openai');
  assert.deepEqual(c.llm.auth, { header: 'api-key' });
  assert.equal(c.telemetry, undefined);
});

test('llm dos argumentos vence o do arquivo; envFile relativo resolve pela pasta do arquivo', () => {
  const f = write({ llm: { provider: 'anthropic', model: 'do-arquivo' }, envFile: 'chave.env' });
  writeFileSync(join(dir, 'chave.env'), 'ANTHROPIC_API_KEY=k\n');
  const c = loadConfig({ file: f, llm: { provider: 'anthropic', model: 'do-arg' } });
  assert.equal(c.llm.model, 'do-arg');
  assert.equal(c.llmSource, 'cli');
  assert.equal(loadConfig({ file: f }).llmSource, 'file');
  assert.equal(loadConfig({ base: 'x', llm: { provider: 'anthropic' } }).llmSource, 'cli');
  assert.equal(c.envFile, join(dir, 'chave.env'));
  assert.equal(c.env.ANTHROPIC_API_KEY, 'k');
  assert.throws(() => loadConfig({ file: write({ llm: { provider: 'anthropic' }, envFile: 'nao.env' }) }), e => e.code === 'E_GUI_CONFIG');
});

test('telemetry: file relativo ao arquivo de configuração e tipos', () => {
  const c = loadConfig({ file: write({ telemetry: { file: 'logs/t.ndjson', questions: true } }) });
  assert.deepEqual(c.telemetry, { file: join(dir, 'logs', 't.ndjson'), questions: true });
  assert.throws(() => loadConfig({ file: write({ telemetry: { questions: 'sim' } }) }), e => e.code === 'E_GUI_CONFIG');
});

test('base única com llm carrega o ambiente só quando há llm', () => {
  const c = loadConfig({ base: '/a/b', llm: { provider: 'anthropic' } });
  assert.equal(c.llm.provider, 'anthropic');
  assert.equal(typeof c.env, 'object');
  assert.equal(loadConfig({ base: '/a/b' }).env, undefined);
});
