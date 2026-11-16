import { describe, expect, it, vi } from 'vitest';
import { parseMessage, send, withTheme } from './bridge';

function frame() {
  const f = document.createElement('iframe');
  document.body.appendChild(f);
  return f;
}
const ev = (source: unknown, data: unknown, origin = 'null') => ({ source, data, origin }) as unknown as MessageEvent;

describe('parseMessage', () => {
  it('aceita select vindo do iframe atual', () => {
    const f = frame();
    expect(parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'select', id: 'tele.api' }), f)).toEqual({
      type: 'select',
      id: 'tele.api',
    });
  });
  it('recusa source diferente', () => {
    const f = frame();
    expect(parseMessage(ev(f.contentWindow, { source: 'outro', type: 'select', id: 'x' }), f)).toBeNull();
    expect(parseMessage(ev(f.contentWindow, 'texto'), f)).toBeNull();
    expect(parseMessage(ev(f.contentWindow, null), f)).toBeNull();
  });
  it('recusa ev.source que não seja o iframe', () => {
    const f = frame();
    const other = frame();
    expect(parseMessage(ev(other.contentWindow, { source: 'archlens', type: 'ready' }), f)).toBeNull();
    expect(parseMessage(ev(window, { source: 'archlens', type: 'ready' }), f)).toBeNull();
    expect(parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'ready' }), null)).toBeNull();
  });
  it('interpreta os demais tipos e descarta desconhecidos', () => {
    const f = frame();
    const p = (d: object) => parseMessage(ev(f.contentWindow, { source: 'archlens', ...d }), f);
    expect(p({ type: 'select', id: null })).toEqual({ type: 'select', id: null });
    expect(p({ type: 'context', id: 'a', x: 1, y: 2 })).toEqual({ type: 'context', id: 'a', x: 1, y: 2 });
    expect(p({ type: 'theme', theme: 'dark' })).toEqual({ type: 'theme', theme: 'dark' });
    expect(p({ type: 'theme', theme: 'roxo' })).toBeNull();
    expect(p({ type: 'state', flowing: true })).toEqual({ type: 'state', flowing: true, labels: false, legend: false, matrix: false });
    expect(p({ type: 'nada' })).toBeNull();
  });
  it('recusa mensagem com origem diferente de null', () => {
    const f = frame();
    expect(parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'ready' }, 'http://localhost:5173'), f)).toBeNull();
    expect(parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'ready' }, 'null'), f)).toEqual({ type: 'ready' });
  });
  it('recusa id acima de 500 caracteres', () => {
    const f = frame();
    const p = (d: object) => parseMessage(ev(f.contentWindow, { source: 'archlens', ...d }), f);
    expect(p({ type: 'select', id: 'a'.repeat(501) })).toBeNull();
    expect(p({ type: 'expand', id: 'a'.repeat(501) })).toBeNull();
    expect(p({ type: 'context', id: 'a'.repeat(501), x: 1, y: 1 })).toBeNull();
    expect(p({ type: 'context', id: 'a', x: Infinity, y: NaN })).toEqual({ type: 'context', id: 'a', x: 0, y: 0 });
  });
  it('key: só Escape e os atalhos da GUI passam', () => {
    const f = frame();
    const p = (d: object) => parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'key', ...d }), f);
    expect(p({ key: 'k', code: 'KeyK', ctrlKey: true })).toEqual({ type: 'key', key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false });
    expect(p({ key: 'Escape', code: 'Escape' })).toMatchObject({ type: 'key', key: 'Escape' });
    expect(p({ key: 'a', code: 'KeyA', ctrlKey: true })).toBeNull();
    expect(p({ key: 'k', code: 'KeyK' })).toBeNull();
    expect(p({})).toBeNull();
  });
});

describe('send', () => {
  it('posta com source archlens-host', () => {
    const f = frame();
    const spy = vi.spyOn(f.contentWindow!, 'postMessage');
    send(f, { type: 'act', act: 'fit' });
    expect(spy).toHaveBeenCalledWith({ source: 'archlens-host', type: 'act', act: 'fit' }, '*');
  });
});

describe('withTheme', () => {
  it('marca o tema na tag html e não mexe no resto', () => {
    expect(withTheme('<!doctype html>\n<html lang="pt-BR"><body><html></body>', 'dark')).toBe('<!doctype html>\n<html data-theme="dark" lang="pt-BR"><body><html></body>');
    expect(withTheme('<p>x</p>', 'light')).toBe('<p>x</p>');
  });
});
