import { useEffect, useMemo, useState } from 'react';
import { getView, planPreview, type Draft, type PlanPreviewResult, type PreviewView, type ViewResult, type ViewSpec } from '../api';
import { Diagram } from '../Diagram';
import { useDiagramTheme } from '../theme';

type Tab = 'diagram' | 'delta' | 'plan';
type Mode = 'base' | 'delta' | 'both';
const TABS: [Tab, string][] = [['diagram', 'Diagrama'], ['delta', 'Delta'], ['plan', 'Plano']];
const MODES: [Mode, string][] = [['base', 'Base atual'], ['delta', 'Com o delta'], ['both', 'Lado a lado']];
const NO_BASE = 'Esta visão não existe na base atual (só aparece com o delta).';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const asView = (html: string) => ({ html, alerts: [] }) as unknown as ViewResult;
const noop = () => {};

type Loaded = { default: PlanPreviewResult; asked: PreviewView[] };
type Base = { id: string; html?: string; error?: string };

/** The right pane of Planejar: the draft drawn with the delta, the delta list and the plan report. */
export function PlanPreview({ base, draft, previews }: { base: string; draft: Draft | null; previews: ViewSpec[] }) {
  const [theme, setTheme] = useDiagramTheme();
  const [tab, setTab] = useState<Tab>('diagram');
  const [mode, setMode] = useState<Mode>('delta');
  const [pick, setPick] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseView, setBaseView] = useState<Base | null>(null);
  const planned = !!draft && !!draft.delta;
  const askedKey = JSON.stringify(previews);

  // The default views come with the draft; the ones asked in the conversation are drawn with the same delta.
  useEffect(() => {
    if (!draft || !planned) { setLoaded(null); setError(null); return; }
    let live = true;
    const specs = JSON.parse(askedKey) as ViewSpec[];
    Promise.all([planPreview(base, draft), specs.length ? planPreview(base, draft, specs) : null])
      .then(([d, a]) => { if (live) { setLoaded({ default: d, asked: a?.views ?? [] }); setError(null); } })
      .catch((e) => { if (live) setError(errMsg(e)); });
    return () => { live = false; };
  }, [base, draft, planned, askedKey]);

  const views = useMemo(() => [...(loaded?.default.views ?? []), ...(loaded?.asked ?? [])].map((v) => ({ ...v, id: `${v.kind}:${v.key}` })), [loaded]);
  const current = views.find((v) => v.id === pick) ?? views[0];
  const wantsBase = mode !== 'delta' && !!current && !current.error;

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
  const withDelta = current?.html != null ? <Diagram view={asView(current.html)} theme={theme} onThemeChange={setTheme} onEvent={noop} /> : null;
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
          <div className="toolbar" aria-label="Visões da prévia">
            {views.map((v) => (
              <button key={v.id} type="button" className={v.id === current?.id ? 'on' : ''} aria-pressed={v.id === current?.id} onClick={() => setPick(v.id)}>{v.title}</button>
            ))}
          </div>
          <div className="toolbar" aria-label="Comparar">
            {MODES.map(([m, label]) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>
            ))}
          </div>
          {d.skipped.length > 0 && <div className="warn" role="status">{d.skipped.length} visão(ões) salva(s) não puderam ser desenhadas: {d.skipped.map((s) => s.key).join(', ')}</div>}
          {current?.error ? <div className="warn" role="status">{current.error}</div> : (
            <div className="preview-frames">
              {mode !== 'delta' && <div className="preview-side">{baseSide}</div>}
              {mode !== 'base' && <div className="preview-side">{withDelta}</div>}
            </div>
          )}
        </div>
      )}
      {tab === 'delta' && (
        <div className="preview-delta">
          {d.changes.length ? (
            <ul aria-label="Mudanças">
              {d.changes.map((c) => (
                <li key={`${c.kind}:${c.id}`} className={`chg ${c.sign === '+' ? 'add' : c.sign === '~' ? 'mod' : 'del'}`}>
                  <b>{c.sign}</b>{c.name} <span className="meta">{c.kind === 'relationship' ? 'relação' : 'elemento'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="meta">O delta não muda nada na base.</p>}
          {d.questions.length > 0 && (
            <>
              <h3>Perguntas abertas</h3>
              <ul aria-label="Perguntas abertas">
                {d.questions.map((q) => <li key={q.key}>{q.question}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
      {tab === 'plan' && (d.report ? <pre className="preview-report">{d.report}</pre> : <div className="empty">O rascunho ainda não tem plano.</div>)}
    </div>
  );
}
