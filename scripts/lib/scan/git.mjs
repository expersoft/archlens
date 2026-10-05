// Git access for the repository reader: shallow clone of a url, current commit, normalized repo identity.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';

const scanError = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code });
const run = (cwd, args) => spawnSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf8' });
// Network commands never prompt for credentials (a scan must not hang) and give up after 120 s.
const runRemote = (cwd, args) => spawnSync('git', ['-c', 'safe.directory=*', ...args],
  { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
const why = r => (r.error?.code === 'ETIMEDOUT' ? 'tempo esgotado (120 s)' : r.error ? r.error.message : (r.stderr || '').trim().split('\n').at(-1));

export const isGitUrl = s => /^(https?|ssh|git|file):\/\//.test(s) || /^[\w.-]+@[\w.-]+:/.test(s);

/** Repo url without credentials, trailing ".git" or "/". */
export function normalizeRepoUrl(url) {
  return String(url).replace(/^([a-z+]+:\/\/)[^@/]+@/i, '$1').replace(/\/+$/, '').replace(/\.git$/, '');
}

export function repoName(urlOrPath) {
  return basename(String(urlOrPath).replace(/[/\\]+$/, '').replace(/\.git$/, '').replace(/^.*:/, m => (m.includes('/') ? m : '')));
}

export function repoInfo(dir) {
  const head = run(dir, ['rev-parse', 'HEAD']);
  if (head.status !== 0) return { commit: null, dirty: false };
  const st = run(dir, ['status', '--porcelain']);
  return { commit: head.stdout.trim(), dirty: st.stdout.trim().length > 0 };
}

/** url of the "origin" remote when dir is the top of a local repository (not a folder inside one), or null. */
export function remoteUrl(dir) {
  const top = run(dir, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(dir)) return null;
  const r = run(dir, ['remote', 'get-url', 'origin']);
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/**
 * git clone --depth 1 into a temp folder; the caller removes it (rmSync) when done. A branch or tag goes to
 * --branch; a full commit sha is fetched on its own (depth 1) and checked out.
 */
export function cloneShallow(url, { ref } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-clone-'));
  const sha = ref && /^[0-9a-f]{40}$/i.test(ref);
  const fail = message => { rmSync(dir, { recursive: true, force: true }); throw scanError('E_SCAN_SOURCE', message); };
  const r = runRemote(tmpdir(), ['clone', '-q', '--depth', '1', ...(ref && !sha ? ['--branch', ref] : []), url, dir]);
  if (r.status !== 0) fail(`não foi possível clonar ${normalizeRepoUrl(url)}: ${why(r)}`);
  if (sha) {
    const f = runRemote(dir, ['fetch', '-q', '--depth', '1', 'origin', ref]);
    const c = f.status === 0 ? run(dir, ['checkout', '-q', 'FETCH_HEAD']) : f;
    if (c.status !== 0) fail(`não foi possível obter o commit ${ref.slice(0, 7)} de ${normalizeRepoUrl(url)} (o servidor precisa permitir buscar um commit pelo sha): ${why(c)}`);
  }
  return dir;
}

export function assertFolder(path) {
  if (!existsSync(path)) throw scanError('E_SCAN_SOURCE', `pasta não encontrada: ${path}`);
  return resolve(path);
}
export { scanError };
