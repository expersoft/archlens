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

  it('tela cheia abre o editor ampliado com o texto e Confirmar entrega o texto', () => {
    const onConfirm = vi.fn();
    render(<DocEditor text="um" onConfirm={onConfirm} onCancel={() => {}} title="Documentação · X" />);
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'um dois' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    const dlg = screen.getByRole('dialog', { name: 'Documentação · X' });
    expect((dlg.querySelector('textarea') as HTMLTextAreaElement).value).toBe('um dois');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledWith('um dois');
  });

  it('Esc na janela devolve o texto ao cartão sem confirmar', () => {
    const onConfirm = vi.fn();
    render(<DocEditor text="um" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'um dois' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Documentação') as HTMLTextAreaElement).value).toBe('um dois');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Cancelar na janela com texto alterado pergunta e descarta', () => {
    const onCancel = vi.fn();
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DocEditor text="um" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'dois' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(ask).toHaveBeenCalledWith('Descartar a edição não confirmada?');
    expect(onCancel).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
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
