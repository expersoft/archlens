// The repository attached to a draft: shallow clone by an async git (size and time ceilings, two at a time), scan in
// a worker thread, kept 30 min for read_file/grep, reads confined to the clone. The git token goes to git only through
// GIT_ASKPASS, from the child's environment, and only to the hosts listed in plan.gitTokenHosts.
import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, statSync, readFileSync } from 'node:fs';
import { readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep, isAbsolute } from 'node:path';
import { normalizeRepoUrl } from '../../../../scripts/lib/scan/git.mjs';
import { cleanRepoUrl } from './draft.mjs';

export const SECRET_FILES = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa*', 'id_ed25519*', '.npmrc', '.pypirc', '.netrc', '.git/'];
export const READ_MAX = 200 * 1024;
export const GREP_MAX = 200;
const TTL = 30 * 60 * 1000;
const GREP_TIMEOUT = 10000;
const SCAN_TIMEOUT = 120000;
const SIZE_POLL = 500;
const MAX_CLONES = 2;
const SECRET_NAMES = SECRET_FILES.filter(p => !p.endsWith('/')).map(p => new RegExp(`^${p.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`, 'i'));
const SECRET_DIRS = SECRET_FILES.filter(p => p.endsWith('/')).map(p => p.slice(0, -1));

const repoError = message => Object.assign(new Error(message), { code: 'E_GUI_REPO' });

/** A path (relative, any separator) that is a secret file or lies inside a secret folder. */
export function isSecretPath(rel) {
  const parts = String(rel).split(/[\\/]/).filter(Boolean);
  if (parts.some(p => SECRET_DIRS.includes(p.toLowerCase()))) return true;
  const name = parts.at(-1) ?? '';
  return SECRET_NAMES.some(re => re.test(name));
}

/**
 * scheme and host of a git url, as git sees them: `https://h/…`, `ssh://u@h/…`, `file://…` through `new URL()` (an
 * authority with `?`, `#` or `\`, or `@` in https, is refused: it would name another host than git's), and the scp-like
 * `u@h:path` explicitly; null otherwise.
 */
