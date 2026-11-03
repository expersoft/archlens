import type { NestState, ViewSpec } from './api';

type NestingSpec = 'edges' | 'nested' | { mode: 'edges' | 'nested'; depth?: number; except?: string[] };

const depthOf = (n: unknown): number | undefined =>
  n && typeof n === 'object' && typeof (n as { depth?: unknown }).depth === 'number' ? (n as { depth: number }).depth : undefined;

function withNesting(spec: ViewSpec, n: NestingSpec | undefined): ViewSpec {
  const { nesting: _old, ...rest } = spec;
  return n === undefined ? rest : { ...rest, nesting: n };
}

/** Com algum `open`, desliga tudo; sem nenhum, liga tudo (mantendo o `depth`). `except` é zerado. */
export function toggleAll(spec: ViewSpec, nest: NestState): ViewSpec {
  if (nest.open.length) return withNesting(spec, undefined);
  const depth = depthOf(spec.nesting);
  return withNesting(spec, depth === undefined ? 'nested' : { mode: 'nested', depth });
}

/** Inverte `id` no `except` e normaliza a forma curta. */
export function toggleOne(spec: ViewSpec, nest: NestState, id: string): ViewSpec {
  const except = nest.except.includes(id) ? nest.except.filter((x) => x !== id) : [...nest.except, id];
  const depth = depthOf(spec.nesting);
  if (nest.mode === 'edges') {
    return withNesting(spec, except.length ? { mode: 'edges', except } : undefined);
  }
  if (!except.length && depth === undefined) return withNesting(spec, 'nested');
  return withNesting(spec, { mode: 'nested', ...(depth !== undefined ? { depth } : {}), ...(except.length ? { except } : {}) });
}

export const allLabel = (nest: NestState) => (nest.open.length ? 'Desagrupar tudo' : 'Agrupar tudo');
export const oneLabel = (nest: NestState, id: string) => (nest.open.includes(id) ? 'Desagrupar' : 'Agrupar aqui dentro');
