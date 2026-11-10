import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
// @ts-expect-error -- módulo JS do servidor, sem declaração de tipos: o teste usa a regra de verdade
import { applyEdit, screenConflicts } from '../../../server/plan/edits.mjs';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planElement: vi.fn(), planEdit: vi.fn(), planOpen: vi.fn(), planTurn: vi.fn() }));
vi.mock('./PlanPreview', () => ({
  PlanPreview: ({ onSelect, onLoaded }: { onSelect?: (id: string | null) => void; onLoaded?: (r: null) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect?.('a')}>selecionar a</button>
      <button type="button" onClick={() => onLoaded?.(null)}>recarregar prévia</button>
    </div>
  ),
}));

import * as api from '../api';
import { save } from './draftStore';
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
