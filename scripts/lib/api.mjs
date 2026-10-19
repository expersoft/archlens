// The operations behind the plan/apply/show/query commands, over a store connector. Pure apart from reading the store.
import { basename } from 'node:path';
import { planMerge, applyPlan, hashRaw, openQuestions, canonicalJson, mergeError, describe, PLAN_VERSION } from './merge.mjs';
import { diffRaw, contentVersion, applyOps } from './store/ops.mjs';
import { writeSetOf, objectVersionsOf, checkExpect } from './store/versions.mjs';
import { conflictError, short, appendedEntry } from './store/contract.mjs';
import { storeError } from './store/errors.mjs';
import { previewModel, diffModels } from './preview.mjs';
import { validateModel } from './validate.mjs';
import { reportData, formatReport } from './plan-report.mjs';
import { viewAnswer, formatViewAnswer, elementCard, formatElementCard } from './query-md.mjs';
import { findCandidates } from './match.mjs';
import { normalizeModel } from './model.mjs';
import { suggestViews } from './suggest.mjs';
import { indexTree } from './raw-tree.mjs';

const EMPTY = { raw: null, notes: {} };

/** A plan of the current format that was already finalized. */
export const isFinal = doc => doc?.['archlens-plan'] === PLAN_VERSION && doc.state === 'final' && Array.isArray(doc.ops);

/**
 * `plan` with its store operations: applies the (fully answered) plan to the loaded base and adds `entry` and `ops`
 * (the last op is appendHistory; a plan that changes nothing has no ops and no entry). applyPlan's errors surface as they are.
 * Also `objects`, the version in `loaded` of each object the merge read or the ops write (what apply checks), and
 * `knownCandidates`, the possible duplicates each new element already had.
 */
function finish(store, loaded, plan, today) {
  const res = applyPlan(loaded.raw, plan, { today });
  const ops = res.entry ? diffRaw(loaded.raw ? loaded : null, { raw: res.raw, notes: loaded.notes }) : [];
  const refs = [...new Set([...res.read, ...writeSetOf(ops, loaded)])].sort();
  const versions = store.objectVersions?.(refs, loaded) ?? objectVersionsOf(loaded, refs);
  const sorted = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { ...plan, state: 'final', entry: res.entry, ops, objects: sorted(Object.fromEntries(versions)), knownCandidates: sorted(res.candidates) };
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
  return { plan: finish(store, loaded, planned, today) };
}

/**
 * Turns a plan whose questions are all answered into a final one. Refuses a plan made against another store
 * version (E_STORE_CONFLICT); without a version, applyPlan checks the base hash.
 */
export function finalize(store, plan, { today } = {}) {
  const loaded = store.read() ?? EMPTY;
  const version = contentVersion(loaded);
  if ('storeVersion' in plan && plan.storeVersion !== version) throw conflictError(plan.storeVersion, version);
  return { plan: finish(store, loaded, plan, today) };
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
 * Possible duplicates of the elements `plan` creates that it did not know (an element created, or renamed, in parallel):
 * findCandidates, as the plan ran it, against `loaded`, leaving out the candidates the plan already had.
 */
function parallelDuplicates(loaded, plan) {
  const added = plan.entry?.added ?? [];
  if (!plan.knownCandidates || !added.length || !loaded?.raw) return [];
  const created = new Map(plan.ops.filter(o => o.op === 'upsertElement' && added.includes(o.element.id)).map(o => [o.element.id, o.element]));
  const removed = new Set(plan.ops.filter(o => o.op === 'removeElement').map(o => o.id));
  // An id the plan creates that exists now is already a conflict of its own (its version was null).
  const pool = [...indexTree(loaded.raw)].filter(([id]) => !removed.has(id) && !created.has(id)).map(([, { el, parent }]) => describe(el, parent));
  const out = [];
  for (const [id, el] of created) {
    const known = new Set(plan.knownCandidates[id] ?? []);
    for (const c of findCandidates(describe(el, el.parent ?? null), pool)) {
      if (!known.has(c.id)) out.push({ ref: `element:${id}`, reason: 'possible-duplicate', candidate: c.id });
    }
  }
  return out;
}

/** The conflicts for people: each object with its name (from `raw`, else from the plan's ops) and what happened to it. */
function conflictLabels(conflicts, raw, plan) {
  const names = new Map((raw?.model?.elements ?? []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e.name ?? e.id]));
  for (const o of plan.ops) if (o.op === 'upsertElement' && !names.has(o.element.id)) names.set(o.element.id, o.element.name ?? o.element.id);
  const element = id => (names.has(id) ? `"${names.get(id)}" (${id})` : id);
  return conflicts.map(c => conflictLabel(c, element)).join('; ');
}

