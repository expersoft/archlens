import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { flip, getBases, getCatalog, getElement, getView, type Action, type Catalog, type ViewResult, type ViewSpec } from './api';
import { pickInitialView } from './pick';
import { Diagram } from './Diagram';
import { Shell } from './Shell';
import { ContextMenu } from './ContextMenu';
import { History } from './History';
import { initialHistory, reducer, type Step } from './history';
import { useTheme } from './theme';
import { send, type BridgeEvent } from './bridge';

const totalMs = (v: ViewResult) => v.ms.resolve + v.ms.layout + v.ms.render;
type Menu = { id: string; at: { x: number; y: number }; title: string; items: Action[] };

export function App() {
  const [theme, setTheme] = useTheme();
  const [hist, dispatch] = useReducer(reducer, initialHistory);
  const [base, setBase] = useState<string | null>(null);
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

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const bs = (await getBases()).find((x) => x.ok);
        if (!bs) { setStatus('Nenhuma base disponível'); return; }
        const cat = await getCatalog(bs.id);
        if (dead) return;
        setBase(bs.id);
        setCatalog(cat);
        const v = pickInitialView(cat.views);
        if (!v) { setStatus(`${cat.name}: sem visões`); return; }
        void run(reserve(), bs.id, v.spec, 'Visão', v.title);
      } catch (e) {
        if (!dead) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { dead = true; };
  }, [run, reserve]);

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

  const onEvent = (e: BridgeEvent) => {
    const { base: b, step: cur } = stateRef.current;
    if (e.type === 'theme') setTheme(e.theme);
    else if (e.type === 'select') {
      menuTicket.current++;
      setMenu(null);
      if (e.id !== stateRef.current.selected) setSelected(e.id);
    } else if (e.type === 'ready') {
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
      leftContent={{
        chat: (
          <>
            <div className="ph">Conversa e histórico</div>
            <History steps={hist.steps} cur={hist.cur} onGo={(i) => dispatch({ type: 'go', index: i })} />
          </>
        ),
        tree: <div className="ph">Explorador</div>,
      }}
      rightContent={<div className="ph" data-selected={selected ?? undefined}>Detalhes</div>}
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
