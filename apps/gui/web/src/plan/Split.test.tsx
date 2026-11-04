import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Split } from './Split';

const mount = () => render(<Split left={<p>conversa</p>} right={<p>prévia</p>} />);
const pos = () => Number(screen.getByRole('separator').getAttribute('aria-valuenow'));

describe('Split', () => {
  it('os atalhos movem a divisória e a posição fica lembrada', async () => {
    const u = userEvent.setup();
    const r = mount();
    expect(pos()).toBe(50);
    await u.click(screen.getByRole('button', { name: 'Conversa larga' }));
    const wide = pos();
    expect(wide).toBeGreaterThan(50);
    expect(localStorage.getItem('archlens-gui-plan-split')).toBe(String(wide));
    await u.click(screen.getByRole('button', { name: 'Diagrama largo' }));
    expect(pos()).toBeLessThan(50);
    await u.click(screen.getByRole('button', { name: 'Meio a meio' }));
    expect(pos()).toBe(50);
    await u.click(screen.getByRole('button', { name: 'Conversa larga' }));
    r.unmount();
    mount();
    expect(pos()).toBe(wide);
  });

  it('os atalhos são ícones e o da largura atual fica marcado', async () => {
    const u = userEvent.setup();
    mount();
    const pressed = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'));
    expect(pressed()).toEqual(['Meio a meio']);
    const wide = screen.getByRole('button', { name: 'Conversa larga' });
    expect(wide.textContent).toBe('');
    expect(wide.querySelector('svg')).toBeTruthy();
    await u.click(wide);
    expect(pressed()).toEqual(['Conversa larga']);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    expect(pressed()).toEqual([]);
  });

  it('setas movem a divisória dentro dos limites', () => {
    mount();
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(pos()).toBe(55);
    for (let i = 0; i < 20; i++) fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(pos()).toBe(85);
    for (let i = 0; i < 40; i++) fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(pos()).toBe(15);
  });
});
