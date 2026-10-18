// Store operations: the closed list of writes every connector understands, the diff that produces them from two bases,
// the reference implementation that applies them, and the content version. Pure.
import { createHash } from 'node:crypto';
import { canonicalJson, relationshipIds } from '../merge.mjs';
import { sortParentsFirst } from '../canonical.mjs';
import { NOTE_NAMES } from '../doc.mjs';
import { storeError } from './errors.mjs';

export const OPS = ['setManifest', 'upsertElement', 'removeElement', 'upsertRelationship', 'removeRelationship', 'putView', 'removeView', 'putNote', 'appendHistory'];
const BODY = ['model', 'views', 'changelog'];

/** The manifest of a raw base: its top-level fields except the model, views and changelog. */
export const manifestOf = raw => Object.fromEntries(Object.entries(raw ?? {}).filter(([k]) => !BODY.includes(k)));

const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const elementsById = raw => new Map((raw?.model?.elements ?? []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
const viewsByKey = raw => new Map((raw?.views ?? []).filter(v => v && v.key != null).map(v => [v.key, v]));

/** id → relationship, generated ids filled in (as normalizeModel names them). */
export function relationshipsById(raw) {
  const ids = relationshipIds(raw ?? {});
  const out = new Map();
  for (const r of raw?.model?.relationships ?? []) {
    if (!r || typeof r !== 'object') continue;
    const id = r.id ?? ids.get(r);
    out.set(id, { ...r, id });
  }
  return out;
}

/** Ops that turn `before` ({ raw, notes }, or null for a new base) into `after`. The history only grows. */
export function diffRaw(before, after) {
  const a = before?.raw ?? null;
  const b = after.raw;
  const ops = [];
  if (!a || !same(manifestOf(a), manifestOf(b))) ops.push({ op: 'setManifest', manifest: manifestOf(b) });
  const ra = relationshipsById(a), rb = relationshipsById(b);
  for (const id of ra.keys()) if (!rb.has(id)) ops.push({ op: 'removeRelationship', id });
  const ea = elementsById(a), eb = elementsById(b);
  for (const id of ea.keys()) if (!eb.has(id)) ops.push({ op: 'removeElement', id });
  for (const el of sortParentsFirst([...eb.values()])) if (!ea.has(el.id) || !same(ea.get(el.id), el)) ops.push({ op: 'upsertElement', element: el });
  for (const [id, r] of rb) if (!ra.has(id) || !same(ra.get(id), r)) ops.push({ op: 'upsertRelationship', relationship: r });
  const va = viewsByKey(a), vb = viewsByKey(b);
  for (const key of va.keys()) if (!vb.has(key)) ops.push({ op: 'removeView', key });
  for (const [key, v] of vb) if (!va.has(key) || !same(va.get(key), v)) ops.push({ op: 'putView', view: v });
  for (const name of NOTE_NAMES) {
    const text = after.notes?.[name];
    if (text != null && text !== before?.notes?.[name]) ops.push({ op: 'putNote', name, text });
  }
  const ha = a?.changelog ?? [], hb = b.changelog ?? [];
  if (hb.length < ha.length || !same(hb.slice(0, ha.length), ha)) {
    throw storeError('E_STORE_HISTORY', 'o histórico só cresce: uma rodada já registrada mudou ou sumiu');
  }
  for (const entry of hb.slice(ha.length)) ops.push({ op: 'appendHistory', entry });
  return ops;
}

/** Reference implementation: `base` ({ raw, notes } or null) with `ops` applied, in order. E_STORE_OP on a bad op. */
export function applyOps(base, ops) {
  if (!Array.isArray(ops)) throw storeError('E_STORE_OP', 'as operações precisam ser uma lista');
  const src = base?.raw ? structuredClone(base.raw) : { model: { elements: [], relationships: [] } };
  let manifest = manifestOf(src);
  const elements = [...(src.model?.elements ?? [])];
  const generated = relationshipIds(src);
  const relId = r => r?.id ?? generated.get(r);
  let relationships = [...(src.model?.relationships ?? [])];
  let views = src.views ? [...src.views] : undefined;
  let changelog = src.changelog ? [...src.changelog] : undefined;
  const notes = { ...(base?.notes ?? {}) };
  const bad = (i, why) => storeError('E_STORE_OP', `operação ${i + 1} (${ops[i]?.op ?? '?'}): ${why}`);
  const put = (list, item, keyOf) => {
    const at = list.findIndex(x => keyOf(x) === keyOf(item));
    if (at >= 0) list[at] = item; else list.push(item);
  };
  ops.forEach((op, i) => {
    switch (op?.op) {
      case 'setManifest':
        if (!op.manifest || typeof op.manifest !== 'object' || BODY.some(k => k in op.manifest)) throw bad(i, '"manifest" precisa ser um objeto sem model, views ou changelog');
        manifest = structuredClone(op.manifest);
        break;
      case 'upsertElement':
        if (typeof op.element?.id !== 'string') throw bad(i, '"element" precisa de "id"');
        put(elements, structuredClone(op.element), e => e?.id);
        break;
      case 'removeElement': {
        const at = elements.findIndex(e => e?.id === op.id);
        if (at >= 0) elements.splice(at, 1);
        break;
      }
      case 'upsertRelationship':
        if (typeof op.relationship?.id !== 'string') throw bad(i, '"relationship" precisa de "id"');
        put(relationships, structuredClone(op.relationship), relId);
        break;
      case 'removeRelationship':
        relationships = relationships.filter(r => relId(r) !== op.id);
        break;
      case 'putView':
        if (op.view?.key == null) throw bad(i, '"view" precisa de "key"');
        views ??= [];
        put(views, structuredClone(op.view), v => v?.key);
        break;
      case 'removeView':
        if (views) views = views.filter(v => v?.key !== op.key);
        break;
      case 'putNote':
        if (!NOTE_NAMES.includes(op.name) || typeof op.text !== 'string') throw bad(i, `uma nota precisa de "name" (${NOTE_NAMES.join(' | ')}) e "text"`);
        notes[op.name] = op.text;
        break;
      case 'appendHistory':
        if (!op.entry || typeof op.entry !== 'object') throw bad(i, '"entry" precisa ser uma rodada do changelog');
        changelog = [...(changelog ?? []), structuredClone(op.entry)];
        break;
      default:
        throw bad(i, `operação desconhecida; use ${OPS.join(' | ')}`);
    }
  });
  const raw = { ...manifest, model: { ...src.model, elements: sortParentsFirst(elements), relationships } };
  if (views !== undefined) raw.views = views;
  if (changelog !== undefined) raw.changelog = changelog;
  return { raw, notes };
}

/** Fields that say something: empty lists, maps and texts count as absent. */
const meaningful = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ''
  && !(Array.isArray(v) && !v.length) && !(v !== null && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
const byKey = key => (p, q) => (String(p[key]) < String(q[key]) ? -1 : String(p[key]) > String(q[key]) ? 1 : 0);

/** Version of a base ({ raw, notes }): a hash of its content that ignores order, layout and generated ids. */
export function contentVersion(base) {
  if (!base?.raw) return null;
  const { raw } = base;
  const content = {
    manifest: manifestOf(raw),
    elements: [...elementsById(raw).values()].map(meaningful).sort(byKey('id')),
    relationships: [...relationshipsById(raw).values()].map(meaningful).sort(byKey('id')),
    views: [...viewsByKey(raw).values()].sort(byKey('key')),
    changelog: raw.changelog ?? [],
    notes: Object.fromEntries(NOTE_NAMES.filter(n => base.notes?.[n] != null).map(n => [n, base.notes[n]])),
  };
  return `sha256:${createHash('sha256').update(canonicalJson(content)).digest('hex')}`;
}
