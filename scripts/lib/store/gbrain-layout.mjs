// The layout of the base in the gbrain, under a prefix, as pure functions over file maps (relative path → text):
// toGbrainFiles turns the vault of the markdown connector into it, fromGbrainFiles turns it back. Element pages keep the
// vault format (wikilinks prefixed, plus the common tag); manifest, views and changelog are pages holding their JSON in an
// archlens-json block with a readable summary around it; notes are pages with the note text as body.
import { parse as parseYaml, stringify as stringifyYaml } from '../../vendor/yaml/index.js';
import { ELEMENT_TYPES } from '../registry.mjs';
import { storeError } from './errors.mjs';
import { MANIFEST, parseJson } from './folder.mjs';
import { NOTE_NAMES } from '../doc.mjs';
import { readVaultFiles, vaultFiles, REMOVED } from './markdown.mjs';
import { link } from './markdown-page.mjs';
import { gbrainPack, PACK_FILE } from './gbrain-pack.mjs';

export const COMMON_TAG = 'archlens';
// Frontmatter keys gbrain stamps into the pages it keeps (src/core/utils.ts HASH_EPHEMERAL_FRONTMATTER_KEYS, the
// gate-owned keys of src/core/write-gate.ts, the extract-atoms markers and the slug stamp): never base content. They
// are dropped when a page is read, and an element field with one of these names is refused.
export const GBRAIN_FRONTMATTER_KEYS = ['slug', 'captured_at', 'ingested_at', 'quarantine', 'quarantine_override', 'content_flag', 'embed_skip',
  'atoms_scan_hash', 'atoms_fail_hash', 'atoms_fail_count', 'trust_tier'];
// gbrain's explicit timeline sentinel (src/core/markdown.ts splitBody). Every page ends with it, so gbrain never moves a
// "## Timeline" / "## History" section of dated bullets (from a description or people's text) out of its place.
export const TIMELINE_SENTINEL = '<!-- timeline -->';
const SEAL = `\n${TIMELINE_SENTINEL}\n`;
const seal = text => `${text}${text.endsWith('\n') ? '' : '\n'}${SEAL}`;
/** The page without the sentinel that ends it (only there: one inside the page is people's text). */
export const unseal = text => (text.endsWith(`\n${SEAL}`) ? text.slice(0, -SEAL.length) : text);
// File names the gbrain keeps for itself (compared in lower case, without extension).
const RESERVED = new Set(['readme', 'index', 'schema', 'log', 'resolver']);
const FENCE = '```archlens-json\n';
const json = v => JSON.stringify(v, null, 2) + '\n';
const display = s => String(s).replace(/[[\]|\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
const norm = prefix => String(prefix ?? '').replace(/^\/+|\/+$/g, '');

/** Port of gbrain's slugifySegment (src/core/sync.ts): accents out, lower case, only letters, digits, ._- and CJK. */
export function gbrainSlug(segment) {
  return String(segment)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9._\s\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Refuses what the gbrain would file under another name (ids that are not slugs) or keep for itself (reserved names). */
export function assertGbrainIds(raw) {
  const ids = [
    ...(raw.model?.elements ?? []).map(e => e?.id),
    ...(raw.views ?? []).map(v => v?.key),
  ].filter(id => typeof id === 'string');
  const reserved = ids.filter(id => RESERVED.has(id.toLowerCase()));
  if (reserved.length) {
    throw storeError('E_STORE_GBRAIN_RESERVED', `${reserved.map(i => `"${i}"`).join(', ')}: nome reservado do gbrain (${[...RESERVED].join(', ')}); renomeie o id`, { ids: reserved });
  }
  const stamped = (raw.model?.elements ?? []).filter(e => e && GBRAIN_FRONTMATTER_KEYS.some(k => Object.hasOwn(e, k)));
  if (stamped.length) {
    const names = stamped.map(e => `"${e.id}" (${GBRAIN_FRONTMATTER_KEYS.filter(k => Object.hasOwn(e, k)).join(', ')})`);
    throw storeError('E_STORE_GBRAIN_RESERVED', `campo(s) reservado(s) do gbrain em ${names.join(', ')}: o gbrain grava esses campos no cabeçalho da página por conta própria; renomeie o campo`, { ids: stamped.map(e => e.id) });
  }
  const bad = ids.filter(id => gbrainSlug(id) !== id);
  if (bad.length) {
    throw storeError('E_STORE_GBRAIN_SLUG', `ids que o gbrain gravaria com outro nome (só minúsculas, dígitos, ".", "_", "-" e espaços): ${bad.map(i => `"${i}"`).join(', ')}`, { ids: bad });
  }
}

const frontmatter = fm => `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n`;
// "`" is written as \u0060 so the block never holds a fence of its own; JSON reads it back the same.
const block = value => `${FENCE}${JSON.stringify(value, null, 2).replace(/`/g, '\\u0060')}\n\`\`\`\n`;
const readBlock = (text, rel) => {
  const at = text.lastIndexOf(FENCE);
  const end = at < 0 ? -1 : text.indexOf('\n```', at + FENCE.length);
  if (end < 0) throw storeError('E_STORE_MD', `${rel}: falta o bloco \`\`\`archlens-json`, { file: rel });
  return parseJson(text.slice(at + FENCE.length, end), rel);
};
const readFrontmatter = (text, rel) => {
  const m = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) throw storeError('E_STORE_MD', `${rel}: falta o frontmatter (--- … ---) no início do arquivo`, { file: rel });
  return { fm: parseYaml(m[1] ?? '') ?? {}, body: text.slice(m[0].length) };
};
const page = (type, title, extra, summary, value) => `${frontmatter({ type, title, ...extra, tags: [COMMON_TAG] })}# ${display(title)}\n\n${summary}${block(value)}`;

