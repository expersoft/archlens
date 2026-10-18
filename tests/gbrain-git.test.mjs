import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { gbrainGitConnector } from '../scripts/lib/store/gbrain-git.mjs';
import { initBase, validateStore } from '../scripts/lib/store/config.mjs';
import { diffRaw, contentVersion } from '../scripts/lib/store/ops.mjs';
import { plan, apply } from '../scripts/lib/api.mjs';

// Hermetic git: no global or system config (identity, signing, hooks), messages in English.
Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C', LANG: 'C' });

const TODAY = { today: '2026-10-17' };
const sh = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const tryGit = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

/** A bare repository as the gbrain's remote; user(name) is a person with a clone of it and a base folder pointing to it. */
function world() {
  const root = mkdtempSync(join(tmpdir(), 'archlens-gbrain-git-'));
  const remote = join(root, 'remote.git');
  sh(root, 'init', '-q', '--bare', '-b', 'main', remote);
  const head = () => { const r = tryGit(remote, 'rev-parse', '-q', '--verify', 'refs/heads/main'); return r.status ? null : r.stdout.trim(); };
  const show = path => sh(remote, 'show', `main:${path}`);
  const user = (name, { identity = true, dir } = {}) => {
    const clone = join(root, `${name}-clone`);
    sh(root, 'clone', '-q', remote, clone);
    if (identity) { sh(clone, 'config', 'user.name', name); sh(clone, 'config', 'user.email', `${name}@example.com`); }
    const at = dir?.(clone) ?? join(root, `${name}-base`);
    initBase(at, { name: 'Empresa', store: { kind: 'gbrain', mode: 'git', repo: relative(at, clone) } });
    const store = opts => (opts
      ? gbrainGitConnector(resolveBase(at), validateStore(JSON.parse(readFileSync(join(at, 'archlens.json'), 'utf8')).store), opts)
      : openStore(resolveBase(at)));
    return { clone, dir: at, store, tip: join(at, '.archlens', 'tip') };
  };
  return { root, remote, head, show, user };
}

// Two domains that do not touch: vendas and rh.
const base = () => ({
  raw: {
    archlens: '2.0', name: 'Empresa',
    model: {
      elements: [
        { id: 'vendas', type: 'application-component', name: 'Vendas', c4: { kind: 'softwareSystem' } },
        { id: 'vendas.api', type: 'application-component', name: 'API de Vendas', parent: 'vendas', c4: { kind: 'container' } },
        { id: 'rh', type: 'application-component', name: 'Recursos Humanos', c4: { kind: 'softwareSystem' } },
        { id: 'rh.folha', type: 'application-component', name: 'Folha de Pagamento', parent: 'rh', c4: { kind: 'container' } },
      ],
      relationships: [],
    },
    changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }],
  },
  notes: {},
});
const seed = s => s.apply(diffRaw(s.read(), base()), { baseVersion: s.version() });

const delta = (model, extra = {}) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
  model: { elements: [], relationships: [], ...model }, ...extra });
const container = (id, name, parent) => ({ id, type: 'application-component', name, parent, c4: { kind: 'container' } });
const addVendas = () => delta({ elements: [container('vendas.cache', 'Cache de Pedidos', 'vendas')] }, { summary: 'cache de pedidos' });
const addRh = () => delta({ elements: [container('rh.portal', 'Portal do Colaborador', 'rh')] });

/** The final plan of `d`, answering its questions with `answers` (key → resolution; ops default to yes). */
function finalPlan(store, d, answers = {}) {
  const { plan: p } = plan(store, d, TODAY);
  if (p.state === 'final') return p;
  const given = new Map(p.items.filter(i => 'resolution' in i).map(i => [i.key, answers[i.key] ?? i.resolution ?? (i.class === 'op' ? 'yes' : null)]));
  const { plan: f } = plan(store, d, { ...TODAY, answers: given });
  assert.equal(f.state, 'final', JSON.stringify(f.items.filter(i => 'resolution' in i && i.resolution == null)));
  return f;
}
const refused = (fn, code) => {
  try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return e; }
  assert.fail(`deveria falhar com ${code}`);
};
const ids = s => s.read().raw.model.elements.map(e => e.id);

