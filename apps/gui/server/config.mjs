// GUI configuration: a JSON file listing the bases, or a single base given on the command line.
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { loadEnv } from './envfile.mjs';

export const DEFAULT_PORT = 5180;

const configError = message => Object.assign(new Error(message), { code: 'E_GUI_CONFIG' });

/** Each base needs a non-empty string id and path; ids are unique. */
function checkBases(list, file) {
  if (!Array.isArray(list)) throw configError(`${file}: "bases" deve ser uma lista`);
  const seen = new Set();
  list.forEach((b, i) => {
    const id = b && typeof b === 'object' && typeof b.id === 'string' ? b.id : null;
    const who = `${file}: base ${i + 1}${id ? ` ("${id}")` : ''}`;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw configError(`${who} deve ser um objeto com id e path`);
    if (!id || !id.trim()) throw configError(`${who} precisa de um id (texto não vazio)`);
    if (typeof b.path !== 'string' || !b.path.trim()) throw configError(`${who} precisa de um path (texto não vazio)`);
    if (seen.has(id)) throw configError(`${who}: id repetido`);
    seen.add(id);
  });
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const textMap = v => isObj(v) && Object.values(v).every(x => typeof x === 'string');

/** The `llm` block: provider, model, auth and limits checked; the API key itself is never a field. */
function checkLlm(llm) {
  if (!isObj(llm)) throw configError('llm deve ser um objeto');
  const bad = what => { throw configError(`llm: ${what}`); };
  if (!['anthropic', 'openai'].includes(llm.provider)) bad('provider deve ser "anthropic" ou "openai"');
  if (llm.provider === 'openai' && (typeof llm.model !== 'string' || !llm.model)) bad('o provedor openai exige model');
  if (llm.model !== undefined && typeof llm.model !== 'string') bad('model deve ser texto');
  if (llm.endpoint !== undefined && typeof llm.endpoint !== 'string') bad('endpoint deve ser texto');
  if (llm.apiKeyEnv !== undefined && typeof llm.apiKeyEnv !== 'string') bad('apiKeyEnv deve ser texto');
  const a = llm.auth;
  if (a !== undefined && !['x-api-key', 'bearer', 'none'].includes(a) && !(isObj(a) && typeof a.header === 'string' && a.header)) {
    bad('auth deve ser "x-api-key", "bearer", "none" ou { header }');
  }
  for (const k of ['headers', 'headersEnv', 'query']) if (llm[k] !== undefined && !textMap(llm[k])) bad(`${k} deve ser um objeto de textos`);
  if (llm.tools !== undefined && typeof llm.tools !== 'boolean') bad('tools deve ser verdadeiro ou falso');
  if (llm.effort !== undefined && (typeof llm.effort !== 'string' || !llm.effort)) bad('effort deve ser texto (ex.: "low", "medium", "high")');
  if (llm.maxRounds !== undefined && !(Number.isInteger(llm.maxRounds) && llm.maxRounds >= 1 && llm.maxRounds <= 10)) bad('maxRounds deve ser um inteiro de 1 a 10');
  if (llm.timeoutMs !== undefined && !(Number.isInteger(llm.timeoutMs) && llm.timeoutMs >= 1000 && llm.timeoutMs <= 300000)) bad('timeoutMs deve ser um inteiro de 1000 a 300000');
  return llm;
}

function checkTelemetry(t, dir) {
  if (!isObj(t)) throw configError('telemetry deve ser um objeto');
  if (t.file !== undefined && (typeof t.file !== 'string' || !t.file)) throw configError('telemetry.file deve ser texto');
  if (t.questions !== undefined && typeof t.questions !== 'boolean') throw configError('telemetry.questions deve ser verdadeiro ou falso');
  return { ...(t.file ? { file: resolve(dir, t.file) } : {}), ...(t.questions !== undefined ? { questions: t.questions } : {}) };
}

/**
 * The LLM part: `llm` + the environment for the provider (process env over the .env file). Without `llm` nothing is
 * read: the text search is opt-in.
 */
function llmPart(llm, envFile, dir, source) {
  if (!llm) return {};
  const { env, file } = loadEnv({ envFile, dir });
  return { llm: checkLlm(llm), llmSource: source, env, envFile: file };
}

/** @returns {{ port: number, bases: { id: string, name?: string, path: string }[], llm?: object, llmSource?: 'cli'|'file', env?: object, envFile?: string|null, telemetry?: object }} */
export function loadConfig({ file, base, port, host, llm, envFile } = {}) {
  if (file) {
    const abs = resolve(file);
    const dir = dirname(abs);
    const cfg = JSON.parse(readFileSync(abs, 'utf8'));
    checkBases(cfg.bases ?? [], file);
    const bases = (cfg.bases ?? []).map(b => ({
      id: b.id,
      ...(b.name ? { name: b.name } : {}),
      path: resolve(dir, b.path),
    }));
    const h = host ?? cfg.host;
    if (cfg.envFile !== undefined && typeof cfg.envFile !== 'string') throw configError('envFile deve ser texto');
    const ef = envFile ? resolve(envFile) : cfg.envFile ? resolve(dir, cfg.envFile) : undefined;
    return {
      port: port ?? cfg.port ?? DEFAULT_PORT, ...(h ? { host: h } : {}), bases,
      ...llmPart(llm ?? cfg.llm, ef, dir, llm ? 'cli' : 'file'),
      ...(cfg.telemetry !== undefined ? { telemetry: checkTelemetry(cfg.telemetry, dir) } : {}),
    };
  }
  const common = { port: port ?? DEFAULT_PORT, ...(host ? { host } : {}) };
  const llmCfg = llmPart(llm, envFile ? resolve(envFile) : undefined, process.cwd(), 'cli');
  if (base) {
    const abs = resolve(base);
    return { ...common, bases: [{ id: basename(abs), path: abs }], ...llmCfg };
  }
  return { ...common, bases: [], ...llmCfg };
}
