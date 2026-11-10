import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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

  it('atalho re-despachado no window (vindo do iframe) alterna a lateral', () => {
    setWidth(1600);
    render(<Wrapped />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: '∫', ctrlKey: true })); });
    expect(screen.queryByTestId('side-left')).toBeNull();
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
    await u.click(screen.getByRole('button', { name: 'Conversa e histórico' }));
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

  it('botão de tema troca data-theme e grava archlens-gui-theme (não o tema do diagrama)', async () => {
    setWidth(1600);
    const u = userEvent.setup();
    render(<Wrapped />);
    const before = document.documentElement.dataset.theme;
    expect(before === 'light' || before === 'dark').toBe(true);
    await u.click(screen.getByRole('button', { name: /tema/i }));
    const after = document.documentElement.dataset.theme;
    expect(after).toBe(before === 'light' ? 'dark' : 'light');
    expect(localStorage.getItem('archlens-gui-theme')).toBe(after);
    expect(localStorage.getItem('archlens-theme')).toBeNull();
  });
});

describe('Shell, modo Planejar', () => {
  const W = (p: { planEnabled?: boolean; mode?: 'browse' | 'plan' }) => (
    <Shell leftContent={{ chat: <p>conversa</p>, tree: <p>explorador</p> }} rightContent={<p>detalhes</p>} planEnabled={p.planEnabled} mode={p.mode} onMode={() => {}}>
      <p>centro</p>
    </Shell>
  );

  it('Navegar | Planejar aparece só com o planejamento ligado', () => {
    setWidth(1600);
    const r = render(<W />);
    expect(screen.queryByRole('button', { name: 'Planejar' })).toBeNull();
    r.unmount();
    render(<W planEnabled />);
    expect(screen.getByRole('button', { name: 'Navegar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Planejar' })).toBeTruthy();
  });

  it('no modo Planejar some o painel lateral e fica só o centro', () => {
    setWidth(1600);
    render(<W planEnabled mode="plan" />);
    expect(screen.queryByTestId('side-left')).toBeNull();
    expect(screen.queryByTestId('side-right')).toBeNull();
    expect(screen.getByText('centro')).toBeTruthy();
  });

  it('barra do topo mostra a marca do archlens antes do nome', () => {
    setWidth(1600);
    render(<Wrapped />);
    const mark = screen.getByTestId('topbar').querySelector('svg[data-mark="archlens"]')!;
    expect(mark).toBeTruthy();
    expect(mark.nextElementSibling?.textContent).toBe('archlens');
  });

  const brand = { name: 'Acme', logo: '/api/brand/logo', logoDark: '/api/brand/logo-dark' };
  const WithBrand = (p: { theme: 'light' | 'dark'; brand?: typeof brand }) => (
    <Shell leftContent={{ chat: <p>c</p>, tree: <p>t</p> }} rightContent={<p>d</p>} theme={p.theme} brand={p.brand}><p>centro</p></Shell>
  );

  it('com brand mostra o logo da empresa, o traço e archlens discreto', () => {
    setWidth(1600);
    render(<WithBrand theme="light" brand={brand} />);
    const bar = screen.getByTestId('topbar');
    const img = bar.querySelector('img.brand-logo') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/brand/logo');
    expect(img.alt).toBe('Acme');
    expect(bar.querySelector('.brand-sep')).toBeTruthy();
    expect(bar.querySelector('.brand-product')?.textContent).toBe('archlens');
    expect(bar.querySelector('svg[data-mark="archlens"]')).toBeNull();
  });

  it('no tema escuro usa logoDark', () => {
    setWidth(1600);
    const { rerender } = render(<WithBrand theme="dark" brand={brand} />);
    expect(screen.getByTestId('topbar').querySelector('img.brand-logo')?.getAttribute('src')).toBe('/api/brand/logo-dark');
    rerender(<WithBrand theme="dark" brand={{ logo: '/api/brand/logo' } as typeof brand} />);
    expect(screen.getByTestId('topbar').querySelector('img.brand-logo')?.getAttribute('src')).toBe('/api/brand/logo');
    expect(screen.getByTestId('topbar').querySelector('img.brand-logo')?.getAttribute('alt')).toBe('Logo');
  });

  it('sem brand mostra a marca do archlens', () => {
    setWidth(1600);
    render(<WithBrand theme="light" />);
    const bar = screen.getByTestId('topbar');
    expect(bar.querySelector('img.brand-logo')).toBeNull();
    expect(bar.querySelector('svg[data-mark="archlens"]')).toBeTruthy();
  });
});
