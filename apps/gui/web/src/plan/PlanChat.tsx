import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from './draftStore';
import { NotesReview } from './NotesReview';
import type { RepoAttach } from '../api';

/** The chip of a repository: url@ref, else url@commit (short). */
const repoLabel = (r: { url: string; ref?: string; commit?: string }) => (r.ref ? `${r.url}@${r.ref}` : r.commit ? `${r.url}@${r.commit.slice(0, 7)}` : r.url);

export interface PlanChatProps {
  chat: ChatMsg[];
  /** The composer stays enabled during a round: writing again cancels it. */
  onSend: (text: string, attach?: RepoAttach) => void;
  onAnswer: (msg: ChatMsg, resolution: string) => void;
  /** The notes draft was approved (with the user's edits) or set aside. */
  onNotes?: (msg: ChatMsg, notes: { overview: string; notes: string } | null) => void;
  /** Shown above the composer when the draft does not fit in the browser. */
  notice?: React.ReactNode;
  /** The draft's repository: attaching another one is off (one repository per draft). */
  repo?: { url: string; ref?: string; commit?: string } | null;
}

export function PlanChat({ chat, onSend, onAnswer, onNotes, notice, repo }: PlanChatProps) {
  const [text, setText] = useState('');
  const [form, setForm] = useState<{ url: string; ref: string } | null>(null);
  const [attach, setAttach] = useState<RepoAttach | null>(null);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [chat]);

  const submit = () => {
    const t = text.trim();
    if (!t && !attach) return;
    setText('');
    if (!attach) { onSend(t); return; }
    setAttach(null);
    onSend(t || `Leia o repositório ${attach.url}`, attach);
  };
  const confirmAttach = () => {
    const url = form?.url.trim();
    if (!url) return;
    const ref = form!.ref.trim();
    setAttach({ url, ...(ref ? { ref } : {}) });
    setForm(null);
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
            {m.notes && (
              <NotesReview overview={m.notes.overview} notes={m.notes.notes} state={m.notesState} busy={m.status === 'running'} error={m.error}
                onApprove={(n) => onNotes?.(m, n)} onSkip={() => onNotes?.(m, null)} />
            )}
            {m.status === 'running' && <p className="meta">{m.stage ? `${m.stage}…` : 'planejando…'}</p>}
            {m.status === 'canceled' && <p className="meta">cancelada</p>}
            {m.error && !m.notes && <p className="err">{m.error}</p>}
            {m.warning && <p className="warn">{m.warning}</p>}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ul>
      {notice}
      <div className="askbox">
        <div className="attach">
          <button type="button" aria-label="Anexar repositório" title={repo ? 'um repositório por rascunho: aplique ou descarte o atual' : 'Anexar um repositório por URL git'}
            disabled={!!repo || !!attach} onClick={() => setForm(form ? null : { url: '', ref: '' })}>＋ Repositório</button>
          {repo && <span className="chip" title="repositório do rascunho">{repoLabel(repo)}</span>}
          {!repo && attach && (
            <span className="chip">{repoLabel(attach)} <button type="button" className="link" aria-label="Remover anexo" onClick={() => setAttach(null)}>×</button></span>
          )}
        </div>
        {form && !repo && (
          <div className="attach-form">
            <input aria-label="URL do repositório" placeholder="https://… ou git@host:caminho" value={form.url} autoFocus
              onChange={(e) => setForm({ ...form, url: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmAttach(); } }} />
            <input aria-label="Ref (opcional)" placeholder="branch, tag ou commit" value={form.ref}
              onChange={(e) => setForm({ ...form, ref: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmAttach(); } }} />
            <button type="button" disabled={!form.url.trim()} onClick={confirmAttach}>Anexar</button>
          </div>
        )}
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
