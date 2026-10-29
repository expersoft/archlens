export type BridgeEvent =
  | { type: 'ready' }
  | { type: 'select'; id: string | null }
  | { type: 'context'; id: string; x: number; y: number }
  | { type: 'expand'; id: string }
  | { type: 'theme'; theme: 'light' | 'dark' }
  | { type: 'state'; flowing: boolean; labels: boolean; legend: boolean; matrix: boolean };

export type Act = 'play' | 'flow' | 'labels' | 'legend' | 'matrix' | 'fit' | 'svg' | 'png' | 'present' | 'glossary';

export type HostMessage =
  | { type: 'act'; act: Act }
  | { type: 'theme'; theme: 'light' | 'dark' }
  | { type: 'select'; id: string | null };

/** Aceita só mensagens `source: 'archlens'` vindas do iframe atual. */
export function parseMessage(ev: MessageEvent, frame: HTMLIFrameElement | null | undefined): BridgeEvent | null {
  if (!frame || !frame.contentWindow || ev.source !== frame.contentWindow) return null;
  const d = ev.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || d.source !== 'archlens') return null;
  switch (d.type) {
    case 'ready':
      return { type: 'ready' };
    case 'select':
      return { type: 'select', id: typeof d.id === 'string' ? d.id : null };
    case 'context':
      if (typeof d.id !== 'string') return null;
      return { type: 'context', id: d.id, x: Number(d.x) || 0, y: Number(d.y) || 0 };
    case 'expand':
      return typeof d.id === 'string' ? { type: 'expand', id: d.id } : null;
    case 'theme':
      return d.theme === 'light' || d.theme === 'dark' ? { type: 'theme', theme: d.theme } : null;
    case 'state':
      return { type: 'state', flowing: !!d.flowing, labels: !!d.labels, legend: !!d.legend, matrix: !!d.matrix };
    default:
      return null;
  }
}

export function send(frame: HTMLIFrameElement | null | undefined, msg: HostMessage): void {
  frame?.contentWindow?.postMessage({ source: 'archlens-host', ...msg }, '*');
}
