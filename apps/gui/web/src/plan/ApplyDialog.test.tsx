import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  planTurn: vi.fn(), planOpen: vi.fn(), planPreview: vi.fn(), planApply: vi.fn(), planNotes: vi.fn(), getView: vi.fn(),
}));

import * as api from '../api';
import { ApplyDialog } from './ApplyDialog';
import { PlanView } from './PlanView';

const planTurn = vi.mocked(api.planTurn);
const planPreview = vi.mocked(api.planPreview);
const planApply = vi.mocked(api.planApply);
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
const aplicar = () => screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  planPreview.mockResolvedValue(preview());
});

describe('ApplyDialog', () => {
  it('mostra o resumo e as visões afetadas e pede confirmação', async () => {
    const u = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ApplyDialog summary="+2 ~1 −0" views={['Contexto']} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText(/\+2 ~1 −0/)).toBeTruthy();
    expect(screen.getByText('Contexto')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(onConfirm).toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
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
    planApply.mockResolvedValue(applied());
    ev();
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    const dlg = within(screen.getByRole('dialog'));
    expect(dlg.getByText(/\+2 ~1 −0/)).toBeTruthy();
    expect(dlg.getByText('Contexto')).toBeTruthy();
    expect(planApply).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await waitFor(() => expect(planApply).toHaveBeenCalledWith('b', draft(1), 'h1'));
  });

  it('409 E_GUI_PLAN_CHANGED troca o plano mostrado e pede nova revisão', async () => {
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

  it('depois do apply: relatório de qualidade na conversa, rascunho limpo, base recarregada e notas pedidas', async () => {
    open();
    const u = userEvent.setup();
    const onApplied = vi.fn();
    planApply.mockResolvedValue(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild onApplied={onApplied} />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText(/1 problema\(s\) de qualidade/)).toBeTruthy();
    expect(screen.getByText(/largura 50%/)).toBeTruthy();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    await waitFor(() => expect(planTurn).toHaveBeenCalled());
    expect(planTurn.mock.calls[0][1].message).toBe(FIXED);
    expect(planTurn.mock.calls[0][1].draft).toBeUndefined();
    expect(await screen.findByLabelText('Visão geral (notes/overview.md)')).toBeTruthy();
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
  });

  it('avisa para onde foi o texto do nó removido', async () => {
    open();
    const u = userEvent.setup();
    planApply.mockResolvedValue({ ...applied(), preserved: ['notes/removidos/application-component/x.md'] });
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
    planApply.mockResolvedValue(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    await waitFor(() => expect(planTurn).toHaveBeenCalled());
    expect(planTurn.mock.calls[0][1].applied).toEqual({ summary: '+1 ~1 −0', added: ['pag'], changed: ['loja'], removed: [] });
  });

  it('depois do apply a conversa (aplicado, relatório e rascunho das notas) continua salva', async () => {
    open();
    const u = userEvent.setup();
    planApply.mockResolvedValue(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    const { unmount } = render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
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
    planApply.mockResolvedValue({ ...applied(), doc: { error: 'a base foi gravada, mas o ARCHITECTURE.md não foi regenerado; rode "archlens doc" na base' } });
    ev();
    render(<PlanView base="b" canBuild onApplied={onApplied} />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
    expect(await screen.findByText('Plano aplicado: base gravada.')).toBeTruthy();
    expect(screen.getByText(/o ARCHITECTURE.md não foi regenerado/)).toBeTruthy();
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
  });

  it('build indisponível → aviso para rodar archlens build', async () => {
    open();
    const u = userEvent.setup();
    planApply.mockResolvedValue({ ...applied(), build: { available: false, problems: 0, results: [], reason: 'Chromium indisponível no servidor' } });
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
    planApply.mockResolvedValue(applied());
    planNotes.mockResolvedValue({ doc: 'ARCHITECTURE.md' });
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
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
    planApply.mockResolvedValue(applied());
    ev(notesReply, { type: 'done', metrics: { total: 1 } });
    render(<PlanView base="b" canBuild />);
    await waitFor(() => expect(aplicar().disabled).toBe(false));
    await u.click(aplicar());
    await u.click(screen.getByRole('button', { name: 'Confirmar e aplicar' }));
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
