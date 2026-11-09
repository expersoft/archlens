import { useEffect, useState } from 'react';
import { planElement, type Draft, type PlanElement, type ScreenConflict } from '../api';
import { Details } from '../Details';
import { DocTab } from '../DocTab';

export interface NodePanelProps {
  base: string;
  draft: Draft | null;
  /** O nó selecionado na prévia; null sem seleção. */
  id: string | null;
  /** Uma edição da tela devolveu um rascunho novo (usado pelo editor do nó). */
  onDraft: (draft: Draft, opsHash: string | null, conflicts: ScreenConflict[]) => void;
  /** Vai para outro nó (um clique em pai, filho ou relação). */
  onPick?: (id: string) => void;
}

type Loaded = { draft: Draft; id: string; el: PlanElement } | { draft: Draft; id: string; error: string };

/** A aba Nó do Planejar: o nó como o rascunho o deixa, com os mesmos cartões da tela Navegar. */
export function NodePanel({ base, draft, id, onPick }: NodePanelProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!id || !draft) return undefined;
    let stale = false;
    planElement(base, draft, id).then(
      (el) => { if (!stale) setLoaded({ draft, id, el }); },
      (e: unknown) => { if (!stale) setLoaded({ draft, id, error: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { stale = true; };
  }, [base, draft, id]);

  if (!id || !draft) return <p className="meta delta-empty">Selecione um nó na prévia ou no Delta.</p>;
  // Never shows the answer of another node; the previous draft's answer of the same node stays until the new one comes.
  const cur = loaded && loaded.id === id ? loaded : null;
  if (!cur) return <p className="meta delta-empty">Carregando…</p>;
  if ('error' in cur) return <p className="warn" role="alert">{cur.error}</p>;
  const { el } = cur;
  return (
    <div className="node-panel">
      {el.removed && <p className="warn node-removed" role="status">Este nó é removido pelo rascunho.</p>}
      <Details
        card={el.card}
        viewNode={null}
        viewEdges={[]}
        nodeId={id}
        onPick={(x) => onPick?.(x)}
        onSelectInView={(x) => onPick?.(x)}
        onGlossary={() => {}}
        base={base}
        docsEnabled={el.docs}
        layer={el.card.element.layer}
        slots={el.docs ? { doc: <DocTab base={base} id={id} text={el.doc} max /> } : undefined}
      />
    </div>
  );
}