function partsOf(url) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/]*)/i.exec(url);
  if (m) {
    const scheme = m[1].toLowerCase();
    // node reads `\` as a separator, git and curl as a literal: the two would name different hosts
    if (/[?#\\]/.test(m[2]) || (scheme === 'https' && m[2].includes('@'))) return null;
    let u;
    try { u = new URL(url); } catch { return null; }
    return { scheme, host: u.hostname.toLowerCase() };
  }
  if (url.includes('\\')) return null;
  const scp = /^[^@/:?#]+@([^:/?#@]+):/.exec(url);
  return scp ? { scheme: 'ssh', host: scp[1].toLowerCase() } : null;
}

/**
 * `{ url, ref }` safe to hand to git: https or ssh (file:// only with `allowFileUrls`), no credentials, no host or url
 * starting with a dash, a plain ref.
 */
export function checkRepo({ url, ref } = {}, { allowFileUrls = false } = {}) {
  if (typeof url !== 'string' || !url.trim()) throw repoError('informe a URL do repositório');
  let clean;
  try { clean = cleanRepoUrl(url); } catch (e) { throw repoError(e.message); }
  const p = partsOf(clean);
  if (p?.scheme === 'file' && !allowFileUrls) throw repoError('URLs file:// estão desligadas neste servidor; use uma URL https:// ou ssh');
  if (!p || !['https', 'ssh', 'file'].includes(p.scheme) || clean.startsWith('-') || /[\s\0]/.test(clean)
    || (p.scheme !== 'file' && (!p.host || p.host.startsWith('-')))) {
    throw repoError('informe uma URL git https:// ou ssh (ssh://… ou git@host:caminho)');
  }
  if (ref !== undefined && !(typeof ref === 'string' && ref.length <= 200 && /^\w[\w./-]*$/.test(ref) && !ref.includes('..'))) {
    throw repoError('ref inválida: use um branch, uma tag ou um commit');
  }
  return { url: clean, ...(ref === undefined ? {} : { ref }) };
}

/** Text without userinfo in urls nor the token itself. */
export const scrub = (text, token) => {
  const s = String(text).replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1');
  return token ? s.split(token).join('***') : s;
};

/** Text without the credentials of its urls (cleanRepoUrl's rule: a bare ssh user, as in ssh://git@h, is no secret). */
export const scrubCredentials = text => String(text).replace(/([a-z][a-z0-9+.-]*:\/\/)([^@/\s]+)@/gi,
  (all, scheme, user) => (scheme.toLowerCase() === 'ssh://' && !user.includes(':') ? all : scheme));

/** Text without the server's temp folders: a path inside a clone becomes relative to it, the clone itself "o clone". */
export const hidePaths = text => String(text)
  .replace(/[^\s'"`(]*archlens-plan-[A-Za-z0-9_-]+[\\/]clone[\\/]/g, '')
  .replace(/[^\s'"`(]*archlens-plan-[A-Za-z0-9_-]+(?:[\\/]clone)?/g, 'o clone');

/** The token for `url`: only https and a host on plan.gitTokenHosts (exact, any case). */
function tokenFor(url, { env = {}, plan = {} }) {
  const token = plan.gitTokenEnv && typeof env[plan.gitTokenEnv] === 'string' ? env[plan.gitTokenEnv] : '';
  const p = partsOf(url);
  if (!token || p?.scheme !== 'https' || !(plan.gitTokenHosts ?? []).includes(p.host)) return null;
  return { token, host: p.host };
}

// The variables git, ssh and the proxies need; nothing else (the LLM key never reaches git, ssh or the askpass).
const KEEP = new Set(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'TZ', 'LANG', 'LANGUAGE', 'SystemRoot', 'windir',
  'ComSpec', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'ProgramData', 'XDG_CONFIG_HOME',
  'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_SSH_VARIANT', 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_EXEC_PATH', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE',
  'http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY', 'all_proxy', 'ALL_PROXY']);
const machineEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => KEEP.has(k) || k.startsWith('LC_')));

// Answers only prompts for the token's host, from the child's environment: the token is never written to disk.
const ASKPASS = `#!/bin/sh
case "$1" in
  *"//$ARCHLENS_GIT_HOST'"*|*"@$ARCHLENS_GIT_HOST'"*) ;;
  *) exit 0 ;;
esac
case "$1" in
  [Uu]sername*) printf '%s\\n' "$ARCHLENS_GIT_USER" ;;
  [Pp]assword*) printf '%s\\n' "$ARCHLENS_GIT_TOKEN" ;;
esac
`;

/**
 * The environment of a GUI clone: the machine's git/ssh/proxy variables only, never a prompt, no redirects, only the
 * https and ssh protocols (+ file with `allowFileUrls`). With a token for the url's host, GIT_ASKPASS points to a
 * script in `tmp` (0700) that answers the user (`plan.gitUser`) and the token for that host only, and the machine's
 * credential helpers are set aside. ssh and file urls use the machine's git.
 */
export function gitEnv(url, { env = {}, plan = {} } = {}, tmp) {
  const config = [['http.followRedirects', 'false']];
  const out = { ...machineEnv(), GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: plan.allowFileUrls ? 'https:ssh:file' : 'https:ssh' };
  const auth = tokenFor(url, { env, plan });
  if (auth) {
    const script = join(tmp, 'askpass.sh');
    writeFileSync(script, ASKPASS, { mode: 0o700 });
    config.push(['credential.helper', '']);
    Object.assign(out, { GIT_ASKPASS: script, ARCHLENS_GIT_HOST: auth.host, ARCHLENS_GIT_USER: plan.gitUser ?? 'x-access-token', ARCHLENS_GIT_TOKEN: auth.token });
  }
  out.GIT_CONFIG_COUNT = String(config.length);
  config.forEach(([k, v], i) => { out[`GIT_CONFIG_KEY_${i}`] = k; out[`GIT_CONFIG_VALUE_${i}`] = v; });
  return out;
}

async function sizeOf(dir) {
  let total = 0;
  let list;
  try { list = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await sizeOf(p);
    else { try { total += (await lstat(p)).size; } catch { /* gone meanwhile */ } }
  }
  return total;
}

// At most MAX_CLONES clones at a time, server-wide; the others wait their turn.
let running = 0;
const waiting = [];
const acquire = () => new Promise(go => { if (running < MAX_CLONES) { running++; go(); } else waiting.push(go); });
const release = () => { const next = waiting.shift(); if (next) next(); else running--; };

/**
 * One git command, async. Past the deadline or with `watch` above `maxBytes`, the whole process group is killed and the
 * promise rejects only once git has exited. Resolves { code, stderr } otherwise.
 */
function git(args, { cwd, env, deadline, watch, maxBytes, late, big }) {
  return new Promise((done, fail) => {
    const group = process.platform !== 'win32';
    const child = spawn('git', ['-c', 'safe.directory=*', ...args], { cwd, env, stdio: ['ignore', 'ignore', 'pipe'], detached: group });
    let stderr = '';
    let why = null;
    let closed = false;
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    const kill = reason => {
      if (why || closed) return; // after close the pid may belong to another process
      why = reason;
      try { if (group) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => kill(late), Math.max(0, deadline - Date.now()));
    let polling = false;
    const poll = setInterval(() => {
      if (polling) return;
      polling = true;
      sizeOf(watch).then(n => { if (n > maxBytes) kill(big); }).finally(() => { polling = false; });
    }, SIZE_POLL);
    const stop = () => { clearTimeout(timer); clearInterval(poll); };
    child.once('error', e => { stop(); fail(repoError(`git indisponível: ${e.message}`)); });
    child.once('close', code => { closed = true; stop(); if (why) fail(repoError(why)); else done({ code, stderr }); });
  });
}

const lastLine = s => s.trim().split('\n').at(-1) ?? '';

/** One job of repo-worker.mjs; past `ms` the worker is stopped and `late` is the error. */
function inWorker(data, ms, late) {
  return new Promise((done, fail) => {
    const w = new Worker(new URL('./repo-worker.mjs', import.meta.url), { workerData: data, env: machineEnv() });
    let settled = false;
    const end = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => { end(fail, repoError(late)); void w.terminate(); }, ms);
    w.once('message', m => (m.error ? end(fail, repoError(hidePaths(m.error.message))) : end(done, m.result)));
    w.once('error', e => end(fail, repoError(hidePaths(e.message))));
    w.once('exit', code => end(fail, repoError(`a leitura do repositório parou (código ${code})`)));
  });
}

const entries = new Map(); // url@commit → { tmp, timer, repo: { dir, commit, inv } }
const latest = new Map(); // url#ref → url@commit
const pending = new Map(); // url#ref → Promise
let hooked = false;

function forget(key) {
  const e = entries.get(key);
  if (!e) return;
  clearTimeout(e.timer);
  rmSync(e.tmp, { recursive: true, force: true });
  entries.delete(key);
  for (const [id, k] of latest) if (k === key) latest.delete(id);
}

/** Removes every clone kept (server close, process exit). */
export function closeRepos() {
  for (const key of [...entries.keys()]) forget(key);
}

/** git clone --depth 1 of `url` into `tmp`/clone (a full sha: fetched on its own and checked out); returns the folder. */
async function cloneInto(url, ref, tmp, opts) {
  const { plan = {} } = opts;
  const timeoutMs = plan.cloneTimeoutMs ?? 120000;
  const maxMb = plan.cloneMaxMb ?? 200;
  const dir = join(tmp, 'clone');
  const deadline = Date.now() + timeoutMs;
  const run = (args, cwd) => git(args, {
    cwd, env: gitEnv(url, opts, tmp), deadline, watch: dir, maxBytes: maxMb * 1024 * 1024,
    late: `o clone passou de ${Math.round(timeoutMs / 1000)} s`, big: `o repositório passou de ${maxMb} MB`,
  });
  const sha = ref && /^[0-9a-f]{40}$/i.test(ref);
  const r = await run(['clone', '-q', '--depth', '1', ...(ref && !sha ? ['--branch', ref] : []), '--', url, dir], tmp);
  if (r.code !== 0) throw repoError(`não foi possível clonar ${normalizeRepoUrl(url)}: ${lastLine(r.stderr)}`);
  if (sha) {
    const f = await run(['fetch', '-q', '--depth', '1', 'origin', ref], dir);
    const c = f.code === 0 ? await run(['checkout', '-q', 'FETCH_HEAD'], dir) : f;
    if (c.code !== 0) throw repoError(`não foi possível obter o commit ${ref.slice(0, 7)} de ${normalizeRepoUrl(url)}: ${lastLine(c.stderr)}`);
  }
  if (await sizeOf(dir) > maxMb * 1024 * 1024) throw repoError(`o repositório passou de ${maxMb} MB`);
  return dir;
}

async function cloneAndScan(url, ref, opts) {
  const token = tokenFor(url, opts)?.token;
  const tmp = mkdtempSync(join(tmpdir(), 'archlens-plan-'));
  await acquire();
  try {
    const dir = await cloneInto(url, ref, tmp, opts);
    rmSync(join(tmp, 'askpass.sh'), { force: true });
    const repo = await inWorker({ job: 'scan', dir, url }, SCAN_TIMEOUT, `a leitura do repositório passou de ${SCAN_TIMEOUT / 1000} s`);
    return { tmp, repo: { ...repo, dir } };
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw repoError(scrub(hidePaths(e.message), token));
  } finally { release(); }
}

/**
 * The clone of `{ url, ref }`: `{ dir, commit, inv }` (inv: the scan inventory, without the clone's path). Kept for
 * 30 min under url@commit; a second call within that time reuses it. `opts`: `{ env, plan }` of the server.
 */
export async function openRepo(target, opts = {}) {
  const { url, ref } = checkRepo(target, { allowFileUrls: !!opts.plan?.allowFileUrls });
  const id = `${normalizeRepoUrl(url)}#${ref ?? ''}`;
  const hit = entries.get(latest.get(id));
  if (hit) return hit.repo;
  if (pending.has(id)) return pending.get(id);
  const p = cloneAndScan(url, ref, opts).then(({ tmp, repo }) => {
    const key = `${normalizeRepoUrl(url)}@${repo.commit}`;
    if (entries.has(key)) rmSync(tmp, { recursive: true, force: true });
    else {
      const timer = setTimeout(() => forget(key), TTL);
      timer.unref();
      entries.set(key, { tmp, timer, repo });
      if (!hooked) { hooked = true; process.once('exit', closeRepos); }
    }
    latest.set(id, key);
    return entries.get(key).repo;
  }).finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

/** The text of `path` inside the clone `dir`: relative, no `..`, no secret file, no link out of it, up to READ_MAX. */
export function readRepoFile(dir, path) {
  if (typeof path !== 'string' || !path.trim()) throw repoError('informe "path"');
  const out = repoError('caminho fora do repositório');
  if (isAbsolute(path) || /^[a-z]:/i.test(path) || path.split(/[\\/]/).includes('..')) throw out;
  const secret = repoError('arquivo de segredo: não é lido');
  if (isSecretPath(path)) throw secret;
  const top = realpathSync(dir);
  let real;
  try { real = realpathSync(join(top, path)); } catch { throw repoError(`arquivo não encontrado: ${path}`); }
  if (!real.startsWith(top + sep)) throw out;
  if (isSecretPath(relative(top, real))) throw secret;
  const st = statSync(real);
  if (!st.isFile()) throw repoError(`não é um arquivo: ${path}`);
  if (st.size > READ_MAX) throw repoError(`arquivo grande demais (${Math.ceil(st.size / 1024)} KB; máximo ${READ_MAX / 1024} KB)`);
  const buf = readFileSync(real);
  if (buf.includes(0)) throw repoError(`arquivo binário: ${path}`);
  return buf.toString('utf8');
}

/** Lines `path:n: text` matching `pattern` (a regex) in the clone, up to GREP_MAX; run in a worker with a time ceiling. */
export async function grepRepo(dir, { pattern, glob }) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 500) throw repoError('informe "pattern" (até 500 caracteres)');
  if (glob !== undefined && (typeof glob !== 'string' || glob.length > 200)) throw repoError('"glob" deve ser texto');
  try { new RegExp(pattern); } catch (e) { throw repoError(`pattern inválido: ${e.message}`); }
  return inWorker({ job: 'grep', dir, pattern, glob, limit: GREP_MAX }, GREP_TIMEOUT, `a busca passou de ${GREP_TIMEOUT / 1000} s`);
}
