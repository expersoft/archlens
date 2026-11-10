import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeCard } from './NodeCard';

describe('NodeCard', () => {
  it('abre por padrão, recolhe ao clicar e lembra por id', async () => {
    const { unmount } = render(<NodeCard id="a" title="Título" count={3}><p>Corpo</p></NodeCard>);
    expect(screen.getByText('3')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Título/ }));
    expect(screen.queryByText('Corpo')).toBeNull();
    unmount();
    render(<NodeCard id="a" title="Título"><p>Corpo</p></NodeCard>);
    expect(screen.queryByText('Corpo')).toBeNull();
  });

  it('defaultOpen false começa fechado; actions e badge ficam na barra e não recolhem', async () => {
    render(<NodeCard id="b" title="Fechado" defaultOpen={false} badge={<i>alterado</i>} actions={<button type="button">✎ Editar</button>}><p>Dentro</p></NodeCard>);
    expect(screen.queryByText('Dentro')).toBeNull();
    expect(screen.getByText('alterado')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '✎ Editar' }));
    expect(screen.queryByText('Dentro')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Fechado/ }));
    expect(screen.getByText('Dentro')).toBeTruthy();
  });

  it('forceOpen mostra o corpo mesmo recolhido, não deixa recolher e fica aberto depois', async () => {
    localStorage.setItem('archlens-node-card:f', 'false');
    const { rerender } = render(<NodeCard id="f" title="Forçado" forceOpen><p>Editor</p></NodeCard>);
    expect(screen.getByText('Editor')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Forçado/ }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    await userEvent.click(toggle);
    expect(screen.getByText('Editor')).toBeTruthy();
    rerender(<NodeCard id="f" title="Forçado"><p>Editor</p></NodeCard>);
    expect(screen.getByText('Editor')).toBeTruthy();
  });
});
