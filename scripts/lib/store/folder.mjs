// Knowledge base as a folder (architecture/): manifest, model (model.json or model/*.json), views, changelog, notes.
// Saving writes each item back to the file it came from, in a stable format, so diffs show only real changes.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { relationshipIds } from '../merge.mjs';
import { NOTE_NAMES } from '../doc.mjs';
import { storeError } from './errors.mjs';

export const MANIFEST = 'archlens.json';
const json = v => JSON.stringify(v, null, 2) + '\n';

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) {
    throw storeError('E_STORE_JSON', `${path}: JSON inválido: ${e.message}`, { file: path });
  }
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

export function loadFolder(dir) {
  const manifestPath = join(dir, MANIFEST);
  if (!existsSync(manifestPath)) throw storeError('E_STORE_NOT_BASE', `${dir} não é uma base archlens (falta ${MANIFEST})`);
  const { layout, store, ...top } = readJson(manifestPath);
  if (store !== undefined) {
    throw storeError('E_STORE_UNSUPPORTED', `"store" em ${MANIFEST} (fonte externa) ainda não é suportado; remova o campo para usar a pasta`);
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
  const notes = {};
  for (const name of NOTE_NAMES) {
    const p = join(dir, 'notes', `${name}.md`);
    if (existsSync(p)) notes[name] = readFileSync(p, 'utf8').replace(/\n$/, '');
  }
  return { raw, notes, origins, layout };
}

export function saveFolder(dir, raw, { notes = {}, origins, layout } = {}) {
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
    if (!rel) rel = rootOf.has(r?.from) ? fileFor(rootOf.get(r.from)) : L.defaultFile;
    part(rel).relationships.push(r);
  }

  writeIfChanged(join(dir, MANIFEST), json({ ...top, ...(layout ? { layout } : {}) }));
  for (const [rel, content] of parts) writeIfChanged(join(dir, rel), json(content));
  if (views !== undefined) writeIfChanged(join(dir, 'views.json'), json(views));
  if (changelog !== undefined) writeIfChanged(join(dir, 'changelog.json'), json(changelog));
  for (const name of NOTE_NAMES) {
    if (notes[name] == null) continue;
    const p = join(dir, 'notes', `${name}.md`);
    // A note file without its trailing newline already holds this note: leave it as the user wrote it.
    if (existsSync(p) && readFileSync(p, 'utf8') === notes[name]) continue;
    writeIfChanged(p, `${notes[name]}\n`);
  }
}
