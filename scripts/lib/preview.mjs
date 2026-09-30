// Preview of an unmerged delta (or a partly answered plan): the model the merge would produce, what changed
// against the base, the questions still open, and removed items kept as "ghosts" so views can show what goes
// away. Pure: never writes, never mutates its inputs.
import { previewMerge, relationshipIds, relationshipKeys, canonicalJson, mergeError } from './merge.mjs';
import { indexTree, attach } from './raw-tree.mjs';
import { describeItem } from './merge-report.mjs';

const ELEMENT_COMPARED = ['name', 'type', 'description', 'technology', 'external', 'archimate', 'parent', 'status', 'statusReason', 'tags', 'aliases', 'properties', 'owner', 'url'];
const REL_COMPARED = ['description', 'technology', 'accessType', 'status', 'statusReason', 'tags', 'properties'];
const OPTIONS = { conflict: ['keep', 'take', 'value:<x>'], 'view-conflict': ['keep', 'take'], 'possible-duplicate': ['same', 'different'], op: ['yes', 'no'] };
const ASSUMED = { conflict: 'take', 'possible-duplicate': 'different', op: 'yes' };

const elementValue = (entry, f) => (f === 'parent' ? entry.parent ?? undefined : f === 'status' ? entry.el.status ?? 'active' : entry.el[f]);
const relValue = (r, f) => (f === 'status' ? r.status ?? 'active' : r[f]);
const diff = (names, a, b, get) => names
  .filter(f => canonicalJson(get(a, f)) !== canonicalJson(get(b, f)))
  .map(f => ({ field: f, before: get(a, f), after: get(b, f) }));
const turnedRetired = (before, after) => after.status === 'retired' && (before.status ?? 'active') !== 'retired';
const groupBy = (list, keyOf) => {
  const out = new Map();
  for (const x of list) {
    const k = keyOf(x);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(x);
  }
  return out;
};

export function previewModel(baseRaw, { delta, plan } = {}) {
  if (!delta === !plan) throw mergeError('E_PREVIEW_INPUT', 'informe um delta ou um plano (e não os dois)');
  const answers = plan ? new Map(plan.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution])) : undefined;
  const merged = previewMerge(baseRaw, plan ? plan.delta : delta, { answers, ...(plan?.base ? { base: plan.base } : {}) });
  if (merged.plan.blocked) {
    throw mergeError('E_PREVIEW_BLOCKED', `o plano está bloqueado (${merged.plan.errors.length} erro(s)); corrija o delta antes de pré-visualizar`,
      { errors: merged.plan.errors, plan: merged.plan });
  }
  const raw = merged.raw; // a private clone: runMerge never shares objects with the base or the delta

  const before = baseRaw ? indexTree(baseRaw) : new Map();
  const after = indexTree(raw);
  const changes = new Map();
  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) { changes.set(id, { kind: 'added' }); continue; }
    const fields = diff(ELEMENT_COMPARED, b, a, elementValue);
    if (fields.length) changes.set(id, { kind: turnedRetired(b.el, a.el) ? 'retired' : 'changed', fields });
  }
  // Ghosts: removed elements go back under their old parent (indexTree walks top-down, so parents come first).
  for (const [id, b] of before) {
    if (after.has(id)) continue;
    const { children, ...el } = structuredClone(b.el);
    attach(raw, after, el, b.parent ?? null);
    changes.set(id, { kind: 'removed' });
  }

  const { relChanges, relMap } = diffRelationships(baseRaw, raw);

  const { views, droppedViews } = previewViews(baseRaw?.views ?? [], raw.views ?? [], (plan ? plan.delta : delta).views ?? []);

  const gone = ([, c]) => c.kind === 'removed' || c.kind === 'retired';
  const keep = new Set([...[...changes].filter(gone), ...[...relChanges].filter(gone)].map(([id]) => id));
  return { raw, changes, relChanges, pending: pendingByTarget(merged.plan, merged.idMap, relMap), keep, views, droppedViews, plan: merged.plan };
}

/**
 * The views a preview offers: every base view in its base form (ghosts keep it resolvable even when the apply would
 * drop or trim it), except those the delta brings, which show as the merge leaves them; plus the delta's new views.
 * `droppedViews`: base views the apply removes or trims (not counting the delta's own changes).
 */
function previewViews(baseViews, resultViews, deltaViews) {
  const fromDelta = new Set(deltaViews.map(v => v?.key));
  const result = new Map(resultViews.map(v => [v.key, v]));
  const views = baseViews.map(v => (fromDelta.has(v.key) && result.has(v.key) ? result.get(v.key) : v));
  const baseKeys = new Set(baseViews.map(v => v.key));
  views.push(...resultViews.filter(v => fromDelta.has(v.key) && !baseKeys.has(v.key)));
  const droppedViews = baseViews
    .filter(v => !result.has(v.key) || (!fromDelta.has(v.key) && canonicalJson(result.get(v.key)) !== canonicalJson(v)))
    .map(v => v.key);
  return { views: structuredClone(views), droppedViews };
}

/**
 * Relationship changes between base and result, keyed by the result id (ghosts: a free id). Parallel relationships
 * share a "from|type|to" group, so ids ("#2", "#3"…) are only labels: within a group, base and result are matched by
 * description, then technology, then order. Also returns base id → id in the preview (to re-key open questions).
 * Removed relationships are appended to `raw` as ghosts.
 */
