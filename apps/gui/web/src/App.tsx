import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { find, flip, getBases, getCatalog, getElement, getView, type Action, type BaseInfo, type Card, type Catalog, type FindHit, type ViewData, type ViewResult, type ViewSpec } from './api';
import { pickInitialView } from './pick';
import { Diagram } from './Diagram';
import { Shell } from './Shell';
import { ContextMenu } from './ContextMenu';
import { History } from './History';
import { Explorer } from './Explorer';
import { Details } from './Details';
import { initialHistory, reducer, type Step } from './history';
import { useTheme } from './theme';
import { send, type BridgeEvent } from './bridge';

const totalMs = (v: ViewResult) => v.ms.resolve + v.ms.layout + v.ms.render;
type Menu = { id: string; at: { x: number; y: number }; title: string; items: Action[] };

export function App() {
  const [theme, setTheme] = useTheme();
  const [hist, dispatch] = useReducer(reducer, initialHistory);
  const [bases, setBases] = useState<BaseInfo[]>([]);
  const [base, setBase] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [hits, setHits] = useState<FindHit[]>([]);
  const [chatRequest, setChatRequest] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [status, setStatus] = useState('Carregando…');
  const [presenting, setPresenting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const ticket = useRef(0);
  const menuTicket = useRef(0);

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
  const reserve = useCallback(() => {
    const t = ++ticket.current;
    dispatch({ type: 'request', ticket: t });
    setNotice(null);
    return t;
  }, []);
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
    (async () => {
      try {
        const all = await getBases();
        if (dead) return;
        setBases(all);
        const bs = all.find((x) => x.ok);
        if (!bs) { setStatus('Nenhuma base disponível'); return; }
        await loadBase(bs.id, () => dead);
      } catch (e) {
        if (!dead) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { dead = true; };
  }, [loadBase]);

  const onBase = (id: string) => {
    if (id === stateRef.current.base) return;
    menuTicket.current++;
    setMenu(null);
    ticket.current++; // invalida qualquer pedido em voo da base anterior
    dispatch({ type: 'reset' });
    setSelected(null);
    setCard(null);
    setHits([]);
    setNotice(null);
    setCatalog(null);
    setBase(id);
    setStatus('Carregando…');
    void loadBase(id);
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

  /** Escolha no Explorador/busca: seleciona se está na visão; senão abre a primeira ação de contexto. */
  const pickElement = (id: string) => {
    const b = stateRef.current.base;
    if (!b) return;
    setHits([]);
    setSelected(id);
    if (inView(id)) { send(frame.current, { type: 'select', id }); return; }
    const t = reserve();
    getElement(b, id).then((d) => {
      if (t !== ticket.current) return;
      const withSpec = d.actions.filter((a) => a.spec);
      const a = withSpec.find((x) => /^(Contexto|Containers do sistema|Componentes do container)/.test(x.label)) ?? withSpec[0];
      if (!a) { dispatch({ type: 'failed', ticket: t, error: `sem visão para ${nameOf(id)}` }); return; }
      return run(t, b, a.spec!, 'Explorador', `${nameOf(id)}: ${a.label}`, a.matrix);
    }).catch((err) => { if (t === ticket.current) fail(t, err); });
  };

  const onSearch = (q: string) => {
    const b = stateRef.current.base;
    if (!b) return;
    find(b, q).then((r) => {
      if (b !== stateRef.current.base) return;
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
      setMenu(null);
      setNotice(null);
      const rect = frame.current?.getBoundingClientRect();
      const at = { x: (rect?.left ?? 0) + e.x, y: (rect?.top ?? 0) + e.y };
      getElement(b, e.id).then((d) => {
        if (mt === menuTicket.current) setMenu({ id: e.id, at, title: nameOf(e.id), items: d.actions });
      }).catch((err) => {
        if (mt === menuTicket.current) setNotice(err instanceof Error ? err.message : String(err));
      });
    } else if (e.type === 'expand' && b) {
      menuTicket.current++;
      setMenu(null);
      const t = reserve();
      getElement(b, e.id).then((d) => {
        if (t !== ticket.current) return;
        const p = d.actions.find((a) => a.primary && a.spec);
        if (p) void run(t, b, p.spec!, 'Clique duplo', `${p.label}: ${nameOf(e.id)}`, p.matrix);
      }).catch((err) => { if (t === ticket.current) fail(t, err); });
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
  const shownStatus = hist.error ?? notice ?? (view && catalog ? `${catalog.name} · ${view.title}` : status);

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
      leftContent={{
        chat: (
          <>
            <div className="ph">Conversa e histórico</div>
            {hits.length > 0 && (
              <ul className="hits" aria-label="Resultados da busca">
                {hits.map((h) => (
                  <li key={h.id}><button type="button" onClick={() => pickElement(h.id)}>{h.name}<span className="t">{h.kind ?? h.type}</span></button></li>
                ))}
              </ul>
            )}
            <History steps={hist.steps} cur={hist.cur} onGo={(i) => dispatch({ type: 'go', index: i })} />
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
                  : <button type="button" onClick={() => dispatch({ type: 'go', index: i })}>{s.view.title}</button>}
              </span>
            ))}
          </nav>
          <Diagram ref={frame} view={view} theme={theme} onEvent={onEvent} />
        </>
      ) : <div className="empty">{shownStatus}</div>}
      {menu && <ContextMenu at={menu.at} title={menu.title} items={menu.items} onPick={(a) => openAction(a, menu.id, 'Menu')} onClose={closeMenu} />}
    </Shell>
  );
}
