// The only reader of the free vocabulary: c4:* types, archimate:* prefixes, "uses", nested "children" and the
// "archimate" override. Prompts, deltas and 1.x bases go through here; everything else reads the 2.0 format
// (ArchiMate types, c4.kind, flat "parent", ArchiMate relationships). Pure.
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from './registry.mjs';
import { orderDelta } from './raw-tree.mjs';

export const FORMAT = '2.0';
export const isCanonicalFormat = v => typeof v === 'string' && /^2\.\d+$/.test(v);

const C4_TO_ARCHIMATE = {
  person: 'business-actor', softwareSystem: 'application-component', container: 'application-component',
  component: 'application-component', deploymentNode: 'node', infrastructureNode: 'node',
};
// Tags that made a 1.x c4:container a data-object; in 2.0 such a container is an application-component.
export const DATA_TAGS = ['database', 'datastore', 'data-store', 'bucket', 'storage'];
const NEXT_KIND = { softwareSystem: 'container', container: 'component' };
const isPassiveType = t => ELEMENT_TYPES[t]?.aspect === 'passive';

/** Free element type ("c4:container", "archimate:node", "node") → ArchiMate type + C4 kind. */
export function canonicalType(raw, { archimate } = {}) {
  if (typeof raw !== 'string') return { error: 'E_UNKNOWN_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : ['archimate', raw];
  if (ns === 'c4') {
    if (!C4_TO_ARCHIMATE[name]) return { error: 'E_UNKNOWN_TYPE' };
    if (archimate == null) return { type: C4_TO_ARCHIMATE[name], c4Kind: name };
    const override = String(archimate).replace(/^archimate:/, '');
    return ELEMENT_TYPES[override] ? { type: override, c4Kind: name } : { error: 'E_UNKNOWN_TYPE' };
  }
  return ns === 'archimate' && ELEMENT_TYPES[name] ? { type: name, c4Kind: null } : { error: 'E_UNKNOWN_TYPE' };
}

/** C4 kind of an element written without one, from its type and parent (as 1.x read it); parent null = top level. */
export function inferKind(type, parent) {
  if (type === 'application-component') return parent ? NEXT_KIND[parent.kind] ?? null : 'softwareSystem';
  if (type === 'business-actor' || type === 'business-role') return parent ? null : 'person';
  return null;
}

/**
 * Free-vocabulary elements (nested "children" or "parent") → flat 2.0 elements, parents first. `lookup(id)` gives
 * { type, kind } of elements outside the list (the base); kinds are inferred only for elements it does not know.
 * Unknown types are kept as written, so validation reports them.
 */
export function canonicalElements(list = [], { lookup = () => null } = {}) {
  const elements = [];
  const issues = [];
  const inferred = new Set();
  const databases = new Set();
  const report = { types: 0, kinds: 0, databases: 0 };
  const seen = new Map();
  const info = id => seen.get(id) ?? lookup(id);
  for (const { el, parent } of orderDelta(list)) {
    const { archimate, ...node } = el;
    if (parent != null) node.parent = parent; else delete node.parent;
    let kind = el.c4?.kind ?? null;
    if (el.type !== undefined) {
      const r = canonicalType(el.type, { archimate });
      if (r.error) issues.push({ code: 'E_UNKNOWN_TYPE', id: el.id, type: el.type });
      else {
        if (r.type !== el.type || archimate !== undefined) report.types++;
        if (r.c4Kind === 'container' && archimate === undefined && (el.tags || []).some(t => DATA_TAGS.includes(String(t).toLowerCase()))) {
          databases.add(el.id);
          report.databases++;
        }
        node.type = r.type;
        kind = r.c4Kind ?? kind;
      }
    }
    if (!kind && ELEMENT_TYPES[node.type] && !lookup(el.id)) {
      const p = parent != null ? info(parent) : null;
      kind = inferKind(node.type, p && p.type !== 'grouping' ? p : null);
      if (kind) { inferred.add(el.id); report.kinds++; }
    }
    if (kind) node.c4 = { kind }; else delete node.c4;
    seen.set(el.id, { type: node.type ?? lookup(el.id)?.type, kind: kind ?? lookup(el.id)?.kind ?? null });
    elements.push(node);
  }
  return { elements, issues, report, inferred, databases };
}

/**
 * A free relationship in 2.0 form, or null when its type is unknown. "uses" is reversed serving, or access when the
 * target is passive; an accessType that serving cannot carry is kept in properties.accessType.
 */
export function canonicalRelationship(r, typeOf = () => null) {
  const s = String(r.type ?? 'uses');
  const [ns, name] = s.includes(':') ? s.split(':', 2) : [null, s];
  const { accessType, ...rest } = r;
  if ((ns === 'c4' || ns === null) && name === 'uses') {
    if (isPassiveType(typeOf(r.to))) return { ...rest, type: 'access', accessType: accessType ?? 'readwrite' };
    return toServing({ ...rest, type: 'serving', accessType }, true);
  }
  if ((ns === 'archimate' || ns === null) && RELATIONSHIP_TYPES[name]) {
    return { ...rest, type: name, ...(name === 'access' && accessType ? { accessType } : {}) };
  }
  return null;
}

/** serving with the ends of `r` (swapped when `swap`), keeping a read/write-only access in properties. */
function toServing({ accessType, ...r }, swap) {
  const out = { ...r, type: 'serving', ...(swap ? { from: r.to, to: r.from } : {}) };
  if (accessType && accessType !== 'readwrite') out.properties = { ...r.properties, accessType };
  return out;
}

/** Elements reordered so every parent comes before its children; the rest keeps its order. */
export function sortParentsFirst(elements) {
  const byId = new Map(elements.filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  const out = [];
  const done = new Set();
  const visiting = new Set();
  const visit = e => {
    if (done.has(e) || visiting.has(e)) return;
    visiting.add(e);
    const p = e.parent != null ? byId.get(e.parent) : null;
    if (p) visit(p);
    visiting.delete(e);
    done.add(e);
    out.push(e);
  };
  for (const e of elements) if (e && typeof e === 'object') visit(e); else out.push(e);
  return out;
}

/** A whole base (1.x or free vocabulary) in 2.0. An access to a 1.x database becomes serving from it. */
export function toCanonical(raw) {
  const els = canonicalElements(raw?.model?.elements ?? []);
  const types = new Map(els.elements.map(e => [e.id, e.type]));
  const report = { ...els.report, uses: 0 };
  const relationships = (raw?.model?.relationships ?? []).map(r => {
    if (!r || typeof r !== 'object') return r;
    const c = canonicalRelationship(r, id => types.get(id));
    if (!c) return r;
    if (/^(c4:)?uses$/.test(String(r.type ?? 'uses'))) report.uses++;
    return c.type === 'access' && els.databases.has(c.to) ? toServing(c, true) : c;
  });
  // Same key order as the input (only "archlens" goes first), so a saved and reloaded base hashes the same.
  const out = { archlens: FORMAT };
  for (const [k, v] of Object.entries(raw ?? {})) if (k !== 'archlens') out[k] = v;
  out.model = { ...raw?.model, elements: sortParentsFirst(els.elements), relationships };
  return {
    raw: out,
    report, issues: els.issues, databases: els.databases,
  };
}
