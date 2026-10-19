// The gbrain connector in git mode: the base is the layout of gbrain-layout.mjs under `prefix` in the git repository the
// gbrain syncs from. The remote tip is materialized in a detached worktree of the user's clone (<base>/.archlens/tip/),
// so the clone's branch, index and working tree are never touched. One apply is one commit pushed to the branch; a
// rejected push (someone wrote first) is redone over the new tip, after checking the plan again.
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { ELEMENT_TYPES } from '../registry.mjs';
import { applyOps, contentVersion } from './ops.mjs';
import { objectVersionsOf, checkExpect } from './versions.mjs';
import { subgraphOf, conflictError, objectConflictError, appendedEntry } from './contract.mjs';
import { storeError } from './errors.mjs';
import { readVaultFiles, vaultFiles, REMOVED } from './markdown.mjs';
import { toGbrainFiles, fromGbrainFiles, assertGbrainIds } from './gbrain-layout.mjs';

export const TIP = join('.archlens', 'tip');
const RETRIES = 3; // pushes redone after a rejection
// Variables that would point git at another repository than the one given with -C (set when run from a git hook).
const FOREIGN = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX'];

function baseEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const k of FOREIGN) delete env[k];
  return env;
}
const spawnGit = (cwd, args, opts = {}) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 120000, env: baseEnv(), ...opts });

/**
 * The environment of every git the connector runs for the clone `repo`: never prompts; ssh in batch mode (no password
 * prompt) unless the user chose how git runs ssh (GIT_SSH_COMMAND, GIT_SSH or core.sshCommand), which then stays as is.
 */
export function gitEnvFor(repo) {
  const env = baseEnv();
  const own = env.GIT_SSH_COMMAND || env.GIT_SSH || spawnGit(repo, ['config', 'core.sshCommand'], { env }).stdout?.trim();
  if (!own) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes';
  return env;
}
const output = r => (r.error ? (r.error.code === 'ENOENT' ? 'git não encontrado no PATH' : r.error.message) : `${r.stderr ?? ''}${r.stdout ?? ''}`.trim());
const gitError = (what, r, hint = '') => storeError('E_STORE_GIT', `${what}${hint}: ${output(r) || `git saiu com ${r.status}`}`, { git: output(r) });
/** Runs git and returns its stdout (trimmed); E_STORE_GIT with git's output when it fails. */
function gitOut(cwd, args, what, opts) {
  const r = spawnGit(cwd, args, opts);
  if (r.error || r.status !== 0) throw gitError(what, r);
  return r.stdout.trim();
}

/** The prefix as a relative folder ("archlens"); one that leaves the repository is refused. */
export function prefixOf(prefix) {
  const p = String(prefix).replace(/^\/+|\/+$/g, '');
  if (!p || p.split('/').some(s => s === '..' || s === '.' || s === '')) throw storeError('E_STORE_CONFIG', `"store.prefix" inválido: ${JSON.stringify(prefix)} (use uma pasta relativa, como "archlens")`);
  return p;
}

/** Every file under `<root>/<sub>/`, as root-relative path → text. */
function readTree(root, sub) {
  const out = new Map();
  const walk = rel => {
    const at = join(root, rel);
    if (!existsSync(at)) return;
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && e.name.endsWith('.md')) out.set(r, readFileSync(join(root, r), 'utf8'));
    }
  };
  walk(sub);
  return out;
}

/** The commit message of a round: its summary on one line. */
const subject = entry => `docs(arquitetura): ${String(entry?.summary ?? '').replace(/\s+/g, ' ').trim() || 'base atualizada pelo archlens'}`;

/**
 * `store` is the validated `store` of archlens.json ({ kind: 'gbrain', mode: 'git', repo, remote, branch, prefix }, `repo`
 * relative to the base folder). `beforePush()` runs right before each push (tests use it to push in between).
 */
