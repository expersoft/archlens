import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ask as askApi, find, flip, getActions, getBases, getCatalog, getElement, getInfo, getView, type Action, type AskEvent, type Info, type BaseInfo, type Card, type Catalog, type Draft, type FindHit, type PropValue, type ScreenEdit, type ViewData, type ViewResult, type ViewSpec } from './api';
import { pickInitialView } from './pick';
import { Diagram } from './Diagram';
import type { AlertAction } from './AlertBadge';
import { alertActions } from './alertActions';
import { Shell } from './Shell';
import { ContextMenu } from './ContextMenu';
import { History } from './History';
import { Conversation } from './Conversation';
import { looksLikeQuestion, type Turn } from './question';
import { Explorer } from './Explorer';
import { Details } from './Details';
import { initialHistory, reducer, type Step } from './history';
import { useDiagramTheme, useTheme } from './theme';
import { send, type BridgeEvent } from './bridge';
import { typeHint } from './labels';
import { PlanView } from './plan/PlanView';
import type { PreviewNav } from './plan/PlanPreview';
import { LOCKED_SAVE, LOCKED_VIEW as LOADING_VIEW, lockText, type Lock } from './plan/lock';
import { PropsEditor } from './plan/PropsEditor';
import { DocEditor } from './plan/DocEditor';
import { DocTab } from './DocTab';
import { confirmBrowseEdit, UNSAVED, useBrowseNode } from './browseEdit';
import { TRIMMED } from './plan/draftStore';
import { allLabel, oneLabel, toggleAll, toggleOne } from './nesting';
import { useDelayed } from './useDelayed';

const totalMs = (v: ViewResult) => v.ms.resolve + v.ms.layout + v.ms.render;
/** `items` null: as ações ainda estão chegando (o menu já abre com "Carregando…"). */
type Menu = { id: string; at: { x: number; y: number }; title: string; items: Action[] | null };
const DISCARD_EDIT = 'Descartar a edição não confirmada?';
/** The properties the screen layer of the draft already sets on the node: a new edit keeps them. */
const screenProps = (d: Draft | null, id: string) =>
  ((d?.edits as Record<string, { properties?: Record<string, PropValue | null> }> | undefined)?.[id]?.properties) ?? {};

