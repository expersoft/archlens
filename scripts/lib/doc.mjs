// ARCHITECTURE.md: human-readable knowledge base whose last block is the canonical model.
import { normalizeModel, c4KindOf, childrenOf, c4Orientation } from './model.mjs';
import { resolveView } from './query.mjs';
import { ELEMENT_TYPES, LAYER_ORDER, LAYER_LABELS, C4_LABELS } from './registry.mjs';

const BLOCK_RE = /```archlens-json[^\n]*\n([\s\S]*?)\n```/;
const KEEP_RE = /<!-- keep:([\w-]+) -->\n?([\s\S]*?)\n?<!-- \/keep:\1 -->/g;

export function extractModel(markdown) {
  const m = BLOCK_RE.exec(markdown);
  if (!m) {
    const err = new Error('E_NO_MODEL_BLOCK: o markdown não tem um bloco ```archlens-json (gere-o com "archlens doc")');
    err.code = 'E_NO_MODEL_BLOCK';
    throw err;
  }
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    const err = new Error(`E_MODEL_JSON: o bloco archlens-json não é JSON válido: ${e.message}`);
    err.code = 'E_MODEL_JSON';
    throw err;
  }
}

const cell = v => (v === undefined || v === null || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' '));
const table = (head, rows) => rows.length
  ? [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n')
  : '_Nenhum._';

export function generateDoc(raw, { existing, date } = {}) {
  const model = normalizeModel(raw);
  const keep = new Map();
  if (existing) for (const m of existing.matchAll(KEEP_RE)) keep.set(m[1], m[2]);
  const keepBlock = (name, fallback) => `<!-- keep:${name} -->\n${keep.has(name) ? keep.get(name) : fallback}\n<!-- /keep:${name} -->`;
  const els = [...model.elements.values()];
  const name = id => model.elements.get(id)?.name ?? id;
  const kind = el => c4KindOf(model, el);
  const hasC4 = els.some(e => e.c4);
  const hasArchimate = els.some(e => !e.c4);
  const out = [];

  out.push('---');
  out.push(`archlens: "${raw.archlens ?? '1.0'}"`);
  out.push(`name: ${JSON.stringify(model.name)}`);
  out.push(`generated: ${date ?? new Date().toISOString().slice(0, 10)}`);
  out.push(`notations: [${[hasC4 && 'c4', hasArchimate && 'archimate'].filter(Boolean).join(', ')}]`);
  out.push(`elements: ${els.length}`);
  out.push(`relationships: ${model.relationships.length}`);
  out.push('---', '');
  out.push(`# ${model.name}`, '');
  out.push('> Base de conhecimento gerada pela skill **archlens**. As tabelas são derivadas do bloco',
    '> `archlens-json` no fim do documento, que é a fonte de verdade: edite o JSON e regenere.',
    '> Texto entre marcadores `<!-- keep:... -->` é preservado ao regenerar.', '');

  out.push('## Visão geral', '');
  out.push(keepBlock('overview', model.description || '_Descreva aqui o propósito da arquitetura, o problema de negócio e as principais decisões._'), '');

  // Summary
  out.push('## Resumo', '');
  const byLayer = LAYER_ORDER.map(l => [LAYER_LABELS[l], els.filter(e => e.layer === l).length]).filter(r => r[1]);
  out.push(table(['Camada', 'Elementos'], byLayer), '');
  if (hasC4) {
    const c4counts = ['person', 'softwareSystem', 'container', 'component'].map(k => [C4_LABELS[k], els.filter(e => kind(e) === k).length]).filter(r => r[1]);
    out.push(table(['Tipo C4', 'Quantidade'], c4counts), '');
  }

  // Actors
  const actors = els.filter(e => ['business-actor', 'business-role', 'stakeholder'].includes(e.type));
  out.push('## Contexto e atores', '');
  out.push(table(['Ator', 'Tipo', 'Descrição', 'id'], actors.map(a => [a.name, ELEMENT_TYPES[a.type].label, a.description, `\`${a.id}\``])), '');

  // C4 hierarchy
  if (hasC4) {
    out.push('## Modelo C4', '');
    const systems = els.filter(e => kind(e) === 'softwareSystem');
    for (const s of systems) {
      out.push(`### ${s.name} — Software System${s.c4?.external ? ' (externo)' : ''}`, '');
      if (s.description) out.push(s.description, '');
      const containers = childrenOf(model, s.id).filter(c => kind(c) === 'container');
      if (containers.length) {
        out.push(table(['Container', 'Tecnologia', 'Descrição', 'id'], containers.map(c => [c.name + (c.type === 'data-object' ? ' 🛢' : ''), c.technology, c.description, `\`${c.id}\``])), '');
        for (const c of containers) {
          const comps = childrenOf(model, c.id).filter(x => kind(x) === 'component');
          if (!comps.length) continue;
          out.push(`#### Componentes de ${c.name}`, '');
          out.push(table(['Componente', 'Tecnologia', 'Descrição', 'id'], comps.map(x => [x.name, x.technology, x.description, `\`${x.id}\``])), '');
        }
      }
    }
  }

  // ArchiMate layers
  for (const layer of LAYER_ORDER) {
    const list = els.filter(e => e.layer === layer);
    if (!list.length) continue;
    out.push(`## Camada de ${LAYER_LABELS[layer]}`, '');
    out.push(table(['Elemento', 'Tipo ArchiMate', 'Descrição', 'id'], list.map(e => [
      e.name + (e.inferred ? ' ⚠︎' : ''), ELEMENT_TYPES[e.type].label + (e.c4 ? ` (C4 ${C4_LABELS[e.c4.kind]})` : ''), e.description, `\`${e.id}\``,
    ])), '');
  }

  // Relationships
  out.push('## Relacionamentos', '');
  out.push(table(['Origem', 'Relação', 'Destino', 'Descrição', 'Tecnologia'], model.relationships.map(r => {
    if (r.c4) return [name(r.c4.from), 'usa', name(r.c4.to), r.description, r.technology];
    return [name(r.from), r.type, name(r.to), r.description, r.technology];
  })), '');

  // Traceability
  out.push('## Rastreabilidade', '');
  out.push('Cadeias de suporte calculadas a partir do modelo (o que sustenta cada oferta, e quem depende de cada aplicação).', '');
  const anchors = els.filter(e => ['product', 'capability', 'value-stream'].includes(e.type));
  const fallback = anchors.length ? anchors : els.filter(e => e.type === 'business-service');
  const groupByLayer = view => LAYER_ORDER.map(l => [l, view.nodes.filter(n => !n.isAnchor && n.layer === l)]).filter(([, ns]) => ns.length);
  for (const a of fallback) {
    const v = resolveView(model, { key: `trace-${a.id}`, notation: 'archimate', viewpoint: 'layered', anchor: a.id, traverse: { mode: 'supporters' } });
    out.push(`### ${a.name} (${ELEMENT_TYPES[a.type].label}) — o que sustenta`, '');
    const groups = groupByLayer(v);
    if (!groups.length) out.push('_Nenhum elemento de suporte modelado._', '');
    for (const [l, ns] of groups) out.push(`- **${LAYER_LABELS[l]}:** ${ns.map(n => n.name).join(', ')}`);
    out.push('');
  }
  const apps = els.filter(e => e.type === 'application-component' && ['softwareSystem', 'container'].includes(kind(e)) && !e.c4?.external);
  if (apps.length) {
    out.push('### Dependências por aplicação', '');
    out.push(table(['Aplicação', 'Negócio que depende dela', 'Tecnologia que a sustenta'], apps.map(a => {
      const v = resolveView(model, { key: `imp-${a.id}`, notation: 'archimate', viewpoint: 'layered', anchor: a.id, traverse: { mode: 'both' } });
      const pick = (roles, layers) => v.nodes.filter(n => roles.includes(n.role) && layers.includes(n.layer)).map(n => n.name).join(', ');
      return [a.name, pick(['dependent', 'both'], ['business', 'strategy']), pick(['supporter', 'both'], ['technology', 'physical'])];
    })), '');
  }

  // Assumptions
  out.push('## Premissas e inferências', '');
  const inferred = els.filter(e => e.inferred);
  const inferredRels = model.relationships.filter(r => r.inferred);
  const assumptionLines = (model.assumptions || []).map(a => `- ${a}`).join('\n');
  out.push(keepBlock('assumptions', assumptionLines || '_Nenhuma premissa registrada._'), '');
  if (inferred.length || inferredRels.length) {
    out.push(table(['Item', 'Tipo', 'Confiança', 'Origem no texto'], [
      ...inferred.map(e => [e.name, ELEMENT_TYPES[e.type].label, e.confidence, e.source]),
      ...inferredRels.map(r => { const o = c4Orientation(r) ?? r; return [`${name(o.from)} → ${name(o.to)}`, r.c4 ? 'usa' : r.type, '—', '—']; }),
    ]), '');
  }

  // Views catalogue
  out.push('## Visões', '');
  out.push(table(['key', 'Notação', 'Tipo', 'Escopo / âncora', 'Descrição'], model.views.map(v => [
    `\`${v.key}\``, v.notation, v.notation === 'c4' ? v.level : `${v.viewpoint ?? 'layered'}${v.traverse?.mode ? ` (${v.traverse.mode})` : ''}`,
    [v.scope, v.anchor, ...(v.focus || [])].filter(Boolean).map(name).join(', '), v.title ?? v.description,
  ])), '');

  out.push('## Notas', '');
  out.push(keepBlock('notes', '_Decisões, riscos e pendências._'), '');

  out.push('## Modelo canônico', '');
  out.push('```archlens-json');
  out.push(JSON.stringify(raw, null, 2));
  out.push('```', '');
  return out.join('\n');
}
