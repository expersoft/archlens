// Base as an Obsidian/gbrain vault: manifest, views, changelog and notes as in the json connector, and one page per
// element in a folder named after its ArchiMate type (<type>/<id>.md). Files outside the type folders are never read nor
// removed; the text people write after the archlens block of a page is kept.
import { existsSync, readFileSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMENT_TYPES } from '../registry.mjs';
import { sortParentsFirst, isCanonicalFormat, FORMAT } from '../canonical.mjs';
import { storeError } from './errors.mjs';
import { MANIFEST, readJson, readNotes, noteFiles } from './folder.mjs';
import { renderPage, parsePage, pagePath } from './markdown-page.mjs';
import { gbrainPack, PACK_FILE } from './gbrain-pack.mjs';
import { fileConnector } from './contract.mjs';
import { relationshipIds } from '../merge.mjs';

const json = v => JSON.stringify(v, null, 2) + '\n';
const FILE_SAFE = /^[^/\\:*?"<>|\0]+$/;
const typeFolders = dir => readdirSync(dir).filter(n => ELEMENT_TYPES[n] && statSync(join(dir, n)).isDirectory()).sort();

export function readVault(dir, { anyFormat = false } = {}) {
  const { store, layout, ...top } = readJson(join(dir, MANIFEST));
  if (!anyFormat && !isCanonicalFormat(top.archlens)) {
    throw storeError('E_STORE_FORMAT', `${dir} está no formato ${top.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}`);
  }
  const pages = new Map();
  const elements = [];
  const outgoing = new Map();
  for (const type of typeFolders(dir)) {
    for (const file of readdirSync(join(dir, type)).filter(f => f.endsWith('.md')).sort()) {
      const rel = `${type}/${file}`;
      const { element, relationships, userText } = parsePage(readFileSync(join(dir, rel), 'utf8'), rel);
      if (element.type !== type || `${element.id}.md` !== file) {
        throw storeError('E_STORE_MD_PATH', `${rel}: o elemento "${element.id}" (${element.type}) deveria estar em ${pagePath(element)}`, { file: rel });
      }
      if (pages.has(element.id)) throw storeError('E_STORE_DUP_ID', `elemento "${element.id}" aparece em ${pages.get(element.id).rel} e em ${rel}`);
      pages.set(element.id, { rel, userText });
      elements.push(element);
      outgoing.set(element.id, relationships);
    }
  }
  const ordered = sortParentsFirst(elements.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  const raw = { ...top, model: { elements: ordered, relationships: ordered.flatMap(e => outgoing.get(e.id)) } };
  if (existsSync(join(dir, 'views.json'))) raw.views = readJson(join(dir, 'views.json'));
  if (existsSync(join(dir, 'changelog.json'))) raw.changelog = readJson(join(dir, 'changelog.json'));
  return { raw, notes: readNotes(dir), ctx: { pages } };
}

export function vaultContents(dir, { raw, notes }, cur) {
  const { model, views, changelog, ...top } = raw;
  const files = new Map([[MANIFEST, json({ ...top, store: { kind: 'markdown' } })]]);
  if (views !== undefined) files.set('views.json', json(views));
  if (changelog !== undefined) files.set('changelog.json', json(changelog));
  for (const [rel, text] of noteFiles(dir, notes)) files.set(rel, text);
  const els = (model?.elements ?? []).filter(e => e && typeof e.id === 'string');
  const byId = new Map(els.map(e => [e.id, e]));
  const info = id => { const e = byId.get(id); return e && { type: e.type, name: e.name }; };
  const outgoing = new Map(els.map(e => [e.id, []]));
  const ids = relationshipIds(raw); // a page always names its relationships, so what is written reads back
  for (const r of model?.relationships ?? []) {
    if (!outgoing.has(r?.from)) throw storeError('E_STORE_MD_REL', `a relação ${r?.id ?? `${r?.from} → ${r?.to}`} sai de "${r?.from}", que não é um elemento da base`);
    outgoing.get(r.from).push(r.id == null && ids.has(r) ? { ...r, id: ids.get(r) } : r);
  }
  const children = new Map();
  for (const e of els) if (e.parent != null && byId.has(e.parent)) children.set(e.parent, [...(children.get(e.parent) ?? []), e.id]);
  for (const list of children.values()) list.sort(); // by id, as the vault reads them back: same base, same bytes
  const old = cur?.ctx.pages ?? new Map();
  for (const el of els) {
    if (!FILE_SAFE.test(el.id) || !ELEMENT_TYPES[el.type]) throw storeError('E_STORE_MD_ID', `"${el.id}" (${el.type}) não pode virar o arquivo ${pagePath(el)}`);
    files.set(pagePath(el), renderPage(el, { outgoing: outgoing.get(el.id), children: children.get(el.id) ?? [], info, userText: old.get(el.id)?.userText }));
  }
  for (const { rel } of old.values()) if (!files.has(rel)) files.set(rel, null);
  files.set(PACK_FILE, gbrainPack(raw));
  return files;
}

/** Type folders left empty by an apply go away (one with files the base does not own stays). */
function removeEmptyTypeFolders(dir) {
  for (const type of typeFolders(dir)) if (!readdirSync(join(dir, type)).length) rmdirSync(join(dir, type));
}

export function markdownConnector(locator, describe) {
  const dir = locator.path;
  return fileConnector({
    kind: 'markdown', dir, locator, describe,
    load: opts => (existsSync(join(dir, MANIFEST)) ? readVault(dir, opts) : null),
    contents: (next, cur) => vaultContents(dir, next, cur),
    after: () => removeEmptyTypeFolders(dir),
  });
}
