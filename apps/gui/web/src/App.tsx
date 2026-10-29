import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ask as askApi, find, flip, getActions, getBases, getCatalog, getElement, getInfo, getView, type Action, type AskEvent, type Info, type BaseInfo, type Card, type Catalog, type FindHit, type ViewData, type ViewResult, type ViewSpec } from './api';
import { pickInitialView } from './pick';
import { Diagram } from './Diagram';
import { Shell } from './Shell';
import { ContextMenu } from './ContextMenu';
import { History } from './History';
import { Conversation } from './Conversation';
import { looksLikeQuestion, type Turn } from './question';
import { Explorer } from './Explorer';
import { Details } from './Details';
import { initialHistory, reducer, type Step } from './history';
import { useTheme } from './theme';
import { send, type BridgeEvent } from './bridge';
import { typeHint } from './labels';

const totalMs = (v: ViewResult) => v.ms.resolve + v.ms.layout + v.ms.render;
/** `items` null: as ações ainda estão chegando (o menu já abre com "Carregando…"). */
type Menu = { id: string; at: { x: number; y: number }; title: string; items: Action[] | null };

export function App() {
  const [theme, setTheme] = useTheme();
  const [hist, dispatch] = useReducer(reducer, initialHistory);
  const [bases, setBases] = useState<BaseInfo[]>([]);
  const [base, setBase] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [hits, setHits] = useState<FindHit[]>([]);
  const [chatRequest, setChatRequest] = useState(0);
  const [rightRequest, setRightRequest] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [status, setStatus] = useState('Carregando…');
  const [presenting, setPresenting] = useState(false);
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

  const stateRef = useRef({ base, catalog, selected, step });
  stateRef.current = { base, catalog, selected, step };
  const matrixSent = useRef<Step | null>(null);

  useEffect(() => {
    const on = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const [notice, setNotice] = useState<string | null>(null);

  /** Reserva o ticket de forma síncrona, antes de qualquer espera. */
  /** Aborta a pergunta em andamento (o servidor para o agente) e marca o turno como cancelado. */
  const cancelAsk = useCallback(() => {
    const cur = askRun.current;
    if (!cur) return;
    askRun.current = null;
    cur.ctl.abort();
    setTurns((ts) => ts.map((x) => (x.id === cur.id && x.status === 'running' ? { ...x, status: 'canceled', stage: undefined } : x)));
  }, []);

  const reserve = useCallback(() => {
    cancelAsk(); // qualquer navegação nova vence a pergunta em andamento
    const t = ++ticket.current;
    dispatch({ type: 'request', ticket: t });
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
      void run(reserve(), id, v.spec, 'Visão', v.title);
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
    menuTicket.current++;
    setMenu(null);
    cancelAsk();
    setTurns([]);
    ticket.current++; // invalida qualquer pedido em voo da base anterior
    dispatch({ type: 'reset' });
    setSelected(null);
    setCard(null);
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
    getElement(base, selected).then((d) => { if (!dead) setCard(d.card); }).catch(() => { /* sem cartão: a seleção continua */ });
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
    void run(reserve(), b, a.spec, kind, `${a.label}: ${nameOf(id)}`, a.matrix);
  };

  const inView = (id: string) => !!(stateRef.current.step?.view.data as ViewData | null)?.nodes?.[id];
  const selectInView = (id: string) => { setSelected(id); send(frame.current, { type: 'select', id }); };
  const expandTicket = useRef(0);

  /** Escolha no Explorador/busca: seleciona se está na visão; senão abre a primeira ação de contexto. */
  const pickElement = (id: string) => {
    const b = stateRef.current.base;
    if (!b) return;
    setHits([]);
    setSelected(id);
    if (inView(id)) { send(frame.current, { type: 'select', id, focus: true }); return; }
    const t = reserve();
    getActions(b, id).then((d) => {
      if (t !== ticket.current) return;
      const withSpec = d.actions.filter((a) => a.spec);
      const a = withSpec.find((x) => /^(Contexto|Containers do sistema|Componentes do container)/.test(x.label)) ?? withSpec[0];
      if (!a) { dispatch({ type: 'failed', ticket: t, error: `sem visão para ${nameOf(id)}` }); return; }
      return run(t, b, a.spec!, 'Explorador', `${nameOf(id)}: ${a.label}`, a.matrix);
    }).catch((err) => { if (t === ticket.current) fail(t, err); });
  };

  /** Pergunta ao agente; `chosen` é a opção escolhida num esclarecimento. */
  const askQuestion = (question: string, chosen?: string) => {
    const { base: b, step: cur, selected: sel } = stateRef.current;
    if (!b) return;
    const history = turnsRef.current.filter((x) => x.status === 'done').slice(-4).map((x) => ({ question: x.question, title: x.view?.title }));
    const nodes = Object.keys((cur?.view.data as ViewData | null)?.nodes ?? {});
    const context = cur ? { spec: cur.view.spec, ...(nodes.length ? { nodes } : {}), ...(sel ? { selected: sel } : {}) } : undefined;
    const t = reserve(); // cancela a anterior e reserva o ticket
    const id = ++turnSeq.current;
    const ctl = new AbortController();
    askRun.current = { ctl, id };
    setTurns((ts) => [...ts, { id, question, status: 'running' }]);
    const patch = (p: Partial<Turn>) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const release = () => { if (askRun.current?.id === id) askRun.current = null; };
    let finished = false;
    const onAskEvent = (e: AskEvent) => {
      if (ctl.signal.aborted) return;
      if (e.type === 'stage') patch({ stage: e.stage });
      else if (e.type === 'done') patch({ ms: e.metrics.total });
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
    const t = reserve();
    dispatch({ type: 'loaded', ticket: t, step: { kind: 'Pergunta', label: turn.question, view: v, ms: totalMs(v) } });
  };

  const goStep = (index: number) => { cancelAsk(); dispatch({ type: 'go', index }); };

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
    if (e.type === 'theme') setTheme(e.theme);
    else if (e.type === 'select') {
      menuTicket.current++;
      setMenu(null);
      if (e.id !== stateRef.current.selected) setSelected(e.id);
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
      getActions(b, e.id).then((d) => {
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
      getActions(b, e.id).then((d) => {
        if (!live() || ticket.current !== t0) return; // superado por outro duplo clique ou por outra navegação
        const p = d.actions.find((a) => a.primary && a.spec);
        if (p) void run(reserve(), b, p.spec!, 'Clique duplo', `${p.label}: ${nameOf(e.id)}`, p.matrix);
      }).catch((err) => { if (live() && ticket.current === t0) setNotice(err instanceof Error ? err.message : String(err)); });
    }
  };

  const notation = (view?.spec as { notation?: string } | undefined)?.notation === 'c4' ? 'c4' : 'archimate';
  const onNotation = (n: 'archimate' | 'c4') => {
    if (!base || !view || n === notation) return;
    const t = reserve();
    flip(base, view.spec)
      .then((r) => { if (t === ticket.current) return run(t, base, r.spec, 'Notação', n === 'c4' ? 'Ver em C4' : 'Ver em ArchiMate'); })
      .catch((err) => { if (t === ticket.current) fail(t, err); });
  };

  const viewData = (view?.data ?? null) as ViewData | null;
  const closeMenu = useCallback(() => setMenu(null), []);
  const trail = useMemo(() => hist.steps.slice(0, hist.cur + 1), [hist.steps, hist.cur]);
  const loading = hist.pending != null;
  const shownStatus = loading ? 'Carregando…' : hist.error ?? notice ?? (view && catalog ? `${catalog.name} · ${view.title}` : status);

  return (
    <Shell
      theme={theme}
      onThemeChange={setTheme}
      presenting={presenting}
      status={shownStatus}
      notation={notation}
      onNotation={base && view ? onNotation : undefined}
      bases={bases}
      base={base}
      onBase={onBase}
      onSearch={base ? onSearch : undefined}
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
            onOpenView={(spec, title) => { if (base) void run(reserve(), base, spec, 'Explorador', title); }}
            onPick={pickElement}
          />
        ),
      }}
      rightContent={(
        <>
          <div className="ph">Detalhes</div>
          <Details
            card={card}
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
      {view ? (
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
          <Diagram ref={frame} view={view} theme={theme} onEvent={onEvent} busy={loading} />
        </>
      ) : <div className="empty">{shownStatus}</div>}
      {menu && <ContextMenu at={menu.at} title={menu.title} items={menu.items} onPick={(a) => openAction(a, menu.id, 'Menu')} onClose={closeMenu} />}
    </Shell>
  );
}
