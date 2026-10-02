// Groupings in views: the "groups" spec (only / crossOnly / frames), the cut it makes and the frames it asks for.
import { viewError } from './query-util.mjs';

/** Normalized "groups" of a view spec: { only: Set|null, crossOnly, frames }. */
export function groupSpec(model, spec) {
  const g = spec.groups ?? {};
  if (!g || typeof g !== 'object' || Array.isArray(g)) {
    throw viewError('E_VIEW_GROUP', `"groups" da visão "${spec.key}" precisa ser um objeto`, 'ex.: { "only": ["plat-a", "plat-b"], "frames": true }');
  }
  let only = null;
  if (g.only !== undefined) {
    if (!Array.isArray(g.only) || !g.only.length) {
      throw viewError('E_VIEW_GROUP', `"groups.only" da visão "${spec.key}" precisa ser uma lista de agrupamentos`, 'ex.: ["plat-autorizacao", "plat-credito"]');
    }
    for (const id of g.only) {
      const el = model.elements.get(id);
      if (!el) throw viewError('E_VIEW_GROUP', `"${id}" em groups.only da visão "${spec.key}" não existe`, 'use o id de um elemento do tipo "grouping"');
      if (el.type !== 'grouping') throw viewError('E_VIEW_GROUP', `"${id}" em groups.only da visão "${spec.key}" não é um agrupamento`, 'use ids de elementos do tipo "grouping"');
    }
    only = new Set(g.only);
  }
  const crossOnly = !!g.crossOnly;
  if (crossOnly && (!only || only.size < 2)) {
    throw viewError('E_VIEW_GROUP', `"crossOnly" da visão "${spec.key}" precisa de pelo menos dois agrupamentos em "only"`, 'liste os grupos cujas interações quer ver');
  }
  return { only, crossOnly, frames: g.frames ?? !!only };
}

/** Effective grouping of an element (its own or inherited); null when none. */
export const groupOf = (model, id) => {
  const gid = model.elements.get(id)?.groupId ?? null;
  return gid && model.elements.has(gid) ? gid : null; // a grouping hidden by the status filter is no group here
};

/**
 * The cut of `only`: members of the listed groups plus neighbours up to `depth` along `edges`; with crossOnly, only
 * the members that take part in a relation between two different listed groups. `keepIds` always stay.
 */
export function cutByGroups(model, gs, nodeIds, edges, { depth = 0, keepIds = [] } = {}) {
  if (!gs.only) return new Set(nodeIds);
  const g = id => groupOf(model, id);
  const listed = id => gs.only.has(g(id));
  const inView = e => nodeIds.has(e.from) && nodeIds.has(e.to);
  const kept = new Set(keepIds.filter(id => nodeIds.has(id)));
  if (gs.crossOnly) {
    for (const e of edges) {
      if (inView(e) && listed(e.from) && listed(e.to) && g(e.from) !== g(e.to)) { kept.add(e.from); kept.add(e.to); }
    }
    return kept;
  }
  for (const id of nodeIds) if (listed(id)) kept.add(id);
  let frontier = [...kept];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const e of edges) {
      if (!inView(e)) continue;
      if (frontier.includes(e.from) && !kept.has(e.to)) { kept.add(e.to); next.push(e.to); }
      if (frontier.includes(e.to) && !kept.has(e.from)) { kept.add(e.from); next.push(e.from); }
    }
    frontier = next;
  }
  return kept;
}

/** With crossOnly, only the edges between two different listed groups stay. */
export function cutEdges(model, gs, edges) {
  if (!gs.crossOnly) return edges;
  const g = id => groupOf(model, id);
  return edges.filter(e => gs.only.has(g(e.from)) && gs.only.has(g(e.to)) && g(e.from) !== g(e.to));
}

/** The view's frames: the visible groupings with members among `items` (nodes, boundaries), when frames are on. */
export function frameGroups(model, gs, items) {
  if (!gs.frames) return null;
  const ids = [...new Set(items.map(x => x.group).filter(id => id && model.elements.has(id)))];
  if (!ids.length) return null;
  return ids.map(id => {
    const g = model.elements.get(id);
    return { id, name: g.name, description: g.description ?? '', status: g.status ?? 'active' };
  });
}
