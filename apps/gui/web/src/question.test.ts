import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from './question';

describe('looksLikeQuestion', () => {
  it('nome de elemento não é pergunta', () => {
    expect(looksLikeQuestion('API de Pedidos')).toBe(false);
    expect(looksLikeQuestion('checkout')).toBe(false);
  });
  it('quatro palavras, interrogação ou verbo de pergunta', () => {
    expect(looksLikeQuestion('o que sustenta o checkout')).toBe(true);
    expect(looksLikeQuestion('Quem consome?')).toBe(true);
    expect(looksLikeQuestion('Me fale de pedidos.')).toBe(true);
    expect(looksLikeQuestion('Por quê')).toBe(true);
    expect(looksLikeQuestion('QUAIS sistemas')).toBe(true);
  });
});
