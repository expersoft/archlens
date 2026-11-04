import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planTurn: vi.fn(), planOpen: vi.fn() }));

import * as api from '../api';
import { PlanView } from './PlanView';

const planTurn = vi.mocked(api.planTurn);
const planOpen = vi.mocked(api.planOpen);
const draft = (n = 0) => ({ 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: `n${n}` });
const metrics = { total: 1 };

type Ev = api.PlanEvent;
const respond = (...events: Ev[]) => planTurn.mockImplementation(async (_b, _body, onEvent) => { events.forEach(onEvent); });
const result = (reply: api.PlanReply, d = draft(1)): Ev => ({ type: 'result', draft: d, reply, previews: [] });
const done: Ev = { type: 'done', metrics };
const box = () => screen.getByLabelText('Mensagem') as HTMLTextAreaElement;
const say = async (u: ReturnType<typeof userEvent.setup>, t: string) => { await u.type(box(), `${t}{Control>}{Enter}{/Control}`); };

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => vi.restoreAllMocks());

describe('PlanView', () => {
  it('o painel Delta abre e fecha pelo botão e por Ctrl+Shift+B / Ctrl+Alt+B', async () => {
    const u = userEvent.setup();
    render(<PlanView base="b" />);
    expect(screen.getByTestId('delta-panel')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Delta' }));
    expect(screen.queryByTestId('delta-panel')).toBeNull();
    await u.keyboard('{Control>}{Shift>}b{/Shift}{/Control}');
    expect(screen.getByTestId('delta-panel')).toBeTruthy();
    await u.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
    expect(screen.queryByTestId('delta-panel')).toBeNull();
  });

  it('fora da tela (Navegar) o atalho do painel não age', async () => {
    const u = userEvent.setup();
    render(<PlanView base="b" active={false} />);
    await u.keyboard('{Control>}{Shift>}b{/Shift}{/Control}');
    expect(screen.getByTestId('delta-panel')).toBeTruthy();
  });

  it('Limpar apaga a conversa e o histórico do agente, mas o rascunho continua', async () => {
    const u = userEvent.setup();
    respond(result({ kind: 'text', text: 'montei o delta' }), done);
    render(<PlanView base="b" />);
    await say(u, 'adicione Pagamentos');
    expect(await screen.findByText('montei o delta')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Limpar conversa' }));
    expect(screen.queryByText('montei o delta')).toBeNull();
    expect(screen.getByRole('button', { name: 'Descartar rascunho' })).toHaveProperty('disabled', false);
    respond(result({ kind: 'text', text: 'ok' }, draft(2)), done);
    await say(u, 'continue');
    expect(planTurn.mock.calls[1][1]).toMatchObject({ message: 'continue', history: [], draft: draft(1) });
  });

  it('decisão vira botões com as opções e clicar envia answer { key, resolution }', async () => {
    const u = userEvent.setup();
    respond(result({ kind: 'decision', item: { n: 1, key: 'k1', question: 'Mesmo elemento?', options: ['merge', 'new'], recommendation: 'merge', reason: 'nomes iguais' } }), done);
    render(<PlanView base="b" />);
    await say(u, 'adicione Pagamentos');
    expect(await screen.findByText('Mesmo elemento?')).toBeTruthy();
    expect(screen.getByText(/nomes iguais/)).toBeTruthy();
    expect(planTurn.mock.calls[0][1]).toMatchObject({ message: 'adicione Pagamentos', history: [] });
    expect(planTurn.mock.calls[0][1].draft).toBeUndefined();
    respond(result({ kind: 'text', text: 'feito' }, draft(2)), done);
    await u.click(screen.getByRole('button', { name: 'new' }));
    expect(planTurn.mock.calls[1][1]).toMatchObject({ answer: { key: 'k1', resolution: 'new' }, draft: draft(1) });
    expect(planTurn.mock.calls[1][1].message).toBeUndefined();
    // R7: só os turnos anteriores em history
    const h = planTurn.mock.calls[1][1].history!;
    expect(h[0]).toEqual({ role: 'user', text: 'adicione Pagamentos' });
    expect(h.some((m) => m.text === 'new')).toBe(false);
    expect(await screen.findByText('feito')).toBeTruthy();
  });

  it('rascunho salvo a cada resultado', async () => {
    const u = userEvent.setup();
    respond(result({ kind: 'text', text: 'ok' }, draft(3)), done);
    render(<PlanView base="b" />);
    await say(u, 'oi');
    await screen.findByText('ok');
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(3));
    expect(localStorage.getItem('archlens-gui-chat:b')).toContain('oi');
  });

  it('erro mantém o rascunho devolvido', async () => {
    const u = userEvent.setup();
    respond({ type: 'error', error: 'LLM fora do ar', draft: draft(4), previews: [] }, done);
    render(<PlanView base="b" />);
    await say(u, 'oi');
    expect(await screen.findByText('LLM fora do ar')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(4));
  });

  it('ao recarregar, o rascunho volta, chama plan/open e o aviso aparece na conversa', async () => {
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(draft(5)));
    localStorage.setItem('archlens-gui-chat:b', JSON.stringify([{ id: 1, role: 'user', text: 'antes' }]));
    planOpen.mockResolvedValue({ draft: draft(6), warning: 'a base mudou desde este rascunho' });
    render(<PlanView base="b" />);
    expect(screen.getByText('antes')).toBeTruthy();
    expect(await screen.findByText('a base mudou desde este rascunho')).toBeTruthy();
    expect(planOpen).toHaveBeenCalledWith('b', draft(5));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(6)));
  });

  it('local storage cheio corta a conversa primeiro; too-big mostra o aviso e baixa o rascunho', async () => {
    const u = userEvent.setup();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('archlens-gui-chat:')) throw new DOMException('cheio', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    respond(result({ kind: 'text', text: 'ok' }, draft(7)), done);
    render(<PlanView base="b" />);
    await say(u, 'oi');
    await screen.findByText('ok');
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(7));
    expect(screen.queryByText(/não cabe no navegador/)).toBeNull();
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError'); });
    respond(result({ kind: 'text', text: 'de novo' }, draft(8)), done);
    await say(u, 'mais');
    expect(await screen.findByText('o rascunho não cabe no navegador; baixe-o para não perder o trabalho')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Salvar rascunho' }).length).toBeGreaterThan(0);
  });

  it('salvar gera archlens-draft-<base>-<data>.json só com o rascunho', async () => {
    const u = userEvent.setup();
    respond(result({ kind: 'text', text: 'ok' }, draft(9)), done);
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    render(<PlanView base="b" />);
    await say(u, 'oi');
    await screen.findByText('ok');
    await u.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(names[0]).toMatch(/^archlens-draft-b-\d{4}-\d{2}-\d{2}\.json$/);
    const text = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blob!); });
    expect(JSON.parse(text)).toEqual(draft(9));
  });

  it('abrir arquivo de outra base mostra o erro do servidor e não troca o rascunho', async () => {
    const u = userEvent.setup();
    respond(result({ kind: 'text', text: 'ok' }, draft(10)), done);
    planOpen.mockRejectedValue(new api.ApiError('este rascunho é da base "outra"', 'E_DRAFT', 400));
    render(<PlanView base="b" />);
    await say(u, 'oi');
    await screen.findByText('ok');
    const file = new File([JSON.stringify({ ...draft(0), base: { id: 'outra', version: 'v' } })], 'd.json', { type: 'application/json' });
    await u.upload(screen.getByLabelText('Abrir rascunho'), file);
    expect(await screen.findByText('este rascunho é da base "outra"')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(10));
  });

  it('Escrever durante uma rodada cancela a anterior', async () => {
    const u = userEvent.setup();
    const signals: AbortSignal[] = [];
    planTurn.mockImplementation((_b, _body, _on, signal) => { signals.push(signal); return new Promise(() => {}); });
    render(<PlanView base="b" />);
    await say(u, 'primeira');
    expect(box().disabled).toBe(false);
    await say(u, 'segunda');
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(screen.getByText('cancelada')).toBeTruthy();
    expect(planTurn.mock.calls[1][1].history).toEqual([{ role: 'user', text: 'primeira' }]);
    await act(async () => {});
  });

  it('o painel da prévia é um espaço reservado', () => {
    render(<PlanView base="b" />);
    expect(screen.getByTestId('plan-preview')).toBeTruthy();
  });
});

