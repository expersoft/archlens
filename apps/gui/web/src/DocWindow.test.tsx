import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DocWindow } from './DocWindow';

const DOC = '# Responsabilidades\ntexto\n## Integrações\n### Pagamentos\nchama';

describe('DocWindow', () => {
  it('abre em Lado a lado, com sumário; ☰ oculta o sumário', () => {
    render(<DocWindow title="Documentação · API" text={DOC} editable onClose={() => {}} />);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Lado a lado' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Documentação')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Integrações' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Sumário' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sumário' }));
    expect(screen.queryByRole('navigation', { name: 'Sumário' })).toBeNull();
  });

  it('clicar num título do sumário marca a seção atual', () => {
    render(<DocWindow title="D" text={DOC} editable onClose={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Sumário' });
    const item = (n: string) => Array.from(nav.querySelectorAll('button')).find((b) => b.textContent === n)!;
    expect(item('Responsabilidades').getAttribute('aria-current')).toBe('true');
    fireEvent.click(item('Pagamentos'));
    expect(item('Pagamentos').getAttribute('aria-current')).toBe('true');
    expect(item('Responsabilidades').getAttribute('aria-current')).toBeNull();
  });

  it('Ctrl+Enter confirma e Esc fecha devolvendo o texto', () => {
    const onConfirm = vi.fn(), onClose = vi.fn();
    render(<DocWindow title="D" text="a" editable onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: 'ab' } });
    expect(screen.getByText(/alterado/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });
    expect(onConfirm).toHaveBeenCalledWith('ab');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('ab');
  });

  it('rodapé conta linhas e a barra aplica formatação à seleção', () => {
    render(<DocWindow title="D" text={'um\ndois'} editable onClose={() => {}} />);
    expect(screen.getByText('markdown · 2 linhas')).toBeTruthy();
    const ta = screen.getByLabelText('Documentação') as HTMLTextAreaElement;
    ta.setSelectionRange(0, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Negrito' }));
    expect(ta.value).toBe('**um**\ndois');
  });

  it('foco preso: Tab no último elemento volta ao primeiro', () => {
    render(<DocWindow title="D" text="a" editable onClose={() => {}} />);
    const items = Array.from(screen.getByRole('dialog').querySelectorAll<HTMLElement>('button:not([disabled]),textarea'));
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('leitura não tem formatação nem Confirmar', () => {
    const onClose = vi.fn();
    render(<DocWindow title="D" text={DOC} editable={false} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Negrito' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByLabelText('Documentação')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sumário' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledWith(DOC);
  });

  it('2.000 linhas e 300 títulos: digitar atualiza o sumário em menos de 100 ms', () => {
    const big = Array.from({ length: 2000 }, (_, i) => (i % 6 === 0 ? `## Título ${i / 6}` : `linha ${i} com texto`)).join('\n');
    render(<DocWindow title="D" text={big} editable onClose={() => {}} />);
    const ta = screen.getByLabelText('Documentação');
    const nav = screen.getByRole('navigation', { name: 'Sumário' });
    expect(nav.querySelectorAll('button').length).toBeGreaterThanOrEqual(300);
    const t0 = performance.now();
    fireEvent.change(ta, { target: { value: `## Novo\n${big}` } });
    const ms = performance.now() - t0;
    expect(nav.textContent).toContain('Novo');
    expect(ms).toBeLessThan(100);
  });
});
