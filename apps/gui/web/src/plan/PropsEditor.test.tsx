import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PropsEditor, parsePropValue } from './PropsEditor';

describe('parsePropValue', () => {
  it('mantém número, booleano e lista', () => {
    expect(parsePropValue('3', 2)).toBe(3);
    expect(parsePropValue('x', 2)).toBe('x');
    expect(parsePropValue('true', false)).toBe(true);
    expect(parsePropValue('a, b', ['z'])).toEqual(['a', 'b']);
    expect(parsePropValue('7', undefined)).toBe('7');
  });
});

describe('PropsEditor', () => {
  const base = { dono: 'time', nivel: 2, velho: 'x' };
  it('alterar, adicionar e remover e Confirmar entrega as mudanças com null na removida', () => {
    const onConfirm = vi.fn();
    render(<PropsEditor base={base} value={base} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Valor de nivel'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover velho' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar propriedade' }));
    fireEvent.change(screen.getByLabelText('Nova chave'), { target: { value: 'canal' } });
    fireEvent.change(screen.getByLabelText('Valor de canal'), { target: { value: 'app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledWith({ nivel: 5, velho: null, canal: 'app' });
  });

  it('destaca alterada, nova e removida', () => {
    render(<PropsEditor base={base} value={base} onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Valor de dono'), { target: { value: 'outro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover velho' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar propriedade' }));
    expect(document.querySelector('.np-row.np-mod')).toBeTruthy();
    expect(document.querySelector('.np-row.np-del')).toBeTruthy();
    expect(document.querySelector('.np-row.np-add')).toBeTruthy();
  });

  it('chave repetida ou vazia desabilita Confirmar', () => {
    render(<PropsEditor base={base} value={base} onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar propriedade' }));
    const ok = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nova chave'), { target: { value: 'dono' } });
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nova chave'), { target: { value: 'dono2' } });
    expect(ok.disabled).toBe(false);
  });

  it('Cancelar chama onCancel', () => {
    const onCancel = vi.fn();
    render(<PropsEditor base={base} value={base} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
