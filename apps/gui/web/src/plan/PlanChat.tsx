import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMsg } from './draftStore';
import { NotesReview } from './NotesReview';
import type { RepoAttach } from '../api';

/** The chip of a repository: url@ref, else url@commit (short). */
// The server's rule (cleanRepoUrl): any http(s) userinfo and ssh user:pass are credentials; a bare ssh user is not.
const CREDENTIAL = 'a URL do repositório não pode ter credencial embutida; use o token do ambiente (.env)';
const hasCredential = (url: string) => {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)@/i.exec(url);
  return !!m && (m[1].toLowerCase() !== 'ssh' || m[2].includes(':'));
};

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
  /** Clears the conversation (and so the history the agent gets); the draft stays. */
  onClear?: () => void;
  /** A screen edit is being written into the draft: sending or answering waits for it. */
  locked?: boolean;
}
const LOCKED = 'Aguarde a edição da tela ser gravada';

/** Typed in the composer, clears the conversation like the button. */
const CLEAR_CMD = /^\/(clear|limpar)$/i;

export function PlanChat({ chat, onSend, onAnswer, onNotes, notice, repo, onClear, locked }: PlanChatProps) {
  const [text, setText] = useState('');
  const [form, setForm] = useState<{ url: string; ref: string; error?: string } | null>(null);
  const [attach, setAttach] = useState<RepoAttach | null>(null);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [chat]);
  // The composer grows with its text (the CSS caps it at half the screen, then it scrolls).
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  const submit = () => {
    if (locked) return;
    const t = text.trim();
    if (!t && !attach) return;
    if (!attach && onClear && CLEAR_CMD.test(t)) { setText(''); onClear(); return; }
    setText('');
    if (!attach) { onSend(t); return; }
    setAttach(null);
    onSend(t || `Leia o repositório ${attach.url}`, attach);
  };
  const confirmAttach = () => {
    const url = form?.url.trim();
    if (!url) return;
    // refused here, so the credential never reaches the conversation (nor the model through the history)
    if (hasCredential(url)) { setForm({ ...form!, error: CREDENTIAL }); return; }
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
                    <button key={o} type="button" className={o === m.item!.recommendation ? 'on' : undefined} disabled={m.answered !== undefined || locked} title={locked && m.answered === undefined ? LOCKED : undefined} onClick={() => onAnswer(m, o)}>{o}</button>
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
          {onClear && (
            <button type="button" className="clear" aria-label="Limpar conversa" title="Limpar a conversa (o rascunho do delta continua)" disabled={!chat.length} onClick={onClear}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7v4.5M9.3 7v4.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Limpar
            </button>
          )}
          {!repo && attach && (
            <span className="chip">{repoLabel(attach)} <button type="button" className="link" aria-label="Remover anexo" onClick={() => setAttach(null)}>×</button></span>
          )}
        </div>
        {form && !repo && (
          <div className="attach-form">
            <input aria-label="URL do repositório" placeholder="https://… ou git@host:caminho" value={form.url} autoFocus
              onChange={(e) => setForm({ ...form, url: e.target.value, error: undefined })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmAttach(); } }} />
            <input aria-label="Ref (opcional)" placeholder="branch, tag ou commit" value={form.ref}
              onChange={(e) => setForm({ ...form, ref: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmAttach(); } }} />
            <button type="button" disabled={!form.url.trim()} onClick={confirmAttach}>Anexar</button>
            {form.error && <p className="err" role="alert">{form.error}</p>}
          </div>
        )}
        <div className="compose">
          <textarea
            ref={box}
            aria-label="Mensagem"
            rows={3}
            value={text}
            placeholder="Descreva a mudança na arquitetura…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          />
          <button type="button" className="send" aria-label="Enviar" title={locked ? LOCKED : 'Enviar (Ctrl+Enter)'} disabled={locked || (!text.trim() && !attach)} onClick={submit}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2.5 14 8 2 13.5l1.6-5.5L2 2.5Z M3.6 8H9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>
          </button>
        </div>
        <span className="hint">Ctrl+Enter envia · /limpar limpa a conversa · escrever durante uma rodada a cancela</span>
      </div>
    </div>
  );
}