function conflictLabel(c, element) {
  const at = c.ref.indexOf(':');
  const [kind, id] = at < 0 ? [c.ref, null] : [c.ref.slice(0, at), c.ref.slice(at + 1)];
  const what = { element: () => element(id), relationship: () => `relação ${id}`, view: () => `visão ${id}`, note: () => `nota ${id}`, manifest: () => 'manifesto da base' }[kind]?.() ?? c.ref;
  if (c.reason === 'possible-duplicate') return `${what}: possível duplicata de ${element(c.candidate)}, que não estava na base do plano`;
  return `${what}: ${c.planned == null ? 'criado' : c.current == null ? 'removido' : 'alterado'} depois do plano`;
}

/**
 * Writes a final plan through the connector, nothing else: the plan's ops, checked against what it was made for: on a
 * connector with per-object versions, the versions of the objects it read or writes (`objects`) and the possible
 * duplicates of what it creates; otherwise (or for a plan without `objects`) the version of the whole base. The merge is
 * not replayed, so a hand-edited plan is only checked for the model it would leave. The entry returned is the round as
 * written, with its final id. A connector that cannot write by itself (gbrain MCP: the agent calls the tools) returns the
 * request to hand to the agent instead (`{ request, apply }`): first the read-check, then, given its response
 * (`readCheck`), the writes; the receipts go to the connector (archlens apply <base> --receipts).
 */
export function apply(store, plan, { readCheck } = {}) {
  if (plan?.['archlens-plan'] !== PLAN_VERSION) {
    throw mergeError('E_PLAN_SCHEMA', 'o arquivo não é um plano do archlens (gere com "archlens plan")');
  }
  const redo = 'archlens plan <base> --answers <plano> --out <novo>';
  if (!isFinal(plan)) {
    const open = openQuestions(plan);
    throw mergeError('E_PLAN_OPEN', open.length
      ? `o plano tem ${open.length} pergunta(s) sem resposta: item(ns) ${open.map(i => i.n).join(', ')}; responda e rode ${redo}`
      : plan.blocked
        ? `o plano está bloqueado por erros do delta; corrija o delta e rode ${redo}`
        : `o plano está aberto, mas todas as perguntas já têm resposta; feche-o com ${redo}`);
  }
  if (!plan.ops.length) return { version: null, entry: null, preserved: [] };
  store.assertWrite?.(); // before anything else: a refused plan should not send people to replan for nothing
  const stale = now => storeError('E_STORE_CONFLICT', `a base mudou depois do plano (${short(plan.storeVersion)} → ${short(now)}); `
    + `nada foi gravado. Refaça o plano reaproveitando as respostas: ${redo}`);
  const changed = (conflicts, raw) => storeError('E_STORE_CONFLICT', `a base mudou depois do plano em ${conflicts.length} objeto(s) `
    + `que ele lê ou grava: ${conflictLabels(conflicts, raw, plan)}; nada foi gravado. `
    + `Refaça o plano reaproveitando as respostas: ${redo}`, { conflicts });
  const loaded = store.read();
  // Checked here too: against another base the model errors below would mislead.
  const expect = store.versioning === 'object' && plan.objects ? plan.objects : null;
  if (expect) {
    const conflicts = [...checkExpect(store.objectVersions(Object.keys(expect), loaded), expect), ...parallelDuplicates(loaded, plan)];
    if (conflicts.length) throw changed(conflicts, loaded?.raw);
  } else {
    const version = contentVersion(loaded);
    if (version !== (plan.storeVersion ?? null)) throw stale(version);
  }
  const next = applyOps(loaded, plan.ops);
  const errors = validateModel(next.raw).errors;
  if (errors.length) {
    throw mergeError('E_MERGE_INVALID', `o resultado do plano é inválido (${errors.length} erro(s)); nada foi gravado`, { errors });
  }
  try {
    // A connector that redoes the write over a newer base (gbrain git, after a rejected push) checks both again there.
    const res = store.apply(plan.ops, { ...(expect ? { expect, recheck: base => parallelDuplicates(base, plan) } : { baseVersion: plan.storeVersion ?? null }),
      plan, ...(readCheck ? { readCheck } : {}) });
    if (res.request) return { request: res.request, apply: res.apply ?? null, entry: res.entry ?? null, version: null, preserved: [] };
    return { version: res.version, entry: res.entry ?? appendedEntry(next, plan.ops) ?? plan.entry, preserved: res.preserved };
  } catch (e) {
    if (e.code !== 'E_STORE_CONFLICT') throw e;
    throw e.conflicts ? changed(e.conflicts, store.read()?.raw) : stale(store.version()); // changed between the read and the write
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
    if (!found) throw mergeError('E_QUERY_VIEW', `visão "${k}" não existe (veja "archlens views")`);
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
