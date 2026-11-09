import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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
});
