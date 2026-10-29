import { useState } from 'react';
import type { AskOption, ViewAnswer } from './api';
import type { Turn } from './question';

export interface ConversationProps {
  turns: Turn[];
  enabled: boolean;
  model?: string;
  /** Why a configured search is off (e.g. the missing key variable). */
  offReason?: string;
  onAsk: (q: string) => void;
  onChoose: (turn: Turn, id: string) => void;
  onOpen: (turn: Turn) => void;
}

const optionLabel = (o: AskOption) => [o.name, o.typeLabel ?? o.type].filter(Boolean).join(' · ');

function Answer({ a }: { a: ViewAnswer }) {
  return (
    <div className="answer">
      {a.sections.map((s) => (
        <section key={s.label}>
          <h4>{s.label}</h4>
          <table>
            <thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Tecnologia</th></tr></thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>{r.kind && r.kind !== r.type ? `${r.type} (${r.kind})` : r.type}</td>
                  <td>{r.status ?? ''}</td>
                  <td>{r.technology ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {a.edges.length > 0 && (
        <section>
          <h4>Relações</h4>
          <ul>{a.edges.map((e, i) => <li key={i}>{e.sentence}</li>)}</ul>
        </section>
      )}
      {a.matrix && a.matrix.length > 0 && (
        <section>
          <h4>Matriz de dependência</h4>
          <table>
            <thead><tr><th>Elemento</th><th>Tipo</th><th>Camada</th><th>Relação</th><th>Dist.</th><th>Caminho</th></tr></thead>
            <tbody>
              {a.matrix.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}{r.shown === false ? ' (oculto na visão)' : ''}</td>
                  <td>{r.typeLabel ?? ''}</td>
                  <td>{r.layerLabel ?? ''}</td>
                  <td>{r.role ?? ''}</td>
                  <td>{r.distance ?? ''}</td>
                  <td>{r.path.map((p) => `${p.via} → ${p.name}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {a.notes.map((n, i) => <p key={i} className="note">{n}</p>)}
    </div>
  );
}

function TurnView({ turn, onChoose, onOpen }: { turn: Turn; onChoose: ConversationProps['onChoose']; onOpen: ConversationProps['onOpen'] }) {
  const { result } = turn;
  return (
    <li className="turn" data-status={turn.status}>
      <p className="q">{turn.question}</p>
      {turn.status === 'running' && <p className="meta">{turn.stage ? `${turn.stage}…` : 'pensando…'}</p>}
      {turn.status === 'canceled' && <p className="meta">cancelada</p>}
      {turn.error && <p className="err" role="alert">{turn.error}</p>}
      {turn.warning && <p className="warn">{turn.warning}</p>}
      {result?.kind === 'clarify' && (
        <div className="clarify">
          <p>{result.question ?? 'Qual deles?'}</p>
          {result.options.map((o) => (
            <button key={o.id} type="button" onClick={() => onChoose(turn, o.id)}>{optionLabel(o)}</button>
          ))}
        </div>
      )}
      {result?.kind === 'none' && !turn.warning && <p className="meta">Nada encontrado.</p>}
      {result?.kind === 'element' && <p className="meta">Elemento aberto nos detalhes.</p>}
      {turn.answer && <Answer a={turn.answer} />}
      {(turn.view || turn.markdown) && (
        <div className="acts">
          {turn.view && <button type="button" onClick={() => onOpen(turn)}>Abrir visão</button>}
          {turn.markdown && (
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(turn.markdown!); }}>Copiar markdown</button>
          )}
        </div>
      )}
      {turn.ms != null && turn.status === 'done' && <p className="meta">{Math.round(turn.ms)} ms</p>}
    </li>
  );
}

export function Conversation({ turns, enabled, model, offReason, onAsk, onChoose, onOpen }: ConversationProps) {
  const [text, setText] = useState('');
  return (
    <div className="conversation">
      {turns.length > 0 && (
        <ol className="turns" aria-label="Turnos">
          {turns.map((t) => <TurnView key={t.id} turn={t} onChoose={onChoose} onOpen={onOpen} />)}
        </ol>
      )}
      <div className="askbox">
        <textarea
          aria-label="Pergunta"
          rows={2}
          value={text}
          disabled={!enabled}
          placeholder={enabled ? 'Pergunte sobre a arquitetura…' : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            const q = text.trim();
            if (!q) return;
            setText('');
            onAsk(q);
          }}
        />
        {enabled
          ? model && <span className="hint">via {model}</span>
          : <span className="hint">{offReason
            ? `Busca em texto desligada: ${offReason}.`
            : 'Busca em texto desligada. Suba com archlens serve <base> --llm anthropic.'}</span>}
      </div>
    </div>
  );
}
