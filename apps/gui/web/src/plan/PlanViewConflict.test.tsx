import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planEdit: vi.fn(), planOpen: vi.fn(), planTurn: vi.fn() }));
const shown: api.PlanPreviewResult = {
  views: [], skipped: [], summary: '~1', report: null, opsHash: 'h', questions: [],
  changes: [{ sign: '~', kind: 'element', id: 'a', name: 'Cashback', origin: 'tela', fields: [] }],
  screenConflicts: [{ id: 'a', field: 'properties.dono', mine: 'time', theirs: 'squad' }],
};
vi.mock('./PlanPreview', () => ({
  PlanPreview: ({ onLoaded }: { onLoaded?: (r: unknown) => void }) => <button type="button" onClick={() => onLoaded?.(globalThis.__shown)}>carregar prévia</button>,
}));

import * as api from '../api';
import { save } from './draftStore';
import { PlanView } from './PlanView';

declare global { var __shown: unknown; }
const draft = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: { x: 1 }, plan: null, note: 'n' };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('archlens-plan-delta', 'true');
  save('b', draft, []);
  globalThis.__shown = shown;
  vi.mocked(api.planOpen).mockResolvedValue({ draft, opsHash: 'h', screenConflicts: shown.screenConflicts } as never);
});
afterEach(() => vi.restoreAllMocks());

const load = async () => {
  render(<PlanView base="b" />);
  fireEvent.click(screen.getByText('carregar prévia'));
  return screen.findByRole('dialog', { name: /O chat quer mudar/ });
};

describe('PlanView com conflito de tela', () => {
  it('Aplicar fica desabilitado com conflito pendente', async () => {
    await load();
    const btn = screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('O chat quer mudar algo que você editou; responda o aviso antes de aplicar');
  });

  it('Manter o seu chama resolve mine; Usar o do chat chama resolve theirs', async () => {
    vi.mocked(api.planEdit).mockResolvedValue({ draft, opsHash: 'h', screenConflicts: [] });
    await load();
    expect(screen.getByRole('dialog').textContent).toContain('Cashback');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.planEdit).toHaveBeenCalledWith('b', draft, { op: 'resolve', id: 'a', field: 'properties.dono', choice: 'mine' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /O chat quer mudar/ })).toBeNull());

    fireEvent.click(screen.getByText('carregar prévia'));
    await screen.findByRole('dialog', { name: /O chat quer mudar/ });
    fireEvent.click(screen.getByLabelText('Usar o do chat'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.planEdit).toHaveBeenLastCalledWith('b', draft, { op: 'resolve', id: 'a', field: 'properties.dono', choice: 'theirs' }));
  });

  it('desfazer no Delta chama planEdit com { op: "undo", id }', async () => {
    globalThis.__shown = { ...shown, screenConflicts: [] };
    vi.mocked(api.planOpen).mockResolvedValue({ draft, opsHash: 'h', screenConflicts: [] } as never);
    vi.mocked(api.planEdit).mockResolvedValue({ draft, opsHash: 'h', screenConflicts: [] });
    render(<PlanView base="b" />);
    fireEvent.click(screen.getByText('carregar prévia'));
    fireEvent.click(await screen.findByRole('button', { name: /desfazer/ }));
    await waitFor(() => expect(api.planEdit).toHaveBeenCalledWith('b', draft, { op: 'undo', id: 'a' }));
  });
});