test('read of an empty remote is null; the first apply creates the base in one commit', () => {
  const w = world();
  const a = w.user('a');
  assert.equal(a.store().kind, 'gbrain');
  assert.equal(a.store().versioning, 'object');
  assert.equal(a.store().read(), null);
  assert.equal(a.store().version(), null);
  assert.deepEqual(a.store().history(), []);
  const res = seed(a.store());
  assert.equal(w.head() !== null, true);
  assert.equal(sh(w.remote, 'rev-list', '--count', 'main'), '1');
  assert.match(sh(w.remote, 'log', '-1', '--format=%s', 'main'), /^docs\(arquitetura\): /);
  assert.equal(sh(w.remote, 'log', '-1', '--format=%an <%ae>', 'main'), 'a <a@example.com>');
  const files = sh(w.remote, 'ls-tree', '-r', '--name-only', 'main').split('\n');
  for (const f of ['archlens/manifest.md', 'archlens/changelog.md', 'archlens/application-component/vendas.api.md', 'archlens/gbrain-pack.yaml']) assert.ok(files.includes(f), files.join(', '));
  assert.ok(files.every(f => f.startsWith('archlens/')), files.join(', '));
  assert.doesNotMatch(w.show('archlens/manifest.md'), /"store"/);
  // Another person reads the same base from the remote.
  const b = w.user('b');
  assert.equal(contentVersion(b.store().read()), res.version);
  assert.equal(b.store().read().raw.name, 'Empresa');
  assert.deepEqual(b.store().history().map(e => e.id), ['2026-10-01-01']);
  assert.equal(b.store().objectVersions(['element:vendas.api']).get('element:vendas.api'),
    a.store().objectVersions(['element:vendas.api']).get('element:vendas.api'));
});

test('criterion 1: plans on disjoint domains made on the same version both apply, one commit each', () => {
  const w = world();
  const a = w.user('a');
  const b = w.user('b');
  seed(a.store());
  const pa = finalPlan(a.store(), addVendas());
  const pb = finalPlan(b.store(), addRh());
  apply(a.store(), pa);
  apply(b.store(), pb);
  assert.equal(sh(w.remote, 'rev-list', '--count', 'main'), '3');
  assert.equal(sh(w.remote, 'log', '-1', '--format=%s', 'main~1'), 'docs(arquitetura): cache de pedidos');
  assert.ok(ids(a.store()).includes('vendas.cache') && ids(a.store()).includes('rh.portal'));
  assert.deepEqual(a.store().history().map(e => e.id), ['2026-10-01-01', '2026-10-17-01', '2026-10-17-02']);
});

test('criterion 2: a plan that writes what another wrote is refused and nothing reaches the remote', () => {
  const w = world();
  const a = w.user('a');
  const b = w.user('b');
  seed(a.store());
  const pa = finalPlan(a.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] }));
  const pb = finalPlan(b.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh', type: 'flow' }] }));
  apply(a.store(), pa);
  const head = w.head();
  const e = refused(() => apply(b.store(), pb), 'E_STORE_CONFLICT');
  assert.ok(e.conflicts.some(c => c.ref === 'element:vendas.api'), JSON.stringify(e.conflicts));
  assert.match(e.message, /API de Vendas/);
  assert.match(e.message, /--answers/);
  assert.equal(w.head(), head);
});

test('criterion 2: a plan that relies on an element another removed is refused', () => {
  const w = world();
  const a = w.user('a');
  const b = w.user('b');
  seed(a.store());
  const pb = finalPlan(b.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] }));
  const pa = finalPlan(a.store(), delta({}, { ops: [{ op: 'remove', id: 'rh.folha' }] }));
  apply(a.store(), pa);
  const head = w.head();
  const e = refused(() => apply(b.store(), pb), 'E_STORE_CONFLICT');
  const c = e.conflicts.find(x => x.ref === 'element:rh.folha');
  assert.ok(c, JSON.stringify(e.conflicts));
  assert.equal(c.current, null);
  assert.ok(!e.conflicts.some(x => x.ref === 'element:vendas.api'));
  assert.equal(w.head(), head);
});

