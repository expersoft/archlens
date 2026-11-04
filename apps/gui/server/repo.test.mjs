import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, mkdirSync, symlinkSync, readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './app.mjs';
import { createBaseRegistry } from './bases.mjs';
import { scripted } from './ask/scripted.mjs';
import { newDraft } from './plan/draft.mjs';
import { PLAN_TOOLS, runPlanTool } from './plan/tools.mjs';
import { openRepo, closeRepos, gitEnv, isSecretPath, scrub, checkRepo } from './plan/repo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (calls = []) => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `t${i}`, name, input })), ms: 1, usage: USAGE });
const json = { 'content-type': 'application/json' };
const lines = async res => (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

/** A git repository with a compose file, a README, secret files and links (one inside, one escaping). */
function sampleRepo() {
  const top = mkdtempSync(join(tmpdir(), 'archlens-repo-src-'));
  const dir = join(top, 'pagamentos');
  mkdirSync(join(dir, 'config'), { recursive: true });
  writeFileSync(join(dir, 'docker-compose.yml'), 'services:\n  api:\n    build: .\n  db:\n    image: postgres:16\n');
  writeFileSync(join(dir, 'README.md'), '# Pagamentos\n\nPALAVRA marcada no readme\n');
  writeFileSync(join(dir, '.env'), 'SEGREDO=PALAVRA\n');
  writeFileSync(join(dir, 'config', 'id_rsa'), 'chave PALAVRA\n');
  writeFileSync(join(dir, 'config', 'app.pem'), 'pem PALAVRA\n');
  const outside = join(top, 'fora.txt');
  writeFileSync(outside, 'fora do clone PALAVRA\n');
  symlinkSync(outside, join(dir, 'link-fora'));
  symlinkSync('.env', join(dir, 'link-env'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'inicial');
  return { dir, url: pathToFileURL(dir).href, commit: git(dir, 'rev-parse', 'HEAD') };
}

const closedPort = () => new Promise(done => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); });
});
// Accepts and never answers: a clone that hangs.
const silentServer = () => new Promise(done => {
  const socks = new Set();
  const s = createServer(c => { socks.add(c); c.on('error', () => {}); }).listen(0, '127.0.0.1', () => done({
    port: s.address().port, close: () => new Promise(r => { for (const c of socks) c.destroy(); s.close(() => r()); }),
  }));
});

const FILE_OK = { env: {}, plan: { allowFileUrls: true } };
const clones = () => new Set(readdirSync(tmpdir()).filter(n => n.startsWith('archlens-plan-')));
const newClones = before => [...clones()].filter(n => !before.has(n));

async function withPlan(fn, { provider = scripted([]), plan = { allowFileUrls: true }, env = {} } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-prepo-')), 'arch');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  const cfg = { port: 0, bases: [{ id: 'loja', path: dir }], llm: { provider: 'anthropic' }, env, plan: { maxRounds: 8, timeoutMs: 20000, maxTokens: 100000, ...plan } };
  const srv = await startServer({ config: cfg, provider });
  try { await fn(srv.url, srv, dir); } finally { await srv.close(); }
}
const post = (url, path, body) => fetch(`${url}/api/bases/loja/${path}`, { method: 'POST', headers: json, body: JSON.stringify(body) });

function withBase(fn) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-prepo-')), 'arch');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  const reg = createBaseRegistry({ port: 1, bases: [{ id: 'loja', path: dir }] }, { pollMs: 100000 });
  return Promise.resolve(fn(reg.get('loja'))).finally(() => reg.close());
}

test.after(() => closeRepos());

test('PLAN_TOOLS termina com scan_repo, read_file e grep', () => {
  assert.deepEqual(PLAN_TOOLS.slice(-3).map(t => t.name), ['scan_repo', 'read_file', 'grep']);
});

