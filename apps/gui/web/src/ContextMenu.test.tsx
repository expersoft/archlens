import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu } from './ContextMenu';
import type { Action } from './api';

const items: Action[] = [
  { label: 'Ver contexto', spec: { level: 'context' }, primary: true },
  { label: 'Quem depende (3)', sub: [{ label: 'Direto', spec: { a: 1 } }, { label: 'Indireto', spec: { a: 2 } }] },
  { label: 'Sem ação' },
];

describe('ContextMenu', () => {
  it('mostra título, itens e submenu no hover; clique no sub chama onPick', async () => {
    const u = userEvent.setup();
    const onPick = vi.fn(); const onClose = vi.fn();
    render(<ContextMenu at={{ x: 10, y: 10 }} title="Pagamentos" items={items} onPick={onPick} onClose={onClose} />);
    expect(screen.getByText('Pagamentos')).toBeTruthy();
    expect(screen.getByText('Ver contexto')).toBeTruthy();
    expect(screen.queryByText('Direto')).toBeNull();
    await u.hover(screen.getByText('Quem depende (3)'));
    await u.click(screen.getByText('Indireto'));
    expect(onPick).toHaveBeenCalledWith(items[1].sub![1]);
    expect(onClose).toHaveBeenCalled();
  });
  it('item sem spec e sem sub não é clicável', async () => {
    const u = userEvent.setup();
    const onPick = vi.fn();
    render(<ContextMenu at={{ x: 0, y: 0 }} title="t" items={items} onPick={onPick} onClose={() => {}} />);
    await u.click(screen.getByText('Sem ação'));
    expect(onPick).not.toHaveBeenCalled();
  });
  it('ArrowRight abre o submenu', async () => {
    const u = userEvent.setup();
    render(<ContextMenu at={{ x: 0, y: 0 }} title="t" items={items} onPick={() => {}} onClose={() => {}} />);
    screen.getByText('Quem depende (3)').parentElement!.focus();
    await u.keyboard('{ArrowRight}');
    expect(screen.getByText('Direto')).toBeTruthy();
  });
  it('Esc chama onClose', async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(<ContextMenu at={{ x: 0, y: 0 }} title="t" items={items} onPick={() => {}} onClose={onClose} />);
    await u.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
  it('sem itens ainda (null) abre com "Carregando…" desabilitado', async () => {
    const u = userEvent.setup();
    const onPick = vi.fn();
    render(<ContextMenu at={{ x: 0, y: 0 }} title="Pagamentos" items={null} onPick={onPick} onClose={() => {}} />);
    expect(screen.getByText('Pagamentos')).toBeTruthy();
    const loading = screen.getByText('Carregando…');
    expect(loading.getAttribute('aria-disabled')).toBe('true');
    await u.click(loading);
    expect(onPick).not.toHaveBeenCalled();
  });
});