/** The vault (markdown connector format) as the files of the gbrain, under `prefix`. */
export function toGbrainFiles(vault, { prefix } = {}) {
  const p = norm(prefix);
  const at = rel => (p ? `${p}/${rel}` : rel);
  const { raw, ctx } = readVaultFiles(vault, { anyFormat: true });
  const out = new Map();
  // Element pages: rendered again with the prefixed wikilinks and the common tag; what people wrote after the block stays.
  const pages = vaultFiles({ raw, notes: {} }, { ctx }, { exists: () => true, linkPrefix: p ? `${p}/` : '', extraTags: [COMMON_TAG] });
  for (const [rel, text] of pages) if (/^[^/]+\/[^/]+\.md$/.test(rel) && ELEMENT_TYPES[rel.split('/')[0]]) out.set(at(rel), text);

  const { model, views, changelog, ...top } = raw;
  const info = (() => { const m = new Map((model.elements ?? []).map(e => [e.id, e])); return id => m.get(id); })();
  const cite = ids => ids.map(id => link(id, info, p ? `${p}/` : '')).join(', ');
  out.set(at('manifest.md'), page('archlens-manifest', top.name ?? 'Arquitetura', {}, `${top.description ? `${top.description}\n\n` : ''}Manifesto da base de arquitetura mantida pelo archlens (formato ${top.archlens}).\n\n`, top)); // no "store": where it lives is not the manifest's to say here
  (views ?? []).forEach((v, i) => {
    const scope = Object.entries(v).filter(([k, x]) => !['key', 'title', 'notation', 'description'].includes(k) && (typeof x === 'string' || typeof x === 'number'));
    const summary = `Visão ${v.notation ?? ''}${scope.length ? ` (${scope.map(([k, x]) => `${k}: ${x}`).join(', ')})` : ''}.\n\n${v.description ? `${v.description}\n\n` : ''}`;
    out.set(at(`views/${v.key}.md`), page('archlens-view', v.title ?? v.key, { key: v.key, position: i }, summary, v));
  });
  if (changelog !== undefined) {
    const lines = changelog.map(r => {
      const parts = [['adicionados', r.added], ['alterados', r.changed], ['removidos', r.removed]]
        .map(([label, ids]) => (Array.isArray(ids) && ids.length ? `${label}: ${cite(ids)}` : null)).filter(Boolean);
      return `- **${display(r.id)}** (${display(r.date ?? '')}): ${display(r.summary ?? '')}${parts.length ? ` — ${parts.join('; ')}` : ''}`;
    });
    out.set(at('changelog.md'), page('archlens-changelog', 'Histórico', {}, lines.length ? `${lines.join('\n')}\n\n` : '', changelog));
  }
  for (const name of NOTE_NAMES) {
    if (vault.has(`notes/${name}.md`)) out.set(at(`notes/${name}.md`), `${frontmatter({ type: 'archlens-note', title: name, tags: [COMMON_TAG] })}${vault.get(`notes/${name}.md`)}`);
  }
  // The text of removed elements (kept by the vault in notes/removidos/) travels as note pages too.
  for (const [rel, text] of vault) {
    if (rel.startsWith(REMOVED) && rel.endsWith('.md') && text != null) out.set(at(rel), `${frontmatter({ type: 'archlens-note', title: rel.slice(REMOVED.length, -3), tags: [COMMON_TAG] })}${text}`);
  }
  for (const [rel, text] of out) out.set(rel, seal(text));
  out.set(at(PACK_FILE), gbrainPack(raw, { prefix: p, gbrain: true }));
  return out;
}

