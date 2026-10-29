import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action } from './api';

export interface ContextMenuProps {
  at: { x: number; y: number };
  title: string;
  /** null: as ações ainda estão chegando; o menu já aparece, com "Carregando…". */
  items: Action[] | null;
  onPick: (a: Action) => void;
  onClose: () => void;
}

export function ContextMenu({ at, title, items, onPick, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      x: Math.max(0, Math.min(at.x, window.innerWidth - r.width)),
      y: Math.max(0, Math.min(at.y, window.innerHeight - r.height)),
    });
  }, [at.x, at.y, items]);

  useEffect(() => {
    const close = () => closeRef.current();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', down, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);

  const pick = (a: Action) => {
    if (!a.spec && !a.matrix) return;
    onPick(a);
    onClose();
  };

  const row = (a: Action, i: number, nested: boolean) => {
    const clickable = !!(a.spec || a.matrix);
    const off = !clickable && !a.sub;
    return (
      <div
        key={`${i}-${a.label}`}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup={a.sub ? 'menu' : undefined}
        aria-disabled={off || undefined}
        className={`mi${a.sub ? ' has-sub' : ''}${off ? ' off' : ''}`}
        onMouseEnter={() => { if (!nested) setOpen(a.sub ? i : null); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && a.sub && !nested) { e.stopPropagation(); setOpen(i); }
          else if (e.key === 'ArrowLeft' && nested) { e.stopPropagation(); setOpen(null); }
          else if (e.key === 'Enter') { e.stopPropagation(); pick(a); }
        }}
        onClick={(e) => { e.stopPropagation(); pick(a); }}
      >
        <span>{a.label}</span>
        {a.sub && <span className="arrow">›</span>}
        {a.sub && open === i && !nested && (
          <div className="menu sub" role="menu">{a.sub.map((s, j) => row(s, j, true))}</div>
        )}
      </div>
    );
  };

  return createPortal(
    <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="mt">{title}</div>
      {items
        ? items.map((a, i) => row(a, i, false))
        : <div className="mi off" role="menuitem" aria-disabled="true" aria-busy="true">Carregando…</div>}
    </div>,
    document.body,
  );
}
