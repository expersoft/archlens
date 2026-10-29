import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { parseMessage, send, type Act, type BridgeEvent } from './bridge';
import type { ViewResult } from './api';
import type { Theme } from './theme';

export interface DiagramProps {
  view: ViewResult;
  theme: Theme;
  onEvent: (e: BridgeEvent) => void;
}

type Flags = { flowing: boolean; labels: boolean; legend: boolean; matrix: boolean };

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

export const Diagram = forwardRef<HTMLIFrameElement, DiagramProps>(function Diagram({ view, theme, onEvent }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(ref, () => frame.current as HTMLIFrameElement);
  const [flags, setFlags] = useState<Flags>({ flowing: false, labels: false, legend: false, matrix: false });
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
      if (e.type === 'ready') send(frame.current, { type: 'theme', theme: themeRef.current });
      onEventRef.current(e);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const act = useCallback((a: Act) => {
    if (a === 'present') {
      // requestFullscreen exige ativação do usuário: tem de sair deste clique, não do postMessage
      try { void frame.current?.requestFullscreen?.()?.catch(() => {}); } catch { /* sem fullscreen */ }
    }
    send(frame.current, { type: 'act', act: a });
  }, []);

  return (
    <div className="diagram">
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
      <iframe ref={frame} title="Diagrama" srcDoc={view.html} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" allow="fullscreen" />
    </div>
  );
});
