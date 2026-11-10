import { useEffect, useState } from 'react';
import { getDoc } from './api';
import { DocWindow } from './DocWindow';
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
  /** Título, camada e rótulos da janela ampliada. */
  title?: string;
  layer?: string;
  labels?: string[];
}

/** A documentação do nó: lida ao abrir o cartão, sempre o texto atual. */
export function DocTab({ base, id, text, max, title, layer, labels }: DocTabProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState(false);
  const given = text !== undefined;
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
      {full && <DocWindow title={title ?? 'Documentação do nó'} layer={layer} labels={labels} text={body} editable={false} onClose={() => setFull(false)} />}
    </>
  );
}
