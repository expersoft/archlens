// The documentation of a node: the text people write after the archlens block of its page. It travels apart from the
// model (read().docs, op putDoc), never in raw. Pure.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { BEGIN, END } from './store/markdown-page.mjs';
import { storeError } from './store/errors.mjs';

/** Version of a text: what a person sees, so spaces around it do not count. */
export const docHash = text => `sha256:${createHash('sha256').update(text.trim()).digest('hex')}`;

/** Refuses a text holding a marker of the archlens block: the page would read back as something else. */
export function checkDocText(text, id) {
  for (const marker of [BEGIN, END]) {
    if (text.includes(marker)) throw storeError('E_DELTA_DOC', `a documentação de "${id}" contém o marcador ${marker}, que delimita o bloco do archlens na página`);
  }
}

/** The documentation in the text after the archlens block of a page ('' when there is none). */
export const docOfUserText = userText => (userText ?? '').trim();

/** The text after the archlens block of a page holding `text`. */
export function userTextOfDoc(text) {
  const doc = text.trim();
  return doc ? `\n\n${doc}\n` : '\n';
}

/** The text of `id` in `docs` (id → text), null when it has none; an id may be named after a member of Object. */
export const docOf = (docs, id) => (docs && Object.hasOwn(docs, id) ? docs[id] : null);

const linesOf = text => (text.trim() ? text.trim().split(/\r?\n/) : []);

/** The line by line difference between two texts (longest common subsequence), a removed line before the one that takes its place. */
export function lineDiff(before, after) {
  const a = linesOf(before), b = linesOf(after);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ sign: ' ', line: a[i] }); i++; j++; }
    else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push({ sign: '-', line: a[i++] });
    else out.push({ sign: '+', line: b[j++] });
  }
  return out;
}

/** `[[a/b|Nome]]` reads as `Nome`, `[[a/b]]` as `b`: outside Obsidian a wikilink is only a name. */
export const plainWikilinks = text => text.replace(/\[\[([^\]|\n]*?)(?:\|([^\]\n]*))?\]\]/g, (_, target, label) => label ?? target.split('/').pop());

/** Pushes the headings of `text` `by` levels down (up to ######), leaving fenced code alone. */
export function demoteHeadings(text, by) {
  let fence = null;
  return text.split('\n').map(line => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return line;
    }
    if (fence) return line;
    const h = /^( {0,3})(#{1,6})(?=\s|$)/.exec(line);
    return h ? `${h[1]}${'#'.repeat(Math.min(6, h[2].length + by))}${line.slice(h[0].length)}` : line;
  }).join('\n');
}

let md;
const renderer = () => {
  if (md) return md;
  // vendored as .cjs: the package is "type": "module"
  const MarkdownIt = createRequire(import.meta.url)('../vendor/markdown-it.min.cjs');
  md = new MarkdownIt({ html: false, linkify: false });
  const open = md.renderer.rules.link_open ?? ((tokens, i, options, env, self) => self.renderToken(tokens, i, options));
  md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    tokens[i].attrSet('target', '_blank');
    tokens[i].attrSet('rel', 'noopener noreferrer');
    return open(tokens, i, options, env, self);
  };
  return md;
};

/** The HTML of a documentation text: raw HTML in it is escaped, unsafe link schemes are not linked. */
export const docToHtml = text => renderer().render(plainWikilinks(text));
