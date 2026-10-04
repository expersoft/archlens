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
import { toDelta } from '../scripts/lib/scan/to-delta.mjs';

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

test('readYaml throws on unresolved alias', () => {
  assert.throws(() => readYaml('a: *nope\nkind: X\n'), /Unresolved alias/i);
});

test('scanDir records unreadable for a compose with bad alias', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-bad-alias-'));
  writeFileSync(join(dir, 'compose.yaml'), 'services:\n  a:\n    image: x\n  b: *missing\n');
  const inv = scanDir(dir);
  const bad = inv.facts.find(f => f.kind === 'unreadable');
  assert.ok(bad, 'unreadable fact should exist for bad alias');
  assert.equal(bad.at.file, 'compose.yaml');
  assert.match(bad.error, /Unresolved alias/i);
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

const tree = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-tree-'));
  for (const [p, text] of Object.entries(files)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), text); }
  return dir;
};

test('Helm templates are not plain YAML: chart templates/ skipped, k8s docs with {{ }} dropped (item 2)', () => {
  const dir = tree({
    'chart/Chart.yaml': 'apiVersion: v2\nname: pay\nversion: 0.1.0\n',
    'chart/templates/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: "{{ include \\"pay.fullname\\" . }}"\nspec:\n  template:\n    spec:\n      containers:\n        - image: "{{ .Values.image.repository }}"\n',
    'chart/templates/broken.yaml': 'metadata:\n  name: {{ .Release.Name }}\n  labels: {{- toYaml . | nindent 4 }}\n',
    'k8s/tpl.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: "{{ .Values.name }}"\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: real\nspec:\n  template:\n    spec:\n      containers:\n        - image: "acme/x:{{ .Values.tag }}"\n',
  });
  const inv = scanDir(dir);
  assert.deepEqual(inv.facts.filter(f => f.kind === 'unreadable'), []);
  assert.ok(!inv.facts.some(f => /\{\{/.test(f.name ?? '') || /\{\{/.test(f.image ?? '')), JSON.stringify(inv.facts));
  assert.ok(inv.files.ignored >= 2, 'the templates count as ignored');
});

test('test and fixture folders are skipped at any depth, the root never (item 16)', () => {
  const svc = 'services:\n  x:\n    build: .\n';
  const dir = tree({ 'compose.yml': svc, 'tests/compose.yml': svc, 'test/compose.yml': svc, 'src/__tests__/compose.yml': svc,
    'a/fixtures/compose.yml': svc, 'b/spec/compose.yml': svc });
  const inv = scanDir(dir);
  assert.equal(inv.files.compose, 1);
  assert.deepEqual([...new Set(inv.facts.map(f => f.at.file))], ['compose.yml']);
  assert.ok(inv.files.ignored >= 5, `skipped files are counted (${inv.files.ignored})`);
  const nested = join(dir, 'tests');
  assert.equal(scanDir(nested).files.compose, 1, 'a test folder given as the root is read');
});

test('a gitignored graphify-out still has its graph read (item 4)', () => {
  const dir = tree({ '.gitignore': 'graphify-out/\n', 'graphify-out/graph.json': '{"nodes":[],"links":[]}', 'graphify-out/other.yaml': 'kind: X\napiVersion: v1\n' });
  const inv = scanDir(dir);
  assert.equal(inv.files.graphify, 1);
  assert.equal(inv.files.k8s, 0);
});

test('a local folder with a git remote is identified by the remote url, without credentials (item 6)', () => {
  const dir = gitRepo('pedidos');
  git(dir, 'remote', 'add', 'origin', 'https://u:t@example.com/org/x.git');
  const inv = scanDir(dir);
  assert.equal(inv.repo.url, 'https://example.com/org/x');
  assert.equal(inv.repo.path, dir);
  assert.equal(inv.repo.name, 'x');
  const d = toDelta(inv, { role: 'service', system: 'loja' });
  assert.equal(d.source.ref, `https://example.com/org/x@${inv.repo.commit.slice(0, 7)}`);
  assert.equal(d.model.elements.find(e => e.id === 'loja.x').properties.repo, 'https://example.com/org/x');
  const plain = gitRepo('pedidos');
  assert.equal(scanDir(plain).repo.url, undefined, 'no remote: the absolute path stays the identity');
  assert.equal(scanDir(join(dir, 'api')).repo.url, undefined, 'a subfolder is not the remote repository');
});

test('--ref with a commit sha: shallow clone, then fetch and checkout of that commit (item 13)', () => {
  const dir = gitRepo('pedidos');
  const first = git(dir, 'rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(dir, 'README.md'), 'x\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'second');
  const inv = scanSource(`file://${dir}`, { ref: first });
  assert.equal(inv.repo.commit, first);
  assert.throws(() => scanSource(`file://${dir}`, { ref: 'f'.repeat(40) }), e => /E_SCAN_SOURCE/.test(e.message) && /commit f{7}/.test(e.message));
});

test('scannedAt is the local date (item 15)', () => {
  const utcHour = new Date().getUTCHours();
  const old = process.env.TZ;
  process.env.TZ = utcHour >= 12 ? 'Pacific/Kiritimati' : 'Etc/GMT+12'; // local date ≠ UTC date right now
  try {
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.notEqual(local, d.toISOString().slice(0, 10));
    assert.equal(scanDir(mkdtempSync(join(tmpdir(), 'archlens-date-'))).repo.scannedAt, local);
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
