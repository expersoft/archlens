import type { ViewResult } from './api';

export type Step = {
  kind: 'Visão' | 'Menu' | 'Clique duplo' | 'Notação' | 'Explorador' | 'Busca' | 'Pergunta';
  label: string;
  view: ViewResult;
  ms: number;
  matrix?: boolean;
};

export type HistoryState = { steps: Step[]; cur: number; pending: number | null; error?: string };

export type HistoryAction =
  | { type: 'request'; ticket: number }
  | { type: 'loaded'; ticket: number; step: Step }
  | { type: 'failed'; ticket: number; error: string }
  | { type: 'settle'; ticket: number }
  | { type: 'go'; index: number }
  | { type: 'reset' };

export const initialHistory: HistoryState = { steps: [], cur: -1, pending: null };

export function reducer(state: HistoryState, a: HistoryAction): HistoryState {
  switch (a.type) {
    case 'request':
      return { ...state, pending: a.ticket, error: undefined };
    case 'loaded': {
      if (a.ticket !== state.pending) return state;
      const steps = [...state.steps.slice(0, state.cur + 1), a.step];
      return { steps, cur: steps.length - 1, pending: null };
    }
    case 'failed':
      if (a.ticket !== state.pending) return state;
      return { ...state, pending: null, error: a.error };
    case 'settle': // pedido que terminou sem passo novo (pergunta que só esclarece)
      return a.ticket === state.pending ? { ...state, pending: null } : state;
    case 'go':
      if (a.index < 0 || a.index >= state.steps.length) return state;
      // a escolha do usuário vence: uma resposta tardia não o tira deste passo
      return { ...state, cur: a.index, pending: null };
    case 'reset':
      return initialHistory;
  }
}
