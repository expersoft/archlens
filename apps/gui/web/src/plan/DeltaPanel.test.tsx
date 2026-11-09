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

  it('mostra a documentação com as linhas removidas e acrescentadas', async () => {
    const doc: PlanPreviewResult = {
      ...result,
      changes: [{ sign: '~', kind: 'doc', id: 'b', name: 'Checkout', origin: 'chat', diff: [
        { sign: ' ', line: 'Igual' }, { sign: '-', line: 'Linha velha' }, { sign: '+', line: 'Linha nova' },
      ] }],
    };
    const { container } = render(<DeltaPanel result={doc} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /ver diferença/ }));
    expect(screen.getByText('Documentação (1)')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Documentação alterada' });
    expect(list.textContent).toContain('Checkout');
    expect(container.querySelector('.doc-diff .ln.del')!.textContent).toContain('Linha velha');
    expect(container.querySelector('.doc-diff .ln.add')!.textContent).toContain('Linha nova');
    expect(container.querySelector('.doc-diff .ln.same')!.textContent).toContain('Igual');
    expect(screen.queryByText(/Elementos \(/)).toBeNull();
  });

  const withOrigin = (changes: PlanPreviewResult['changes']): PlanPreviewResult => ({ ...result, changes });

  it('mostra selos de origem e desfazer só nas mudanças da tela', () => {
    const r = withOrigin([
      { sign: '~', kind: 'element', id: 'a', name: 'A', origin: 'chat', fields: [{ field: 'description', before: 'x', after: 'y', origin: 'chat' }] },
      { sign: '~', kind: 'element', id: 'b', name: 'B', origin: 'tela', fields: [{ field: 'properties.dono', before: '—', after: 'time', origin: 'tela' }] },
      { sign: '~', kind: 'element', id: 'c', name: 'C', origin: 'ambos', fields: [{ field: 'properties.dono', before: '—', after: 'time', origin: 'tela' }, { field: 'description', before: 'x', after: 'y', origin: 'chat' }] },
    ]);
    render(<DeltaPanel result={r} onUndo={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    const [a, b, c] = ['A', 'B', 'C'].map((n) => items.find((li) => li.querySelector('.chg-name')?.textContent === n)!);
    expect(a.querySelector('.chg-head .origin')!.textContent).toBe('chat');
    expect(b.querySelector('.chg-head .origin')!.textContent).toBe('tela');
    expect(c.querySelector('.chg-head .origin')!.textContent).toBe('chat · tela');
    expect(a.querySelector('.chg-fields .origin')).toBeNull();
    expect(b.querySelector('.chg-fields .origin')).toBeNull(); // o selo do nó já diz tudo
    expect([...c.querySelectorAll('.chg-fields .origin')].map((o) => o.textContent)).toEqual(['tela', 'chat']);
    expect(screen.queryAllByRole('button', { name: /desfazer/ })).toHaveLength(2);
    expect(a.querySelector('button.undo')).toBeNull();
  });

  it('sem onUndo não há desfazer', () => {
    render(<DeltaPanel result={withOrigin([{ sign: '~', kind: 'element', id: 'b', name: 'B', origin: 'tela', fields: [] }])} />);
    expect(screen.queryByRole('button', { name: /desfazer/ })).toBeNull();
  });

  it('desfazer pede onUndo com o id do nó', async () => {
    const onUndo = vi.fn();
    render(<DeltaPanel result={withOrigin([{ sign: '~', kind: 'element', id: 'b', name: 'B', origin: 'tela', fields: [] }])} onUndo={onUndo} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /desfazer/ }));
    expect(onUndo).toHaveBeenCalledWith('b');
  });

  it('documentação resumida em linhas até ver diferença', async () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ sign: '+' as const, line: `linha ${i} `.padEnd(20, 'x') }));
    const r = withOrigin([{ sign: '~', kind: 'doc', id: 'b', name: 'B', origin: 'tela', lines: { added: 5000, removed: 3 }, diff: big }]);
    const { container } = render(<DeltaPanel result={r} onUndo={vi.fn()} />);
    expect(screen.getByText(/\+5000 −3 linhas/)).toBeTruthy();
    expect(container.querySelector('.doc-diff')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /ver diferença/ }));
    expect(container.querySelectorAll('.doc-diff .ln')).toHaveLength(5000);
    expect(screen.getByRole('button', { name: /desfazer/ })).toBeTruthy();
  });

  it('propriedade removida aparece riscada', () => {
    const r = withOrigin([{ sign: '~', kind: 'element', id: 'b', name: 'B', origin: 'tela', fields: [{ field: 'properties.dono', before: 'time', after: '—', origin: 'tela' }] }]);
    const { container } = render(<DeltaPanel result={r} />);
    expect(container.querySelector('.chg-fields .after.removed')!.textContent).toBe('—');
    expect(container.querySelector('.chg-fields .before')!.textContent).toBe('time');
  });
});