describe('PlanView, correções', () => {
  it('abrir arquivo com rascunho atual pede confirmação; cancelar mantém tudo, confirmar substitui', async () => {
    const u = userEvent.setup();
    respond(result({ kind: 'text', text: 'ok' }, draft(10)), done);
    planOpen.mockResolvedValue({ draft: draft(11) });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlanView base="b" />);
    await say(u, 'oi');
    await screen.findByText('ok');
    const file = () => new File([JSON.stringify(draft(0))], 'd.json', { type: 'application/json' });
    await u.upload(screen.getByLabelText('Abrir rascunho'), file());
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Substituir o rascunho atual pelo do arquivo? O atual se perde se não foi baixado.'));
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(10));
    expect(screen.getByText('ok')).toBeTruthy();
    confirm.mockReturnValue(true);
    await u.upload(screen.getByLabelText('Abrir rascunho'), file());
    await waitFor(() => expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(11)));
    expect(screen.queryByText('ok')).toBeNull();
  });

  it('conversa cortada para caber mostra o aviso', async () => {
    const u = userEvent.setup();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('archlens-gui-chat:')) throw new DOMException('cheio', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    respond(result({ kind: 'text', text: 'ok' }, draft(7)), done);
    render(<PlanView base="b" />);
    await say(u, 'oi');
    expect(await screen.findByText('a conversa antiga foi cortada para caber no navegador; o rascunho está inteiro')).toBeTruthy();
  });

  it('Descartar rascunho pede confirmação; cancelar mantém, confirmar limpa rascunho, conversa e rodada', async () => {
    const u = userEvent.setup();
    const signals: AbortSignal[] = [];
    respond(result({ kind: 'text', text: 'ok' }, draft(12)), done);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlanView base="b" />);
    const discard = () => screen.getByRole('button', { name: 'Descartar rascunho' }) as HTMLButtonElement;
    expect(discard().disabled).toBe(true);
    await say(u, 'oi');
    await screen.findByText('ok');
    planTurn.mockImplementation((_b, _body, _on, signal) => { signals.push(signal); return new Promise(() => {}); });
    await say(u, 'outra');
    await u.click(discard());
    expect(confirm).toHaveBeenCalledWith('Descartar o rascunho atual? Ele se perde se não foi baixado.');
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(draft(12));
    expect(signals[0].aborted).toBe(false);
    confirm.mockReturnValue(true);
    await u.click(discard());
    expect(signals[0].aborted).toBe(true);
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    expect(localStorage.getItem('archlens-gui-chat:b')).toBeNull();
    expect(screen.queryByText('ok')).toBeNull();
    expect(discard().disabled).toBe(true);
    respond(result({ kind: 'text', text: 'do zero' }, draft(13)), done);
    await say(u, 'nova');
    await screen.findByText('do zero');
    expect(planTurn.mock.calls.at(-1)![1].draft).toBeUndefined();
    expect(planTurn.mock.calls.at(-1)![1].history).toEqual([]);
  });

  it('rascunho salvo que o servidor recusa mostra o erro e pode ser descartado', async () => {
    const u = userEvent.setup();
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(draft(14)));
    localStorage.setItem('archlens-gui-chat:b', JSON.stringify([{ id: 1, role: 'user', text: 'antes' }]));
    planOpen.mockRejectedValue(new api.ApiError('o delta do rascunho é inválido: x', 'E_GUI_DRAFT', 400));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PlanView base="b" />);
    expect(await screen.findByText(/o delta do rascunho é inválido: x.*Descartar rascunho/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    respond(result({ kind: 'text', text: 'ok' }, draft(15)), done);
    await say(u, 'oi');
    await screen.findByText('ok');
    expect(planTurn.mock.calls[0][1].draft).toBeUndefined();
  });
});
