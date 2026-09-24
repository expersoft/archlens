// ArchiMate projections: layer viewpoints, anchored traversals (supporters / dependents / both),
// derivation through hidden elements and the impact matrix.
import { LAYER_ORDER, LAYER_LABELS, RELATIONSHIP_TYPES, ELEMENT_TYPES, supportDirection, orientBySupport } from './registry.mjs';
import { c4KindOf } from './model.mjs';
import { viewError, matchesPattern } from './query-util.mjs';

const VIEWPOINT_LAYERS = {
  business: ['business'],
  application: ['application'],
  technology: ['technology', 'physical'],
  strategy: ['strategy'],
  motivation: ['motivation'],
  'implementation-migration': ['implementation'],
  'application-cooperation': ['application'],
  'implementation-deployment': ['application', 'technology', 'physical'],
  layered: LAYER_ORDER,
  impact: LAYER_ORDER,
  'product-support': ['strategy', 'business', 'application', 'technology', 'physical'],
  custom: LAYER_ORDER,
};
const VIEWPOINT_TITLES = {
  business: 'Camada de Negócio', application: 'Camada de Aplicação', technology: 'Camada de Tecnologia',
  strategy: 'Estratégia', motivation: 'Motivação', 'implementation-migration': 'Implementação e Migração',
  'application-cooperation': 'Cooperação de Aplicações', 'implementation-deployment': 'Implementação e Implantação',
  layered: 'Visão em Camadas', impact: 'Matriz de Impacto', 'product-support': 'Suporte ao Produto', custom: 'Visão Personalizada',
};
const DEFAULT_VIA = ['composition', 'aggregation', 'assignment', 'realization', 'serving', 'access', 'influence'];
const DEFAULT_MODE = { impact: 'both', 'product-support': 'supporters' };
const DEFAULT_GRANULARITY = { impact: 'container', 'product-support': 'container' };

