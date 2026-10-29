import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { parseMessage, send, type Act, type BridgeEvent } from './bridge';
import type { ViewResult } from './api';
import type { Theme } from './theme';
import { isGuiShortcut } from './shortcuts';

export interface DiagramProps {
  view: ViewResult;
  /** Uma visão nova está sendo carregada: escurece o diagrama e marca aria-busy. */
  busy?: boolean;
  theme: Theme;
  onEvent: (e: BridgeEvent) => void;
}

type Flags = { flowing: boolean; labels: boolean; legend: boolean; matrix: boolean };
const OFF: Flags = { flowing: false, labels: false, legend: false, matrix: false };

const BUTTONS: { act: Act; label: string; flag?: keyof Flags }[] = [
  { act: 'play', label: 'Animar' },
  { act: 'flow', label: 'Fluxo', flag: 'flowing' },
  { act: 'labels', label: 'Rótulos', flag: 'labels' },
  { act: 'legend', label: 'Legenda', flag: 'legend' },
  { act: 'matrix', label: 'Matriz', flag: 'matrix' },
  { act: 'fit', label: 'Ajustar' },
  { act: 'svg', label: 'Exportar SVG' },
  { act: 'png', label: 'Exportar PNG' },
  { act: 'present', label: 'Apresentar' },
];

export const Diagram = forwardRef<HTMLIFrameElement, DiagramProps>(function Diagram({ view, theme, onEvent, busy = false }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(ref, () => frame.current as HTMLIFrameElement);
  const [flags, setFlags] = useState<Flags>(OFF);
  // Cada visão (e cada carga do iframe) começa com tudo desligado; o iframe reporta o estado real por `state`.
  useEffect(() => { setFlags(OFF); }, [view]);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // O iframe lê o tema do localStorage (mesma origem do srcDoc): o host grava antes de carregar.
  const writeTheme = (t: Theme) => { try { localStorage.setItem('archlens-theme', t); } catch { /* sem storage */ } };
  writeTheme(theme);

  useEffect(() => { send(frame.current, { type: 'theme', theme }); }, [theme]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const e = parseMessage(ev, frame.current);
      if (!e) return;
      if (e.type === 'state') setFlags({ flowing: e.flowing, labels: e.labels, legend: e.legend, matrix: e.matrix });
      if (e.type === 'ready') { setFlags(OFF); send(frame.current, { type: 'theme', theme: themeRef.current }); }
      onEventRef.current(e);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const act = useCallback((a: Act) => {
    if (a === 'present') {
      // O host é o único dono do fullscreen: requestFullscreen exige ativação do usuário (este clique)
      // e não se manda act:'present' ao iframe.
      try { void frame.current?.requestFullscreen?.()?.catch(() => {}); } catch { /* sem fullscreen */ }
      return;
    }
    send(frame.current, { type: 'act', act: a });
  }, []);

  // Atalhos da GUI com o foco dentro do iframe (srcdoc, mesma origem): reencaminha ao window do host.
  const cleanup = useRef<() => void>(() => {});
  const onLoad = useCallback(() => {
    cleanup.current();
    const w = frame.current?.contentWindow;
    if (!w) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
        return;
      }
      if (!isGuiShortcut(e)) return;
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: e.code, key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey,
      }));
    };
    w.addEventListener('keydown', h);
    cleanup.current = () => w.removeEventListener('keydown', h);
  }, []);
  useEffect(() => () => cleanup.current(), []);

  return (
    <div className="diagram" aria-busy={busy || undefined}>
      <div className="toolbar" role="toolbar" aria-label="Ferramentas do diagrama">
        {BUTTONS.map((b) => (
          <button
            key={b.act}
            type="button"
            aria-pressed={b.flag ? flags[b.flag] : undefined}
            className={b.flag && flags[b.flag] ? 'on' : ''}
            onClick={() => act(b.act)}
          >
            {b.label}
          </button>
        ))}
      </div>
      {view.alerts.length > 0 && (
        <div className="alerts" role="status">
          {view.alerts.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}
      {busy && <div className="busy" aria-hidden="true" />}
      {/* allow-same-origin só existe para o iframe ler o mesmo localStorage `archlens-theme` do host;
          com allow-scripts junto ele NÃO isola nada (o srcdoc é da base, conteúdo confiável). */}
      <iframe ref={frame} title="Diagrama" srcDoc={view.html} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" allow="fullscreen" onLoad={onLoad} />
    </div>
  );
});
