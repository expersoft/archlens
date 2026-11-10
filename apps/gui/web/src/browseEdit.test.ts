import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), planEdit: vi.fn(), planElement: vi.fn() }));

import * as api from './api';
import { load, save } from './plan/draftStore';
import { CHANGED, UNREADABLE, confirmBrowseEdit, useBrowseNode } from './browseEdit';

const draft = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null, note: 'n' };
const edited = { ...draft, edits: { a: { properties: { dono: 'outro' } } } };
const edit = { op: 'properties', id: 'a', properties: { dono: 'outro' } } as const;
const card: api.Card = { element: { id: 'a', name: 'Cashback', type: 'application-component', layer: 'application' }, parent: null, children: [], outgoing: {}, incoming: {}, properties: { dono: 'time' } };

beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe('confirmBrowseEdit', () => {
  it('sem rascunho salvo, o servidor começa um com a edição e ele é gravado', async () => {
    vi.mocked(api.planEdit).mockResolvedValue({ draft: edited, opsHash: 'h', screenConflicts: [] });
    expect(await confirmBrowseEdit('b', edit)).toEqual({ ok: true });
    expect(api.planEdit).toHaveBeenCalledWith('b', null, edit);
    expect(load('b')?.draft).toEqual(edited);
  });

  it('com rascunho salvo, a edição entra nele e a conversa salva continua', async () => {
    save('b', draft, [{ id: 1, role: 'user', text: 'oi' }]);
    vi.mocked(api.planEdit).mockResolvedValue({ draft: edited, opsHash: 'h', screenConflicts: [] });
    expect(await confirmBrowseEdit('b', edit)).toEqual({ ok: true });
    expect(api.planEdit).toHaveBeenCalledWith('b', draft, edit);
    expect(load('b')).toEqual({ draft: edited, chat: [{ id: 1, role: 'user', text: 'oi' }] });
  });

  it('a edição pode ser montada a partir do rascunho lido', async () => {
    save('b', { ...draft, edits: { a: { properties: { canal: 'app' } } } }, []);
    vi.mocked(api.planEdit).mockResolvedValue({ draft: edited, opsHash: 'h', screenConflicts: [] });
    await confirmBrowseEdit('b', (d) => ({ op: 'properties', id: 'a', properties: { ...(d?.edits as { a: { properties: object } }).a.properties, dono: 'x' } }));
    expect(vi.mocked(api.planEdit).mock.calls[0][2]).toEqual({ op: 'properties', id: 'a', properties: { canal: 'app', dono: 'x' } });
  });

  it('erro do servidor volta como erro e nada é gravado', async () => {
    const bad = { 'archlens-draft': 99 };
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(bad));
    vi.mocked(api.planEdit).mockRejectedValue(new Error('rascunho inválido'));
    expect(await confirmBrowseEdit('b', edit)).toEqual({ ok: false, error: 'rascunho inválido' });
    expect(JSON.parse(localStorage.getItem('archlens-gui-draft:b')!)).toEqual(bad);
  });

  it('rascunho salvo ilegível: recusa sem chamar o servidor e não toca no storage', async () => {
    localStorage.setItem('archlens-gui-draft:b', '{quebrado');
    localStorage.setItem('archlens-gui-chat:b', JSON.stringify([{ id: 1, role: 'user', text: 'oi' }]));
    expect(await confirmBrowseEdit('b', edit)).toEqual({ ok: false, error: UNREADABLE });
    expect(api.planEdit).not.toHaveBeenCalled();
    expect(localStorage.getItem('archlens-gui-draft:b')).toBe('{quebrado');
    expect(JSON.parse(localStorage.getItem('archlens-gui-chat:b')!)).toEqual([{ id: 1, role: 'user', text: 'oi' }]);
  });

  it('Planejar ocupado: recusa sem chamar o servidor', async () => {
    expect(await confirmBrowseEdit('b', edit, { blocked: () => 'Aguarde o chat terminar para editar' })).toEqual({ ok: false, error: 'Aguarde o chat terminar para editar' });
    expect(api.planEdit).not.toHaveBeenCalled();
  });

  it('o rascunho salvo mudou enquanto a edição era gravada: descarta o resultado', async () => {
    save('b', draft, []);
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    const p = confirmBrowseEdit('b', edit);
    const other = { ...draft, note: 'do Planejar' };
    save('b', other, [{ id: 2, role: 'assistant', text: 'feito' }]);
    finish({ draft: edited, opsHash: 'h', screenConflicts: [] });
    expect(await p).toEqual({ ok: false, error: CHANGED });
    expect(load('b')?.draft).toEqual(other);
  });

  it('Planejar ficou ocupado enquanto a edição era gravada: descarta o resultado', async () => {
    save('b', draft, []);
    let busy: string | null = null;
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    const p = confirmBrowseEdit('b', edit, { blocked: () => busy });
    busy = 'Aguarde o chat terminar para editar';
    finish({ draft: edited, opsHash: 'h', screenConflicts: [] });
    expect(await p).toEqual({ ok: false, error: CHANGED });
    expect(load('b')?.draft).toEqual(draft);
  });

  it('a conversa gravada é a salva no momento de gravar', async () => {
    save('b', draft, [{ id: 1, role: 'user', text: 'oi' }]);
    let finish!: (r: Awaited<ReturnType<typeof api.planEdit>>) => void;
    vi.mocked(api.planEdit).mockImplementation(() => new Promise((r) => { finish = r; }));
    const p = confirmBrowseEdit('b', edit);
    save('b', draft, [{ id: 1, role: 'user', text: 'oi' }, { id: 2, role: 'assistant', text: 'nota' }]);
    finish({ draft: edited, opsHash: 'h', screenConflicts: [] });
    expect(await p).toEqual({ ok: true });
    expect(load('b')?.chat.map((m) => m.text)).toEqual(['oi', 'nota']);
  });
});

describe('useBrowseNode', () => {
  it('com rascunho salvo, o nó vem como o rascunho o deixa', async () => {
    save('b', draft, []);
    const el = { card, doc: 'x', docRaw: 'x', docs: true, removed: false };
    vi.mocked(api.planElement).mockResolvedValue(el);
    const { result } = renderHook(() => useBrowseNode('b', 'a', true));
    await waitFor(() => expect(result.current.el).toEqual(el));
    expect(api.planElement).toHaveBeenCalledWith('b', draft, 'a');
  });

  it('sem rascunho, el fica null (o Navegar usa o cartão da base)', async () => {
    vi.mocked(api.planElement).mockResolvedValue({ card, doc: null, docRaw: null, docs: true, removed: false });
    const { result } = renderHook(() => useBrowseNode('b', 'a', true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.el).toBeNull();
  });

  it('com o Planejar desligado não consulta nada', async () => {
    save('b', draft, []);
    const { result } = renderHook(() => useBrowseNode('b', 'a', false));
    expect(result.current).toMatchObject({ el: null, error: null });
    expect(api.planElement).not.toHaveBeenCalled();
  });

  it('erro do servidor vira error', async () => {
    save('b', draft, []);
    vi.mocked(api.planElement).mockRejectedValue(new Error('quebrado'));
    const { result } = renderHook(() => useBrowseNode('b', 'a', true));
    await waitFor(() => expect(result.current.error).toBe('quebrado'));
    expect(result.current.el).toBeNull();
  });
});
