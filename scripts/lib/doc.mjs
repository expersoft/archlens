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
  const hasStatus = els.some(e => e.status !== 'active') || model.relationships.some(r => r.status !== 'active');
  const hasSources = els.some(e => e.sources.length);
  const KIND_ABBR = { prompt: 'P', repo: 'R', doc: 'D', manual: 'M' };
  const extraHead = [...(hasStatus ? ['Status'] : []), ...(hasSources ? ['Fontes'] : [])];
  const extra = e => [
    ...(hasStatus ? [e.status] : []),
    ...(hasSources ? [[...new Set(e.sources.map(s => KIND_ABBR[s.kind] ?? s.kind))].join(' ')] : []),
  ];
  const out = [];

  out.push('---');
  out.push(`archlens: "${raw.archlens ?? '1.0'}"`);
  out.push(`name: ${JSON.stringify(model.name)}`);
  const changelog = raw.changelog || [];
  const today = date ?? new Date().toISOString().slice(0, 10);
  out.push(`generated: ${today}`);
  out.push(`revision: ${changelog.length}`);
  out.push(`updated: ${changelog.at(-1)?.date ?? today}`);
  out.push(`notations: [${[hasC4 && 'c4', hasArchimate && 'archimate'].filter(Boolean).join(', ')}]`);
  out.push(`elements: ${els.length}`);
  out.push(`relationships: ${model.relationships.length}`);
  out.push('---', '');
  out.push(`# ${model.name}`, '');
  out.push('> Base de conhecimento gerada pela skill **archlens**. As tabelas são derivadas do bloco',
    '> `archlens-json` no fim do documento, que é a fonte de verdade. Evolua a base com `archlens merge`',
    '> (delta → plano → apply); editar o bloco à mão e regenerar com `archlens doc` continua possível.',
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
        out.push(table(['Container', 'Tecnologia', 'Descrição', ...extraHead, 'id'], containers.map(c => [c.name + (c.type === 'data-object' ? ' 🛢' : ''), c.technology, c.description, ...extra(c), `\`${c.id}\``])), '');
        for (const c of containers) {
          const comps = childrenOf(model, c.id).filter(x => kind(x) === 'component');
          if (!comps.length) continue;
          out.push(`#### Componentes de ${c.name}`, '');
          out.push(table(['Componente', 'Tecnologia', 'Descrição', ...extraHead, 'id'], comps.map(x => [x.name, x.technology, x.description, ...extra(x), `\`${x.id}\``])), '');
        }
      }
    }
  }

  // ArchiMate layers
  for (const layer of LAYER_ORDER) {
    const list = els.filter(e => e.layer === layer);
    if (!list.length) continue;
    out.push(`## Camada de ${LAYER_LABELS[layer]}`, '');
    out.push(table(['Elemento', 'Tipo ArchiMate', 'Descrição', ...extraHead, 'id'], list.map(e => [
      e.name + (e.inferred ? ' ⚠︎' : ''), ELEMENT_TYPES[e.type].label + (e.c4 ? ` (C4 ${C4_LABELS[e.c4.kind]})` : ''), e.description, ...extra(e), `\`${e.id}\``,
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

  // Lifecycle
  out.push('## Ciclo de vida', '');
  const lifecycle = [
    ...els.filter(e => e.status !== 'active').map(e => [e.name, ELEMENT_TYPES[e.type].label, e.status, e.statusReason, `\`${e.id}\``]),
    ...model.relationships.filter(r => r.status !== 'active').map(r => {
      const o = c4Orientation(r) ?? r;
      return [`${name(o.from)} → ${name(o.to)}`, r.c4 ? 'usa' : r.type, r.status, r.statusReason, `\`${r.id}\``];
    }),
  ];
  out.push(lifecycle.length ? table(['Item', 'Tipo', 'Status', 'Motivo', 'id'], lifecycle) : '_Todos os elementos e relações estão ativos._', '');

  // Assumptions
  out.push('## Premissas e inferências', '');
  const inferred = els.filter(e => e.inferred);
  const inferredRels = model.relationships.filter(r => r.inferred);
  const assumptionLines = (model.assumptions || []).map(a => `- ${a}`).join('\n');
  out.push(keepBlock('assumptions', assumptionLines || '_Nenhuma premissa registrada._'), '');
  if (inferred.length || inferredRels.length) {
    out.push(table(['Item', 'Tipo', 'Confiança', 'Origem no texto'], [
      ...inferred.map(e => [e.name, ELEMENT_TYPES[e.type].label, e.confidence, e.sources.map(s => s.excerpt).filter(Boolean).join(' · ')]),
      ...inferredRels.map(r => { const o = c4Orientation(r) ?? r; return [`${name(o.from)} → ${name(o.to)}`, r.c4 ? 'usa' : r.type, '—', '—']; }),
    ]), '');
  }

  // Sources
  out.push('## Fontes', '');
  const bySource = new Map();
  for (const item of [...els, ...model.relationships]) {
    for (const s of item.sources) {
      const k = `${s.kind}|${s.ref ?? ''}|${s.path ?? ''}`;
      const row = bySource.get(k) ?? { kind: s.kind, ref: s.ref ?? (s.path ? '' : '(trechos de texto livre)'), path: s.path, date: s.date, items: new Set() };
      row.items.add(item.id);
      if (s.date && (!row.date || s.date > row.date)) row.date = s.date;
      bySource.set(k, row);
    }
  }
  out.push(bySource.size
    ? table(['Tipo', 'Referência', 'Data', 'Itens'], [...bySource.values()].map(r => [r.kind, r.path ? `${r.ref} · ${r.path}` : r.ref, r.date, r.items.size]))
    : '_Nenhuma fonte registrada._', '');

  // Views catalogue
  out.push('## Visões', '');
  out.push(table(['key', 'Notação', 'Tipo', 'Escopo / âncora', 'Descrição'], model.views.map(v => [
    `\`${v.key}\``, v.notation, v.notation === 'c4' ? v.level : `${v.viewpoint ?? 'layered'}${v.traverse?.mode ? ` (${v.traverse.mode})` : ''}`,
    [v.scope, v.anchor, ...(v.focus || [])].filter(Boolean).map(name).join(', '), v.title ?? v.description,
  ])), '');

  // History
  out.push('## Histórico', '');
  if (!changelog.length) out.push('_Nenhuma rodada de merge registrada._', '');
  else {
    out.push(table(['Data', 'Fonte', 'Resumo', 'Mudanças', 'Decisões'], changelog.slice(-10).reverse().map(e => [
      e.date, e.source ? `${e.source.kind}${e.source.ref ? ` ${e.source.ref}` : ''}` : '—', e.summary,
      [`+${e.added?.length ?? 0}`, `~${e.changed?.length ?? 0}`, `−${e.removed?.length ?? 0}`,
        Object.keys(e.status ?? {}).length ? `status ${Object.keys(e.status).length}` : ''].filter(Boolean).join(' '),
      (e.decisions ?? []).join('; '),
    ])), '');
    if (changelog.length > 10) out.push(`_Mostrando as 10 rodadas mais recentes de ${changelog.length}; o histórico completo está em \`changelog\` no bloco \`archlens-json\`._`, '');
  }

  out.push('## Notas', '');
  out.push(keepBlock('notes', '_Decisões, riscos e pendências._'), '');

  out.push('## Modelo canônico', '');
  out.push('```archlens-json');
  out.push(JSON.stringify(raw, null, 2));
  out.push('```', '');
  return out.join('\n');
}
