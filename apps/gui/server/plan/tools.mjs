// The tools the planning agent can call. Query tools reuse the search executors; none of them writes the base.
import { readFileSync } from 'node:fs';
import { plan as planDelta, show } from '../../../../scripts/lib/api.mjs';
import { openQuestions, validResolution } from '../../../../scripts/lib/merge.mjs';
import { describeItem } from '../../../../scripts/lib/merge-report.mjs';
import { QUERY_TOOLS, findTool, cardTool, relationsTool, tryViewTool } from '../ask/tools.mjs';
import { replanDraft } from './draft.mjs';

const str = { type: 'string' };
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const REFERENCES = ['merge', 'free-text', 'repo-reading', 'base', 'notation', 'archimate', 'c4', 'views'];

const OPTIONS = { conflict: ['keep', 'take', 'value:<x>'], 'view-conflict': ['keep', 'take'], 'possible-duplicate': ['same', 'different'], op: ['yes', 'no'] };
const optionsOf = it => OPTIONS[it.class === 'conflict' && it.kind === 'view' ? 'view-conflict' : it.class] ?? [];

const PLAN_ONLY = [
  { name: 'read_reference', description: `Lê uma referência do archlens (references/<nome>.md). Nomes: ${REFERENCES.join(', ')}.`,
    input_schema: obj({ name: { type: 'string', enum: REFERENCES } }, ['name']) },
  { name: 'set_delta', description: 'Guarda o delta (archlens-delta 1.0) do rascunho, depois de validá-lo. Um delta novo descarta o plano anterior.',
    input_schema: obj({ delta: { type: 'object' } }, ['delta']) },
  { name: 'plan_draft', description: 'Planeja o delta do rascunho contra a base e devolve o resumo: perguntas abertas ou contagens do plano final.',
    input_schema: obj({}) },
  { name: 'show_plan', description: 'Relatório do plano atual do rascunho (o que muda na base e o que está pendente).',
    input_schema: obj({}) },
  { name: 'set_note', description: 'Guarda a nota do rascunho (por que a mudança, premissas).',
    input_schema: obj({ text: str }, ['text']) },
  { name: 'add_preview', description: 'Valida uma spec de visão e a junta às prévias mostradas ao usuário. Não encerra a rodada.',
    input_schema: obj({ spec: { type: 'object' } }, ['spec']) },
  { name: 'ask_decision', description: 'Pergunta ao usuário uma decisão aberta do plano (key de plan_draft), com a sua recomendação e o motivo, e encerra a rodada.',
    input_schema: obj({ key: str, recommendation: str, reason: str }, ['key', 'recommendation', 'reason']) },
  { name: 'ask_user', description: 'Faz uma pergunta livre ao usuário e encerra a rodada.',
    input_schema: obj({ question: str }, ['question']) },
  { name: 'reply', description: 'Responde ao usuário em texto e encerra a rodada.',
    input_schema: obj({ text: str }, ['text']) },
  { name: 'draft_notes', description: 'Propõe ao usuário as notas de interpretação da rodada aplicada (overview: propósito, decisões, riscos; notes: notas) e encerra a rodada. Não grava: o usuário revisa e aprova.',
    input_schema: obj({ overview: str, notes: str }) },
];

// Fixed order: the prompt cache depends on it.
export const PLAN_TOOLS = [...QUERY_TOOLS, ...PLAN_ONLY];

const fail = content => ({ ok: false, content });
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Text from outside the user's turn (base, repository, delta) between the content marks; marks inside it are neutralized. */
export function external(origin, text) {
  const safe = String(text).replace(/<(\/?conteudo-externo)/gi, '&lt;$1');
  return `<conteudo-externo origem="${String(origin).replace(/[^\w.-]/g, '')}">\n${safe}\n</conteudo-externo>`;
}

const fromBase = r => (r.ok ? { ok: true, content: external('base', r.content) } : r);

function readReference(_ctx, _session, { name }) {
  if (!REFERENCES.includes(name)) return fail(`referência desconhecida; use uma de: ${REFERENCES.join(', ')}`);
  return { ok: true, content: readFileSync(new URL(`../../../../references/${name}.md`, import.meta.url), 'utf8') };
}

function setDelta(ctx, session, { delta }) {
  if (!isObject(delta)) return fail('informe "delta" como objeto');
  try { planDelta(ctx.store, delta); } catch (e) { return fail(e.message); }
  session.draft = { ...session.draft, delta, plan: null };
  return { ok: true, content: 'delta guardado; rode plan_draft para planejar' };
}

