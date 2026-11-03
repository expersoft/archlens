// The `archlens` launchers in bin/: find Node, check its version and run scripts/archlens.mjs unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'scripts', 'archlens.mjs');
const BIN = join(ROOT, 'bin', 'archlens');
const POSIX = { skip: process.platform === 'win32' };
const run = (bin, args, env = {}) => spawnSync(bin, args, { encoding: 'utf8', env: { ...process.env, ...env } });
const tmp = () => mkdtempSync(join(tmpdir(), 'archlens-bin-'));

// A fake `node`: answers the version check with `version`, otherwise prints one argument per line.
function fakeNode(version) {
  const file = join(tmp(), 'node');
  writeFileSync(file, `#!/bin/sh\nif [ "$1" = "-p" ]; then echo ${version}; exit 0; fi\nfor a in "$@"; do printf '%s\\n' "$a"; done\n`);
  chmodSync(file, 0o755);
  return file;
}

test('help pelo lançador é o help da CLI', POSIX, () => {
  const r = run(BIN, ['help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^archlens — /);
});

test('código de saída e stderr iguais ao node direto', POSIX, () => {
  const args = ['query', '/nao/existe', '--view', 'x'];
  const direct = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  const r = run(BIN, args, { ARCHLENS_NODE: process.execPath });
  assert.notEqual(direct.status, 0);
  assert.equal(r.status, direct.status);
  assert.equal(r.stderr, direct.stderr);
});

test('argumentos com aspas e espaços chegam intactos', POSIX, () => {
  const spec = '{"key":"x","anchor":"a b"}';
  const r = run(BIN, ['render', '--spec', spec, 'c d', ''], { ARCHLENS_NODE: fakeNode('22.0.0') });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.split('\n').slice(0, -1), [CLI, 'render', '--spec', spec, 'c d', '']);
});

test('link simbólico (relativo e em cadeia) acha o repositório', POSIX, () => {
  const d = tmp();
  mkdirSync(join(d, 'a'));
  mkdirSync(join(d, 'b'));
  symlinkSync(BIN, join(d, 'a', 'archlens'));
  symlinkSync('../a/archlens', join(d, 'b', 'arch'));
  const r = run(join(d, 'b', 'arch'), ['help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^archlens — /);
});

test('repositório com espaço no caminho', POSIX, () => {
  const repo = join(tmp(), 'meu repo');
  mkdirSync(join(repo, 'bin'), { recursive: true });
  copyFileSync(BIN, join(repo, 'bin', 'archlens'));
  chmodSync(join(repo, 'bin', 'archlens'), 0o755);
  symlinkSync(join(ROOT, 'scripts'), join(repo, 'scripts'));
  const r = run(join(repo, 'bin', 'archlens'), ['help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^archlens — /);
});

test('sem node no PATH: mensagem e 127', POSIX, () => {
  const r = run(BIN, ['help'], { PATH: '/nao-existe', ARCHLENS_NODE: '' });
  assert.equal(r.status, 127);
  assert.equal(r.stderr, 'archlens: Node.js não encontrado. Instale o Node 18 ou mais novo (https://nodejs.org) ou aponte ARCHLENS_NODE para o executável.\n');
});

test('ARCHLENS_NODE inválido: mensagem e 127', POSIX, () => {
  const r = run(BIN, ['help'], { ARCHLENS_NODE: '/nao/existe/node' });
  assert.equal(r.status, 127);
  assert.equal(r.stderr, 'archlens: ARCHLENS_NODE não aponta para um executável: /nao/existe/node\n');
});

test('Node antigo: mensagem com versão e caminho, 1', POSIX, () => {
  const fake = fakeNode('16.20.2');
  const r = run(BIN, ['help'], { ARCHLENS_NODE: fake });
  assert.equal(r.status, 1);
  assert.equal(r.stderr, `archlens: o archlens precisa do Node 18 ou mais novo (encontrado: 16.20.2, em ${fake}).\n`);
});

test('bin/archlens é versionado executável e com LF', () => {
  const mode = spawnSync('git', ['ls-files', '-s', 'bin/archlens'], { cwd: ROOT, encoding: 'utf8' }).stdout.split(' ')[0];
  assert.equal(mode, '100755');
  assert.ok(!readFileSync(BIN, 'utf8').includes('\r'));
});
