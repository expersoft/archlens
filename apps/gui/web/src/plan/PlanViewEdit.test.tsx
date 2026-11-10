import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
// @ts-expect-error -- módulo JS do servidor, sem declaração de tipos: o teste usa a regra de verdade
import { applyEdit, screenConflicts } from '../../../server/plan/edits.mjs';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planElement: vi.fn(), planEdit: vi.fn(), planOpen: vi.fn(), planTurn: vi.fn(), planApply: vi.fn() }));
const FINAL = { views: [], skipped: [], summary: 'resumo', changes: [], questions: [], report: null, opsHash: 'h', screenConflicts: [] };
vi.mock('./PlanPreview', () => ({
  PlanPreview: ({ onSelect, onLoaded, onLoading }: { onSelect?: (id: string | null) => void; onLoaded?: (r: unknown) => void; onLoading?: (on: boolean) => void }) => (
    <div>
      <button type="button" onClick={() => onLoading?.(true)}>prévia carregando</button>
      <button type="button" onClick={() => onLoading?.(false)}>prévia chegou</button>
      <button type="button" onClick={() => onSelect?.('a')}>selecionar a</button>
      <button type="button" onClick={() => onLoaded?.(null)}>recarregar prévia</button>
      <button type="button" onClick={() => onLoaded?.(FINAL)}>prévia final</button>
    </div>
  ),
}));

import * as api from '../api';
import { load, save } from './draftStore';
import { PlanView } from './PlanView';

const draft = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: 'n' };
const card: api.Card = {
  element: { id: 'a', name: 'Cashback', type: 'application-component', layer: 'application' },
  parent: { id: 'p', name: 'Pai' } as api.Card['parent'], children: [], outgoing: {}, incoming: {}, properties: { dono: 'time' },
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  save('b', draft, []);
  vi.mocked(api.planOpen).mockResolvedValue({ draft, previews: [] } as never);
  vi.mocked(api.planElement).mockResolvedValue({ card, doc: 'x', docRaw: 'x', docs: true, removed: false });
});
afterEach(() => vi.restoreAllMocks());

const openEditor = async () => {
  render(<PlanView base="b" />);
  fireEvent.click(screen.getByText('selecionar a'));
  await screen.findByRole('heading', { name: 'Cashback' });
  fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
  fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'novo texto' } });
};

