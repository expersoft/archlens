// The tools the search agent can call. Query tools return text for the model; final tools end the search.
import { resolveView } from '../../../../scripts/lib/query.mjs';
import { layoutView } from '../../../../scripts/lib/layout.mjs';
import { viewAlerts } from '../../../../scripts/lib/view-build.mjs';
import { query } from '../../../../scripts/lib/api.mjs';
import { explainEdge } from '../../../../scripts/lib/explain.mjs';
import { suggestViews } from '../../../../scripts/lib/suggest.mjs';
import { LAYER_LABELS } from '../../../../scripts/lib/registry.mjs';
import { findElements, labelsOf } from '../catalog.mjs';

const str = { type: 'string' };
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const QUERY_TOOLS = [
  { name: 'find_elements', description: 'Busca elementos da base pelo nome, id ou apelido. Devolve até 10 linhas "id | nome | tipo | c4".',
    input_schema: obj({ text: str }, ['text']) },
  { name: 'element_card', description: 'Cartão de um elemento: descrição, relações, filhos e histórico.',
    input_schema: obj({ id: str }, ['id']) },
  { name: 'relations', description: 'Relações que tocam os elementos dados, com uma frase cada. "via" filtra pelos tipos de relação.',
    input_schema: obj({ ids: { type: 'array', items: str }, via: { type: 'array', items: str } }, ['ids']) },
  { name: 'try_view', description: 'Resolve uma spec de visão sem mostrá-la: devolve o resumo (nós, camadas, alertas) ou o erro.',
    input_schema: obj({ spec: { type: 'object' } }, ['spec']) },
];

export const FINAL_TOOLS = [
  { name: 'show_view', description: 'Mostra a visão e encerra. Informe "view" (chave salva ou sugerida) ou "spec". "answer" marca que a própria visão responde à pergunta; "confirmLarge" aceita mais de 40 nós.',
    input_schema: obj({ spec: { type: 'object' }, view: str, title: str, answer: { type: 'boolean' }, confirmLarge: { type: 'boolean' } }) },
  { name: 'show_element', description: 'Mostra o cartão de um elemento e encerra.',
    input_schema: obj({ id: str }, ['id']) },
  { name: 'clarify', description: 'Pergunta ao usuário qual elemento ele quis dizer, com ids como opções, e encerra.',
    input_schema: obj({ question: str, options: { type: 'array', items: str } }, ['question', 'options']) },
];

// Fixed order: the prompt cache depends on it.
export const ALL_TOOLS = [...QUERY_TOOLS, ...FINAL_TOOLS];

const FIND_LIMIT = 10, RELATIONS_LIMIT = 80, NAMES_LIMIT = 40, LARGE = 40;
const fail = content => ({ ok: false, content });
const withKey = spec => ({ key: 'ask', ...spec });
const isObject = v => v && typeof v === 'object' && !Array.isArray(v);

function findTool(ctx, { text }) {
  const found = findElements(ctx, text, FIND_LIMIT);
  if (!found.length) return { ok: true, content: `nenhum elemento para "${text}"` };
  return { ok: true, content: found.map(e => [e.id, e.name, e.type, e.kind ?? '-'].join(' | ')).join('\n') };
}

function cardTool(ctx, { id }) {
  try {
    return { ok: true, content: query(ctx.snapshot, { element: id, format: 'md' }) };
  } catch (e) { return fail(e.message); }
}

function relationsTool(ctx, { ids, via }) {
  const set = new Set(ids ?? []);
  const nodes = {};
  for (const e of ctx.model.elements.values()) nodes[e.id] = { name: e.name, type: e.type };
  const hits = ctx.model.relationships.filter(r => (set.has(r.from) || set.has(r.to)) && (!via?.length || via.includes(r.type)));
  if (!hits.length) return { ok: true, content: 'nenhuma relação' };
  const lines = hits.slice(0, RELATIONS_LIMIT).map(r => {
    const sentence = explainEdge({ from: r.from, to: r.to, type: r.type, label: r.description, technology: r.technology }, nodes, 'archimate').sentence;
    return `${r.from} (${nodes[r.from]?.name ?? r.from}) -${r.type}-> ${r.to} (${nodes[r.to]?.name ?? r.to}): ${sentence}`;
  });
  if (hits.length > RELATIONS_LIMIT) lines.push(`… ${hits.length - RELATIONS_LIMIT} mais`);
  return { ok: true, content: lines.join('\n') };
}

