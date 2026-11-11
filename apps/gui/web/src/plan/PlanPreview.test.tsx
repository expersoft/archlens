import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planPreview: vi.fn(), getView: vi.fn(), planActions: vi.fn(), planFlip: vi.fn() }));

import * as api from '../api';
import { PlanPreview, type PreviewNav } from './PlanPreview';

const planPreview = vi.mocked(api.planPreview);
const planActions = vi.mocked(api.planActions);
const planFlip = vi.mocked(api.planFlip);
/** Sends a bridge event from the diagram's iframe, retried until the host listens to the loaded frame. */
const fromFrame = async (c: HTMLElement, data: Record<string, unknown>, until: () => void) => {
  await waitFor(() => {
    const frame = c.querySelector('iframe')!;
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', ...data }, source: frame.contentWindow }));
    until();
  });
};
const getView = vi.mocked(api.getView);
const withDelta = { 'archlens-draft': 1, delta: { x: 1 }, plan: {} };
const spec = { key: 'delta', notation: 'c4', level: 'landscape' };
const result = (extra: Partial<api.PlanPreviewResult> = {}): api.PlanPreviewResult => ({
  views: [{ key: 'delta', title: 'O que muda', html: '<p>com-delta</p>', kind: 'change', spec }],
  skipped: [],
  summary: '+1 ~1 −1',
  changes: [
    { sign: '+', kind: 'element', id: 'a', name: 'Novo', origin: 'chat' },
    { sign: '~', kind: 'element', id: 'b', name: 'Mudou', origin: 'chat' },
    { sign: '−', kind: 'relationship', id: 'c', name: 'X → Y', origin: 'chat' },
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

  it('abas Diagrama | Plano (o delta vai para a lateral); Plano mostra o relatório', async () => {
    const u = userEvent.setup();
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['Diagrama', 'Plano']);
    await waitFor(() => expect(frames(container)).toEqual(['<p>com-delta</p>']));
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
    const pick = await screen.findByRole('combobox', { name: 'Visão da prévia' });
    await screen.findByRole('option', { name: 'Impacto no checkout' });
    expect(planPreview).toHaveBeenCalledWith('b', withDelta, [asked]);
    expect(planPreview).toHaveBeenCalledWith('b', withDelta, undefined, undefined);
    expect(screen.getByRole('group', { name: 'O que muda (1)' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Pedidas e navegadas (1)' })).toBeTruthy();
    await u.selectOptions(pick, 'Impacto no checkout');
    expect(frames(container)).toEqual(['<p>pedida</p>']);
  });

  it('uma visão pedida inválida avisa e não esconde o resto da prévia', async () => {
    const bad = { key: 'ruim', notation: 'c4', level: 'container', scope: 'nao-existe' };
    planPreview.mockImplementation(async (_b, _d, specs) => { if (specs) throw new Error('escopo inexistente'); return result(); });
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[bad]} />);
    expect(await screen.findByText(/não puderam ser desenhadas: escopo inexistente/)).toBeTruthy();
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
  });

  it('re-renderizar com o mesmo html (tema) mantém um botão ligado', async () => {
    const u = userEvent.setup();
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    await waitFor(() => expect(frames(container)).toHaveLength(1));
    const labels = screen.getByRole('button', { name: 'Rótulos' });
    // The frame reports its state; retried until the host has attached its listener to the loaded frame.
    await waitFor(() => {
      const frame = container.querySelector('iframe')!;
      window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', type: 'state', flowing: false, labels: true, legend: false, matrix: false }, source: frame.contentWindow }));
      expect(labels.getAttribute('aria-pressed')).toBe('true');
    });
    await u.click(screen.getByRole('button', { name: 'Alternar tema do diagrama' }));
    expect(labels.getAttribute('aria-pressed')).toBe('true');
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
  });

  it('notação: a visão do que muda é pedida de novo na outra; as demais abrem a versão na outra notação', async () => {
    let nav: { notation: string | null; flip: (n: 'archimate' | 'c4') => void } | null = null;
    const onNavigate = vi.fn();
    const am = { key: 'delta', notation: 'archimate', viewpoint: 'layered' };
    planPreview.mockImplementation(async (_b, _d, specs, notation) => (specs
      ? result({ views: [{ key: 'nav-1', title: 'Contexto', html: '<p>nav</p>', kind: 'asked', spec: specs[0] }] })
      : notation === 'archimate' ? result({ views: [{ key: 'delta', title: 'O que muda', html: '<p>am</p>', kind: 'change', spec: am }] }) : result()));
    const { container, rerender } = render(<PlanPreview base="b" draft={withDelta} previews={[]} onNav={(n) => { nav = n; }} onNavigate={onNavigate} />);
    await waitFor(() => expect(nav?.notation).toBe('c4'));
    act(() => nav!.flip('archimate'));
    await waitFor(() => expect(frames(container)).toEqual(['<p>am</p>']));
    expect(planPreview).toHaveBeenLastCalledWith('b', withDelta, undefined, 'archimate');
    expect(nav!.notation).toBe('archimate');
    expect(onNavigate).not.toHaveBeenCalled();
    // a view that is not the change view: the server flips it over the preview
    const ctxSpec = { key: 'nav-1', notation: 'c4', level: 'context', scope: 'x', title: 'Contexto' };
    rerender(<PlanPreview base="b" draft={withDelta} previews={[ctxSpec]} onNav={(n) => { nav = n; }} onNavigate={onNavigate} />);
    await screen.findByRole('option', { name: 'Contexto' });
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Visão da prévia' }), 'Contexto');
    const flipped = { key: 'nav-2', notation: 'archimate', anchor: 'x', title: 'Em volta de X' };
    planFlip.mockResolvedValue({ spec: flipped });
    act(() => nav!.flip('archimate'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(flipped));
    expect(planFlip).toHaveBeenCalledWith('b', withDelta, ctxSpec);
  });

  it('botão direito abre o menu com as ações da prévia; a escolhida vira uma visão navegada', async () => {
    const u = userEvent.setup();
    const onNavigate = vi.fn();
    const go = { key: 'nav-9', notation: 'c4', level: 'container', scope: 'a', title: 'Containers de Novo' };
    planActions.mockResolvedValue({ actions: [{ label: 'Abrir containers', spec: go, primary: true }] });
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} onNavigate={onNavigate} />);
    await waitFor(() => expect(frames(container)).toHaveLength(1));
    await fromFrame(container, { type: 'context', id: 'a', x: 10, y: 10 }, () => expect(screen.getByRole('menu')).toBeTruthy());
    expect(planActions).toHaveBeenCalledWith('b', withDelta, 'a', spec); // manda a visão mostrada
    await u.click(await screen.findByRole('menuitem', { name: 'Abrir containers' }));
    expect(onNavigate).toHaveBeenCalledWith(go);
    // double click opens the primary action
    onNavigate.mockClear();
    await fromFrame(container, { type: 'expand', id: 'a' }, () => expect(onNavigate).toHaveBeenCalledWith(go));
    expect(planActions).toHaveBeenLastCalledWith('b', withDelta, 'a', spec);
  });

  it('seleção no diagrama vai para o host', async () => {
    const onSelect = vi.fn<(id: string | null) => void>();
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} onSelect={onSelect} />);
    await waitFor(() => expect(frames(container)).toHaveLength(1));
    await fromFrame(container, { type: 'select', id: 'b' }, () => expect(onSelect).toHaveBeenCalledWith('b'));
  });

  it('« e » andam pela lista de visões, na ordem da lista, e param nas pontas', async () => {
    const u = userEvent.setup();
    const views = ['O que muda', 'Salva A', 'Salva B'].map((title, i) => ({ key: `k${i}`, title, html: `<p>${i}</p>`, kind: (i ? 'saved' : 'change') as 'saved' | 'change', spec: { key: `k${i}` } }));
    planPreview.mockResolvedValue(result({ views }));
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    const prev = await screen.findByRole('button', { name: 'Visão anterior' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Próxima visão' }) as HTMLButtonElement;
    const pick = screen.getByRole('combobox', { name: 'Visão da prévia' }) as HTMLSelectElement;
    expect(prev.disabled).toBe(true);
    await u.click(next);
    expect(pick.selectedOptions[0].textContent).toBe('Salva A');
    await u.click(next);
    expect(frames(container)).toEqual(['<p>2</p>']);
    expect(next.disabled).toBe(true);
    await u.click(prev);
    expect(pick.selectedOptions[0].textContent).toBe('Salva A');
  });

  it('Plano: Preview renderiza o markdown (sem HTML cru) e Raw mostra o texto', async () => {
    const u = userEvent.setup();
    planPreview.mockResolvedValue(result({ report: '# Plano: teste\n\n- item **forte**\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))' }));
    const { container } = render(<PlanPreview base="b" draft={withDelta} previews={[]} />);
    await u.click(await screen.findByRole('tab', { name: 'Plano' }));
    expect(screen.getByRole('heading', { name: 'Plano: teste' })).toBeTruthy();
    expect(container.querySelector('.md strong')?.textContent).toBe('forte');
    expect(container.querySelector('.md script')).toBeNull();
    expect(container.querySelector('.md a[href^="javascript"]')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Raw' }));
    expect(container.querySelector('pre.preview-report')?.textContent).toContain('# Plano: teste');
    expect(screen.queryByRole('heading', { name: 'Plano: teste' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'Plano: teste' })).toBeTruthy();
  });

  const html1 = result({ views: [{ key: 'delta', title: 'O que muda', html: '<p>v1</p>', viewData: { nodes: { b: { name: 'Mudou' } } }, kind: 'change', spec }] });
  const html2 = result({ views: [{ key: 'delta', title: 'O que muda', html: '<p>v2</p>', viewData: { nodes: { b: { name: 'Mudou' } } }, kind: 'change', spec }] });
  const emit = (c: HTMLElement, data: Record<string, unknown>) =>
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { source: 'archlens', ...data }, source: c.querySelector('iframe')!.contentWindow })); });
  const mountSelected = async (onSelect: Mock<(id: string | null) => void>) => {
    planPreview.mockResolvedValue(html1);
    const r = render(<PlanPreview base="b" draft={withDelta} previews={[]} onSelect={onSelect} />);
    await waitFor(() => expect(frames(r.container)).toEqual(['<p>v1</p>']));
    await fromFrame(r.container, { type: 'select', id: 'b' }, () => expect(onSelect).toHaveBeenCalledWith('b'));
    onSelect.mockClear();
    return r;
  };

  it('um select(null) deliberado logo depois de escolher um nó desenhado limpa a seleção', async () => {
    const onSelect = vi.fn<(id: string | null) => void>();
    const { container } = await mountSelected(onSelect);
    emit(container, { type: 'select', id: null });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('numa recarga do quadro, o select(null) não limpa a seleção, mesmo com o ready atrasado', async () => {
    const onSelect = vi.fn<(id: string | null) => void>();
    const { container, rerender } = await mountSelected(onSelect);
    planPreview.mockResolvedValue(html2);
    rerender(<PlanPreview base="b" draft={{ ...withDelta, note: 'outro' } as never} previews={[]} onSelect={onSelect} />);
    await waitFor(() => expect(frames(container)).toEqual(['<p>v2</p>']));
    emit(container, { type: 'select', id: null });
    expect(onSelect).not.toHaveBeenCalledWith(null);
    const post = vi.spyOn(container.querySelector('iframe')!.contentWindow!, 'postMessage');
    emit(container, { type: 'ready' });
    expect(onSelect).not.toHaveBeenCalledWith(null);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'select', id: 'b' }), '*');
  });

  it('escolher um nó que a visão não desenha não manda nada ao quadro', async () => {
    const onSelect = vi.fn<(id: string | null) => void>();
    planPreview.mockResolvedValue(html1);
    const { container, rerender } = render(<PlanPreview base="b" draft={withDelta} previews={[]} onSelect={onSelect} focus={null} />);
    await waitFor(() => expect(frames(container)).toEqual(['<p>v1</p>']));
    const post = vi.spyOn(container.querySelector('iframe')!.contentWindow!, 'postMessage');
    rerender(<PlanPreview base="b" draft={withDelta} previews={[]} onSelect={onSelect} focus={{ id: 'fora', n: 1 }} />);
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }), '*');
    rerender(<PlanPreview base="b" draft={withDelta} previews={[]} onSelect={onSelect} focus={{ id: 'b', n: 2 }} />);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'select', id: 'b', focus: true }), '*');
  });

  /** Like PlanView: a view navigated from the diagram joins the asked ones, and the preview is asked again. */
  function Host({ onNav, onSelect, draft = withDelta }: { onNav: (n: PreviewNav) => void; onSelect?: (id: string | null) => void; draft?: api.Draft }) {
    const [previews, setPreviews] = useState<api.ViewSpec[]>([]);
    return <PlanPreview base="b" draft={draft} previews={previews} onNav={onNav} onSelect={onSelect} onNavigate={(sp) => setPreviews((p) => [...p, sp])}
      onUnnavigate={(sp) => setPreviews((p) => p.filter((x) => x !== sp))} />;
  }
  const later = <T,>() => { let done!: (v: T) => void; const p = new Promise<T>((r) => { done = r; }); return { p, done }; };
  const go = { key: 'nav-9', notation: 'c4', level: 'container', scope: 'a', title: 'Containers de Novo' };
  const navResult = result({ views: [{ key: 'nav-9', title: 'Containers de Novo', html: '<p>nav</p>', kind: 'asked', spec: go }] });

  it('durante a prévia, onNav informa loading com o rótulo', async () => {
    const u = userEvent.setup();
    let nav: PreviewNav | null = null;
    const slow = later<api.PlanPreviewResult>();
    planPreview.mockImplementation((_b, _d, specs) => (specs ? slow.p : Promise.resolve(result())));
    planActions.mockResolvedValue({ actions: [{ label: 'Abrir containers', spec: go, primary: true }] });
    const { container } = render(<Host onNav={(n) => { nav = n; }} />);
    await waitFor(() => expect(frames(container)).toEqual(['<p>com-delta</p>']));
    expect(nav!.loading).toBeNull();
    await fromFrame(container, { type: 'context', id: 'a', x: 10, y: 10 }, () => expect(screen.getByRole('menu')).toBeTruthy());
    await u.click(await screen.findByRole('menuitem', { name: 'Abrir containers' }));
    await waitFor(() => expect(nav!.loading?.label).toBe('Abrir containers: a'));
    // the previous preview stays, dimmed, until the new one arrives
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
    expect(container.querySelector('.diagram')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => { slow.done(navResult); });
    await waitFor(() => expect(frames(container)).toEqual(['<p>nav</p>']));
    expect(nav!.loading).toBeNull();
    expect(container.querySelector('.diagram')?.getAttribute('aria-busy')).toBeNull();
  });

  it('cancelar volta à visão anterior e ignora a resposta tardia', async () => {
    let nav: PreviewNav | null = null;
    const slow = later<api.PlanPreviewResult>();
    const am = { key: 'delta', notation: 'archimate', viewpoint: 'layered' };
    planPreview.mockImplementation((_b, _d, _s, notation) => (notation === 'archimate' ? slow.p : Promise.resolve(result())));
    const { container } = render(<Host onNav={(n) => { nav = n; }} />);
    await waitFor(() => expect(nav?.notation).toBe('c4'));
    act(() => nav!.flip('archimate'));
    await waitFor(() => expect(nav!.loading?.label).toBe('Ver em ArchiMate'));
    const calls = planPreview.mock.calls.length;
    act(() => nav!.loading!.cancel!());
    expect(nav!.loading).toBeNull();
    expect(nav!.notation).toBe('c4');
    await act(async () => { slow.done(result({ views: [{ key: 'delta', title: 'O que muda', html: '<p>am</p>', kind: 'change', spec: am }] })); });
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
    expect(planPreview.mock.calls.length).toBe(calls); // going back does not ask the old notation again
    expect(nav!.notation).toBe('c4');
  });

  it('durante a prévia, botão direito e clique duplo não fazem nada', async () => {
    let nav: PreviewNav | null = null;
    const onSelect = vi.fn<(id: string | null) => void>();
    planPreview.mockImplementation((_b, _d, _s, notation) => (notation === 'archimate' ? new Promise(() => {}) : Promise.resolve(result())));
    planActions.mockResolvedValue({ actions: [{ label: 'Abrir containers', spec: go, primary: true }] });
    const { container } = render(<Host onNav={(n) => { nav = n; }} onSelect={onSelect} />);
    await waitFor(() => expect(frames(container)).toHaveLength(1));
    await fromFrame(container, { type: 'select', id: 'b' }, () => expect(onSelect).toHaveBeenCalledWith('b'));
    act(() => nav!.flip('archimate'));
    await waitFor(() => expect(nav!.loading).not.toBeNull());
    emit(container, { type: 'context', id: 'a', x: 10, y: 10 });
    emit(container, { type: 'expand', id: 'a' });
    emit(container, { type: 'select', id: 'a' });
    await act(async () => {});
    expect(planActions).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalledWith('a');
  });

  it('cancelar uma navegação tira a visão da lista Pedidas e navegadas', async () => {
    const u = userEvent.setup();
    let nav: PreviewNav | null = null;
    const slow = later<api.PlanPreviewResult>();
    planPreview.mockImplementation((_b, _d, specs) => (specs ? slow.p : Promise.resolve(result())));
    planActions.mockResolvedValue({ actions: [{ label: 'Abrir containers', spec: go, primary: true }] });
    const { container, rerender } = render(<Host onNav={(n) => { nav = n; }} />);
    await waitFor(() => expect(frames(container)).toEqual(['<p>com-delta</p>']));
    await fromFrame(container, { type: 'context', id: 'a', x: 10, y: 10 }, () => expect(screen.getByRole('menu')).toBeTruthy());
    await u.click(await screen.findByRole('menuitem', { name: 'Abrir containers' }));
    await waitFor(() => expect(nav!.loading?.cancel).toBeTypeOf('function'));
    const calls = planPreview.mock.calls.length;
    act(() => nav!.loading!.cancel!());
    expect(nav!.loading).toBeNull();
    await act(async () => { slow.done(navResult); });
    expect(frames(container)).toEqual(['<p>com-delta</p>']);
    expect(screen.queryByRole('group', { name: /Pedidas e navegadas/ })).toBeNull();
    expect(planPreview.mock.calls.length).toBe(calls); // the list went back to what is drawn: nothing to ask
    expect((screen.getByRole('combobox', { name: 'Visão da prévia' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('O que muda');
    // the next preview (a new draft) no longer asks for the cancelled view
    planPreview.mockClear();
    rerender(<Host onNav={(n) => { nav = n; }} draft={{ ...withDelta, note: 'outro' } as api.Draft} />);
    await waitFor(() => expect(planPreview).toHaveBeenCalled());
    expect(planPreview).not.toHaveBeenCalledWith('b', expect.anything(), [go]);
  });

  it('recarga por rascunho novo não oferece Cancelar', async () => {
    let nav: PreviewNav | null = null;
    const slow = later<api.PlanPreviewResult>();
    const next = { ...withDelta, note: 'outro' } as api.Draft;
    planPreview.mockImplementation((_b, d) => (d === next ? slow.p : Promise.resolve(result())));
    const { container, rerender } = render(<Host onNav={(n) => { nav = n; }} />);
    await waitFor(() => expect(frames(container)).toEqual(['<p>com-delta</p>']));
    rerender(<Host onNav={(n) => { nav = n; }} draft={next} />);
    await waitFor(() => expect(nav!.loading?.label).toBe('prévia do rascunho'));
    expect(nav!.loading!.cancel).toBeUndefined();
    await act(async () => { slow.done(result()); });
    await waitFor(() => expect(nav!.loading).toBeNull());
  });
});