function diffRelationships(baseRaw, raw) {
  const beforeIds = baseRaw ? relationshipIds(baseRaw) : new Map();
  const beforeKeys = baseRaw ? relationshipKeys(baseRaw) : new Map();
  const afterIds = relationshipIds(raw);
  const afterKeys = relationshipKeys(raw);
  const groupOf = (keys, ids) => r => keys.get(r) ?? `id:${ids.get(r)}`;
  const before = groupBy([...beforeIds.keys()], groupOf(beforeKeys, beforeIds));
  const after = groupBy([...afterIds.keys()], groupOf(afterKeys, afterIds));
  const pairs = []; // [base, result, flipped]
  const leftBase = [];
  const leftResult = new Set();
  const sameText = f => (a, b) => (a[f] ?? '') === (b[f] ?? '');
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const pool = [...(after.get(k) ?? [])];
    let rest = before.get(k) ?? [];
    for (const same of [sameText('description'), sameText('technology'), () => true]) {
      const next = [];
      for (const b of rest) {
        const i = pool.findIndex(a => same(a, b));
        if (i < 0) next.push(b); else pairs.push([b, pool.splice(i, 1)[0], false]);
      }
      rest = next;
    }
    leftBase.push(...rest);
    pool.forEach(a => leftResult.add(a));
  }
  // A relationship whose canonical key flipped (an endpoint changed type) is one relationship, not removed + added:
  // pair each unmatched base relationship with an unmatched result one with the same raw from/to/type.
  const removed = [];
  for (const b of leftBase) {
    const cands = [...leftResult].filter(a => a.from === b.from && a.to === b.to && a.type === b.type);
    const a = cands.find(c => c.description === b.description) ?? cands[0];
    if (!a) { removed.push(b); continue; }
    leftResult.delete(a);
    pairs.push([b, a, true]);
  }

  const relChanges = new Map();
  const relMap = new Map();
  for (const [b, a, flipped] of pairs) {
    const oldId = beforeIds.get(b), id = afterIds.get(a);
    relMap.set(oldId, id);
    const fields = diff(REL_COMPARED, b, a, relValue);
    if (flipped) fields.unshift({ field: 'id', before: oldId, after: id });
    if (fields.length) relChanges.set(id, { kind: turnedRetired(b, a) ? 'retired' : 'changed', fields });
  }
  for (const a of leftResult) relChanges.set(afterIds.get(a), { kind: 'added' });
  const taken = new Set(afterIds.values());
  for (const b of removed) {
    const oldId = beforeIds.get(b);
    let id = oldId;
    for (let n = 1; taken.has(id); n++) id = `${oldId.replace(/#\d+$/, '')}#removed${n > 1 ? n : ''}`;
    taken.add(id);
    raw.model.relationships.push({ ...structuredClone(b), id });
    relChanges.set(id, { kind: 'removed' });
    relMap.set(oldId, id);
  }
  return { relChanges, relMap };
}

/** Open questions of the plan (applicable `when` only), keyed by the element / relationship / view they are about. */
function pendingByTarget(plan, idMap, relMap = new Map()) {
  const answered = new Map(plan.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution]));
  const applies = it => {
    if (!it.when) return true;
    const at = it.when.lastIndexOf('=');
    return answered.get(it.when.slice(0, at)) === it.when.slice(at + 1);
  };
  const out = new Map();
  const add = (id, entry) => {
    if (id == null) return;
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(entry);
  };
  for (const it of plan.items) {
    if (!('resolution' in it) || it.resolution != null || !applies(it)) continue;
    const entry = { n: it.n, key: it.key, question: describeItem(it), assumed: ASSUMED[it.class] ?? null,
      options: OPTIONS[it.class === 'conflict' && it.kind === 'view' ? 'view-conflict' : it.class] ?? [] };
    if (it.class === 'possible-duplicate') {
      add(idMap.get(it.target) ?? it.target, entry);
      add(it.candidate, entry);
    } else if (it.kind === 'view') add(`view:${it.target}`, entry);
    else add(relMap.get(it.target) ?? it.target, entry);
  }
  return out;
}

export function previewSummary(p) {
  const count = kinds => [...p.changes.values()].filter(c => kinds.includes(c.kind)).length;
  const questions = new Set([...p.pending.values()].flat().map(e => e.key)).size;
  return `+${count(['added'])} ~${count(['changed'])} −${count(['removed', 'retired'])}${questions ? `, ${questions} decisão(ões) pendente(s)` : ''}`;
}

/** Marks a resolved view (IR) with the preview: node.change / changeFields / pending, edge.change / pending. */
export function annotateView(view, p) {
  for (const n of view.nodes) {
    const c = p.changes.get(n.id);
    if (c) {
      n.change = c.kind;
      if (c.fields) n.changeFields = c.fields;
    }
    const q = p.pending.get(n.id);
    if (q) n.pending = q;
  }
  for (const e of view.edges) {
    const kinds = (e.relIds || []).map(id => p.relChanges.get(id)?.kind ?? 'same');
    if (kinds.length && kinds.every(k => k === 'removed' || k === 'retired')) e.change = 'removed';
    else if (kinds.length && kinds.every(k => k === 'added')) e.change = 'added';
    else if (kinds.some(k => k !== 'same')) e.change = 'changed';
    const q = (e.relIds || []).flatMap(id => p.pending.get(id) ?? []);
    if (q.length) e.pending = q;
  }
  return view;
}