function countBy(nodes, label) {
  const m = new Map();
  for (const n of nodes) m.set(label(n), (m.get(label(n)) ?? 0) + 1);
  return [...m].map(([k, v]) => `${k} ${v}`).join(', ');
}

async function tryViewTool(ctx, { spec }) {
  if (!isObject(spec)) return fail('informe "spec" como objeto');
  const full = withKey(spec);
  let view;
  try { view = resolveView(ctx.model, full); } catch (e) { return fail(e.message); }
  if (!view.nodes.length) return fail('a visão ficou vazia: nenhum elemento atende à spec; ajuste anchor, scope, layers ou status');
  const lines = [`nós: ${view.nodes.length}`];
  lines.push(`por ${full.notation === 'archimate' ? 'camada' : 'tipo'}: ` + countBy(view.nodes,
    n => full.notation === 'archimate' ? LAYER_LABELS[n.layer] ?? n.layer : n.c4Label ?? n.type));
  const names = view.nodes.slice(0, NAMES_LIMIT).map(n => n.name).join(', ');
  lines.push(`nomes: ${names}${view.nodes.length > NAMES_LIMIT ? `, … ${view.nodes.length - NAMES_LIMIT} mais` : ''}`);
  try {
    const alerts = viewAlerts(view, await layoutView(view));
    if (alerts.length) lines.push('alertas:', ...alerts.map(a => `- ${a}`));
  } catch (e) { return fail(e.message); }
  return { ok: true, content: lines.join('\n'), best: { spec: full, nodes: view.nodes.length } };
}

const QUERY = { find_elements: findTool, element_card: cardTool, relations: relationsTool, try_view: tryViewTool };

/** Runs one query tool for the model. Never throws: errors come back as `ok: false`. */
export async function runTool(ctx, name, input) {
  const fn = QUERY[name];
  if (!fn) return fail(`ferramenta desconhecida: ${name}`);
  try { return await fn(ctx, input ?? {}); } catch (e) { return fail(e.message); }
}

function suggestionsFor(ctx, text) {
  const s = findElements(ctx, text, 5);
  return s.length ? `; quis dizer: ${s.map(e => `${e.id} (${e.name})`).join(', ')}?` : '';
}

function showView(ctx, { spec, view, title, answer, confirmLarge }) {
  let picked;
  if (view) {
    picked = ctx.model.views.find(v => v.key === view);
    if (!picked) {
      const sug = suggestViews(ctx.model).find(v => v.key === view);
      if (sug) { const { why, ...rest } = sug; picked = rest; }
    }
    if (!picked) return fail(`visão "${view}" não existe; use uma chave de "Visões salvas" ou passe "spec"`);
  } else if (isObject(spec)) picked = withKey(spec);
  else return fail('informe "view" ou "spec"');
  let resolved;
  try { resolved = resolveView(ctx.model, picked); } catch (e) { return fail(e.message); }
  const n = resolved.nodes.length;
  if (!n) return fail('a visão ficou vazia: nenhum elemento atende à spec; ajuste anchor, scope, layers ou status');
  if (n > LARGE && !confirmLarge) {
    return fail(`a visão tem ${n} nós (mais de ${LARGE}); alerta: considere focus/depth, collapse ou layers para recortar, ou confirme com confirmLarge`);
  }
  return { ok: true, result: { kind: 'view', spec: picked, ...(title ? { title } : {}), ...(answer != null ? { answer: !!answer } : {}) } };
}

function showElement(ctx, { id }) {
  if (ctx.model.elements.has(id)) return { ok: true, result: { kind: 'element', id } };
  return fail(`"${id}" não existe na base${suggestionsFor(ctx, id)}`);
}

function clarify(ctx, { question, options }) {
  const out = [];
  for (const id of options ?? []) {
    const e = ctx.model.elements.get(id);
    if (e && !out.some(o => o.id === id)) out.push({ id, name: e.name, ...labelsOf(ctx, e) });
  }
  if (!out.length) return fail('nenhuma das opções existe na base; use ids de find_elements');
  return { ok: true, result: { kind: 'clarify', question, options: out } };
}

const FINAL = { show_view: showView, show_element: showElement, clarify };

/** Runs a final tool: the validated `AskResult`, or the reason the model must fix. */
export function finalize(ctx, name, input) {
  const fn = FINAL[name];
  if (!fn) return fail(`ferramenta desconhecida: ${name}`);
  try { return fn(ctx, input ?? {}); } catch (e) { return fail(e.message); }
}
