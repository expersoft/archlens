import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DocWindow } from './DocWindow';
import { tocOf } from './markdown-toc';

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

  it('erro da confirmação aparece no rodapé, como alerta', () => {
    const { rerender } = render(<DocWindow title="D" text="a" editable onClose={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<DocWindow title="D" text="a" editable error="recusada" onClose={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('recusada');
    expect(alert.closest('.doc-win-f')).toBeTruthy();
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

  it('Ctrl+Enter sem alteração não confirma, como o botão', () => {
    const onConfirm = vi.fn();
    render(<DocWindow title="D" text="a" editable onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe('documento grande (2.000 linhas, 334 títulos)', () => {
    const big = Array.from({ length: 2000 }, (_, i) => (i % 6 === 0 ? `## Título ${i / 6}` : `linha ${i} com texto`)).join('\n');

    it('tocOf conta os títulos e dá as linhas', () => {
      const t = tocOf(big);
      expect(t).toHaveLength(334);
      expect(t[0].line).toBe(0);
      expect(t[333].line).toBe(1998);
      expect(t[5].line).toBe(30);
    });

    it('o sumário atualiza na hora e a prévia só depois de 120 ms', () => {
      vi.useFakeTimers();
      try {
        render(<DocWindow title="D" text={big} editable onClose={() => {}} />);
        const nav = screen.getByRole('navigation', { name: 'Sumário' });
        expect(nav.querySelectorAll('button')).toHaveLength(334);
        const pv = () => document.querySelector('.doc-win-pv')!.textContent ?? '';
        fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: `## Novo\n${big}` } });
        expect(nav.querySelectorAll('button')).toHaveLength(335);
        expect(nav.textContent).toContain('Novo');
        expect(pv()).not.toContain('Novo');
        act(() => { vi.advanceTimersByTime(120); });
        expect(pv()).toContain('Novo');
      } finally { vi.useRealTimers(); }
    });
  });

  it('trocar de modo e clicar no sumário atualizam a prévia na hora', () => {
    vi.useFakeTimers();
    try {
      render(<DocWindow title="D" text="# A" editable onClose={() => {}} />);
      fireEvent.change(screen.getByLabelText('Documentação'), { target: { value: '# A\n## Novo' } });
      const nav = screen.getByRole('navigation', { name: 'Sumário' });
      expect(document.querySelector('.doc-win-pv')!.textContent).not.toContain('Novo');
      fireEvent.click(nav.querySelectorAll('button')[1]);
      expect(document.querySelector('.doc-win-pv')!.textContent).toContain('Novo');
    } finally { vi.useRealTimers(); }
  });
});
