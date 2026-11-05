// The "where" filter of a view: only the nodes with a property value stay, with their ancestors as context frames.
import { ancestors } from './model.mjs';
import { viewError } from './query-util.mjs';

const isValue = v => ['string', 'number', 'boolean'].includes(typeof v);
const normalized = v => String(v).trim().toLowerCase();
/** The comparable values of a property: a simple value or the items of a list; anything else matches nothing. */
const valuesOf = v => (Array.isArray(v) ? v : [v]).filter(isValue).map(normalized);

/** Normalized "where" of a view spec: { property: [values] }, or null without it. */
export function whereSpec(spec) {
  const where = spec.where;
  if (where === undefined) return null;
  const invalid = () => viewError('E_VIEW_WHERE', `"where" da visão "${spec.key}" precisa ser um objeto de propriedades com texto, número, booleano ou lista desses`,
    'ex.: { "squad": "Checkout", "canais": ["web", "app"] }');
  if (!where || typeof where !== 'object' || Array.isArray(where) || !Object.keys(where).length) throw invalid();
  return Object.fromEntries(Object.entries(where).map(([key, value]) => {
    const list = Array.isArray(value) ? value : [value];
    if (!list.length || !list.every(isValue)) throw invalid();
    return [key, list.map(String)];
  }));
}

/** True when every key of `where` has one of its values on the element's own properties (no inheritance). */
export function matchesWhere(el, where) {
  return Object.entries(where).every(([key, wanted]) => {
    const have = valuesOf(el.properties?.[key]);
    return wanted.some(w => have.includes(normalized(w)));
  });
}

/** The cut of `where` over `nodeIds`: `results` match it or are named in `include`; `kept` adds their ancestors in `nodeIds`. */
export function cutByWhere(model, where, nodeIds, { include = [] } = {}) {
  const results = new Set(include.filter(id => nodeIds.has(id)));
  for (const id of nodeIds) if (matchesWhere(model.elements.get(id), where)) results.add(id);
  const kept = new Set(results);
  for (const id of results) for (const a of ancestors(model, id)) if (nodeIds.has(a)) kept.add(a);
  return { kept, results };
}
