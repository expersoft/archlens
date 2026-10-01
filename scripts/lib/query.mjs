import { resolveC4 } from './query-c4.mjs';
import { resolveArchimate } from './query-archimate.mjs';
import { viewError } from './query-util.mjs';
import { STATUSES } from './registry.mjs';

const DEFAULT_STATUS = STATUSES.filter(s => s !== 'retired');

/** The model as a view sees it: elements (and everything nested in them) and relationships whose status is allowed. */
export function filterByStatus(model, allowed = DEFAULT_STATUS, keep = new Set()) {
  const ok = new Set(allowed);
  const shown = id => {
    if (keep.has(id)) return true;
    const seen = new Set();
    for (let cur = id; cur != null && !seen.has(cur); cur = model.elements.get(cur)?.parent) {
      seen.add(cur);
      const e = model.elements.get(cur);
      if (e && !ok.has(e.status ?? 'active')) return false;
    }
    return true;
  };
  const elements = new Map([...model.elements].filter(([id]) => shown(id)));
  const relationships = model.relationships.filter(r => elements.has(r.from) && elements.has(r.to) && (ok.has(r.status ?? 'active') || keep.has(r.id)));
  if (elements.size === model.elements.size && relationships.length === model.relationships.length) return model;
  return { ...model, elements, relationships };
}

/** Resolve a view spec against a normalized model into a view IR (nodes, edges, boundaries/layers). */
export function resolveView(model, spec, { keep } = {}) {
  if (!spec || typeof spec !== 'object') throw viewError('E_VIEW_SPEC', 'visão inválida', 'passe um objeto com "key" e "notation"');
  const withKey = { key: spec.key ?? 'view', ...spec };
  const status = withKey.status ?? DEFAULT_STATUS;
  if (!Array.isArray(status)) {
    throw viewError('E_VIEW_STATUS', `"status" da visão "${withKey.key}" precisa ser uma lista`, `use uma lista, ex.: ["planned","active"] (opções: ${STATUSES.join(' | ')})`);
  }
  const unknown = status.find(s => !STATUSES.includes(s));
  if (unknown) throw viewError('E_VIEW_STATUS', `status desconhecido "${unknown}" na visão "${withKey.key}"`, `use ${STATUSES.join(' | ')}`);
  const visible = filterByStatus(model, status, keep);
  for (const ref of [withKey.scope, withKey.anchor, ...(withKey.focus || [])]) {
    if (ref && model.elements.has(ref) && !visible.elements.has(ref)) {
      throw viewError('E_VIEW_STATUS', `"${ref}" está oculto pelo filtro de status da visão "${withKey.key}" (${status.join(', ')})`,
        'acrescente o status dele em "status" da visão, ex.: ["active","deprecated","retired"]');
    }
  }
  if (withKey.notation === 'c4') return resolveC4(visible, withKey);
  if (withKey.notation === 'archimate') return resolveArchimate(visible, withKey);
  throw viewError('E_VIEW_NOTATION', `notação "${spec.notation}" desconhecida`, 'use "c4" ou "archimate"');
}
