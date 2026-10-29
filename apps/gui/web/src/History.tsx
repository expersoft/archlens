import type { Step } from './history';

export interface HistoryProps {
  steps: Step[];
  cur: number;
  onGo: (i: number) => void;
}

const total = (s: Step) => Math.round(s.ms);

export function History({ steps, cur, onGo }: HistoryProps) {
  if (steps.length === 0) return <div className="ph">Sem histórico</div>;
  const count = (s: Step) => (Array.isArray(s.view.nodes) ? s.view.nodes.length : 0);
  return (
    <ol className="history" aria-label="Histórico">
      {steps.map((s, i) => (
        <li key={i}>
          <button type="button" className={i === cur ? 'on' : ''} aria-current={i === cur ? 'step' : undefined} onClick={() => onGo(i)}>
            <span className="k">{s.kind}</span>
            <span className="l">{s.label}</span>
            <span className="m">{s.view.title} · {count(s)} nós · {total(s)} ms</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
