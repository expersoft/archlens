// A throwaway gbrain for the integration tests (npm run test:gbrain): gbrain cloned from github.com/garrytan/gbrain at a
// fixed commit into a temporary folder, its packages installed there (bun install, never -g), a GBRAIN_HOME of its own
// in the same folder (PGLite, no embeddings), and a bare git repository as the remote of the base, with a clone of it
// registered as a gbrain source (what `gbrain sync` reads; addSource adds more). Nothing outside the temporary folder is
// touched; down() removes it. gbrain(args) runs `bun run <src>/src/cli.ts …` with that GBRAIN_HOME; mcp() starts
// `gbrain serve` over stdio and talks to it as an agent's MCP client does.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

export const GBRAIN_REPO = 'https://github.com/garrytan/gbrain';
// The commit read for the spec (gbrain 0.60.304, 2026-10-18). A fetch by commit needs the full hash.
export const GBRAIN_REF = 'ac1ba4c93938fc7ff65b6db62b524ffa29f1edac';
export const SOURCE = 'arquitetura'; // the gbrain source of the clone (git mode)

/** The bun on the PATH, or null. */
export function findBun() {
  for (const d of (process.env.PATH ?? '').split(delimiter)) {
    const p = join(d, 'bun');
    if (d && existsSync(p)) return p;
  }
  return null;
}

// Hermetic git for everything the environment runs (no global or system config, messages in English).
const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C', LANG: 'C' };

// The environment gbrain inherits, without what would point it to another brain or a paid provider.
const inherited = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GBRAIN_|DATABASE_URL$|^(VOYAGE|OPENAI|ANTHROPIC|GOOGLE|GEMINI)_/.test(k)));

function run(cmd, args, { cwd, env, input, timeout = 600_000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...inherited(), ...env }, input, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error ? `\n${r.error.message}` : '') };
}
function must(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (r.status !== 0) throw new Error(`gbrain-env: ${cmd} ${args.join(' ')} falhou (${r.status}):\n${r.stderr}\n${r.stdout}`);
  return r.stdout;
}

let current = null;

