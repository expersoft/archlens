import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, planApply, planEdit, planNotes, planOpen, planTurn, type AppliedRound, type Draft, type PlanApplyResult, type PlanEvent, type PlanPreviewResult, type PlanRequest, type RepoAttach, type ScreenConflict, type ViewSpec } from '../api';
import { ApplyDialog } from './ApplyDialog';
import { PlanPreview, type PreviewNav } from './PlanPreview';
import { DeltaPanel } from './DeltaPanel';
import { NodePanel } from './NodePanel';
import { ScreenConflictDialog } from './ScreenConflictDialog';
import type { Lock } from './lock';
import { useStoredState } from '../store';
import { PlanChat } from './PlanChat';
import { Split } from './Split';
import { InfoIcon } from '../icons';
import { clear, hasChanges, load, save, type ChatMsg } from './draftStore';

const HISTORY_MAX = 40; // the server's limit
const TOO_BIG = 'o rascunho não cabe no navegador; baixe-o para não perder o trabalho';
const REPLACE = 'Substituir o rascunho atual pelo do arquivo? O atual se perde se não foi baixado.';
const DISCARD_EDIT = 'Descartar a edição não confirmada?';
const DISCARD = 'Descartar o rascunho atual? Ele se perde se não foi baixado.';
const CLEAR_PENDING = 'Há decisão ou notas esperando resposta nesta conversa. Limpar mesmo assim? O rascunho do delta continua.';
const BROKEN = 'o rascunho salvo não abre; descarte-o ("Descartar rascunho") ou suba outro';
const TRIMMED = 'a conversa antiga foi cortada para caber no navegador; o rascunho está inteiro';
const NOTES_ASK = 'rascunhe as notas de interpretação desta rodada';
const ROUND_RUNNING = 'aguarde a rodada em andamento terminar antes de aplicar';
const WRITING = 'aguarde a edição da tela ser gravada';
const PREVIEW_FAILED = 'a prévia falhou; tente de novo';
const REPLANNABLE = new Set(['E_STORE_CONFLICT', 'E_PLAN_STALE']);
const CONFLICT = 'O chat quer mudar algo que você editou; responda o aviso antes de aplicar';
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
export interface PlanViewProps {
  base: string;
  /** The server can run Chromium (info.plan.build). */
  canBuild?: boolean;
  /** The base was written: reload it in the GUI. */
  onApplied?: () => void;
  /** Planejar is on screen: its shortcuts listen only then. */
  active?: boolean;
  /** The preview's notation and flip, for the top bar's ArchiMate | C4. */
  onNav?: (nav: PreviewNav) => void;
  /** Called whenever the lock changes: a chat round ('chat'), a write into the draft ('save') or neither (false). */
  onBusy?: (lock: Lock) => void;
  /**
   * When it changes, the draft and the conversation saved in the browser (by Navegar) are adopted and planned again, as
   * on mount. During a chat round or a write it waits for them to end.
   */
  reload?: number;
  /** When it changes, the node is selected and the panel opens on the Nó tab (through the discard confirmation). */
  focusNode?: { id: string; n: number };
  /**
   * Called whenever the draft starts or stops living only in memory (too big for the browser's storage): then a reload
   * keeps it and does not adopt what is saved, so Navegar should not write a draft meanwhile.
   */
  onUnsaved?: (unsaved: boolean) => void;
}