export function resolveArchimate(model, spec) {
  const viewpoint = spec.viewpoint ?? 'layered';
  if (!VIEWPOINT_LAYERS[viewpoint]) throw viewError('E_VIEW_VIEWPOINT', `viewpoint desconhecido "${viewpoint}"`, `use ${Object.keys(VIEWPOINT_LAYERS).join(' | ')}`);
  const layers = spec.layers ?? VIEWPOINT_LAYERS[viewpoint];
  const types = spec.types ? new Set(spec.types.map(t => t.replace(/^archimate:/, ''))) : null;
  const collapse = new Set((spec.collapse || []).map(t => t.replace(/^archimate:/, '')));
  const derive = spec.derive ?? true;
  const kind = el => c4KindOf(model, el);
  const excluded = el => (spec.exclude || []).some(p => matchesPattern(el, p, kind));
  const allowed = el => layers.includes(el.layer) && (!types || types.has(el.type)) && !collapse.has(el.type) && !excluded(el);

  let anchor = null;
  const info = new Map(); // id → { distance, role, pred, move }
  if (spec.anchor) {
    anchor = model.elements.get(spec.anchor);
    if (!anchor) throw viewError('E_UNKNOWN_REF', `anchor "${spec.anchor}" não existe`, 'use o id de um elemento do modelo');
    const mode = spec.traverse?.mode ?? DEFAULT_MODE[viewpoint] ?? 'supporters';
    if (!['supporters', 'dependents', 'both'].includes(mode)) throw viewError('E_VIEW_TRAVERSE', `modo "${mode}" inválido`, 'use supporters | dependents | both');
    const via = new Set(spec.traverse?.via ?? DEFAULT_VIA);
    const maxDepth = spec.traverse?.maxDepth ?? 12;
    const hierarchy = spec.traverse?.hierarchy ?? true;
    info.set(anchor.id, { distance: 0, role: 'anchor' });
    const s = mode !== 'dependents' ? traverse(model, anchor.id, 'supporters', via, maxDepth, hierarchy) : new Map();
    const t = mode !== 'supporters' ? traverse(model, anchor.id, 'dependents', via, maxDepth, hierarchy) : new Map();
    for (const [id, i] of s) info.set(id, i);
    for (const [id, i] of t) {
      const prev = info.get(id);
      if (!prev) info.set(id, i);
      else prev.role = 'both';
    }
  }

  const candidates = anchor ? [...info.keys()].map(id => model.elements.get(id)) : [...model.elements.values()];
  // C4 granularity: 'component' shows everything; 'container' lifts components to their container and
  // hides a software system whose containers are on the view; 'system' keeps only systems.
  const granularity = spec.granularity ?? DEFAULT_GRANULARITY[viewpoint] ?? 'component';
  if (!['component', 'container', 'system'].includes(granularity)) throw viewError('E_VIEW_GRANULARITY', `granularity "${granularity}" inválida`, 'use component | container | system');
  const candidateIds = new Set(candidates.map(e => e.id));
  const tooFine = e => {
    const k = kind(e);
    if (granularity === 'system') return k === 'container' || k === 'component';
    if (granularity === 'container') {
      if (k === 'component') return true;
      if (k === 'softwareSystem') return [...candidateIds].some(id => model.elements.get(id).parent === e.id && kind(model.elements.get(id)) === 'container');
    }
    return false;
  };
  const kept = new Set(candidates.filter(e => e.id === anchor?.id || (allowed(e) && !tooFine(e))).map(e => e.id));
  for (const id of spec.include || []) if (model.elements.has(id)) kept.add(id);

  // Real + implicit (nesting) edges among kept elements.
  const edges = [];
  const pairKey = (a, b) => `${a}|${b}`;
  const linked = new Set();
  for (const r of model.relationships) {
    if (!kept.has(r.from) || !kept.has(r.to)) continue;
    edges.push({
      id: r.id, from: r.from, to: r.to, type: r.type,
      label: r.description ?? '', technology: r.technology ?? '', accessType: r.accessType,
      derived: false, relIds: [r.id],
    });
    linked.add(pairKey(r.from, r.to)); linked.add(pairKey(r.to, r.from));
  }
  for (const id of kept) {
    const p = model.elements.get(id).parent;
    if (p && kept.has(p) && !linked.has(pairKey(p, id))) {
      edges.push({ id: `${p}-composition-${id}`, from: p, to: id, type: 'composition', label: '', technology: '', derived: false, implicit: true, relIds: [] });
      linked.add(pairKey(p, id)); linked.add(pairKey(id, p));
    }
  }

  // Derived edges: walk the traversal tree through hidden elements back to a visible one.
  if (anchor && derive) {
    const seen = new Set();
    for (const id of kept) {
      if (id === anchor.id || !info.has(id)) continue;
      const chain = [];
      const via = [];
      let cur = id;
      let hops = 0;
      while (cur !== anchor.id && hops++ < 64) {
        const i = info.get(cur);
        if (!i?.pred) break;
        chain.push(i.moveType);
        cur = i.pred;
        if (kept.has(cur)) break;
        via.push(cur);
      }
      if (via.length === 0 || !kept.has(cur)) continue;
      const type = chain.reduce((w, t) => RELATIONSHIP_TYPES[t].strength < RELATIONSHIP_TYPES[w].strength ? t : w, chain[0]);
      const role = info.get(id).role;
      const [supporter, supported] = role === 'dependent' ? [cur, id] : [id, cur];
      const { from, to } = orientBySupport(type, supporter, supported);
      if (linked.has(pairKey(from, to)) || seen.has(pairKey(from, to))) continue;
      seen.add(pairKey(from, to));
      edges.push({
        id: `derived:${from}-${type}-${to}`, from, to, type, derived: true,
        label: '', technology: '', via: via.map(v => model.elements.get(v).name), viaIds: via, chain, relIds: [],
      });
    }
  }

  const order = [...model.elements.keys()];
  const nodes = [...kept].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(id => {
    const el = model.elements.get(id);
    const i = info.get(id);
    return {
      id, name: el.name, type: el.type, typeLabel: ELEMENT_TYPES[el.type].label, layer: el.layer, aspect: el.aspect,
      c4Kind: kind(el), technology: el.technology, description: el.description, tags: el.tags, properties: el.properties,
      isAnchor: id === anchor?.id, distance: i?.distance ?? null, role: i?.role ?? null, inferred: !!el.inferred,
    };
  });
  const presentLayers = LAYER_ORDER.filter(l => nodes.some(n => n.layer === l));

  let matrix = null;
  if (anchor && ((spec.output || []).includes('matrix') || viewpoint === 'impact')) {
    matrix = [...info.entries()].filter(([id]) => id !== anchor.id).map(([id, i]) => {
      const el = model.elements.get(id);
      const path = [];
      let cur = id;
      while (cur && cur !== anchor.id) { path.unshift({ id: cur, name: model.elements.get(cur).name, via: info.get(cur).moveType }); cur = info.get(cur).pred; }
      return {
        id, name: el.name, type: el.type, typeLabel: ELEMENT_TYPES[el.type].label, layer: el.layer, layerLabel: LAYER_LABELS[el.layer],
        role: i.role, distance: i.distance, shown: kept.has(id), path,
      };
    }).sort((a, b) => (a.role === b.role ? 0 : a.role === 'dependent' ? -1 : 1)
      || LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || a.distance - b.distance || a.name.localeCompare(b.name));
  }

  return {
    key: spec.key, notation: 'archimate', viewpoint,
    title: spec.title ?? `${VIEWPOINT_TITLES[viewpoint]}${anchor ? ` — ${anchor.name}` : ''}`,
    description: spec.description ?? '',
    anchor: anchor?.id ?? null,
    mode: anchor ? (spec.traverse?.mode ?? DEFAULT_MODE[viewpoint] ?? 'supporters') : null,
    granularity,
    animation: spec.animation ?? (anchor ? 'impact' : 'layers'),
    direction: 'DOWN',
    layout: spec.layout ?? null,
    layers: presentLayers, nodes, edges, matrix,
  };
}

