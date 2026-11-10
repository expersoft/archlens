import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LAYER_VAR } from './labels';
import { applyFormat, tocOf, type FormatKind } from './markdown-toc';
import { Markdown } from './plan/Markdown';

export interface DocWindowProps {
  title: string;
  /** Camada ArchiMate do nó, para a cor do cabeçalho; sem ela não há amostra de cor. */
  layer?: string;
  labels?: string[];
  text: string;
  editable: boolean;
  /** Texto de referência para "alterado" e para a pergunta de descarte (padrão: o texto ao abrir). */
  original?: string;
  busy?: boolean;
  /** Por que a última confirmação falhou: aparece no rodapé, na frente do que a janela cobre. */
  error?: string | null;
  onConfirm?: (text: string) => void;
  /** Cancelar (editável): quem abriu descarta a edição. Sem ela, Cancelar só fecha. */
  onCancel?: () => void;
  onClose: (text: string) => void;
}

type Mode = 'write' | 'split' | 'preview';
const MODES: [Mode, string][] = [['write', 'Escrever'], ['split', 'Lado a lado'], ['preview', 'Prévia']];
const TOOLS: [FormatKind, string, string][] = [
  ['h', 'Título', 'H'], ['b', 'Negrito', 'B'], ['i', 'Itálico', 'I'],
  ['ul', 'Lista', '•'], ['ol', 'Lista numerada', '1.'], ['quote', 'Citação', '❝'],
  ['code', 'Código', '</>'], ['link', 'Link', '🔗'], ['table', 'Tabela', '⊞'],
];
const FOCUSABLE = 'button:not([disabled]),textarea:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const DISCARD = 'Descartar a edição não confirmada?';

const lineOf = (text: string, pos: number) => {
  let n = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) n++;
  return n;
};

