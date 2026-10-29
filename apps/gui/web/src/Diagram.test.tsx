import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

it('os botões de alternância voltam a desligado a cada nova visão (ready)', () => {
  const { container, rerender } = render(<Diagram view={view} theme="light" onEvent={() => {}} />);
  const frame = container.querySelector('iframe')!;
  const post = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', ...data }, source: frame.contentWindow }));
  });
  post({ type: 'state', flowing: true, labels: true, legend: false, matrix: false });
  const fluxo = () => screen.getByRole('button', { name: 'Fluxo' }).getAttribute('aria-pressed');
  expect(fluxo()).toBe('true');
  rerender(<Diagram view={{ ...view, html: '<p>y</p>' } as ViewResult} theme="light" onEvent={() => {}} />);
  expect(fluxo()).toBe('false');
  post({ type: 'state', flowing: true, labels: false, legend: false, matrix: false });
  expect(fluxo()).toBe('true');
  post({ type: 'ready' });
  expect(fluxo()).toBe('false');
  expect(screen.getByRole('button', { name: 'Rótulos' }).getAttribute('aria-pressed')).toBe('false');
});
