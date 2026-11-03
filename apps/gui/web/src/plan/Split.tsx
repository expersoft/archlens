import { useCallback, useRef, type ReactNode } from 'react';
import { useStoredState } from '../store';

const MIN = 15;
const MAX = 85;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));

/** Two panes with a draggable divider; `left` takes the stored percentage of the width. */
export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  const [pos, setPos] = useStoredState<number>('archlens-gui-plan-split', 50);
  const at = clamp(Number(pos) || 50);
  const box = useRef<HTMLDivElement>(null);

  const drag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const move = (m: PointerEvent) => setPos(clamp(((m.clientX - rect.left) / rect.width) * 100));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, [setPos]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(clamp(at - 5)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setPos(clamp(at + 5)); }
  };

  return (
    <div className="split" ref={box}>
      <div className="split-bar toolbar" role="group" aria-label="Largura dos painéis">
        <button type="button" onClick={() => setPos(75)}>Conversa larga</button>
        <button type="button" onClick={() => setPos(50)}>Meio a meio</button>
        <button type="button" onClick={() => setPos(25)}>Diagrama largo</button>
      </div>
      <div className="split-panes">
        <section className="split-pane" style={{ flexBasis: `${at}%` }}>{left}</section>
        <div
          className="split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Divisória"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={at}
          tabIndex={0}
          onPointerDown={drag}
          onKeyDown={onKey}
        />
        <section className="split-pane" style={{ flexBasis: `${100 - at}%` }}>{right}</section>
      </div>
    </div>
  );
}
