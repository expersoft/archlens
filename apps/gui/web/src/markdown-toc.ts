export interface TocEntry { level: 1 | 2 | 3; title: string; /** Linha do título (0 = primeira). */ line: number }

const HEADING = /^ {0,3}(#{1,3})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(```+|~~~+)/;

/** Títulos #, ## e ### do texto, ignorando o que está em blocos de código cercados. */
export function tocOf(text: string): TocEntry[] {
  const out: TocEntry[] = [];
  let fence: string | null = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = HEADING.exec(lines[i]);
    if (m) out.push({ level: m[1].length as 1 | 2 | 3, title: m[2].trim(), line: i });
  }
  return out;
}

export type FormatKind = 'h' | 'b' | 'i' | 'ul' | 'ol' | 'quote' | 'code' | 'link' | 'table';
export interface Sel { start: number; end: number }

const TABLE = '| Coluna 1 | Coluna 2 |\n| --- | --- |\n| valor | valor |';

/** Aplica um formato markdown à seleção e devolve o texto novo e a seleção que o editor deve ter. */
export function applyFormat(text: string, sel: Sel, kind: FormatKind): { text: string; sel: Sel } {
  const { start, end } = sel;
  const picked = text.slice(start, end);
  const wrap = (mark: string) => ({
    text: text.slice(0, start) + mark + picked + mark + text.slice(end),
    sel: { start: start + mark.length, end: end + mark.length },
  });
  if (kind === 'b') return wrap('**');
  if (kind === 'i') return wrap('*');
  if (kind === 'code') {
    if (!picked.includes('\n')) return wrap('`');
    const head = '```\n';
    return {
      text: `${text.slice(0, start)}${head}${picked}\n\`\`\`${text.slice(end)}`,
      sel: { start: start + head.length, end: end + head.length },
    };
  }
  if (kind === 'link') {
    const label = picked || 'texto';
    const before = text.slice(0, start) + '[' + label + '](';
    return { text: `${before}url)${text.slice(end)}`, sel: { start: before.length, end: before.length + 3 } };
  }
  if (kind === 'table') {
    const lead = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
    const ins = lead + TABLE;
    return { text: text.slice(0, start) + ins + text.slice(end), sel: { start: start + lead.length, end: start + ins.length } };
  }
  // h, ul, ol, quote: prefixo em cada linha tocada pela seleção.
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const stop = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  const to = stop === -1 ? text.length : stop;
  const lines = text.slice(from, to).split('\n');
  const prefix = (n: number) => (kind === 'h' ? '## ' : kind === 'ul' ? '- ' : kind === 'ol' ? `${n + 1}. ` : '> ');
  const next = lines.map((l, n) => prefix(n) + l);
  const added = next.join('\n').length - lines.join('\n').length;
  return {
    text: text.slice(0, from) + next.join('\n') + text.slice(to),
    sel: { start: start + prefix(0).length, end: end + added },
  };
}