test('clone de file:// e scan_repo põem repo@commit na fonte do delta', async () => {
  const repo = sampleRepo();
  const provider = scripted([turn([['scan_repo', { url: repo.url, as: 'system' }]]), turn([['reply', { text: 'li' }]])]);
  await withPlan(async url => {
    const evs = await lines(await post(url, 'plan', { message: 'leia o repositório', attach: { url: repo.url }, history: [] }));
    const result = evs.find(e => e.type === 'result');
    assert.ok(result, JSON.stringify(evs));
    assert.deepEqual(result.draft.repo, { url: repo.url, commit: repo.commit });
    assert.equal(result.draft.delta.source.kind, 'repo');
    assert.equal(result.draft.delta.source.ref, `${repo.url}@${repo.commit.slice(0, 7)}`);
    assert.ok(evs.some(e => e.type === 'stage' && e.stage === 'lendo o repositório'));
    // the model was told about the attachment and got the summary as external content, with no machine path
    assert.match(provider.seen[0].input.text, /anexou o repositório/);
    const out = provider.seen[1].input.results[0];
    assert.ok(!out.isError, out.content);
    assert.ok(out.content.startsWith('<conteudo-externo origem="repositório">'), out.content);
    assert.match(out.content, /Repositório pagamentos/);
    assert.doesNotMatch(out.content, /archlens-plan-|archlens-clone-|archlens scan/);
  }, { provider });
});

test('segundo repositório no mesmo rascunho é recusado', async () => {
  const a = sampleRepo();
  const b = sampleRepo();
  await withBase(async ctx => {
    const session = { draft: { ...newDraft(ctx), repo: { url: a.url, commit: a.commit } }, previews: [], attach: { url: b.url }, git: FILE_OK };
    const r = await runPlanTool(ctx, session, 'scan_repo', { url: b.url });
    assert.equal(r.ok, false);
    assert.equal(r.content, 'um repositório por rascunho: aplique ou descarte o atual');
    assert.equal(session.draft.repo.url, a.url);
  });
  await withPlan(async url => {
    const draft = { ...newDraft({ id: 'loja', version: '' }), repo: { url: a.url, commit: a.commit } };
    const res = await post(url, 'plan', { draft, message: 'leia', attach: { url: b.url }, history: [] });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'um repositório por rascunho: aplique ou descarte o atual');
  });
});

test('scan_repo só lê o repositório anexado pelo usuário', () => withBase(async ctx => {
  const a = sampleRepo();
  const session = { draft: newDraft(ctx), previews: [], git: FILE_OK };
  const r = await runPlanTool(ctx, session, 'scan_repo', { url: a.url });
  assert.equal(r.ok, false);
  assert.match(r.content, /que o usuário anexou/);
  assert.equal(session.draft.repo, null);
}));

test('anexo com credencial embutida ou que não é URL git é recusado', () => withPlan(async url => {
  for (const attach of [{ url: 'https://ghp_x@github.com/a/b.git' }, { url: '/etc' }, { url: '-uevil@h:x' }, { url: 'https://h/a.git', ref: '--upload-pack=x' }, { url: 3 }]) {
    const res = await post(url, 'plan', { message: 'leia', attach, history: [] });
    assert.equal(res.status, 400, JSON.stringify(attach));
    assert.doesNotMatch(JSON.stringify(await res.json()), /ghp_x/);
  }
}));

test('token nunca vaza', async () => {
  const port = await closedPort();
  const remote = `https://127.0.0.1:${port}/x.git`;
  const provider = scripted([turn([['scan_repo', { url: remote }]]), turn([['reply', { text: 'não consegui' }]])]);
  await withPlan(async (url, srv) => {
    const res = await post(url, 'plan', { message: 'leia', attach: { url: remote }, history: [] });
    const text = await res.text();
    const out = provider.seen[1].input.results[0];
    assert.equal(out.isError, true);
    assert.match(out.content, /não foi possível clonar/);
    for (const where of [text, JSON.stringify(provider.seen), JSON.stringify(srv.telemetry.recent())]) assert.doesNotMatch(where, /ghp_segredo/);
  }, { provider, env: { GIT_TOKEN: 'ghp_segredo' }, plan: { gitTokenEnv: 'GIT_TOKEN', gitTokenHosts: ['127.0.0.1'], cloneTimeoutMs: 20000 } });
});

