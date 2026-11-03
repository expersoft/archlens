import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from './draftStore';

export interface PlanChatProps {
  chat: ChatMsg[];
  /** The composer stays enabled during a round: writing again cancels it. */
  onSend: (text: string) => void;
  onAnswer: (msg: ChatMsg, resolution: string) => void;
  /** Shown above the composer when the draft does not fit in the browser. */
  notice?: React.ReactNode;
}

export function PlanChat({ chat, onSend, onAnswer, notice }: PlanChatProps) {
  const [text, setText] = useState('');
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [chat]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  };

  return (
    <div className="conversation plan-chat">
      <ul className="turns" aria-label="Conversa de planejamento">
        {chat.map((m) => (
          <li key={m.id} className={`turn ${m.role}`}>
            {m.role === 'user' ? <p className="q">{m.text}</p> : m.text && !m.item && <p>{m.text}</p>}
            {m.item && (
              <div className="clarify">
                <p>{m.item.question}</p>
                <p className="note">Recomendo <b>{m.item.recommendation}</b>{m.item.reason ? `: ${m.item.reason}` : ''}</p>
                <div className="acts">
                  {m.item.options.map((o) => (
                    <button key={o} type="button" className={o === m.item!.recommendation ? 'on' : undefined} disabled={m.answered !== undefined} onClick={() => onAnswer(m, o)}>{o}</button>
                  ))}
                </div>
                {m.answered !== undefined && <p className="meta">respondida: {m.answered}</p>}
              </div>
            )}
            {m.status === 'running' && <p className="meta">{m.stage ? `${m.stage}…` : 'planejando…'}</p>}
            {m.status === 'canceled' && <p className="meta">cancelada</p>}
            {m.error && <p className="err">{m.error}</p>}
            {m.warning && <p className="warn">{m.warning}</p>}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ul>
      {notice}
      <div className="askbox">
        <textarea
          aria-label="Mensagem"
          rows={3}
          value={text}
          placeholder="Descreva a mudança na arquitetura…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <span className="hint">Enter envia · Shift+Enter quebra a linha · escrever durante uma rodada a cancela</span>
      </div>
    </div>
  );
}
