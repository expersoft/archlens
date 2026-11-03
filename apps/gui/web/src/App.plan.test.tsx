import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), getBases: vi.fn(), getCatalog: vi.fn(), getView: vi.fn(), getElement: vi.fn(), getInfo: vi.fn() }));

import * as api from './api';
import { App } from './App';

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true, writable: true });
  vi.mocked(api.getBases).mockResolvedValue([{ id: 'b', name: 'B', ok: true }]);
  vi.mocked(api.getCatalog).mockResolvedValue({ id: 'b', name: 'Base', views: [{ key: 'v', title: 'Inicial', spec: { level: 'landscape' }, saved: true }], elements: [] });
  vi.mocked(api.getView).mockResolvedValue({ html: '<p>x</p>', data: null, alerts: [], nodes: [], ms: { resolve: 1, layout: 1, render: 1 }, spec: {}, title: 'Inicial', cached: false });
  vi.mocked(api.getElement).mockResolvedValue({ card: null, actions: [] });
});

const ask = { enabled: false } as const;

describe('App, modo Planejar', () => {
  it('o seletor só aparece com info.plan.enabled', async () => {
    vi.mocked(api.getInfo).mockResolvedValue({ ask });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    expect(screen.queryByRole('button', { name: 'Planejar' })).toBeNull();
  });

  it('clicar em Planejar mostra a conversa de planejamento e Navegar volta', async () => {
    vi.mocked(api.getInfo).mockResolvedValue({ ask, plan: { enabled: true, maxRounds: 8, timeoutMs: 1000 } });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    await userEvent.click(await screen.findByRole('button', { name: 'Planejar' }));
    expect(await screen.findByLabelText('Mensagem')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Trilha' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Navegar' }));
    expect(await screen.findByRole('navigation', { name: 'Trilha' })).toBeTruthy();
  });
});
