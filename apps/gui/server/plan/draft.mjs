// The planning draft (archlens-draft): the delta, the screen edits, the plan's answers and the attached repository, saved
// and restored by the user.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { plan as planDelta, answersOf, isFinal } from '../../../../scripts/lib/api.mjs';
import { checkEdits, composeDelta, screenAnswers, screenConflicts, findDeltaElement } from './edits.mjs';

export const DRAFT_VERSION = '1.0';
export const DRAFT_MAX_BYTES = 2_000_000;

const FIELDS = ['archlens-draft', 'base', 'archlens', 'delta', 'plan', 'note', 'repo', 'usage', 'edits', 'kept'];
const archlensVersion = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')).version;

/** The draft's size as the cap measures it: without the plan, which the server always plans again. */
export const draftBytes = draft => Buffer.byteLength(JSON.stringify({ ...draft, plan: null }));
export const TOO_BIG = 'o rascunho é grande demais';

const draftError = message => Object.assign(new Error(message), { code: 'E_GUI_DRAFT' });
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function newDraft(ctx) {
  return { 'archlens-draft': DRAFT_VERSION, base: { id: ctx.id, version: ctx.version }, archlens: archlensVersion, delta: null, plan: null, note: '', repo: null, usage: { tokens: 0 }, edits: {}, kept: [] };
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
  if (draftBytes(obj) > DRAFT_MAX_BYTES) throw draftError(TOO_BIG);
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
  const { edits, kept } = checkEdits(obj.edits, obj.kept);
  if (obj.plan !== null) {
    if (obj.delta === null && !Object.keys(edits).length) throw draftError('o rascunho tem plano sem delta');
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
  return { ...obj, repo, edits, kept };
}

/**
 * Ids whose screen edits are dropped: nodes the agent's delta removes (from its plan, cascade included) and nodes that
 * are neither in the base nor in the agent's delta (new nodes the chat stopped proposing).
 */
function removedIds(ctx, delta, edits, answers) {
  const out = new Set();
  const ids = Object.keys(edits);
  if (!ids.length) return out;
  if (delta?.ops?.some(o => o?.op === 'remove')) {
    for (const it of planDelta(ctx.store, delta, { answers }).plan.items) {
      if (it.class !== 'op' || it.op !== 'remove' || it.resolution === 'no') continue;
      for (const id of it.cascade?.elements?.length ? it.cascade.elements : [it.target]) out.add(id);
    }
  }
  for (const id of ids) {
    if (!ctx.model?.elements?.has?.(id) && !findDeltaElement(delta, id)) out.add(id);
  }
  return out;
}

/**
 * Plans the agent's delta with the screen edits on top again over the current base, with the answers it already has
 * plus `take` for the questions an edit answers; `warning` when the base changed.
 */
export function replanDraft(ctx, draft) {
  const warning = draft.base.version !== ctx.version
    ? 'a base mudou desde este rascunho; o plano foi refeito contra a base atual' : undefined;
  const base = { id: ctx.id, version: ctx.version };
  const edits = draft.edits ?? {};
  const answers = draft.plan ? answersOf(draft.plan, draft.delta).answers : new Map();
  const delta = composeDelta(draft.delta, edits, removedIds(ctx, draft.delta, edits, answers));
  if (delta === null) return { draft: { ...draft, base, plan: null }, warning };
  let { plan } = planDelta(ctx.store, delta, { answers });
  const screen = Object.entries(screenAnswers(plan, edits)).filter(([k, r]) => answers.get(k) !== r);
  if (screen.length) ({ plan } = planDelta(ctx.store, delta, { answers: new Map([...answers, ...screen]) }));
  return { draft: { ...draft, base, plan }, warning };
}

/** The ops hash the user confirms before the apply: null while a question or a chat × screen conflict is pending. */
export function draftOpsHash(draft) {
  if (!draft.plan) return null;
  if (screenConflicts(draft.delta, draft.edits ?? {}, draft.kept ?? []).length) return null;
  return opsHashOf(draft.plan);
}

/** The hash of a plan's store operations: what the user confirms before the apply. */
export const hashOps = ops => createHash('sha256').update(JSON.stringify(ops)).digest('hex');

/** `hashOps` of the draft's plan when it is final, else null. */
export const opsHashOf = plan => (isFinal(plan) ? hashOps(plan.ops) : null);
