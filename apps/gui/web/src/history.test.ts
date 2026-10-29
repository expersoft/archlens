import { describe, expect, it } from 'vitest';
import { initialHistory, reducer, type HistoryAction, type Step } from './history';

const step = (label: string): Step => ({
  kind: 'Menu', label, ms: 1,
  view: { html: '', data: null, alerts: [], nodes: [], ms: { resolve: 0, layout: 0, render: 0 }, spec: {}, title: label, cached: false },
});
const run = (...as: HistoryAction[]) => as.reduce(reducer, initialHistory);

describe('history reducer', () => {
  it('resposta atrasada é descartada', () => {
    const s = run({ type: 'request', ticket: 1 }, { type: 'request', ticket: 2 },
      { type: 'loaded', ticket: 2, step: step('2') }, { type: 'loaded', ticket: 1, step: step('1') });
    expect(s.steps.map((x) => x.label)).toEqual(['2']);
  });
  it('voltar e abrir corta o futuro', () => {
    const s = run(
      { type: 'request', ticket: 1 }, { type: 'loaded', ticket: 1, step: step('a') },
      { type: 'request', ticket: 2 }, { type: 'loaded', ticket: 2, step: step('b') },
      { type: 'request', ticket: 3 }, { type: 'loaded', ticket: 3, step: step('c') },
      { type: 'go', index: 0 },
      { type: 'request', ticket: 4 }, { type: 'loaded', ticket: 4, step: step('d') });
    expect(s.steps.map((x) => x.label)).toEqual(['a', 'd']);
    expect(s.cur).toBe(1);
  });
  it('falha não muda a trilha', () => {
    const a = run({ type: 'request', ticket: 1 }, { type: 'loaded', ticket: 1, step: step('a') });
    const s = reducer(reducer(a, { type: 'request', ticket: 2 }), { type: 'failed', ticket: 2, error: 'x' });
    expect(s.steps).toEqual(a.steps);
    expect(s.cur).toBe(a.cur);
    expect(s.error).toBe('x');
    expect(reducer(s, { type: 'request', ticket: 3 }).error).toBeUndefined();
  });
});
