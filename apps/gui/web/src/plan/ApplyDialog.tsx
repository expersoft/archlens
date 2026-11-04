export interface ApplyDialogProps {
  /** "+N ~N −N" of the plan shown. */
  summary: string;
  /** Titles of the saved views the plan touches. */
  views: string[];
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Offered with a write refusal that planning again solves. */
  onReplan?: () => void;
}

/** The last stop before writing: what goes in, and the explicit confirmation. */
export function ApplyDialog({ summary, views, busy, error, onConfirm, onCancel, onReplan }: ApplyDialogProps) {
  return (
    <div className="apply-dialog" role="dialog" aria-label="Confirmar a aplicação">
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
    </div>
  );
}
