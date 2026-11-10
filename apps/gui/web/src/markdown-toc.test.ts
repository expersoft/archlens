import { describe, expect, it } from 'vitest';
import { applyFormat, tocOf } from './markdown-toc';

describe('markdown-toc', () => {
  it('tocOf lê #, ## e ### e ignora títulos dentro de código', () => {
    const t = '# Um\ntexto\n## Dois\n```\n# não é título\n```\n### Três\n#### quatro\n#sem espaço';
    expect(tocOf(t)).toEqual([
      { level: 1, title: 'Um', line: 0 },
      { level: 2, title: 'Dois', line: 2 },
      { level: 3, title: 'Três', line: 6 },
    ]);
  });

  it('applyFormat b envolve a seleção em ** e mantém a seleção no texto', () => {
    const r = applyFormat('um dois tres', { start: 3, end: 7 }, 'b');
    expect(r.text).toBe('um **dois** tres');
    expect(r.text.slice(r.sel.start, r.sel.end)).toBe('dois');
  });

  it('applyFormat i, code e link', () => {
    expect(applyFormat('ab', { start: 0, end: 2 }, 'i').text).toBe('*ab*');
    expect(applyFormat('ab', { start: 0, end: 2 }, 'code').text).toBe('`ab`');
    expect(applyFormat('a\nb', { start: 0, end: 3 }, 'code').text).toBe('```\na\nb\n```');
    const l = applyFormat('ver doc', { start: 4, end: 7 }, 'link');
    expect(l.text).toBe('ver [doc](url)');
    expect(l.text.slice(l.sel.start, l.sel.end)).toBe('url');
  });

  it('applyFormat prefixa as linhas tocadas: h, ul, ol, quote', () => {
    expect(applyFormat('a\nb\nc', { start: 2, end: 2 }, 'h').text).toBe('a\n## b\nc');
    expect(applyFormat('a\nb\nc', { start: 0, end: 3 }, 'ul').text).toBe('- a\n- b\nc');
    expect(applyFormat('a\nb', { start: 0, end: 3 }, 'ol').text).toBe('1. a\n2. b');
    expect(applyFormat('a', { start: 0, end: 1 }, 'quote').text).toBe('> a');
  });

  it('applyFormat table insere uma tabela 2x2', () => {
    const r = applyFormat('x', { start: 1, end: 1 }, 'table');
    expect(r.text).toBe('x\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n| valor | valor |');
  });

  it('applyFormat no início do documento, mesmo com linha vazia primeiro', () => {
    expect(applyFormat('\nb', { start: 0, end: 0 }, 'ul').text).toBe('- \nb');
    expect(applyFormat('a', { start: 0, end: 0 }, 'h').text).toBe('## a');
  });

  it('applyFormat h troca o prefixo de um título em vez de empilhar', () => {
    const r = applyFormat('### Título', { start: 4, end: 6 }, 'h');
    expect(r.text).toBe('## Título');
    expect(r.text.slice(r.sel.start, r.sel.end)).toBe('Tí');
    expect(applyFormat('# A\nb', { start: 0, end: 5 }, 'h').text).toBe('## A\n## b');
  });
});