test('a rejected push is retried over the new tip when the objects did not cross', () => {
  const w = world();
  const a = w.user('a');
  const b = w.user('b');
  seed(a.store());
  const start = w.head();
  const pa = finalPlan(a.store(), addVendas());
  const pb = finalPlan(b.store(), addRh());
  let pushes = 0;
  // B pushes between A's fetch and A's push.
  const racing = a.store({ beforePush: () => { if (!pushes++) apply(b.store(), pb); } });
  const res = apply(racing, pa);
  assert.equal(pushes, 2);
  assert.equal(sh(w.remote, 'rev-list', '--count', `${start}..main`), '2');
  assert.equal(sh(w.remote, 'log', '-1', '--format=%s', 'main'), 'docs(arquitetura): cache de pedidos');
  assert.ok(ids(a.store()).includes('vendas.cache') && ids(a.store()).includes('rh.portal'));
  assert.equal(res.entry.id, '2026-10-17-02'); // numbered over the history B wrote first
  assert.deepEqual(a.store().history().map(e => e.id), ['2026-10-01-01', '2026-10-17-01', '2026-10-17-02']);
});

test('a retried push checks the plan again: crossing objects and parallel duplicates are refused', () => {
  const w = world();
  const a = w.user('a');
  const b = w.user('b');
  seed(a.store());
  const crossA = finalPlan(a.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh.folha', type: 'serving' }] }));
  const crossB = finalPlan(b.store(), delta({ relationships: [{ from: 'vendas.api', to: 'rh', type: 'flow' }] }));
  let head;
  let racing = a.store({ beforePush: () => { if (!head) { apply(b.store(), crossB); head = w.head(); } } });
  let e = refused(() => apply(racing, crossA), 'E_STORE_CONFLICT');
  assert.ok(e.conflicts.some(c => c.ref === 'element:vendas.api'), JSON.stringify(e.conflicts));
  assert.equal(w.head(), head);

  const dupA = finalPlan(a.store(), delta({ elements: [container('vendas.crm', 'CRM de Clientes', 'vendas')] }));
  const dupB = finalPlan(b.store(), delta({ elements: [container('rh.crm', 'CRM de Clientes', 'rh')] }));
  head = null;
  racing = a.store({ beforePush: () => { if (!head) { apply(b.store(), dupB); head = w.head(); } } });
  e = refused(() => apply(racing, dupA), 'E_STORE_CONFLICT');
  assert.deepEqual(e.conflicts, [{ ref: 'element:vendas.crm', reason: 'possible-duplicate', candidate: 'rh.crm' }]);
  assert.equal(w.head(), head);
  assert.ok(!ids(a.store()).includes('vendas.crm'));
});

test('a failure before the push leaves the remote unchanged', () => {
  const w = world();
  const a = w.user('a');
  seed(a.store());
  const head = w.head();
  // An id the gbrain would file under another name: refused before anything is committed.
  const s = a.store();
  refused(() => s.apply([{ op: 'upsertElement', element: { id: 'Loja', type: 'application-component', name: 'Loja' } }], { baseVersion: s.version() }), 'E_STORE_GBRAIN_SLUG');
  assert.equal(w.head(), head);
  assert.equal(sh(a.tip, 'status', '--porcelain'), '');
  // A remote that refuses writes (no permission): git's answer comes back, nothing is there.
  const hook = join(w.remote, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "sem permissao de escrita" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  const pa = finalPlan(a.store(), addVendas());
  const e = refused(() => apply(a.store(), pa), 'E_STORE_GIT');
  assert.match(e.message, /sem permissao de escrita/);
  assert.equal(w.head(), head);
  assert.equal(sh(a.tip, 'status', '--porcelain'), '');
  assert.ok(!ids(a.store()).includes('vendas.cache'));
  // Once the remote accepts writes again, the same plan applies, alone in its commit.
  rmSync(hook);
  apply(a.store(), pa);
  assert.equal(sh(w.remote, 'rev-list', '--count', `${head}..main`), '1');
  assert.ok(ids(a.store()).includes('vendas.cache'));
});

test("the user's clone keeps its branch, working tree and index", () => {
  const w = world();
  seed(w.user('a').store());
  // The base folder lives inside the clone, on another branch, with work in progress.
  const u = w.user('u', { dir: clone => {
    sh(clone, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(clone, 'work.txt'), 'v1\n');
    sh(clone, 'add', 'work.txt');
    sh(clone, 'commit', '-q', '-m', 'wip');
    writeFileSync(join(clone, 'work.txt'), 'v2 (não commitado)\n');
    writeFileSync(join(clone, 'staged.txt'), 'no índice\n');
    sh(clone, 'add', 'staged.txt');
    writeFileSync(join(clone, 'solto.txt'), 'não rastreado\n');
    return join(clone, 'architecture');
  } });
  const state = () => ({
    branch: sh(u.clone, 'symbolic-ref', 'HEAD'),
    head: sh(u.clone, 'rev-parse', 'HEAD'),
    status: sh(u.clone, 'status', '--porcelain', '--untracked-files=all'),
    index: sh(u.clone, 'diff', '--cached'),
    worktree: sh(u.clone, 'diff'),
    refs: sh(u.clone, 'for-each-ref', '--format=%(refname) %(objectname)'),
    work: readFileSync(join(u.clone, 'work.txt'), 'utf8'),
  });
  const before = state();
  apply(u.store(), finalPlan(u.store(), addVendas()));
  assert.ok(ids(u.store()).includes('vendas.cache'));
  assert.deepEqual(state(), before);
  const worktrees = sh(u.clone, 'worktree', 'list', '--porcelain').split('\n').filter(l => l.startsWith('worktree '));
  assert.deepEqual(worktrees.map(l => l.slice(9)), [u.clone, u.tip]);
});

test('pages outside the prefix are never touched', () => {
  const w = world();
  const s = w.user('seed');
  mkdirSync(join(s.clone, 'people'));
  mkdirSync(join(s.clone, 'archlens'));
  writeFileSync(join(s.clone, 'README.md'), '# Cérebro da empresa\n');
  writeFileSync(join(s.clone, 'people', 'alice.md'), '---\ntype: person\n---\n# Alice\n');
  writeFileSync(join(s.clone, 'archlens', 'rascunho.md'), 'página de alguém dentro do prefixo\n');
  sh(s.clone, 'add', '.');
  sh(s.clone, 'commit', '-q', '-m', 'pages');
  sh(s.clone, 'push', '-q', 'origin', 'HEAD:main');
  const start = w.head();
  const a = w.user('a');
  assert.equal(a.store().read(), null); // no base under the prefix yet
  seed(a.store());
  apply(a.store(), finalPlan(a.store(), delta({}, { ops: [{ op: 'remove', id: 'rh.folha' }] })));
  const changed = sh(w.remote, 'diff', '--name-only', start, 'main').split('\n');
  assert.ok(changed.every(f => f.startsWith('archlens/') && f !== 'archlens/rascunho.md'), changed.join(', '));
  assert.equal(w.show('README.md'), '# Cérebro da empresa');
  assert.equal(w.show('people/alice.md'), '---\ntype: person\n---\n# Alice');
  assert.equal(w.show('archlens/rascunho.md'), 'página de alguém dentro do prefixo');
  assert.ok(!ids(a.store()).includes('rh.folha'));
});

test("git errors become E_STORE_GIT with git's output", () => {
  const w = world();
  const a = w.user('a');
  const gone = join(w.root, 'sumiu.git');
  sh(a.clone, 'remote', 'set-url', 'origin', gone);
  const e = refused(() => a.store().read(), 'E_STORE_GIT');
  assert.ok(e.message.includes(gone), e.message);
  assert.match(e.message, /fatal: /);
  // Without an identity in git, nothing is committed with an invented one.
  const n = w.user('n', { identity: false });
  const e2 = refused(() => seed(n.store()), 'E_STORE_GIT');
  assert.match(e2.message, /user\.name/);
  assert.match(e2.message, /user\.email/);
  assert.match(e2.message, /Please tell me who you are|empty ident|no email/i);
  assert.equal(w.head(), null);
});
