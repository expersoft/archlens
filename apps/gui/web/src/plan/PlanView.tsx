import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, planApply, planNotes, planOpen, planTurn, type AppliedRound, type Draft, type PlanApplyResult, type PlanEvent, type PlanPreviewResult, type PlanRequest, type RepoAttach, type ViewSpec } from '../api';
import { ApplyDialog } from './ApplyDialog';
import { PlanPreview } from './PlanPreview';
import { PlanChat } from './PlanChat';
import { Split } from './Split';
import { clear, load, save, type ChatMsg } from './draftStore';

const HISTORY_MAX = 40; // the server's limit
const TOO_BIG = 'o rascunho não cabe no navegador; baixe-o para não perder o trabalho';
const REPLACE = 'Substituir o rascunho atual pelo do arquivo? O atual se perde se não foi baixado.';
const DISCARD = 'Descartar o rascunho atual? Ele se perde se não foi baixado.';
const CLEAR_PENDING = 'Há decisão ou notas esperando resposta nesta conversa. Limpar mesmo assim? O rascunho do delta continua.';
const BROKEN = 'o rascunho salvo não abre; descarte-o ("Descartar rascunho") ou suba outro';
const TRIMMED = 'a conversa antiga foi cortada para caber no navegador; o rascunho está inteiro';
const NOTES_ASK = 'rascunhe as notas de interpretação desta rodada';
const ROUND_RUNNING = 'aguarde a rodada em andamento terminar antes de aplicar';
const PREVIEW_FAILED = 'a prévia falhou; tente de novo';
const REPLANNABLE = new Set(['E_STORE_CONFLICT', 'E_PLAN_STALE']);
const OPEN_QUESTIONS = 'responda as perguntas abertas antes de aplicar';
const NO_CHROMIUM = 'Chromium indisponível no servidor; rode "npx playwright install chromium" na máquina do servidor';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const addNew = (have: ViewSpec[], more: ViewSpec[]) => {
  const seen = new Set(have.map((x) => JSON.stringify(x)));
  return [...have, ...more.filter((x) => { const k = JSON.stringify(x); return !seen.has(k) && !!seen.add(k); })];
};

/** The quality report of the rebuilt diagrams (or why there is none), as the text the conversation shows. */
function buildText(base: string, b: PlanApplyResult['build']): string {
  if (!b) return '';
  if (b.error) return b.error;
  if (!b.available) return `Os diagramas salvos não foram regenerados${b.reason ? ` (${b.reason})` : ''}: rode "archlens build ${base}" numa máquina com o Chromium.`;
  const lines = b.results.filter((r) => r.issues.length).flatMap((r) => [`${r.key} (${r.viewport}):`, ...r.issues.map((i) => `  ${i}`)]);
  return b.problems ? `Relatório de qualidade: ${b.problems} problema(s) de qualidade nos diagramas.\n${lines.join('\n')}` : 'Relatório de qualidade: os diagramas salvos foram regenerados sem problemas.';
}

const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
/** The changelog entry of the applied round, as the notes request carries it. */
const roundOf = (entry: Record<string, unknown>): AppliedRound => ({
  summary: typeof entry.summary === 'string' ? entry.summary : '', added: list(entry.added), changed: list(entry.changed), removed: list(entry.removed),
});

const today = () => new Date().toISOString().slice(0, 10);

const readText = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error('não foi possível ler o arquivo'));
  r.readAsText(f);
});

