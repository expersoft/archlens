// Markdown answers for `archlens query`: a view resolved into the same IR the HTML renderer draws, laid out as text.
// viewAnswer builds the structure (also the --format json output); formatViewAnswer only lays it out.
import { resolveView } from './query.mjs';
import { explainEdge } from './explain.mjs';
import { LAYER_ORDER, LAYER_LABELS } from './registry.mjs';

const C4_SECTIONS = [['person', 'Pessoas'], ['softwareSystem', 'Sistemas de software'], ['container', 'Contêineres'], ['component', 'Componentes']];
const MAX_NODES = 40;
const ROLES = { dependent: 'depende', supporter: 'sustenta', both: 'ambos' };

const rowOf = n => ({ id: n.id, name: n.name, type: n.type, kind: n.c4Kind ?? null, status: n.status ?? 'active', technology: n.technology ?? null });

/** Groups the IR nodes: by layer for ArchiMate, by C4 level (person, system, container, component) for C4. */
function sectionsOf(view) {
  const groups = view.notation === 'c4'
    ? [...C4_SECTIONS, [null, 'Outros']].map(([k, label]) => [label, view.nodes.filter(n => (C4_SECTIONS.some(([c]) => c === n.c4Kind) ? n.c4Kind : null) === k)])
    : [...LAYER_ORDER].map(l => [LAYER_LABELS[l], view.nodes.filter(n => n.layer === l)]);
  return groups.filter(([, nodes]) => nodes.length).map(([label, nodes]) => ({ label, rows: nodes.map(rowOf) }));
}

/** The structured answer for one view spec against a normalized model. */
export function viewAnswer(model, spec, opts) {
  const view = resolveView(model, spec, opts);
  const byId = Object.fromEntries(view.nodes.map(n => [n.id, { name: n.name, type: n.type }]));
  const notes = [];
  if (view.nodes.length > MAX_NODES) {
    notes.push(`A visão tem mais de ${MAX_NODES} nós (${view.nodes.length}); considere recortar com focus/depth, collapse ou layers.`);
  }
  return {
    title: view.title,
    spec: { key: view.key, ...spec },
    sections: sectionsOf(view),
    edges: view.edges.map(e => ({ from: e.from, to: e.to, type: e.type, sentence: explainEdge(e, byId, view.notation).sentence })),
    ...(view.matrix ? { matrix: view.matrix } : {}),
    notes,
  };
}

const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)];

export function formatViewAnswer(a) {
  const out = [`# ${a.title}`, '', `Visão: \`${JSON.stringify(a.spec)}\``, ''];
  for (const s of a.sections) {
    out.push(`## ${s.label}`, '', ...table(['Nome', 'Tipo', 'Status', 'Tecnologia'],
      s.rows.map(r => [r.name, r.kind && r.kind !== r.type ? `${r.type} (${r.kind})` : r.type, r.status, r.technology])), '');
  }
  if (a.edges.length) out.push('## Relações', '', ...a.edges.map(e => `- ${e.sentence} (${e.type})`), '');
  if (a.matrix) {
    out.push('## Matriz de dependência', '', ...table(['Elemento', 'Tipo', 'Camada', 'Relação', 'Dist.', 'Caminho'],
      a.matrix.map(r => [r.name + (r.shown ? '' : ' (oculto na visão)'), r.typeLabel, r.layerLabel, ROLES[r.role] ?? r.role, r.distance, r.path.map(p => `${p.via} → ${p.name}`).join(' · ')])), '');
  }
  for (const n of a.notes) out.push(`> ${n}`, '');
  return out.join('\n').replace(/\n+$/, '\n');
}

const peerOf = (byId, id) => ({ id, name: byId[id]?.name ?? id, type: byId[id]?.type ?? null });
const aliasesOf = el => (Array.isArray(el.aliases) ? el.aliases : []);
/** True when `text` names `id` as a whole token (not as a prefix such as `id.child`, nor inside a longer id). */
const cites = (text, id) => typeof text === 'string' && new RegExp(`(?<![\\w.:-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-]|\\.\\w)`).test(text);

/** The changelog entries that cite `id` as added, changed, removed, with a status, or in a decision. */
function roundsOf(history, id) {
  const out = [];
  for (const h of history ?? []) {
    const how = [];
    if ((h.added ?? []).includes(id)) how.push('adicionado');
    if ((h.changed ?? []).includes(id)) how.push('alterado');
    if ((h.removed ?? []).includes(id)) how.push('removido');
    if (h.status && Object.hasOwn(h.status, id)) how.push(`status: ${h.status[id]}`);
    if ((h.decisions ?? []).some(d => cites(d, id))) how.push('decisão');
    if (how.length) out.push({ id: h.id, date: h.date ?? null, summary: h.summary ?? '', how });
  }
  return out;
}