/** Janela ampliada da documentação: sumário, Escrever / Lado a lado / Prévia e, se editável, formatação. */
export function DocWindow({ title, layer, labels, text, editable, original, busy, error, onConfirm, onCancel, onClose }: DocWindowProps) {
  const [value, setValue] = useState(text);
  const [mode, setMode] = useState<Mode>(editable ? 'split' : 'preview');
  const [toc, setToc] = useState(true);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const prev = useRef<HTMLDivElement>(null);
  const scrollTo = useRef<number | null>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const base = original ?? text;
  const dirty = value !== base;
  const entries = useMemo(() => tocOf(value), [value]);
  // A prévia acompanha com 120 ms de atraso: renderizar o markdown de um documento grande a cada tecla travaria o sumário.
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 120);
    return () => clearTimeout(t);
  }, [value]);
  const current = useMemo(() => {
    let at = -1;
    entries.forEach((e, i) => { if (e.line <= cursor) at = i; });
    return at;
  }, [entries, cursor]);
  const lines = value === '' ? 0 : value.split('\n').length;
  const showEditor = editable && mode !== 'preview';
  const showPreview = !editable || mode !== 'write';

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    (area.current ?? root.current)?.focus();
    return () => back?.focus?.();
  }, []);
  useEffect(() => {
    if (scrollTo.current !== null && shown === value) { const i = scrollTo.current; scrollTo.current = null; scrollPreview(i); }
  });
  useEffect(() => {
    const s = pendingSel.current;
    if (s && area.current) { area.current.focus(); area.current.setSelectionRange(s.start, s.end); pendingSel.current = null; }
  });

  const scrollPreview = (i: number) => {
    const e = entries[i];
    const heads = prev.current?.querySelectorAll('h1,h2,h3');
    const h = heads && (heads.length === entries.length ? heads[i] : Array.from(heads).find((x) => x.textContent?.trim() === e?.title));
    (h as HTMLElement | undefined)?.scrollIntoView?.({ block: 'start' });
  };
  const goTo = (i: number) => {
    const e = entries[i];
    setCursor(e.line);
    const ta = area.current;
    if (ta) {
      const pos = value.split('\n').slice(0, e.line).reduce((n, l) => n + l.length + 1, 0);
      ta.setSelectionRange(pos, pos);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
      ta.scrollTop = e.line * lh;
    }
    // A prévia pode estar atrasada: atualiza já e rola depois que o DOM novo existir.
    if (shown === value) scrollPreview(i);
    else { scrollTo.current = i; setShown(value); }
  };
  const format = (kind: FormatKind) => {
    const ta = area.current;
    if (!ta) return;
    const r = applyFormat(value, { start: ta.selectionStart, end: ta.selectionEnd }, kind);
    pendingSel.current = r.sel;
    setValue(r.text);
    setCursor(lineOf(r.text, r.sel.start));
  };
  const confirm = () => { if (editable && dirty && !busy) onConfirm?.(value); };
  const cancel = () => {
    if (dirty && !window.confirm(DISCARD)) return;
    (onCancel ?? (() => onClose(value)))();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); onClose(value); return; }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); confirm(); return; }
    if (ev.key !== 'Tab' || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  };

  const lv = layer ? LAYER_VAR[layer] ?? 'oth' : null;
  const cls = ['doc-win-body', toc ? '' : 'no-toc', showEditor && showPreview ? 'two' : ''].filter(Boolean).join(' ');
  return (
    <div className="doc-win-veil" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(value); }}>
      <div className="doc-win" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={root} onKeyDown={onKey}>
        <div className="doc-win-h">
          {lv && <span className="doc-win-sw" style={{ background: `var(--${lv})`, borderColor: `var(--${lv}-s)` }} />}
          <b>{title}</b>
          {!!labels?.length && <span className="doc-win-m">{labels.join(' · ')}</span>}
          <button type="button" className="doc-win-x" aria-label="Fechar" onClick={() => onClose(value)}>✕</button>
        </div>
        <div className="doc-win-tb">
          <button type="button" aria-label="Sumário" aria-pressed={toc} className={toc ? 'on' : ''} onClick={() => setToc((v) => !v)}>☰</button>
          {editable && (
            <>
              <span className="doc-win-sep" />
              {TOOLS.map(([k, label, glyph]) => (
                <button key={k} type="button" aria-label={label} title={label} disabled={!showEditor} onClick={() => format(k)}>{glyph}</button>
              ))}
              <div role="tablist" className="doc-win-seg">
                {MODES.map(([m, label]) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setShown(value); setMode(m); }}>{label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className={cls}>
          {toc && (
            <nav className="doc-win-nav" aria-label="Sumário">
              <div className="doc-win-nav-t">Sumário</div>
              {entries.length === 0 && <div className="doc-win-none">Sem títulos</div>}
              {entries.map((e, i) => (
                <button key={i} type="button" className={`l${e.level}`} aria-current={i === current ? 'true' : undefined} onClick={() => goTo(i)}>{e.title}</button>
              ))}
            </nav>
          )}
          {showEditor && (
            <textarea
              ref={area}
              className="doc-win-ta"
              aria-label="Documentação"
              spellCheck={false}
              value={value}
              onChange={(ev) => { setValue(ev.target.value); setCursor(lineOf(ev.target.value, ev.target.selectionStart)); }}
              onSelect={(ev) => setCursor(lineOf(value, (ev.target as HTMLTextAreaElement).selectionStart))}
            />
          )}
          {showPreview && <div className="doc-win-pv" ref={prev}><Markdown text={shown} className="doc-text" /></div>}
        </div>
        <div className="doc-win-f">
          <span className="doc-win-m">markdown · {lines} linhas{editable && dirty ? ' · alterado' : ''}</span>
          <span className="doc-win-m">{editable ? 'Esc fecha · Ctrl+Enter confirma' : 'Esc fecha'}</span>
          {error && <p className="warn doc-win-err" role="alert">{error}</p>}
          {editable && (
            <span className="doc-win-act">
              <button type="button" onClick={cancel}>Cancelar</button>
              <button type="button" className="primary" disabled={!dirty || busy} onClick={confirm}>Confirmar</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
