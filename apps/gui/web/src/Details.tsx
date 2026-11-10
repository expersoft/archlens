import { Fragment, useState, type ReactNode } from 'react';
import type { Card, RelRef, ViewEdge, ViewNode } from './api';
import { DocTab } from './DocTab';
import { layerLabel } from './labels';
import { NodeCard } from './NodeCard';

export interface DetailsProps {
  card: Card | null;
  /** O nó na visão atual, ou null quando o elemento não está nela. */
  viewNode: ViewNode | null;
  viewEdges: ViewEdge[];
  nodeId: string | null;
  onPick: (id: string) => void;
  /** Seleciona na visão (e no diagrama) o outro nó de uma relação. */
  onSelectInView: (id: string) => void;
  onGlossary: () => void;
  base?: string | null;
  /** A base guarda documentação dos nós: mostra o cartão Documentação. */
  docsEnabled?: boolean;
  /** Camada ArchiMate do nó, para a cor do cabeçalho; sem ela vem do nó na visão ou do cartão. */
  layer?: string;
  /** O Planejar troca o conteúdo dos cartões Propriedades e Documentação pelos editores. */
  slots?: { properties?: ReactNode; doc?: ReactNode };
  /** Botões na barra de título dos cartões editáveis (o Planejar põe "✎ Editar"). */
  actions?: { properties?: ReactNode; doc?: ReactNode };
  /** O cartão com um editor aberto: fica aberto e não recolhe (o texto não confirmado não some). */
  editing?: 'properties' | 'doc' | null;
}

const ROLES: Record<string, string> = {
  supporter: 'Suporte', dependent: 'Dependente', both: 'Suporte e dependente', anchor: 'Âncora',
};
/** Variável de cor do diagrama para cada camada (as mesmas do render.mjs). */
const LAYER_VAR: Record<string, string> = {
  business: 'biz', application: 'app', technology: 'tech', physical: 'tech', motivation: 'mot',
  strategy: 'str', implementation: 'impl', other: 'oth',
};
const CAP = 5;

/** Lista que mostra 5 itens e "Mostrar mais N". */
function Capped({ items, empty }: { items: ReactNode[]; empty?: string }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  const shown = all ? items : items.slice(0, CAP);
  return (
    <>
      <ul>{shown}</ul>
      {items.length > CAP && (
        <button type="button" className="linkish" onClick={() => setAll((v) => !v)}>
          {all ? 'Mostrar menos' : `Mostrar mais ${items.length - CAP}`}
        </button>
      )}
    </>
  );
}

