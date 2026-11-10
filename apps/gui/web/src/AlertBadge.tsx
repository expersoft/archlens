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

const explain = (a: AlertInfo) =>
  `Com ${a.nodes ?? '?'} elementos, o texto fica ${a.minFontPx != null ? `com cerca de ${a.minFontPx}px` : 'pequeno'} quando a visão inteira cabe na tela.`;

/** Selo `⚠ N` da barra do diagrama: abre o painel dos avisos da visão, com as ações que se aplicam. */
export function AlertBadge({ alerts, actions }: AlertBadgeProps) {
  const [open, setOpen] = useState(false);
  const [layers, setLayers] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const close = () => { setOpen(false); setLayers(false); };

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [open]);

  if (!alerts.length) return null;
  const big = alerts.some((a) => a.kind === 'legibility' || a.kind === 'size');
  const pick = (run: () => void) => { close(); run(); };

  return (
    <span className="alert-badge" ref={box}>
      <button type="button" className="alert-btn" aria-label={`Avisos da visão (${alerts.length})`} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>⚠ {alerts.length}</button>
      {open && (
        <div className="alert-panel" role="dialog" aria-label="Avisos da visão">
          {alerts.map((a, i) => (
            <section key={i} className="alert-item">
              {a.kind === 'layout'
                ? <><h4>Nota do layout</h4><p>{a.text}</p></>
                : <><h4>Visão grande para uma tela</h4><p>{explain(a)}</p></>}
            </section>
          ))}
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
