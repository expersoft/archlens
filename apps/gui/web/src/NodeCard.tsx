import { useEffect, type ReactNode } from 'react';
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
  /** Fica aberto e não recolhe (um editor aberto no cartão); ao forçar, o cartão passa a ser lembrado aberto. */
  forceOpen?: boolean;
  children: ReactNode;
}

/** Cartão recolhível do painel do nó. O conteúdo só é montado com o cartão aberto. */
export function NodeCard({ id, title, count, actions, badge, defaultOpen = true, forceOpen = false, children }: NodeCardProps) {
  // Uma chave por cartão: cada um lê e grava só a sua, sem sobrescrever o estado dos outros.
  const [saved, setSaved] = useStoredState<boolean | null>(`archlens-node-card:${id}`, null);
  const open = forceOpen || (saved ?? defaultOpen);
  useEffect(() => { if (forceOpen) setSaved(true); }, [forceOpen, setSaved]);
  return (
    <section className="np-card" data-card={id}>
      <div className="np-card-h">
        <button type="button" className="np-toggle" aria-expanded={open} disabled={forceOpen} title={forceOpen ? 'Confirme ou cancele a edição para recolher' : undefined} onClick={() => setSaved(!open)}>
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