test('o token vai ao git só pelo askpass, só para os hosts da lista', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'archlens-askpass-'));
  const plan = { gitTokenEnv: 'GIT_TOKEN', gitTokenHosts: ['gitlab.com'], gitUser: 'oauth2' };
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-chave-do-llm';
  try {
    const env = gitEnv('https://GitLab.com/a/b.git', { env: { GIT_TOKEN: 'ghp_segredo' }, plan }, tmp);
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(env.GIT_ALLOW_PROTOCOL, 'https:ssh');
    assert.ok(env.PATH);
    assert.equal(env.ANTHROPIC_API_KEY, undefined); // the LLM key never reaches git, ssh or the askpass
    const config = Object.fromEntries(Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => [env[`GIT_CONFIG_KEY_${i}`], env[`GIT_CONFIG_VALUE_${i}`]]));
    assert.equal(config['http.followRedirects'], 'false');
    assert.equal(config['credential.helper'], '');
    const script = env.GIT_ASKPASS;
    assert.ok(script && existsSync(script));
    assert.doesNotMatch(readFileSync(script, 'utf8'), /ghp_segredo/);
    if (process.platform !== 'win32') assert.equal(statSync(script).mode & 0o777, 0o700);
    const ask = prompt => spawnSync(script, [prompt], { env, encoding: 'utf8' }).stdout;
    assert.equal(ask("Username for 'https://gitlab.com': ").trim(), 'oauth2');
    assert.equal(ask("Password for 'https://oauth2@gitlab.com': ").trim(), 'ghp_segredo');
    // a prompt for another host (a redirect, a submodule) gets nothing
    for (const p of ["Username for 'https://evil.com': ", "Password for 'https://oauth2@evil.com': ", "Password for 'https://oauth2@gitlab.com.evil.com': ", 'Password: ']) {
      assert.equal(ask(p), '', p);
    }
  } finally { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; }
  // a host off the list, ssh and file urls: no askpass, no token
  for (const u of ['https://github.com/a/b.git', 'git@gitlab.com:a/b.git', 'ssh://git@gitlab.com/a/b.git', 'file:///tmp/x']) {
    const e = gitEnv(u, { env: { GIT_TOKEN: 'ghp_segredo' }, plan: { ...plan, allowFileUrls: true } }, tmp);
    assert.equal(e.GIT_ASKPASS, undefined, u);
    assert.doesNotMatch(JSON.stringify(e), /ghp_segredo/, u);
  }
  assert.equal(gitEnv('file:///tmp/x', { plan: { allowFileUrls: true } }, tmp).GIT_ALLOW_PROTOCOL, 'https:ssh:file');
});

test('scrub tira o token e a credencial das URLs', () => {
  assert.equal(scrub("fatal: unable to access 'https://x-access-token:ghp_segredo@github.com/a.git/': 403", 'ghp_segredo'),
    "fatal: unable to access 'https://github.com/a.git/': 403");
  assert.equal(scrub('erro ghp_segredo no meio', 'ghp_segredo'), 'erro *** no meio');
  assert.equal(scrub('ssh://git:senha@h/x e https://u@h/y'), 'ssh://h/x e https://h/y');
});