function planSummary(plan) {
  if (plan.blocked) {
    const list = plan.errors.slice(0, 10).map(e => `- ${e.message ?? e}`).join('\n');
    return `plano bloqueado, ${plan.errors.length} erro(s):\n${external('plano', list)}`;
  }
  if (plan.state === 'open') {
    const open = openQuestions(plan);
    const first = open[0];
    return `plano aberto: ${open.length} pergunta(s) sem resposta. Primeira: ${first.n} (${first.key}, ${first.class})\n${external('plano', describeItem(first))}`;
  }
  const counts = Object.entries(plan.summary).map(([k, v]) => `${k}: ${v}`).join(', ');
  return `plano final: ${counts || 'sem itens'}; ${plan.ops.length} operação(ões) na base`;
}

function planDraftTool(ctx, session) {
  if (!session.draft.delta) return fail('o rascunho não tem delta; use set_delta antes');
  const { draft, warning } = replanDraft(ctx, session.draft);
  session.draft = draft;
  return { ok: true, content: `${planSummary(draft.plan)}${warning ? `\naviso: ${warning}` : ''}` };
}

function showPlan(ctx, session) {
  if (!session.draft.plan) return fail('o rascunho não tem plano; use plan_draft antes');
  return { ok: true, content: external('plano', show(ctx.store, session.draft.plan)) };
}

function setNote(_ctx, session, { text }) {
  if (typeof text !== 'string') return fail('informe "text" como texto');
  session.draft = { ...session.draft, note: text };
  return { ok: true, content: 'nota guardada' };
}

async function addPreview(ctx, session, { spec }) {
  const r = await tryViewTool(ctx, { spec });
  if (!r.ok) return r;
  session.previews.push(spec);
  return { ok: true, content: `prévia ${session.previews.length} adicionada\n${external('base', r.content)}` };
}

function askDecision(_ctx, session, { key, recommendation, reason }) {
  const open = session.draft.plan ? openQuestions(session.draft.plan) : [];
  const item = open.find(i => i.key === key);
  if (!item) return fail(`"${key}" não é uma pergunta aberta do plano; abertas: ${open.map(i => i.key).join(', ') || 'nenhuma'}`);
  if (!validResolution(item, recommendation)) return fail(`recomendação inválida; use uma de: ${optionsOf(item).join(', ')}`);
  if (typeof reason !== 'string' || !reason.trim()) return fail('informe "reason"');
  const { n, class: kind } = item;
  return { ok: true, content: 'decisão enviada ao usuário',
    final: { kind: 'decision', item: { n, key, class: kind, question: describeItem(item).split('  → ')[0], options: optionsOf(item), recommendation, reason } } };
}

function askUser(_ctx, _session, { question }) {
  if (typeof question !== 'string' || !question.trim()) return fail('informe "question"');
  return { ok: true, content: 'pergunta enviada ao usuário', final: { kind: 'question', question } };
}

function reply(_ctx, _session, { text }) {
  if (typeof text !== 'string' || !text.trim()) return fail('informe "text"');
  return { ok: true, content: 'resposta enviada ao usuário', final: { kind: 'text', text } };
}

function draftNotes(_ctx, _session, { overview = '', notes = '' }) {
  if (typeof overview !== 'string' || typeof notes !== 'string') return fail('"overview" e "notes" são texto');
  if (!overview.trim() && !notes.trim()) return fail('informe "overview" ou "notes"');
  return { ok: true, content: 'notas enviadas ao usuário', final: { kind: 'notes', overview, notes } };
}

const RUN = {
  find_elements: (ctx, _s, i) => fromBase(findTool(ctx, i)),
  element_card: (ctx, _s, i) => fromBase(cardTool(ctx, i)),
  relations: (ctx, _s, i) => fromBase(relationsTool(ctx, i)),
  try_view: async (ctx, _s, i) => fromBase(await tryViewTool(ctx, i)),
  read_reference: readReference, set_delta: setDelta, plan_draft: planDraftTool, show_plan: showPlan, set_note: setNote,
  add_preview: addPreview, ask_decision: askDecision, ask_user: askUser, reply, draft_notes: draftNotes,
};

/** Runs one planning tool; `session` ({ draft, previews }) is changed in place. Never throws: errors come back as `ok: false`. */
export async function runPlanTool(ctx, session, name, input) {
  const fn = Object.hasOwn(RUN, name) ? RUN[name] : null;
  if (!fn) return fail(`ferramenta desconhecida: ${name}`);
  try { return await fn(ctx, session, input ?? {}); } catch (e) { return fail(e.message); }
}
