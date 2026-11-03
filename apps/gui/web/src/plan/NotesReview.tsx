import { useState } from 'react';

export interface NotesReviewProps {
  overview: string;
  notes: string;
  /** Once decided the form is read-only and shows the outcome. */
  state?: 'saved' | 'skipped';
  busy?: boolean;
  error?: string;
  onApprove: (notes: { overview: string; notes: string }) => void;
  onSkip: () => void;
}

/** The agent's draft of the interpretation notes, editable; only "Aprovar" writes them. */
export function NotesReview({ overview, notes, state, busy, error, onApprove, onSkip }: NotesReviewProps) {
  const [ov, setOv] = useState(overview);
  const [nt, setNt] = useState(notes);
  const locked = !!state || !!busy;
  return (
    <div className="notes-review">
      <label>Visão geral (notes/overview.md)
        <textarea rows={6} value={ov} disabled={locked} onChange={(e) => setOv(e.target.value)} />
      </label>
      <label>Notas de interpretação (notes.md)
        <textarea rows={6} value={nt} disabled={locked} onChange={(e) => setNt(e.target.value)} />
      </label>
      {error && <p className="err">{error}</p>}
      {state === 'saved' && <p className="meta">notas gravadas</p>}
      {state === 'skipped' && <p className="meta">notas descartadas (o apply continua valendo)</p>}
      {!state && (
        <div className="acts">
          <button type="button" className="on" disabled={busy} onClick={() => onApprove({ overview: ov, notes: nt })}>Aprovar</button>
          <button type="button" disabled={busy} onClick={onSkip}>Agora não</button>
        </div>
      )}
    </div>
  );
}
