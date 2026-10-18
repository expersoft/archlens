// Base as an Obsidian/gbrain vault: manifest, views, changelog and notes as in the json connector, and one page per
// element in a folder named after its ArchiMate type (<type>/<id>.md). Files outside the type folders are never read nor
// removed; the text people write after the archlens block of a page is kept, in notes/removidos/ once its element goes.
import { existsSync, readFileSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMENT_TYPES } from '../registry.mjs';
import { sortParentsFirst, isCanonicalFormat, FORMAT } from '../canonical.mjs';
import { storeError } from './errors.mjs';
import { MANIFEST, parseJson, noteFiles } from './folder.mjs';
import { NOTE_NAMES } from '../doc.mjs';
import { renderPage, parsePage, pagePath, BEGIN, END } from './markdown-page.mjs';
import { gbrainPack, PACK_FILE } from './gbrain-pack.mjs';
import { fileConnector } from './contract.mjs';
import { relationshipIds } from '../merge.mjs';

const json = v => JSON.stringify(v, null, 2) + '\n';
// A file name, and a wikilink target: no "[", "]" or "|" (link syntax) nor "#" or "^" (heading and block anchors).
const FILE_SAFE = /^[^/\\:*?"<>|\0[\]#^]+$/;
// Where the human text of the page of a removed element goes (never read as base content nor removed).
export const REMOVED = 'notes/removidos/';
const LINT_FILE = '.markdownlint.json';
const typeFolders = dir => readdirSync(dir).filter(n => ELEMENT_TYPES[n] && statSync(join(dir, n)).isDirectory()).sort();

/** Reads the vault from `dir` into a file map (the files of the format only) and parses it. */
export function readVault(dir, { anyFormat = false } = {}) {
  const files = new Map();
  const take = rel => { if (existsSync(join(dir, rel))) files.set(rel, readFileSync(join(dir, rel), 'utf8')); };
  take(MANIFEST); // a missing manifest is reported by the parse, as an unreadable JSON
  take('views.json');
  take('changelog.json');
  for (const name of NOTE_NAMES) take(`notes/${name}.md`);
  if (existsSync(join(dir, MANIFEST))) {
    for (const type of typeFolders(dir)) for (const file of readdirSync(join(dir, type)).filter(f => f.endsWith('.md'))) take(`${type}/${file}`);
  }
  return readVaultFiles(files, { anyFormat, where: dir });
}

/** The vault in a file map (relative path → text): what readVault reads, without the file system. */
export function readVaultFiles(files, { anyFormat = false, where = '' } = {}) {
  const at = rel => (where ? join(where, rel) : rel);
  const json = rel => {
    if (!files.has(rel)) throw storeError('E_STORE_JSON', `${at(rel)}: JSON inválido: arquivo ausente`, { file: at(rel) });
    return parseJson(files.get(rel), at(rel));
  };
  const { store, layout, ...top } = json(MANIFEST);
  if (!anyFormat && !isCanonicalFormat(top.archlens)) {
    throw storeError('E_STORE_FORMAT', `${where || 'a base'} está no formato ${top.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}`);
  }
  const pages = new Map();
  const elements = [];
  const outgoing = new Map();
  for (const rel of [...files.keys()].filter(r => /^[^/]+\/[^/]+\.md$/.test(r) && ELEMENT_TYPES[r.split('/')[0]]).sort()) {
    const [type, file] = rel.split('/');
    const { element, relationships, userText } = parsePage(files.get(rel), rel);
    if (element.type !== type || `${element.id}.md` !== file) {
      throw storeError('E_STORE_MD_PATH', `${rel}: o elemento "${element.id}" (${element.type}) deveria estar em ${pagePath(element)}`, { file: rel });
    }
    if (pages.has(element.id)) throw storeError('E_STORE_DUP_ID', `elemento "${element.id}" aparece em ${pages.get(element.id).rel} e em ${rel}`);
    pages.set(element.id, { rel, userText, name: element.name });
    elements.push(element);
    outgoing.set(element.id, relationships);
  }
  const ordered = sortParentsFirst(elements.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  const raw = { ...top, model: { elements: ordered, relationships: ordered.flatMap(e => outgoing.get(e.id)) } };
  if (files.has('views.json')) raw.views = json('views.json');
  if (files.has('changelog.json')) raw.changelog = json('changelog.json');
  const notes = {};
  for (const name of NOTE_NAMES) if (files.has(`notes/${name}.md`)) notes[name] = files.get(`notes/${name}.md`).replace(/\n$/, '');
  return { raw, notes, ctx: { pages } };
}

/** The files of the vault for `raw`, from the file system of `dir`; see vaultFiles. */
export function vaultContents(dir, base, cur) {
  const read = rel => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : undefined);
  return vaultFiles(base, cur, { exists: rel => existsSync(join(dir, rel)), read });
}

/**
 * Every file of the vault for `raw` (relative path → text, null for a page that goes). Pure: `exists(rel)` and
 * `read(rel)` stand for the files already there (the lint config, the notes, the file of removed text).
 * `linkPrefix` and `extraTags` shape the pages for another layout (see gbrain-layout.mjs).
 */
export function vaultFiles({ raw, notes }, cur, { exists, read = () => undefined, linkPrefix = '', extraTags = [] } = {}) {
  exists ??= rel => read(rel) !== undefined;
  const { model, views, changelog, ...top } = raw;
  const files = new Map([[MANIFEST, json({ ...top, store: { kind: 'markdown' } })]]);
  if (views !== undefined) files.set('views.json', json(views));
  if (changelog !== undefined) files.set('changelog.json', json(changelog));
  for (const [rel, text] of noteFiles(null, notes, read)) files.set(rel, text);
  // The frontmatter title is the page name, the "# Name" heading is for readers: markdownlint must not count two H1.
  // Written once; a config the people of the vault adjusted stays.
  if (!exists(LINT_FILE)) files.set(LINT_FILE, json({ MD025: { front_matter_title: '' } }));
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
  const byPath = new Map(); // lower-cased page path → id: one file on a case-insensitive file system
  for (const el of els) {
    if (!FILE_SAFE.test(el.id) || !ELEMENT_TYPES[el.type]) throw storeError('E_STORE_MD_ID', `"${el.id}" (${el.type}) não pode virar o arquivo ${pagePath(el)}`);
    const key = pagePath(el).toLowerCase();
    if (byPath.has(key) && byPath.get(key) !== el.id) {
      throw storeError('E_STORE_MD_ID', `"${byPath.get(key)}" e "${el.id}" (${el.type}) só diferem em maiúsculas e minúsculas: seriam o mesmo arquivo ${pagePath(el)} em sistemas que não distinguem`);
    }
    byPath.set(key, el.id);
    if (typeof el.description === 'string' && (el.description.includes(BEGIN) || el.description.includes(END))) {
      throw storeError('E_STORE_MD', `a descrição de "${el.id}" contém o marcador ${el.description.includes(BEGIN) ? BEGIN : END}, que delimita o bloco do archlens na página`);
    }
    files.set(pagePath(el), renderPage(el, { outgoing: outgoing.get(el.id), children: children.get(el.id) ?? [], info, userText: old.get(el.id)?.userText, linkPrefix, extraTags }));
  }
  for (const { rel } of old.values()) if (!files.has(rel)) files.set(rel, null);
  // The page of a removed element goes; what people wrote in it is kept (a retyped element carries it to its new page).
  for (const [id, { rel, userText, name }] of old) {
    if (byId.has(id) || !userText?.trim()) continue;
    const keep = `${REMOVED}${rel}`;
    const label = String(name ?? id).replace(/\s+/g, ' ').trim();
    // One H1 per file; each removal is a section of its own (markdownlint MD022/MD025).
    const before = exists(keep) ? `${read(keep).replace(/\n*$/, '')}\n\n` : `# ${label} ("${id}")\n\n`;
    files.set(keep, `${before}## ${label} ("${id}"): elemento removido da base; texto escrito em ${rel}\n\n${userText.replace(/^\n+/, '').replace(/\n*$/, '')}\n`);
  }
  files.set(PACK_FILE, gbrainPack(raw));
  return files;
}

/** Type folders this apply emptied go away (one with files the base does not own, or made by a person, stays). */
function removeEmptiedFolders(dir, folders) {
  for (const type of folders) {
    const d = join(dir, type);
    if (existsSync(d) && statSync(d).isDirectory() && !readdirSync(d).length) rmdirSync(d);
  }
}

export function markdownConnector(locator, describe) {
  const dir = locator.path;
  let emptied = new Set();
  let preserved = [];
  return fileConnector({
    kind: 'markdown', dir, locator, describe, versioning: 'object', // a page per element: its relationships live in it
    load: opts => (existsSync(join(dir, MANIFEST)) ? readVault(dir, opts) : null),
    contents: (next, cur) => {
      const files = vaultContents(dir, next, cur);
      // The folders of the pages this apply deletes or moves away: the only ones it may remove once emptied.
      emptied = new Set([...files].filter(([rel, text]) => text === null && ELEMENT_TYPES[rel.split('/')[0]]).map(([rel]) => rel.split('/')[0]));
      preserved = [...files.keys()].filter(rel => rel.startsWith(REMOVED));
      return files;
    },
    after: () => removeEmptiedFolders(dir, emptied),
    preserved: () => preserved,
  });
}
