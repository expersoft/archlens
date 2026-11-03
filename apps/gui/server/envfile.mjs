// .env support without dependencies (Node 18 has no process.loadEnvFile). Never touches process.env.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const configError = message => Object.assign(new Error(message), { code: 'E_GUI_CONFIG' });
const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const ESC = { n: '\n', '"': '"', '\\': '\\' };

// The value after `=`; null when malformed (quote not closed, junk after it).
function valueOf(raw) {
  const s = raw.trimStart();
  const q = s[0];
  if (q === "'") {
    const end = s.indexOf("'", 1);
    return end < 0 || !/^\s*(#.*)?$/.test(s.slice(end + 1)) ? null : s.slice(1, end);
  }
  if (q === '"') {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { out += ESC[s[i + 1]] ?? c + s[i + 1]; i++; }
      else if (c === '"') return /^\s*(#.*)?$/.test(s.slice(i + 1)) ? out : null;
      else out += c;
    }
    return null;
  }
  const hash = s.search(/\s#/);
  return (hash < 0 ? s : s.slice(0, hash)).trim();
}

/** @returns {Record<string,string>} one `KEY=value` per line; an invalid line names its number, never its text. */
export function parseEnv(text) {
  const env = {};
  String(text).split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) return;
    const m = LINE.exec(line);
    const v = m ? valueOf(m[2]) : null;
    if (v === null) throw configError(`arquivo .env: linha ${i + 1} inválida (esperado CHAVE=valor)`);
    env[m[1]] = v;
  });
  return env;
}

/**
 * The environment for the LLM provider: the .env file (`envFile`, or `<dir>/.env` when present) under the process
 * environment, which wins (dotenv convention; an empty variable counts as unset).
 * @returns {{ env: Record<string,string>, file: string | null }}
 */
export function loadEnv({ envFile, dir = process.cwd() } = {}) {
  let file = null;
  if (envFile) {
    file = resolve(dir, envFile);
    if (!existsSync(file)) throw configError(`arquivo .env não encontrado: ${file}`);
  } else if (existsSync(join(dir, '.env'))) file = join(dir, '.env');
  let env = {};
  if (file) {
    try { env = parseEnv(readFileSync(file, 'utf8')); }
    catch (e) { throw configError(e.code === 'E_GUI_CONFIG' ? `${file}: ${e.message}` : `não foi possível ler ${file}`); }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && v !== '') env[k] = v;
  return { env, file };
}

/** Warning when the file sits in a git repository that does not ignore it; null otherwise (or without git). */
export function envFileWarning(file) {
  const r = spawnSync('git', ['check-ignore', '-q', basename(file)], { cwd: dirname(resolve(file)), stdio: 'ignore' });
  return r.status === 1 ? `${file} não está no .gitignore; a chave pode ir para o repositório` : null;
}
