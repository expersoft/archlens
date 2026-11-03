import { expect, it } from 'vitest';
import { pickInitialView } from './pick';

const v = (key: string, saved: boolean, level?: string, frames = false) =>
  ({ key, title: key, saved, spec: { level, ...(frames ? { groups: { frames: true } } : {}) } });
it('landscape salva vence', () => {
  expect(pickInitialView([v('a', true, 'context'), v('b', false, 'landscape'), v('c', true, 'landscape')])?.key).toBe('c');
});
it('sem salva, usa landscape sugerida', () => {
  expect(pickInitialView([v('a', true, 'context'), v('b', false, 'landscape')])?.key).toBe('b');
});
it('landscape com molduras só se não houver sem molduras', () => {
  expect(pickInitialView([v('f', false, 'landscape', true), v('u', false, 'landscape')])?.key).toBe('u');
  expect(pickInitialView([v('a', true, 'context'), v('f', false, 'landscape', true)])?.key).toBe('f');
});
it('cai na primeira visão; lista vazia', () => {
  expect(pickInitialView([v('a', true, 'context'), v('b', false, 'container')])?.key).toBe('a');
  expect(pickInitialView([])).toBeUndefined();
});
