#!/usr/bin/env node
// Demo of a shared base in gbrain (git mode): a local gbrain run from its source, a git repository as the team's
// remote, and the loja-online base converted into it. Everything is created in .demo/ next to this file (ignored by
// git): nothing global is installed and ~/.gbrain is never touched.
//
//   node examples/loja-online-gbrain/setup.mjs            sets it up (once)
//   node examples/loja-online-gbrain/setup.mjs gbrain …   runs the demo's gbrain (e.g. call list_pages '{"tag":"archlens"}')
//   node examples/loja-online-gbrain/setup.mjs sync       makes gbrain import what archlens pushed (sources refresh)
//   node examples/loja-online-gbrain/setup.mjs down       removes .demo/, architecture/ and ARCHITECTURE.md
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GBRAIN_REPO, GBRAIN_REF, findBun } from '../../scripts/test-env/gbrain-env.mjs';

const EX = dirname(fileURLToPath(import.meta.url));
const ROOT = join(EX, '..', '..');
const DEMO = join(EX, '.demo');
const SRC = join(DEMO, 'gbrain');
const HOME = join(DEMO, 'home');
const BARE = join(DEMO, 'arquitetura.git');
const SOURCE_DIR = join(DEMO, 'gbrain-source');
const CLONE = join(DEMO, 'meu-clone');
const BASE = join(EX, 'architecture');
const SOURCE = 'arquitetura';

// What gbrain inherits, without what would point it to another brain or a paid provider.
const inherited = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GBRAIN_|DATABASE_URL$|^(VOYAGE|OPENAI|ANTHROPIC|GOOGLE|GEMINI)_/.test(k)));
const GB_ENV = { GBRAIN_HOME: HOME, HOME, NO_COLOR: '1' };

function run(cmd, args, { cwd = EX, env = {}, inherit = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...inherited(), ...env }, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`setup: ${cmd} ${args.join(' ')} falhou (${r.status})\n${r.stderr ?? ''}${r.stdout ?? ''}${r.error ? r.error.message : ''}`);
    process.exit(1);
  }
  return r.stdout ?? '';
}
const git = (cwd, ...args) => run('git', ['-C', cwd, ...args]);
const bun = () => findBun() ?? (console.error('setup: o bun não está no PATH (https://bun.sh)'), process.exit(1));
const gbrain = (args, opts = {}) => run(bun(), ['run', join(SRC, 'src', 'cli.ts'), ...args], { env: GB_ENV, ...opts });
const archlens = (...args) => run(process.execPath, [join(ROOT, 'scripts', 'archlens.mjs'), ...args], { inherit: true });

function setup() {
  if (existsSync(HOME)) {
    console.log(`já montado em ${DEMO}; para recomeçar: node ${join('examples', 'loja-online-gbrain', 'setup.mjs')} down`);
    return;
  }
  mkdirSync(DEMO, { recursive: true });
  console.log(`1/6 gbrain ${GBRAIN_REF.slice(0, 7)} (código-fonte) em .demo/gbrain`);
  mkdirSync(SRC, { recursive: true });
  git(SRC, 'init', '-q');
  git(SRC, 'remote', 'add', 'origin', GBRAIN_REPO);
  git(SRC, 'fetch', '-q', '--depth', '1', 'origin', GBRAIN_REF);
  git(SRC, 'checkout', '-q', 'FETCH_HEAD');
  // Without lifecycle scripts: gbrain's postinstall migrates whatever `gbrain` is on the PATH.
  mkdirSync(HOME, { recursive: true });
  run(bun(), ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: SRC, env: GB_ENV });

  console.log('2/6 cérebro PGLite (sem embeddings) em .demo/home');
  gbrain(['init', '--pglite', '--no-embedding', '--git']); // --git: its content folder gets a repository of its own (we are inside the archlens one)
  gbrain(['config', 'set', 'self_upgrade.mode', 'off']);

  console.log('3/6 repositório do time (.demo/arquitetura.git) e a cópia que o gbrain sincroniza');
  git(DEMO, 'init', '-q', '--bare', '-b', 'main', BARE);
  const seed = join(DEMO, 'seed');
  git(DEMO, 'clone', '-q', BARE, seed);
  writeFileSync(join(seed, 'README.md'), '# Arquitetura (demonstração do archlens)\n');
  git(seed, 'add', 'README.md');
  git(seed, '-c', 'user.name=archlens demo', '-c', 'user.email=demo@example.com', 'commit', '-q', '-m', 'início');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  rmSync(seed, { recursive: true, force: true });
  git(DEMO, 'clone', '-q', BARE, SOURCE_DIR);
  gbrain(['sources', 'add', SOURCE, '--path', SOURCE_DIR, '--no-federated', '--no-harden']);

  console.log('4/6 o clone de quem usa o archlens (.demo/meu-clone)');
  git(DEMO, 'clone', '-q', BARE, CLONE);
  git(CLONE, 'config', 'user.name', 'Arquiteta (demo)');
  git(CLONE, 'config', 'user.email', 'arquiteta@example.com');

  console.log('5/6 a base loja-online convertida para o gbrain (um commit, push para o repositório do time)');
  cpSync(join(EX, '..', 'loja-online', 'architecture'), BASE, { recursive: true });
  archlens('store', 'convert', BASE, '--to', 'gbrain', '--mode', 'git', '--repo', CLONE);

  console.log('6/6 schema pack do archlens ativo no gbrain e sincronização');
  const pack = git(BARE, 'show', 'main:archlens/gbrain-pack.yaml');
  mkdirSync(join(HOME, '.gbrain', 'schema-packs', 'archlens'), { recursive: true });
  writeFileSync(join(HOME, '.gbrain', 'schema-packs', 'archlens', 'pack.yaml'), pack);
  gbrain(['schema', 'use', 'archlens']);
  sync();
  console.log(`\npronto. Consulte pelo archlens (node scripts/archlens.mjs query ${join('examples', 'loja-online-gbrain', 'architecture')} --element loja.pedidos)`);
  console.log(`ou pelo gbrain (node ${join('examples', 'loja-online-gbrain', 'setup.mjs')} gbrain call list_pages '{"tag":"archlens","limit":5}'); veja o README.md`);
}

const sync = () => gbrain(['sources', 'refresh', SOURCE]);

const [cmd = 'setup', ...rest] = process.argv.slice(2);
if (cmd === 'setup') setup();
else if (cmd === 'sync') { sync(); console.log('gbrain sincronizado com o repositório do time'); }
else if (cmd === 'gbrain') {
  if (!existsSync(HOME)) { console.error('setup: monte antes com "node examples/loja-online-gbrain/setup.mjs"'); process.exit(1); }
  const r = spawnSync(bun(), ['run', join(SRC, 'src', 'cli.ts'), ...rest], { cwd: EX, env: { ...inherited(), ...GB_ENV }, stdio: 'inherit' });
  process.exit(r.status ?? 1);
} else if (cmd === 'down') {
  if (existsSync(CLONE)) spawnSync('git', ['-C', CLONE, 'worktree', 'remove', '--force', join(BASE, '.archlens', 'tip')], { stdio: 'ignore' });
  for (const p of [DEMO, BASE, join(EX, 'ARCHITECTURE.md')]) rmSync(p, { recursive: true, force: true });
  console.log('removido: .demo/, architecture/ e ARCHITECTURE.md');
} else {
  console.error('uso: setup.mjs [setup | sync | gbrain <args…> | down]');
  process.exit(1);
}
