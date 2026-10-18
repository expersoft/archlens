// The `store` entry of archlens.json: which repository holds the base. validateStore checks it, initBase writes a new base.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FORMAT } from '../canonical.mjs';
import { storeError } from './errors.mjs';
import { MANIFEST } from './folder.mjs';

const CREDENTIAL_KEY = /credential|token|password/i;
/** kind → mode → { required, defaults, optional } fields; "json" and "markdown" take no mode. */
const SHAPES = {
  json: { fields: {} },
  markdown: { fields: {} },
  gbrain: {
    modes: {
      git: { required: ['repo'], defaults: { remote: 'origin', branch: 'main', prefix: 'archlens' } },
      mcp: { required: ['server'], optional: ['sourceId'], defaults: { prefix: 'archlens' } },
    },
  },
};
const bad = why => storeError('E_STORE_CONFIG', `"store" em ${MANIFEST}: ${why}`);

/** Keys that look like credentials, at any depth. */
function credentialKey(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(k)) return k;
    const deep = credentialKey(v);
    if (deep) return deep;
  }
  return null;
}

/** `store` with the defaults filled in, or E_STORE_CONFIG (missing or unknown fields, credentials, wrong types). */
export function validateStore(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) throw bad(`deve ser um objeto como { "kind": "json" } (recebido ${JSON.stringify(store)})`);
  const secret = credentialKey(store);
  if (secret) throw bad(`"${secret}" não é aceito: o archlens.json não guarda credenciais (use o ambiente do MCP ou do git)`);
  const kind = store.kind ?? 'json';
  const shape = SHAPES[kind];
  if (!shape) throw bad(`"kind" ${JSON.stringify(kind)} desconhecido (use ${Object.keys(SHAPES).join(', ')})`);
  let mode = null;
  let allowed = ['kind'];
  let defaults = {};
  let required = [];
  if (shape.modes) {
    mode = store.mode;
    const m = shape.modes[mode];
    if (!m) throw bad(`"mode" é obrigatório em ${kind}: ${Object.keys(shape.modes).join(' ou ')} (recebido ${JSON.stringify(mode)})`);
    ({ required, defaults } = m);
    allowed = ['kind', 'mode', ...required, ...(m.optional ?? []), ...Object.keys(defaults)];
  }
  const extra = Object.keys(store).filter(k => !allowed.includes(k));
  if (extra.length) throw bad(`campo(s) não aceito(s) em ${kind}${mode ? ` (${mode})` : ''}: ${extra.join(', ')}`);
  for (const k of required) if (typeof store[k] !== 'string' || !store[k]) throw bad(`"${k}" é obrigatório em ${kind} (${mode})`);
  const out = { kind, ...(mode ? { mode } : {}) };
  for (const k of allowed.slice(mode ? 2 : 1)) {
    const v = store[k] ?? defaults[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !v) throw bad(`"${k}" deve ser um texto não vazio`);
    out[k] = v;
  }
  return out;
}

const git = (repo, args, opts = {}) => spawnSync('git', ['-C', repo, ...args], {
  encoding: 'utf8', timeout: 15000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...opts,
});

/**
 * Read-only checks of the git repository: a clone that has the remote (E_STORE_GIT otherwise). Whether the branch
 * exists on the remote needs the network, so a failure there is a warning. Returns the warnings.
 */
export function probeGitRepo({ repo, remote, branch }) {
  const fail = why => storeError('E_STORE_GIT', `${repo}: ${why}`);
  if (!existsSync(repo)) throw fail('pasta não encontrada (informe o caminho de um clone do repositório do gbrain)');
  const inside = git(repo, ['rev-parse', '--is-inside-work-tree']);
  if (inside.error?.code === 'ENOENT') throw fail('git não encontrado no PATH');
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') throw fail('não é um clone git (o archlens não clona; clone o repositório antes)');
  const url = git(repo, ['remote', 'get-url', remote]);
  if (url.status !== 0) throw fail(`o clone não tem o remote "${remote}"`);
  const heads = git(repo, ['ls-remote', '--heads', remote, branch]);
  if (heads.status !== 0) return [`não consegui consultar o remote "${remote}" (sem rede ou sem acesso?); a branch "${branch}" não foi conferida`];
  if (!heads.stdout.trim()) return [`o remote "${remote}" não tem a branch "${branch}"`];
  return [];
}

/** Adds ".archlens/" (the local mirror of an MCP base) to <dir>/.gitignore, keeping what is there. */
function ignoreMirror(dir) {
  const path = join(dir, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (text.split(/\r?\n/).some(l => l.trim() === '.archlens/')) return;
  writeFileSync(path, `${text}${text && !text.endsWith('\n') ? '\n' : ''}.archlens/\n`);
}

/**
 * Creates the base's archlens.json (and .gitignore) in `dir`; returns its path. A relative `repo` is relative to `dir`.
 * E_STORE_EXISTS when `dir` already holds a base; `warn(text)` gets the checks that could not be made.
 */
export function initBase(dir, { name, store, warn = () => {} }) {
  const path = join(dir, MANIFEST);
  if (existsSync(path)) throw storeError('E_STORE_EXISTS', `${dir} já tem uma base (${MANIFEST}); para mudar o conector use "archlens store convert"`);
  const valid = validateStore(store);
  if (valid.kind === 'gbrain' && valid.mode === 'git') for (const w of probeGitRepo({ ...valid, repo: resolve(dir, valid.repo) })) warn(w);
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ archlens: FORMAT, name, store: valid }, null, 2) + '\n');
  renameSync(tmp, path);
  ignoreMirror(dir);
  return path;
}
