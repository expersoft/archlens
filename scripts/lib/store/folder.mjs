// Knowledge base as a folder (architecture/): manifest, model (model.json or model/*.json), views, changelog, notes.
// Saving writes each item back to the file it came from, in a stable format, so diffs show only real changes.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { relationshipIds } from '../merge.mjs';
import { c4Orientation } from '../model.mjs';
import { NOTE_NAMES } from '../doc.mjs';
import { storeError } from './errors.mjs';
import { isCanonicalFormat, FORMAT } from '../canonical.mjs';
import { fileConnector } from './contract.mjs';

export const MANIFEST = 'archlens.json';
const json = v => JSON.stringify(v, null, 2) + '\n';

/** Parses `text` as JSON; `path` names it in the error. */
export function parseJson(text, path) {
  try { return JSON.parse(text); } catch (e) {
    throw storeError('E_STORE_JSON', `${path}: JSON inválido: ${e.message}`, { file: path });
  }
}

export function readJson(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) {
    throw storeError('E_STORE_JSON', `${path}: JSON inválido: ${e.message}`, { file: path });
  }
  return parseJson(text, path);
}

/**
 * The connector the manifest's `store` names: "json" when it is absent or has no kind, "markdown", "gbrain", or
 * E_STORE_UNSUPPORTED for anything else (a non-object `store`, another kind).
 */
export function storeKind(manifest, file = MANIFEST) {
  const { store } = manifest ?? {};
  if (store === undefined) return 'json';
  const kind = store && typeof store === 'object' && !Array.isArray(store) ? store.kind ?? 'json' : null;
  if (kind === 'json' || kind === 'markdown' || kind === 'gbrain') return kind;
  throw storeError('E_STORE_UNSUPPORTED', kind === null
    ? `"store" em ${file} deve ser um objeto como { "kind": "json" } (recebido ${JSON.stringify(store)})`
    : `"store.kind" ${JSON.stringify(kind)} em ${file} não é suportado ("store" aceita "json", "markdown" ou "gbrain")`);
}

/** Writes through a temp file and rename; leaves the file alone when the content is the same. */
function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** A relative path inside the base folder: not absolute, no ".." segment. */
const inside = p => typeof p === 'string' && p !== '' && !/^([\\/]|[A-Za-z]:)/.test(p) && !p.split(/[\\/]/).includes('..');

/**
 * Where the model lives: one file ("model.json") or a folder ("model/") whose *.json files are joined. Anything
 * else is refused, because saving would write files that loading never reads back.
 */
function modelLayout(layout = {}) {
  const model = layout.model ?? 'model.json';
  const bad = why => storeError('E_STORE_LAYOUT', `"layout" em ${MANIFEST}: ${why}`);
  if (!inside(model) || !(model.endsWith('/') || model.endsWith('.json'))) {
    throw bad(`"model" deve ser um arquivo .json ou uma pasta terminada em "/", relativo à base e sem ".." (recebido ${JSON.stringify(model)})`);
  }
  const split = model.endsWith('/');
  if (!split) return { model, split, defaultFile: model };
  const defaultFile = layout.defaultFile ?? `${model}geral.json`;
  const name = typeof defaultFile === 'string' && defaultFile.startsWith(model) ? defaultFile.slice(model.length) : '';
  if (!inside(defaultFile) || !name.endsWith('.json') || /[\\/]/.test(name)) {
    throw bad(`"defaultFile" deve ser um arquivo .json direto em ${model} (recebido ${JSON.stringify(defaultFile)})`);
  }
  return { model, split, defaultFile };
}

/** Model files relative to the base folder ("model.json", or "model/a.json", "model/b.json"… in name order). */
function modelFiles(dir, layout) {
  const L = modelLayout(layout);
  if (!L.split) return [L.model];
  const d = join(dir, L.model);
  return existsSync(d) ? readdirSync(d).filter(n => n.endsWith('.json')).sort().map(n => L.model + n) : [];
}

/** id → id of the top-level element that holds it (nested children travel with their root). */
function rootIndex(elements) {
  const root = new Map();
  const walk = (list, top) => {
    for (const el of list ?? []) {
      if (!el || typeof el.id !== 'string') continue;
      root.set(el.id, top ?? el.id);
      walk(el.children, top ?? el.id);
    }
  };
  walk(elements, null);
  return root;
}

