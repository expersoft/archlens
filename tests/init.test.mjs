import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStore, initBase } from '../scripts/lib/store/config.mjs';
import { storeKind } from '../scripts/lib/store/folder.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'archlens-init-'));
const manifest = dir => JSON.parse(readFileSync(join(dir, 'archlens.json'), 'utf8'));
const git = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
/** A clone (of a local bare repo) with remote "origin" and branch "main". */
function cloneFixture() {
  const root = tmp();
  git(root, 'init', '--bare', '-b', 'main', 'remote.git');
  git(root, 'clone', 'remote.git', 'clone');
  const clone = join(root, 'clone');
  writeFileSync(join(clone, 'a.txt'), 'x');
  git(clone, 'add', '.');
  git(clone, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'init');
  git(clone, 'push', 'origin', 'HEAD:main');
  return { root, clone };
}
const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code, code);

test('init json e markdown gravam o archlens.json mínimo', () => {
  const root = tmp();
  initBase(join(root, 'a'), { name: 'Loja', store: { kind: 'json' } });
  assert.deepEqual(manifest(join(root, 'a')), { archlens: '2.0', name: 'Loja', store: { kind: 'json' } });
  initBase(join(root, 'b'), { name: 'Loja', store: { kind: 'markdown' } });
  assert.deepEqual(manifest(join(root, 'b')), { archlens: '2.0', name: 'Loja', store: { kind: 'markdown' } });
});

test('init grava .gitignore com .archlens/ sem sobrescrever o existente', () => {
  const root = tmp();
  initBase(join(root, 'a'), { name: 'X', store: { kind: 'json' } });
  assert.equal(readFileSync(join(root, 'a', '.gitignore'), 'utf8'), '.archlens/\n');
  mkdirSync(join(root, 'b'));
  writeFileSync(join(root, 'b', '.gitignore'), 'node_modules');
  initBase(join(root, 'b'), { name: 'X', store: { kind: 'json' } });
  assert.equal(readFileSync(join(root, 'b', '.gitignore'), 'utf8'), 'node_modules\n.archlens/\n');
  mkdirSync(join(root, 'c'));
  writeFileSync(join(root, 'c', '.gitignore'), '.archlens/\n');
  initBase(join(root, 'c'), { name: 'X', store: { kind: 'json' } });
  assert.equal(readFileSync(join(root, 'c', '.gitignore'), 'utf8'), '.archlens/\n');
});

test('gbrain git grava os padrões; gbrain mcp exige server', () => {
  const { clone } = cloneFixture();
  const root = tmp();
  initBase(join(root, 'g'), { name: 'Corp', store: { kind: 'gbrain', mode: 'git', repo: clone } });
  assert.deepEqual(manifest(join(root, 'g')).store, { kind: 'gbrain', mode: 'git', repo: clone, remote: 'origin', branch: 'main', prefix: 'archlens' });
  initBase(join(root, 'm'), { name: 'Corp', store: { kind: 'gbrain', mode: 'mcp', server: 'gbrain-corp', sourceId: 'arq' } });
  assert.deepEqual(manifest(join(root, 'm')).store, { kind: 'gbrain', mode: 'mcp', server: 'gbrain-corp', sourceId: 'arq', prefix: 'archlens' });
  throwsCode(() => validateStore({ kind: 'gbrain', mode: 'mcp' }), 'E_STORE_CONFIG');
  throwsCode(() => validateStore({ kind: 'gbrain', mode: 'git' }), 'E_STORE_CONFIG');
  throwsCode(() => validateStore({ kind: 'gbrain' }), 'E_STORE_CONFIG');
});

test('validateStore recusa campos estranhos e credenciais', () => {
  throwsCode(() => validateStore({ kind: 'gbrain', mode: 'mcp', server: 's', colour: 1 }), 'E_STORE_CONFIG');
  throwsCode(() => validateStore({ kind: 'json', repo: 'x' }), 'E_STORE_CONFIG');
  throwsCode(() => validateStore({ kind: 'neo4j' }), 'E_STORE_CONFIG');
  for (const key of ['credentials', 'token', 'password', 'apiToken'])
    throwsCode(() => validateStore({ kind: 'gbrain', mode: 'mcp', server: 's', [key]: 'x' }), 'E_STORE_CONFIG');
  throwsCode(() => validateStore({ kind: 'gbrain', mode: 'mcp', server: 's', extra: { password: 'x' } }), 'E_STORE_CONFIG');
});

