import { useState } from 'react';
import type { PropValue, ScreenConflict } from '../api';

const SHOWN_MAX = 200;
/** A value as one short line (a doc can be 100 KB). */
function brief(v: PropValue | null): string {
  if (v === null || v === undefined) return '—';
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > SHOWN_MAX ? `${t.slice(0, SHOWN_MAX)}…` : t;
}

export interface ScreenConflictDialogProps {
  conflict: ScreenConflict;
  nodeName: string;
  onChoose: (choice: 'mine' | 'theirs') => void;
  /** Um turno do chat está rodando: responder agora seria sobrescrito por ele. */
  locked?: boolean;
}

/** The chat wants another value for a field edited on screen: keep yours (default) or take the chat's. */
export function ScreenConflictDialog({ conflict, nodeName, onChoose, locked }: ScreenConflictDialogProps) {
  const [choice, setChoice] = useState<'mine' | 'theirs'>('mine');
  return (
    <div className="screen-conflict" role="dialog" aria-label="O chat quer mudar algo que você editou">
      <h3>O chat quer mudar algo que você editou</h3>
      <p><b>{nodeName}</b> · {conflict.field}</p>
      <fieldset>
        <div>
          <label><input type="radio" name="screen-conflict" checked={choice === 'mine'} onChange={() => setChoice('mine')} />Manter o seu</label>
          <span className="val">{brief(conflict.mine)}</span>
        </div>
        <div>
          <label><input type="radio" name="screen-conflict" checked={choice === 'theirs'} onChange={() => setChoice('theirs')} />Usar o do chat</label>
          <span className="val">{brief(conflict.theirs)}</span>
        </div>
      </fieldset>
      <div className="acts"><button type="button" className="on" disabled={locked} title={locked ? 'Aguarde o chat terminar para editar' : undefined} onClick={() => onChoose(choice)}>Confirmar</button></div>
    </div>
  );
}
