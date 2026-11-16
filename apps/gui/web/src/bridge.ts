import { isGuiShortcut } from './shortcuts';

export type BridgeEvent =
  | { type: 'ready' }
  | { type: 'select'; id: string | null }
  | { type: 'context'; id: string; x: number; y: number }
  | { type: 'expand'; id: string }
  | { type: 'theme'; theme: 'light' | 'dark' }
  /** Atalho da GUI (Ctrl/Meta+B, Ctrl/Meta+K) ou Escape teclado com o foco dentro do diagrama. */
  | { type: 'key'; key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }
  | { type: 'state'; flowing: boolean; labels: boolean; legend: boolean; matrix: boolean };

export type Act = 'play' | 'flow' | 'labels' | 'legend' | 'matrix' | 'fit' | 'svg' | 'png' | 'present' | 'glossary';

export type HostMessage =
  | { type: 'act'; act: Act }
  | { type: 'theme'; theme: 'light' | 'dark' }
  /** `focus`: além de destacar, centra o nó (escolha no Explorador ou na busca). */
  | { type: 'select'; id: string | null; focus?: boolean };

const ID_MAX = 500;
const idOf = (v: unknown): string | null => (typeof v === 'string' && v.length <= ID_MAX ? v : null);
const finite = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Aceita só mensagens `source: 'archlens'` vindas do iframe atual, que roda sem origem (sandbox sem
 * allow-same-origin): `ev.origin` é a string 'null'. Ids têm tamanho limitado; números são finitos.
 */
export function parseMessage(ev: MessageEvent, frame: HTMLIFrameElement | null | undefined): BridgeEvent | null {
  if (!frame || !frame.contentWindow || ev.source !== frame.contentWindow || ev.origin !== 'null') return null;
  const d = ev.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || d.source !== 'archlens') return null;
  switch (d.type) {
    case 'ready':
      return { type: 'ready' };
    case 'select':
      if (typeof d.id !== 'string') return { type: 'select', id: null };
      return d.id.length <= ID_MAX ? { type: 'select', id: d.id } : null;
    case 'context': {
      const id = idOf(d.id);
      return id === null ? null : { type: 'context', id, x: finite(d.x), y: finite(d.y) };
    }
    case 'expand': {
      const id = idOf(d.id);
      return id === null ? null : { type: 'expand', id };
    }
    case 'theme':
      return d.theme === 'light' || d.theme === 'dark' ? { type: 'theme', theme: d.theme } : null;
    case 'key': {
      const k = { key: String(d.key ?? ''), code: String(d.code ?? ''), ctrlKey: !!d.ctrlKey, metaKey: !!d.metaKey, altKey: !!d.altKey, shiftKey: !!d.shiftKey };
      // Só o que a GUI trata: o diagrama não vira um canal para qualquer tecla.
      return k.key === 'Escape' || isGuiShortcut(k) ? { type: 'key', ...k } : null;
    }
    case 'state':
      return { type: 'state', flowing: !!d.flowing, labels: !!d.labels, legend: !!d.legend, matrix: !!d.matrix };
    default:
      return null;
  }
}

/**
 * O HTML do diagrama com o tema já marcado em `<html>`. O iframe roda sem origem (sandbox sem allow-same-origin) e
 * não lê o localStorage do host; marcar aqui evita abrir no tema errado até a ponte responder.
 */
export function withTheme(html: string, theme: 'light' | 'dark'): string {
  return html.replace(/<html\b/, `<html data-theme="${theme}"`);
}

// O alvo '*' é de propósito: um documento sem origem não é endereçável por origem. Quem recebe é sempre o
// contentWindow deste iframe, e as mensagens só levam ação, tema e id de nó.
export function send(frame: HTMLIFrameElement | null | undefined, msg: HostMessage): void {
  frame?.contentWindow?.postMessage({ source: 'archlens-host', ...msg }, '*');
}
