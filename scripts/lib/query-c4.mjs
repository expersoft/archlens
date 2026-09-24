// C4 projections: landscape, context, container, component, dynamic — with focus, lifting and filters.
import { c4KindOf, c4Orientation, childrenOf, ancestors } from './model.mjs';
import { C4_LABELS } from './registry.mjs';
import { viewError, matchesPattern } from './query-util.mjs';

const LEVEL_TITLES = { landscape: 'System Landscape', context: 'System Context', container: 'Container', component: 'Component', dynamic: 'Dynamic' };

export function resolveC4(model, spec) {
  const level = spec.level ?? 'context';
  if (!LEVEL_TITLES[level]) throw viewError('E_VIEW_LEVEL', `nível C4 desconhecido "${level}"`, 'use landscape | context | container | component | dynamic');
  const kind = el => c4KindOf(model, el);
  const topLevel = [...model.elements.values()].filter(e => !e.parent && ['person', 'softwareSystem'].includes(kind(e)));

  let scope = null;
  if (level !== 'landscape') {
    if (!spec.scope) throw viewError('E_VIEW_SCOPE', `a visão C4 "${level}" precisa de "scope"`, level === 'component' ? 'informe o id de um container' : 'informe o id de um software system');
    scope = model.elements.get(spec.scope);
    if (!scope) throw viewError('E_UNKNOWN_REF', `scope "${spec.scope}" não existe`, 'use o id de um elemento do modelo');
  }

  // Which elements may appear, and which of them sit inside the opened boundary.
  const visible = new Set();
  const internal = new Set();
  let boundary = null;
  let dynamicDepth = level;
  if (level === 'dynamic') dynamicDepth = kind(scope) === 'container' ? 'component' : 'container';

  const effective = level === 'dynamic' ? dynamicDepth : level;
  if (effective === 'landscape' || effective === 'context') {
    topLevel.forEach(e => visible.add(e.id));
  } else if (effective === 'container') {
    if (kind(scope) !== 'softwareSystem') throw viewError('E_VIEW_SCOPE', `scope "${scope.id}" não é um software system`, 'a visão de containers abre um software system');
    childrenOf(model, scope.id).filter(c => kind(c) === 'container').forEach(c => { visible.add(c.id); internal.add(c.id); });
    topLevel.filter(e => e.id !== scope.id).forEach(e => visible.add(e.id));
    boundary = scope;
  } else if (effective === 'component') {
    if (kind(scope) !== 'container') throw viewError('E_VIEW_SCOPE', `scope "${scope.id}" não é um container`, 'a visão de componentes abre um container');
    childrenOf(model, scope.id).filter(c => kind(c) === 'component').forEach(c => { visible.add(c.id); internal.add(c.id); });
    const system = scope.parent;
    if (system) childrenOf(model, system).filter(c => c.id !== scope.id && kind(c) === 'container').forEach(c => visible.add(c.id));
    topLevel.filter(e => e.id !== system).forEach(e => visible.add(e.id));
    boundary = scope;
  }

  const rep = id => [id, ...ancestors(model, id)].find(x => visible.has(x));
  const excluded = id => (spec.exclude || []).some(p => matchesPattern(model.elements.get(id), p, kind));
  for (const id of [...visible]) if (excluded(id)) { visible.delete(id); internal.delete(id); }

  // Lift relationships to the visible level and aggregate parallel ones.
  const edgeMap = new Map();
  const addEdge = (a, b, rel, extra = {}) => {
    const key = extra.step ? `step-${extra.step}` : `${a}->${b}`;
    let e = edgeMap.get(key);
    if (!e) { e = { id: key, from: a, to: b, type: 'uses', descriptions: [], technologies: [], relIds: [], count: 0, ...extra }; edgeMap.set(key, e); }
    e.count++;
    if (rel) {
      e.relIds.push(rel.id);
      if (rel.description && !e.descriptions.includes(rel.description)) e.descriptions.push(rel.description);
      if (rel.technology && !e.technologies.includes(rel.technology)) e.technologies.push(rel.technology);
    }
    return e;
  };

  if (level === 'dynamic') {
    (spec.steps || []).forEach((s, i) => {
      const rel = s.rel ? model.relationships.find(r => r.id === s.rel) : model.relationships.find(r => {
        const o = c4Orientation(r); return o && o.from === s.from && o.to === s.to;
      });
      const from = s.from ?? (rel && c4Orientation(rel).from), to = s.to ?? (rel && c4Orientation(rel).to);
      for (const x of [from, to]) if (!model.elements.has(x)) throw viewError('E_UNKNOWN_REF', `passo ${i + 1} referencia "${x}", que não existe`, 'use ids de elementos ou "rel" com o id de um relacionamento');
      const a = rep(from), b = rep(to);
      if (!a || !b) throw viewError('E_VIEW_STEP', `passo ${i + 1} (${from} → ${to}) não é visível nesta visão`, 'confira o scope da visão dinâmica');
      const e = addEdge(a, b, rel, { step: i + 1 });
      if (s.description) e.descriptions = [s.description];
      if (s.technology) e.technologies = [s.technology];
    });
  } else {
    for (const r of model.relationships) {
      const o = c4Orientation(r);
      if (!o) continue;
      const a = rep(o.from), b = rep(o.to);
      if (!a || !b || a === b) continue;
      addEdge(a, b, r);
    }
  }
  let edges = [...edgeMap.values()];

  // Decide which nodes to show.
  let nodes;
  if (level === 'landscape') {
    nodes = new Set(visible);
  } else if (level === 'context') {
    nodes = new Set([scope.id]);
    for (const e of edges) {
      if (e.from === scope.id) nodes.add(e.to);
      if (e.to === scope.id) nodes.add(e.from);
    }
  } else if (level === 'dynamic') {
    nodes = new Set(edges.flatMap(e => [e.from, e.to]));
  } else {
    nodes = new Set(internal);
    for (const e of edges) {
      if (internal.has(e.from)) nodes.add(e.to);
      if (internal.has(e.to)) nodes.add(e.from);
    }
  }
  for (const id of spec.include || []) {
    const r = model.elements.has(id) ? rep(id) : null;
    if (r) nodes.add(r);
  }

  // Focus: keep the neighbourhood (undirected) of the focused elements up to `depth`.
  const focus = new Set();
  if (spec.focus?.length) {
    for (const f of spec.focus) {
      if (!model.elements.has(f)) throw viewError('E_UNKNOWN_REF', `focus "${f}" não existe`, 'use ids de elementos do modelo');
      const r = rep(f);
      if (r) focus.add(r);
    }
    const depth = spec.depth ?? 1;
    const keep = new Set(focus);
    let frontier = [...focus];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const e of edges) {
        if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
        if (frontier.includes(e.from) && !keep.has(e.to)) { keep.add(e.to); next.push(e.to); }
        if (frontier.includes(e.to) && !keep.has(e.from)) { keep.add(e.from); next.push(e.from); }
      }
      frontier = next;
    }
    nodes = new Set([...nodes].filter(n => keep.has(n)));
  }

  edges = edges.filter(e => nodes.has(e.from) && nodes.has(e.to)).map(e => ({
    id: e.id, from: e.from, to: e.to, type: 'uses',
    label: e.descriptions.length > 2 ? `${e.descriptions.length} interações: ${e.descriptions.join('; ')}` : e.descriptions.join('; '),
    technology: e.technologies.join(', '),
    count: e.count, relIds: e.relIds, ...(e.step ? { step: e.step } : {}),
  }));

  const order = [...model.elements.keys()];
  const outNodes = [...nodes].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(id => {
    const el = model.elements.get(id);
    const k = kind(el);
    const parent = el.parent ? model.elements.get(el.parent) : null;
    return {
      id, name: el.name, type: el.type, layer: el.layer, c4Kind: k,
      c4Label: C4_LABELS[k] ?? k,
      technology: el.technology, description: el.description, tags: el.tags, properties: el.properties,
      external: !!el.c4?.external,
      database: el.type === 'data-object' || el.tags.some(t => ['database', 'datastore'].includes(t.toLowerCase())),
      boundary: internal.has(id) ? boundary.id : null,
      parentName: !internal.has(id) && parent && k !== 'person' && k !== 'softwareSystem' ? parent.name : null,
      isScope: scope?.id === id,
      isFocus: focus.has(id),
      inferred: !!el.inferred,
    };
  });

  const boundaries = boundary && outNodes.some(n => n.boundary === boundary.id)
    ? [{ id: boundary.id, name: boundary.name, c4Kind: kind(boundary), c4Label: C4_LABELS[kind(boundary)] }] : [];

  return {
    key: spec.key, notation: 'c4', level,
    title: spec.title ?? `${LEVEL_TITLES[level]}${scope ? ` — ${scope.name}` : ''}`,
    description: spec.description ?? '',
    scope: scope?.id ?? null,
    animation: spec.animation ?? (level === 'dynamic' ? 'story' : 'trace'),
    direction: spec.layout?.direction ?? spec.direction ?? 'RIGHT',
    layout: spec.layout ?? null,
    nodes: outNodes, edges, boundaries,
  };
}