export function PlanView({ base, canBuild = true, onApplied, active = true, onNav, onBusy, reload, focusNode, onUnsaved }: PlanViewProps) {
  const [saved] = useState(() => load(base));
  const [draft, setDraft] = useState<Draft | null>(saved?.draft ?? null);
  const [chat, setChat] = useState<ChatMsg[]>(saved?.chat ?? []);
  const [stored, setStored] = useState<'ok' | 'chat-trimmed' | 'too-big'>('ok');
  const storedRef = useRef(stored);
  const [previews, setPreviews] = useState<ViewSpec[]>([]);
  const [shown, setShown] = useState<PlanPreviewResult | null>(null);
  const [conflicts, setConflicts] = useState<ScreenConflict[]>([]);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [replannable, setReplannable] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplyingState] = useState(false);
  // Aplicar (and its Replanejar) writes the draft at the end: it counts as busy for the App and for a reload.
  const applyingRef = useRef(false);
  const setApplying = useCallback((a: boolean) => { applyingRef.current = a; setApplyingState(a); }, []);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [panel, setPanel] = useStoredState<boolean>('archlens-plan-delta', true);
  // The panel keeps the last preview while the next one is drawn (`shown` goes null then, which only gates Aplicar).
  const [listed, setListed] = useState<PlanPreviewResult | null>(null);
  const [tab, setTab] = useStoredState<'delta' | 'node'>('archlens-plan-tab', 'delta');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const navigated = useCallback((spec: ViewSpec) => setPreviews((p) => addNew(p, [spec])), []);
  const draftRef = useRef(draft);
  const chatRef = useRef(chat);
  const seq = useRef(saved?.chat.reduce((n, m) => Math.max(n, m.id), 0) ?? 0);
  const run = useRef<{ ctl: AbortController; id: number } | null>(null);
  const alive = useRef(true);
  // Each opening of the saved draft (the mount's, a reload's) takes a number: only the latest one is adopted.
  const opening = useRef(0);
  // A screen edit, an undo, a conflict answer or an opened file is being written into the draft: until it returns,
  // nothing else writes it (a chat round would start from the old draft and drop the edit).
  const [writing, setWritingState] = useState(false);
  const writingRef = useRef(false);
  const setWriting = useCallback((w: boolean) => { writingRef.current = w; setWritingState(w); }, []);

  const commit = useCallback((nextDraft: Draft | null, nextChat: ChatMsg[]) => {
    draftRef.current = nextDraft;
    chatRef.current = nextChat;
    setDraft(nextDraft);
    setChat(nextChat);
    storedRef.current = save(base, nextDraft, nextChat.filter((m) => m.status !== 'running'));
    setStored(storedRef.current);
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
      const n = ++opening.current;
      planOpen(base, saved.draft).then((r) => {
        if (!alive.current || run.current || n !== opening.current) return;
        commit(r.draft, chatRef.current);
        setConflicts(r.screenConflicts ?? []);
        if (r.warning) { note({ text: '', warning: r.warning }); }
      }).catch((e) => { if (alive.current && n === opening.current) note({ text: '', error: `${errMsg(e)}; ${BROKEN}` }); });
    }
    return () => { alive.current = false; run.current?.ctl.abort(); run.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Adopts `s`, the draft and the conversation saved in the browser (by Navegar) when the reload arrived, never the
   * draft in memory: it is planned again by the server as on mount, under the write flag so nothing else writes it
   * meanwhile. The messages only in memory (notes and errors are not saved) stay, after the saved ones. Nothing
   * readable saved (storage blocked), or a draft that lives only in memory (too big to save): the screen keeps what it
   * has (the too-big notice stays on).
   */
  const adopt = useCallback((s: ReturnType<typeof load>) => {
    if (!s || storedRef.current === 'too-big') return;
    const n = ++opening.current;
    const savedIds = new Set(s.chat.map((m) => m.id));
    const nextChat = [...s.chat, ...chatRef.current.filter((m) => !savedIds.has(m.id) && m.status !== 'running')];
    seq.current = nextChat.reduce((m, x) => Math.max(m, x.id), seq.current);
    draftRef.current = s.draft;
    chatRef.current = nextChat;
    setDraft(s.draft);
    setChat(nextChat);
    setConflicts([]);
    if (!s.draft) return;
    setWriting(true);
    planOpen(base, s.draft).then((r) => {
      if (!alive.current || n !== opening.current) return;
      commit(r.draft, chatRef.current);
      setConflicts(r.screenConflicts ?? []);
      if (r.warning) note({ text: '', warning: r.warning });
    }).catch((e) => { if (alive.current && n === opening.current) note({ text: '', error: `${errMsg(e)}; ${BROKEN}` }); })
      .finally(() => { if (alive.current && n === opening.current) setWriting(false); });
  }, [base, commit, note, setWriting]);

  const turn = (req: { message?: string; answer?: { key: string; resolution: string }; attach?: RepoAttach; applied?: AppliedRound }, userText: string, opts: { keepDraft?: boolean } = {}) => {
    if (writingRef.current) return;
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
        setConflicts(e.screenConflicts ?? []);
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
    if (!msg.item || writingRef.current) return;
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
  // The screen controls' lock says why they wait: the chat round, or a screen edit being written.
  const lock: Lock = roundRunning ? 'chat' : writing ? 'save' : false;
  // What the App is told: the lock, or 'save' while Aplicar (or its Replanejar) runs, since it writes the draft too.
  const busy: Lock = lock || (applying ? 'save' : false);
  // A reload that arrives while busy waits for it to end. What was saved is read when it arrives (the round or the
  // apply in flight writes the storage when it ends), and adopted then.
  const reloadSeen = useRef(reload);
  const reloadWaiting = useRef<{ snap: ReturnType<typeof load> } | null>(null);
  useEffect(() => {
    if (reload === reloadSeen.current) return;
    reloadSeen.current = reload;
    const snap = load(base);
    if (writingRef.current || applyingRef.current || chatRef.current.some((m) => m.status === 'running')) reloadWaiting.current = { snap };
    else adopt(snap);
  }, [reload, adopt, base]);
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(() => {
    onBusyRef.current?.(busy);
    const waiting = reloadWaiting.current;
    if (!busy && waiting) { reloadWaiting.current = null; adopt(waiting.snap); }
  }, [busy, adopt]);
  // Unmounted (the base changed), it is busy no more.
  useEffect(() => () => { onBusyRef.current?.(false); }, []);
  const onUnsavedRef = useRef(onUnsaved);
  onUnsavedRef.current = onUnsaved;
  const unsaved = stored === 'too-big';
  useEffect(() => { onUnsavedRef.current?.(unsaved); }, [unsaved]);
  useEffect(() => () => { onUnsavedRef.current?.(false); }, []);
  const reason = !canBuild ? NO_CHROMIUM : roundRunning ? ROUND_RUNNING : writing ? WRITING : conflicts.length ? CONFLICT : !shown ? (previewFailed ? PREVIEW_FAILED : 'nada planejado para aplicar') : shown.questions.length ? OPEN_QUESTIONS : shown.opsHash ? undefined : 'o plano ainda não está final';
  const savedViews = (shown?.views ?? []).filter((v) => v.kind === 'saved' && !v.error).map((v) => v.title);

  const replan = async () => {
    const current = draftRef.current;
    if (!current || writingRef.current) return;
    setApplying(true);
    try {
      const r = await planOpen(base, current);
      setApplyOpen(false);
      commit(r.draft, chatRef.current);
      setConflicts(r.screenConflicts ?? []);
      note({ text: '', warning: r.warning ?? 'o plano foi refeito sobre a base atual; revise e aplique de novo' });
    } catch (e) { setApplyError(errMsg(e)); } finally { setApplying(false); }
  };

  const apply = async () => {
    const current = draftRef.current;
    if (!current || !shown?.opsHash || writingRef.current) return;
    setApplying(true);
    setApplyError(null);
    setReplannable(false);
    try {
      const r = await planApply(base, current, shown.opsHash);
      setApplyOpen(false);
      if (!r.entry) { note({ text: 'O plano não muda nada na base; nada foi gravado.' }); return; }
      if (r.doc && typeof r.doc === 'object') note({ text: 'Plano aplicado: base gravada.', error: r.doc.error });
      else note({ text: `Plano aplicado: base gravada e ${r.doc ?? 'ARCHITECTURE.md'} regenerado.` });
      for (const path of r.preserved) note({ text: `Texto do nó removido guardado em ${path}.` });
      note({ text: buildText(base, r.build) });
      setConflicts([]);
      commit(null, chatRef.current); // the draft goes; the conversation stays saved
      setPreviews([]);
      onApplied?.();
      if (r.notesDraftNeeded) turn({ message: NOTES_ASK, applied: roundOf(r.entry) }, NOTES_ASK, { keepDraft: false });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'E_GUI_PLAN_CHANGED' && e.extra.draft) {
        setApplyOpen(false);
        commit(e.extra.draft as Draft, chatRef.current);
        setConflicts((e.extra.screenConflicts as ScreenConflict[] | undefined) ?? []);
        note({ text: '', warning: e.message });
      } else { setApplyError(errMsg(e)); setReplannable(e instanceof ApiError && REPLANNABLE.has(e.code ?? '')); }
    } finally { setApplying(false); }
  };

  const upload = async (file: File) => {
    if (writingRef.current) return;
    setWriting(true);
    try {
      const r = await planOpen(base, JSON.parse(await readText(file)) as Draft);
      if (draftRef.current && !window.confirm(REPLACE)) return;
      cancel();
      setPreviews([]);
      setConflicts(r.screenConflicts ?? []);
      commit(r.draft, r.warning ? [{ id: ++seq.current, role: 'assistant', text: '', warning: r.warning }] : []);
    } catch (e) {
      note({ text: '', error: e instanceof SyntaxError ? 'o arquivo não é um rascunho do archlens' : errMsg(e) });
    } finally { setWriting(false); }
  };

  const discard = () => {
    if (writingRef.current || !window.confirm(DISCARD)) return;
    cancel();
    clear(base);
    commit(null, []);
    setConflicts([]);
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

  // Ctrl+Alt+B (as in Navegar) or Ctrl+Shift+B shows or hides the delta panel.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyB' || !(e.altKey || e.shiftKey)) return;
      e.preventDefault();
      setPanel((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, setPanel]);

  const changed = hasChanges(draft);
  const editDirty = useRef(false);
  const leaveEdit = () => !editDirty.current || window.confirm(DISCARD_EDIT);
  const pick = (id: string) => { if (!leaveEdit()) return; setSelected(id); setTab('node'); setPanel(true); setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })); };
  // From the App (an edit made in Navegar): the node selected, on the Nó tab, through the same discard confirmation.
  useEffect(() => {
    if (focusNode) pick(focusNode.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNode?.id, focusNode?.n]);
  // The rail button shows its tab; on the tab already shown it hides the panel.
  const railTo = (t: 'delta' | 'node') => {
    if (panel && tab === t) { if (leaveEdit()) setPanel(false); }
    else if (leaveEdit()) { setTab(t); setPanel(true); }
  };

  const [editError, setEditError] = useState<string | undefined>();
  const [epoch, setEpoch] = useState(0);
  /** A screen edit (undo, or the answer to a conflict) goes through the server, which plans again. */
  const screenEdit = async (op: Parameters<typeof planEdit>[2]) => {
    const current = draftRef.current;
    if (!current || writingRef.current || roundRunning) return;
    if (!leaveEdit()) return;
    setWriting(true);
    setEditError(undefined);
    try {
      const r = await planEdit(base, current, op);
      commit(r.draft, chatRef.current);
      setConflicts(r.screenConflicts ?? []);
      editDirty.current = false;
      setEpoch((n) => n + 1); // the node editor, whose text was just discarded, starts closed
    } catch (e) { setEditError(errMsg(e)); } finally { setWriting(false); }
  };
  const firstConflict = conflicts[0];
  const nameOf = (id: string) => listed?.changes.find((c) => c.id === id)?.name ?? id;

  const saveBtn = <button type="button" aria-label="Salvar rascunho" title="Salvar o rascunho num arquivo .json" disabled={!draft} onClick={() => draft && download(base, draft)}>Salvar</button>;

  return (
    <div className="plan" data-testid="plan-view">
      <Split
        left={(
          <PlanChat
            chat={chat}
            onSend={(t, attach) => turn({ message: t, ...(attach ? { attach } : {}) }, attach ? `${t}\n(anexo: ${attach.url}${attach.ref ? `@${attach.ref}` : ''})` : t)}
            repo={(draft?.repo as { url: string; ref?: string; commit?: string } | null | undefined) ?? null}
            onAnswer={onAnswer}
            locked={writing}
            onNotes={onNotes}
            onClear={clearChat}
            notice={stored === 'too-big' ? (
              <div className="warn plan-notice" role="alert">
                <span>{TOO_BIG}</span> <button type="button" aria-label="Salvar rascunho" onClick={() => draft && download(base, draft)}>Salvar</button>
              </div>
            ) : stored === 'chat-trimmed' ? <div className="warn plan-notice" role="status">{TRIMMED}</div> : null}
          />
        )}
        right={(
          <div className="plan-preview" data-testid="plan-preview">
            <div className="toolbar">
              <label className="filebtn" title="Abrir um rascunho salvo (.json)">
                Abrir
                <input type="file" accept="application/json,.json" aria-label="Abrir rascunho" disabled={writing} onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }} />
              </label>
              {saveBtn}
              <button type="button" aria-label="Descartar rascunho" disabled={!draft || writing} title={writing ? WRITING : undefined} onClick={discard}>Descartar</button>
              <button type="button" disabled={!!reason || applying} title={reason} onClick={() => { setApplyError(null); setReplannable(false); setApplyOpen(true); }}>Aplicar</button>
            </div>
            {firstConflict && (
              <ScreenConflictDialog key={`${firstConflict.id}:${firstConflict.field}`} conflict={firstConflict} nodeName={nameOf(firstConflict.id)} locked={lock}
                onChoose={(choice) => void screenEdit({ op: 'resolve', id: firstConflict.id, field: firstConflict.field, choice })} />
            )}
            {editError && <p className="err" role="alert">{editError}</p>}
            {applyOpen && shown && <ApplyDialog summary={shown.summary} views={savedViews} busy={applying || writing} error={applyError} onConfirm={() => void apply()} onCancel={() => setApplyOpen(false)} onReplan={replannable ? () => void replan() : undefined} />}
            <PlanPreview base={base} draft={draft} previews={previews} onLoaded={(r, failed) => { setShown(r); if (r) { setListed(r); setConflicts(r.screenConflicts ?? []); } setPreviewFailed(!!failed); }}
              onNavigate={navigated} onNav={onNav} onSelect={(id) => { if (!leaveEdit()) return; setSelected(id); if (id) { setTab('node'); setPanel(true); } }} focus={focus} />
          </div>
        )}
      />
      {panel && (
        <aside className="side r" data-testid="delta-panel" aria-label="Painel do nó e do delta">
          <div role="tablist" className="side-tabs">
            <button type="button" role="tab" aria-selected={tab === 'delta'} className={tab === 'delta' ? 'on' : ''} onClick={() => { if (leaveEdit()) setTab('delta'); }}>Delta ({changed ? listed?.changes.length ?? 0 : 0})</button>
            <button type="button" role="tab" aria-selected={tab === 'node'} className={tab === 'node' ? 'on' : ''} onClick={() => { if (leaveEdit()) setTab('node'); }}><InfoIcon size={14} /> Nó</button>
          </div>
          {tab === 'delta' ? (
            <DeltaPanel result={changed ? listed : null} selected={selected} onPick={pick} onUndo={(id) => void screenEdit({ op: 'undo', id })} locked={lock} />
          ) : (
            <NodePanel key={epoch} locked={lock} onWriting={setWriting} base={base} draft={draft} id={selected} onPick={pick} onDraft={(d, _h, c) => { commit(d, chatRef.current); setConflicts(c ?? []); }} onDirty={(d) => { editDirty.current = d; }} />
          )}
        </aside>
      )}
      <nav className="rail r" aria-label="Painel direito">
        <button type="button" aria-label="Delta" title="Delta (Ctrl+Alt+B ou Ctrl+Shift+B)" className={panel && tab === 'delta' ? 'on' : ''} onClick={() => railTo('delta')}>Δ</button>
        <button type="button" aria-label="Nó" title="Nó (detalhes do item selecionado)" className={panel && tab === 'node' ? 'on' : ''} onClick={() => railTo('node')}><InfoIcon /></button>
      </nav>
    </div>
  );
}