/**
 * BFS from `start` along support edges. Nesting counts as composition: a part supports its whole.
 * Moving to the whole for context is always allowed, but after an upward hop we never descend
 * again, so the siblings of a part do not leak into the result.
 * @returns Map<id, { distance, role, pred, moveType }>
 */
function traverse(model, start, mode, via, maxDepth, hierarchy) {
  const sup = new Map(); // supported → [{ id, type }]
  const dep = new Map(); // supporter → [{ id, type }]
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const r of model.relationships) {
    if (!via.has(r.type)) continue;
    const d = supportDirection(r);
    if (!d) continue;
    push(sup, d[1], { id: d[0], type: r.type });
    push(dep, d[0], { id: d[1], type: r.type });
  }
  const children = new Map();
  if (hierarchy) for (const e of model.elements.values()) if (e.parent) push(children, e.parent, e.id);

  const role = mode === 'supporters' ? 'supporter' : 'dependent';
  const found = new Map();
  const expanded = new Set();
  let frontier = [{ id: start, cameUp: false }];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = [];
    for (const { id, cameUp } of frontier) {
      const key = `${id}|${cameUp}`;
      if (expanded.has(key) || (cameUp && expanded.has(`${id}|false`))) continue;
      expanded.add(key);
      const moves = ((mode === 'supporters' ? sup : dep).get(id) || []).map(n => ({ id: n.id, type: n.type, up: false }));
      const parent = model.elements.get(id).parent;
      if (hierarchy && parent) moves.push({ id: parent, type: 'composition', up: true });
      if (hierarchy && !cameUp) for (const c of children.get(id) || []) moves.push({ id: c, type: 'composition', up: false });
      for (const mv of moves) {
        if (mv.id === start) continue;
        if (!found.has(mv.id)) found.set(mv.id, { distance: d, role, pred: id, moveType: mv.type });
        next.push({ id: mv.id, cameUp: mv.up });
      }
    }
    frontier = next;
  }
  return found;
}

export const ARCHIMATE_VIEWPOINTS = Object.keys(VIEWPOINT_LAYERS);
