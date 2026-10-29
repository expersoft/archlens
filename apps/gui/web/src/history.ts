import type { ViewResult } from './api';

export type Step = {
  kind: 'Visão' | 'Menu' | 'Clique duplo' | 'Notação' | 'Explorador' | 'Busca';
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
    case 'go':
      if (a.index < 0 || a.index >= state.steps.length) return state;
      return { ...state, cur: a.index };
    case 'reset':
      return initialHistory;
  }
}
