import { useEffect, useState } from 'react';
import { getDoc } from './api';
import { Markdown } from './plan/Markdown';

type Loaded = { id: string; text: string | null; error?: undefined } | { id: string; error: string };

const EMPTY = 'Este nó ainda não tem documentação. Peça no Planejar, use a skill archlens-plan ou escreva no markdown, depois do bloco do archlens.';

/** A documentação do nó: lida ao abrir a aba, sempre o texto atual. */
export function DocTab({ base, id }: { base: string; id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let stale = false;
    getDoc(base, id)
      .then((d) => { if (!stale) setLoaded({ id, text: d.text }); })
      .catch((e: Error) => { if (!stale) setLoaded({ id, error: e.message }); });
    return () => { stale = true; };
  }, [base, id]);

  // O que chegou para outro nó não aparece neste, nem por um instante.
  if (loaded?.id !== id) return <p className="muted">Carregando…</p>;
  if (loaded.error !== undefined) return <p className="err">Não consegui ler a documentação: {loaded.error}</p>;
  if (!loaded.text) return <p className="muted">{EMPTY}</p>;
  return <Markdown text={loaded.text} className="doc-text" />;
}