/** Hops from `id` over relationships and parent links, for the "Em volta" ring (distance 2 and beyond). */
function distances(els, rels, id) {
  const next = new Map();
  const link = (a, b) => { if (!next.has(a)) next.set(a, []); next.get(a).push(b); };
  for (const r of rels) { link(r.from, r.to); link(r.to, r.from); }
  for (const e of els) if (e.parent != null) { link(e.id, e.parent); link(e.parent, e.id); }
  const dist = new Map([[id, 0]]);
  for (let frontier = [id]; frontier.length;) {
    const found = [];
    for (const x of frontier) for (const y of next.get(x) ?? []) if (!dist.has(y)) { dist.set(y, dist.get(x) + 1); found.push(y); }
    frontier = found;
  }
  return dist;
}

/**
 * The card of one element from a subgraph read ({ raw } around `id`): identity, parent and children, relationships
 * grouped by type and direction, properties, sources, the rounds that cite it, and the ring beyond one hop.
 */
export function elementCard(subRaw, id, { history = [], depth = 1 } = {}) {
  const els = subRaw.raw?.model?.elements ?? [];
  const rels = subRaw.raw?.model?.relationships ?? [];
  const el = els.find(e => e.id === id);
  const byId = Object.fromEntries(els.map(e => [e.id, { name: e.name ?? e.id, type: e.type }]));
  const group = (side, other) => {
    const out = {};
    for (const r of rels.filter(x => x[side] === id).sort((a, b) => a.type.localeCompare(b.type) || a[other].localeCompare(b[other]))) {
      (out[r.type] ??= []).push({ ...peerOf(byId, r[other]), type: r.type, label: r.description ?? null, technology: r.technology ?? null,
        sentence: explainEdge({ from: r.from, to: r.to, type: r.type, label: r.description, technology: r.technology }, byId, 'archimate').sentence });
    }
    return out;
  };
  const dist = distances(els, rels, id);
  return {
    element: { id, name: el.name ?? id, type: el.type, kind: el.c4?.kind ?? null, status: el.status ?? 'active', technology: el.technology ?? null,
      description: el.description ?? null, aliases: aliasesOf(el) },
    parent: el.parent != null && byId[el.parent] ? peerOf(byId, el.parent) : null,
    children: els.filter(e => e.parent === id).map(e => peerOf(byId, e.id)),
    outgoing: group('from', 'to'),
    incoming: group('to', 'from'),
    properties: el.properties ?? {},
    sources: el.sources ?? [],
    rounds: roundsOf(history, id),
    around: els.filter(e => (dist.get(e.id) ?? 0) >= 2 && dist.get(e.id) <= depth)
      .sort((a, b) => dist.get(a.id) - dist.get(b.id) || a.id.localeCompare(b.id))
      .map(e => ({ ...rowOf(e), distance: dist.get(e.id), kind: e.c4?.kind ?? null })),
  };
}

const edgeLines = groups => Object.entries(groups).flatMap(([type, list]) => [`### ${type}`, '', ...list.map(e => `- ${e.sentence}${e.technology ? ` [${e.technology}]` : ''}`), '']);

export function formatElementCard(c) {
  const e = c.element;
  const out = [`# ${e.name}`, '', `- Id: \`${e.id}\``, `- Tipo: ${e.type}${e.kind ? ` (perfil C4: ${e.kind})` : ''}`, `- Status: ${e.status}`];
  if (e.technology) out.push(`- Tecnologia: ${e.technology}`);
  if (e.aliases.length) out.push(`- Apelidos: ${e.aliases.join(', ')}`);
  out.push('');
  if (e.description) out.push(e.description, '');
  if (c.parent) out.push(`Pai: ${c.parent.name} (\`${c.parent.id}\`)`, '');
  if (c.children.length) out.push('## Filhos', '', ...c.children.map(x => `- ${x.name} (\`${x.id}\`)`), '');
  if (Object.keys(c.outgoing).length) out.push('## Relações de saída', '', ...edgeLines(c.outgoing));
  if (Object.keys(c.incoming).length) out.push('## Relações de entrada', '', ...edgeLines(c.incoming));
  const props = Object.entries(c.properties);
  if (props.length) out.push('## Propriedades', '', ...table(['Propriedade', 'Valor'], props.map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])), '');
  if (c.sources.length) out.push('## Fontes', '', ...c.sources.map(s => `- ${s.kind}${s.ref ? `: ${s.ref}` : ''}${s.date ? ` (${s.date})` : ''}`), '');
  if (c.rounds.length) out.push('## Rodadas', '', ...c.rounds.map(r => `- ${r.id}${r.date ? ` (${r.date})` : ''}: ${r.summary} [${r.how.join(', ')}]`), '');
  if (c.around.length) out.push('## Em volta', '', ...table(['Nome', 'Tipo', 'Saltos'], c.around.map(r => [r.name, r.kind && r.kind !== r.type ? `${r.type} (${r.kind})` : r.type, r.distance])), '');
  return out.join('\n').replace(/\n+$/, '\n');
}
