import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  planTurn: vi.fn(), planOpen: vi.fn(), planPreview: vi.fn(), planApplyStream: vi.fn(), planNotes: vi.fn(), getView: vi.fn(),
}));

import * as api from '../api';
import { ApplyDialog, type ApplyDialogProps, type ApplyStepView } from './ApplyDialog';
import { PlanView } from './PlanView';

const planTurn = vi.mocked(api.planTurn);
const planPreview = vi.mocked(api.planPreview);
const planApply = vi.mocked(api.planApplyStream);
const planNotes = vi.mocked(api.planNotes);
const draft = (n = 0) => ({ 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: { x: n }, plan: { ops: n } });
const preview = (extra: Partial<api.PlanPreviewResult> = {}): api.PlanPreviewResult => ({
  views: [
    { key: 'delta', title: 'O que muda', html: '<p>d</p>', kind: 'change', spec: {} },
    { key: 'ctx', title: 'Contexto', html: '<p>c</p>', kind: 'saved', spec: {} },
  ],
  skipped: [], summary: '+2 ~1 −0', changes: [], questions: [], report: 'r', opsHash: 'h1', ...extra,
});
const applied = (build: Partial<api.PlanApplyResult['build']> = {}): api.PlanApplyResult => ({
  entry: { id: 'r1', summary: '+1 ~1 −0', added: ['pag'], changed: ['loja'], removed: [] }, doc: 'ARCHITECTURE.md', preserved: [], notesDraftNeeded: true,
  build: { available: true, problems: 1, results: [{ key: 'ctx', viewport: '1280x720', fill: 0.5, minFontPx: 9, issues: ['largura 50%'] }], ...build },
});
const open = () => { localStorage.setItem('archlens-gui-draft:b', JSON.stringify(draft(1))); vi.mocked(api.planOpen).mockResolvedValue({ draft: draft(1), opsHash: 'h1' }); };
const ev = (...events: api.PlanEvent[]) => planTurn.mockImplementation(async (_b, _body, on) => { events.forEach(on); });
const notesReply: api.PlanEvent = { type: 'result', draft: { 'archlens-draft': 1, base: { id: 'b', version: 'v2' }, delta: null, plan: null }, reply: { kind: 'notes', overview: 'ov', notes: 'nt' }, previews: [] };
const FIXED = 'rascunhe as notas de interpretação desta rodada';
/** The stream of a successful apply: the steps, the checks of the views and the result. */
const applyEvents = (r: api.PlanApplyResult & { commit?: string }): api.ApplyEvent[] => [
  { type: 'step', step: 'check', state: 'done' },
  { type: 'step', step: 'write', state: 'start' },
  { type: 'step', step: 'write', state: 'done', detail: 'pasta architecture' },
  { type: 'step', step: 'doc', state: 'start' },
  ...(r.doc && typeof r.doc === 'object' ? [] : [{ type: 'step', step: 'doc', state: 'done' } as api.ApplyEvent]),
  { type: 'step', step: 'views', state: 'start' },
  { type: 'check', done: 1, total: 1, key: 'ctx' },
  ...(r.build?.error ? [] : [{ type: 'step', step: 'views', state: 'done' } as api.ApplyEvent]),
  { type: 'result', ...r },
];
const applyOk = (r: api.PlanApplyResult & { commit?: string }) => planApply.mockImplementation(async (_b, _d, _c, on) => { applyEvents(r).forEach(on); });
const fechar = async (u: ReturnType<typeof userEvent.setup>) => u.click(await screen.findByRole('button', { name: 'Fechar' }));
const aplicar = () => screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  planPreview.mockResolvedValue(preview());
});

const LABELS = ['Conferindo o plano com a base atual', 'Gravando a base', 'Gerando o ARCHITECTURE.md', 'Regerando as visões salvas'];
const IDS = ['check', 'write', 'doc', 'views'] as const;
const steps = (states: ApplyStepView['state'][], details: (string | undefined)[] = []): ApplyStepView[] =>
  IDS.map((id, i) => ({ id, label: LABELS[i], state: states[i], ...(details[i] ? { detail: details[i] } : {}) }));
