import type { PlanPreviewResult, PreviewChange } from '../api';

const SIGN_CLASS = { '+': 'add', '~': 'mod', '−': 'del' } as const;
const SIGN_WORD = { '+': 'adicionado', '~': 'alterado', '−': 'removido' } as const;

function Change({ c, selected, onPick }: { c: PreviewChange; selected: boolean; onPick?: (id: string) => void }) {
  const target = c.kind === 'element' ? c.id : null;
  return (
    <li className={`chg ${SIGN_CLASS[c.sign]}${selected ? ' sel' : ''}`}>
      <div className="chg-head">
        <b aria-label={SIGN_WORD[c.sign]}>{c.sign}</b>
        {target && onPick
          ? <button type="button" className="chg-name" title="Mostrar no diagrama" onClick={() => onPick(target)}>{c.name}</button>
          : <span className="chg-name">{c.name}</span>}
      </div>
      {c.type && <div className="t">{c.type}</div>}
      {c.description && <p className="chg-desc">{c.description}</p>}
      {!!c.fields?.length && (
        <dl className="chg-fields">
          {c.fields.map((f) => (
            <div key={f.field}>
              <dt>{f.field}</dt>
              <dd><span className="before">{f.before}</span> → <span className="after">{f.after}</span></dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

const LINE_CLASS = { ' ': 'same', '-': 'del', '+': 'add' } as const;

function DocChange({ c, selected, onPick }: { c: PreviewChange; selected: boolean; onPick?: (id: string) => void }) {
  return (
    <li className={`chg ${SIGN_CLASS[c.sign]}${selected ? ' sel' : ''}`}>
      <div className="chg-head">
        <b aria-label={SIGN_WORD[c.sign]}>{c.sign}</b>
        {onPick
          ? <button type="button" className="chg-name" title="Mostrar no diagrama" onClick={() => onPick(c.id)}>{c.name}</button>
          : <span className="chg-name">{c.name}</span>}
      </div>
      <pre className="doc-diff">
        {(c.diff ?? []).map((l, i) => <span key={i} className={`ln ${LINE_CLASS[l.sign]}`}>{`${l.sign} ${l.line}`}</span>)}
      </pre>
    </li>
  );
}

/** The right panel of Planejar: what the draft changes, as text, and the questions still open. */
export function DeltaPanel({ result, selected, onPick }: { result: PlanPreviewResult | null; selected?: string | null; onPick?: (id: string) => void }) {
  if (!result) return <p className="meta delta-empty">Nada planejado ainda.</p>;
  const elements = result.changes.filter((c) => c.kind === 'element');
  const relations = result.changes.filter((c) => c.kind === 'relationship');
  const docs = result.changes.filter((c) => c.kind === 'doc');
  return (
    <div className="delta-panel">
      <p className="meta">{result.summary}</p>
      {!result.changes.length && <p className="meta">O delta não muda nada na base.</p>}
      {elements.length > 0 && (
        <section>
          <h3>Elementos ({elements.length})</h3>
          <ul aria-label="Elementos alterados">{elements.map((c) => <Change key={c.id} c={c} selected={c.id === selected} onPick={onPick} />)}</ul>
        </section>
      )}
      {relations.length > 0 && (
        <section>
          <h3>Relações ({relations.length})</h3>
          <ul aria-label="Relações alteradas">{relations.map((c) => <Change key={c.id} c={c} selected={!!selected && !!c.ends?.includes(selected)} />)}</ul>
        </section>
      )}
      {docs.length > 0 && (
        <section>
          <h3>Documentação ({docs.length})</h3>
          <ul aria-label="Documentação alterada">{docs.map((c) => <DocChange key={c.id} c={c} selected={c.id === selected} onPick={onPick} />)}</ul>
        </section>
      )}
      {result.questions.length > 0 && (
        <section>
          <h3>Perguntas abertas ({result.questions.length})</h3>
          <ul aria-label="Perguntas abertas" className="delta-questions">
            {result.questions.map((q) => <li key={q.key}>{q.question}{q.assumed ? <span className="meta"> · assumido: {q.assumed}</span> : null}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
