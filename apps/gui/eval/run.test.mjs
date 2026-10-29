import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalProvider } from './run.mjs';

const dir = mkdtempSync(join(tmpdir(), 'archlens-eval-'));
const file = join(dir, 'gui.json');
writeFileSync(file, JSON.stringify({ bases: [{ id: 'a', path: 'x' }], llm: { provider: 'openai', model: 'gw-model', apiKeyEnv: 'GW_KEY' } }));
writeFileSync(join(dir, '.env'), 'GW_KEY=sk-do-env\n');

test('--config reuses llm and the .env of the GUI; flags override', () => {
  const p = evalProvider({ config: file, mode: 'tools' }, { env: {} });
  assert.deepEqual([p.name, p.model, p.tools], ['openai', 'gw-model', true]);
  const q = evalProvider({ config: file, mode: 'json', model: 'outro' }, { env: {} });
  assert.deepEqual([q.model, q.tools], ['outro', false]);
});

test('without --config the key comes only from the process env', () => {
  assert.throws(() => evalProvider({ mode: 'tools' }, { env: {} }), e => e.code === 'E_GUI_CONFIG');
  assert.equal(evalProvider({ mode: 'tools' }, { env: { ANTHROPIC_API_KEY: 'k' } }).name, 'anthropic');
});