export function App() {
  const [theme, setTheme] = useTheme();
  const [diagramTheme, setDiagramTheme] = useDiagramTheme();
  const [hist, dispatch] = useReducer(reducer, initialHistory);
  const [bases, setBases] = useState<BaseInfo[]>([]);
  const [base, setBase] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [docsEnabled, setDocsEnabled] = useState(false);
  const [hits, setHits] = useState<FindHit[]>([]);
  const [chatRequest, setChatRequest] = useState(0);
  const [rightRequest, setRightRequest] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [status, setStatus] = useState('Carregando…');
  const [presenting, setPresenting] = useState(false);
  const [mode, setMode] = useState<'browse' | 'plan'>('browse');
  const [planOpened, setPlanOpened] = useState(false); // PlanView stays mounted once opened, so a round in flight finishes
  const [planNav, setPlanNav] = useState<PreviewNav | null>(null);
  // What PlanView tells the App (busy: a round or a write in flight) and what the App asks of it (re-read the saved
  // draft, focus a node): the bridge an edit made in Navegar goes through.
  const [planLock, setPlanLock] = useState<Lock>(false);
  const [planReload, setPlanReload] = useState(0);
  // the node to focus carries its base: the PlanView of another base (mounted anew) never takes it
  const [planFocus, setPlanFocus] = useState<{ base: string; id: string; n: number } | undefined>(undefined);
  // the draft lives only in memory (too big to save): a reload would not adopt what Navegar saves
  const [planUnsaved, setPlanUnsaved] = useState(false);
  // a focus is for the base it was asked on: another base (or coming back, A→B→A) never re-selects it
  useEffect(() => { setPlanFocus(undefined); }, [base]);
  // Read again at the moment Navegar writes (compare-and-swap): the state of the last render could be stale.
  const planLockRef = useRef<Lock>(false);
  const planUnsavedRef = useRef(false);
  const onPlanBusy = useCallback((l: Lock) => { planLockRef.current = l; setPlanLock(l); }, []);
  const onPlanUnsaved = useCallback((u: boolean) => { planUnsavedRef.current = u; setPlanUnsaved(u); }, []);
  // Editing the node in Navegar: the editor open (for one node of one base), Navegar's write in flight, its error.
  // The editor keeps what it started from (props, raw doc): a later re-read, failed or not, never swaps or closes it.
  const [browseEdit, setBrowseEdit] = useState<{ base: string; id: string; kind: 'properties' | 'doc'; props: Record<string, PropValue>; docRaw: string } | null>(null);
  // The base Navegar's write in flight goes to (null: none).
  const [browseWriting, setBrowseWritingState] = useState<string | null>(null);
  const browseWritingRef = useRef<string | null>(null);
  const setBrowseWriting = (w: string | null) => { browseWritingRef.current = w; setBrowseWritingState(w); };
  const [browseError, setBrowseError] = useState<{ base: string; id: string; text: string } | null>(null);
  // What became of a write whose base was left meanwhile, shown on the base now on screen.
  const [browseNotice, setBrowseNotice] = useState<{ base: string; text: string; warn: boolean } | null>(null);
  const browseDirty = useRef(false);
  const closeBrowseEdit = () => { setBrowseEdit(null); setBrowseError(null); browseDirty.current = false; };
  // Navegar is writing a confirmed edit into the draft of the base on screen.
  const writingHere = () => !!browseWritingRef.current && browseWritingRef.current === stateRef.current.base;
  /**
   * Before leaving the node or the mode, hiding the right panel or presenting: a dirty editor asks first. While a
   * confirmed edit of the base on screen is being written nothing leaves it: a failure must show its error on the
   * editor that still holds the typed text.
   */
  const leaveBrowseEdit = () => {
    if (writingHere()) { setNotice(LOCKED_SAVE); return false; }
    if (browseDirty.current && !window.confirm(DISCARD_EDIT)) return false;
    closeBrowseEdit();
    return true;
  };
  // Re-reads the node in Navegar on every return from Planejar (Descartar, Limpar, Abrir change the saved draft).
  const [browseRev, setBrowseRev] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const ticket = useRef(0);
  const baseGen = useRef(0);
  const menuTicket = useRef(0);
  const askRun = useRef<{ ctl: AbortController; id: number } | null>(null);
  const turnSeq = useRef(0);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const step: Step | undefined = hist.steps[hist.cur];
  const view = step?.view ?? null;

  const loading = hist.pending != null;
  const stateRef = useRef({ base, catalog, selected, step, loading });
  stateRef.current = { base, catalog, selected, step, loading };
  const matrixSent = useRef<Step | null>(null);

  useEffect(() => {
    const on = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const [notice, setNotice] = useState<string | null>(null);

  /** Aborta a pergunta em andamento (o servidor para o agente) e marca o turno como cancelado. */
  const cancelAsk = useCallback(() => {
    const cur = askRun.current;
    if (!cur) return;
    askRun.current = null;
    cur.ctl.abort();
    setTurns((ts) => ts.map((x) => (x.id === cur.id && x.status === 'running' ? { ...x, status: 'canceled', stage: undefined } : x)));
  }, []);

  /** Reserva o ticket de forma síncrona, antes de qualquer espera; `label` é o que o status mostra enquanto carrega. */
  const reserve = useCallback((label?: string) => {
    cancelAsk(); // qualquer navegação nova vence a pergunta em andamento
    const t = ++ticket.current;
    dispatch({ type: 'request', ticket: t, label });
    setNotice(null);
    return t;
  }, [cancelAsk]);
  const fail = (t: number, e: unknown) =>
    dispatch({ type: 'failed', ticket: t, error: e instanceof Error ? e.message : String(e) });

  const run = useCallback(async (t: number, b: string, spec: ViewSpec, kind: Step['kind'], label: string, matrix?: boolean) => {
    try {
      const r = await getView(b, spec);
      dispatch({ type: 'loaded', ticket: t, step: { kind, label, view: r, ms: totalMs(r), matrix } });
    } catch (e) {
      dispatch({ type: 'failed', ticket: t, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  // uma vez por carga do iframe: ao trocar o passo mostrado, o próximo `ready` reenvia a matriz
  useEffect(() => { matrixSent.current = null; }, [step]);

  const loadBase = useCallback(async (id: string, isDead: () => boolean = () => false) => {
    try {
      const cat = await getCatalog(id);
      if (isDead()) return;
      setBase(id);
      setCatalog(cat);
      const v = pickInitialView(cat.views);
      if (!v) { setStatus(`${cat.name}: sem visões`); return; }
      void run(reserve(v.title), id, v.spec, 'Visão', v.title);
    } catch (e) {
      if (!isDead()) setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [run, reserve]);

  useEffect(() => {
    let dead = false;
    getInfo().then((i) => { if (!dead) setInfo(i); }).catch(() => { /* sem /api/info: busca em texto desligada */ });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    let dead = false;
    const gen = ++baseGen.current;
    const stale = () => dead || gen !== baseGen.current;
    (async () => {
      try {
        const all = await getBases();
        if (stale()) return;
        setBases(all);
        const bs = all.find((x) => x.ok);
        if (!bs) { setStatus('Nenhuma base disponível'); return; }
        await loadBase(bs.id, stale);
      } catch (e) {
        if (!stale()) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { dead = true; };
  }, [loadBase]);

  const onBase = (id: string) => {
    if (id === stateRef.current.base) return;
    // a confirmed edit being written goes on: it lands in its base's draft and the new base says what became of it
    if (!writingHere() && !leaveBrowseEdit()) return;
    setBrowseNotice(null);
    menuTicket.current++;
    setMenu(null);
    cancelAsk();
    setTurns([]);
    ticket.current++; // invalida qualquer pedido em voo da base anterior
    dispatch({ type: 'reset' });
    setSelected(null);
    setCard(null);
    setDocsEnabled(false);
    setHits([]);
    setNotice(null);
    setCatalog(null);
    setBase(id);
    setStatus('Carregando…');
    const gen = ++baseGen.current;
    void loadBase(id, () => gen !== baseGen.current);
  };

  // cartão da base para o elemento selecionado
  useEffect(() => {
    if (!base || !selected) { setCard(null); return; }
    let dead = false;
    setCard(null);
    getElement(base, selected).then((d) => { if (!dead) { setCard(d.card); setDocsEnabled(!!d.docs); } }).catch(() => { /* sem cartão: a seleção continua */ });
    return () => { dead = true; };
  }, [base, selected]);

  // foco indo para o iframe (clique, rolagem) fecha o menu
  useEffect(() => {
    const on = () => { menuTicket.current++; setMenu(null); };
    window.addEventListener('blur', on);
    return () => window.removeEventListener('blur', on);
  }, []);

  const nameOf = (id: string) => stateRef.current.catalog?.elements.find((e) => e.id === id)?.name ?? id;

  const openAction = (a: Action, id: string, kind: Step['kind']) => {
    const b = stateRef.current.base;
    if (!b || !a.spec) return;
    const label = `${a.label}: ${nameOf(id)}`;
    void run(reserve(label), b, a.spec, kind, label, a.matrix);
  };

  const inView = (id: string) => !!(stateRef.current.step?.view.data as ViewData | null)?.nodes?.[id];
  const selectInView = (id: string) => { if (!leaveBrowseEdit()) return; setSelected(id); send(frame.current, { type: 'select', id }); };
  const expandTicket = useRef(0);
  const nullEcho = useRef(false); // a select(null) sent to the page, whose answer is still to come

  /** Escolha no Explorador/busca: seleciona se está na visão; senão abre a primeira ação de contexto. */
  const pickElement = (id: string) => {
    const b = stateRef.current.base;
    if (!b) return;
    if (id !== stateRef.current.selected && !leaveBrowseEdit()) return;
    setHits([]);
    setSelected(id);
    if (inView(id)) { send(frame.current, { type: 'select', id, focus: true }); return; }
    const t = reserve(nameOf(id));
    const shown = stateRef.current.step?.view.spec;
    getActions(b, id, shown).then((d) => {
      if (t !== ticket.current) return;
      const withSpec = d.actions.filter((a) => a.spec);
      // Só numa visão com notation 'archimate' o Explorador fica em ArchiMate; nas demais segue o Contexto de hoje.
      const keep = (shown as { notation?: string } | undefined)?.notation === 'archimate'
        ? withSpec.find((x) => x.label === 'Ver em ArchiMate (camadas)') ?? withSpec.find((x) => (x.spec as { notation?: string }).notation === 'archimate' && !x.matrix)
        : undefined;
      const a = keep ?? withSpec.find((x) => /^(Contexto|Containers do sistema|Componentes do container)/.test(x.label)) ?? withSpec[0];
      if (!a) { dispatch({ type: 'failed', ticket: t, error: `sem visão para ${nameOf(id)}` }); return; }
      return run(t, b, a.spec!, 'Explorador', `${nameOf(id)}: ${a.label}`, a.matrix);
    }).catch((err) => { if (t === ticket.current) fail(t, err); });
  };

  /** Pergunta ao agente; `chosen` é a opção escolhida num esclarecimento. */
  const askQuestion = (question: string, chosen?: string) => {
    const { base: b, step: cur, selected: sel } = stateRef.current;
    if (!b) return;
    const keep = info?.ask.enabled ? info.ask.maxHistory ?? 4 : 4;
    const history = (keep > 0 ? turnsRef.current.filter((x) => x.status === 'done').slice(-keep) : []).map((x) => ({ question: x.question, title: x.view?.title }));
    const nodes = Object.keys((cur?.view.data as ViewData | null)?.nodes ?? {});
    const context = cur ? { spec: cur.view.spec, ...(nodes.length ? { nodes } : {}), ...(sel ? { selected: sel } : {}) } : undefined;
    const t = reserve(question); // cancela a anterior e reserva o ticket
    const id = ++turnSeq.current;
    const ctl = new AbortController();
    const startedAt = Date.now();
    askRun.current = { ctl, id };
    setTurns((ts) => [...ts, { id, question, status: 'running' }]);
    const patch = (p: Partial<Turn>) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const release = () => { if (askRun.current?.id === id) askRun.current = null; };
    let finished = false;
    const onAskEvent = (e: AskEvent) => {
      if (ctl.signal.aborted) return;
      if (e.type === 'stage') patch({ stage: e.stage });
      else if (e.type === 'done') patch({ call: { startedAt, endedAt: Date.now(), usage: e.metrics.usage } });
      else if (e.type === 'error') {
        finished = true; release();
        patch({ status: 'error', stage: undefined, error: e.error });
        dispatch({ type: 'failed', ticket: t, error: e.error });
      } else if (e.type === 'result') {
        finished = true; release();
        const { result } = e;
        patch({ status: 'done', stage: undefined, result, answer: e.answer, markdown: e.markdown, warning: result.warning, view: e.view });
        if (result.kind === 'view' && e.view) {
          dispatch({ type: 'loaded', ticket: t, step: { kind: 'Pergunta', label: question, view: e.view, ms: totalMs(e.view) } });
          if (t === ticket.current && result.warning) setNotice(result.warning);
          return;
        }
        dispatch({ type: 'settle', ticket: t });
        if (result.warning && t === ticket.current) setNotice(result.warning);
        if (result.kind === 'element') { pickElement(result.id); setRightRequest((n) => n + 1); }
      }
    };
    askApi(b, { question, ...(context ? { context } : {}), ...(chosen ? { chosen } : {}), history }, onAskEvent, ctl.signal)
      .then(() => {
        if (finished || ctl.signal.aborted) return;
        release();
        const msg = 'a busca terminou sem resposta';
        patch({ status: 'error', stage: undefined, error: msg });
        dispatch({ type: 'failed', ticket: t, error: msg });
      })
      .catch((err) => {
        release();
        if (ctl.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        patch({ status: 'error', stage: undefined, error: msg });
        dispatch({ type: 'failed', ticket: t, error: msg });
      });
    setChatRequest((n) => n + 1);
  };

  const openTurn = (turn: Turn) => {
    const v = turn.view;
    if (!v) return;
    const t = reserve(turn.question);
    dispatch({ type: 'loaded', ticket: t, step: { kind: 'Pergunta', label: turn.question, view: v, ms: totalMs(v) } });
  };

  const goStep = (index: number) => { cancelAsk(); dispatch({ type: 'go', index }); };
  /** Desiste da espera: invalida o ticket (a resposta tardia não entra) e fica a visão atual. */
  const cancelLoad = () => {
    const t = hist.pending;
    if (t == null) return;
    ticket.current++;
    cancelAsk();
    dispatch({ type: 'cancel', ticket: t });
  };

  const onSearch = (q: string) => {
    const b = stateRef.current.base;
    if (!b) return;
    setNotice(null);
    const asking = info?.ask.enabled === true;
    if (asking && looksLikeQuestion(q)) { askQuestion(q); return; }
    find(b, q).then((r) => {
      if (b !== stateRef.current.base) return;
      if (r.length === 0 && asking) { askQuestion(q); return; }
      if (r.length === 0) { setHits([]); setNotice(`nada encontrado para "${q}"`); }
      else if (r.length === 1) pickElement(r[0].id);
      else { setNotice(null); setHits(r); setChatRequest((n) => n + 1); }
    }).catch((err) => setNotice(err instanceof Error ? err.message : String(err)));
  };

  const onEvent = (e: BridgeEvent) => {
    const { base: b, step: cur } = stateRef.current;
    if (e.type === 'theme') setDiagramTheme(e.theme); // T dentro do diagrama: só o diagrama muda
    else if (stateRef.current.loading && (e.type === 'context' || e.type === 'expand')) return; // a visão está carregando
    else if (e.type === 'select') {
      menuTicket.current++;
      setMenu(null);
      const prev = stateRef.current.selected;
      if (e.id === prev) return;
      // the page answers a select it does not draw with select(null): that answer is not the user deselecting
      if (e.id === null && nullEcho.current) { nullEcho.current = false; return; }
      nullEcho.current = false;
      const drawn = prev !== null && inView(prev);
      // Puts the previous selection back on the page; a node the view does not draw only clears the highlight.
      const restore = () => { nullEcho.current = !drawn; send(frame.current, { type: 'select', id: drawn ? prev : null }); };
      // durante a espera o clique no diagrama não muda nada: a seleção anterior volta a ser destacada
      if (stateRef.current.loading) { if (e.id !== null || drawn) restore(); return; }
      // the diagram already highlighted the other node: kept on the edited one, it goes back
      if (!leaveBrowseEdit()) { if (e.id !== null || drawn) restore(); return; }
      setSelected(e.id);
    } else if (e.type === 'ready') {
      const sel = stateRef.current.selected;
      if (sel && (cur?.view.data as ViewData | null)?.nodes?.[sel]) send(frame.current, { type: 'select', id: sel });
      if (cur?.matrix && matrixSent.current !== cur) {
        matrixSent.current = cur;
        send(frame.current, { type: 'act', act: 'matrix' });
      }
    } else if (e.type === 'context' && b) {
      const mt = ++menuTicket.current;
      setNotice(null);
      const rect = frame.current?.getBoundingClientRect();
      const at = { x: (rect?.left ?? 0) + e.x, y: (rect?.top ?? 0) + e.y };
      setMenu({ id: e.id, at, title: nameOf(e.id), items: null });
      getActions(b, e.id, stateRef.current.step?.view.spec).then((d) => {
        if (mt === menuTicket.current) setMenu({ id: e.id, at, title: nameOf(e.id), items: d.actions });
      }).catch((err) => {
        if (mt !== menuTicket.current) return;
        setMenu(null);
        setNotice(err instanceof Error ? err.message : String(err));
      });
    } else if (e.type === 'expand' && b) {
      menuTicket.current++;
      setMenu(null);
      // Só reserva ticket se houver ação primária: numa folha o duplo clique não derruba a carga em andamento.
      const xt = ++expandTicket.current;
      const live = () => xt === expandTicket.current && b === stateRef.current.base;
      const t0 = ticket.current;
      getActions(b, e.id, stateRef.current.step?.view.spec).then((d) => {
        if (!live() || ticket.current !== t0) return; // superado por outro duplo clique ou por outra navegação
        const p = d.actions.find((a) => a.primary && a.spec);
        if (!p) return;
        const label = `${p.label}: ${nameOf(e.id)}`;
        void run(reserve(label), b, p.spec!, 'Clique duplo', label, p.matrix);
      }).catch((err) => { if (live() && ticket.current === t0) setNotice(err instanceof Error ? err.message : String(err)); });
    }
  };

  const notation = (view?.spec as { notation?: string } | undefined)?.notation === 'c4' ? 'c4' : 'archimate';
  const onNotation = (n: 'archimate' | 'c4') => {
    if (!base || !view || n === notation) return;
    const label = n === 'c4' ? 'Ver em C4' : 'Ver em ArchiMate';
    const t = reserve(label);
    flip(base, view.spec)
      .then((r) => { if (t === ticket.current) return run(t, base, r.spec, 'Notação', label); })
      .catch((err) => { if (t === ticket.current) fail(t, err); });
  };

  const nest = view?.nest ?? null;
  const onNestAll = () => {
    if (!base || !view || !nest) return;
    void run(reserve(allLabel(nest)), base, toggleAll(view.spec, nest), 'Visão', allLabel(nest));
  };
  const onNestOne = (id: string) => {
    if (!base || !view || !nest) return;
    const label = `${oneLabel(nest, id)}: ${nameOf(id)}`;
    void run(reserve(label), base, toggleOne(view.spec, nest, id), 'Visão', label);
  };

  const viewData = (view?.data ?? null) as ViewData | null;
  const layersHere = [...new Set(Object.values(viewData?.nodes ?? {}).map((n) => n.layer).filter((l): l is string => !!l))];
  const alertActs: AlertAction[] = base && view ? alertActions({
    spec: view.spec, nest, selected, selectedName: selected ? nameOf(selected) : '', layers: layersHere, notation,
    nestAll: onNestAll, runSpec: (sp, label) => void run(reserve(label), base, sp, 'Visão', label),
  }) : [];
  const planEnabled = info?.plan?.enabled === true;
  const brandName = info?.brand?.name;
  useEffect(() => { document.title = brandName ? `${brandName} · archlens` : 'archlens'; }, [brandName]);
  const planning = planEnabled && mode === 'plan';

  // Editing the node in Navegar (Planejar on): the node as the saved draft leaves it, read again when Planejar gets
  // free, re-reads the draft or the GUI comes back from Planejar; the edit goes into the draft and the GUI moves to
  // Planejar.
  const bn = useBrowseNode(base, selected, planEnabled && !planning, `${String(planLock)}|${planReload}|${planUnsaved}|${browseRev}`);
  const saveBrowse = async (edit: (d: Draft | null) => ScreenEdit) => {
    const b = base, id = selected;
    if (!b || !id || browseWritingRef.current) return;
    setBrowseWriting(b);
    setBrowseError(null);
    setBrowseNotice(null);
    // Planejar's lock is the one of the base on screen: once the base changed, the original's PlanView is gone (its
    // draft has no other writer) and the edit still goes into that base's draft.
    const r = await confirmBrowseEdit(b, edit, {
      blocked: () => (stateRef.current.base !== b ? null
        : planLockRef.current ? lockText(planLockRef.current) : planUnsavedRef.current ? UNSAVED : null),
    });
    setBrowseWriting(null);
    setNotice((n) => (n === LOCKED_SAVE ? null : n)); // the hint of a blocked click goes with the write
    const now = stateRef.current.base;
    if (now !== b) {
      setBrowseEdit((e) => (e?.base === b ? null : e));
      if (browseEdit?.base === b) browseDirty.current = false;
      const name = bases.find((x) => x.id === b)?.name ?? b;
      const trimmed = r.ok && !!r.trimmed;
      if (now) setBrowseNotice({ base: now, warn: !r.ok || trimmed, text: r.ok ? `A edição foi guardada no rascunho de ${name}${trimmed ? `; ${TRIMMED}` : ''}` : `A edição em ${name} não foi guardada: ${r.error}` });
      return;
    }
    if (!r.ok) { setBrowseError({ base: b, id, text: r.error }); return; }
    if (r.trimmed) setBrowseNotice({ base: b, warn: true, text: `A edição foi guardada; ${TRIMMED}` });
    closeBrowseEdit();
    menuTicket.current++;
    setMenu(null);
    cancelAsk();
    setPlanOpened(true);
    setPlanReload((n) => n + 1);
    setPlanFocus((f) => ({ base: b, id, n: (f?.n ?? 0) + 1 }));
    setMode('plan');
  };
  const browseEditable = planEnabled && !planning && !!base && !!selected;
  const mine = browseEditable && browseEdit?.base === base && browseEdit.id === selected ? browseEdit.kind : null;
  const removed = !!bn.el?.removed;
  const shownCard = bn.el ? bn.el.card : card;
  const shownDocs = bn.node ? bn.node.docs : docsEnabled;
  const editLock = browseWriting ? LOCKED_SAVE : loading ? LOADING_VIEW : planLock ? lockText(planLock) : planUnsaved ? UNSAVED : null;
  // An editor never outlives its dirty flag (closed, or hidden by another node, base or mode).
  useEffect(() => { if (!mine) browseDirty.current = false; }, [mine]);
  const browseErrText = mine && browseError?.base === base && browseError.id === selected ? browseError.text : null;
  const browseErr = browseErrText ? <p className="warn np-edit-err" role="alert">{browseErrText}</p> : null;
  function openBrowse(kind: 'properties' | 'doc') {
    if (!base || !selected) return;
    setBrowseError(null);
    setBrowseEdit({ base, id: selected, kind, props: browseProps, docRaw: bn.node?.docRaw ?? '' });
  }
  const browseProps = (shownCard?.properties ?? {}) as Record<string, PropValue>;
  const editProps = mine === 'properties' ? browseEdit!.props : browseProps;
  const nodeName = shownCard?.element.name ?? selected ?? '';
  const docWin = {
    title: `Documentação · ${nodeName}`,
    layer: shownCard?.element.layer,
    labels: [shownCard?.element.c4Label, shownCard?.element.typeLabel ? `ArchiMate ${shownCard.element.typeLabel}` : undefined].filter((x): x is string => !!x),
  };
  // Doc editing starts from the raw text (wikilinks kept) the server answered; props from the card shown.
  const canProps = !removed && !bn.loading && !!shownCard;
  const canDoc = !removed && !bn.loading && !!bn.node;
  const editBtn = (kind: 'properties' | 'doc', label: string, ok: boolean) => (ok && !mine
    ? <button type="button" className="linkish" aria-label={`Editar ${label}`} disabled={!!editLock} title={editLock ?? undefined} onClick={() => openBrowse(kind)}>✎ Editar</button>
    : undefined);
  const setBrowseDirty = useCallback((d: boolean) => { browseDirty.current = d; }, []);
  const browseSlots = !browseEditable ? undefined : {
    properties: mine === 'properties' ? (
      <>
        {browseErr}
        <PropsEditor base={editProps} value={editProps} busy={!!editLock} onDirty={setBrowseDirty} onCancel={closeBrowseEdit}
          onConfirm={(changes) => void saveBrowse((d) => ({ op: 'properties', id: selected!, properties: { ...screenProps(d, selected!), ...changes } }))} />
      </>
    ) : Object.keys(browseProps).length ? (
      <dl>{Object.entries(browseProps).map(([k, v]) => (
        <Fragment key={k}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></Fragment>
      ))}</dl>
    ) : shownCard ? <p className="muted">Este nó não tem propriedades.</p> : undefined,
    doc: mine === 'doc' ? (
      <DocEditor {...docWin} text={browseEdit!.docRaw} busy={!!editLock} error={browseErrText} onDirty={setBrowseDirty} onCancel={closeBrowseEdit}
        onConfirm={(text) => void saveBrowse(() => ({ op: 'doc', id: selected!, text }))} />
    ) : !bn.node ? undefined : bn.node.doc || removed
      ? <DocTab {...docWin} base={base!} id={selected!} text={bn.node.doc} max />
      : (
        <>
          <p className="muted">Este nó ainda não tem documentação.</p>
          <button type="button" className="linkish" disabled={!!editLock} title={editLock ?? undefined} onClick={() => openBrowse('doc')}>Escrever</button>
        </>
      ),
  };
  const browseActions = !browseEditable ? undefined : {
    properties: editBtn('properties', 'propriedades', canProps),
    doc: editBtn('doc', 'documentação', canDoc),
  };
  const onMode = (m: 'browse' | 'plan') => {
    menuTicket.current++;
    setMenu(null);
    if (m === 'plan' && !leaveBrowseEdit()) return;
    cancelAsk();
    if (m === 'plan') setPlanOpened(true);
    else setBrowseRev((n) => n + 1);
    setMode(m);
  };
  const closeMenu = useCallback(() => setMenu(null), []);
  const trail = useMemo(() => hist.steps.slice(0, hist.cur + 1), [hist.steps, hist.cur]);
  // o aviso da espera (barra, status com Cancelar) só aparece depois de ~300 ms; o bloqueio vale desde o início
  const lateLoading = useDelayed(loading);
  // no Planejar, a espera é a da prévia (o pedido em andamento que ela informa)
  const planWait = planning ? planNav?.loading ?? null : null;
  const latePlan = useDelayed(!!planWait);
  const progress = planning ? (latePlan && planWait ? { label: planWait.label, onCancel: planWait.cancel } : null)
    : lateLoading ? { label: hist.pendingLabel ?? 'visão', onCancel: cancelLoad } : null;
  const shownStatus = hist.error ?? notice ?? (view && catalog ? `${catalog.name} · ${view.title}` : status);

  return (
    <Shell
      theme={theme}
      brand={info?.brand}
      onThemeChange={setTheme}
      presenting={presenting}
      status={shownStatus}
      progress={progress}
      notation={planning ? planNav?.notation ?? undefined : notation}
      onNotation={planning ? (planNav?.notation && !planWait ? planNav.flip : undefined) : base && view && !loading ? onNotation : undefined}
      notationHint={(planning ? planWait : loading) ? LOADING_VIEW : undefined}
      bases={bases}
      base={base}
      onBase={onBase}
      mode={planning ? 'plan' : 'browse'}
      planEnabled={planEnabled}
      onMode={onMode}
      canHideRight={leaveBrowseEdit}
      onSearch={base && !planning ? onSearch : undefined}
      chatRequest={chatRequest}
      rightRequest={rightRequest}
      leftContent={{
        chat: (
          <>
            <div className="ph">Conversa e histórico</div>
            {hits.length > 0 && (
              <ul className="hits" aria-label="Resultados da busca">
                {hits.map((h) => (
                  <li key={h.id}><button type="button" onClick={() => pickElement(h.id)}>{h.name}<span className="t">{typeHint(h)}</span></button></li>
                ))}
              </ul>
            )}
            <History steps={hist.steps} cur={hist.cur} onGo={goStep} />
            <Conversation
              turns={turns}
              enabled={info?.ask.enabled === true}
              model={info?.ask.enabled ? info.ask.model : undefined}
              offReason={info?.ask.enabled === false ? info.ask.reason : undefined}
              onAsk={(q) => askQuestion(q)}
              onChoose={(turn, id) => askQuestion(turn.question, id)}
              onOpen={openTurn}
            />
          </>
        ),
        tree: catalog && (
          <Explorer
            catalog={catalog}
            selected={selected}
            onOpenView={(spec, title) => { if (base) void run(reserve(title), base, spec, 'Explorador', title); }}
            onPick={pickElement}
          />
        ),
      }}
      rightContent={(
        <>
          <div className="ph">Detalhes</div>
          {browseNotice?.base === base && <p className={browseNotice.warn ? 'warn' : 'muted'} role="status">{browseNotice.text}</p>}
          {browseEditable && removed && <p className="warn node-removed" role="status">Este nó é removido pelo rascunho.</p>}
          {browseEditable && bn.error && <p className="warn" role="status">Rascunho do Planejar: {bn.error}</p>}
          <Details
            card={browseEditable ? shownCard : card}
            base={base}
            docsEnabled={browseEditable ? shownDocs || mine === 'doc' : docsEnabled}
            slots={browseSlots}
            actions={browseActions}
            editing={mine}
            viewNode={selected ? viewData?.nodes?.[selected] ?? null : null}
            viewEdges={viewData?.edges ?? []}
            nodeId={selected}
            onPick={pickElement}
            onSelectInView={selectInView}
            onGlossary={() => send(frame.current, { type: 'act', act: 'glossary' })}
          />
        </>
      )}
    >
      {planEnabled && base && planOpened && <div className="plan-host" hidden={!planning}><PlanView key={base} base={base} active={planning} onNav={setPlanNav} onBusy={onPlanBusy} reload={planReload} focusNode={planFocus?.base === base ? planFocus : undefined} onUnsaved={onPlanUnsaved} externalLock={browseWriting === base} canBuild={info?.plan?.enabled ? info.plan.build !== false : true} onApplied={() => { void loadBase(base); }} /></div>}
      {planning ? null : view ? (
        <>
          <nav className="trail" aria-label="Trilha">
            {trail.map((s, i) => (
              <span key={i}>
                {i > 0 && ' › '}
                {i === trail.length - 1
                  ? <b>{s.view.title}</b>
                  : <button type="button" onClick={() => goStep(i)}>{s.view.title}</button>}
              </span>
            ))}
          </nav>
          <Diagram ref={frame} view={view} theme={diagramTheme} onThemeChange={setDiagramTheme} onEvent={onEvent} busy={loading} alertActions={alertActs} canPresent={leaveBrowseEdit} nest={nest && !planning ? { label: allLabel(nest), onToggle: onNestAll, disabled: loading, hint: LOADING_VIEW } : undefined} />
        </>
      ) : <div className="empty">{shownStatus}</div>}
      {menu && <ContextMenu at={menu.at} title={menu.title} items={menu.items} onPick={(a) => openAction(a, menu.id, 'Menu')} onClose={closeMenu} nest={nest} nodeId={menu.id} onNest={onNestOne} />}
    </Shell>
  );
}