export function gbrainGitConnector(locator, store, { describe = `${relative(process.cwd(), locator.path) || '.'}/ (gbrain git)`, beforePush } = {}) {
  const repo = resolve(locator.path, store.repo);
  const { remote, branch } = store;
  const prefix = prefixOf(store.prefix);
  const tip = join(locator.path, TIP);
  const hasTip = () => existsSync(join(tip, '.git'));
  const where = `${remote}/${branch}`;
  let env;
  const run = (cwd, args, opts) => spawnGit(cwd, args, { env: (env ??= gitEnvFor(repo)), ...opts });
  const git = (cwd, args, what, opts) => gitOut(cwd, args, what, { env: (env ??= gitEnvFor(repo)), ...opts });

  /** A commit of `tree` over `parent` (none when null), with the identity the user's git has; never one made up. */
  function commitTree(cwd, tree, parent, message) {
    const r = run(cwd, ['-c', 'user.useConfigOnly=true', 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], { input: '' });
    if (r.error || r.status !== 0) {
      throw gitError('não consegui criar o commit', r, ' (configure a identidade do git: git config user.name "Seu Nome" e git config user.email voce@empresa.com)');
    }
    return r.stdout.trim();
  }

  // --refmap= keeps the remote-tracking branches of the clone as they are; --no-tags brings no tags into it.
  const FETCH = ['fetch', '--quiet', '--no-tags', '--refmap='];
  const unreachable = r => gitError(`não consegui buscar ${where} (sem rede, sem acesso ou remote inexistente?)`, r);

  /**
   * The first time, makes the worktree at the remote tip from the clone, writing nothing of the clone but objects (not
   * even its FETCH_HEAD). Null when the remote does not have the branch (no worktree is made then).
   */
  function firstTip() {
    if (!existsSync(repo)) throw storeError('E_STORE_GIT', `${repo}: pasta não encontrada (o "repo" de ${join(locator.path, 'archlens.json')} deve apontar para um clone do repositório do gbrain)`);
    const ls = run(repo, ['ls-remote', '--exit-code', '--heads', remote, `refs/heads/${branch}`]);
    if (ls.status === 2) return null; // the remote is there, the branch is not: no base yet
    if (ls.error || ls.status !== 0) throw unreachable(ls);
    const sha = ls.stdout.split(/\s/)[0];
    git(repo, [...FETCH, '--no-write-fetch-head', remote, `refs/heads/${branch}`], `não consegui buscar ${where}`);
    if (run(repo, ['cat-file', '-e', `${sha}^{commit}`]).status !== 0) throw storeError('E_STORE_GIT', `${where} mudou enquanto era buscada (${sha.slice(0, 12)}); rode de novo`);
    checkout(sha);
    return sha;
  }

  /** Fetches the branch; the commit at its tip, or null when the remote does not have it. Moves no ref of the clone. */
  function fetchTip() {
    if (!hasTip() && firstTip() === null) return null;
    const f = run(tip, [...FETCH, remote, `refs/heads/${branch}`]); // FETCH_HEAD of the worktree, not the clone's
    if (f.error || f.status !== 0) {
      const ls = run(tip, ['ls-remote', '--exit-code', '--heads', remote, `refs/heads/${branch}`]);
      if (ls.status === 2) return null;
      throw unreachable(f);
    }
    return git(tip, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], 'FETCH_HEAD ilegível');
  }

  /** A commit with the empty tree, to stand for the tip of a branch the remote does not have yet (never pushed). */
  const emptyCommit = () => commitTree(repo, git(repo, ['mktree'], 'git mktree falhou', { input: '' }), null, 'archlens: ponta vazia');

  /** Puts the worktree at `sha` (the remote tip, or the empty commit), with nothing else in it. */
  function checkout(sha) {
    if (!hasTip()) {
      mkdirSync(dirname(tip), { recursive: true });
      // -f: a worktree registered before whose folder was removed is registered again.
      git(repo, ['worktree', 'add', '-f', '--detach', tip, sha], `não consegui criar a worktree ${tip}`);
      return;
    }
    git(tip, ['checkout', '-q', '-f', '--detach', sha], `não consegui atualizar a worktree ${tip}`);
    git(tip, ['clean', '-q', '-f', '-d'], `não consegui limpar a worktree ${tip}`);
  }

  /** The tip's base: { sha, files, flat, base } (base null when there is no manifest under the prefix). */
  function load({ forWrite = false } = {}) {
    const sha = fetchTip();
    if (sha === null && !forWrite) return { sha, base: null };
    checkout(sha ?? emptyCommit());
    const files = readTree(tip, prefix);
    if (!files.has(`${prefix}/manifest.md`)) return { sha, files, flat: new Map(), base: null };
    const flat = fromGbrainFiles(files, { prefix });
    return { sha, files, flat, base: readVaultFiles(flat) };
  }

  const read = () => { const { base } = load(); return base && { raw: base.raw, notes: base.notes }; };

  /** The files under the prefix for `next` (path → text, null to delete), over the tip as loaded. */
  function changes(cur, next, carry) {
    // A base written from scratch can bring the human text of another vault (carry: { base, removed }, see convertToGbrain).
    const prior = cur.base ?? carry?.base;
    const flat = cur.base ? cur.flat : (carry?.removed ?? new Map());
    const vault = new Map(flat);
    for (const [rel, text] of vaultFiles(next, prior, { read: rel => flat.get(rel) })) {
      if (text === null) vault.delete(rel); else vault.set(rel, text);
    }
    const out = new Map();
    const files = toGbrainFiles(vault, { prefix });
    for (const [rel, text] of files) if (!(existsSync(join(tip, rel)) && readFileSync(join(tip, rel), 'utf8') === text)) out.set(rel, text);
    // Element and view pages that are no longer in the base go; anything else under the prefix stays.
    const owned = rel => {
      const r = rel.slice(prefix.length + 1);
      return /^views\/[^/]+\.md$/.test(r) || (/^[^/]+\/[^/]+\.md$/.test(r) && ELEMENT_TYPES[r.split('/')[0]]);
    };
    for (const rel of cur.files.keys()) if (owned(rel) && !files.has(rel)) out.set(rel, null);
    const preserved = [...vault.keys()].filter(rel => rel.startsWith(REMOVED) && flat.get(rel) !== vault.get(rel)).map(rel => join(TIP, prefix, rel));
    return { out, preserved };
  }

  /** Commits the worktree's prefix over `parent` (null: a first commit) and pushes it; false when the push was rejected. */
  function commitAndPush(parent, message) {
    git(tip, ['add', '-A', '--', prefix], 'git add falhou');
    const sha = commitTree(tip, git(tip, ['write-tree'], 'git write-tree falhou'), parent, message);
    beforePush?.();
    // To the remote's URL, not its name: a push by name would move the clone's remote-tracking branch.
    const url = git(tip, ['remote', 'get-url', '--push', remote], `o clone não tem o remote "${remote}"`);
    const p = run(tip, ['push', '--porcelain', url, `${sha}:refs/heads/${branch}`]);
    if (p.error || p.status !== 0) {
      // "!" + "[rejected]": the branch moved (fetch first / non-fast-forward); "[remote rejected]" and the rest are errors.
      if (/^!\t.*\t\[rejected\]/m.test(p.stdout ?? '')) return { sha: null, rejected: p };
      throw gitError(`o push para ${where} falhou; nada foi gravado no remoto`, p);
    }
    return { sha };
  }

  const c = {
    kind: 'gbrain', writable: true, locator, versioning: 'object',
    describe: () => describe,
    read,
    readSubgraph(query) {
      const r = read();
      if (!r) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${describe}`);
      return subgraphOf(r.raw, query);
    },
    version: () => contentVersion(read()),
    objectVersions: (refs, snapshot = read()) => objectVersionsOf(snapshot, refs),
    history: () => read()?.raw.changelog ?? [],
    /** The tip's base as the vault reads it ({ base: { raw, notes, ctx }, files }), with the text people wrote in the pages; null when none. */
    vault() { const { base, flat } = load(); return base && { base, files: flat }; },
    /**
     * fetch → check (`expect`, or `baseVersion`, and `recheck(base)`, more conflicts the caller finds) → the ops over the
     * tip → one commit → push; a rejected push starts over from the fetch (up to RETRIES times). Anything that fails
     * before the push leaves the remote as it was and the worktree back at the tip.
     */
    apply(ops, { expect, baseVersion = null, recheck, carry } = {}) {
      const verify = base => {
        if (expect) {
          const conflicts = [...checkExpect(objectVersionsOf(base, Object.keys(expect)), expect), ...(recheck?.(base) ?? [])];
          if (conflicts.length) throw objectConflictError(conflicts);
          return;
        }
        const now = contentVersion(base);
        if (now !== baseVersion) throw conflictError(baseVersion, now);
      };
      let rejected;
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        const cur = load({ forWrite: true });
        try {
          verify(cur.base);
          const next = applyOps(cur.base, ops);
          assertGbrainIds(next.raw);
          const { out, preserved } = changes(cur, next, carry);
          const result = { version: contentVersion(next), preserved, entry: appendedEntry(next, ops) };
          if (!out.size) return result;
          for (const [rel, text] of out) {
            const path = join(tip, rel);
            if (text === null) { rmSync(path, { force: true }); continue; }
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, text);
          }
          const pushed = commitAndPush(cur.sha, subject(result.entry));
          if (pushed.sha) {
            checkout(pushed.sha);
            return result;
          }
          rejected = pushed.rejected;
        } catch (e) {
          try { checkout(cur.sha ?? emptyCommit()); } catch { /* the next load puts it back */ }
          throw e;
        }
      }
      throw gitError(`o push para ${where} foi recusado ${RETRIES + 1} vezes (outros applies gravando ao mesmo tempo); nada foi gravado. Rode o apply de novo`, rejected);
    },
  };
  return c;
}
