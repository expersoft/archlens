// One element as an Obsidian/gbrain page: YAML frontmatter (the element, its outgoing relationships, derived link fields
// and tags), a title, the description, an archlens block (relationships and children as wikilinks) and, after it, the
// text people write, kept as is.
import { parse as parseYaml, stringify as stringifyYaml } from '../../vendor/yaml/index.js';
import { RELATIONSHIP_TYPES } from '../registry.mjs';
import { storeError } from './errors.mjs';

export const BEGIN = '<!-- archlens:begin -->';
export const END = '<!-- archlens:end -->';
const LINK_FIELDS = Object.keys(RELATIONSHIP_TYPES);
const SIMPLE = ['technology', 'owner', 'url', 'external', 'status', 'statusReason', 'inferred', 'confidence'];
const KNOWN = new Set(['id', 'type', 'name', 'description', 'c4', 'tags', 'parent', 'group', 'aliases', ...SIMPLE, 'properties', 'sources']);
const TAG = 'archlens/';
const display = s => String(s).replace(/[[\]|\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

export const pagePath = el => `${el.type}/${el.id}.md`;

/** `[[<prefix>type/id|name]]` for an element id; the bare id when the element is unknown. */
export const link = (id, info, prefix = '') => { const t = info(id); return t ? `[[${prefix}${t.type}/${id}|${display(t.name ?? id)}]]` : id; };
/** The id inside `[[<folders>/id|name]]` (or the value itself when it is not a wikilink). */
const unlink = v => {
  const m = typeof v === 'string' && /^\[\[(?:[^|\]]+\/)?([^|\]]+)(?:\|[^\]]*)?\]\]$/.exec(v.trim());
  return m ? m[1] : v;
};

/** `linkPrefix` ("archlens/") goes before the type folder of each wikilink; `extraTags` lead the tags. */
export function renderPage(el, { outgoing = [], children = [], info, userText, linkPrefix = '', extraTags = [] }) {
  const wikilink = (id, info) => link(id, info, linkPrefix);
  const fm = {};
  const put = (k, v) => { if (v !== undefined) fm[k] = v; };
  put('id', el.id);
  put('type', el.type);
  put('title', el.name);
  // The name comes first in aliases (Obsidian and gbrain find the page by it); reading drops it back out.
  put('aliases', el.name === undefined ? el.aliases : [el.name, ...(Array.isArray(el.aliases) ? el.aliases : [])]);
  put('c4', el.c4?.kind);
  put('parent', el.parent == null ? el.parent : wikilink(el.parent, info));
  put('group', el.group == null ? el.group : wikilink(el.group, info));
  for (const k of SIMPLE) put(k, el[k]);
  put('properties', el.properties);
  put('sources', el.sources);
  for (const [k, v] of Object.entries(el)) if (!KNOWN.has(k)) fm[k] = v; // fields this format does not know travel as is
  if (outgoing.length) fm.relationships = outgoing.map(({ from, id, type, to, ...more }) => ({ id, type, to, ...more }));
  for (const t of LINK_FIELDS) {
    const tos = [...new Set(outgoing.filter(r => r.type === t).map(r => wikilink(r.to, info)))];
    if (tos.length) fm[t] = tos;
  }
  fm.tags = [...extraTags, `${TAG}${el.type}`, ...(el.c4?.kind ? [`${TAG}c4/${el.c4.kind}`] : []), ...(el.tags ?? []).map(t => `${TAG}tag/${t}`)];
  // Every heading and list sits between blank lines (markdownlint MD022/MD032).
  const block = [BEGIN, ''];
  if (outgoing.length) {
    block.push('## Relações', '');
    for (const r of outgoing) {
      block.push(`- **${r.type}**${r.accessType ? ` (${r.accessType})` : ''} → ${wikilink(r.to, info)}${r.description ? ` — ${display(r.description)}` : ''}${r.technology ? ` [${display(r.technology)}]` : ''}`);
    }
    block.push('');
  }
  if (children.length) block.push('## Contém', '', ...children.map(id => `- ${wikilink(id, info)}`), '');
  block.push(END);
  const description = el.description != null && el.description !== '' ? `${el.description}\n\n` : '';
  return `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n# ${display(el.name ?? el.id)}\n\n${description}${block.join('\n')}${userText ?? '\n'}`;
}

export function parsePage(text, rel) {
  // The closing fence counts only at the start of a line, so a value holding "---" stays in the frontmatter.
  const m = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) throw storeError('E_STORE_MD', `${rel}: falta o frontmatter (--- … ---) no início do arquivo`, { file: rel });
  let fm;
  try { fm = parseYaml(m[1] ?? ''); } catch (e) {
    throw storeError('E_STORE_MD', `${rel}: YAML inválido no frontmatter: ${e.message}`, { file: rel });
  }
  if (!fm || typeof fm !== 'object' || typeof fm.id !== 'string' || typeof fm.type !== 'string') {
    throw storeError('E_STORE_MD', `${rel}: o frontmatter precisa de "id" e "type"`, { file: rel });
  }
  const body = text.slice(m[0].length);
  const head = /^# .*\r?\n/.exec(body);
  const start = head ? head[0].length : 0;
  const b = body.indexOf(BEGIN), e = body.indexOf(END);
  let description, userText;
  if (b >= 0 && e > b) {
    const between = body.slice(start, b);
    description = between === '\n' ? undefined : (/^\n([\s\S]*)\n\n$/.exec(between)?.[1] ?? (between.trim() || undefined));
    userText = body.slice(e + END.length);
  } else {
    description = body.slice(start).trim() || undefined;
    userText = '\n';
  }
  const { id, type, title, c4, parent, group, tags, relationships, ...rest } = fm;
  for (const t of LINK_FIELDS) delete rest[t];
  if (title !== undefined && Array.isArray(rest.aliases) && rest.aliases[0] === title) {
    rest.aliases = rest.aliases.slice(1);
    if (!rest.aliases.length) delete rest.aliases;
  }
  const element = { id, type, ...(title !== undefined ? { name: title } : {}), ...(description !== undefined ? { description } : {}), ...rest };
  if (c4 != null) element.c4 = { kind: c4 };
  if (parent !== undefined) element.parent = parent === null ? null : unlink(parent);
  if (group !== undefined) element.group = group === null ? null : unlink(group);
  const own = (Array.isArray(tags) ? tags : []).filter(t => typeof t === 'string' && t.startsWith(`${TAG}tag/`)).map(t => t.slice(`${TAG}tag/`.length));
  if (own.length) element.tags = own;
  const rels = (Array.isArray(relationships) ? relationships : []).map((r, i) => {
    if (!r || typeof r.id !== 'string' || typeof r.type !== 'string' || typeof r.to !== 'string') {
      throw storeError('E_STORE_MD', `${rel}: a relação ${i + 1} precisa de "id", "type" e "to"`, { file: rel });
    }
    return { from: id, ...r };
  });
  return { element, relationships: rels, userText };
}
