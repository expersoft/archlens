// The planning draft (archlens-draft): the delta, the plan's answers and the attached repository, saved and restored by the user.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { plan as planDelta, answersOf, isFinal } from '../../../../scripts/lib/api.mjs';

export const DRAFT_VERSION = '1.0';
export const DRAFT_MAX_BYTES = 2_000_000;

const FIELDS = ['archlens-draft', 'base', 'archlens', 'delta', 'plan', 'note', 'repo', 'usage'];
const archlensVersion = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')).version;

const draftError = message => Object.assign(new Error(message), { code: 'E_GUI_DRAFT' });
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function newDraft(ctx) {
  return { 'archlens-draft': DRAFT_VERSION, base: { id: ctx.id, version: ctx.version }, archlens: archlensVersion, delta: null, plan: null, note: '', repo: null, usage: { tokens: 0 } };
}

/** The URL itself when it carries no credential (`https://user:pass@h`, `https://token@h`). */
export function cleanRepoUrl(url) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u) throw draftError('o rascunho tem um repositório sem URL');
  // A bare user in ssh:// (git@host) is no secret; any http(s) userinfo and ssh user:pass are.
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)@/i.exec(u);
  if (m && (m[1].toLowerCase() !== 'ssh' || m[2].includes(':'))) {
    throw draftError('a URL do repositório não pode ter credencial embutida; use o token do ambiente (.env)');
  }
  return u;
}

/** Validates a draft read from a file against the open base; the plan is kept only for its answers (replanDraft redoes it). */
export function checkDraft(obj, ctx) {
  if (!isObject(obj)) throw draftError('o arquivo não é um rascunho do archlens');
  if (Buffer.byteLength(JSON.stringify(obj)) > DRAFT_MAX_BYTES) throw draftError('o rascunho é grande demais');
  if (obj['archlens-draft'] !== DRAFT_VERSION) throw draftError(`versão de rascunho desconhecida: ${obj['archlens-draft']}`);
  const extra = Object.keys(obj).filter(k => !FIELDS.includes(k));
  if (extra.length) throw draftError(`campos desconhecidos no rascunho: ${extra.join(', ')}`);
  if (!isObject(obj.base) || typeof obj.base.id !== 'string' || typeof obj.base.version !== 'string') throw draftError('rascunho sem a base de origem');
  if (obj.base.id !== ctx.id) throw draftError(`este rascunho é da base "${obj.base.id}"`);
  if (typeof obj.archlens !== 'string') throw draftError('rascunho sem a versão do archlens');
  if (typeof obj.note !== 'string') throw draftError('a nota do rascunho precisa ser texto');
  if (obj.delta !== null) {
    if (!isObject(obj.delta)) throw draftError('o delta do rascunho é inválido');
    try { planDelta(ctx.store, obj.delta); } catch (e) { throw draftError(`o delta do rascunho é inválido: ${e.message}`); }
  }
  if (obj.plan !== null) {
    if (obj.delta === null) throw draftError('o rascunho tem plano sem delta');
    if (!isObject(obj.plan)) throw draftError('o plano do rascunho é inválido');
    try { answersOf(obj.plan, obj.delta); } catch (e) { throw draftError(`o plano do rascunho é inválido: ${e.message}`); }
  }
  if (obj.usage !== undefined && (!isObject(obj.usage) || !Number.isInteger(obj.usage.tokens) || obj.usage.tokens < 0)) {
    throw draftError('o consumo do rascunho é inválido');
  }
  let repo = null;
  if (obj.repo !== null) {
    if (!isObject(obj.repo) || typeof obj.repo.commit !== 'string' || (obj.repo.ref !== undefined && typeof obj.repo.ref !== 'string')) {
      throw draftError('o repositório do rascunho é inválido');
    }
    repo = { url: cleanRepoUrl(obj.repo.url), ...(obj.repo.ref === undefined ? {} : { ref: obj.repo.ref }), commit: obj.repo.commit };
  }
  return { ...obj, repo };
}

/** Plans the draft's delta again over the current base with the answers it already has; `warning` when the base changed. */
export function replanDraft(ctx, draft) {
  const warning = draft.base.version !== ctx.version
    ? 'a base mudou desde este rascunho; o plano foi refeito contra a base atual' : undefined;
  const base = { id: ctx.id, version: ctx.version };
  if (draft.delta === null) return { draft: { ...draft, base, plan: null }, warning };
  const answers = draft.plan ? answersOf(draft.plan, draft.delta).answers : undefined;
  const { plan } = planDelta(ctx.store, draft.delta, { answers });
  return { draft: { ...draft, base, plan }, warning };
}

/** The hash of a plan's store operations: what the user confirms before the apply. */
export const hashOps = ops => createHash('sha256').update(JSON.stringify(ops)).digest('hex');

/** `hashOps` of the draft's plan when it is final, else null. */
export const opsHashOf = plan => (isFinal(plan) ? hashOps(plan.ops) : null);
