// What the search agent is told about a base: the system prompt, a compact catalog and the user message.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const CATALOG_LIMIT = 40_000;

/** @typedef {{ question: string, context?: { spec?: object, nodes?: string[], selected?: string | null },
 *   history?: { question: string, title?: string }[], chosen?: string }} AskRequest */

const cell = v => {
  const s = String(v ?? '').replace(/[|\r\n]+/g, ' ').trim();
  return s || '-';
};
const row = (...cells) => cells.map(cell).join(' | ');

const SUMMARY_KINDS = new Set(['person', 'softwareSystem', 'container']);
const SUMMARY_HEAD = 'catálogo resumido: use find_elements para o resto';

const memo = new Map();
const MEMO_MAX = 16;

/** One line per element (`id | nome | tipo | c4 | pai | apelidos`) and the saved views; summarized above `limit`. */
export function compactCatalog(ctx, { limit = CATALOG_LIMIT } = {}) {
  const key = `${ctx.id}\n${ctx.version}\n${limit}`;
  if (memo.has(key)) return memo.get(key);
  const views = ['## Visões salvas', ...ctx.model.views.map(v => row(v.key, v.title ?? v.key))];
  const line = e => row(e.id, e.name, e.type, ctx.kind(e), e.parent, (e.aliases ?? []).join(', '));
  const elements = [...ctx.model.elements.values()];
  let text = [...elements.map(line), '', ...views].join('\n');
  let summarized = false;
  if (text.length > limit) {
    summarized = true;
    const top = elements.filter(e => e.type === 'grouping' || SUMMARY_KINDS.has(ctx.kind(e)));
    text = [SUMMARY_HEAD, ...top.map(line), '', ...views].join('\n');
  }
  const out = { text, summarized };
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
  memo.set(key, out);
  return out;
}

/** `origem -tipo-> destino` per relationship, cut at `limit` characters (JSON mode). */
export function relationsDigest(ctx, { limit = CATALOG_LIMIT } = {}) {
  const rels = ctx.model.relationships;
  const lines = [];
  let size = 0;
  for (const r of rels) {
    const l = `${r.from} -${r.type}-> ${r.to}`;
    if (size + l.length + 1 > limit) break;
    lines.push(l);
    size += l.length + 1;
  }
  if (lines.length < rels.length) lines.push(`… ${rels.length - lines.length} relações omitidas`);
  return lines.join('\n');
}

const MAX_NODES = 60;
const MAX_HISTORY = 4;

/** The question plus what the screen shows, the selection, the user's choice and the recent conversation. */
export function userMessage(req, ctx) {
  const parts = [req.question];
  const c = req.context ?? {};
  if (c.spec) parts.push(`Visão atual: ${JSON.stringify(c.spec)}`);
  if (c.nodes?.length) parts.push(`Nós visíveis: ${c.nodes.slice(0, MAX_NODES).join(', ')}`);
  if (c.selected) parts.push(`Selecionado: ${c.selected}`);
  if (req.chosen) parts.push(`Escolha do usuário: ${req.chosen} (${ctx.model.elements.get(req.chosen)?.name ?? req.chosen})`);
  const hist = (req.history ?? []).slice(-MAX_HISTORY);
  if (hist.length) parts.push(['Conversa recente:', ...hist.map(h => `- ${h.question} → ${h.title ?? '(sem resultado)'}`)].join('\n'));
  return parts.join('\n\n');
}

const prompts = {};

/** System prompt: the generated one, plus the JSON-mode protocol when there are no tools. Read once per process. */
export function loadPrompt({ mode }) {
  prompts.base ??= readFileSync(join(here, 'system-prompt.md'), 'utf8');
  if (mode !== 'json') return prompts.base;
  prompts.json ??= prompts.base + readFileSync(join(here, 'prompt-json.md'), 'utf8');
  return prompts.json;
}