describe('PlanView com o editor do nó', () => {
  it('durante a prévia, Editar do painel Nó fica em pausa com a dica', async () => {
    render(<PlanView base="b" />);
    fireEvent.click(screen.getByText('selecionar a'));
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByText('prévia carregando'));
    const edit = screen.getByRole('button', { name: /Editar documentação/ }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe('Disponível quando a visão terminar de carregar');
    fireEvent.click(screen.getByText('prévia chegou'));
    expect((screen.getByRole('button', { name: /Editar documentação/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('o editor continua aberto, com o texto, quando o PlanView renderiza de novo', async () => {
    await openEditor();
    fireEvent.click(screen.getByText('recarregar prévia'));
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('novo texto');
  });

  it('trocar de nó pelo painel com texto não confirmado pergunta uma só vez', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: /Na base/ }));
    fireEvent.click(screen.getByText('Pai', { selector: 'dd' }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
  });

  it('com o Confirmar gravando, enviar, responder, Abrir e Descartar esperam; a rodada só começa depois', async () => {
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    vi.mocked(api.planTurn).mockResolvedValue(undefined as never);
    const item = { n: 1, key: 'k1', question: 'Mesmo elemento?', options: ['merge', 'new'], recommendation: 'merge', reason: '' };
    save('b', draft, [{ id: 1, role: 'assistant', text: 'Mesmo elemento?', item }]);
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'adicione X' } });
    const send = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Mensagem'), { key: 'Enter', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'new' }));
    expect(api.planTurn).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'new' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Abrir rascunho') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Descartar rascunho' }) as HTMLButtonElement).disabled).toBe(true);
    const edited = { ...draft, edits: { a: { doc: 'novo texto' } } };
    finish({ draft: edited, opsHash: 'h', screenConflicts: [] } as never);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.planTurn).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.planTurn).mock.calls[0][1].draft).toEqual(edited);
  });

  it('editar a documentação que o chat escreveu não abre o aviso de conflito', async () => {
    const chatDraft = { ...draft, delta: { 'archlens-delta': '1.0', model: { elements: [] }, docs: [{ id: 'a', text: 'x' }] }, edits: {}, kept: [] };
    save('b', chatDraft, []);
    vi.mocked(api.planOpen).mockResolvedValue({ draft: chatDraft, previews: [] } as never);
    // o servidor de verdade: a camada da tela e o cálculo dos conflitos
    vi.mocked(api.planEdit).mockImplementation(async (_b, d, e) => {
      const next = applyEdit(d, e, {});
      return { draft: next, opsHash: 'h', screenConflicts: screenConflicts(next.delta, next.edits, next.kept) } as never;
    });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.planEdit).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('Documentação')).toBeNull());
    expect(screen.queryByRole('dialog', { name: /O chat quer mudar/ })).toBeNull();
  });

  it('editar outra propriedade do nó com aviso pendente não fecha o aviso nem libera o Aplicar', async () => {
    const pending = {
      ...draft,
      delta: { 'archlens-delta': '1.0', model: { elements: [{ id: 'a', properties: { dono: 'squad' } }] } },
      edits: { a: { properties: { dono: 'time' } } },
      kept: [{ id: 'a', field: 'properties.dono', value: 'tribo' }],
    };
    save('b', pending, []);
    vi.mocked(api.planOpen).mockResolvedValue({ draft: pending, screenConflicts: screenConflicts(pending.delta, pending.edits, pending.kept) } as never);
    // o servidor de verdade: a camada da tela e o cálculo dos conflitos
    vi.mocked(api.planEdit).mockImplementation(async (_b, d, e) => {
      const next = applyEdit(d, e, {});
      return { draft: next, opsHash: 'h', screenConflicts: screenConflicts(next.delta, next.edits, next.kept) } as never;
    });
    render(<PlanView base="b" />);
    await screen.findByRole('dialog', { name: /O chat quer mudar/ });
    fireEvent.click(screen.getByText('selecionar a'));
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByRole('button', { name: /Editar propriedades/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar propriedade' }));
    fireEvent.change(screen.getByLabelText('Nova chave'), { target: { value: 'canal' } });
    fireEvent.change(screen.getByLabelText('Valor de canal'), { target: { value: 'app' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' }).find((b) => !b.closest('[role="dialog"]'))!);
    await waitFor(() => expect(api.planEdit).toHaveBeenCalledWith('b', pending, { op: 'properties', id: 'a', properties: { dono: 'time', canal: 'app' } }));
    await waitFor(() => expect(screen.queryByLabelText('Nova chave')).toBeNull());
    expect(screen.getByRole('dialog', { name: /O chat quer mudar/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement).title).toBe('O chat quer mudar algo que você editou; responda o aviso antes de aplicar');
  });

  it('com o Confirmar gravando, as dicas pedem para esperar a gravação, não o chat', async () => {
    vi.mocked(api.planEdit).mockImplementation(() => new Promise(() => {}));
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /Editar propriedades/ }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: /Editar propriedades/ }) as HTMLButtonElement).title).toBe('Aguarde a gravação terminar');
  });
});

