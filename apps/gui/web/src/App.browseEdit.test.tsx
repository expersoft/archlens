import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  getBases: vi.fn(), getCatalog: vi.fn(), getView: vi.fn(), getElement: vi.fn(), getInfo: vi.fn(), getDoc: vi.fn(), getActions: vi.fn(),
  planElement: vi.fn(), planEdit: vi.fn(), planOpen: vi.fn(), planTurn: vi.fn(),
}));

vi.mock('./plan/PlanPreview', async () => {
  const { useEffect } = await import('react');
  const change = { sign: '~', kind: 'element', id: 'A', name: 'Elem A', type: 'Application Component', fields: [{ field: 'properties.dono', before: 'time', after: 'novo', origin: 'screen' }], origin: 'screen' };
  const result = { views: [], skipped: [], summary: '~1', report: null, changes: [change], questions: [] };
  return {
    PlanPreview: ({ draft, onLoaded }: { draft: unknown; onLoaded?: (r: unknown) => void }) => {
      useEffect(() => { onLoaded?.(draft ? result : null); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="preview-mock" />;
    },
  };
});

import * as api from './api';
import { load, save } from './plan/draftStore';
import { App } from './App';

const draft = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: 'n' };
const edited = { ...draft, edits: { A: { properties: { dono: 'novo' } } } };
const card = (props: Record<string, unknown> = { dono: 'time' }): api.Card => ({
  element: { id: 'A', name: 'Elem A', type: 'application-component', layer: 'application' }, parent: null, children: [], outgoing: {}, incoming: {}, properties: props,
});
const el = (over: Partial<api.PlanElement> = {}): api.PlanElement => ({ card: card(), doc: null, docRaw: null, docs: true, removed: false, ...over });
const view = (title: string): api.ViewResult => ({ html: `<p>${title}</p>`, data: null, alerts: [], nodes: [], ms: { resolve: 1, layout: 1, render: 1 }, spec: { level: 'landscape' }, title, cached: false });
const planInfo = { ask: { enabled: false }, plan: { enabled: true, maxRounds: 8, timeoutMs: 1000 } } as const;
const UNSAVED = 'O rascunho atual é grande demais para salvar; continue no Planejar';
const CHANGED = 'O rascunho mudou enquanto a edição era gravada; tente de novo';

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true, writable: true });
  vi.mocked(api.getBases).mockResolvedValue([{ id: 'b', name: 'B', ok: true }, { id: 'c', name: 'C', ok: true }]);
  vi.mocked(api.getCatalog).mockImplementation(async (id) => ({ id, name: id === 'b' ? 'Base' : 'Outra', views: [{ key: 'v', title: 'Inicial', spec: { level: 'landscape' }, saved: true }], elements: [{ id: 'A', name: 'Elem A', type: 't', layer: 'application' }] }));
  vi.mocked(api.getView).mockImplementation(async (b) => view(b === 'b' ? 'Inicial' : 'Nova'));
  vi.mocked(api.getElement).mockResolvedValue({ card: card(), actions: [], docs: true });
  vi.mocked(api.getDoc).mockResolvedValue({ text: null });
  vi.mocked(api.getInfo).mockResolvedValue(planInfo);
  vi.mocked(api.planElement).mockResolvedValue(el());
  vi.mocked(api.planOpen).mockImplementation(async (_b, d) => ({ draft: d }));
});
afterEach(() => vi.restoreAllMocks());

async function boot() {
  const r = render(<App />);
  await screen.findByRole('navigation', { name: 'Trilha' });
  await new Promise((res) => setTimeout(res, 50)); // deixa o srcDoc do jsdom terminar de carregar
  const frame = r.container.querySelector('iframe')!;
  const post = (data: Record<string, unknown>) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', ...data }, source: frame.contentWindow }));
  });
  return { post };
}
async function selectA() {
  const { post } = await boot();
  post({ type: 'select', id: 'A' });
  await screen.findByRole('heading', { name: 'Elem A' });
  return { post };
}
const editBtn = (what: 'propriedades' | 'documentação') => screen.findByRole('button', { name: `Editar ${what}` }) as Promise<HTMLButtonElement>;
async function editDono(value: string) {
  fireEvent.click(await editBtn('propriedades'));
  fireEvent.change(screen.getByLabelText('Valor de dono'), { target: { value } });
}
const confirmBtn = () => screen.getByRole('button', { name: 'Confirmar' });
const toPlan = () => fireEvent.click(screen.getByRole('button', { name: 'Planejar' }));
const toBrowse = () => fireEvent.click(screen.getByRole('button', { name: 'Navegar' }));

