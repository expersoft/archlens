import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Explorer } from './Explorer';
import type { Catalog } from './api';

const catalog: Catalog = {
  id: 'b', name: 'B',
  views: [{ key: 's', title: 'Paisagem', spec: { level: 'landscape' }, saved: true }, { key: 'g', title: 'Sugerida', spec: { level: 'context' }, saved: false }],
  elements: [
    { id: 'a', name: 'Sistema A', type: 'application-component', layer: 'application', kind: 'softwareSystem' },
    { id: 'a.x', name: 'Container X', type: 'application-component', layer: 'application', parent: 'a' },
    { id: 'n', name: 'Servidor', type: 'node', layer: 'technology' },
  ],
};

describe('Explorer', () => {
  it('lista visões salvas (★) e sugeridas, abre a visão', async () => {
    const onOpenView = vi.fn();
    render(<Explorer catalog={catalog} selected={null} onOpenView={onOpenView} onPick={() => {}} />);
    await userEvent.click(screen.getByText('★ Paisagem'));
    expect(onOpenView).toHaveBeenCalledWith({ level: 'landscape' }, 'Paisagem');
    expect(screen.getByText('Sugerida')).toBeTruthy();
  });

  it('árvore por camada, filhos recolhidos até expandir; filtro acha em qualquer nível', async () => {
    const onPick = vi.fn();
    render(<Explorer catalog={catalog} selected={null} onOpenView={() => {}} onPick={onPick} />);
    expect(screen.getByText('Aplicação')).toBeTruthy();
    expect(screen.queryByText('Container X')).toBeNull();
    await userEvent.click(screen.getByText('▸'));
    await userEvent.click(screen.getByText('Container X'));
    expect(onPick).toHaveBeenCalledWith('a.x');
    await userEvent.type(screen.getByLabelText('Filtrar elementos'), 'servid');
    expect(screen.queryByText('Sistema A')).toBeNull();
    await userEvent.click(screen.getByText('Servidor'));
    expect(onPick).toHaveBeenCalledWith('n');
  });
});
