// The operations behind the plan/apply/show/query commands, over a store connector. Pure apart from reading the store.
import { basename } from 'node:path';
import { planMerge, applyPlan, hashRaw, openQuestions, canonicalJson, mergeError, PLAN_VERSION } from './merge.mjs';
import { diffRaw, contentVersion, applyOps } from './store/ops.mjs';
import { conflictError, short } from './store/contract.mjs';
import { storeError } from './store/errors.mjs';
import { previewModel, diffModels } from './preview.mjs';
import { validateModel } from './validate.mjs';
import { reportData, formatReport } from './plan-report.mjs';
import { viewAnswer, formatViewAnswer, elementCard, formatElementCard } from './query-md.mjs';
import { findCandidates } from './match.mjs';
import { normalizeModel } from './model.mjs';
import { suggestViews } from './suggest.mjs';

const EMPTY = { raw: null, notes: {} };

/** A plan of the current format that was already finalized. */
export const isFinal = doc => doc?.['archlens-plan'] === PLAN_VERSION && doc.state === 'final';

/**
 * `plan` with its store operations: applies the (fully answered) plan to the loaded base and adds `entry` and `ops`
 * (the last op is appendHistory; a plan that changes nothing has no ops and no entry). applyPlan's errors surface as they are.
 */
function finish(loaded, plan, today) {
  const res = applyPlan(loaded.raw, plan, { today });
  const ops = res.entry ? diffRaw(loaded.raw ? loaded : null, { raw: res.raw, notes: loaded.notes }) : [];
  return { ...plan, state: 'final', entry: res.entry, ops };
}

/**
 * The plan of `delta` against the store: open while it is blocked or has questions without a valid answer
 * (`answers`: key → resolution, from answersOf), final (with the ops that write it) otherwise.
 */
export function plan(store, delta, { answers, today } = {}) {
  const loaded = store.read() ?? EMPTY;
  const storeVersion = contentVersion(loaded); // same read as the content, so the plan's version matches it
  const planned = planMerge(loaded.raw, delta, { base: basename(store.locator.path), answers, storeVersion, today });
  if (planned.blocked || openQuestions(planned).length) return { plan: { ...planned, state: 'open' } };
  return { plan: finish(loaded, planned, today) };
}

/**
 * Turns a plan whose questions are all answered into a final one. Refuses a plan made against another store
 * version (E_STORE_CONFLICT); without a version, applyPlan checks the base hash.
 */
export function finalize(store, plan, { today } = {}) {
  const loaded = store.read() ?? EMPTY;
  const version = contentVersion(loaded);
  if ('storeVersion' in plan && plan.storeVersion !== version) throw conflictError(plan.storeVersion, version);
  return { plan: finish(loaded, plan, today) };
}

/** key → resolution of the answered items of a plan (open or final) and the delta they were given for. */
export function answersOf(doc, delta) {
  if (doc?.['archlens-plan'] !== PLAN_VERSION || !Array.isArray(doc.items)) {
    throw mergeError('E_PLAN_SCHEMA', 'o arquivo não é um plano do archlens (gere com "archlens merge --plan")');
  }
  return {
    answers: new Map(doc.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution])),
    delta: delta ?? doc.delta,
    otherDelta: delta !== undefined && canonicalJson(doc.delta) !== canonicalJson(delta),
  };
}

/**
 * The preview of a delta or a plan (open or final) against the store's current base, never written: `{ raw, preview,
 * warning? }`. A final plan is shown through its ops (what apply would write), an open one with its questions pending.
 * `warning` is set when the base changed after the plan.
 */
export function preview(store, { delta, plan } = {}) {
  if (!delta === !plan) throw mergeError('E_PREVIEW_INPUT', 'informe um delta ou um plano (e não os dois)');
  const loaded = store.read() ?? EMPTY;
  const doc = delta ?? plan;
  const stale = 'storeVersion' in doc ? doc.storeVersion !== contentVersion(loaded) : doc.baseHash && doc.baseHash !== hashRaw(loaded.raw);
  const warning = plan && stale ? 'a base mudou depois deste plano; a prévia usa a base atual' : undefined;
  let p;
  if (plan && isFinal(plan)) {
    const raw = applyOps(loaded, plan.ops).raw;
    p = diffModels(loaded.raw, structuredClone(raw), { deltaViews: plan.delta?.views });
    p.plan = plan;
  } else p = previewModel(loaded.raw, delta ? { delta } : { plan });
  return { raw: p.raw, preview: p, ...(warning ? { warning } : {}) };
}

/**
 * Writes a final plan through the connector, nothing else: the plan's ops, checked against the store version it was made
 * for. The merge is not replayed, so a hand-edited plan is only checked for the model it would leave.
 */
