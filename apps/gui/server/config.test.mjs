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
  bad({ provider: 'anthropic', maxHistory: -1 });
  bad({ provider: 'anthropic', maxHistory: 51 });
  bad({ provider: 'anthropic', maxHistory: 2.5 });
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
  const f = write({ llm: { provider: 'openai', model: 'm', auth: { header: 'api-key' }, maxRounds: 3, maxHistory: 10, timeoutMs: 30000, headersEnv: { X: 'V' }, query: { v: '1' } } });
  const c = loadConfig({ file: f });
  assert.equal(c.llm.provider, 'openai');
  assert.deepEqual(c.llm.auth, { header: 'api-key' });
  assert.equal(c.llm.maxHistory, 10);
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

const PLAN_DEFAULTS = { maxRounds: 40, timeoutMs: 600000, maxTokens: 400000, gitUser: 'x-access-token', cloneTimeoutMs: 120000, cloneMaxMb: 200, allowFileUrls: false };
const LLM = { provider: 'anthropic' };

test('config: "plan": true vira os padrões', () => {
  const c = loadConfig({ file: write({ llm: LLM, plan: true }) });
  assert.deepEqual(c.plan, PLAN_DEFAULTS);
  assert.equal(c.planSource, 'file');
  assert.equal(loadConfig({ file: write({ llm: LLM }) }).plan, undefined);
  assert.equal(loadConfig({ file: write({ llm: LLM, plan: false }) }).plan, undefined);
  assert.deepEqual(loadConfig({ file: write({ llm: LLM, plan: { maxRounds: 5, gitTokenEnv: 'GT', gitTokenHosts: ['github.com'] } }) }).plan, { ...PLAN_DEFAULTS, maxRounds: 5, gitTokenEnv: 'GT', gitTokenHosts: ['github.com'] });
});

test('config: plan com valores fora da faixa', () => {
  for (const plan of [{ maxRounds: 0 }, { maxRounds: 101 }, { timeoutMs: 9999 }, { timeoutMs: 1800001 }, { gitTokenEnv: 5 }, { gitUser: '' }, 'sim']) {
    assert.throws(() => loadConfig({ file: write({ llm: LLM, plan }) }), e => e.code === 'E_GUI_CONFIG', JSON.stringify(plan));
  }
});

test('config: plan.gitTokenHosts é obrigatório com plan.gitTokenEnv e lista hosts', () => {
  assert.throws(() => loadConfig({ file: write({ llm: LLM, plan: { gitTokenEnv: 'GT' } }) }),
    e => e.code === 'E_GUI_CONFIG' && e.message.includes('plan.gitTokenHosts é obrigatório com plan.gitTokenEnv'));
  for (const gitTokenHosts of [[], 'github.com', ['https://github.com'], ['GitHub.com'], ['a/b'], [''], [5]]) {
    assert.throws(() => loadConfig({ file: write({ llm: LLM, plan: { gitTokenEnv: 'GT', gitTokenHosts } }) }), e => e.code === 'E_GUI_CONFIG', JSON.stringify(gitTokenHosts));
  }
  assert.deepEqual(loadConfig({ file: write({ llm: LLM, plan: { gitTokenEnv: 'GT', gitTokenHosts: ['github.com', 'gitlab.empresa.com.br'] } }) }).plan.gitTokenHosts,
    ['github.com', 'gitlab.empresa.com.br']);
});

test('config: plan.allowFileUrls é booleano, falso por padrão', () => {
  assert.equal(loadConfig({ file: write({ llm: LLM, plan: { allowFileUrls: true } }) }).plan.allowFileUrls, true);
  assert.throws(() => loadConfig({ file: write({ llm: LLM, plan: { allowFileUrls: 'sim' } }) }), e => e.code === 'E_GUI_CONFIG');
});

test('config: plan sem llm', () => {
  assert.throws(() => loadConfig({ file: write({ plan: true }) }), e => e.code === 'E_GUI_CONFIG' && /plan exige llm/.test(e.message));
  assert.throws(() => loadConfig({ base: 'x', plan: true }), e => e.code === 'E_GUI_CONFIG' && /plan exige llm/.test(e.message));
});

test('config: --plan na linha de comando', () => {
  const c = loadConfig({ base: 'x', llm: LLM, plan: true });
  assert.equal(c.planSource, 'cli');
  assert.deepEqual(c.plan, PLAN_DEFAULTS);
  assert.equal(loadConfig({ file: write({ llm: LLM }), plan: true }).planSource, 'cli');
});

test('config: --plan com arquivo usa o objeto plan do arquivo', () => {
  const c = loadConfig({ file: write({ llm: LLM, plan: { maxRounds: 5, gitTokenEnv: 'GT', gitTokenHosts: ['github.com'] } }), plan: true });
  assert.equal(c.planSource, 'cli');
  assert.deepEqual(c.plan, { ...PLAN_DEFAULTS, maxRounds: 5, gitTokenEnv: 'GT', gitTokenHosts: ['github.com'] });
  assert.deepEqual(loadConfig({ file: write({ llm: LLM, plan: false }), plan: true }).plan, PLAN_DEFAULTS);
});

import { mkdirSync } from 'node:fs';
const brandDir = join(dir, 'b'); mkdirSync(brandDir, { recursive: true });
const brandFile = (cfg) => { const f = join(brandDir, 'gui.json'); writeFileSync(f, JSON.stringify({ bases: [{ id: 'a', path: 'x' }], ...cfg })); return f; };
const badBrand = (brand, re) => assert.throws(() => loadConfig({ file: brandFile({ brand }) }), e => e.code === 'E_GUI_CONFIG' && re.test(e.message));

test('brand válido devolve caminhos absolutos', () => {
  writeFileSync(join(brandDir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(brandDir, 'dark.png'), 'x');
  const c = loadConfig({ file: brandFile({ brand: { name: 'Acme', logo: 'logo.svg', logoDark: 'dark.png' } }) });
  assert.deepEqual(c.brand, { name: 'Acme', logo: join(brandDir, 'logo.svg'), logoDark: join(brandDir, 'dark.png') });
  assert.equal(loadConfig({ file: brandFile({}) }).brand, undefined);
});

test('brand.logo fora da pasta do arquivo é recusado', () => {
  writeFileSync(join(dir, 'fora.svg'), '<svg/>');
  badBrand({ logo: '../fora.svg' }, /brand\.logo precisa ficar dentro da pasta do archlens-gui\.json/);
  badBrand({ logo: 'logo.svg', logoDark: '../fora.svg' }, /brand\.logoDark precisa ficar dentro/);
});

test('brand.logo de 5 MB é recusado', () => {
  writeFileSync(join(brandDir, 'grande.png'), Buffer.alloc(5 * 1024 * 1024));
  badBrand({ logo: 'grande.png' }, /brand\.logo passa de 1 MB/);
});

test('brand.logo com extensão .gif, ausente ou inexistente é recusado', () => {
  writeFileSync(join(brandDir, 'a.gif'), 'x');
  badBrand({ logo: 'a.gif' }, /brand\.logo: use \.svg, \.png ou \.webp/);
  badBrand({}, /brand\.logo é obrigatório/);
  badBrand({ logo: 'nao-existe.svg' }, /brand\.logo: arquivo não encontrado: /);
  badBrand('x', /brand deve ser um objeto/);
});
