// Estado do aninhamento de uma visão: quem pode guardar filhos (holders) e quem guarda de fato (open).
import { resolveView } from '../../../scripts/lib/query.mjs';
import { nestingSpec, visualParents } from '../../../scripts/lib/query-archimate.mjs';

/** @returns {{ mode: 'edges'|'nested', except: string[], holders: string[], open: string[] } | null} */
export function nestState(ctx, spec) {
  if (spec?.notation !== 'archimate') return null;
  const n = nestingSpec(spec.nesting);
  // os pais visuais saem da visão sem aninhamento: aninhada, ela perde as arestas de composição/agregação
  const flat = resolveView(ctx.model, { ...spec, nesting: 'edges' });
  const parents = visualParents(new Set(flat.nodes.map(x => x.id)), flat.edges, ctx.model);
  const holders = [...new Set(parents.values())];
  if (!holders.length) return null;
  const view = n.mode === 'edges' && !n.except ? flat : resolveView(ctx.model, spec);
  const open = holders.filter(h => view.nodes.some(x => x.nestedIn === h));
  return { mode: n.mode, except: n.except ?? [], holders, open };
}
