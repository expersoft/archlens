import { useEffect, useRef, useState } from 'react';
import type { AlertInfo } from './api';

export interface AlertAction {
  id: 'nest' | 'focus' | 'layer' | 'present';
  label: string;
  run: () => void;
  /** Escolhas da ação (uma por camada): a ação abre a lista em vez de rodar. */
  options?: { label: string; run: () => void }[];
}

export interface AlertBadgeProps { alerts: AlertInfo[]; actions: AlertAction[] }

const explain = (a: Pick<AlertInfo, 'nodes' | 'minFontPx'>) =>
  `Com ${a.nodes ?? '?'} elementos, o texto fica ${a.minFontPx != null ? `com cerca de ${a.minFontPx}px` : 'pequeno'} quando a visão inteira cabe na tela.`;

/** Selo `⚠ N` da barra do diagrama: abre o painel dos avisos da visão, com as ações que se aplicam. */
export function AlertBadge({ alerts, actions }: AlertBadgeProps) {
  const [open, setOpen] = useState(false);
  const [layers, setLayers] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const close = () => { setOpen(false); setLayers(false); };

  const sig = alerts.map((a) => `${a.kind}:${a.text}`).join('\n');
  useEffect(() => { setOpen(false); setLayers(false); }, [sig]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', close);
    document.addEventListener('mousedown', down);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', close); document.removeEventListener('mousedown', down); };
  }, [open]);

  // A mesma visão grande pode vir como size e legibility: uma causa, uma seção.
  const bigs = alerts.filter((a) => a.kind !== 'layout');
  const big = bigs.length > 0 ? { nodes: bigs.find((a) => a.nodes != null)?.nodes, minFontPx: bigs.find((a) => a.minFontPx != null)?.minFontPx } : null;
  const layouts = alerts.filter((a) => a.kind === 'layout');
  const count = (big ? 1 : 0) + layouts.length;
  if (!count) return null;
  const pick = (run: () => void) => { close(); run(); };

  return (
    <span className="alert-badge" ref={box}>
      <button type="button" className="alert-btn" aria-label={`Avisos da visão (${count})`} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>⚠ {count}</button>
      {open && (
        <div className="alert-panel" role="dialog" aria-label="Avisos da visão">
          {big && <section className="alert-item"><h4>Visão grande para uma tela</h4><p>{explain(big)}</p></section>}
          {layouts.map((a, i) => <section key={i} className="alert-item"><h4>Nota do layout</h4><p>{a.text}</p></section>)}
          {big && actions.length > 0 && (
            <div className="alert-actions">
              {actions.map((a) => (
                <div key={a.id}>
                  <button type="button" onClick={() => (a.options ? setLayers((v) => !v) : pick(a.run))}>{a.label}</button>
                  {a.options && layers && (
                    <div className="alert-options">
                      {a.options.map((o) => <button key={o.label} type="button" onClick={() => pick(o.run)}>{o.label}</button>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
