import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv, loadEnv, envFileWarning } from './envfile.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'archlens-env-'));

test('parseEnv: export, aspas, comentários e linhas vazias', () => {
  const text = ['# c', '', 'export A=1', 'B="x\\ny"', "C='$lit'", 'D=v # nota', 'E="a \\"q\\" \\\\"  # fim', 'F=a#b'].join('\n');
  assert.deepEqual(parseEnv(text), { A: '1', B: 'x\ny', C: '$lit', D: 'v', E: 'a "q" \\', F: 'a#b' });
});

test('parseEnv: linha inválida cita o número e não o conteúdo', () => {
  assert.throws(() => parseEnv('A=1\nsem-igual'), e => e.code === 'E_GUI_CONFIG' && /linha 2/.test(e.message) && !e.message.includes('sem-igual'));
  assert.throws(() => parseEnv('K="aberta segredo'), e => e.code === 'E_GUI_CONFIG' && !e.message.includes('segredo'));
});

test('loadEnv: .env da pasta, envFile inexistente, ambiente vence, process.env intacto', () => {
  const d = tmp();
  writeFileSync(join(d, '.env'), 'ARCHLENS_T_A=arquivo\nARCHLENS_T_B=so-arquivo\n');
  process.env.ARCHLENS_T_A = 'ambiente';
  try {
    const { env, file } = loadEnv({ dir: d });
    assert.equal(file, join(d, '.env'));
    assert.equal(env.ARCHLENS_T_A, 'ambiente');
    assert.equal(env.ARCHLENS_T_B, 'so-arquivo');
    assert.equal(process.env.ARCHLENS_T_B, undefined);
    assert.throws(() => loadEnv({ envFile: join(d, 'nao.env'), dir: d }), e => e.code === 'E_GUI_CONFIG');
    assert.equal(loadEnv({ dir: tmp() }).file, null);
  } finally { delete process.env.ARCHLENS_T_A; }
});

test('envFileWarning: avisa sem .gitignore, null com ele e fora de repositório', () => {
  const d = tmp();
  assert.equal(envFileWarning(join(d, '.env')), null);
  spawnSync('git', ['init', '-q'], { cwd: d });
  writeFileSync(join(d, '.env'), 'A=1\n');
  assert.match(envFileWarning(join(d, '.env')), /não está no \.gitignore; a chave pode ir para o repositório/);
  writeFileSync(join(d, '.gitignore'), '.env\n');
  assert.equal(envFileWarning(join(d, '.env')), null);
});
