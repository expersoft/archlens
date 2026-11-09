import { useEffect, useRef, useState } from 'react';
import { getDoc } from './api';
import { Markdown } from './plan/Markdown';

type Loaded = { id: string; text: string | null; error?: undefined } | { id: string; error: string };

const EMPTY = 'Este nó ainda não tem documentação. Peça no Planejar, use a skill archlens-plan ou escreva no markdown, depois do bloco do archlens.';

export interface DocTabProps {
  base: string;
  id: string;
  /** Texto já em mãos (null = sem documentação): quando dado, não busca. */
  text?: string | null;
  /** Corta a altura e oferece "Expandir" e "Tela cheia". */
  max?: boolean;
}

/** A documentação do nó: lida ao abrir o cartão, sempre o texto atual. */
export function DocTab({ base, id, text, max }: DocTabProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState(false);
  const given = text !== undefined;
  const fullRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!full) return undefined;
    fullRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full]);

  useEffect(() => {
    if (given) return undefined;
    let stale = false;
    getDoc(base, id)
      .then((d) => { if (!stale) setLoaded({ id, text: d.text }); })
      .catch((e: Error) => { if (!stale) setLoaded({ id, error: e.message }); });
    return () => { stale = true; };
  }, [base, id, given]);

  let body: string | null;
  if (given) body = text;
  else {
    // O que chegou para outro nó não aparece neste, nem por um instante.
    if (loaded?.id !== id) return <p className="muted">Carregando…</p>;
    if (loaded.error !== undefined) return <p className="err">Não consegui ler a documentação: {loaded.error}</p>;
    body = loaded.text;
  }
  if (!body) return <p className="muted">{EMPTY}</p>;
  if (!max) return <Markdown text={body} className="doc-text" />;
  return (
    <>
      <div className={expanded ? 'doc-box open' : 'doc-box'}>
        <Markdown text={body} className="doc-text" />
      </div>
      <div className="doc-more">
        <button type="button" className="linkish" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>{expanded ? 'Recolher' : 'Expandir'}</button>
        <button type="button" className="linkish" onClick={() => setFull(true)}>Tela cheia</button>
      </div>
      {full && (
        <div className="doc-full" role="dialog" aria-modal="true" aria-label="Documentação em tela cheia" tabIndex={-1} ref={fullRef}>
          <div className="doc-full-bar"><button type="button" onClick={() => setFull(false)}>Fechar</button></div>
          <Markdown text={body} className="doc-text" />
        </div>
      )}
    </>
  );
}
