// Read-only adapter for the old single-file base: ARCHITECTURE.md with the archlens-json block (or a raw model .json).
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { extractModel, NOTE_NAMES, noteDefaults } from '../doc.mjs';
import { storeError } from './errors.mjs';

const KEEP_RE = /<!-- keep:([\w-]+) -->\n?([\s\S]*?)\n?<!-- \/keep:\1 -->/g;

export function readKeepBlocks(markdown) {
  return new Map([...markdown.matchAll(KEEP_RE)].map(m => [m[1], m[2]]));
}

export function loadLegacy(path) {
  const text = readFileSync(path, 'utf8');
  if (extname(path).toLowerCase() !== '.md') {
    try { return { raw: JSON.parse(text), keeps: new Map() }; } catch (e) {
      throw storeError('E_STORE_JSON', `${path}: JSON inválido: ${e.message}`, { file: path });
    }
  }
  try { return { raw: extractModel(text), keeps: readKeepBlocks(text) }; } catch (e) {
    throw storeError(e.code === 'E_MODEL_JSON' ? 'E_STORE_JSON' : 'E_STORE_NOT_BASE', e.message, { file: path });
  }
}

/** keep blocks → notes, leaving out the ones that only repeat what the document shows by default. */
export function legacyNotes(raw, keeps) {
  const defaults = noteDefaults(raw);
  const notes = {};
  for (const name of NOTE_NAMES) {
    const t = keeps.get(name);
    if (t != null && t.trim() !== defaults[name].trim()) notes[name] = t;
  }
  return notes;
}
