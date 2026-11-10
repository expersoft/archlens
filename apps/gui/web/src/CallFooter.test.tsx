import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallFooter, callText } from './CallFooter';

const startedAt = new Date(2026, 10, 5, 14, 32, 5).getTime();
const endedAt = startedAt + 36200;

describe('CallFooter', () => {
  it('mostra início, fim, duração e tokens com entrada, saída e cache', () => {
    const text = callText({ startedAt, endedAt, usage: { input: 12000, output: 340, cacheRead: 8000 } });
    expect(text).toBe('14:32:05 → 14:32:41 · 36,2 s · 12.340 tokens (entrada 12.000, saída 340, cache 8.000)');
  });

  it('omite o cache quando o provedor não informa leitura', () => {
    expect(callText({ startedAt, endedAt, usage: { input: 10, output: 5, cacheRead: 0 } })).toContain('15 tokens (entrada 10, saída 5)');
  });

  it('sem uso informado, fica só o horário', () => {
    expect(callText({ startedAt, endedAt })).toBe('14:32:05 → 14:32:41 · 36,2 s');
  });

  it('a data completa fica na dica do rodapé', () => {
    render(<CallFooter call={{ startedAt, endedAt }} />);
    expect(screen.getByText(/14:32:05 →/).getAttribute('title')).toContain('05/11/2026');
  });
});
