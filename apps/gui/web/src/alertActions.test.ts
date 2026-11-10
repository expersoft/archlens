import { expect, it, vi } from 'vitest';
import { alertActions } from './alertActions';

const spec = { key: 'v', notation: 'archimate' };
const nest = { mode: 'edges' as const, except: [], holders: ['h'], open: [] };
const base = { spec, nest: null, selected: null, selectedName: '', layers: [] as string[], notation: 'archimate', nestAll: () => {}, runSpec: () => {} };
const ids = (a: { id: string }[]) => a.map((x) => x.id);

it('sem nest, sem seleção e com uma camada só: nenhuma ação', () => {
  expect(alertActions({ ...base, layers: ['application'] })).toEqual([]);
});

it('nest só quando a visão tem nest, e roda o mesmo do Agrupar tudo', () => {
  const nestAll = vi.fn();
  const a = alertActions({ ...base, nest, nestAll });
  expect(ids(a)).toEqual(['nest']);
  a[0].run();
  expect(nestAll).toHaveBeenCalledTimes(1);
});

it('focus só com nó selecionado, com focus [id] e depth 1', () => {
  expect(ids(alertActions(base))).not.toContain('focus');
  const runSpec = vi.fn();
  const a = alertActions({ ...base, selected: 'x', selectedName: 'X', runSpec });
  const f = a.find((x) => x.id === 'focus')!;
  expect(f.label).toBe('Focar no selecionado');
  f.run();
  expect(runSpec).toHaveBeenCalledWith({ ...spec, focus: ['x'], depth: 1 }, 'Focar: X');
});

it('layer só fora do C4 e com 2+ camadas; cada opção roda a spec da camada', () => {
  expect(ids(alertActions({ ...base, layers: ['business', 'application'], notation: 'c4' }))).toEqual([]);
  expect(ids(alertActions({ ...base, layers: ['business'] }))).toEqual([]);
  const runSpec = vi.fn();
  const a = alertActions({ ...base, layers: ['business', 'technology'], runSpec });
  const l = a.find((x) => x.id === 'layer')!;
  expect(l.options).toHaveLength(2);
  l.options![1].run();
  expect(runSpec).toHaveBeenCalledWith({ ...spec, layers: ['technology'] }, expect.stringContaining(''));
});
