import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getView, planActions, planFlip, planPreview, type Action, type Draft, type Notation, type PlanPreviewResult, type PreviewView, type ViewSpec } from '../api';
import { Diagram } from '../Diagram';
import { ContextMenu } from '../ContextMenu';
import { send, type BridgeEvent } from '../bridge';
import { useDiagramTheme } from '../theme';
import { useStoredState } from '../store';
import { Markdown } from './Markdown';
import { hasChanges } from './draftStore';

type Tab = 'diagram' | 'plan';
type Mode = 'base' | 'delta' | 'both';
const TABS: [Tab, string][] = [['diagram', 'Diagrama'], ['plan', 'Plano']];
const GROUPS: [PreviewView['kind'], string][] = [['change', 'O que muda'], ['saved', 'Visões salvas afetadas'], ['asked', 'Pedidas e navegadas']];
const MODES: [Mode, string][] = [['base', 'Base atual'], ['delta', 'Com o delta'], ['both', 'Lado a lado']];
const NO_BASE = 'Esta visão não existe na base atual (só aparece com o delta).';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const asView = (html: string, alertInfo?: PreviewView['alertInfo']) => ({ html, alertInfo });
const noop = () => {};
/** The status label of a wait no action named (a new draft). */
const DRAFT_LABEL = 'prévia do rascunho';
const flipLabel = (n: Notation) => (n === 'c4' ? 'Ver em C4' : 'Ver em ArchiMate');

type Loaded = { default: PlanPreviewResult; asked: PreviewView[]; failed: string[] };
type Base = { id: string; html?: string; error?: string };
type Menu = { id: string; at: { x: number; y: number }; title: string; items: Action[] | null };
/** What was shown before a request, to go back to on Cancelar. */
type Before = { pick: string | null; notation: Notation | undefined };
/**
 * A preview request after one was drawn: the drawn one stays, dimmed, until it arrives. Only a navigation or a notation
 * switch can be cancelled (`cancellable`); a new draft must be drawn. `spec`: the navigated view, out of the asked
 * ones again on Cancelar.
 */
type Wait = { label: string; before: Before; cancellable: boolean; spec?: ViewSpec };
/** What the action about to ask for a preview leaves for it. */
type Intent = { label: string; before: Before; spec?: ViewSpec };
/** What the drawn preview answers. */
type Have = { base: string; draft: Draft; askedKey: string; notation: Notation | undefined; result: PlanPreviewResult };

/**
 * The notation of the view shown and how to switch it (the top bar's ArchiMate | C4), and the preview request in
 * flight (`loading`), with its status label and how to cancel it (no `cancel` for a new draft's preview).
 */
export interface PreviewNav { notation: Notation | null; flip: (n: Notation) => void; loading: { label: string; cancel?: () => void } | null }

export interface PlanPreviewProps {
  base: string;
  draft: Draft | null;
  previews: ViewSpec[];
  onLoaded?: (r: PlanPreviewResult | null, failed?: boolean) => void;
  /** A view opened from the diagram (context menu, double click, notation): the host keeps it with the asked ones. */
  onNavigate?: (spec: ViewSpec) => void;
  /** A navigation cancelled while its preview was drawn: the host takes the view out of the asked ones. */
  onUnnavigate?: (spec: ViewSpec) => void;
  onNav?: (nav: PreviewNav) => void;
  /** A preview request is in flight after one was drawn: screen editing waits for it. */
  onLoading?: (loading: boolean) => void;
  /** The element selected in the diagram. */
  onSelect?: (id: string | null) => void;
  /** Selects this element in the diagram (`n` repeats the same id). */
  focus?: { id: string; n: number } | null;
}