describe('App, editar o nó no Navegar', () => {
  it('com Planejar desligado o Navegar não mostra Editar', async () => {
    vi.mocked(api.getInfo).mockResolvedValue({ ask: { enabled: false } });
    await selectA();
    await screen.findByText('dono');
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escrever' })).toBeNull();
    expect(api.planElement).not.toHaveBeenCalled();
  });

  it('editar propriedade no Navegar e Confirmar leva ao Planejar na aba Nó com a mudança', async () => {
    vi.mocked(api.planEdit).mockResolvedValue({ draft: edited, opsHash: 'h', screenConflicts: [] });
    await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await screen.findByTestId('plan-view');
    expect(api.planEdit).toHaveBeenCalledWith('b', null, { op: 'properties', id: 'A', properties: { dono: 'novo' } });
    expect(load('b')?.draft).toEqual(edited);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Nó/ }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.queryByRole('navigation', { name: 'Trilha' })).toBeNull();
    expect(await screen.findByRole('tab', { name: 'Delta (1)' })).toBeTruthy();
    await waitFor(() => expect(vi.mocked(api.planElement).mock.calls.at(-1)?.slice(1)).toEqual([edited, 'A']));
  });

  it('com rascunho existente a edição se soma a ele', async () => {
    const withEdits = { ...draft, edits: { A: { properties: { canal: 'app' } } } };
    save('b', withEdits, [{ id: 1, role: 'user', text: 'oi' }]);
    vi.mocked(api.planElement).mockResolvedValue(el({ card: card({ dono: 'rascunho', canal: 'app' }) }));
    const merged = { ...draft, edits: { A: { properties: { canal: 'app', dono: 'novo' } } } };
    vi.mocked(api.planEdit).mockResolvedValue({ draft: merged, opsHash: 'h', screenConflicts: [] });
    await boot();
    toPlan(); // o PlanView já montado relê o salvo
    await screen.findByTestId('plan-view');
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await new Promise((res) => setTimeout(res, 50));
    const frame = document.querySelector('iframe')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'select', id: 'A' }, source: frame.contentWindow })); });
    fireEvent.click(await editBtn('propriedades'));
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('rascunho');
    fireEvent.change(screen.getByLabelText('Valor de dono'), { target: { value: 'novo' } });
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(2));
    expect(api.planEdit).toHaveBeenCalledWith('b', withEdits, { op: 'properties', id: 'A', properties: { canal: 'app', dono: 'novo' } });
    expect(vi.mocked(api.planOpen).mock.calls[1][1]).toEqual(merged);
    expect(await screen.findByText('oi')).toBeTruthy();
    expect(load('b')?.chat.map((m) => m.text)).toEqual(['oi']);
  });

  it('documentação editada no Navegar pelo editor ampliado vai para o rascunho', async () => {
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'antigo', docRaw: 'antigo [[B]]' }));
    vi.mocked(api.planEdit).mockResolvedValue({ draft: { ...draft, edits: { A: { doc: 'novo' } } }, opsHash: 'h', screenConflicts: [] });
    await selectA();
    fireEvent.click(await editBtn('documentação'));
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    const dlg = screen.getByRole('dialog');
    const ta = dlg.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('antigo [[B]]');
    fireEvent.change(ta, { target: { value: 'novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByTestId('plan-view');
    expect(api.planEdit).toHaveBeenCalledWith('b', null, { op: 'doc', id: 'A', text: 'novo' });
  });

  it('documentação vazia oferece Escrever', async () => {
    await selectA();
    fireEvent.click(await screen.findByRole('button', { name: 'Escrever' }));
    expect(screen.getByLabelText('Documentação')).toBeTruthy();
  });

  it('durante rodada do chat ou gravação o Editar do Navegar fica desabilitado com a dica', async () => {
    vi.mocked(api.planTurn).mockImplementation(() => new Promise(() => {}));
    await boot();
    toPlan();
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.planTurn).toHaveBeenCalled());
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await new Promise((res) => setTimeout(res, 50));
    const frame = document.querySelector('iframe')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'select', id: 'A' }, source: frame.contentWindow })); });
    const b = await editBtn('propriedades');
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('Aguarde o chat terminar para editar');
  });

  it('durante a espera, Editar fica desabilitado com a dica', async () => {
    const { post } = await selectA();
    expect((await editBtn('propriedades')).disabled).toBe(false);
    vi.mocked(api.getActions).mockResolvedValue({ actions: [{ label: 'Ver B', spec: { level: 'context', k: 'B' } }] });
    vi.mocked(api.getView).mockImplementation(() => new Promise(() => {}));
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    fireEvent.click(await screen.findByText('Ver B'));
    const b = await editBtn('propriedades');
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('Disponível quando a visão terminar de carregar');
  });

  it('documentação em edição: a visão nova chega e o texto continua', async () => {
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'antigo', docRaw: 'antigo' }));
    const { post } = await selectA();
    fireEvent.click(await editBtn('documentação'));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'rascunho' } });
    let finish!: (v: api.ViewResult) => void;
    vi.mocked(api.getActions).mockResolvedValue({ actions: [{ label: 'Ver B', spec: { level: 'context', k: 'B' } }] });
    vi.mocked(api.getView).mockImplementation(() => new Promise((r) => { finish = r; }));
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    fireEvent.click(await screen.findByText('Ver B'));
    const ta = () => screen.getByLabelText('Documentação') as HTMLTextAreaElement;
    await waitFor(() => expect(ta().readOnly).toBe(true));
    expect(ta().value).toBe('rascunho');
    expect(confirmBtn().hasAttribute('disabled')).toBe(true);
    await act(async () => { finish({ ...view('B'), data: { nodes: { A: { name: 'Elem A' } }, edges: [] } }); });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial › B'));
    post({ type: 'ready' }); // a página nova só avisa ready ao carregar (server/embed.test.mjs)
    await waitFor(() => expect(ta().readOnly).toBe(false));
    expect(ta().value).toBe('rascunho');
    expect(confirmBtn().hasAttribute('disabled')).toBe(false);
  });

  it('propriedades em edição: a visão nova chega e o texto continua', async () => {
    const { post } = await selectA();
    await editDono('rascunho');
    let finish!: (v: api.ViewResult) => void;
    vi.mocked(api.getActions).mockResolvedValue({ actions: [{ label: 'Ver B', spec: { level: 'context', k: 'B' } }] });
    vi.mocked(api.getView).mockImplementation(() => new Promise((r) => { finish = r; }));
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    fireEvent.click(await screen.findByText('Ver B'));
    const inp = () => screen.getByLabelText('Valor de dono') as HTMLInputElement;
    await waitFor(() => expect(inp().readOnly).toBe(true));
    expect(inp().value).toBe('rascunho');
    expect((screen.getByRole('button', { name: 'Remover dono' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '+ Adicionar propriedade' }) as HTMLButtonElement).disabled).toBe(true);
    expect(confirmBtn().hasAttribute('disabled')).toBe(true);
    await act(async () => { finish({ ...view('B'), data: { nodes: { A: { name: 'Elem A' } }, edges: [] } }); });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial › B'));
    post({ type: 'ready' }); // a página nova só avisa ready ao carregar (server/embed.test.mjs)
    await waitFor(() => expect(inp().readOnly).toBe(false));
    expect(inp().value).toBe('rascunho');
    expect(confirmBtn().hasAttribute('disabled')).toBe(false);
  });

  it('nó fora da visão nova: o painel continua no nó', async () => {
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'antigo', docRaw: 'antigo' }));
    const { post } = await selectA();
    fireEvent.click(await editBtn('documentação'));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'rascunho' } });
    let finish!: (v: api.ViewResult) => void;
    vi.mocked(api.getActions).mockResolvedValue({ actions: [{ label: 'Ver B', spec: { level: 'context', k: 'B' } }] });
    vi.mocked(api.getView).mockImplementation(() => new Promise((r) => { finish = r; }));
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    fireEvent.click(await screen.findByText('Ver B'));
    await act(async () => { finish({ ...view('B'), data: { nodes: { B: { name: 'Elem B' } }, edges: [] } }); });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial › B'));
    post({ type: 'ready' }); // a página nova só avisa ready ao carregar (server/embed.test.mjs)
    await act(async () => {}); // o ready não dispara nada assíncrono que tire o painel do nó
    expect(screen.getByRole('heading', { name: 'Elem A' })).toBeTruthy();
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('rascunho');
  });

  it('Explorador num nó fora da visão: select:null durante a espera não reenvia a seleção nem fecha o editor', async () => {
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'antigo', docRaw: 'antigo' }));
    await selectA(); // a visão inicial não desenha A
    fireEvent.click(await editBtn('documentação'));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'rascunho' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let finish!: (v: api.ViewResult) => void;
    vi.mocked(api.getActions).mockResolvedValue({ actions: [{ label: 'Contexto (C4)', spec: { level: 'context', k: 'A' } }] });
    vi.mocked(api.getView).mockImplementation(() => new Promise((r) => { finish = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Explorador' }));
    await waitFor(() => expect(document.querySelector('[data-id="A"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-id="A"]')!);
    await waitFor(() => expect(vi.mocked(api.getView)).toHaveBeenCalled());
    const frame = document.querySelector('iframe')!;
    const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
    const page = (data: Record<string, unknown>) => act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', ...data }, source: frame.contentWindow }));
    });
    page({ type: 'select', id: null }); // Esc no diagrama durante a espera
    page({ type: 'select', id: null });
    const selects = () => sent.mock.calls.map(([m]) => m as { type?: string; id?: string | null }).filter((m) => m.type === 'select');
    expect(selects()).toEqual([]);
    page({ type: 'select', id: 'B' }); // a página destacou outro nó: só o destaque é limpo
    expect(selects().map((m) => m.id)).toEqual([null]);
    page({ type: 'select', id: null }); // a resposta da página ao select(null)
    expect(selects().map((m) => m.id)).toEqual([null]);
    await act(async () => { finish({ ...view('Ctx A'), data: { nodes: { A: { name: 'Elem A' } }, edges: [] } }); });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial › Ctx A'));
    expect(screen.getByRole('heading', { name: 'Elem A' })).toBeTruthy();
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('rascunho');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Cancelar mantém a visão atual e a resposta tardia não entra', async () => {
    const { post } = await selectA();
    let finish!: (v: api.ViewResult) => void;
    vi.mocked(api.getActions).mockResolvedValue({ actions: [{ label: 'Ver B', spec: { level: 'context', k: 'B' } }] });
    vi.mocked(api.getView).mockImplementation(() => new Promise((r) => { finish = r; }));
    post({ type: 'context', id: 'A', x: 5, y: 5 });
    fireEvent.click(await screen.findByText('Ver B'));
    expect((await editBtn('propriedades')).disabled).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    await waitFor(async () => expect((await editBtn('propriedades')).disabled).toBe(false));
    await act(async () => { finish(view('B')); });
    expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Inicial');
    expect((await editBtn('propriedades')).disabled).toBe(false);
  });

  it('com o rascunho só em memória (grande demais) o Editar do Navegar fica desabilitado', async () => {
    save('b', draft, []);
    await boot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    toPlan();
    await screen.findByText('o rascunho não cabe no navegador; baixe-o para não perder o trabalho');
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await new Promise((res) => setTimeout(res, 50));
    const frame = document.querySelector('iframe')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'select', id: 'A' }, source: frame.contentWindow })); });
    const b = await editBtn('propriedades');
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(UNSAVED);
  });

  it('nó removido pelo rascunho mostra o aviso e não edita', async () => {
    save('b', draft, []);
    vi.mocked(api.planElement).mockResolvedValue(el({ removed: true, doc: 'x', docRaw: 'x' }));
    await selectA();
    expect(await screen.findByText(/removido pelo rascunho/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escrever' })).toBeNull();
  });

  it('rascunho salvo inválido: erro no cartão, sem trocar de modo', async () => {
    const bad = { 'archlens-draft': 99, outro: true };
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(bad));
    vi.mocked(api.planElement).mockRejectedValue(new api.ApiError('rascunho de outra versão', 'E_DRAFT', 400));
    vi.mocked(api.planEdit).mockRejectedValue(new api.ApiError('rascunho de outra versão', 'E_DRAFT', 400));
    await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    expect(vi.mocked(api.planEdit).mock.calls[0][1]).toEqual(bad);
    expect((await screen.findAllByText('rascunho de outra versão')).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy();
    expect(screen.queryByTestId('plan-view')).toBeNull();
    expect(screen.getByLabelText('Valor de dono')).toBeTruthy(); // o editor continua com o texto
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(bad);
  });

  it('trocar de base com editor sujo pergunta e não grava na outra base', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await selectA();
    await editDono('novo');
    const sel = screen.getByLabelText('Base') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'c' } });
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('novo');
    ask.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText('Base'), { target: { value: 'c' } });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Nova'));
    expect(screen.queryByLabelText('Valor de dono')).toBeNull();
    expect(api.planEdit).not.toHaveBeenCalled();
    expect(load('b')).toBeNull();
    expect(load('c')).toBeNull();
  });

  it('trocar de nó com editor sujo pergunta antes', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { post } = await selectA();
    await editDono('novo');
    post({ type: 'select', id: 'B' });
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('novo');
  });

  it('enquanto a edição do Navegar é gravada, o Planejar não começa rodada nem outra gravação', async () => {
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    save('b', draft, []);
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'x', docRaw: 'x' }));
    await boot();
    toPlan(); // o PlanView monta
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await new Promise((res) => setTimeout(res, 50));
    const frame = document.querySelector('iframe')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'select', id: 'A' }, source: frame.contentWindow })); });
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    toPlan(); // bloqueado até a gravação voltar: o Planejar escondido continua travado
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'adicione X' } });
    expect((screen.getByRole('button', { name: 'Enviar', hidden: true }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Mensagem'), { key: 'Enter', ctrlKey: true });
    expect(api.planTurn).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Abrir rascunho') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Descartar rascunho', hidden: true }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ draft: edited, opsHash: 'h', screenConflicts: [] }); });
    await waitFor(() => expect(load('b')?.draft).toEqual(edited));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('durante a gravação do Navegar, outro nó, Planejar e esconder o painel ficam bloqueados; a falha mostra o erro e o texto fica', async () => {
    let fail!: (e: unknown) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((_r, j) => { fail = j; }));
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { post } = await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    post({ type: 'select', id: 'B' });
    toPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true });
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByText('Aguarde a gravação terminar')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy();
    expect(screen.queryByTestId('plan-view')).toBeNull();
    expect(screen.getByTestId('side-right')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Elem A' })).toBeTruthy();
    await act(async () => { fail(new Error('recusada')); });
    expect((await screen.findByRole('alert')).textContent).toBe('recusada');
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('novo');
    expect(screen.queryByText('Aguarde a gravação terminar')).toBeNull();
    expect(load('b')).toBeNull();
  });

  it('esconder o painel direito com o editor sujo pergunta antes; confirmando, fecha o editor', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { post } = await selectA();
    await editDono('novo');
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true });
    expect(ask).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('novo');
    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(screen.queryByTestId('side-right')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(await editBtn('propriedades')).toBeTruthy();
    expect(screen.queryByLabelText('Valor de dono')).toBeNull();
    post({ type: 'select', id: 'B' }); // a edição descartada não deixa o editor "sujo"
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it('Apresentar com o editor sujo pergunta antes; confirmando, fecha o editor', async () => {
    const full = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLIFrameElement.prototype, 'requestFullscreen', { value: full, configurable: true, writable: true });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await selectA();
    await editDono('novo');
    fireEvent.click(screen.getByRole('button', { name: 'Apresentar' }));
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
    expect(full).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Valor de dono') as HTMLInputElement).value).toBe('novo');
    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apresentar' }));
    expect(full).toHaveBeenCalled();
    expect(screen.queryByLabelText('Valor de dono')).toBeNull();
  });

  it('falha ao confirmar no editor ampliado do Navegar: o erro aparece na janela', async () => {
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'antigo', docRaw: 'antigo' }));
    vi.mocked(api.planEdit).mockRejectedValue(new Error('marcador do archlens'));
    await selectA();
    fireEvent.click(await editBtn('documentação'));
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(dlg.querySelector('textarea')!, { target: { value: 'novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(dlg.querySelector('.doc-win-f [role="alert"]')?.textContent).toBe('marcador do archlens'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect((dlg.querySelector('textarea') as HTMLTextAreaElement).value).toBe('novo');
  });

  it('a conversa salva cortada ao guardar a edição de outra base é avisada no Navegar', async () => {
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    save('b', draft, [{ id: 1, role: 'user', text: 'oi' }]);
    await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Base'), { target: { value: 'c' } });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Nova'));
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('archlens-gui-chat:')) throw new Error('cheio');
      real.call(this, k, v);
    });
    await act(async () => { finish({ draft: edited, opsHash: 'h', screenConflicts: [] }); });
    expect(await screen.findByText(/A edição foi guardada no rascunho de B; a conversa antiga foi cortada para caber no navegador/)).toBeTruthy();
    expect(load('b')?.draft).toEqual(edited);
  });

  it('depois de Descartar no Planejar, o Navegar edita a partir do nó sem o rascunho', async () => {
    save('b', edited, []);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    // sem rascunho (depois do Descartar) o servidor demora: até responder, o Navegar não edita o que mostrava antes
    vi.mocked(api.planElement).mockImplementation(async (_b, d) => {
      if (!d) await gate;
      return el({ doc: d ? 'rascunho' : 'base', docRaw: d ? 'rascunho' : 'base' });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await boot();
    toPlan(); // o PlanView monta (e abre o rascunho) antes
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Descartar rascunho' }) as HTMLButtonElement).disabled).toBe(false));
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await new Promise((res) => setTimeout(res, 50));
    const frame = document.querySelector('iframe')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'select', id: 'A' }, source: frame.contentWindow })); });
    fireEvent.click(await editBtn('documentação'));
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('rascunho');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    toPlan();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Descartar rascunho' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    await waitFor(() => expect(load('b')).toBeNull());
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await screen.findByRole('heading', { name: 'Elem A' });
    expect(screen.queryByRole('button', { name: 'Editar documentação' })).toBeNull();
    await act(async () => { release(); });
    fireEvent.click(await editBtn('documentação'));
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('base');
  });

  it('o rascunho mudou enquanto a edição do Navegar era gravada: erro e nada gravado', async () => {
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    save('b', draft, []);
    await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    const other = { ...draft, note: 'de outra aba' };
    save('b', other, []);
    await act(async () => { finish({ draft: edited, opsHash: 'h', screenConflicts: [] }); });
    expect(await screen.findByText(CHANGED)).toBeTruthy();
    expect(load('b')?.draft).toEqual(other);
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy();
  });

  it('base trocada durante a gravação: a edição vai para o rascunho da base de origem e a nova base avisa', async () => {
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Base'), { target: { value: 'c' } });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Nova'));
    await act(async () => { finish({ draft: edited, opsHash: 'h', screenConflicts: [] }); });
    expect(await screen.findByText('A edição foi guardada no rascunho de B')).toBeTruthy();
    expect(load('b')?.draft).toEqual(edited);
    expect(load('c')).toBeNull();
    expect(screen.queryByTestId('plan-view')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy();
  });

  it('base trocada durante a gravação e o servidor recusa: o erro aparece na nova base', async () => {
    let fail!: (e: unknown) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((_r, j) => { fail = j; }));
    await selectA();
    await editDono('novo');
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Base'), { target: { value: 'c' } });
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Trilha' }).textContent).toBe('Nova'));
    await act(async () => { fail(new Error('recusada')); });
    expect(await screen.findByText(/recusada/)).toBeTruthy();
    expect(load('b')).toBeNull();
  });

  it('com o Planejar na tela, o Navegar não relê o nó', async () => {
    vi.mocked(api.planTurn).mockImplementation(() => new Promise(() => {}));
    await selectA();
    await waitFor(() => expect(api.planElement).toHaveBeenCalled());
    const before = vi.mocked(api.planElement).mock.calls.length;
    toPlan();
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.planTurn).toHaveBeenCalled());
    await new Promise((res) => setTimeout(res, 30));
    expect(vi.mocked(api.planElement).mock.calls.length).toBe(before);
  });

  it('releitura que falha com o editor de documentação aberto não fecha o editor', async () => {
    vi.mocked(api.planTurn).mockImplementation(() => new Promise(() => {}));
    save('b', draft, []);
    vi.mocked(api.planElement).mockResolvedValue(el({ doc: 'antigo', docRaw: 'antigo' }));
    await boot();
    toPlan(); // o PlanView monta e fica escondido no Navegar
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    toBrowse();
    await screen.findByRole('navigation', { name: 'Trilha' });
    await new Promise((res) => setTimeout(res, 50));
    const frame = document.querySelector('iframe')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'select', id: 'A' }, source: frame.contentWindow })); });
    fireEvent.click(await editBtn('documentação'));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'meu texto' } });
    vi.mocked(api.planElement).mockRejectedValue(new Error('falhou'));
    const calls = vi.mocked(api.planElement).mock.calls.length;
    // uma rodada começa no Planejar escondido: o lock muda e o Navegar relê
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'oi' } });
    fireEvent.keyDown(screen.getByLabelText('Mensagem'), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(vi.mocked(api.planElement).mock.calls.length).toBeGreaterThan(calls));
    await new Promise((res) => setTimeout(res, 30));
    expect((screen.getAllByLabelText('Documentação').find((x) => x.tagName === 'TEXTAREA' && !x.closest('[hidden]')) as HTMLTextAreaElement).value).toBe('meu texto');
  });
});
