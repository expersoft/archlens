// Scores an AskResult against the archlens-ask answer key (portable/archlens-ask/eval).
import { resolveView } from '../../../scripts/lib/query.mjs';

const LARGE_MAX = 40;
const list = ids => ids.slice(0, 5).join(', ') + (ids.length > 5 ? ', …' : '');
const verdict = (ok, reason) => ({ ok, reason });

/** Set difference a \ b. */
const minus = (a, b) => [...a].filter(x => !b.has(x));

function sameSet(label, got, want) {
  const extra = minus(got, want), missing = minus(want, got);
  if (!extra.length && !missing.length) return null;
  return [extra.length ? `${label} a mais: ${list(extra)}` : '', missing.length ? `${label} a menos: ${list(missing)}` : ''].filter(Boolean).join('; ');
}

function scoreView(result, ctx, gabarito) {
  if (result?.kind !== 'view') return verdict(false, `esperava uma visão, veio "${result?.kind ?? 'nada'}"`);
  let resolved;
  try { resolved = resolveView(ctx.model, result.spec); } catch (e) { return verdict(false, `spec recusada: ${e.message}`); }
  const wantNodes = new Set(gabarito.sections.flatMap(s => s.rows.map(r => r.id)));
  const nodeDiff = sameSet('nós', new Set(resolved.nodes.map(n => n.id)), wantNodes);
  const key = e => `${e.from}|${e.to}`;
  const got = new Map(resolved.edges.map(e => [key(e), e]));
  const want = new Map(gabarito.edges.map(e => [key(e), e]));
  const edgeDiff = sameSet('arestas', new Set(got.keys()), new Set(want.keys()));
  const typeDiff = [...want].filter(([k, e]) => e.derived === false && got.has(k) && got.get(k).type !== e.type).map(([k]) => k);
  const problems = [nodeDiff, edgeDiff, typeDiff.length ? `tipo diferente em: ${list(typeDiff)}` : ''].filter(Boolean);
  return problems.length ? verdict(false, problems.join('; ')) : verdict(true, 'seleção igual à do gabarito');
}

/** @returns {{ ok: boolean|null, reason: string }} ok null = not scored automatically. */
export function score(q, result, ctx, gabarito) {
  if (q.id === 'duas-bases') return verdict(null, 'roteiro manual');
  if (q.id === 'grande') {
    if (result?.kind === 'clarify') return verdict(true, 'pediu um recorte');
    if (result?.kind !== 'view') return verdict(false, `esperava visão recortada ou esclarecimento, veio "${result?.kind ?? 'nada'}"`);
    let n;
    try { n = resolveView(ctx.model, result.spec).nodes.length; } catch (e) { return verdict(false, `spec recusada: ${e.message}`); }
    return n <= LARGE_MAX ? verdict(true, `${n} nós`) : verdict(false, `${n} nós (máximo ${LARGE_MAX})`);
  }
  if (q.element) {
    if (result?.kind !== 'element') return verdict(false, `esperava o cartão de ${q.element}, veio "${result?.kind ?? 'nada'}"`);
    return result.id === q.element ? verdict(true, 'elemento certo') : verdict(false, `elemento ${result.id}, esperava ${q.element}`);
  }
  if (q.id === 'ambiguo') {
    if (result?.kind !== 'clarify') return verdict(false, `esperava esclarecimento, veio "${result?.kind ?? 'nada'}"`);
    const ids = new Set((result.options ?? []).map(o => o.id));
    const missing = ['loja.pedidos', 'loja.db-pedidos'].filter(id => !ids.has(id));
    return missing.length ? verdict(false, `opções sem: ${missing.join(', ')}`) : verdict(true, 'candidatos listados');
  }
  if (q.spec || q.view) return scoreView(result, ctx, gabarito);
  return verdict(null, 'sem critério automático');
}
