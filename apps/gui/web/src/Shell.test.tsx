import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shell } from './Shell';

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
}
const Wrapped = (p: { presenting?: boolean }) => (
  <Shell leftContent={{ chat: <p>conversa</p>, tree: <p>explorador</p> }} rightContent={<p>detalhes</p>} presenting={p.presenting}>
    <p>centro</p>
  </Shell>
);

describe('Shell', () => {
  it('Ctrl+B fecha e abre a esquerda; Ctrl+Alt+B a direita', async () => {
    setWidth(1600);
    const u = userEvent.setup();
    render(<Wrapped />);
    expect(screen.getByTestId('side-left')).toBeTruthy();
    expect(screen.getByTestId('side-right')).toBeTruthy();
    await u.keyboard('{Control>}b{/Control}');
    expect(screen.queryByTestId('side-left')).toBeNull();
    expect(screen.getByTestId('side-right')).toBeTruthy();
    await u.keyboard('{Control>}b{/Control}');
    expect(screen.getByTestId('side-left')).toBeTruthy();
    await u.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
    expect(screen.queryByTestId('side-right')).toBeNull();
    await u.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
    expect(screen.getByTestId('side-right')).toBeTruthy();
  });

  it('com innerWidth 1000 na montagem, as duas começam fechadas', () => {
    setWidth(1000);
    render(<Wrapped />);
    expect(screen.queryByTestId('side-left')).toBeNull();
    expect(screen.queryByTestId('side-right')).toBeNull();
  });

  it('clicar no ícone ativo da faixa recolhe o lado', async () => {
    setWidth(1600);
    const u = userEvent.setup();
    render(<Wrapped />);
    await u.click(screen.getByRole('button', { name: 'Conversa' }));
    expect(screen.queryByTestId('side-left')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Explorador' }));
    expect(screen.getByText('explorador')).toBeTruthy();
  });

  it('presenting esconde laterais, faixas e barra do topo', () => {
    setWidth(1600);
    render(<Wrapped presenting />);
    expect(screen.queryByTestId('side-left')).toBeNull();
    expect(screen.queryByTestId('side-right')).toBeNull();
    expect(screen.queryByTestId('topbar')).toBeNull();
    expect(screen.getByText('centro')).toBeTruthy();
  });

  it('botão de tema troca data-theme e grava archlens-theme', async () => {
    setWidth(1600);
    const u = userEvent.setup();
    render(<Wrapped />);
    const before = document.documentElement.dataset.theme;
    expect(before === 'light' || before === 'dark').toBe(true);
    await u.click(screen.getByRole('button', { name: /tema/i }));
    const after = document.documentElement.dataset.theme;
    expect(after).toBe(before === 'light' ? 'dark' : 'light');
    expect(localStorage.getItem('archlens-theme')).toBe(after);
  });
});
