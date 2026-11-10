import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), getBases: vi.fn(), getCatalog: vi.fn(), getView: vi.fn(), getElement: vi.fn(), getInfo: vi.fn() }));

vi.mock('./plan/PlanPreview', async () => {
  const { useEffect } = await import('react');
  const change = (id: string, name: string) => ({ sign: '+', kind: 'element', id, name, type: 'Application Component', fields: [], origin: 'chat' });
  const result = { views: [], skipped: [], summary: '+2', report: null, changes: [change('a', 'Cashback'), change('b', 'Fidelidade')], questions: [] };
  return {
    PlanPreview: ({ draft, onLoaded, onSelect }: { draft: unknown; onLoaded?: (r: unknown) => void; onSelect?: (id: string) => void }) => {
      useEffect(() => { onLoaded?.(draft ? result : null); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
      return <div><button type="button" onClick={() => onSelect?.('a')}>prévia a</button><button type="button" onClick={() => onSelect?.('b')}>prévia b</button></div>;
    },
  };
});

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

describe('App, rodada em andamento', () => {
  it('trocar para Navegar não aborta a rodada; o rascunho devolvido é salvo e aparece ao voltar', async () => {
    vi.mocked(api.getInfo).mockResolvedValue({ ask, plan: { enabled: true, maxRounds: 8, timeoutMs: 1000 } });
    let emit!: (e: api.PlanEvent) => void;
    let signal!: AbortSignal;
    let finish!: () => void;
    vi.spyOn(api, 'planTurn').mockImplementation((_b, _body, on, s) => { emit = on; signal = s; return new Promise<void>((r) => { finish = r; }); });
    const u = userEvent.setup();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    await u.click(await screen.findByRole('button', { name: 'Planejar' }));
    await u.type(await screen.findByLabelText('Mensagem'), 'oi{Control>}{Enter}{/Control}');
    await u.click(screen.getByRole('button', { name: 'Navegar' }));
    expect(signal.aborted).toBe(false);
    const d = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: 'x' };
    await act(async () => { emit({ type: 'result', draft: d, reply: { kind: 'text', text: 'pronto' }, previews: [] }); finish(); });
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(d);
    await u.click(screen.getByRole('button', { name: 'Planejar' }));
    expect(await screen.findByText('pronto')).toBeTruthy();
  });
});

describe('App, aba Nó do Planejar', () => {
  const delta = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: { x: 1 }, plan: null, note: 'x' };
  const card = (id: string, name: string): api.Card => ({ element: { id, name, type: 'application-component', layer: 'application' }, parent: null, children: [], outgoing: {}, incoming: {}, properties: {} });

  async function open() {
    vi.mocked(api.getInfo).mockResolvedValue({ ask, plan: { enabled: true, maxRounds: 8, timeoutMs: 1000 } });
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(delta));
    vi.spyOn(api, 'planOpen').mockResolvedValue({ draft: delta } as never);
    vi.spyOn(api, 'planElement').mockImplementation(async (_b, _d, id) => ({ card: card(id, id === 'a' ? 'Cashback' : 'Fidelidade'), doc: null, docRaw: null, docs: false, removed: id === 'b' }));
    const u = userEvent.setup();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    await u.click(await screen.findByRole('button', { name: 'Planejar' }));
    return u;
  }

  it('aba Delta mostra a contagem de mudanças', async () => {
    await open();
    expect(await screen.findByRole('tab', { name: 'Delta (2)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Nó' })).toBeTruthy();
  });

  it('trilho mostra o ícone de informações com a dica, sem o texto Nó', async () => {
    await open();
    const b = screen.getByRole('button', { name: 'Nó' });
    expect(b.getAttribute('title')).toBe('Nó (detalhes do item selecionado)');
    expect(b.querySelector('svg')).toBeTruthy();
    expect(b.textContent).toBe('');
  });

  it('aba do painel mostra ícone e "Nó"', async () => {
    await open();
    const t = screen.getByRole('tab', { name: 'Nó' });
    expect(t.querySelector('svg')).toBeTruthy();
    expect(t.textContent).toContain('Nó');
  });

  it('clicar no nome de um item do Delta abre a aba Nó', async () => {
    const u = await open();
    await u.click(await screen.findByRole('button', { name: 'Cashback' }));
    expect(await screen.findByRole('heading', { name: 'Cashback' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Nó' }).getAttribute('aria-selected')).toBe('true');
  });

  it('clicar num nó da prévia abre a aba Nó com o cartão do planElement', async () => {
    const u = await open();
    await u.click(await screen.findByRole('button', { name: 'prévia b' }));
    await screen.findByRole('heading', { name: 'Fidelidade' });
    await u.click(screen.getByRole('tab', { name: 'Delta (2)' }));
    expect(screen.queryByRole('heading', { name: 'Fidelidade' })).toBeNull();
  });

  it('nó removido pelo rascunho aparece sem Editar', async () => {
    const u = await open();
    await u.click(await screen.findByRole('button', { name: 'prévia b' }));
    expect(await screen.findByText(/removido pelo rascunho/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });

  it('Descartar zera a contagem da aba Delta', async () => {
    const u = await open();
    await screen.findByRole('tab', { name: 'Delta (2)' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await u.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    expect(await screen.findByRole('tab', { name: 'Delta (0)' })).toBeTruthy();
    expect(screen.getByText('Nada planejado ainda.')).toBeTruthy();
  });

  it('rascunho só com edições da tela mostra as mudanças no Delta', async () => {
    const edited = { ...delta, delta: null, edits: { loja: { properties: { criticidade: 'média' } } } };
    vi.mocked(api.getInfo).mockResolvedValue({ ask, plan: { enabled: true, maxRounds: 8, timeoutMs: 1000 } });
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(edited));
    vi.spyOn(api, 'planOpen').mockResolvedValue({ draft: edited } as never);
    const u = userEvent.setup();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    await u.click(await screen.findByRole('button', { name: 'Planejar' }));
    expect(await screen.findByRole('button', { name: 'Cashback' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Delta (2)' })).toBeTruthy();
  });

  it('escolher um nó com o painel fechado abre o painel na aba Nó', async () => {
    localStorage.setItem('archlens-plan-delta', 'false');
    const u = await open();
    expect(screen.queryByTestId('delta-panel')).toBeNull();
    await u.click(await screen.findByRole('button', { name: 'prévia a' }));
    expect(await screen.findByRole('heading', { name: 'Cashback' })).toBeTruthy();
    expect(screen.getByTestId('delta-panel')).toBeTruthy();
  });
});
