// Preview of an unmerged delta (or a partly answered plan): the model the merge would produce, what changed
// against the base, the questions still open, and removed items kept as "ghosts" so views can show what goes
// away. Pure: never writes, never mutates its inputs.
import { previewMerge, relationshipIds, canonicalJson, mergeError } from './merge.mjs';
import { indexTree, attach } from './raw-tree.mjs';
import { describeItem } from './merge-report.mjs';

const ELEMENT_COMPARED = ['name', 'type', 'description', 'technology', 'external', 'archimate', 'parent', 'status', 'statusReason', 'tags', 'aliases', 'properties', 'owner', 'url'];
const REL_COMPARED = ['description', 'technology', 'accessType', 'status', 'statusReason', 'tags', 'properties'];
const ASSUMED = { conflict: 'take', 'possible-duplicate': 'different', op: 'yes' };

const elementValue = (entry, f) => (f === 'parent' ? entry.parent ?? undefined : f === 'status' ? entry.el.status ?? 'active' : entry.el[f]);
const relValue = (r, f) => (f === 'status' ? r.status ?? 'active' : r[f]);
const diff = (names, a, b, get) => names
  .filter(f => canonicalJson(get(a, f)) !== canonicalJson(get(b, f)))
  .map(f => ({ field: f, before: get(a, f), after: get(b, f) }));
const turnedRetired = (before, after) => after.status === 'retired' && (before.status ?? 'active') !== 'retired';
const byId = ids => new Map([...ids].map(([r, id]) => [id, r]));

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

  const beforeRels = byId(baseRaw ? relationshipIds(baseRaw) : new Map());
  const afterRels = byId(relationshipIds(raw));
  const relChanges = new Map();
  // A relationship whose canonical id flipped (an endpoint changed type) is one relationship, not removed + added:
  // pair each vanished base relationship with an unmatched result one with the same from/to/type.
  const freed = new Set([...afterRels.keys()].filter(id => !beforeRels.has(id)));
  const pairedTo = new Map(); // old id → new id
  for (const [oldId, r] of beforeRels) {
    if (afterRels.has(oldId)) continue;
    const cands = [...freed].filter(id => { const c = afterRels.get(id); return c.from === r.from && c.to === r.to && c.type === r.type; });
    const newId = cands.find(id => afterRels.get(id).description === r.description) ?? cands[0];
    if (newId === undefined) continue;
    freed.delete(newId);
    pairedTo.set(oldId, newId);
  }
  const pairedFrom = new Map([...pairedTo].map(([o, n]) => [n, o]));
  for (const [id, r] of afterRels) {
    const oldId = pairedFrom.get(id);
    const b = beforeRels.get(oldId ?? id);
    if (!b) { relChanges.set(id, { kind: 'added' }); continue; }
    const fields = diff(REL_COMPARED, b, r, relValue);
    if (oldId !== undefined) fields.unshift({ field: 'id', before: oldId, after: id });
    if (fields.length) relChanges.set(id, { kind: turnedRetired(b, r) ? 'retired' : 'changed', fields });
  }
  for (const [id, r] of beforeRels) {
    if (afterRels.has(id) || pairedTo.has(id)) continue;
    raw.model.relationships.push({ ...structuredClone(r), id });
    relChanges.set(id, { kind: 'removed' });
  }

  const gone = ([, c]) => c.kind === 'removed' || c.kind === 'retired';
  const keep = new Set([...[...changes].filter(gone), ...[...relChanges].filter(gone)].map(([id]) => id));
  return { raw, changes, relChanges, pending: pendingByTarget(merged.plan, merged.idMap), keep, plan: merged.plan };
}

/** Open questions of the plan (applicable `when` only), keyed by the element / relationship / view they are about. */
function pendingByTarget(plan, idMap) {
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
    const entry = { n: it.n, key: it.key, question: describeItem(it), assumed: ASSUMED[it.class] ?? null };
    if (it.class === 'possible-duplicate') {
      add(idMap.get(it.target) ?? it.target, entry);
      add(it.candidate, entry);
    } else if (it.kind === 'view') add(`view:${it.target}`, entry);
    else add(it.target, entry);
  }
  return out;
}

export function previewSummary(p) {
  const count = kinds => [...p.changes.values()].filter(c => kinds.includes(c.kind)).length;
  const questions = new Set([...p.pending.values()].flat().map(e => e.key)).size;
  return `+${count(['added'])} ~${count(['changed'])} −${count(['removed', 'retired'])}${questions ? `, ${questions} decisão(ões) pendente(s)` : ''}`;
}