const dialog = (p: Partial<ApplyDialogProps> = {}) => (
  <ApplyDialog phase="confirm" summary="+2 ~1 −0" views={['Contexto']} steps={steps(['pending', 'pending', 'pending', 'pending'])} count={3}
    onConfirm={vi.fn()} onCancel={vi.fn()} onClose={vi.fn()} {...p} />
);
const stepOf = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

describe('ApplyDialog', () => {
  it('confirm: como hoje', async () => {
    const u = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(dialog({ onConfirm, onCancel }));
    expect(screen.getByText(/\+2 ~1 −0/)).toBeTruthy();
    expect(screen.getByText('Contexto')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(onConfirm).toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('running: título, quatro etapas e nada clicável', () => {
    render(dialog({ phase: 'running', steps: steps(['done', 'running', 'pending', 'pending']) }));
    expect(screen.getByRole('dialog', { name: 'Aplicando 3 mudanças na base' })).toBeTruthy();
    for (const l of LABELS) expect(screen.getByText(l)).toBeTruthy();
    expect(screen.queryAllByRole('button').filter((b) => !(b as HTMLButtonElement).disabled)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
    expect(stepOf('Gravando a base').getAttribute('aria-busy')).toBe('true');
    expect(stepOf('Conferindo o plano com a base atual').textContent).toContain('✓');
    expect(stepOf('Gerando o ARCHITECTURE.md').getAttribute('aria-busy')).toBeNull();
  });

  it('views mostra k de n', () => {
    render(dialog({ phase: 'running', steps: steps(['done', 'done', 'done', 'running'], [undefined, undefined, undefined, '5 de 12']) }));
    expect(within(stepOf('Regerando as visões salvas')).getByText('5 de 12')).toBeTruthy();
  });

  it('done: resumo, a seguir as notas e Fechar', async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(dialog({ phase: 'done', steps: steps(['done', 'done', 'done', 'done']), result: { ...applied(), commit: 'a1b2c3d4e5' }, onClose }));
    expect(screen.getByText(/\+1 ~1 −0/)).toBeTruthy();
    expect(screen.getByText(/a1b2c3d/)).toBeTruthy();
    expect(screen.getByText(/1 alerta\(s\) de legibilidade/)).toBeTruthy();
    expect(screen.getByText('A seguir: o chat propõe as notas de interpretação')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('failed depois de gravar diz que a base foi gravada', () => {
    render(dialog({ phase: 'failed', steps: steps(['done', 'done', 'failed', 'pending'], [undefined, undefined, 'o documento falhou']),
      failure: { message: 'o documento falhou', written: true } }));
    const s = stepOf('Gerando o ARCHITECTURE.md');
    expect(s.className).toContain('failed');
    expect(within(s).getByText('o documento falhou')).toBeTruthy();
    expect(screen.getByText(/A base foi gravada/)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Fechar']);
  });

  it('failed antes de gravar: mensagem na etapa Gravando a base', () => {
    render(dialog({ phase: 'failed', steps: steps(['done', 'failed', 'pending', 'pending']), failure: { message: 'disco cheio', written: false } }));
    const s = stepOf('Gravando a base');
    expect(s.className).toContain('failed');
    expect(within(s).getByText('disco cheio')).toBeTruthy();
    expect(screen.queryByText(/A base foi gravada/)).toBeNull();
  });

  it('aria-modal e foco preso na janela', async () => {
    const u = userEvent.setup();
    const outside = document.createElement('button');
    outside.textContent = 'fora';
    document.body.appendChild(outside);
    outside.focus();
    const { rerender, unmount } = render(dialog({ phase: 'running', steps: steps(['running', 'pending', 'pending', 'pending']) }));
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.contains(document.activeElement)).toBe(true);
    await u.tab();
    expect(dlg.contains(document.activeElement)).toBe(true);
    rerender(dialog({ phase: 'done', steps: steps(['done', 'done', 'done', 'done']), result: applied() }));
    await u.tab();
    expect(document.activeElement?.textContent).toBe('Fechar');
    await u.tab();
    expect(document.activeElement?.textContent).toBe('Fechar');
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('Aplicar na PlanView', () => {
  it('Aplicar desabilitado com pergunta aberta', async () => {
    open();
    planPreview.mockResolvedValue(preview({ questions: [{ key: 'q', question: 'x?', options: ['a'], assumed: null }], opsHash: null }));
    render(<PlanView base="b" canBuild />);
    await screen.findAllByRole('tab');
    await waitFor(() => expect(aplicar().title).toBe('responda as perguntas abertas antes de aplicar'));
    expect(aplicar().disabled).toBe(true);
  });

  it('sem Chromium no servidor o botão Aplicar fica desligado com o motivo', async () => {
    open();
    render(<PlanView base="b" canBuild={false} />);
    await screen.findAllByRole('tab');
    expect(aplicar().disabled).toBe(true);
    expect(aplicar().title).toMatch(/Chromium indisponível no servidor/);
  });

  it('mostra o resumo (+N ~N −N, visões afetadas) e envia confirm = opsHash do plano mostrado', async () => {
    open();
    const u = userEvent.setup();
    applyOk(applied());
    ev();
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    const dlg = within(screen.getByRole('dialog'));
    expect(dlg.getByText(/\+2 ~1 −0/)).toBeTruthy();
    expect(dlg.getByText('Contexto')).toBeTruthy();
    expect(planApply).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await waitFor(() => expect(planApply).toHaveBeenCalledWith('b', draft(1), 'h1', expect.any(Function), expect.any(AbortSignal)));
  });

  it('409 antes do fluxo: segue o caminho de hoje (troca o plano mostrado e pede nova revisão)', async () => {
    open();
    const u = userEvent.setup();
    const novo = draft(2);
    planApply.mockRejectedValue(new api.ApiError('o plano mudou desde a confirmação (a base mudou); revise o plano novo e confirme de novo', 'E_GUI_PLAN_CHANGED', 409, { draft: novo, opsHash: 'h2', questions: [] }));
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    planPreview.mockResolvedValue(preview({ opsHash: 'h2', summary: '+9 ~0 −0' }));
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText(/o plano mudou desde a confirmação/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(novo);
    await waitFor(() => expect(planPreview).toHaveBeenLastCalledWith('b', novo, undefined, undefined));
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    expect(within(screen.getByRole('dialog')).getByText(/\+9 ~0 −0/)).toBeTruthy(); // asks for a new review of the new plan
  });

  it('Confirmar e aplicar abre o checklist e avança com os eventos', async () => {
    open();
    const u = userEvent.setup();
    let on!: (e: api.ApplyEvent) => void;
    let end!: () => void;
    planApply.mockImplementation((_b, _d, _c, cb) => { on = cb; return new Promise<void>((r) => { end = r; }); });
    const chg = (id: string): api.PreviewChange => ({ sign: '+', kind: 'element', id, name: id, origin: 'chat' });
    planPreview.mockResolvedValue(preview({ changes: [chg('a'), chg('b'), chg('c')] }));
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    const dlg = await screen.findByRole('dialog', { name: 'Aplicando 3 mudanças na base' });
    const step = (l: string) => within(dlg).getByText(l).closest('li') as HTMLElement;
    expect(step('Conferindo o plano com a base atual').getAttribute('aria-busy')).toBe('true');
    expect(within(dlg).queryAllByRole('button')).toEqual([]);
    act(() => { on({ type: 'step', step: 'check', state: 'done' }); on({ type: 'step', step: 'write', state: 'start' }); });
    expect(step('Conferindo o plano com a base atual').textContent).toContain('✓');
    expect(step('Gravando a base').getAttribute('aria-busy')).toBe('true');
    act(() => { on({ type: 'step', step: 'write', state: 'done', detail: 'commit a1b2c3d' }); on({ type: 'step', step: 'doc', state: 'start' }); });
    expect(within(step('Gravando a base')).getByText('commit a1b2c3d')).toBeTruthy();
    act(() => { on({ type: 'step', step: 'doc', state: 'done' }); on({ type: 'step', step: 'views', state: 'start' }); on({ type: 'check', done: 5, total: 12, key: 'ctx' }); });
    expect(within(step('Regerando as visões salvas')).getByText('5 de 12')).toBeTruthy();
    act(() => { on({ type: 'step', step: 'views', state: 'done' }); on({ type: 'result', ...applied() }); end(); });
    expect(await within(dlg).findByText('A seguir: o chat propõe as notas de interpretação')).toBeTruthy();
    expect(step('Regerando as visões salvas').textContent).toContain('✓');
    expect(planTurn).not.toHaveBeenCalled();
  });

  it('o foco fica na janela depois de Confirmar e aplicar, durante e no fim', async () => {
    open();
    const u = userEvent.setup();
    let on!: (e: api.ApplyEvent) => void;
    let end!: () => void;
    planApply.mockImplementation((_b, _d, _c, cb) => { on = cb; return new Promise<void>((r) => { end = r; }); });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    const dlg = await screen.findByRole('dialog', { name: /Aplicando/ });
    expect(dlg.contains(document.activeElement)).toBe(true);
    await u.tab();
    expect(dlg.contains(document.activeElement)).toBe(true);
    act(() => { on({ type: 'step', step: 'check', state: 'done' }); on({ type: 'result', ...applied() }); end(); });
    await within(dlg).findByRole('button', { name: 'Fechar' });
    await waitFor(() => expect(dlg.contains(document.activeElement)).toBe(true));
    await u.tab();
    expect(dlg.contains(document.activeElement)).toBe(true);
  });

  it('ao Fechar depois do fim: o chat pede as notas', async () => {
    open();
    const u = userEvent.setup();
    applyOk(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await screen.findByText('A seguir: o chat propõe as notas de interpretação');
    await new Promise((r) => setTimeout(r, 20));
    expect(planTurn).not.toHaveBeenCalled();
    await fechar(u);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(planTurn).toHaveBeenCalledTimes(1));
    expect(planTurn.mock.calls[0][1].message).toBe(FIXED);
  });

  it('sem Chromium a etapa das visões diz checagem visual indisponível', async () => {
    open();
    const u = userEvent.setup();
    applyOk({ ...applied(), build: { available: false, problems: 0, results: [], reason: 'Chromium indisponível no servidor' } });
    ev();
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    const dlg = await screen.findByRole('dialog', { name: /Aplicando/ });
    expect(await within(dlg).findByText('checagem visual indisponível')).toBeTruthy();
  });

  it('build que falhou: a etapa das visões em vermelho e a base gravada', async () => {
    open();
    const u = userEvent.setup();
    applyOk({ ...applied(), build: { available: true, problems: 0, results: [], error: 'o build falhou' } });
    ev();
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    const dlg = await screen.findByRole('dialog', { name: /Aplicando/ });
    const views = (await within(dlg).findByText('Regerando as visões salvas')).closest('li') as HTMLElement;
    await waitFor(() => expect(views.className).toContain('failed'));
    expect(within(views).getByText('o build falhou')).toBeTruthy();
    expect(within(dlg).getByText(/A base foi gravada/)).toBeTruthy();
  });

  it('erro no fluxo depois de gravar: a etapa seguinte falha e a janela diz que a base foi gravada', async () => {
    open();
    const u = userEvent.setup();
    const onApplied = vi.fn();
    planApply.mockImplementation(async (_b, _d, _c, on) => {
      on({ type: 'step', step: 'check', state: 'done' });
      on({ type: 'step', step: 'write', state: 'start' });
      on({ type: 'step', step: 'write', state: 'done' });
      on({ type: 'error', error: 'a releitura falhou', written: true });
    });
    render(<PlanView base="b" canBuild onApplied={onApplied} />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    const dlg = await screen.findByRole('dialog', { name: /Aplicando/ });
    const doc = within(dlg).getByText('Gerando o ARCHITECTURE.md').closest('li') as HTMLElement;
    await waitFor(() => expect(doc.className).toContain('failed'));
    expect(within(doc).getByText('a releitura falhou')).toBeTruthy();
    expect(within(dlg).getByText(/A base foi gravada/)).toBeTruthy();
    expect(onApplied).toHaveBeenCalledTimes(1);
    await fechar(u);
    expect(planTurn).not.toHaveBeenCalled();
  });

  it('erro no fluxo antes de gravar: mensagem na etapa Gravando a base e o rascunho fica', async () => {
    open();
    const u = userEvent.setup();
    planApply.mockImplementation(async (_b, _d, _c, on) => {
      on({ type: 'step', step: 'check', state: 'done' });
      on({ type: 'step', step: 'write', state: 'start' });
      on({ type: 'error', error: 'sem permissão de escrita', written: false });
    });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    const dlg = await screen.findByRole('dialog', { name: /Aplicando/ });
    const write = within(dlg).getByText('Gravando a base').closest('li') as HTMLElement;
    await waitFor(() => expect(write.className).toContain('failed'));
    expect(within(write).getByText('sem permissão de escrita')).toBeTruthy();
    expect(within(dlg).queryByText(/A base foi gravada/)).toBeNull();
    await fechar(u);
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(1));
  });

  it('plano que não muda nada: a janela fecha e o rascunho fica', async () => {
    open();
    const u = userEvent.setup();
    const onApplied = vi.fn();
    planApply.mockImplementation(async (_b, _d, _c, on) => {
      on({ type: 'step', step: 'check', state: 'done' });
      on({ type: 'result', entry: null, doc: null, build: null, preserved: [], notesDraftNeeded: false });
    });
    render(<PlanView base="b" canBuild onApplied={onApplied} />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText('O plano não muda nada na base; nada foi gravado.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onApplied).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(1));
  });

  it('depois do apply: relatório de qualidade na conversa, rascunho limpo, base recarregada e notas pedidas', async () => {
    open();
    const u = userEvent.setup();
    const onApplied = vi.fn();
    applyOk(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild onApplied={onApplied} />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText(/1 problema\(s\) de qualidade/)).toBeTruthy();
    expect(screen.getByText(/largura 50%/)).toBeTruthy();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    await fechar(u);
    await waitFor(() => expect(planTurn).toHaveBeenCalled());
    expect(planTurn.mock.calls[0][1].message).toBe(FIXED);
    expect(planTurn.mock.calls[0][1].draft).toBeUndefined();
    expect(await screen.findByLabelText('Visão geral (notes/overview.md)')).toBeTruthy();
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
  });

  it('avisa para onde foi o texto do nó removido', async () => {
    open();
    const u = userEvent.setup();
    applyOk({ ...applied(), preserved: ['notes/removidos/application-component/x.md'] });
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText('Texto do nó removido guardado em notes/removidos/application-component/x.md.')).toBeTruthy();
  });

  it('o pedido de notas leva o resumo da rodada aplicada', async () => {
    open();
    const u = userEvent.setup();
    applyOk(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await fechar(u);
    await waitFor(() => expect(planTurn).toHaveBeenCalled());
    expect(planTurn.mock.calls[0][1].applied).toEqual({ summary: '+1 ~1 −0', added: ['pag'], changed: ['loja'], removed: [] });
  });

  it('depois do apply a conversa (aplicado, relatório e rascunho das notas) continua salva', async () => {
    open();
    const u = userEvent.setup();
    applyOk(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    const { unmount } = render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await fechar(u);
    expect(await screen.findByLabelText('Visão geral (notes/overview.md)')).toBeTruthy();
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    const saved = localStorage.getItem('archlens-gui-chat:b')!;
    expect(saved).toContain('Plano aplicado');
    expect(saved).toContain('problema(s) de qualidade');
    expect(saved).toContain('"overview":"ov"');
    unmount();
    vi.mocked(api.planOpen).mockClear();
    render(<PlanView base="b" canBuild />);
    expect(screen.getByText(/Plano aplicado/)).toBeTruthy();
    expect(await screen.findByLabelText('Visão geral (notes/overview.md)')).toBeTruthy();
    expect(api.planOpen).not.toHaveBeenCalled();
  });

  it('documento que falhou depois da gravação: base gravada e o erro na conversa', async () => {
    open();
    const u = userEvent.setup();
    const onApplied = vi.fn();
    applyOk({ ...applied(), doc: { error: 'a base foi gravada, mas o ARCHITECTURE.md não foi regenerado; rode "archlens doc" na base' } });
    ev();
    render(<PlanView base="b" canBuild onApplied={onApplied} />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText('Plano aplicado: base gravada.')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText(/A base foi gravada/)).toBeTruthy();
    await fechar(u);
    expect(screen.getByText(/o ARCHITECTURE.md não foi regenerado/)).toBeTruthy();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
  });

  it('build indisponível → aviso para rodar archlens build', async () => {
    open();
    const u = userEvent.setup();
    applyOk({ ...applied(), build: { available: false, problems: 0, results: [], reason: 'Chromium indisponível no servidor' } });
    ev();
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText(/rode "archlens build b" numa máquina com o Chromium/)).toBeTruthy();
  });

  it('notas: aprovar grava em /plan/notes; Agora não não grava nem desfaz o apply', async () => {
    open();
    const u = userEvent.setup();
    applyOk(applied());
    planNotes.mockResolvedValue({ doc: 'ARCHITECTURE.md' });
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await fechar(u);
    const ta = await screen.findByLabelText('Notas de interpretação (notes.md)');
    await u.clear(ta);
    await u.type(ta, 'editado');
    await u.click(screen.getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(planNotes).toHaveBeenCalledWith('b', { overview: 'ov', notes: 'editado' }));
    expect(await screen.findByText('notas gravadas')).toBeTruthy();
  });

  it('Agora não não grava as notas', async () => {
    open();
    const u = userEvent.setup();
    applyOk(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await fechar(u);
    await u.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(planNotes).not.toHaveBeenCalled();
    expect(await screen.findByText('notas descartadas (o apply continua valendo)')).toBeTruthy();
  });

  it('Aplicar desabilitado enquanto uma rodada corre', async () => {
    open();
    planTurn.mockImplementation(() => new Promise(() => {}));
    const u = userEvent.setup();
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.type(screen.getByLabelText('Mensagem'), 'oi{Control>}{Enter}{/Control}');
    expect(aplicar().disabled).toBe(true);
    expect(aplicar().title).toBe('aguarde a rodada em andamento terminar antes de aplicar');
  });

  it('prévia que falhou explica o motivo', async () => {
    open();
    planPreview.mockRejectedValue(new Error('x'));
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().title).toBe('a prévia falhou; tente de novo'));
  });

  it('E_PLAN_STALE mostra a mensagem e Replanejar troca o plano e fecha o diálogo', async () => {
    open();
    const u = userEvent.setup();
    const novo = draft(3);
    planApply.mockRejectedValue(new api.ApiError('a base mudou enquanto o plano era aplicado; nada foi gravado. Revise o plano novo', 'E_PLAN_STALE', 409));
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText(/a base mudou enquanto o plano era aplicado/)).toBeTruthy();
    vi.mocked(api.planOpen).mockClear();
    vi.mocked(api.planOpen).mockResolvedValue({ draft: novo, opsHash: 'h3' });
    await u.click(screen.getByRole('button', { name: 'Replanejar' }));
    await waitFor(() => expect(api.planOpen).toHaveBeenCalledWith('b', draft(1)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(novo);
  });
});
