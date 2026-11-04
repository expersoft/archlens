// Writing a base and its document: a final plan applied and ARCHITECTURE.md regenerated, the interpretation notes, and
// the refusal to replace a document the base does not own. What "archlens apply" and "doc" do, as functions.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { generateDoc, NOTE_NAMES } from './doc.mjs';
import { apply as applyPlan, isFinal } from './api.mjs';
import { frontmatterSource, assertWritable, storeError } from './store/index.mjs';
import { contentVersion } from './store/ops.mjs';

const relPath = p => relative(process.cwd(), p) || '.';

function atomicWrite(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/** The `source:` value of the document at `out`: the folder base relative to it, with a trailing slash. */
export const docSource = (store, out = store.locator.docPath) =>
  `${relative(dirname(resolve(out)), store.locator.path).split(sep).join('/') || '.'}/`;

/**
 * Refuses (E_STORE_DOC_FOREIGN) to replace a document this base does not own: `out` may be missing, generated from this
 * base (its `source:` points to the folder), or the file being converted (`replacing`, e.g. the old .md migrate read).
 */
export function assertDocOwned(store, out = store.locator.docPath, { replacing } = {}) {
  const p = resolve(out);
  if (!existsSync(p) || (replacing && resolve(replacing) === p)) return;
  const src = frontmatterSource(readFileSync(p, 'utf8'));
  if (src && resolve(dirname(p), src) === resolve(store.locator.path)) return;
  throw storeError('E_STORE_DOC_FOREIGN', `${relPath(p)} existe e não foi gerado por esta base (sem "source:" apontando para ${relPath(store.locator.path)}/); `
    + 'mova-o, gere em outro lugar com --out, ou transforme o conteúdo dele em um delta (texto livre) antes.');
}

/** Regenerates ARCHITECTURE.md (or `out`) from a folder base and returns its path; `source:` is the folder relative to it. */
export function writeDocument(store, raw, notes, { out = store.locator.docPath, replacing } = {}) {
  assertDocOwned(store, out, { replacing });
  atomicWrite(out, generateDoc(raw, { notes, source: docSource(store, out) }));
  return out;
}

/** The document regenerated from what is on disk (a split model regroups items by file). */
const documentStored = store => {
  const saved = store.read();
  return writeDocument(store, saved.raw, saved.notes);
};

/**
 * Writes a final plan through the connector and regenerates the document (the diagrams are not rebuilt). The document is
 * checked before anything is written. `{ entry: null }` when the plan changes nothing. When the base was written but
 * the document could not be regenerated, `doc` is null and `docError` holds the error. Not for a gbrain MCP base.
 */
export function applyAndDocument(store, plan) {
  if (store.remote) throw storeError('E_STORE_UNSUPPORTED', `${store.describe()} é uma base gbrain no modo mcp; grave com "archlens apply"`);
  assertWritable(store);
  if (isFinal(plan) && plan.ops?.length) assertDocOwned(store);
  const res = applyPlan(store, plan);
  if (!res.entry) return { entry: null };
  try { return { entry: res.entry, preserved: res.preserved, doc: documentStored(store) }; } catch (e) {
    return { entry: res.entry, preserved: res.preserved, doc: null, docError: e };
  }
}

/** Writes the interpretation notes ({ overview?, notes? }) through the connector (op putNote) and regenerates the document. */
export function writeNotes(store, notes) {
  if (store.remote) throw storeError('E_STORE_UNSUPPORTED', `${store.describe()} é uma base gbrain no modo mcp; as notas não são gravadas por aqui`);
  assertWritable(store);
  assertDocOwned(store);
  const loaded = store.read();
  if (!loaded?.raw) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${store.describe()}`);
  const ops = NOTE_NAMES.filter(name => typeof notes?.[name] === 'string').map(name => ({ op: 'putNote', name, text: notes[name] }));
  if (ops.length) store.apply(ops, { baseVersion: contentVersion(loaded) });
  return { doc: documentStored(store) };
}
