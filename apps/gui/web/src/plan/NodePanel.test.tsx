import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planElement: vi.fn() }));

import * as api from '../api';
import { NodePanel } from './NodePanel';

const draft = (n = 0) => ({ 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: `n${n}` });
const card = (id: string, name: string): api.Card => ({
  element: { id, name, type: 'application-component', layer: 'application', typeLabel: 'Application Component' },
  parent: null, children: [], outgoing: {}, incoming: {}, properties: { dono: 'time' },
});
const el = (id: string, name: string, over: Partial<api.PlanElement> = {}): api.PlanElement => ({ card: card(id, name), doc: null, docRaw: null, docs: false, removed: false, ...over });
const planElement = vi.mocked(api.planElement);

beforeEach(() => { vi.resetAllMocks(); });

describe('NodePanel', () => {
  it('sem nó selecionado pede para selecionar na prévia', () => {
    render(<NodePanel base="b" draft={draft()} id={null} onDraft={() => {}} />);
    expect(screen.getByText(/Selecione um nó/)).toBeTruthy();
    expect(planElement).not.toHaveBeenCalled();
  });

  it('mostra o cartão do planElement e a documentação do rascunho sem buscar a da base', async () => {
    planElement.mockResolvedValue(el('a', 'Cashback', { doc: 'Texto do rascunho', docs: true }));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Cashback' })).toBeTruthy();
    expect(screen.getByText('time')).toBeTruthy();
    expect(await screen.findByText('Texto do rascunho')).toBeTruthy();
    expect(planElement).toHaveBeenCalledWith('b', draft(), 'a');
  });

  it('recarrega quando o rascunho muda e descarta a resposta atrasada', async () => {
    let slow!: (r: api.PlanElement) => void;
    planElement.mockImplementationOnce(() => new Promise((r) => { slow = r; }));
    planElement.mockResolvedValueOnce(el('a', 'Novo nome'));
    const { rerender } = render(<NodePanel base="b" draft={draft(1)} id="a" onDraft={() => {}} />);
    rerender(<NodePanel base="b" draft={draft(2)} id="a" onDraft={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Novo nome' })).toBeTruthy();
    slow(el('a', 'Nome velho'));
    await waitFor(() => expect(screen.queryByText('Nome velho')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Novo nome' })).toBeTruthy();
  });

  it('nó removido pelo rascunho aparece sem Editar', async () => {
    planElement.mockResolvedValue(el('a', 'Legado', { removed: true, docs: true }));
    render(<NodePanel base="b" draft={draft()} id="a" onDraft={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Legado' })).toBeTruthy();
    expect(screen.getByText(/removido pelo rascunho/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });

  it('mostra o erro do servidor', async () => {
    planElement.mockRejectedValue(new Error('nó não existe'));
    render(<NodePanel base="b" draft={draft()} id="zzz" onDraft={() => {}} />);
    expect(await screen.findByText('nó não existe')).toBeTruthy();
  });
});