describe('PlanView falando com o App', () => {
  it('onBusy informa chat e gravação', async () => {
    const onBusy = vi.fn();
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    let events!: (e: api.PlanEvent) => void;
    let ended!: () => void;
    vi.mocked(api.planTurn).mockImplementation((_b, _r, onEvent) => { events = onEvent; return new Promise((r) => { ended = () => r(undefined as never); }); });
    render(<PlanView base="b" onBusy={onBusy} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalled());
    expect(onBusy).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByText('selecionar a'));
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'novo texto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith('save'));
    finish({ draft, opsHash: 'h', screenConflicts: [] } as never);
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'adicione X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith('chat'));
    events({ type: 'result', draft, reply: { kind: 'text', text: 'feito' }, previews: [] } as never);
    ended();
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
  });

  it('reload adota o rascunho salvo por fora', async () => {
    const { rerender } = render(<PlanView base="b" reload={0} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    // o Navegar grava o rascunho e a conversa por fora
    const outside = { ...draft, note: 'de fora', edits: { a: { properties: { dono: 'outro' } } } };
    const replanned = { ...outside, plan: { state: 'final' } };
    save('b', outside, [{ id: 7, role: 'assistant', text: 'conversa salva' }]);
    vi.mocked(api.planOpen).mockResolvedValue({ draft: replanned, screenConflicts: [] } as never);
    rerender(<PlanView base="b" reload={1} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.planOpen).mock.calls[1][1]).toEqual(outside);
    expect(await screen.findByText('conversa salva')).toBeTruthy();
    await waitFor(() => expect(load('b')?.draft).toEqual(replanned));
    expect(load('b')?.chat.map((m) => m.text)).toEqual(['conversa salva']);
    // a próxima rodada parte do rascunho adotado
    vi.mocked(api.planTurn).mockResolvedValue(undefined as never);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'continue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.planTurn).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.planTurn).mock.calls[0][1].draft).toEqual(replanned);
  });

  it('reload durante a rodada espera ela terminar', async () => {
    let events!: (e: api.PlanEvent) => void;
    let ended!: () => void;
    vi.mocked(api.planTurn).mockImplementation((_b, _r, onEvent) => { events = onEvent; return new Promise((r) => { ended = () => r(undefined as never); }); });
    const { rerender } = render(<PlanView base="b" reload={0} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'adicione X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.planTurn).toHaveBeenCalled());
    // o rascunho que o reload traz é o salvo quando ele chega, não o que a rodada grava ao terminar
    const outside = { ...draft, note: 'de fora' };
    save('b', outside, load('b')?.chat ?? []);
    rerender(<PlanView base="b" reload={1} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.planOpen).toHaveBeenCalledTimes(1);
    events({ type: 'result', draft: { ...draft, note: 'da rodada' }, reply: { kind: 'text', text: 'feito' }, previews: [] } as never);
    ended();
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.planOpen).mock.calls[1][1]).toEqual(outside);
    expect(screen.getByText('feito')).toBeTruthy();
  });

  it('focusNode abre a aba Nó no nó', async () => {
    const { rerender } = render(<PlanView base="b" />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalled());
    rerender(<PlanView base="b" focusNode={{ id: 'a', n: 1 }} />);
    await screen.findByRole('heading', { name: 'Cashback' });
    expect(screen.getByRole('tab', { name: /Nó/ }).getAttribute('aria-selected')).toBe('true');
    expect(vi.mocked(api.planElement).mock.calls.at(-1)?.[2]).toBe('a');
  });

  it('focusNode com a edição não confirmada pergunta antes de trocar', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { rerender } = render(<PlanView base="b" />);
    fireEvent.click(screen.getByText('selecionar a'));
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'novo texto' } });
    rerender(<PlanView base="b" focusNode={{ id: 'p', n: 1 }} />);
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('novo texto');
  });
});

describe('PlanView falando com o App: aplicar, conversa e rascunho só em memória', () => {
  it('reload durante o Aplicar espera ele terminar e o rascunho adotado fica', async () => {
    const onBusy = vi.fn();
    let finish!: (r: Awaited<ReturnType<typeof api.planApply>>) => void;
    vi.mocked(api.planApply).mockImplementation(() => new Promise((r) => { finish = r; }));
    const { rerender } = render(<PlanView base="b" reload={0} onBusy={onBusy} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('prévia final'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await waitFor(() => expect(api.planApply).toHaveBeenCalled());
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith('save'));
    const outside = { ...draft, note: 'de fora' };
    const replanned = { ...outside, plan: { state: 'final' } };
    save('b', outside, []);
    vi.mocked(api.planOpen).mockResolvedValue({ draft: replanned, screenConflicts: [] } as never);
    rerender(<PlanView base="b" reload={1} onBusy={onBusy} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.planOpen).toHaveBeenCalledTimes(1);
    finish({ entry: { summary: 's', added: [], changed: [], removed: [] }, doc: 'ARCHITECTURE.md', build: null, preserved: [], notesDraftNeeded: false } as never);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.planOpen).mock.calls[1][1]).toEqual(outside);
    await waitFor(() => expect(load('b')?.draft).toEqual(replanned));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
  });

  it('reload mantém as mensagens da conversa que estavam só em memória', async () => {
    vi.mocked(api.planOpen).mockResolvedValue({ draft, warning: 'aviso só em memória' } as never);
    const { rerender } = render(<PlanView base="b" reload={0} />);
    await screen.findByText('aviso só em memória');
    save('b', { ...draft, note: 'de fora' }, [{ id: 7, role: 'assistant', text: 'conversa salva' }]);
    vi.mocked(api.planOpen).mockResolvedValue({ draft: { ...draft, note: 'de fora' } } as never);
    rerender(<PlanView base="b" reload={1} />);
    await screen.findByText('conversa salva');
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(2));
    expect(screen.getByText('aviso só em memória')).toBeTruthy();
    // em ordem de id: o aviso (id 1) nasceu antes da mensagem salva por fora (id 7)
    await waitFor(() => expect(load('b')?.chat.map((m) => m.warning ?? m.text)).toEqual(['aviso só em memória', 'conversa salva']));
  });

  it('desmontar ocupado avisa que não está mais ocupado', async () => {
    const onBusy = vi.fn();
    vi.mocked(api.planEdit).mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(<PlanView base="b" onBusy={onBusy} />);
    fireEvent.click(screen.getByText('selecionar a'));
    await screen.findByRole('heading', { name: 'Cashback' });
    fireEvent.click(screen.getByRole('button', { name: /Editar documentação/ }));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'novo texto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith('save'));
    unmount();
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });

  it('com o rascunho só em memória (grande demais), reload não o troca e avisa o App', async () => {
    const onUnsaved = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    const kept = { ...draft, note: 'só em memória' };
    vi.mocked(api.planOpen).mockResolvedValue({ draft: kept } as never);
    const { rerender } = render(<PlanView base="b" reload={0} onUnsaved={onUnsaved} />);
    await screen.findByText('o rascunho não cabe no navegador; baixe-o para não perder o trabalho');
    await waitFor(() => expect(onUnsaved).toHaveBeenLastCalledWith(true));
    setItem.mockRestore();
    save('b', { ...draft, note: 'de fora' }, []);
    rerender(<PlanView base="b" reload={1} onUnsaved={onUnsaved} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.planOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('o rascunho não cabe no navegador; baixe-o para não perder o trabalho')).toBeTruthy();
    vi.mocked(api.planTurn).mockResolvedValue(undefined as never);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'continue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.planTurn).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.planTurn).mock.calls[0][1].draft).toEqual(kept);
  });
});

