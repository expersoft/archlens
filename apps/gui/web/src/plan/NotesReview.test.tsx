import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotesReview } from './NotesReview';

describe('NotesReview', () => {
  it('notas: edita, aprova e entrega o texto editado', async () => {
    const u = userEvent.setup();
    const onApprove = vi.fn();
    render(<NotesReview overview="visão antiga" notes="notas antigas" onApprove={onApprove} onSkip={() => {}} />);
    const ov = screen.getByLabelText('Visão geral (notes/overview.md)') as HTMLTextAreaElement;
    expect(ov.value).toBe('visão antiga');
    await u.clear(ov);
    await u.type(ov, 'nova');
    await u.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(onApprove).toHaveBeenCalledWith({ overview: 'nova', notes: 'notas antigas' });
  });

  it('Agora não chama onSkip e não aprova', async () => {
    const u = userEvent.setup();
    const onApprove = vi.fn();
    const onSkip = vi.fn();
    render(<NotesReview overview="a" notes="b" onApprove={onApprove} onSkip={onSkip} />);
    await u.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onSkip).toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('depois de decidido os botões somem', () => {
    render(<NotesReview overview="a" notes="b" state="saved" onApprove={() => {}} onSkip={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.getByText('notas gravadas')).toBeTruthy();
  });
});