export function Details({ card, viewNode, viewEdges, nodeId, onPick, onSelectInView, onGlossary, base, docsEnabled, layer, slots, actions, editing }: DetailsProps) {
  if (!nodeId) return <div className="dp muted">Selecione um elemento no diagrama ou no Explorador.</div>;
  const e = card?.element;
  const rels = viewNode ? viewEdges.filter((x) => x.from === nodeId || x.to === nodeId) : [];
  const relList = (dir: 'out' | 'in', groups: Record<string, RelRef[]> | undefined) =>
    Object.entries(groups ?? {}).flatMap(([t, l]) => l.map((r, i) => (
      <li key={`${dir}:${t}:${r.id}:${i}`} className="go" onClick={() => onPick(r.id)}>
        {r.sentence ?? `${t}: ${r.name}`}{r.technology && <span className="chip">{r.technology}</span>}
      </li>
    )));
  const props = Object.entries(card?.properties ?? {});
  const baseRels = card && !viewNode ? [...relList('out', card.outgoing), ...relList('in', card.incoming)] : [];
  const showDoc = !!docsEnabled && !!base;
  const lv = LAYER_VAR[layer ?? viewNode?.layer ?? e?.layer ?? 'other'] ?? 'oth';
  const c4 = viewNode?.c4Label ?? e?.c4Label;
  const typeLabel = viewNode?.typeLabel ?? e?.typeLabel ?? e?.type;
  const description = viewNode?.description ?? e?.description;
  const relItems = rels.map((r) => {
    const other = r.from === nodeId ? r.to : r.from;
    return (
      <li key={r.id} className="go" onClick={() => onSelectInView(other)}>
        {r.help?.sentence ?? `${r.type}: ${r.from} → ${r.to}`}
        {r.technology && <span className="chip">{r.technology}</span>}
      </li>
    );
  });

  return (
    <div className="dp">
      <header className="np-head" style={{ background: `var(--${lv})`, borderBottom: `3px solid var(--${lv}-s)` }}>
        <h2>{viewNode?.name ?? e?.name ?? nodeId}</h2>
        <div className="np-chips">
          {c4 && <span className="np-chip">{c4}</span>}
          {typeLabel && <span className="np-chip">ArchiMate {typeLabel}</span>}
        </div>
        {description && <p>{description}</p>}
      </header>
      <div className="np-cards" key={nodeId}>
        {(props.length > 0 || slots?.properties) && (
          <NodeCard id="properties" title="Propriedades" count={props.length} actions={actions?.properties} forceOpen={editing === 'properties'}>
            {slots?.properties ?? (
              <dl>{props.map(([k, v]) => (
                <Fragment key={k}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></Fragment>
              ))}</dl>
            )}
          </NodeCard>
        )}
        {showDoc && (
          <NodeCard id="doc" title="Documentação" actions={actions?.doc} forceOpen={editing === 'doc'}>
            {slots?.doc ?? <DocTab base={base!} id={nodeId} max />}
          </NodeCard>
        )}
        {viewNode && (
          <NodeCard id="in-view" title="Nesta visão">
            <dl>
              {viewNode.technology && <><dt>Tecnologia</dt><dd><span className="chip">{viewNode.technology}</span></dd></>}
              {viewNode.layer && <><dt>Camada</dt><dd>{layerLabel(viewNode.layer)}</dd></>}
              {viewNode.role && <><dt>Papel</dt><dd>{ROLES[viewNode.role] ?? viewNode.role}</dd></>}
              {viewNode.distance != null && <><dt>Distância</dt><dd>{viewNode.distance}</dd></>}
            </dl>
          </NodeCard>
        )}
        {viewNode && (
          <NodeCard id="view-rels" title="Relações na visão" count={relItems.length}>
            <Capped items={relItems} empty="Nenhuma relação na visão." />
            <button type="button" className="linkish" onClick={onGlossary}>Como ler as relações?</button>
          </NodeCard>
        )}
        {!viewNode && baseRels.length > 0 && (
          <NodeCard id="base-rels" title="Relações" count={baseRels.length}>
            <Capped items={baseRels} />
          </NodeCard>
        )}
        {card && e && (
          <NodeCard id="base" title="Na base" defaultOpen={false}>
            {!viewNode && e.technology && <p><span className="chip">{e.technology}</span></p>}
            <dl>
              {!!e.aliases?.length && <><dt>Apelidos</dt><dd>{e.aliases.join(', ')}</dd></>}
              {card.parent && <><dt>Pai</dt><dd className="go" onClick={() => onPick(card.parent!.id)}>{card.parent.name}</dd></>}
              <dt>Id</dt><dd><code>{e.id}</code></dd>
              {e.status && <><dt>Status</dt><dd>{e.status}</dd></>}
            </dl>
          </NodeCard>
        )}
        {card && card.children.length > 0 && (
          <NodeCard id="children" title="Filhos" count={card.children.length} defaultOpen={false}>
            <Capped items={card.children.map((c) => <li key={c.id} className="go" onClick={() => onPick(c.id)}>{c.name}</li>)} />
          </NodeCard>
        )}
        {card && (!!card.sources?.length || !!card.rounds?.length) && (
          <NodeCard id="sources" title="Fontes e rodadas" count={(card.sources?.length ?? 0) + (card.rounds?.length ?? 0)} defaultOpen={false}>
            {!!card.sources?.length && (
              <><h3>Fontes</h3><ul>{card.sources.map((s, i) => (
                <li key={i}>{s.kind ?? ''}{s.ref ? `: ${s.ref}` : ''}{s.excerpt && <> <span className="muted">“{s.excerpt}”</span></>}</li>
              ))}</ul></>
            )}
            {!!card.rounds?.length && (
              <><h3>Rodadas</h3><ul>{card.rounds.map((r, i) => (
                <li key={i}><b>{r.date ?? r.id ?? ''}</b> {r.summary ?? ''}{(r.how ?? []).map((h) => <span className="chip" key={h}>{h}</span>)}</li>
              ))}</ul></>
            )}
          </NodeCard>
        )}
      </div>
    </div>
  );
}