describe('PlanView com uma gravação do Navegar em andamento', () => {
  it('externalLock: nenhuma rodada, Aplicar, Abrir, Descartar ou edição do nó começa', async () => {
    const onBusy = vi.fn();
    vi.mocked(api.planTurn).mockResolvedValue(undefined as never);
    const item = { n: 1, key: 'k1', question: 'Mesmo elemento?', options: ['merge', 'new'], recommendation: 'merge', reason: '' };
    save('b', draft, [{ id: 1, role: 'assistant', text: 'Mesmo elemento?', item }]);
    const { rerender } = render(<PlanView base="b" externalLock onBusy={onBusy} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalled());
    fireEvent.click(screen.getByText('prévia final'));
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'adicione X' } });
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Mensagem'), { key: 'Enter', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'new' }));
    expect(api.planTurn).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Abrir rascunho') as HTMLInputElement).disabled).toBe(true);
    const discard = screen.getByRole('button', { name: 'Descartar rascunho' }) as HTMLButtonElement;
    expect(discard.disabled).toBe(true);
    const applyBtn = screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(applyBtn.title).toBe('Aguarde a gravação terminar');
    fireEvent.click(screen.getByText('selecionar a'));
    await screen.findByRole('heading', { name: 'Cashback' });
    const edit = screen.getByRole('button', { name: /Editar documentação/ }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe('Aguarde a gravação terminar');
    // o App não vê o próprio Navegar como ocupação do Planejar
    expect(onBusy).not.toHaveBeenCalledWith('save');
    rerender(<PlanView base="b" externalLock={false} onBusy={onBusy} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole('button', { name: /Editar documentação/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reload com a conversa salva cortada mantém a ordem das mensagens', async () => {
    save('b', draft, [{ id: 1, role: 'user', text: 'um' }, { id: 2, role: 'assistant', text: 'dois' }, { id: 3, role: 'user', text: 'três' }]);
    const { rerender } = render(<PlanView base="b" reload={0} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(1));
    // o Navegar gravou com a conversa cortada para caber: só a mais nova ficou
    save('b', { ...draft, note: 'de fora' }, [{ id: 3, role: 'user', text: 'três' }]);
    rerender(<PlanView base="b" reload={1} />);
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledTimes(2));
    const texts = ['um', 'dois', 'três'].map((t) => screen.getByText(t));
    expect(texts[0].compareDocumentPosition(texts[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(texts[1].compareDocumentPosition(texts[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(load('b')?.chat.map((m) => m.text)).toEqual(['um', 'dois', 'três']));
  });
});
