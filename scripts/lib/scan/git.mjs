// Git access for the repository reader: shallow clone of a url, current commit, normalized repo identity.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';

const scanError = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code });
const run = (cwd, args) => spawnSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf8' });

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

/** git clone --depth 1 into a temp folder; the caller removes it (rmSync) when done. */
export function cloneShallow(url, { ref } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-clone-'));
  const r = run(tmpdir(), ['clone', '-q', '--depth', '1', ...(ref ? ['--branch', ref] : []), url, dir]);
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw scanError('E_SCAN_SOURCE', `não foi possível clonar ${normalizeRepoUrl(url)}: ${(r.stderr || '').trim().split('\n').at(-1)}`);
  }
  return dir;
}

export function assertFolder(path) {
  if (!existsSync(path)) throw scanError('E_SCAN_SOURCE', `pasta não encontrada: ${path}`);
  return resolve(path);
}
export { scanError };
