import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), getBases: vi.fn(), getCatalog: vi.fn(), getView: vi.fn(), getElement: vi.fn(), flip: vi.fn() }));
vi.mock('./bridge', async (orig) => ({ ...(await orig<typeof import('./bridge')>()), send: vi.fn() }));

import * as api from './api';
import * as bridge from './bridge';
import { App } from './App';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const mkView = (title: string, spec: api.ViewSpec = { k: title }): api.ViewResult => ({
  html: `<p>${title}</p>`, data: null, alerts: [], nodes: [1, 2], ms: { resolve: 1, layout: 1, render: 1 }, spec, title, cached: false,
});

const getView = vi.mocked(api.getView);
const getElement = vi.mocked(api.getElement);
const flip = vi.mocked(api.flip);
const send = vi.mocked(bridge.send);

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true, writable: true });
  vi.mocked(api.getBases).mockResolvedValue([{ id: 'b', name: 'B', ok: true }]);
  vi.mocked(api.getCatalog).mockResolvedValue({
    id: 'b', name: 'Base', views: [{ key: 'v', title: 'Inicial', spec: { level: 'landscape' }, saved: true }],
    elements: ['A', 'B', 'C'].map((n) => ({ id: n, name: `Elem ${n}`, type: 't', layer: 'l' })),
  });
  getView.mockImplementation(async (_b, spec) => mkView(spec.level === 'landscape' ? 'Inicial' : String(spec.k), spec));
});

async function boot() {
  const r = render(<App />);
  await screen.findByRole('navigation', { name: 'Trilha' });
  await new Promise((res) => setTimeout(res, 50)); // deixa o srcDoc do jsdom terminar de carregar
  const frame = r.container.querySelector('iframe')!;
  const post = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', ...data }, source: frame.contentWindow }));
  });
  return { frame, post };
}
const trail = () => screen.getByRole('navigation', { name: 'Trilha' }).textContent;
const primary = (k: string) => ({ card: null, actions: [{ label: 'Abrir', spec: { k }, primary: true }] });

describe('App', () => {
  it('(a) duplo clique em A e depois B, B resolve primeiro: termina em B sem A depois', async () => {
    const { post } = await boot();
    const ea = deferred<api.ElementDetail>(); const eb = deferred<api.ElementDetail>();
    getElement.mockImplementation((_b, id) => (id === 'A' ? ea.promise : eb.promise));
    post({ type: 'expand', id: 'A' });
    post({ type: 'expand', id: 'B' });
    await act(async () => { eb.resolve(primary('vb')); });
    await waitFor(() => expect(trail()).toContain('vb'));
    await act(async () => { ea.resolve(primary('va')); });
    expect(trail()).toBe('Inicial › vb');
  });

  it('(b) flip lento superado por escolha do menu: a visão virada não aparece', async () => {
    const { post } = await boot();
    const f = deferred<{ spec: api.ViewSpec }>();
    flip.mockReturnValue(f.promise);
    fireEvent.click(screen.getByRole('button', { name: 'C4' }));
    getElement.mockResolvedValue({ card: null, actions: [{ label: 'Ver', spec: { k: 'menu' } }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await userEvent.click(await screen.findByText('Ver'));
    await waitFor(() => expect(trail()).toContain('menu'));
    await act(async () => { f.resolve({ spec: { k: 'flipped' } }); });
    expect(trail()).not.toContain('flipped');
    expect(getView).not.toHaveBeenCalledWith('b', { k: 'flipped' });
  });

  it('(c) getElement falho no duplo clique mostra erro na barra e mantém os passos', async () => {
    const { post } = await boot();
    getElement.mockRejectedValue(new Error('falhou geral'));
    post({ type: 'expand', id: 'A' });
    await waitFor(() => expect(document.querySelector('.status')!.textContent).toBe('falhou geral'));
    expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial');
  });

  it('(d) o menu fecha quando chega um select do diagrama', async () => {
    const { post } = await boot();
    getElement.mockResolvedValue({ card: null, actions: [{ label: 'Ver', spec: { k: 'x' } }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await screen.findByText('Ver');
    post({ type: 'select', id: 'B' });
    expect(screen.queryByText('Ver')).toBeNull();
  });

  it('(e) rever um passo de matriz reenvia act:matrix no ready', async () => {
    const { post } = await boot();
    getElement.mockResolvedValue({ card: null, actions: [{ label: 'Ver matriz', spec: { k: 'm' }, matrix: true }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await screen.findByText('Ver matriz');
    await userEvent.click(screen.getByText('Ver matriz'));
    await waitFor(() => expect(trail()).toContain('m'));
    const matrixCalls = () => send.mock.calls.filter((c) => (c[1] as { act?: string }).act === 'matrix').length;
    post({ type: 'ready' });
    expect(matrixCalls()).toBe(1);
    post({ type: 'ready' });
    expect(matrixCalls()).toBe(1);
    await userEvent.click(screen.getByText('Visão').closest('button')!);
    post({ type: 'ready' });
    expect(matrixCalls()).toBe(1);
    await userEvent.click(screen.getByText('Menu').closest('button')!);
    post({ type: 'ready' });
    expect(matrixCalls()).toBe(2);
  });
});
