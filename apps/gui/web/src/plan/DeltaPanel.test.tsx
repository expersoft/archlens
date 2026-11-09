import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlanPreviewResult } from '../api';
import { DeltaPanel } from './DeltaPanel';

const result: PlanPreviewResult = {
  views: [], skipped: [], summary: '+1 ~1 −1', report: null,
  changes: [
    { sign: '+', kind: 'element', id: 'a', name: 'Cashback', type: 'Application Component', description: 'Saldo de cashback', fields: [], origin: 'chat' },
    { sign: '~', kind: 'element', id: 'b', name: 'Checkout', type: 'Application Component', fields: [{ field: 'description', before: 'velha', after: 'nova', origin: 'chat' }], origin: 'chat' },
    { sign: '−', kind: 'relationship', id: 'r', name: 'Checkout → Gateway', type: 'serving', ends: ['b', 'g'], fields: [], origin: 'chat' },
  ],
  questions: [{ key: 'q1', question: 'Cashback é o mesmo que Fidelidade?', options: ['merge', 'new'], assumed: null }],
};

describe('DeltaPanel', () => {
  it('lista elementos e relações com tipo, descrição do que entra, campos que mudam e perguntas', () => {
    render(<DeltaPanel result={result} />);
    const els = screen.getByRole('list', { name: 'Elementos alterados' });
    expect(els.textContent).toContain('Cashback');
    expect(els.textContent).toContain('Saldo de cashback');
    expect(els.textContent).toContain('description');
    expect(els.textContent).toContain('velha');
    expect(els.textContent).toContain('nova');
    expect(screen.getByRole('list', { name: 'Relações alteradas' }).textContent).toContain('serving');
    expect(screen.getByText('Cashback é o mesmo que Fidelidade?')).toBeTruthy();
  });

  it('clicar num elemento pede para mostrá-lo no diagrama; o selecionado e suas relações ficam marcados', async () => {
    const onPick = vi.fn();
    const { container } = render(<DeltaPanel result={result} selected="b" onPick={onPick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cashback' }));
    expect(onPick).toHaveBeenCalledWith('a');
    expect([...container.querySelectorAll('.chg.sel')].map((li) => li.querySelector('.chg-name')!.textContent)).toEqual(['Checkout', 'Checkout → Gateway']);
  });

  it('sem prévia avisa que nada foi planejado', () => {
    render(<DeltaPanel result={null} />);
    expect(screen.getByText('Nada planejado ainda.')).toBeTruthy();
  });

  it('mostra a documentação com as linhas removidas e acrescentadas', () => {
    const doc: PlanPreviewResult = {
      ...result,
      changes: [{ sign: '~', kind: 'doc', id: 'b', name: 'Checkout', origin: 'chat', diff: [
        { sign: ' ', line: 'Igual' }, { sign: '-', line: 'Linha velha' }, { sign: '+', line: 'Linha nova' },
      ] }],
    };
    const { container } = render(<DeltaPanel result={doc} />);
    expect(screen.getByText('Documentação (1)')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Documentação alterada' });
    expect(list.textContent).toContain('Checkout');
    expect(container.querySelector('.doc-diff .ln.del')!.textContent).toContain('Linha velha');
    expect(container.querySelector('.doc-diff .ln.add')!.textContent).toContain('Linha nova');
    expect(container.querySelector('.doc-diff .ln.same')!.textContent).toContain('Igual');
    expect(screen.queryByText(/Elementos \(/)).toBeNull();
  });
});