test('file:// e caminho local só com plan.allowFileUrls; só https, ssh e file', async () => {
  const repo = sampleRepo();
  assert.throws(() => checkRepo({ url: repo.url }), /file:\/\//);
  assert.equal(checkRepo({ url: repo.url }, { allowFileUrls: true }).url, repo.url);
  await assert.rejects(openRepo({ url: repo.url }, { env: {}, plan: {} }), /file:\/\//);
  for (const url of ['http://h/a.git', 'git://h/a.git', '/srv/repo', 'ssh://-oProxyCommand=x/a', 'git@-oProxyCommand=x:a', 'ssh://git@-h/a']) {
    assert.throws(() => checkRepo({ url }, { allowFileUrls: true }), e => e.code === 'E_GUI_REPO', url);
  }
  await withPlan(async url => {
    const res = await post(url, 'plan', { message: 'leia', attach: { url: repo.url }, history: [] });
    assert.equal(res.status, 400);
  }, { plan: {} });
});

test('scan_repo guarda a URL validada e usa a ref anexada pelo usuário', () => withBase(async ctx => {
  const repo = sampleRepo();
  const session = { draft: newDraft(ctx), previews: [], attach: { url: repo.url, ref: 'main' }, git: FILE_OK };
  const r = await runPlanTool(ctx, session, 'scan_repo', { url: `  ${repo.url}  `, ref: 'outra' });
  assert.ok(r.ok, r.content);
  assert.deepEqual(session.draft.repo, { url: repo.url, ref: 'main', commit: repo.commit });
}));

test('read_file recusa ../, link simbólico para fora e SECRET_FILES', () => withBase(async ctx => {
  const repo = sampleRepo();
  const session = { draft: newDraft(ctx), previews: [], attach: { url: repo.url }, git: FILE_OK };
  const scan = await runPlanTool(ctx, session, 'scan_repo', { url: repo.url });
  assert.ok(scan.ok, scan.content);
  const ok = await runPlanTool(ctx, session, 'read_file', { path: 'README.md' });
  assert.ok(ok.ok, ok.content);
  assert.ok(ok.content.startsWith('<conteudo-externo origem="repositório">'));
  assert.match(ok.content, /PALAVRA marcada no readme/);
  for (const path of ['../fora.txt', '/etc/passwd', 'link-fora', 'link-env', '.env', 'config/id_rsa', 'config/app.pem', '.git/config', 'config/../.env']) {
    const r = await runPlanTool(ctx, session, 'read_file', { path });
    assert.equal(r.ok, false, path);
    assert.doesNotMatch(r.content, /PALAVRA|SEGREDO|archlens-plan-/, path);
  }
  const g = await runPlanTool(ctx, session, 'grep', { pattern: 'PALAVRA' });
  assert.ok(g.ok, g.content);
  assert.match(g.content, /README\.md:3: PALAVRA marcada no readme/);
  assert.doesNotMatch(g.content, /SEGREDO|chave|pem PALAVRA|fora do clone/);
  const none = await runPlanTool(ctx, session, 'grep', { pattern: 'PALAVRA', glob: '*.yml' });
  assert.ok(none.ok);
  assert.doesNotMatch(none.content, /README/);
  assert.equal((await runPlanTool(ctx, session, 'grep', { pattern: '(' })).ok, false);
}));

test('SECRET_FILES', () => {
  for (const p of ['.env', '.env.local', 'a/b/.env.prod', 'x.pem', 'k.key', 'c.p12', 'c.pfx', 'id_rsa', 'ssh/id_rsa.pub', 'id_ed25519', '.npmrc', '.pypirc', '.netrc', '.git/config', 'sub/.git/HEAD', 'A.PEM']) {
    assert.ok(isSecretPath(p), p);
  }
  for (const p of ['README.md', 'env.md', 'src/key.ts', 'docs/.envrc.md']) assert.ok(!isSecretPath(p), p);
});

test('clone acima do teto de tamanho é recusado e limpo', async () => {
  const repo = sampleRepo();
  const before = clones();
  await assert.rejects(openRepo({ url: repo.url, ref: 'main' }, { env: {}, plan: { allowFileUrls: true, cloneMaxMb: 0.000001 } }), /o repositório passou de 0\.000001 MB/);
  assert.deepEqual(newClones(before), []);
});

test('clone acima do teto de tempo mata o git antes de limpar', async () => {
  const silent = await silentServer();
  const before = clones();
  const t0 = Date.now();
  try {
    await assert.rejects(openRepo({ url: `https://127.0.0.1:${silent.port}/y.git` }, { env: {}, plan: { cloneTimeoutMs: 1000 } }), { message: 'o clone passou de 1 s' });
    assert.ok(Date.now() - t0 < 4000);
    // the folder goes only after git has exited
    assert.deepEqual(newClones(before), []);
  } finally { await silent.close(); }
});

test('clone acima do teto de tempo', async () => {
  const silent = await silentServer();
  const remote = `https://127.0.0.1:${silent.port}/x.git`;
  const provider = scripted([turn([['scan_repo', { url: remote }]]), turn([['reply', { text: 'não consegui' }]])]);
  try {
    await withPlan(async url => {
      const t0 = Date.now();
      const pending = post(url, 'plan', { message: 'leia', attach: { url: remote }, history: [] }).then(lines);
      await new Promise(r => setTimeout(r, 300));
      const bases = await fetch(`${url}/api/bases`);
      assert.equal(bases.status, 200);
      assert.ok(Date.now() - t0 < 1500, 'GET /api/bases esperou o clone');
      const evs = await pending;
      assert.ok(evs.some(e => e.type === 'result'));
      const out = provider.seen[1].input.results[0];
      assert.equal(out.isError, true);
      assert.equal(out.content, 'o clone passou de 2 s');
    }, { provider, plan: { cloneTimeoutMs: 2000, allowFileUrls: true } });
  } finally { await silent.close(); }
});