export function apply(store, plan) {
  if (plan?.['archlens-plan'] !== PLAN_VERSION) {
    throw mergeError('E_PLAN_SCHEMA', 'o arquivo não é um plano do archlens (gere com "archlens plan")');
  }
  const redo = 'archlens plan <base> --answers <plano> --out <novo>';
  if (!isFinal(plan)) {
    const open = openQuestions(plan);
    throw mergeError('E_PLAN_OPEN', open.length
      ? `o plano tem ${open.length} pergunta(s) sem resposta: item(ns) ${open.map(i => i.n).join(', ')}; responda e rode ${redo}`
      : `o plano está bloqueado por erros do delta; corrija o delta e rode ${redo}`);
  }
  if (!plan.ops.length) return { version: null, entry: null, preserved: [] };
  const stale = now => storeError('E_STORE_CONFLICT', `a base mudou depois do plano (${short(plan.storeVersion)} → ${short(now)}); `
    + `nada foi gravado. Refaça o plano reaproveitando as respostas: ${redo}`);
  const loaded = store.read();
  const version = contentVersion(loaded); // checked here too: against another base the model errors below would mislead
  if (version !== (plan.storeVersion ?? null)) throw stale(version);
  const errors = validateModel(applyOps(loaded, plan.ops).raw).errors;
  if (errors.length) {
    throw mergeError('E_MERGE_INVALID', `o resultado do plano é inválido (${errors.length} erro(s)); nada foi gravado`, { errors });
  }
  try {
    const { version: written, preserved } = store.apply(plan.ops, { baseVersion: plan.storeVersion ?? null });
    return { version: written, entry: plan.entry, preserved };
  } catch (e) {
    throw e.code === 'E_STORE_CONFLICT' ? stale(store.version()) : e; // changed between the read and the write
  }
}

/** The report of a plan (open or final) against the store's current base: markdown, or the structured data for `json`. Never writes. */
export function show(store, plan, { format = 'md' } = {}) {
  if (plan?.['archlens-plan'] !== PLAN_VERSION) {
    throw mergeError('E_PLAN_SCHEMA', 'o arquivo não é um plano do archlens (gere com "archlens plan")');
  }
  const loaded = store.read() ?? EMPTY;
  const data = reportData(loaded.raw, plan, preview(store, { plan }).preview, { currentVersion: contentVersion(loaded) });
  return format === 'json' ? data : formatReport(data);
}

/**
 * Answers a question about the base without writing it. Views (`view` keys, comma-separated, and/or `spec` objects):
 * markdown, or the structures for `json` (one view → the object, several → a list). `element` gives the card of one element,
 * read with `readSubgraph` (`depth` hops, over the relationship types in `via`); the whole base is read only to suggest names.
 */
export function query(store, { view, spec, element, depth = 1, via, format = 'md' } = {}) {
  if (element) return elementAnswer(store, { element, depth, via, format });
  const keys = view ? String(view).split(',') : [];
  const specs = spec == null ? [] : Array.isArray(spec) ? spec : [spec];
  if (!keys.length && !specs.length) {
    throw mergeError('E_QUERY_INPUT', 'informe --view <key>, --spec <json> ou --element <id>');
  }
  const loaded = store.read() ?? EMPTY;
  if (!loaded.raw) throw mergeError('E_QUERY_INPUT', 'a base está vazia ou não existe');
  const model = normalizeModel(loaded.raw);
  const picked = keys.map(k => {
    const found = model.views.find(v => v.key === k) ?? suggestViews(model).find(v => v.key === k);
    if (!found) throw Object.assign(new Error(`visão "${k}" não existe (veja "archlens views")`), { code: 'E_QUERY_VIEW' });
    return found;
  });
  const answers = [...picked, ...specs].map(sp => viewAnswer(model, sp));
  if (format === 'json') return answers.length === 1 ? answers[0] : answers;
  return answers.map(formatViewAnswer).join('\n');
}

/** Ids and names in the base that look like the unknown `id`, best first. */
function similarTo(raw, id) {
  const els = (raw?.model?.elements ?? []).filter(e => e && typeof e.id === 'string');
  const pool = els.map(e => ({ id: e.id, names: [e.id, e.name ?? e.id, ...(Array.isArray(e.aliases) ? e.aliases : [])], parent: e.parent ?? null, technology: e.technology, type: e.type ?? null }));
  const found = new Map();
  for (const type of new Set(pool.map(p => p.type))) {
    for (const c of findCandidates({ id, names: [id], parent: null, type }, pool)) found.set(c.id, c);
  }
  const name = new Map(els.map(e => [e.id, e.name ?? e.id]));
  return [...found.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 5).map(c => ({ ...c, name: name.get(c.id) }));
}

function elementAnswer(store, { element, depth, via, format }) {
  let sub;
  try {
    sub = store.readSubgraph({ seeds: [element], depth, ...(via?.length ? { via } : {}) });
  } catch (e) {
    if (e.code !== 'E_UNKNOWN_REF') throw e;
    const suggestions = similarTo(store.read()?.raw, element);
    const hint = suggestions.length ? `; quis dizer: ${suggestions.map(s => `${s.id} (${s.name})`).join(', ')}?` : '';
    throw Object.assign(new Error(`${e.message}${hint}`), { code: 'E_UNKNOWN_REF', suggestions });
  }
  const card = elementCard(sub, element, { history: store.history(), depth });
  return format === 'json' ? card : formatElementCard(card);
}
