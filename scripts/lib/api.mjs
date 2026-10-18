// The operations behind the plan/apply/show/query commands, over a store connector. Pure apart from reading the store.
import { basename } from 'node:path';
import { planMerge, applyPlan, openQuestions, canonicalJson, mergeError, PLAN_VERSION } from './merge.mjs';
import { diffRaw, contentVersion } from './store/ops.mjs';
import { conflictError } from './store/contract.mjs';

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
