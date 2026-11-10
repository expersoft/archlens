import { expect, it, vi } from 'vitest';
import { act as rtlAct, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertBadge, type AlertAction } from './AlertBadge';
import type { AlertInfo } from './api';

const leg: AlertInfo = { kind: 'legibility', text: 'x', nodes: 52, minFontPx: 9.4 };
const lay: AlertInfo = { kind: 'layout', text: '"v": layout em grade' };
const act = (id: AlertAction['id'], run = () => {}): AlertAction => ({ id, label: `ação ${id}`, run });

it('sem avisos não mostra o selo', () => {
  const { container } = render(<AlertBadge alerts={[]} actions={[act('present')]} />);
  expect(container.innerHTML).toBe("");
});

it('selo mostra a contagem e abre o painel com título e explicação', async () => {
  render(<AlertBadge alerts={[leg]} actions={[]} />);
  const b = screen.getByRole('button', { name: 'Avisos da visão (1)' });
  expect(b.textContent).toBe("⚠ 1");
  await userEvent.click(b);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('Visão grande para uma tela')).toBeTruthy();
  expect(screen.getByText('Com 52 elementos, o texto fica com cerca de 9.4px quando a visão inteira cabe na tela.')).toBeTruthy();
});

it('explicação sem minFontPx não cita o tamanho', async () => {
  render(<AlertBadge alerts={[{ kind: 'size', text: 't', nodes: 41 }]} actions={[]} />);
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  expect(screen.getByText('Com 41 elementos, o texto fica pequeno quando a visão inteira cabe na tela.')).toBeTruthy();
});

it('fecha com Esc e com clique fora', async () => {
  render(<div><span>fora</span><AlertBadge alerts={[leg]} actions={[]} /></div>);
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  await userEvent.click(screen.getByText('fora'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('roda a ação e fecha o painel', async () => {
  const run = vi.fn();
  render(<AlertBadge alerts={[leg]} actions={[act('present', run)]} />);
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  await userEvent.click(screen.getByRole('button', { name: 'ação present' }));
  expect(run).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('ações só nas que se aplicam: sem Focar nas ações não há botão Focar', async () => {
  render(<AlertBadge alerts={[leg]} actions={[act('nest'), act('present')]} />);
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  expect(screen.queryByRole('button', { name: 'ação focus' })).toBeNull();
  expect(screen.getByRole('button', { name: 'ação nest' })).toBeTruthy();
});

it('aviso de layout aparece sem ações', async () => {
  render(<AlertBadge alerts={[lay]} actions={[act('present'), act('nest')]} />);
  await userEvent.click(screen.getByRole('button', { name: 'Avisos da visão (1)' }));
  expect(screen.getByText('Nota do layout')).toBeTruthy();
  expect(screen.getByText('"v": layout em grade')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /ação/ })).toBeNull();
});

it('Mostrar só uma camada lista as opções e roda a da camada', async () => {
  const a = vi.fn(), b = vi.fn();
  const layer: AlertAction = { id: 'layer', label: 'Mostrar só uma camada', run: () => {}, options: [{ label: 'Aplicação', run: a }, { label: 'Tecnologia', run: b }] };
  render(<AlertBadge alerts={[leg]} actions={[layer]} />);
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  expect(screen.queryByRole('button', { name: 'Tecnologia' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Mostrar só uma camada' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tecnologia' }));
  expect(b).toHaveBeenCalledTimes(1);
  expect(a).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('size e legibility viram uma seção só, contada uma vez, com minFontPx de quem tiver', async () => {
  render(<AlertBadge alerts={[{ kind: 'size', text: 's', nodes: 52 }, leg]} actions={[]} />);
  expect(screen.getByRole('button', { name: 'Avisos da visão (1)' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  expect(screen.getAllByText('Visão grande para uma tela')).toHaveLength(1);
  expect(screen.getByText(/cerca de 9.4px/)).toBeTruthy();
});

it('fecha quando os avisos mudam e quando a janela perde o foco', async () => {
  const { rerender } = render(<AlertBadge alerts={[leg]} actions={[]} />);
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  rerender(<AlertBadge alerts={[lay]} actions={[]} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  rtlAct(() => { window.dispatchEvent(new Event('blur')); });
  expect(screen.queryByRole('dialog')).toBeNull();
});
