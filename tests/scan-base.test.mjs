import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeRepoUrl, repoName, repoInfo, cloneShallow, isGitUrl } from '../scripts/lib/scan/git.mjs';
import { readYaml } from '../scripts/lib/scan/yaml.mjs';
import { infraOf, hostOf } from '../scripts/lib/scan/infra.mjs';
import { scanDir, scanSource } from '../scripts/lib/scan/index.mjs';
import { sourceKey } from '../scripts/lib/sources.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/repos/${name}/`, import.meta.url));
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'init.defaultBranch=main', ...a], { cwd, encoding: 'utf8' });
const gitRepo = name => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-repo-'));
  cpSync(fixture(name), dir, { recursive: true });
  git(dir, 'init', '-q'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
  return dir;
};

test('repo urls lose credentials and .git; names come from the last segment', () => {
  assert.equal(normalizeRepoUrl('https://user:tok@github.com/org/terminus-assignment-api.git'), 'https://github.com/org/terminus-assignment-api');
  assert.equal(normalizeRepoUrl('git@github.com:org/repo.git'), 'git@github.com:org/repo');
  assert.equal(repoName('https://github.com/org/terminus-assignment-api.git'), 'terminus-assignment-api');
  assert.equal(repoName('/home/u/repos/pedidos/'), 'pedidos');
  assert.ok(isGitUrl('https://x/y.git') && isGitUrl('git@x:y.git') && isGitUrl('file:///tmp/r') && !isGitUrl('/tmp/r'));
});

test('readYaml reads every document with line numbers', () => {
  const docs = readYaml('a: 1\n---\nkind: Service\nmetadata:\n  name: x\n');
  assert.equal(docs.length, 2);
  assert.equal(docs[1].data.metadata.name, 'x');
  assert.equal(docs[1].lineOf('metadata', 'name'), 5);
  assert.throws(() => readYaml('a: [b'));
});

test('infra images and hosts', () => {
  assert.deepEqual(infraOf('postgres:16-alpine'), { engine: 'postgres', category: 'database', version: '16' });
  assert.equal(infraOf('confluentinc/cp-kafka:7.6.0').engine, 'kafka');
  assert.equal(infraOf('ghcr.io/org/pedidos:1.2'), null);
  assert.equal(hostOf('postgres://app:segredo@pedidos-db:5432/pedidos'), 'pedidos-db');
  assert.equal(hostOf('http://pagamentos:8080/v1'), 'pagamentos');
  assert.equal(hostOf('redis:6379'), 'redis');
  assert.equal(hostOf('http://localhost:8080'), null);
  assert.equal(hostOf('info'), null);
});

test('scanDir: compose facts with file and line, node_modules ignored, commit recorded', () => {
  const dir = gitRepo('pedidos');
  const inv = scanDir(dir, { today: '2026-10-03' });
  assert.equal(inv['archlens-inventory'], '1.0');
  assert.equal(inv.repo.name.startsWith('archlens-repo-'), true);
  assert.match(inv.repo.commit, /^[0-9a-f]{40}$/);
  assert.equal(inv.repo.dirty, false);
  assert.equal(inv.files.compose, 1);
  const k = kind => inv.facts.filter(f => f.kind === kind);
  assert.deepEqual(k('service').map(f => [f.name, f.build, f.at.file, f.at.line]), [['pedidos-api', 'api', 'docker-compose.yml', 3]]);
  assert.deepEqual(k('infra-image').map(f => [f.service, f.engine, f.category, f.version]), [['pedidos-db', 'postgres', 'database', '16']]);
  assert.deepEqual(k('depends-on').map(f => [f.from, f.to]), [['pedidos-api', 'pedidos-db']]);
  assert.deepEqual(k('env-ref').map(f => [f.from, f.var, f.host]).sort(), [['pedidos-api', 'DB_URL', 'pedidos-db'], ['pedidos-api', 'PAGAMENTOS_URL', 'pagamentos']]);
  assert.ok(!inv.facts.some(f => f.name === 'lixo'), 'node_modules is ignored');
});

test('an unreadable file becomes a fact and the scan goes on; a folder outside git has no commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-plain-'));
  cpSync(fixture('quebrado'), dir, { recursive: true });
  const inv = scanDir(dir);
  assert.equal(inv.repo.commit, null);
  const bad = inv.facts.find(f => f.kind === 'unreadable');
  assert.equal(bad.at.file, 'compose.yaml');
  assert.ok(bad.error);
});

test('scanSource clones a git url (file://) into a temp folder and records the url', () => {
  const dir = gitRepo('pedidos');
  const inv = scanSource(`file://${dir}`, { today: '2026-10-03' });
  assert.equal(inv.repo.url, `file://${dir}`);
  assert.equal(inv.files.compose, 1);
  assert.throws(() => scanSource('/nao/existe'), /E_SCAN_SOURCE/);
  assert.throws(() => cloneShallow(`file://${dir}-nada`, {}), /E_SCAN_SOURCE/);
});

test('sourceKey keeps two lines of the same file apart', () => {
  assert.notEqual(sourceKey({ kind: 'repo', ref: 'r', path: 'a', line: 1 }), sourceKey({ kind: 'repo', ref: 'r', path: 'a', line: 2 }));
  assert.equal(sourceKey({ kind: 'prompt', ref: 'r' }), 'prompt|r|');
});
