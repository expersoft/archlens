import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), getBases: vi.fn(), getCatalog: vi.fn(), getView: vi.fn(), getElement: vi.fn(), getActions: vi.fn(), flip: vi.fn(), find: vi.fn() }));
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
const getActions = vi.mocked(api.getActions);
const flip = vi.mocked(api.flip);
const find = vi.mocked(api.find);
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
  getElement.mockResolvedValue({ card: null, actions: [] }); // o cartão da seleção
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
const primary = (k: string) => ({ actions: [{ label: 'Abrir', spec: { k }, primary: true }] });

describe('App', () => {
  it('(a) duplo clique em A e depois B, B resolve primeiro: termina em B sem A depois', async () => {
    const { post } = await boot();
    const ea = deferred<{ actions: api.Action[] }>(); const eb = deferred<{ actions: api.Action[] }>();
    getActions.mockImplementation((_b, id) => (id === 'A' ? ea.promise : eb.promise));
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
    getActions.mockResolvedValue({ actions: [{ label: 'Ver', spec: { k: 'menu' } }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await userEvent.click(await screen.findByText('Ver'));
    await waitFor(() => expect(trail()).toContain('menu'));
    await act(async () => { f.resolve({ spec: { k: 'flipped' } }); });
    expect(trail()).not.toContain('flipped');
    expect(getView).not.toHaveBeenCalledWith('b', { k: 'flipped' });
  });

  it('(c) getActions falho no duplo clique mostra erro na barra e mantém os passos', async () => {
    const { post } = await boot();
    getActions.mockRejectedValue(new Error('falhou geral'));
    post({ type: 'expand', id: 'A' });
    await waitFor(() => expect(document.querySelector('.status')!.textContent).toBe('falhou geral'));
    expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial');
  });

  it('(d) o menu fecha quando chega um select do diagrama', async () => {
    const { post } = await boot();
    getActions.mockResolvedValue({ actions: [{ label: 'Ver', spec: { k: 'x' } }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await screen.findByText('Ver');
    post({ type: 'select', id: 'B' });
    expect(screen.queryByText('Ver')).toBeNull();
  });

  it('(e) rever um passo de matriz reenvia act:matrix no ready', async () => {
    const { post } = await boot();
    getActions.mockResolvedValue({ actions: [{ label: 'Ver matriz', spec: { k: 'm' }, matrix: true }] });
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

  it('(f) escolher no Explorador um elemento fora da visão abre o Contexto pelo caminho com ticket', async () => {
    await boot();
    getActions.mockResolvedValue({ actions: [{ label: 'Outra', spec: { k: 'o' } }, { label: 'Contexto (C4)', spec: { k: 'ctx' } }] });
    await userEvent.click(screen.getByRole('button', { name: 'Explorador' }));
    await userEvent.click(await screen.findByText('Elem A'));
    await waitFor(() => expect(trail()).toBe('Inicial › ctx'));
  });

  it('(g) elemento que está na visão só manda select pela ponte', async () => {
    vi.mocked(api.getView).mockResolvedValue({ ...mkView('Inicial', { level: 'landscape' }), data: { nodes: { A: { name: 'Elem A' } }, edges: [] } });
    await boot();
    getActions.mockResolvedValue({ actions: [{ label: 'Contexto (C4)', spec: { k: 'ctx' } }] });
    await userEvent.click(screen.getByRole('button', { name: 'Explorador' }));
    await userEvent.click(await screen.findByText('Elem A'));
    expect(send).toHaveBeenCalledWith(expect.anything(), { type: 'select', id: 'A', focus: true });
    expect(trail()).toBe('Inicial');
  });

  it('(h) busca: nada, um e vários resultados', async () => {
    await boot();
    getActions.mockResolvedValue({ actions: [{ label: 'Contexto (C4)', spec: { k: 'ctx' } }] });
    const box = screen.getByLabelText('Buscar');
    find.mockResolvedValueOnce([]);
    await userEvent.type(box, 'zzz{Enter}');
    await waitFor(() => expect(document.querySelector('.status')!.textContent).toBe('nada encontrado para "zzz"'));
    find.mockResolvedValueOnce([{ id: 'A', name: 'Elem A', type: 't', score: 1 }, { id: 'B', name: 'Elem B', type: 't', score: 1 }]);
    await userEvent.clear(box);
    await userEvent.type(box, 'elem{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Elem B/ }));
    await waitFor(() => expect(trail()).toBe('Inicial › ctx'));
  });

  it('(i) trocar de base reseta histórico e carrega a nova; inválida fica desabilitada', async () => {
    vi.mocked(api.getBases).mockResolvedValue([{ id: 'b', name: 'B', ok: true }, { id: 'c', name: 'C', ok: true }, { id: 'd', name: 'D', ok: false, error: 'quebrada' }]);
    await boot();
    const sel = screen.getByLabelText('Base') as HTMLSelectElement;
    expect(Array.from(sel.options).find((o) => o.value === 'd')!.disabled).toBe(true);
    expect(Array.from(sel.options).find((o) => o.value === 'd')!.title).toBe('quebrada');
    vi.mocked(api.getCatalog).mockResolvedValueOnce({ id: 'c', name: 'Outra', views: [{ key: 'w', title: 'Nova', spec: { level: 'landscape', z: 1 }, saved: true }], elements: [] });
    getView.mockResolvedValueOnce(mkView('Nova'));
    await userEvent.selectOptions(sel, 'c');
    await waitFor(() => expect(trail()).toBe('Nova'));
    expect(getView).toHaveBeenLastCalledWith('c', { level: 'landscape', z: 1 });
  });

  it('(j) catálogo lento da base antiga não sobrescreve a base escolhida depois', async () => {
    vi.mocked(api.getBases).mockResolvedValue([{ id: 'b', name: 'B', ok: true }, { id: 'c', name: 'C', ok: true }]);
    const slow = deferred<api.Catalog>();
    vi.mocked(api.getCatalog).mockImplementation((id) => (id === 'b' ? slow.promise : Promise.resolve({
      id: 'c', name: 'Outra', views: [{ key: 'w', title: 'Nova', spec: { level: 'landscape', z: 1 }, saved: true }], elements: [],
    })));
    getView.mockImplementation(async (_b, spec) => mkView(spec.z ? 'Nova' : 'Antiga', spec));
    render(<App />);
    const sel = (await screen.findByLabelText('Base')) as HTMLSelectElement;
    await waitFor(() => expect(sel.options.length).toBe(2));
    await userEvent.selectOptions(sel, 'c');
    await waitFor(() => expect(trail()).toBe('Nova'));
    await act(async () => { slow.resolve({ id: 'b', name: 'Base', views: [{ key: 'v', title: 'Antiga', spec: { level: 'landscape' }, saved: true }], elements: [] }); });
    await new Promise((r) => setTimeout(r, 50));
    expect(trail()).toBe('Nova');
    expect((screen.getByLabelText('Base') as HTMLSelectElement).value).toBe('c');
    expect(getView).not.toHaveBeenCalledWith('b', expect.anything());
  });
  it('(k) carga em andamento: "Carregando…" na barra e aria-busy no diagrama, some ao chegar ou falhar', async () => {
    const { post } = await boot();
    const status = () => document.querySelector('.status')!.textContent;
    const busy = () => document.querySelector('.diagram')!.getAttribute('aria-busy');
    expect(busy()).not.toBe('true');
    const v = deferred<api.ViewResult>();
    getView.mockReturnValueOnce(v.promise);
    getActions.mockResolvedValue({ actions: [{ label: 'Ver', spec: { k: 'lenta' } }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await userEvent.click(await screen.findByText('Ver'));
    await waitFor(() => expect(status()).toBe('Carregando…'));
    expect(busy()).toBe('true');
    await act(async () => { v.resolve(mkView('lenta')); });
    await waitFor(() => expect(trail()).toContain('lenta'));
    expect(status()).not.toBe('Carregando…');
    expect(busy()).not.toBe('true');
    const w = deferred<api.ViewResult>();
    getView.mockReturnValueOnce(w.promise);
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await userEvent.click(await screen.findByText('Ver'));
    await waitFor(() => expect(busy()).toBe('true'));
    await act(async () => { w.reject(new Error('quebrou')); });
    await waitFor(() => expect(status()).toBe('quebrou'));
    expect(busy()).not.toBe('true');
  });

  it('(l) duplo clique numa folha (sem ação primária) não derruba a carga em andamento', async () => {
    const { post } = await boot();
    const v = deferred<api.ViewResult>();
    getView.mockReturnValueOnce(v.promise);
    getActions.mockResolvedValue({ actions: [{ label: 'Ver', spec: { k: 'menu' } }] });
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await userEvent.click(await screen.findByText('Ver'));
    post({ type: 'expand', id: 'C' });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { v.resolve(mkView('menu')); });
    await waitFor(() => expect(trail()).toBe('Inicial › menu'));
  });

  it('(m) resultado tardio de um duplo clique superado não abre nada', async () => {
    const { post } = await boot();
    const ea = deferred<{ actions: api.Action[] }>();
    getActions.mockImplementation((_b, id) => (id === 'A' ? ea.promise : Promise.resolve({ actions: [{ label: 'Ver', spec: { k: 'menu' } }] })));
    post({ type: 'expand', id: 'A' });
    post({ type: 'context', id: 'B', x: 5, y: 5 });
    await userEvent.click(await screen.findByText('Ver'));
    await waitFor(() => expect(trail()).toBe('Inicial › menu'));
    await act(async () => { ea.resolve(primary('va')); });
    expect(trail()).toBe('Inicial › menu');
  });

  it('(n) uma nova busca limpa o aviso "nada encontrado" mesmo quando acha um só', async () => {
    vi.mocked(api.getView).mockResolvedValue({ ...mkView('Inicial', { level: 'landscape' }), data: { nodes: { A: { name: 'Elem A' } }, edges: [] } });
    await boot();
    getActions.mockResolvedValue({ actions: [] });
    const box = screen.getByLabelText('Buscar');
    find.mockResolvedValueOnce([]);
    await userEvent.type(box, 'zzz{Enter}');
    await waitFor(() => expect(document.querySelector('.status')!.textContent).toBe('nada encontrado para "zzz"'));
    find.mockResolvedValueOnce([{ id: 'A', name: 'Elem A', type: 't', score: 1 }]);
    await userEvent.clear(box);
    await userEvent.type(box, 'elem a{Enter}');
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.anything(), { type: 'select', id: 'A', focus: true }));
    expect(document.querySelector('.status')!.textContent).not.toContain('nada encontrado');
  });

  it('(o) o menu abre na hora com "Carregando…" e troca pelas ações quando chegam', async () => {
    const { post } = await boot();
    const d = deferred<{ actions: api.Action[] }>();
    getActions.mockReturnValue(d.promise);
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    expect(screen.getByText('Carregando…')).toBeTruthy();
    expect(screen.getByText('Elem A')).toBeTruthy();
    await act(async () => { d.resolve({ actions: [{ label: 'Ver', spec: { k: 'menu' } }] }); });
    expect(screen.queryByText('Carregando…')).toBeNull();
    expect(screen.getByText('Ver')).toBeTruthy();
    expect(getElement).not.toHaveBeenCalledWith('b', 'A');
  });

  it('(p) falha ao buscar as ações fecha o menu e mostra o erro na barra', async () => {
    const { post } = await boot();
    getActions.mockRejectedValue(new Error('sem ações'));
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    await waitFor(() => expect(document.querySelector('.status')!.textContent).toBe('sem ações'));
    expect(screen.queryByText('Carregando…')).toBeNull();
  });
});

describe('App: busca em texto', () => {
  type Ev = Record<string, unknown>;
  const bodies: Record<string, unknown>[] = [];
  const signals: AbortSignal[] = [];
  let handler: (n: number, signal: AbortSignal) => Response;
  const nd = (...evs: Ev[]) => new Response(evs.map((e) => JSON.stringify(e)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
  const hang = (signal: AbortSignal) => new Response(new ReadableStream({
    start(c) { signal.addEventListener('abort', () => c.error(new DOMException('abortado', 'AbortError'))); },
  }));
  const viewEv = (title: string, spec: api.ViewSpec = { k: title }, extra: Ev = {}): Ev[] => [
    { type: 'stage', stage: 'interpretando' },
    { type: 'result', result: { kind: 'view', spec }, view: mkView(title, spec), ...extra },
    { type: 'done', metrics: { total: 5 } },
  ];

  beforeEach(() => {
    bodies.length = 0; signals.length = 0;
    handler = () => nd(...viewEv('Resposta'));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/info')) return Response.json({ ask: { enabled: true, provider: 'scripted', model: 'm1', mode: 'tools' } });
      if (String(url).endsWith('/ask')) {
        const h = new Headers(init?.headers);
        expect(h.get('content-type')).toBe('application/json');
        bodies.push(JSON.parse(String(init?.body)));
        signals.push(init!.signal!);
        return handler(bodies.length, init!.signal!);
      }
      throw new Error(`fetch inesperado: ${url}`);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const askBox = async () => {
    const box = await screen.findByLabelText('Pergunta') as HTMLTextAreaElement;
    await waitFor(() => expect(box.disabled).toBe(false));
    return box;
  };
  const srcdoc = (c: HTMLElement) => c.querySelector('iframe')!.getAttribute('srcdoc') ?? '';

  it('pergunta abre a visão do resultado', async () => {
    const r = render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    const box = await askBox();
    getView.mockClear();
    await userEvent.type(box, 'o que suporta o checkout?{Enter}');
    await waitFor(() => expect(trail()).toBe('Inicial › Resposta'));
    expect(getView).not.toHaveBeenCalled();
    expect(srcdoc(r.container)).toContain('<p>Resposta</p>');
    expect(screen.getByRole('list', { name: 'Histórico' }).textContent).toContain('Pergunta');
    expect(bodies[0]).toMatchObject({ question: 'o que suporta o checkout?', context: { spec: { level: 'landscape' } }, history: [] });
  });

  it('segunda pergunta cancela a primeira', async () => {
    handler = (n, signal) => (n === 1 ? hang(signal) : nd(...viewEv('Segunda')));
    const r = render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    const box = await askBox();
    await userEvent.type(box, 'primeira pergunta?{Enter}');
    await waitFor(() => expect(signals).toHaveLength(1));
    await userEvent.type(box, 'segunda pergunta?{Enter}');
    await waitFor(() => expect(trail()).toBe('Inicial › Segunda'));
    expect(signals[0].aborted).toBe(true);
    expect(screen.getByText('cancelada')).toBeTruthy();
    expect(srcdoc(r.container)).toContain('<p>Segunda</p>');
    expect(screen.queryByText('Carregando…')).toBeNull();
  });

  it('clique de navegação cancela a pergunta em andamento', async () => {
    handler = (_n, signal) => hang(signal);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    const box = await askBox();
    await userEvent.type(box, 'primeira pergunta?{Enter}');
    await waitFor(() => expect(signals).toHaveLength(1));
    getActions.mockResolvedValue({ actions: [{ label: 'Contexto (C4)', spec: { k: 'ctx' } }] });
    await userEvent.click(screen.getByRole('button', { name: 'Explorador' }));
    await userEvent.click(await screen.findByText('Elem A'));
    await waitFor(() => expect(trail()).toBe('Inicial › ctx'));
    expect(signals[0].aborted).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Conversa e histórico' }));
    expect(screen.getByText('cancelada')).toBeTruthy();
  });

  it('busca do topo com pergunta vai para o agente', async () => {
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    await askBox();
    await userEvent.type(screen.getByLabelText('Buscar'), 'o que sustenta o checkout{Enter}');
    await waitFor(() => expect(trail()).toBe('Inicial › Resposta'));
    expect(bodies[0].question).toBe('o que sustenta o checkout');
    expect(find).not.toHaveBeenCalled();
  });

  it('busca do topo sem resultado por nome vira pergunta; nome com resultado segue a busca', async () => {
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    await askBox();
    find.mockResolvedValueOnce([]);
    await userEvent.type(screen.getByLabelText('Buscar'), 'pedidos{Enter}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(find).toHaveBeenCalledWith('b', 'pedidos');
  });

  it('clarify reenvia com a escolha', async () => {
    handler = (n) => (n === 1
      ? nd({ type: 'result', result: { kind: 'clarify', question: 'Qual?', options: [{ id: 'loja.pedidos', name: 'Pedidos', typeLabel: 'Sistema' }] } }, { type: 'done', metrics: { total: 1 } })
      : nd(...viewEv('Escolhida')));
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    const box = await askBox();
    await userEvent.type(box, 'quem usa pedidos?{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Pedidos · Sistema' }));
    await waitFor(() => expect(trail()).toBe('Inicial › Escolhida'));
    expect(bodies[1]).toMatchObject({ question: 'quem usa pedidos?', chosen: 'loja.pedidos' });
    expect(bodies[1].history).toEqual([{ question: 'quem usa pedidos?' }]);
  });

  it('erro do agente aparece no status e a navegação segue', async () => {
    handler = () => nd({ type: 'error', error: 'provedor fora do ar' }, { type: 'done', metrics: { total: 1 } });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    const box = await askBox();
    await userEvent.type(box, 'o que suporta o checkout?{Enter}');
    await waitFor(() => expect(document.querySelector('.status')!.textContent).toBe('provedor fora do ar'));
    getActions.mockResolvedValue({ actions: [{ label: 'Contexto (C4)', spec: { k: 'ctx' } }] });
    await userEvent.click(screen.getByRole('button', { name: 'Explorador' }));
    await userEvent.click(await screen.findByText('Elem B'));
    await waitFor(() => expect(trail()).toBe('Inicial › ctx'));
  });

  it('resultado element seleciona o elemento e abre os detalhes', async () => {
    handler = () => nd({ type: 'result', result: { kind: 'element', id: 'A' } }, { type: 'done', metrics: { total: 1 } });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Trilha' });
    const box = await askBox();
    getActions.mockResolvedValue({ actions: [{ label: 'Contexto (C4)', spec: { k: 'ctx' } }] });
    await userEvent.type(box, 'onde fica o elemento A?{Enter}');
    await waitFor(() => expect(getElement).toHaveBeenCalledWith('b', 'A'));
    await waitFor(() => expect(trail()).toBe('Inicial › ctx'));
  });
});
