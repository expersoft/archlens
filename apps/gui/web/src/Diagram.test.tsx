import { expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
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

it('repete no window do host os atalhos da GUI e o Escape que o diagrama manda pela ponte', () => {
  const onEvent = vi.fn();
  const { container } = render(<Diagram view={view} theme="light" onEvent={onEvent} />);
  const frame = container.querySelector('iframe')!;
  const got: KeyboardEvent[] = [];
  const l = (e: KeyboardEvent) => got.push(e);
  window.addEventListener('keydown', l);
  const post = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'key', ...data }, source: frame.contentWindow }));
  });
  post({ code: 'KeyB', key: '∫', ctrlKey: true, altKey: true });
  post({ code: 'KeyA', key: 'a', ctrlKey: true }); // não é atalho da GUI: descartado
  post({ code: 'Escape', key: 'Escape' });
  window.removeEventListener('keydown', l);
  expect(got).toHaveLength(2);
  expect(got[0]).toMatchObject({ code: 'KeyB', ctrlKey: true, altKey: true });
  expect(got[1]).toMatchObject({ key: 'Escape' });
  expect(onEvent).not.toHaveBeenCalled();
});

it('o iframe não tem allow-same-origin e nasce com o tema marcado, sem recarregar ao trocar de tema', () => {
  const html = '<!doctype html>\n<html lang="pt-BR"><body>x</body></html>';
  const v = { html, alerts: [] } as unknown as ViewResult;
  const { container, rerender } = render(<Diagram view={v} theme="dark" onEvent={() => {}} />);
  const frame = container.querySelector('iframe')!;
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-downloads allow-modals');
  expect(frame.getAttribute('srcdoc')).toContain('<html data-theme="dark" lang="pt-BR">');
  const pm = vi.spyOn(frame.contentWindow!, 'postMessage');
  rerender(<Diagram view={v} theme="light" onEvent={() => {}} />);
  expect(frame.getAttribute('srcdoc')).toContain('<html data-theme="dark" lang="pt-BR">'); // mesmo documento
  expect(pm).toHaveBeenCalledWith({ source: 'archlens-host', type: 'theme', theme: 'light' }, '*');
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

it('botão de tema do diagrama alterna só o tema do diagrama', async () => {
  const onTheme = vi.fn();
  const { rerender } = render(<Diagram view={view} theme="light" onThemeChange={onTheme} onEvent={() => {}} />);
  const b = screen.getByRole('button', { name: 'Alternar tema do diagrama' });
  expect(b.textContent).toBe('☾');
  await userEvent.click(b);
  expect(onTheme).toHaveBeenCalledWith('dark');
  rerender(<Diagram view={view} theme="dark" onThemeChange={onTheme} onEvent={() => {}} />);
  expect(screen.getByRole('button', { name: 'Alternar tema do diagrama' }).textContent).toBe('☀');
});

it('o diagrama não mostra mais a faixa de avisos', () => {
  const v = { html: '<p>x</p>', alerts: ['texto antigo'], alertInfo: [] } as unknown as ViewResult;
  render(<Diagram view={v} theme="light" onEvent={() => {}} />);
  expect(screen.queryByText('texto antigo')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});

it('com avisos, a barra do diagrama mostra o selo e Apresentar com zoom pede fullscreen', async () => {
  const v = { html: '<p>x</p>', alerts: ['a'], alertInfo: [{ kind: 'legibility', text: 'a', nodes: 50, minFontPx: 8 }] } as unknown as ViewResult;
  const { container } = render(<Diagram view={v} theme="light" onEvent={() => {}} />);
  const frame = container.querySelector('iframe')!;
  const rf = vi.fn(() => Promise.resolve());
  (frame as unknown as { requestFullscreen: unknown }).requestFullscreen = rf;
  await userEvent.click(screen.getByRole('button', { name: 'Avisos da visão (1)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Apresentar com zoom' }));
  expect(rf).toHaveBeenCalledTimes(1);
});

it('mostra Agrupar tudo na barra do diagrama e chama onToggle', async () => {
  const onToggle = vi.fn();
  render(<Diagram view={view} theme="light" onEvent={() => {}} nest={{ label: 'Agrupar tudo', onToggle }} />);
  const bar = screen.getByRole('toolbar', { name: 'Ferramentas do diagrama' });
  await userEvent.click(within(bar).getByRole('button', { name: 'Agrupar tudo' }));
  expect(onToggle).toHaveBeenCalledTimes(1);
});

it('sem nest, sem botão de agrupar', () => {
  render(<Diagram view={view} theme="light" onEvent={() => {}} />);
  expect(screen.queryByRole('button', { name: /grupar tudo/ })).toBeNull();
});

it('nest.disabled desabilita o botão', () => {
  render(<Diagram view={view} theme="light" onEvent={() => {}} nest={{ label: 'Agrupar tudo', onToggle: () => {}, disabled: true }} />);
  expect((screen.getByRole('button', { name: 'Agrupar tudo' }) as HTMLButtonElement).disabled).toBe(true);
});
