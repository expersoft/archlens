import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { ApplyStepId, PlanApplyResult } from '../api';

/** A step of the apply as the checklist shows it. */
export interface ApplyStepView {
  id: ApplyStepId;
  label: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  /** The connector's write ("commit a1b2c3d", the folder), "k de n" of the views, or the failure's message. */
  detail?: string;
}

export interface ApplyDialogProps {
  /** confirm: the last stop before writing; running: the checklist, nothing to click; done/failed: the end, Fechar. */
  phase: 'confirm' | 'running' | 'done' | 'failed';
  /** "+N ~N −N" of the plan shown. */
  summary: string;
  /** Titles of the saved views the plan touches. */
  views: string[];
  steps: ApplyStepView[];
  /** How many changes are applied. */
  count: number;
  result?: PlanApplyResult;
  /** Why the apply stopped, and whether the base had been written by then. */
  failure?: { message: string; written: boolean };
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Offered with a write refusal that planning again solves. */
  onReplan?: () => void;
  onClose: () => void;
}

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const MARK: Record<ApplyStepView['state'], string> = { pending: '', running: '', done: '✓', failed: '✕' };

const changes = (n: number) => `${n} ${n === 1 ? 'mudança' : 'mudanças'}`;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** What the apply did, as the GUI showed it after Aplicar: the round, the commit, the views regenerated and their alerts. */
function Summary({ result }: { result: PlanApplyResult }) {
  const { entry, build, commit } = result;
  const keys = new Set((build?.results ?? []).map((r) => r.key));
  return (
    <ul className="apply-sum">
      {entry && <li>Rodada{text(entry.id) && ` ${text(entry.id)}`}: <b>{text(entry.summary)}</b></li>}
      {commit && <li>Commit {commit.slice(0, 7)}</li>}
      {build && !build.error && (build.available
        ? <li>{keys.size} visão(ões) regerada(s) · {build.problems} alerta(s) de legibilidade</li>
        : <li>Visões salvas não regeradas{build.reason ? ` (${build.reason})` : ''}</li>)}
    </ul>
  );
}

/**
 * The window of Aplicar, centered over everything: the confirmation, then the checklist of the steps while the base is
 * written (no Cancelar: a write is not stopped halfway), and the end with Fechar.
 */
export function ApplyDialog({ phase, summary, views, steps, count, result, failure, busy, error, onConfirm, onCancel, onReplan, onClose }: ApplyDialogProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => back?.focus?.();
  }, []);
  const confirming = phase === 'confirm';
  const ended = phase === 'done' || phase === 'failed';
  const title = confirming ? 'Confirmar a aplicação' : `Aplicando ${changes(count)} na base`;

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      if (confirming && !busy) onCancel();
      else if (ended) onClose();
      return;
    }
    if (ev.key !== 'Tab' || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) { ev.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  };

  return (
    <div className="apply-veil">
      <div className="apply-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={root} onKeyDown={onKey}>
        {confirming ? (
          <>
            <p>Aplicar grava este plano na base: <b>{summary}</b></p>
            {views.length > 0 && (
              <>
                <p className="meta">Visões afetadas</p>
                <ul>{views.map((v) => <li key={v}>{v}</li>)}</ul>
              </>
            )}
            {error && <p className="err">{error}</p>}
            <div className="acts">
              <button type="button" className="on" disabled={busy} onClick={onConfirm}>Confirmar e aplicar</button>
              {onReplan && <button type="button" disabled={busy} onClick={onReplan}>Replanejar</button>}
              <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="apply-t">{title}</h3>
            <ol className="apply-steps">
              {steps.map((s) => {
                const detail = s.detail ?? (s.state === 'failed' ? failure?.message : undefined);
                return (
                  <li key={s.id} className={s.state} aria-busy={s.state === 'running' ? true : undefined}>
                    <span className="apply-mk" aria-hidden={s.state === 'running' || s.state === 'pending' ? true : undefined}>
                      {s.state === 'running' ? <span className="apply-spin" /> : MARK[s.state]}
                    </span>
                    <span className="apply-l">{s.label}</span>
                    {detail && <span className="apply-d">{detail}</span>}
                  </li>
                );
              })}
            </ol>
            {ended && result && <Summary result={result} />}
            {phase === 'failed' && failure?.written && <p className="warn">A base foi gravada; o que falhou depois dela está na etapa em vermelho.</p>}
            {ended && result?.entry && result.notesDraftNeeded && <p className="meta">A seguir: o chat propõe as notas de interpretação</p>}
            {ended && (
              <div className="acts">
                <button type="button" className="on" onClick={onClose}>Fechar</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