test('storeKind aceita gbrain', () => {
  assert.equal(storeKind({ store: { kind: 'gbrain', mode: 'mcp', server: 's' } }), 'gbrain');
});

test('init recusa pasta que já tem base', () => {
  const root = tmp();
  initBase(join(root, 'a'), { name: 'X', store: { kind: 'json' } });
  throwsCode(() => initBase(join(root, 'a'), { name: 'Y', store: { kind: 'markdown' } }), 'E_STORE_EXISTS');
  assert.equal(manifest(join(root, 'a')).name, 'X');
});

test('repo que não é clone git, ou sem o remote, dá E_STORE_GIT', () => {
  const root = tmp();
  mkdirSync(join(root, 'plain'));
  const store = repo => ({ kind: 'gbrain', mode: 'git', repo });
  throwsCode(() => initBase(join(root, 'a'), { name: 'X', store: store(join(root, 'plain')) }), 'E_STORE_GIT');
  throwsCode(() => initBase(join(root, 'a'), { name: 'X', store: store(join(root, 'nao-existe')) }), 'E_STORE_GIT');
  const { clone } = cloneFixture();
  throwsCode(() => initBase(join(root, 'a'), { name: 'X', store: { ...store(clone), remote: 'outro' } }), 'E_STORE_GIT');
  assert.equal(existsSync(join(root, 'a', 'archlens.json')), false);
});

test('branch ausente no remote vira aviso, não erro', () => {
  const { clone } = cloneFixture();
  const warnings = [];
  initBase(join(tmp(), 'a'), { name: 'X', store: { kind: 'gbrain', mode: 'git', repo: clone, branch: 'nada' }, warn: w => warnings.push(w) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /nada/);
});

test('CLI: init json, gbrain git e erros', () => {
  const root = tmp();
  let r = run(['init', 'architecture', '--store', 'json', '--name', 'Loja'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(manifest(join(root, 'architecture')), { archlens: '2.0', name: 'Loja', store: { kind: 'json' } });
  r = run(['init', 'architecture', '--store', 'markdown'], root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_EXISTS/);

  const { root: gr, clone } = cloneFixture();
  r = run(['init', join(gr, 'base'), '--store', 'gbrain', '--mode', 'git', '--repo', clone], root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(manifest(join(gr, 'base')).store.branch, 'main');
  assert.equal(manifest(join(gr, 'base')).name, basename(gr)); // default name: the parent folder's

  r = run(['init', join(root, 'm'), '--store', 'gbrain', '--mode', 'mcp'], root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_CONFIG/);
  r = run(['init', join(root, 'x'), '--store', 'gbrain', '--mode', 'mcp', '--server', 's'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(manifest(join(root, 'x')).store.server, 's');
  r = run(['init', join(root, 'y')], root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /uso: archlens init/);
});

test('validateStore só aceita os conectores e modos conhecidos, nunca nomes herdados de Object', () => {
  for (const kind of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) throwsCode(() => validateStore({ kind }), 'E_STORE_CONFIG');
  for (const mode of ['constructor', 'toString', '__proto__']) throwsCode(() => validateStore({ kind: 'gbrain', mode, server: 's', repo: 'r' }), 'E_STORE_CONFIG');
  const root = tmp();
  const r = run(['init', join(root, 'a'), '--store', 'constructor'], root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_CONFIG/);
  assert.equal(existsSync(join(root, 'a', 'archlens.json')), false);
});

test('store.prefix: cada segmento é um slug do gbrain', () => {
  const mcp = prefix => validateStore({ kind: 'gbrain', mode: 'mcp', server: 's', prefix });
  assert.equal(mcp('equipe/arquitetura').prefix, 'equipe/arquitetura');
  assert.equal(mcp('arq_2.0-x').prefix, 'arq_2.0-x');
  for (const p of ['Arquitetura', 'minha base', 'ação', '../fora', 'a/./b', 'a//b', 'a/b c'])
    throwsCode(() => mcp(p), 'E_STORE_CONFIG');
  const root = tmp();
  const r = run(['init', join(root, 'm'), '--store', 'gbrain', '--mode', 'mcp', '--server', 's', '--prefix', 'Minha Base'], root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_CONFIG[^]*prefix/);
  assert.equal(existsSync(join(root, 'm', 'archlens.json')), false);
});
