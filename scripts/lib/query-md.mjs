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
