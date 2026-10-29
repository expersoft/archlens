// Navigation of the GUI: context-menu actions per element, notation flip and view titles. Pure functions over a BaseContext.
import { resolveView } from '../../../scripts/lib/query.mjs';
import { ELEMENT_TYPES } from '../../../scripts/lib/registry.mjs';

const TYPE_LABEL = {
  'business-process': 'Processos de negócio', 'business-service': 'Serviços de negócio', product: 'Produtos',
  'application-component': 'Sistemas e containers', 'application-service': 'Serviços de aplicação',
  'application-interface': 'Interfaces', 'business-actor': 'Atores', 'business-role': 'Papéis', node: 'Nós',
  'system-software': 'Software de sistema', 'technology-service': 'Serviços de tecnologia', 'data-object': 'Dados',
  'application-event': 'Eventos', 'business-function': 'Funções de negócio', 'application-process': 'Processos de aplicação',
};
const typeLabel = t => TYPE_LABEL[t] ?? ELEMENT_TYPES[t]?.label ?? t;
const isMotivation = t => ELEMENT_TYPES[t]?.layer === 'motivation';

const nameOf = (ctx, id) => ctx.model.elements.get(id)?.name ?? id;

/** Count of the element types found by traversing from `id` in `mode`, motivation types left out. */
function traversalCounts(ctx, id, mode) {
  const counts = {};
  try {
    const v = resolveView(ctx.model, { key: 't', notation: 'archimate', viewpoint: 'layered', anchor: id,
      traverse: { mode }, granularity: 'component' });
    for (const n of v.nodes) {
      if (n.id === id) continue;
      const t = ctx.model.elements.get(n.id)?.type;
      if (t && !isMotivation(t)) counts[t] = (counts[t] ?? 0) + 1;
    }
  } catch { /* no traversal for this element */ }
  return counts;
}

export function actionsFor(ctx, id) {
  const e = ctx.model.elements.get(id);
  if (!e) return [];
  const k = ctx.kind(e);
  const kids = [...ctx.model.elements.values()].filter(x => x.parent === id);
  const out = [];
  if (k === 'softwareSystem') {
    if (kids.some(x => ctx.kind(x) === 'container')) {
      out.push({ label: 'Abrir containers', spec: { notation: 'c4', level: 'container', scope: id }, primary: true });
    }
    out.push({ label: 'Contexto (C4)', spec: { notation: 'c4', level: 'context', scope: id } });
  } else if (k === 'container') {
    if (kids.some(x => ctx.kind(x) === 'component')) {
      out.push({ label: 'Abrir componentes', spec: { notation: 'c4', level: 'component', scope: id }, primary: true });
    }
    const sys = ctx.systemOf(id);
    if (sys) out.push({ label: 'Containers do sistema, foco aqui (C4)', spec: { notation: 'c4', level: 'container', scope: sys, focus: [id], depth: 1 } });
  } else if (k === 'component') {
    if (e.parent) out.push({ label: 'Componentes do container (C4)', spec: { notation: 'c4', level: 'component', scope: e.parent, focus: [id], depth: 1 } });
  } else if (e.type === 'grouping') {
    out.push({ label: 'Abrir grupo', spec: { notation: 'c4', level: 'landscape', groups: { only: [id], frames: true } }, primary: true });
  }
  if (e.type === 'grouping') return out;

  out.push({ label: 'Ver em ArchiMate (camadas)', spec: { notation: 'archimate', viewpoint: 'layered', anchor: id,
    traverse: { mode: 'both', maxDepth: 2 }, granularity: 'container' } });
  for (const [mode, label] of [['dependents', 'Quem depende'], ['supporters', 'Do que depende']]) {
    const counts = traversalCounts(ctx, id, mode);
    const total = Object.values(counts).reduce((a, c) => a + c, 0);
    if (!total) continue;
    out.push({ label: `${label} (${total})`, sub: [
      { label: `Todos (${total})`, spec: { notation: 'archimate', viewpoint: 'layered', anchor: id, traverse: { mode }, granularity: 'container' } },
      ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => ({
        label: `${typeLabel(t)} (${c})`,
        spec: { notation: 'archimate', viewpoint: 'layered', anchor: id, traverse: { mode }, types: [...new Set([t, e.type])], derive: true, granularity: 'component' },
      })),
    ] });
  }
  out.push({ label: 'Matriz de dependência', spec: { notation: 'archimate', viewpoint: 'impact', anchor: id }, matrix: true });
  const sys = (k === 'container' || k === 'component') ? ctx.systemOf(id) : null;
  out.push({ label: 'Focar (só vizinhos)', spec: sys
    ? { notation: 'c4', level: k, scope: k === 'component' ? e.parent : sys, focus: [id], depth: 1 }
    : { notation: 'archimate', viewpoint: 'layered', anchor: id, traverse: { mode: 'both', maxDepth: 1 }, granularity: 'component' } });
  return out;
}

/** The same subject in the other notation. */
export function flipSpec(ctx, spec) {
  if (spec.notation === 'c4') {
    const id = spec.focus?.[0] ?? spec.scope;
    return id
      ? { notation: 'archimate', viewpoint: 'layered', anchor: id, traverse: { mode: 'both', maxDepth: 2 }, granularity: 'container' }
      : { notation: 'archimate', viewpoint: 'application', granularity: 'container' };
  }
  const a = spec.anchor && ctx.model.elements.get(spec.anchor);
  if (!a) return { notation: 'c4', level: 'landscape' };
  const k = ctx.kind(a);
  if (k === 'softwareSystem') return { notation: 'c4', level: 'context', scope: a.id };
  if (k === 'container') return { notation: 'c4', level: 'container', scope: ctx.systemOf(a.id), focus: [a.id], depth: 1 };
  if (k === 'component') return { notation: 'c4', level: 'component', scope: a.parent, focus: [a.id], depth: 1 };
  // ArchiMate-only element: context of the first system around it
  let near;
  try {
    near = resolveView(ctx.model, { key: 'n', notation: 'archimate', viewpoint: 'layered', anchor: a.id, traverse: { mode: 'both' }, granularity: 'system' })
      .nodes.map(n => ctx.model.elements.get(n.id)).find(x => x && ctx.kind(x) === 'softwareSystem');
  } catch { /* fall through to the landscape */ }
  return near ? { notation: 'c4', level: 'context', scope: near.id } : { notation: 'c4', level: 'landscape' };
}

export function titleFor(ctx, spec) {
  const n = id => nameOf(ctx, id);
  if (spec.notation === 'c4') {
    const base = {
      landscape: 'Paisagem', context: `Contexto de ${n(spec.scope)}`, container: `Containers de ${n(spec.scope)}`,
      component: `Componentes de ${n(spec.scope)}`, dynamic: `Fluxo em ${n(spec.scope)}`,
    }[spec.level] ?? 'Visão C4';
    return base + (spec.focus?.length ? ` (foco em ${spec.focus.map(n).join(', ')})` : '');
  }
  if (spec.viewpoint === 'impact') return `Impacto de ${n(spec.anchor)}`;
  if (spec.anchor) {
    const mode = spec.traverse?.mode;
    const verb = mode === 'dependents' ? 'O que depende de' : mode === 'both' ? 'Em volta de' : 'O que sustenta';
    return `${verb} ${n(spec.anchor)}${spec.types ? ` (${spec.types.map(typeLabel).join(', ')})` : ''}`;
  }
  return `ArchiMate: ${spec.viewpoint ?? 'visão'}`;
}
