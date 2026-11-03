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

  it('leitura com storage quebrado ou JSON inválido devolve null', () => {
    localStorage.setItem('archlens-gui-draft:b', '{ruim');
    expect(load('b')).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(load('b')).toBeNull();
    expect(() => clear('b')).not.toThrow();
  });
});