export function loadFolder(dir, { anyFormat = false } = {}) {
  const manifestPath = join(dir, MANIFEST);
  if (!existsSync(manifestPath)) throw storeError('E_STORE_NOT_BASE', `${dir} não é uma base archlens (falta ${MANIFEST})`);
  const { layout, store, ...top } = readJson(manifestPath);
  const kind = storeKind({ store }, manifestPath);
  if (kind !== 'json') {
    throw storeError('E_STORE_UNSUPPORTED', `"store" em ${manifestPath} indica o conector "${kind}"; esta pasta não é uma base json`);
  }
  if (!anyFormat && !isCanonicalFormat(top.archlens)) {
    throw storeError('E_STORE_FORMAT', `${dir} está no formato ${top.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}. `
      + `Rode "archlens migrate ${dir}" para converter (a skill pergunta antes de gravar)`);
  }
  const elements = [];
  const relationships = [];
  const relFiles = [];
  const origins = { elements: new Map(), relationships: new Map() };
  const seen = new Map(); // element id (nested included) → file
  for (const rel of modelFiles(dir, layout)) {
    const path = join(dir, rel);
    const part = existsSync(path) ? readJson(path) : {};
    for (const el of part.elements ?? []) {
      for (const id of rootIndex([el]).keys()) {
        if (seen.has(id) && seen.get(id) !== rel) throw storeError('E_STORE_DUP_ID', `elemento "${id}" aparece em ${seen.get(id)} e em ${rel}`);
        seen.set(id, rel);
      }
      if (el && typeof el.id === 'string') origins.elements.set(el.id, rel);
      elements.push(el);
    }
    for (const r of part.relationships ?? []) { relationships.push(r); relFiles.push(rel); }
  }
  const raw = { ...top, model: { elements, relationships } };
  if (existsSync(join(dir, 'views.json'))) raw.views = readJson(join(dir, 'views.json'));
  if (existsSync(join(dir, 'changelog.json'))) raw.changelog = readJson(join(dir, 'changelog.json'));
  const ids = relationshipIds(raw);
  relationships.forEach((r, i) => origins.relationships.set(ids.get(r), relFiles[i]));
  const notes = readNotes(dir);
  return { raw, notes, origins, layout, store };
}

/** The notes of a base folder (notes/<name>.md), without the trailing newline. */
export function readNotes(dir) {
  const notes = {};
  for (const name of NOTE_NAMES) {
    const p = join(dir, 'notes', `${name}.md`);
    if (existsSync(p)) notes[name] = readFileSync(p, 'utf8').replace(/\n$/, '');
  }
  return notes;
}

/**
 * Note files for `notes`; a note file without its trailing newline that already holds the note stays as written.
 * `read(rel)` gives the current text of a file (undefined when absent); by default it reads from `dir`.
 */
export function noteFiles(dir, notes = {}, read = rel => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : undefined)) {
  const files = new Map();
  for (const name of NOTE_NAMES) {
    if (notes[name] == null) continue;
    const rel = `notes/${name}.md`;
    files.set(rel, read(rel) === notes[name] ? notes[name] : `${notes[name]}\n`);
  }
  return files;
}

/** Every file of the base for `raw` (relative path → text), without writing: each item goes back to its file. */
export function folderContents(dir, raw, { notes = {}, origins, layout, store } = {}) {
  const { model, views, changelog, ...top } = raw;
  const L = modelLayout(layout);
  const parts = new Map(); // relative file → { elements, relationships }
  const part = rel => {
    if (!parts.has(rel)) parts.set(rel, { elements: [], relationships: [] });
    return parts.get(rel);
  };
  if (L.split) for (const rel of modelFiles(dir, layout)) part(rel); // existing files stay, even if emptied
  else part(L.model);

  const elements = model?.elements ?? [];
  const tops = new Map(elements.filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  const rootOf = rootIndex(elements);
  const fileOf = new Map();
  const fileFor = (id, visiting = new Set()) => {
    if (!L.split) return L.model;
    if (fileOf.has(id)) return fileOf.get(id);
    let rel = origins?.elements.get(id);
    const parent = tops.get(id)?.parent;
    if (!rel && parent != null && !visiting.has(id)) {
      visiting.add(id);
      const pr = rootOf.get(parent);
      if (pr && pr !== id) rel = fileFor(pr, visiting);
    }
    rel ??= L.defaultFile;
    fileOf.set(id, rel);
    return rel;
  };
  for (const el of elements) part(el && typeof el.id === 'string' ? fileFor(el.id) : L.defaultFile).elements.push(el);

  const ids = relationshipIds(raw);
  for (const r of model?.relationships ?? []) {
    let rel = L.split ? origins?.relationships.get(ids.get(r)) : L.model;
    // A new relationship goes with the side that depends on it (the consumer of a serving), like a C4 "uses".
    const owner = r && typeof r === 'object' ? (c4Orientation(r)?.from ?? r.from) : undefined;
    if (!rel) rel = rootOf.has(owner) ? fileFor(rootOf.get(owner)) : L.defaultFile;
    part(rel).relationships.push(r);
  }

  const files = new Map();
  files.set(MANIFEST, json({ ...top, ...(store ? { store } : {}), ...(layout ? { layout } : {}) }));
  for (const [rel, content] of parts) files.set(rel, json(content));
  if (views !== undefined) files.set('views.json', json(views));
  if (changelog !== undefined) files.set('changelog.json', json(changelog));
  for (const [rel, text] of noteFiles(dir, notes)) files.set(rel, text);
  return files;
}

export function saveFolder(dir, raw, opts = {}) {
  for (const [rel, text] of folderContents(dir, raw, opts)) writeIfChanged(join(dir, rel), text);
}

/** The json connector: model.json (or model/*.json) next to the manifest, views, changelog and notes. */
export function jsonConnector(locator, describe) {
  const dir = locator.path;
  const load = opts => (existsSync(join(dir, MANIFEST)) ? toBase(loadFolder(dir, opts)) : null);
  return fileConnector({
    kind: 'json', dir, locator, describe, load, versioning: 'base',
    contents: (next, cur) => folderContents(dir, next.raw, { notes: next.notes, ...cur?.ctx }),
  });
}

const toBase = ({ raw, notes, origins, layout, store }) => ({ raw, notes, ctx: { origins, layout, store } });
