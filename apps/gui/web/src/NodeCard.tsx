import type { ReactNode } from 'react';
import { useStoredState } from './store';

export interface NodeCardProps {
  /** Chave do cartão: o estado aberto/fechado é lembrado por ela, igual para todos os nós. */
  id: string;
  title: string;
  count?: number;
  /** Botões na barra do título (por exemplo, "✎ Editar"); não recolhem o cartão. */
  actions?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Cartão recolhível do painel do nó. O conteúdo só é montado com o cartão aberto. */
export function NodeCard({ id, title, count, actions, badge, defaultOpen = true, children }: NodeCardProps) {
  const [states, setStates] = useStoredState<Record<string, boolean>>('archlens-node-cards', {});
  const open = states[id] ?? defaultOpen;
  return (
    <section className="np-card" data-card={id}>
      <div className="np-card-h">
        <button type="button" className="np-toggle" aria-expanded={open} onClick={() => setStates((s) => ({ ...s, [id]: !open }))}>
          <span className="np-tw" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="np-title">{title}</span>
          {count != null && <span className="np-count">{count}</span>}
        </button>
        {badge}
        <span className="np-sp" />
        {actions}
      </div>
      {open && <div className="np-card-b">{children}</div>}
    </section>
  );
}
