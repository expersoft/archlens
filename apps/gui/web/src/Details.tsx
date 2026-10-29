import type { Card, RelRef, ViewEdge, ViewNode } from './api';

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
}

const ROLES: Record<string, string> = {
  supporter: 'Suporte', dependent: 'Dependente', both: 'Suporte e dependente', anchor: 'Âncora',
};

export function Details({ card, viewNode, viewEdges, nodeId, onPick, onSelectInView, onGlossary }: DetailsProps) {
  if (!nodeId) return <div className="dp muted">Selecione um elemento no diagrama ou no Explorador.</div>;
  const e = card?.element;
  const rels = viewNode ? viewEdges.filter((x) => x.from === nodeId || x.to === nodeId) : [];
  const relList = (groups: Record<string, RelRef[]> | undefined) =>
    Object.entries(groups ?? {}).flatMap(([t, l]) => l.map((r) => (
      <li key={t + r.id} className="go" onClick={() => onPick(r.id)}>
        {r.sentence ?? `${t}: ${r.name}`}{r.technology && <span className="chip">{r.technology}</span>}
      </li>
    )));

  return (
    <div className="dp">
      <h2>{viewNode?.name ?? e?.name ?? nodeId}</h2>
      {viewNode && (
        <section>
          <div className="tag">Nesta visão</div>
          <div className="kind">
            {viewNode.c4Label ? `${viewNode.c4Label} · ` : ''}ArchiMate {viewNode.typeLabel}
          </div>
          {viewNode.description && <p>{viewNode.description}</p>}
          <dl>
            {viewNode.technology && <><dt>Tecnologia</dt><dd><span className="chip">{viewNode.technology}</span></dd></>}
            {viewNode.layer && <><dt>Camada</dt><dd>{viewNode.layer}</dd></>}
            {viewNode.role && <><dt>Papel</dt><dd>{ROLES[viewNode.role] ?? viewNode.role}</dd></>}
            {viewNode.distance != null && <><dt>Distância</dt><dd>{viewNode.distance}</dd></>}
          </dl>
          <h3>Relações na visão</h3>
          <ul>
            {rels.map((r) => {
              const other = r.from === nodeId ? r.to : r.from;
              return (
                <li key={r.id} className="go" onClick={() => onSelectInView(other)}>
                  {r.help?.sentence ?? `${r.type}: ${r.from} → ${r.to}`}
                  {r.technology && <span className="chip">{r.technology}</span>}
                </li>
              );
            })}
            {rels.length === 0 && <li className="muted">Nenhuma relação na visão.</li>}
          </ul>
          <button type="button" className="linkish" onClick={onGlossary}>Como ler as relações?</button>
        </section>
      )}
      {card && e && (
        <section className={viewNode ? 'sec' : undefined}>
          {viewNode ? <div className="tag">Na base</div> : (
            <>
              <div className="kind">{e.kind ? `${e.kind} · ` : ''}{e.type}</div>
              {e.description && <p>{e.description}</p>}
              {e.technology && <p><span className="chip">{e.technology}</span></p>}
            </>
          )}
          <dl>
            {!!e.aliases?.length && <><dt>Apelidos</dt><dd>{e.aliases.join(', ')}</dd></>}
            {card.parent && <><dt>Pai</dt><dd className="go" onClick={() => onPick(card.parent!.id)}>{card.parent.name}</dd></>}
            <dt>Id</dt><dd><code>{e.id}</code></dd>
            {e.status && <><dt>Status</dt><dd>{e.status}</dd></>}
          </dl>
          {!viewNode && (relList(card.outgoing).length + relList(card.incoming).length > 0) && (
            <><h3>Relações</h3><ul>{relList(card.outgoing)}{relList(card.incoming)}</ul></>
          )}
          {card.children.length > 0 && (
            <><h3>Filhos</h3><ul>{card.children.map((c) => <li key={c.id} className="go" onClick={() => onPick(c.id)}>{c.name}</li>)}</ul></>
          )}
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
        </section>
      )}
    </div>
  );
}
