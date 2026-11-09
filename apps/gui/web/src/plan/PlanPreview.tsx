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
const asView = (html: string) => ({ html, alerts: [] as string[] });
const noop = () => {};

type Loaded = { default: PlanPreviewResult; asked: PreviewView[]; failed: string[] };
type Base = { id: string; html?: string; error?: string };
type Menu = { id: string; at: { x: number; y: number }; title: string; items: Action[] | null };

/** The notation of the view shown and how to switch it (the top bar's ArchiMate | C4). */
export interface PreviewNav { notation: Notation | null; flip: (n: Notation) => void }

export interface PlanPreviewProps {
  base: string;
  draft: Draft | null;
  previews: ViewSpec[];
  onLoaded?: (r: PlanPreviewResult | null, failed?: boolean) => void;
  /** A view opened from the diagram (context menu, double click, notation): the host keeps it with the asked ones. */
  onNavigate?: (spec: ViewSpec) => void;
  onNav?: (nav: PreviewNav) => void;
  /** The element selected in the diagram. */
  onSelect?: (id: string | null) => void;
  /** Selects this element in the diagram (`n` repeats the same id). */
  focus?: { id: string; n: number } | null;
}

/** The right pane of Planejar: the draft drawn with the delta, and the plan report. Navigation runs over the preview. */
export function PlanPreview({ base, draft, previews, onLoaded, onNavigate, onNav, onSelect, focus }: PlanPreviewProps) {
  const loadedCb = useRef(onLoaded);
  loadedCb.current = onLoaded;
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
  const matrixKeys = useRef(new Set<string>());
  const matrixSent = useRef<string | null>(null);
  const menuTicket = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const planned = hasChanges(draft);
  const askedKey = JSON.stringify(previews);

  // The default views come with the draft; the ones asked in the conversation are drawn with the same delta.
  useEffect(() => {
    loadedCb.current?.(null); // the preview of the previous draft no longer vouches for this one
    if (!draft || !planned) { setLoaded(null); setError(null); return; }
    let live = true;
    const specs = JSON.parse(askedKey) as ViewSpec[];
    // One request per asked spec: a bad one is reported next to the list and does not hide the rest.
    const askedOne = (sp: ViewSpec) => planPreview(base, draft, [sp]).then((r) => ({ views: r.views, failed: null as string | null }), (e) => ({ views: [] as PreviewView[], failed: errMsg(e) }));
    Promise.all([planPreview(base, draft, undefined, changeNotation), Promise.all(specs.map(askedOne))])
      .then(([d, a]) => {
        if (!live) return;
        setLoaded({ default: d, asked: a.flatMap((x) => x.views), failed: a.flatMap((x) => (x.failed ? [x.failed] : [])) });
        setError(null);
        loadedCb.current?.(d);
      })
      .catch((e) => { if (live) { setError(errMsg(e)); loadedCb.current?.(null, true); } });
    return () => { live = false; };
  }, [base, draft, planned, askedKey, changeNotation]);

  const views = useMemo(() => [...(loaded?.default.views ?? []), ...(loaded?.asked ?? [])].map((v) => ({ ...v, id: `${v.kind}:${v.key}` })), [loaded]);
  const current = views.find((v) => v.id === pick) ?? views[0];
  const wantsBase = mode !== 'delta' && !!current && !current.error;
  const at = current ? views.indexOf(current) : -1;
  const notation: Notation | null = current?.spec ? (current.spec.notation === 'c4' ? 'c4' : 'archimate') : null;

  const navigate = useCallback((spec: ViewSpec, matrix?: boolean) => {
    const key = typeof spec.key === 'string' ? spec.key : null;
    if (!key) return;
    if (matrix) matrixKeys.current.add(key);
    setNavError(null);
    setPick(`asked:${key}`);
    setTab('diagram');
    onNavigate?.(spec);
  }, [onNavigate]);

  // The top bar's ArchiMate | C4: the change view is redrawn in the other notation; any other opens its flip.
  const latest = useRef({ current, draft });
  latest.current = { current, draft };
  const flipTo = useCallback((n: Notation) => {
    const { current: cur, draft: d } = latest.current;
    if (!cur?.spec || !d) return;
    if ((cur.spec.notation === 'c4' ? 'c4' : 'archimate') === n) return;
    if (cur.kind === 'change') { setChangeNotation(n); return; }
    planFlip(base, d, cur.spec).then((r) => navigate(r.spec), (e) => setNavError(errMsg(e)));
  }, [base, navigate]);
  useEffect(() => { onNav?.({ notation, flip: flipTo }); }, [notation, flipTo, onNav]);

  useEffect(() => {
    if (focus) send(frame.current, { type: 'select', id: focus.id, focus: true });
  }, [focus]);
  useEffect(() => { matrixSent.current = null; }, [current?.id, current?.html]);

  const nameIn = (id: string) => (current?.viewData as { nodes?: Record<string, { name?: string }> } | undefined)?.nodes?.[id]?.name ?? id;
  const onEvent = (e: BridgeEvent) => {
    if (!draft) return;
    if (e.type === 'theme') setTheme(e.theme);
    else if (e.type === 'select') { menuTicket.current++; setMenu(null); onSelect?.(e.id); }
    else if (e.type === 'ready') {
      if (current?.key && matrixKeys.current.has(current.key) && matrixSent.current !== current.id) {
        matrixSent.current = current.id;
        send(frame.current, { type: 'act', act: 'matrix' });
      }
    } else if (e.type === 'context') {
      const mt = ++menuTicket.current;
      const rect = frame.current?.getBoundingClientRect();
      const at = { x: (rect?.left ?? 0) + e.x, y: (rect?.top ?? 0) + e.y };
      setMenu({ id: e.id, at, title: nameIn(e.id), items: null });
      planActions(base, draft, e.id).then((r) => {
        if (mt === menuTicket.current) setMenu({ id: e.id, at, title: nameIn(e.id), items: r.actions });
      }, (err) => { if (mt === menuTicket.current) { setMenu(null); setNavError(errMsg(err)); } });
    } else if (e.type === 'expand') {
      menuTicket.current++;
      setMenu(null);
      planActions(base, draft, e.id).then((r) => {
        const a = r.actions.find((x) => x.primary && x.spec);
        if (a?.spec) navigate(a.spec, a.matrix);
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
  const withDelta = current?.html != null ? <Diagram ref={frame} view={asView(current.html)} theme={theme} onThemeChange={setTheme} onEvent={onEvent} /> : null;
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
            <button type="button" className="step" aria-label="Visão anterior" title="Visão anterior" disabled={at <= 0} onClick={() => setPick(views[at - 1].id)}>«</button>
            <label className="view-pick">
              <span>Visão</span>
              <select aria-label="Visão da prévia" value={current?.id ?? ''} onChange={(e) => setPick(e.target.value)}>
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
            <button type="button" className="step" aria-label="Próxima visão" title="Próxima visão" disabled={at < 0 || at >= views.length - 1} onClick={() => setPick(views[at + 1].id)}>»</button>
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
      {menu && <ContextMenu at={menu.at} title={menu.title} items={menu.items} onPick={(a) => { setMenu(null); if (a.spec) navigate(a.spec, a.matrix); }} onClose={() => setMenu(null)} />}
    </div>
  );
}
