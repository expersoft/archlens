import { useCallback, useRef, type ReactNode } from 'react';
import { useStoredState } from '../store';

const MIN = 15;
const MAX = 85;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const PRESETS = [
  { at: 75, label: 'Conversa larga' },
  { at: 50, label: 'Meio a meio' },
  { at: 25, label: 'Diagrama largo' },
];

/** A 16px layout glyph in the VS Code style: the frame, the divider at `at`% and the wide side filled. */
function PresetIcon({ at }: { at: number }) {
  const x = 1.6 + (12.8 * at) / 100;
  return (
    <svg className="glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1={x} y1="3" x2={x} y2="13" stroke="currentColor" strokeWidth="1.2" />
      {at >= 50 && <rect x="2.6" y="3.6" width={x - 3.6} height="8.8" rx=".6" fill="currentColor" opacity={at === 50 ? 0.45 : 1} />}
      {at <= 50 && <rect x={x + 1} y="3.6" width={13.4 - x - 1} height="8.8" rx=".6" fill="currentColor" opacity={at === 50 ? 0.45 : 1} />}
    </svg>
  );
}

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
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.at} type="button" title={p.label} aria-label={p.label} aria-pressed={at === p.at} className={at === p.at ? 'on' : ''} onClick={() => setPos(p.at)}>
              <PresetIcon at={p.at} />
            </button>
          ))}
        </div>
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