function download(base: string, draft: Draft) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `archlens-draft-${base}-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The Planejar screen: conversation on the left, preview on the right. */
export function PlanView({ base, canBuild = true, onApplied }: { base: string; /** The server can run Chromium (info.plan.build). */ canBuild?: boolean; /** The base was written: reload it in the GUI. */ onApplied?: () => void }) {
  const [saved] = useState(() => load(base));
  const [draft, setDraft] = useState<Draft | null>(saved?.draft ?? null);
  const [chat, setChat] = useState<ChatMsg[]>(saved?.chat ?? []);
  const [stored, setStored] = useState<'ok' | 'chat-trimmed' | 'too-big'>('ok');
  const [previews, setPreviews] = useState<ViewSpec[]>([]);
  const [shown, setShown] = useState<PlanPreviewResult | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [replannable, setReplannable] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const chatRef = useRef(chat);
  const seq = useRef(saved?.chat.reduce((n, m) => Math.max(n, m.id), 0) ?? 0);
  const run = useRef<{ ctl: AbortController; id: number } | null>(null);
  const alive = useRef(true);

  const commit = useCallback((nextDraft: Draft | null, nextChat: ChatMsg[]) => {
    draftRef.current = nextDraft;
    chatRef.current = nextChat;
    setDraft(nextDraft);
    setChat(nextChat);
    setStored(save(base, nextDraft, nextChat.filter((m) => m.status !== 'running')));
  }, [base]);
  const setChatOnly = useCallback((fn: (c: ChatMsg[]) => ChatMsg[]) => {
    chatRef.current = fn(chatRef.current);
    setChat(chatRef.current);
  }, []);
  const patch = useCallback((id: number, p: Partial<ChatMsg>) => setChatOnly((c) => c.map((m) => (m.id === id ? { ...m, ...p } : m))), [setChatOnly]);
  const note = useCallback((m: Omit<ChatMsg, 'id' | 'role'>) => setChatOnly((c) => [...c, { id: ++seq.current, role: 'assistant', ...m }]), [setChatOnly]);

  const cancel = useCallback(() => {
    const cur = run.current;
    if (!cur) return;
    run.current = null;
    cur.ctl.abort();
    patch(cur.id, { status: 'canceled', stage: undefined });
  }, [patch]);

  // Restore: the saved draft is validated and planned again by the server (it never trusts the browser).
  useEffect(() => {
    alive.current = true;
    if (saved?.draft) {
      planOpen(base, saved.draft).then((r) => {
        if (!alive.current || run.current) return;
        commit(r.draft, chatRef.current);
        if (r.warning) { note({ text: '', warning: r.warning }); }
      }).catch((e) => { if (alive.current) note({ text: '', error: `${errMsg(e)}; ${BROKEN}` }); });
    }
    return () => { alive.current = false; run.current?.ctl.abort(); run.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turn = (req: { message?: string; answer?: { key: string; resolution: string }; attach?: RepoAttach; applied?: AppliedRound }, userText: string, opts: { keepDraft?: boolean } = {}) => {
    cancel();
    const history: PlanRequest['history'] = chatRef.current
      .filter((m) => m.status !== 'running' && m.status !== 'canceled' && m.text)
      .map((m) => ({ role: m.role, text: m.text })).slice(-HISTORY_MAX);
    const id = ++seq.current;
    const ctl = new AbortController();
    run.current = { ctl, id };
    commit(draftRef.current, [...chatRef.current, { id: ++seq.current, role: 'user', text: userText }, { id, role: 'assistant', text: '', status: 'running' }]);
    const live = () => !ctl.signal.aborted;
    let finished = false;
    const onEvent = (e: PlanEvent) => {
      if (!live()) return;
      if (e.type === 'stage') patch(id, { stage: e.stage });
      else if (e.type === 'result') {
        finished = true; if (run.current?.id === id) run.current = null;
        const { reply } = e;
        if (e.previews?.length) setPreviews((p) => addNew(p, e.previews));
        const msg: Partial<ChatMsg> = { status: undefined, stage: undefined, warning: reply.warning };
        if (reply.kind === 'text') msg.text = reply.text;
        else if (reply.kind === 'question') msg.text = reply.question;
        else if (reply.kind === 'notes') { msg.text = ''; msg.notes = { overview: reply.overview, notes: reply.notes }; }
        else if (reply.kind === 'decision') { msg.text = reply.item.question; msg.item = reply.item; }
        commit(opts.keepDraft === false ? null : e.draft, chatRef.current.map((m) => (m.id === id ? { ...m, ...msg } : m)));
      } else if (e.type === 'error') {
        finished = true; if (run.current?.id === id) run.current = null;
        commit(opts.keepDraft === false ? null : e.draft, chatRef.current.map((m) => (m.id === id ? { ...m, status: undefined, stage: undefined, error: e.error, warning: e.warning } : m)));
      }
    };
    const fail = (msg: string) => {
      if (run.current?.id === id) run.current = null;
      patch(id, { status: undefined, stage: undefined, error: msg });
    };
    planTurn(base, { ...(draftRef.current ? { draft: draftRef.current } : {}), ...req, history }, onEvent, ctl.signal)
      .then(() => { if (live() && !finished) fail('o planejamento terminou sem resposta'); })
      .catch((e) => { if (live()) fail(errMsg(e)); });
  };

  const onAnswer = (msg: ChatMsg, resolution: string) => {
    if (!msg.item) return;
    patch(msg.id, { answered: resolution });
    turn({ answer: { key: msg.item.key, resolution } }, `Resposta: ${resolution}`);
  };

  const onNotes = (msg: ChatMsg, notes: { overview: string; notes: string } | null) => {
    if (!notes) { patch(msg.id, { notesState: 'skipped', error: undefined }); return; }
    patch(msg.id, { status: 'running', stage: 'gravando as notas', error: undefined });
    planNotes(base, notes).then(
      (r) => {
        patch(msg.id, { status: undefined, stage: undefined, notes, notesState: 'saved' });
        note({ text: `Notas gravadas e ${r.doc} regenerado.` });
        commit(draftRef.current, chatRef.current);
      },
      (e) => patch(msg.id, { status: undefined, stage: undefined, error: errMsg(e) }),
    );
  };

  const roundRunning = chat.some((m) => m.status === 'running');
  const reason = !canBuild ? NO_CHROMIUM : roundRunning ? ROUND_RUNNING : !shown ? (previewFailed ? PREVIEW_FAILED : 'nada planejado para aplicar') : shown.questions.length ? OPEN_QUESTIONS : shown.opsHash ? undefined : 'o plano ainda não está final';
  const savedViews = (shown?.views ?? []).filter((v) => v.kind === 'saved' && !v.error).map((v) => v.title);

  const replan = async () => {
    const current = draftRef.current;
    if (!current) return;
    setApplying(true);
    try {
      const r = await planOpen(base, current);
      setApplyOpen(false);
      commit(r.draft, chatRef.current);
      note({ text: '', warning: r.warning ?? 'o plano foi refeito sobre a base atual; revise e aplique de novo' });
    } catch (e) { setApplyError(errMsg(e)); } finally { setApplying(false); }
  };

  const apply = async () => {
    const current = draftRef.current;
    if (!current || !shown?.opsHash) return;
    setApplying(true);
    setApplyError(null);
    setReplannable(false);
    try {
      const r = await planApply(base, current, shown.opsHash);
      setApplyOpen(false);
      if (!r.entry) { note({ text: 'O plano não muda nada na base; nada foi gravado.' }); return; }
      if (r.doc && typeof r.doc === 'object') note({ text: 'Plano aplicado: base gravada.', error: r.doc.error });
      else note({ text: `Plano aplicado: base gravada e ${r.doc ?? 'ARCHITECTURE.md'} regenerado.` });
      note({ text: buildText(base, r.build) });
      commit(null, chatRef.current); // the draft goes; the conversation stays saved
      setPreviews([]);
      onApplied?.();
      if (r.notesDraftNeeded) turn({ message: NOTES_ASK, applied: roundOf(r.entry) }, NOTES_ASK, { keepDraft: false });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'E_GUI_PLAN_CHANGED' && e.extra.draft) {
        setApplyOpen(false);
        commit(e.extra.draft as Draft, chatRef.current);
        note({ text: '', warning: e.message });
      } else { setApplyError(errMsg(e)); setReplannable(e instanceof ApiError && REPLANNABLE.has(e.code ?? '')); }
    } finally { setApplying(false); }
  };

  const upload = async (file: File) => {
    try {
      const r = await planOpen(base, JSON.parse(await readText(file)) as Draft);
      if (draftRef.current && !window.confirm(REPLACE)) return;
      cancel();
      setPreviews([]);
      commit(r.draft, r.warning ? [{ id: ++seq.current, role: 'assistant', text: '', warning: r.warning }] : []);
    } catch (e) {
      note({ text: '', error: e instanceof SyntaxError ? 'o arquivo não é um rascunho do archlens' : errMsg(e) });
    }
  };

  const discard = () => {
    if (!window.confirm(DISCARD)) return;
    cancel();
    clear(base);
    commit(null, []);
    setPreviews([]);
    setApplyOpen(false);
  };

  // Like /clear: a fresh conversation, so the agent starts without history; the draft and its open questions stay.
  const clearChat = () => {
    const pending = chatRef.current.some((m) => (m.item && m.answered === undefined) || (m.notes && !m.notesState));
    if (pending && !window.confirm(CLEAR_PENDING)) return;
    cancel();
    commit(draftRef.current, []);
  };

  const downloadBtn = <button type="button" aria-label="Baixar rascunho" disabled={!draft} onClick={() => draft && download(base, draft)}>⬇ Baixar</button>;

  return (
    <div className="plan" data-testid="plan-view">
      <Split
        left={(
          <PlanChat
            chat={chat}
            onSend={(t, attach) => turn({ message: t, ...(attach ? { attach } : {}) }, attach ? `${t}\n(anexo: ${attach.url}${attach.ref ? `@${attach.ref}` : ''})` : t)}
            repo={(draft?.repo as { url: string; ref?: string; commit?: string } | null | undefined) ?? null}
            onAnswer={onAnswer}
            onNotes={onNotes}
            onClear={clearChat}
            notice={stored === 'too-big' ? (
              <div className="warn plan-notice" role="alert">
                <span>{TOO_BIG}</span> <button type="button" aria-label="Baixar rascunho" onClick={() => draft && download(base, draft)}>Baixar</button>
              </div>
            ) : stored === 'chat-trimmed' ? <div className="warn plan-notice" role="status">{TRIMMED}</div> : null}
          />
        )}
        right={(
          <div className="plan-preview" data-testid="plan-preview">
            <div className="toolbar">
              {downloadBtn}
              <button type="button" aria-label="Descartar rascunho" disabled={!draft} onClick={discard}>Descartar</button>
              <button type="button" disabled={!!reason || applying} title={reason} onClick={() => { setApplyError(null); setReplannable(false); setApplyOpen(true); }}>Aplicar</button>
              <label className="filebtn">
                ⬆ Subir
                <input type="file" accept="application/json,.json" aria-label="Subir rascunho" onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }} />
              </label>
            </div>
            {applyOpen && shown && <ApplyDialog summary={shown.summary} views={savedViews} busy={applying} error={applyError} onConfirm={() => void apply()} onCancel={() => setApplyOpen(false)} onReplan={replannable ? () => void replan() : undefined} />}
            <PlanPreview base={base} draft={draft} previews={previews} onLoaded={(r, failed) => { setShown(r); setPreviewFailed(!!failed); }} />
          </div>
        )}
      />
    </div>
  );
}
