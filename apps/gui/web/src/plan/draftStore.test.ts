import { afterEach, describe, expect, it, vi } from 'vitest';
import { clear, load, save, type ChatMsg } from './draftStore';

const draft = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: null, plan: null };
const chat: ChatMsg[] = [{ id: 1, role: 'user', text: 'oi' }];

afterEach(() => vi.restoreAllMocks());

describe('draftStore', () => {
  it('guarda e lê o rascunho e a conversa nas chaves da base', () => {
    expect(load('b')).toBeNull();
    expect(save('b', draft, chat)).toBe('ok');
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeTruthy();
    expect(localStorage.getItem('archlens-gui-chat:b')).toBeTruthy();
    expect(load('b')).toEqual({ draft, chat });
    clear('b');
    expect(load('b')).toBeNull();
    expect(localStorage.getItem('archlens-gui-chat:b')).toBeNull();
  });

  it('storage cheio corta a conversa primeiro', () => {
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('archlens-gui-chat:')) throw new DOMException('cheio', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    expect(save('b', draft, chat)).toBe('chat-trimmed');
    expect(load('b')).toEqual({ draft, chat: [] });
  });

  it('rascunho que não cabe devolve too-big', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError'); });
    expect(save('b', draft, chat)).toBe('too-big');
  });

  it('rascunho que só cabe sem a conversa salva o rascunho e devolve chat-trimmed', () => {
    localStorage.setItem('archlens-gui-chat:b', 'x'.repeat(50));
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      // quota: the draft fits only while the old chat is gone; the chat never fits
      if (k.startsWith('archlens-gui-chat:') || this.getItem('archlens-gui-chat:b') !== null) throw new DOMException('cheio', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    expect(save('b', draft, chat)).toBe('chat-trimmed');
    expect(load('b')).toEqual({ draft, chat: [] });
  });

  it('rascunho que nunca cabe devolve too-big e não deixa o rascunho velho', () => {
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify({ ...draft, note: 'velho' }));
    localStorage.setItem('archlens-gui-chat:b', '[]');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError'); });
    expect(save('b', draft, chat)).toBe('too-big');
    vi.restoreAllMocks();
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    expect(load('b')).toBeNull();
  });

  it('sem rascunho guarda só a conversa; conversa vazia não deixa nada', () => {
    localStorage.setItem('archlens-gui-draft:b', JSON.stringify(draft));
    expect(save('b', null, chat)).toBe('ok');
    expect(localStorage.getItem('archlens-gui-draft:b')).toBeNull();
    expect(load('b')).toEqual({ draft: null, chat });
    expect(save('b', null, [])).toBe('ok');
    expect(localStorage.getItem('archlens-gui-chat:b')).toBeNull();
    expect(load('b')).toBeNull();
  });

  it('leitura com storage quebrado ou JSON inválido devolve null', () => {
    localStorage.setItem('archlens-gui-draft:b', '{ruim');
    expect(load('b')).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(load('b')).toBeNull();
    expect(() => clear('b')).not.toThrow();
  });
});
