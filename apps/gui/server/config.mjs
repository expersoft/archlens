// GUI configuration: a JSON file listing the bases, or a single base given on the command line.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';
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
  if (llm.maxHistory !== undefined && !(Number.isInteger(llm.maxHistory) && llm.maxHistory >= 0 && llm.maxHistory <= 50)) bad('maxHistory deve ser um inteiro de 0 a 50');
  if (llm.timeoutMs !== undefined && !(Number.isInteger(llm.timeoutMs) && llm.timeoutMs >= 1000 && llm.timeoutMs <= 300000)) bad('timeoutMs deve ser um inteiro de 1000 a 300000');
  return llm;
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** The `plan` block (`true` or an object): defaults filled, ranges checked; it needs an `llm`. Returns null when off. */
function checkPlan(plan, hasLlm) {
  if (plan === undefined || plan === false) return null;
  if (plan !== true && !isObj(plan)) throw configError('plan deve ser verdadeiro ou um objeto');
  const p = plan === true ? {} : plan;
  const bad = what => { throw configError(`plan: ${what}`); };
  if (!hasLlm) bad('plan exige llm (configure "llm" ou use --llm)');
  if (p.maxRounds !== undefined && !inRange(p.maxRounds, 1, 100)) bad('maxRounds deve ser um inteiro de 1 a 100');
  if (p.timeoutMs !== undefined && !inRange(p.timeoutMs, 10000, 1800000)) bad('timeoutMs deve ser um inteiro de 10000 a 1800000');
  if (p.maxTokens !== undefined && !(Number.isInteger(p.maxTokens) && p.maxTokens >= 1)) bad('maxTokens deve ser um inteiro positivo');
  if (p.gitTokenEnv !== undefined && (typeof p.gitTokenEnv !== 'string' || !p.gitTokenEnv)) bad('gitTokenEnv deve ser texto (nome da variável de ambiente)');
  if (p.gitUser !== undefined && (typeof p.gitUser !== 'string' || !p.gitUser.trim())) bad('gitUser deve ser texto não vazio');
  if (p.cloneTimeoutMs !== undefined && !inRange(p.cloneTimeoutMs, 1000, 1800000)) bad('cloneTimeoutMs deve ser um inteiro de 1000 a 1800000');
  if (p.cloneMaxMb !== undefined && !inRange(p.cloneMaxMb, 1, 10000)) bad('cloneMaxMb deve ser um inteiro de 1 a 10000');
  // The token goes only to these hosts (never to whatever host a GUI user names).
  if (p.gitTokenHosts !== undefined && !(Array.isArray(p.gitTokenHosts) && p.gitTokenHosts.length && p.gitTokenHosts.every(h => typeof h === 'string' && HOSTNAME.test(h)))) {
    bad('gitTokenHosts deve ser uma lista de nomes de host (minúsculos, sem esquema), como ["github.com"]');
  }
  if (p.gitTokenEnv !== undefined && p.gitTokenHosts === undefined) throw configError('plan.gitTokenHosts é obrigatório com plan.gitTokenEnv');
  if (p.allowFileUrls !== undefined && typeof p.allowFileUrls !== 'boolean') bad('allowFileUrls deve ser verdadeiro ou falso');
  return {
    maxRounds: p.maxRounds ?? 40, timeoutMs: p.timeoutMs ?? 600000, maxTokens: p.maxTokens ?? 400000,
    ...(p.gitTokenEnv !== undefined ? { gitTokenEnv: p.gitTokenEnv, gitTokenHosts: p.gitTokenHosts } : {}),
    gitUser: p.gitUser ?? 'x-access-token', cloneTimeoutMs: p.cloneTimeoutMs ?? 120000, cloneMaxMb: p.cloneMaxMb ?? 200,
    allowFileUrls: p.allowFileUrls ?? false,
  };
}

/** The plan part: `plan` + where it came from, only when planning is on. */
function planPart(plan, llmCfg, source) {
  const checked = checkPlan(plan, !!llmCfg.llm);
  return checked ? { plan: checked, planSource: source } : {};
}