/** The right pane of Planejar: the draft drawn with the delta, and the plan report. Navigation runs over the preview. */
export function PlanPreview({ base, draft, previews, onLoaded, onNavigate, onUnnavigate, onNav, onLoading, onSelect, focus }: PlanPreviewProps) {
  const loadedCb = useRef(onLoaded);
  loadedCb.current = onLoaded;
  const loadingCb = useRef(onLoading);
  loadingCb.current = onLoading;
  const unnavigateCb = useRef(onUnnavigate);
  unnavigateCb.current = onUnnavigate;
  const [theme, setTheme] = useDiagramTheme();
  const [tab, setTab] = useState<Tab>('diagram');
  const [raw, setRaw] = useStoredState<boolean>('archlens-plan-report-raw', false);
  const [mode, setMode] = useState<Mode>('delta');
  const [pick, setPick] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseView, setBaseView] = useState<Base | null>(null);
  const [changeNotation, setChangeNotation] = useState<Notation | undefined>(undefined);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [navError, setNavError] = useState<string | null>(null);
  const [wait, setWait] = useState<Wait | null>(null);
  const waitRef = useRef(wait);
  waitRef.current = wait;
  const have = useRef<Have | null>(null);
  // The label and what was shown, set by the action (navigate, notation) that is about to ask for a preview.
  const intent = useRef<Intent | null>(null);
  const ticket = useRef(0);
  const now = useRef<Before>({ pick, notation: changeNotation });
  now.current = { pick, notation: changeNotation };
  const matrixKeys = useRef(new Set<string>());
  const matrixSent = useRef<string | null>(null);
  const menuTicket = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const planned = hasChanges(draft);
  const askedKey = JSON.stringify(previews);

  // The default views come with the draft; the ones asked in the conversation are drawn with the same delta.
  useEffect(() => {
    const asked = intent.current;
    intent.current = null;
    if (!draft || !planned) { loadedCb.current?.(null); have.current = null; setWait(null); setLoaded(null); setError(null); return; }
    const h = have.current;
    // Cancelar went back to what is drawn: nothing to ask.
    if (h && h.base === base && h.draft === draft && h.askedKey === askedKey && h.notation === changeNotation) return;
    loadedCb.current?.(null); // the preview of the previous draft no longer vouches for this one
    const t = ++ticket.current;
    const live = () => t === ticket.current;
    if (h) {
      // A request that replaces one in flight keeps what was shown before the first.
      const w = waitRef.current;
      const sameDraft = h.base === base && h.draft === draft;
      setWait({
        label: asked?.label ?? w?.label ?? DRAFT_LABEL,
        before: w?.before ?? asked?.before ?? { pick: now.current.pick, notation: h.notation },
        cancellable: !!asked && sameDraft && (!w || w.cancellable),
        spec: asked?.spec ?? w?.spec,
      });
    }
    const specs = JSON.parse(askedKey) as ViewSpec[];
    // One request per asked spec: a bad one is reported next to the list and does not hide the rest.
    const askedOne = (sp: ViewSpec) => planPreview(base, draft, [sp]).then((r) => ({ views: r.views, failed: null as string | null }), (e) => ({ views: [] as PreviewView[], failed: errMsg(e) }));
    Promise.all([planPreview(base, draft, undefined, changeNotation), Promise.all(specs.map(askedOne))])
      .then(([d, a]) => {
        if (!live()) return;
        have.current = { base, draft, askedKey, notation: changeNotation, result: d };
        setLoaded({ default: d, asked: a.flatMap((x) => x.views), failed: a.flatMap((x) => (x.failed ? [x.failed] : [])) });
        setError(null);
        setWait(null);
        loadedCb.current?.(d);
      })
      .catch((e) => { if (live()) { setError(errMsg(e)); setWait(null); loadedCb.current?.(null, true); } });
    return () => { ticket.current++; };
  }, [base, draft, planned, askedKey, changeNotation]);
  // An action that asked for nothing (its view was already there) leaves no label for the next request.
  useEffect(() => { intent.current = null; });
  useEffect(() => { loadingCb.current?.(!!wait); }, [wait]);
  useEffect(() => () => { loadingCb.current?.(false); }, []);

  const views = useMemo(() => [...(loaded?.default.views ?? []), ...(loaded?.asked ?? [])].map((v) => ({ ...v, id: `${v.kind}:${v.key}` })), [loaded]);
  // While a request is in flight, the view shown before it stays.
  const shownPick = wait ? wait.before.pick : pick;
  const current = views.find((v) => v.id === shownPick) ?? views[0];
  const wantsBase = mode !== 'delta' && !!current && !current.error;
  const at = current ? views.indexOf(current) : -1;
  const notation: Notation | null = current?.spec ? (current.spec.notation === 'c4' ? 'c4' : 'archimate') : null;

  const navigate = useCallback((spec: ViewSpec, matrix?: boolean, label?: string) => {
    const key = typeof spec.key === 'string' ? spec.key : null;
    if (!key) return;
    if (matrix) matrixKeys.current.add(key);
    intent.current = { label: label ?? (typeof spec.title === 'string' ? spec.title : key), before: now.current, spec };
    setNavError(null);
    setPick(`asked:${key}`);
    setTab('diagram');
    onNavigate?.(spec);
  }, [onNavigate]);

  // The top bar's ArchiMate | C4: the change view is redrawn in the other notation; any other opens its flip.
  const latest = useRef({ current, draft, base });
  latest.current = { current, draft, base };
  const flipTo = useCallback((n: Notation) => {
    const { current: cur, draft: d } = latest.current;
    if (!cur?.spec || !d || waitRef.current) return;
    if ((cur.spec.notation === 'c4' ? 'c4' : 'archimate') === n) return;
    if (cur.kind === 'change') { intent.current = { label: flipLabel(n), before: now.current }; setChangeNotation(n); return; }
    planFlip(base, d, cur.spec).then((r) => navigate(r.spec, undefined, flipLabel(n)), (e) => setNavError(errMsg(e)));
  }, [base, navigate]);
  // Cancelar drops the request (its late answer is ignored) and goes back to the view and notation shown before it; a
  // navigated view leaves the asked ones.
  const cancel = useCallback(() => {
    const w = waitRef.current;
    if (!w?.cancellable) return;
    ticket.current++;
    setWait(null);
    setPick(w.before.pick);
    setChangeNotation(w.before.notation);
    if (w.spec) unnavigateCb.current?.(w.spec);
    const h = have.current;
    // The drawn preview still vouches for the draft unless the request was for a new one.
    if (h && h.base === latest.current.base && h.draft === latest.current.draft) loadedCb.current?.(h.result);
  }, []);
  useEffect(() => { onNav?.({ notation, flip: flipTo, loading: wait ? { label: wait.label, cancel: wait.cancellable ? cancel : undefined } : null }); }, [notation, flipTo, onNav, wait, cancel]);

  // A node the view does not draw cannot be selected in the frame (it would answer select(null)); the panel still shows it.
  const inView = (id: string) => !!(current?.viewData as { nodes?: Record<string, unknown> } | undefined)?.nodes?.[id];
  const lastSel = useRef<string | null>(null);
  const echo = useRef<string | null>(null);
  const reloading = useRef(false);
  useEffect(() => {
    if (!focus) return;
    lastSel.current = focus.id;
    if (inView(focus.id)) send(frame.current, { type: 'select', id: focus.id, focus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // A new document in the frame (or the frame mounted again) loads and says ready (a page cached before may still say
  // select(null) first).
  useEffect(() => { reloading.current = true; echo.current = null; }, [current?.html, tab]);
  useEffect(() => { matrixSent.current = null; }, [current?.id, current?.html]);

  const nameIn = (id: string) => (current?.viewData as { nodes?: Record<string, { name?: string }> } | undefined)?.nodes?.[id]?.name ?? id;
  const onEvent = (e: BridgeEvent) => {
    if (!draft) return;
    if (e.type === 'theme') setTheme(e.theme);
    else if (waitRef.current && (e.type === 'context' || e.type === 'expand')) return; // a preview is being drawn
    else if (e.type === 'select') {
      menuTicket.current++; setMenu(null);
      if (waitRef.current) {
        // A click while a preview is being drawn changes nothing: the previous selection is highlighted again.
        if (e.id === lastSel.current) return;
        const prev = lastSel.current && inView(lastSel.current) ? lastSel.current : null;
        echo.current = prev;
        send(frame.current, { type: 'select', id: prev });
        return;
      }
      if (e.id !== null) {
        reloading.current = false; // the frame is alive and answering
        if (e.id === echo.current) { echo.current = null; return; } // the answer to the selection restored after a load
        echo.current = null;
        lastSel.current = e.id;
        onSelect?.(e.id);
        return;
      }
      // A frame that is loading may say select(null) on its own (a page cached before); that is not the user deselecting.
      if (reloading.current) return;
      lastSel.current = null;
      onSelect?.(null);
    } else if (e.type === 'ready') {
      if (reloading.current) {
        reloading.current = false;
        echo.current = null;
        if (lastSel.current && inView(lastSel.current)) { echo.current = lastSel.current; send(frame.current, { type: 'select', id: lastSel.current }); }
      }
      if (current?.key && matrixKeys.current.has(current.key) && matrixSent.current !== current.id) {
        matrixSent.current = current.id;
        send(frame.current, { type: 'act', act: 'matrix' });
      }
    } else if (e.type === 'context') {
      const mt = ++menuTicket.current;
      const rect = frame.current?.getBoundingClientRect();
      const at = { x: (rect?.left ?? 0) + e.x, y: (rect?.top ?? 0) + e.y };
      setMenu({ id: e.id, at, title: nameIn(e.id), items: null });
      planActions(base, draft, e.id, current?.spec).then((r) => {
        if (mt === menuTicket.current) setMenu({ id: e.id, at, title: nameIn(e.id), items: r.actions });
      }, (err) => { if (mt === menuTicket.current) { setMenu(null); setNavError(errMsg(err)); } });
    } else if (e.type === 'expand') {
      menuTicket.current++;
      setMenu(null);
      planActions(base, draft, e.id, current?.spec).then((r) => {
        const a = r.actions.find((x) => x.primary && x.spec);
        if (a?.spec) navigate(a.spec, a.matrix, `${a.label}: ${nameIn(e.id)}`);
      }, (err) => setNavError(errMsg(err)));
    }
  };

  useEffect(() => {
    if (!wantsBase || !current) return;
    let live = true;
    setBaseView(null);
    getView(base, current.spec)
      .then((r) => { if (live) setBaseView({ id: current.id, html: r.html }); })
      .catch((e) => { if (live) setBaseView({ id: current.id, error: errMsg(e) }); });
    return () => { live = false; };
  }, [base, wantsBase, current?.id, current?.spec]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!planned) return <div className="empty">Nada planejado ainda</div>;
  if (error) return <div className="warn" role="alert">{error}</div>;
  if (!loaded) return <div className="empty">Desenhando a prévia…</div>;
  const d = loaded.default;

  const baseHere = baseView?.id === current?.id ? baseView : null;
  const withDelta = current?.html != null ? <Diagram ref={frame} view={asView(current.html, current.alertInfo)} theme={theme} onThemeChange={setTheme} onEvent={onEvent} busy={!!wait} /> : null;
  const baseSide = !baseHere ? <div className="empty">Carregando a base atual…</div>
    : baseHere.html != null ? <Diagram view={asView(baseHere.html)} theme={theme} onEvent={noop} />
      : <div className="empty" role="status">{NO_BASE}</div>;

  return (
    <div className="preview-tabs">
      <div role="tablist" className="toolbar">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
        <span className="meta">{d.summary}</span>
      </div>
      {d.warning && <div className="warn" role="status">{d.warning}</div>}
      {tab === 'diagram' && (
        <div className="preview-diagram">
          <div className="toolbar preview-pick">
            <button type="button" className="step" aria-label="Visão anterior" title="Visão anterior" disabled={!!wait || at <= 0} onClick={() => setPick(views[at - 1].id)}>«</button>
            <label className="view-pick">
              <span>Visão</span>
              <select aria-label="Visão da prévia" disabled={!!wait} value={current?.id ?? ''} onChange={(e) => setPick(e.target.value)}>
                {GROUPS.map(([kind, label]) => {
                  const of = views.filter((v) => v.kind === kind);
                  return of.length ? (
                    <optgroup key={kind} label={`${label} (${of.length})`}>
                      {of.map((v) => <option key={v.id} value={v.id}>{v.title}{v.error ? ' (não desenhada)' : ''}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <button type="button" className="step" aria-label="Próxima visão" title="Próxima visão" disabled={!!wait || at < 0 || at >= views.length - 1} onClick={() => setPick(views[at + 1].id)}>»</button>
            <div className="seg" role="group" aria-label="Comparar">
              {MODES.map(([m, label]) => (
                <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>
              ))}
            </div>
          </div>
          {navError && <div className="warn" role="status">{navError}</div>}
          {loaded.failed.length > 0 && <div className="warn" role="status">{loaded.failed.length} visão(ões) pedida(s) na conversa não puderam ser desenhadas: {loaded.failed.join('; ')}</div>}
          {d.skipped.length > 0 && <div className="warn" role="status">{d.skipped.length} visão(ões) salva(s) não puderam ser desenhadas: {d.skipped.map((s) => s.key).join(', ')}</div>}
          {current?.error ? <div className="warn" role="status">{current.error}</div> : (
            <div className="preview-frames">
              {mode !== 'delta' && <div className="preview-side">{baseSide}</div>}
              {mode !== 'base' && <div className="preview-side">{withDelta}</div>}
            </div>
          )}
        </div>
      )}
      {tab === 'plan' && (d.report ? (
        <div className="preview-plan">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Mostrar o plano como">
              <button type="button" className={!raw ? 'on' : ''} aria-pressed={!raw} onClick={() => setRaw(false)}>Preview</button>
              <button type="button" className={raw ? 'on' : ''} aria-pressed={raw} onClick={() => setRaw(true)}>Raw</button>
            </div>
          </div>
          {raw ? <pre className="preview-report">{d.report}</pre> : <Markdown className="preview-report md" text={d.report} />}
        </div>
      ) : <div className="empty">O rascunho ainda não tem plano.</div>)}
      {menu && <ContextMenu at={menu.at} title={menu.title} items={menu.items} onPick={(a) => { setMenu(null); if (a.spec) navigate(a.spec, a.matrix, `${a.label}: ${menu.title}`); }} onClose={() => setMenu(null)} />}
    </div>
  );
}
