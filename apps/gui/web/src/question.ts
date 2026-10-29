import type { AskResult, ViewAnswer, ViewResult } from './api';

const PREFIX = /^(o que|quem|qual|quais|como|onde|por que|mostre|me fale|liste)\b/;

/** Heurística da busca do topo: parece uma pergunta (e não um nome de elemento)? */
export function looksLikeQuestion(q: string): boolean {
  const t = q.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!t) return false;
  return t.endsWith('?') || t.split(/\s+/).length >= 4 || PREFIX.test(t);
}

/** Uma pergunta na conversa. */
export type Turn = {
  id: number;
  question: string;
  stage?: string;
  status: 'running' | 'done' | 'error' | 'canceled';
  result?: AskResult;
  answer?: ViewAnswer;
  markdown?: string;
  warning?: string;
  error?: string;
  ms?: number;
  view?: ViewResult;
};