function checkTelemetry(t, dir) {
  if (!isObj(t)) throw configError('telemetry deve ser um objeto');
  if (t.file !== undefined && (typeof t.file !== 'string' || !t.file)) throw configError('telemetry.file deve ser texto');
  if (t.questions !== undefined && typeof t.questions !== 'boolean') throw configError('telemetry.questions deve ser verdadeiro ou falso');
  return { ...(t.file ? { file: resolve(dir, t.file) } : {}), ...(t.questions !== undefined ? { questions: t.questions } : {}) };
}

const LOGO_EXT = new Set(['.svg', '.png', '.webp']);
const LOGO_MAX = 1024 * 1024;

/** The `brand` block: company logo (and an optional dark-theme one) inside the config file's folder; absolute paths out. */
function checkBrand(brand, dir) {
  if (!isObj(brand)) throw configError('brand deve ser um objeto');
  if (brand.name !== undefined && (typeof brand.name !== 'string' || !brand.name.trim())) throw configError('brand.name deve ser texto não vazio');
  const one = (key, required) => {
    const v = brand[key];
    if (v === undefined && !required) return undefined;
    if (typeof v !== 'string' || !v.trim()) throw configError(required ? `brand.${key} é obrigatório` : `brand.${key}, se informado, precisa ser um caminho`);
    const lexical = resolve(dir, v);
    const inside = (p, root) => p.startsWith(root.endsWith(sep) ? root : root + sep);
    if (!inside(lexical, resolve(dir))) throw configError(`brand.${key} precisa ficar dentro da pasta do archlens-gui.json`);
    const abs = lexical;
    if (!LOGO_EXT.has(extname(abs).toLowerCase())) throw configError(`brand.${key}: use .svg, .png ou .webp`);
    let real, st;
    try { real = realpathSync(abs); st = statSync(real); } catch { throw configError(`brand.${key}: arquivo não encontrado: ${abs}`); }
    if (!st.isFile()) throw configError(`brand.${key}: arquivo não encontrado: ${abs}`);
    // A link inside the folder must not lead out of it.
    if (!inside(real, realpathSync(dir))) throw configError(`brand.${key} precisa ficar dentro da pasta do archlens-gui.json`);
    if (st.size > LOGO_MAX) throw configError(`brand.${key} passa de 1 MB`);
    return real;
  };
  const logo = one('logo', true);
  const logoDark = one('logoDark', false);
  return { logo, ...(logoDark ? { logoDark } : {}), ...(brand.name ? { name: brand.name } : {}) };
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

/** @returns {{ port: number, bases: { id: string, name?: string, path: string }[], llm?: object, llmSource?: 'cli'|'file', plan?: object, planSource?: 'cli'|'file', env?: object, envFile?: string|null, telemetry?: object }} */
export function loadConfig({ file, base, port, host, llm, envFile, plan } = {}) {
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
    const llmCfg = llmPart(llm ?? cfg.llm, ef, dir, llm ? 'cli' : 'file');
    return {
      port: port ?? cfg.port ?? DEFAULT_PORT, ...(h ? { host: h } : {}), bases,
      ...llmCfg,
      ...(plan ? planPart(isObj(cfg.plan) ? cfg.plan : true, llmCfg, 'cli') : planPart(cfg.plan, llmCfg, 'file')),
      ...(cfg.brand !== undefined ? { brand: checkBrand(cfg.brand, dir) } : {}),
      ...(cfg.telemetry !== undefined ? { telemetry: checkTelemetry(cfg.telemetry, dir) } : {}),
    };
  }
  const common = { port: port ?? DEFAULT_PORT, ...(host ? { host } : {}) };
  const llmCfg = llmPart(llm, envFile ? resolve(envFile) : undefined, process.cwd(), 'cli');
  const planCfg = planPart(plan ? true : undefined, llmCfg, 'cli');
  if (base) {
    const abs = resolve(base);
    return { ...common, bases: [{ id: basename(abs), path: abs }], ...llmCfg, ...planCfg };
  }
  return { ...common, bases: [], ...llmCfg, ...planCfg };
}