/** An element page without the frontmatter keys gbrain stamped (the text as it is when there are none). */
export function withoutGbrainKeys(text, rel) {
  const { fm, body } = readFrontmatter(text, rel);
  if (!fm || typeof fm !== 'object' || !GBRAIN_FRONTMATTER_KEYS.some(k => Object.hasOwn(fm, k))) return text;
  for (const k of GBRAIN_FRONTMATTER_KEYS) delete fm[k];
  return `${frontmatter(fm)}${body}`;
}

/** The inverse: the vault from the files of the gbrain under `prefix` (anything outside it, or foreign inside, is ignored). */
export function fromGbrainFiles(files, { prefix, anyFormat = false } = {}) {
  const p = norm(prefix);
  const under = p ? `${p}/` : '';
  const mine = new Map();
  for (const [rel, text] of files) if (rel.startsWith(under) && text != null) mine.set(rel.slice(under.length), unseal(text));
  const flat = new Map(); // the vault files the pages stand for
  const viewPages = [];
  for (const [rel, text] of mine) {
    if (rel === 'manifest.md') flat.set(MANIFEST, json(readBlock(text, rel)));
    else if (rel === 'changelog.md') flat.set('changelog.json', json(readBlock(text, rel)));
    else if (/^views\/[^/]+\.md$/.test(rel)) viewPages.push({ position: readFrontmatter(text, rel).fm.position, key: rel.slice(6, -3), view: readBlock(text, rel) });
    else if (rel.startsWith(REMOVED) && rel.endsWith('.md')) flat.set(rel, readFrontmatter(text, rel).body);
    else if (/^notes\/[^/]+\.md$/.test(rel) && NOTE_NAMES.includes(rel.slice(6, -3))) flat.set(rel, readFrontmatter(text, rel).body);
    else if (/^[^/]+\/[^/]+\.md$/.test(rel) && ELEMENT_TYPES[rel.split('/')[0]]) flat.set(rel, withoutGbrainKeys(text, rel));
  }
  if (viewPages.length) {
    const pos = v => (Number.isInteger(v.position) ? v.position : Infinity);
    viewPages.sort((a, b) => pos(a) - pos(b) || (a.key < b.key ? -1 : 1));
    flat.set('views.json', json(viewPages.map(v => v.view)));
  }
  const { raw, notes, ctx } = readVaultFiles(flat, { anyFormat });
  const out = vaultFiles({ raw, notes }, { ctx }, { read: rel => flat.get(rel) });
  for (const [rel, text] of flat) if (rel.startsWith(REMOVED) && !out.has(rel)) out.set(rel, text);
  return out;
}
