import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DocEditor } from './DocEditor';

afterEach(() => vi.restoreAllMocks());

describe('DocEditor', () => {
  it('Prévia mostra o markdown', () => {
    render(<DocEditor text="# Título" onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Prévia' }));
    expect(screen.getByRole('heading', { name: 'Título' })).toBeTruthy();
  });

  it('tela cheia mantém o texto e Confirmar entrega o texto', () => {
    const onConfirm = vi.fn();
    render(<DocEditor text="um" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'um dois' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    const dlg = screen.getByRole('dialog');
    expect((dlg.querySelector('textarea') as HTMLTextAreaElement).value).toBe('um dois');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirmar' })[0]);
    expect(onConfirm).toHaveBeenCalledWith('um dois');
  });

  it('esvaziar a documentação pede confirmação', () => {
    const onConfirm = vi.fn();
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DocEditor text="algo" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(ask).toHaveBeenCalledWith('Apagar a documentação deste nó?');
    expect(onConfirm).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledWith('');
  });
});
