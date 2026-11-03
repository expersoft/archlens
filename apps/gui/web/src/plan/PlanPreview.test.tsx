import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planPreview: vi.fn(), getView: vi.fn() }));

import * as api from '../api';
import { PlanPreview } from './PlanPreview';

const planPreview = vi.mocked(api.planPreview);
const getView = vi.mocked(api.getView);
const withDelta = { 'archlens-draft': 1, delta: { x: 1 }, plan: {} };
const spec = { key: 'delta', notation: 'c4', level: 'landscape' };
const result = (extra: Partial<api.PlanPreviewResult> = {}): api.PlanPreviewResult => ({
  views: [{ key: 'delta', title: 'O que muda', html: '<p>com-delta</p>', kind: 'change', spec }],
  skipped: [],
  summary: '+1 ~1 −1',
  changes: [
    { sign: '+', kind: 'element', id: 'a', name: 'Novo' },
    { sign: '~', kind: 'element', id: 'b', name: 'Mudou' },
    { sign: '−', kind: 'relationship', id: 'c', name: 'X → Y' },
  ],
  questions: [{ key: 'q1', question: 'conflito b.description', options: ['keep', 'take'], assumed: 'take' }],
  report: '# Plano: teste\n\nrelatório do plano',
  ...extra,
});
const frames = (c: HTMLElement) => [...c.querySelectorAll('iframe')].map((f) => f.getAttribute('srcdoc'));

beforeEach(() => {
  vi.resetAllMocks();
  planPreview.mockResolvedValue(result());
  getView.mockResolvedValue({ html: '<p>base-atual</p>', alerts: [] } as unknown as api.ViewResult);
});

describe('PlanPreview', () => {
  it('rascunho vazio mostra "Nada planejado ainda" e não chama o servidor', () => {
    render(<PlanPreview base="b" draft={null} previews={[]} />);
    expect(screen.getByText('Nada planejado ainda')).toBeTruthy();
    render(<PlanPreview base="b" draft={{ 'archlens-draft': 1, delta: null, plan: null }} previews={[]} />);
    expect(screen.getAllByText('Nada planejado ainda')).toHaveLength(2);
    expect(planPreview).not.toHaveBeenCalled();
  });

  it('abas Diagrama | Delta | Plano; Delta lista + ~ − e as perguntas; Plano mostra o relatório', async () => {
    const u = userEvent.setup();
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['Diagrama', 'Delta', 'Plano']);
    await waitFor(() => expect(frames(container)).toEqual(['<p>com-delta</p>']));
    await u.click(screen.getByRole('tab', { name: 'Delta' }));
    const list = screen.getByRole('list', { name: 'Mudanças' });
    expect(list.textContent).toContain('+Novo');
    expect(list.textContent).toContain('~Mudou');
    expect(list.textContent).toContain('−X → Y');
    expect(screen.getByText('conflito b.description')).toBeTruthy();
    await u.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText(/relatório do plano/)).toBeTruthy();
  });

  it('alternador Base atual | Com o delta | Lado a lado troca o que o iframe mostra', async () => {
    const u = userEvent.setup();
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    await waitFor(() => expect(frames(container)).toEqual(['<p>com-delta</p>']));
    await u.click(screen.getByRole('button', { name: 'Base atual' }));
    await waitFor(() => expect(frames(container)).toEqual(['<p>base-atual</p>']));
    expect(getView).toHaveBeenCalledWith('b', spec);
    await u.click(screen.getByRole('button', { name: 'Lado a lado' }));
    await waitFor(() => expect(frames(container)).toEqual(['<p>base-atual</p>', '<p>com-delta</p>']));
    await u.click(screen.getByRole('button', { name: 'Com o delta' }));
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
  });

  it('visão sem equivalente na base mostra uma nota', async () => {
    const u = userEvent.setup();
    getView.mockRejectedValue(new Error('vazia'));
    render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    await u.click(await screen.findByRole('button', { name: 'Base atual' }));
    expect(await screen.findByText(/não existe na base atual/)).toBeTruthy();
  });

  it('visão pedida na conversa entra na lista da aba Diagrama sem mudar o delta', async () => {
    const u = userEvent.setup();
    const asked = { key: 'pedida', notation: 'c4', level: 'landscape' };
    planPreview.mockImplementation(async (_b, _d, specs) => (specs
      ? result({ views: [{ key: 'pedida', title: 'Impacto no checkout', html: '<p>pedida</p>', kind: 'asked', spec: asked }] })
      : result()));
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[asked]} />);
    const tab = await screen.findByRole('button', { name: 'Impacto no checkout' });
    expect(planPreview).toHaveBeenCalledWith('b', withDelta, [asked]);
    expect(screen.getByRole('button', { name: 'O que muda' })).toBeTruthy();
    await u.click(tab);
    expect(frames(container)).toEqual(['<p>pedida</p>']);
    await u.click(screen.getByRole('tab', { name: 'Delta' }));
    expect(screen.getByRole('list', { name: 'Mudanças' }).querySelectorAll('li')).toHaveLength(3);
  });

  it('uma visão pedida inválida avisa e não esconde o resto da prévia', async () => {
    const u = userEvent.setup();
    const bad = { key: 'ruim', notation: 'c4', level: 'container', scope: 'nao-existe' };
    planPreview.mockImplementation(async (_b, _d, specs) => { if (specs) throw new Error('escopo inexistente'); return result(); });
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[bad]} />);
    expect(await screen.findByText(/não puderam ser desenhadas: escopo inexistente/)).toBeTruthy();
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
    await u.click(screen.getByRole('tab', { name: 'Delta' }));
    expect(screen.getByRole('list', { name: 'Mudanças' }).querySelectorAll('li')).toHaveLength(3);
  });

  it('re-renderizar com o mesmo html (tema) mantém um botão ligado', async () => {
    const u = userEvent.setup();
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    await waitFor(() => expect(frames(container)).toHaveLength(1));
    const labels = screen.getByRole('button', { name: 'Rótulos' });
    const frame = container.querySelector('iframe')!;
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'state', flowing: false, labels: true, legend: false, matrix: false }, source: frame.contentWindow }));
    await waitFor(() => expect(labels.getAttribute('aria-pressed')).toBe('true'));
    await u.click(screen.getByRole('button', { name: 'Alternar tema do diagrama' }));
    expect(labels.getAttribute('aria-pressed')).toBe('true');
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
  });
});
