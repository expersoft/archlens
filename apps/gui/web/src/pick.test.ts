import { expect, it } from 'vitest';
import { pickInitialView } from './pick';

const v = (key: string, saved: boolean, level?: string) => ({ key, title: key, saved, spec: { level } });
it('prefere landscape salva, ignora não salva, cai na primeira', () => {
  expect(pickInitialView([v('a', true, 'context'), v('b', false, 'landscape'), v('c', true, 'landscape')])?.key).toBe('c');
  expect(pickInitialView([v('a', true, 'context'), v('b', false, 'landscape')])?.key).toBe('a');
  expect(pickInitialView([])).toBeUndefined();
});
