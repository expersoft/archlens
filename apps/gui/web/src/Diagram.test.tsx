import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Diagram } from './Diagram';
import type { ViewResult } from './api';

const view = { html: '<p>x</p>', alerts: [] } as unknown as ViewResult;

it('Apresentar pede fullscreen no host e não manda act:present', async () => {
  const { container } = render(<Diagram view={view} theme="light" onEvent={() => {}} />);
  const frame = container.querySelector('iframe')!;
  const rf = vi.fn(() => Promise.resolve());
  (frame as unknown as { requestFullscreen: unknown }).requestFullscreen = rf;
  const pm = vi.spyOn(frame.contentWindow!, 'postMessage');
  await userEvent.click(screen.getByRole('button', { name: 'Apresentar' }));
  expect(rf).toHaveBeenCalledTimes(1);
  expect(pm.mock.calls.some((c) => (c[0] as { act?: string }).act === 'present')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Ajustar' }));
  expect(pm).toHaveBeenCalledWith({ source: 'archlens-host', type: 'act', act: 'fit' }, '*');
});

it('reencaminha atalhos da GUI do iframe para o window do host', () => {
  const { container } = render(<Diagram view={view} theme="light" onEvent={() => {}} />);
  const frame = container.querySelector('iframe')!;
  fireEvent.load(frame);
  const got: KeyboardEvent[] = [];
  const l = (e: KeyboardEvent) => got.push(e);
  window.addEventListener('keydown', l);
  const W = frame.contentWindow as unknown as Window & { KeyboardEvent: typeof KeyboardEvent };
  const ev = new W.KeyboardEvent('keydown', { code: 'KeyB', key: '∫', ctrlKey: true, altKey: true, cancelable: true });
  W.dispatchEvent(ev);
  W.dispatchEvent(new W.KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true }));
  window.removeEventListener('keydown', l);
  expect(ev.defaultPrevented).toBe(true);
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ code: 'KeyB', ctrlKey: true, altKey: true });
});
