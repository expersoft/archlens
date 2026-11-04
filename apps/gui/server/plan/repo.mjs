// The repository attached to a draft: shallow clone and scan in a worker thread, kept 30 min for read_file/grep,
// reads confined to the clone. The git token goes to git only through GIT_ASKPASS, from the child's environment.
import { Worker } from 'node:worker_threads';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep, isAbsolute } from 'node:path';
import { isGitUrl, normalizeRepoUrl } from '../../../../scripts/lib/scan/git.mjs';
import { cleanRepoUrl } from './draft.mjs';

export const SECRET_FILES = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa*', 'id_ed25519*', '.npmrc', '.pypirc', '.netrc', '.git/'];
export const READ_MAX = 200 * 1024;
export const GREP_MAX = 200;
const TTL = 30 * 60 * 1000;
const GREP_TIMEOUT = 10000;
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

/** `{ url, ref }` safe to hand to git: a git url without credentials or a leading dash, a plain ref. */
export function checkRepo({ url, ref } = {}) {
  if (typeof url !== 'string' || !url.trim()) throw repoError('informe a URL do repositório');
  let clean;
  try { clean = cleanRepoUrl(url); } catch (e) { throw repoError(e.message); }
  if (clean.startsWith('-') || /[\s\0]/.test(clean) || !isGitUrl(clean)) {
    throw repoError('informe uma URL git (https://, ssh://, git@host:caminho ou file://)');
  }
  if (ref !== undefined && !(typeof ref === 'string' && ref.length <= 200 && /^\w[\w./-]*$/.test(ref) && !ref.includes('..'))) {
    throw repoError('ref inválida: use um branch, uma tag ou um commit');
  }
  return { url: clean, ...(ref === undefined ? {} : { ref }) };
}

/** Text without userinfo in urls nor the token itself. */
const scrub = (text, token) => {
  const s = String(text).replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1');
  return token ? s.split(token).join('***') : s;
};

const tokenOf = ({ env = {}, plan = {} }) => (plan.gitTokenEnv && typeof env[plan.gitTokenEnv] === 'string' && env[plan.gitTokenEnv]) || undefined;

// Reads the answers from the child's environment: the token is never written to disk.
const ASKPASS = '#!/bin/sh\ncase "$1" in\n  [Uu]sername*) printf \'%s\\n\' "$ARCHLENS_GIT_USER" ;;\n  *) printf \'%s\\n\' "$ARCHLENS_GIT_TOKEN" ;;\nesac\n';

/**
 * The environment of the git process: never prompts; with a token and an https url, GIT_ASKPASS points to a script in
 * `tmp` (0700) that answers the user (`plan.gitUser`) and the token from the child's own variables, and the machine's
 * credential helpers are set aside. ssh and file urls use the machine's git.
 */
export function gitEnv(url, { env = {}, plan = {} } = {}, tmp) {
  const out = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  delete out.GIT_ASKPASS;
  delete out.SSH_ASKPASS;
  const token = tokenOf({ env, plan });
  if (!token || !/^https:\/\//i.test(url)) return out;
  const script = join(tmp, 'askpass.sh');
  writeFileSync(script, ASKPASS, { mode: 0o700 });
  return { ...out, GIT_ASKPASS: script, ARCHLENS_GIT_USER: plan.gitUser ?? 'x-access-token', ARCHLENS_GIT_TOKEN: token,
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '' };
}

/** One job of repo-worker.mjs; past `ms` the worker is stopped, `late` is the error and `onLate` runs once it is gone. */
function inWorker(data, ms, late, onLate = () => {}) {
  return new Promise((done, fail) => {
    const w = new Worker(new URL('./repo-worker.mjs', import.meta.url), { workerData: data });
    let settled = false, timedOut = false;
    const end = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => { timedOut = true; end(fail, repoError(late)); void w.terminate(); }, ms);
    w.once('message', m => (m.error ? end(fail, repoError(m.error.message)) : end(done, m.result)));
    w.once('error', e => end(fail, repoError(e.message)));
    w.once('exit', code => { end(fail, repoError(`a leitura do repositório parou (código ${code})`)); if (timedOut) onLate(); });
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

async function cloneAndScan(url, ref, { env = {}, plan = {} }) {
  const timeoutMs = plan.cloneTimeoutMs ?? 120000;
  const token = tokenOf({ env, plan });
  const tmp = mkdtempSync(join(tmpdir(), 'archlens-plan-'));
  const drop = () => rmSync(tmp, { recursive: true, force: true });
  try {
    // git itself is killed a little after the worker is given up, so the message is the one about the ceiling
    const job = { job: 'clone', url, ref, env: gitEnv(url, { env, plan }, tmp), timeoutMs: timeoutMs + 1000, tmp, maxMb: plan.cloneMaxMb ?? 200 };
    const r = await inWorker(job, timeoutMs, `o clone passou de ${Math.round(timeoutMs / 1000)} s`, drop);
    rmSync(join(tmp, 'askpass.sh'), { force: true });
    return { tmp, repo: r };
  } catch (e) { drop(); throw repoError(scrub(e.message, token)); }
}

/**
 * The clone of `{ url, ref }`: `{ dir, commit, inv }` (inv: the scan inventory, without the clone's path). Kept for
 * 30 min under url@commit; a second call within that time reuses it.
 */
export async function openRepo(target, opts = {}) {
  const { url, ref } = checkRepo(target);
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
