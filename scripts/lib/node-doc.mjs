// The documentation of a node: the text people write after the archlens block of its page. It travels apart from the
// model (read().docs, op putDoc), never in raw. Pure.
import { createHash } from 'node:crypto';
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