export const gbrainEnv = {
  /**
   * { root, src, home, repoBare, clone, source, version, gbrain(args, opts), call(tool, args, { source }), mcp(serveArgs, { source }),
   * sync(source), schemaUse(yaml), addSource(id), git(cwd, ...args) }.
   * `ref`: the gbrain commit (full hash).
   */
  up({ ref = GBRAIN_REF } = {}) {
    const bun = findBun();
    if (!bun) throw new Error('gbrain-env: bun não está no PATH');
    if (current) gbrainEnv.down();
    const root = mkdtempSync(join(tmpdir(), 'archlens-gbrain-env-'));
    current = { root };
    try {
      const git = (cwd, ...args) => must('git', ['-C', cwd, ...args], { env: GIT_ENV }).trim();
      // gbrain at `ref`: a shallow fetch of that one commit.
      const src = join(root, 'gbrain');
      mkdirSync(src);
      git(src, 'init', '-q');
      git(src, 'remote', 'add', 'origin', GBRAIN_REPO);
      git(src, 'fetch', '-q', '--depth', '1', 'origin', ref);
      git(src, 'checkout', '-q', 'FETCH_HEAD');
      // Its packages, in the clone only (the postinstall runs gbrain's migrations, which have no brain to work on yet).
      must(bun, ['install', '--frozen-lockfile'], { cwd: src });

      // GBRAIN_HOME is the parent of .gbrain; HOME points there too, so nothing reads or writes the user's files.
      // The self-upgrade check is off.
      const home = join(root, 'home');
      mkdirSync(home);
      const env = { ...GIT_ENV, GBRAIN_HOME: home, HOME: home, NO_COLOR: '1' };
      const gbrain = (args, { input, cwd = root, timeout } = {}) => run(bun, ['run', join(src, 'src', 'cli.ts'), ...args], { cwd, env, input, timeout });
      const gb = (...args) => {
        const r = gbrain(args);
        if (r.status !== 0) throw new Error(`gbrain-env: gbrain ${args.join(' ')} falhou (${r.status}):\n${r.stderr}\n${r.stdout}`);
        return r.stdout;
      };
      gb('init', '--pglite', '--no-embedding');
      gb('config', 'set', 'self_upgrade.mode', 'off');

      /**
       * A bare repository as a base's remote, with a first commit (sources add wants a repository with committed files),
       * and a clone of it registered as the gbrain source `id`: { id, repoBare, clone }. gbrain keeps one page per
       * frontmatter `id` and content in a source, so two bases with the same elements each need a source of their own.
       */
      const addSource = id => {
        const repoBare = join(root, `${id}.git`);
        git(root, 'init', '-q', '--bare', '-b', 'main', repoBare);
        const seed = join(root, `${id}-seed`);
        git(root, 'clone', '-q', repoBare, seed);
        writeFileSync(join(seed, 'README.md'), '# Base de arquitetura (teste do archlens)\n');
        git(seed, 'add', 'README.md');
        git(seed, '-c', 'user.name=seed', '-c', 'user.email=seed@example.com', 'commit', '-q', '-m', 'início');
        git(seed, 'push', '-q', 'origin', 'HEAD:main');
        rmSync(seed, { recursive: true, force: true });
        const clone = join(root, `${id}-gbrain`);
        git(root, 'clone', '-q', repoBare, clone);
        gb('sources', 'add', id, '--path', clone, '--no-federated', '--no-harden');
        return { id, repoBare, clone };
      };
      const { repoBare, clone } = addSource(SOURCE);

      /**
       * One operation by name through `gbrain call` (the trusted local surface: the same handler as the MCP server's).
       * { ok: true, value } or { ok: false, error } (the error envelope gbrain prints).
       */
      const call = (tool, args = {}, { source } = {}) => {
        const r = gbrain(['call', ...(source ? ['--source', source] : []), tool, JSON.stringify(args)]);
        let out;
        try { out = JSON.parse(r.stdout); } catch { throw new Error(`gbrain-env: gbrain call ${tool} não devolveu JSON (${r.status}):\n${r.stderr}\n${r.stdout}`); }
        return r.status === 0 ? { ok: true, value: out } : { ok: false, error: out };
      };
      // The source is a managed checkout: `gbrain sync` imports it at its local HEAD without pulling, and
      // `sources refresh` fast-forwards it from the remote and syncs it (src/commands/sync.ts --no-pull).
      const sync = (source = SOURCE) => gb('sources', 'refresh', source);
      /** Installs a schema pack (its YAML text) under GBRAIN_HOME and makes it the active one (`gbrain schema use`). */
      const schemaUse = (yaml, name = 'archlens') => {
        mkdirSync(join(home, '.gbrain', 'schema-packs', name), { recursive: true });
        writeFileSync(join(home, '.gbrain', 'schema-packs', name, 'pack.yaml'), yaml);
        gb('schema', 'use', name);
      };
      /**
       * An MCP client of `gbrain serve` over stdio (newline-delimited JSON-RPC), as an agent's harness runs it:
       * { call(tool, args) → the raw MCP tool result ({ content, isError? }), close() }. `args`: serve's flags; `source`:
       * the source the session writes to (GBRAIN_SOURCE: a stdio session may write to one source only).
       */
      const mcp = async (args = [], { source } = {}) => {
        const child = spawn(bun, ['run', join(src, 'src', 'cli.ts'), 'serve', ...args], { cwd: root,
          env: { ...inherited(), ...env, ...(source ? { GBRAIN_SOURCE: source } : {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
        const waiting = new Map();
        let buf = '', err = '', next = 1, ended = null;
        child.stderr.on('data', d => { err = (err + d).slice(-20_000); });
        child.stdout.on('data', d => {
          buf += d;
          for (let at; (at = buf.indexOf('\n')) >= 0;) {
            const line = buf.slice(0, at).trim();
            buf = buf.slice(at + 1);
            if (!line.startsWith('{')) continue;
            const msg = JSON.parse(line);
            if (msg.id !== undefined && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
          }
        });
        child.on('exit', code => { ended = code; for (const [, w] of waiting) w({ error: { message: `gbrain serve saiu (${code}):\n${err}` } }); waiting.clear(); });
        const rpc = (method, params) => new Promise((resolve, reject) => {
          if (ended !== null) return reject(new Error(`gbrain serve saiu (${ended}):\n${err}`));
          const id = next++;
          waiting.set(id, msg => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        });
        await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'archlens-test', version: '1' } });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
        return {
          call: (tool, a = {}) => rpc('tools/call', { name: tool, arguments: a }),
          list: () => rpc('tools/list', {}),
          close: () => new Promise(resolve => { if (ended !== null) return resolve(); child.on('exit', () => resolve()); child.stdin.end(); setTimeout(() => child.kill(), 5000).unref(); }),
        };
      };
      const version = gb('--version').trim();
      Object.assign(current, { src, home, repoBare, clone, source: SOURCE, version, gbrain, call, mcp, git, sync, schemaUse, addSource });
      return current;
    } catch (e) {
      gbrainEnv.down();
      throw e;
    }
  },

  /** Removes everything up() created. */
  down() {
    if (current) rmSync(current.root, { recursive: true, force: true });
    current = null;
  },
};
