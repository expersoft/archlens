import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScreenConflictDialog } from './ScreenConflictDialog';

const conflict = { id: 'a', field: 'properties.dono', mine: 'time', theirs: 'squad' };

describe('ScreenConflictDialog', () => {
  it('pergunta o que fazer, com Manter o seu como padrão', () => {
    render(<ScreenConflictDialog conflict={conflict} nodeName="Cashback" onChoose={vi.fn()} />);
    expect(screen.getByText('O chat quer mudar algo que você editou')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Cashback');
    expect(screen.getByRole('dialog').textContent).toContain('properties.dono');
    expect((screen.getByLabelText('Manter o seu') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Usar o do chat') as HTMLInputElement).checked).toBe(false);
  });

  it('Manter o seu chama onChoose mine; Usar o do chat chama theirs', () => {
    const onChoose = vi.fn();
    const { rerender } = render(<ScreenConflictDialog conflict={conflict} nodeName="Cashback" onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onChoose).toHaveBeenLastCalledWith('mine');
    rerender(<ScreenConflictDialog conflict={conflict} nodeName="Cashback" onChoose={onChoose} />);
    fireEvent.click(screen.getByLabelText('Usar o do chat'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onChoose).toHaveBeenLastCalledWith('theirs');
  });

  it('mostra o texto de documentação sem despejar tudo', () => {
    const big = 'x'.repeat(100_000);
    render(<ScreenConflictDialog conflict={{ id: 'a', field: 'doc', mine: big, theirs: 'y' }} nodeName="N" onChoose={vi.fn()} />);
    expect(screen.getByRole('dialog').textContent!.length).toBeLessThan(2000);
  });
});
