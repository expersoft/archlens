// The planning agent: drives a provider through the planning tools until a final reply, within round/token/time ceilings.
import { openQuestions } from '../../../../scripts/lib/merge.mjs';
import { compactCatalog } from '../ask/context.mjs';
import { combine, raceAbort } from '../ask/agent.mjs';
import { loadPlanPrompt } from './prompt.mjs';
import { PLAN_TOOLS, runPlanTool, external } from './tools.mjs';
import { replanDraft } from './draft.mjs';

const REMINDER = 'Responda chamando reply, ask_user, ask_decision ou draft_notes.';
const HISTORY_LIMIT = 12;
const QUERY = new Set(['find_elements', 'element_card', 'relations', 'try_view']);
const abortError = () => Object.assign(new Error('planejamento cancelado'), { code: 'E_LLM_ABORT' });
const sum = (a, b) => ({ input: a.input + (b?.input ?? 0), output: a.output + (b?.output ?? 0), cacheRead: a.cacheRead + (b?.cacheRead ?? 0) });

// What the model gets to know about the draft; all of it is external content.
function draftState(draft) {
  const lines = [];
  lines.push(draft.delta ? `delta:\n${JSON.stringify(draft.delta)}` : 'delta: nenhum');
  if (draft.plan) {
    const open = openQuestions(draft.plan);
    lines.push(draft.plan.blocked ? 'plano: bloqueado'
      : open.length ? `plano: aberto, ${open.length} pergunta(s) sem resposta: ${open.map(i => `${i.key} (${i.class})`).join(', ')}`
        : 'plano: final');
    const counts = Object.entries(draft.plan.summary ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    if (counts) lines.push(`itens do plano: ${counts}`);
    const given = draft.plan.items.filter(i => i.resolution !== undefined && i.resolution !== null).map(i => `${i.key} = ${i.resolution}`);
    if (given.length) lines.push(`respostas já dadas: ${given.join('; ')}`);
  } else lines.push('plano: nenhum');
  if (draft.note) lines.push(`nota: ${draft.note}`);
  if (draft.repo) lines.push(`repositório: ${draft.repo.url}${draft.repo.ref ? ` @ ${draft.repo.ref}` : ''} (${draft.repo.commit})`);
  return lines.join('\n');
}

function userText(req, draft) {
  const history = (req.history ?? []).slice(-HISTORY_LIMIT).map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`);
  const parts = [];
  if (history.length) parts.push(`Conversa até aqui:\n${history.join('\n')}`);
  parts.push(`Estado do rascunho:\n${external('rascunho', draftState(draft))}`);
  if (req.answer) parts.push(`O usuário respondeu à decisão ${req.answer.key}: ${req.answer.resolution}`);
  if (req.message) parts.push(`Mensagem do usuário:\n${req.message}`);
  return parts.join('\n\n');
}

function applyAnswer(ctx, draft, { key, resolution }) {
  const items = draft.plan?.items ?? [];
  if (!items.some(i => i.key === key)) throw Object.assign(new Error(`a decisão "${key}" não está no plano do rascunho`), { code: 'E_GUI_DRAFT' });
  const plan = { ...draft.plan, items: items.map(i => (i.key === key ? { ...i, resolution } : i)) };
  return replanDraft(ctx, { ...draft, plan });
}

/** @returns {Promise<{ draft: object, reply: object, previews: object[], metrics: object }>} */
export async function runPlan(ctx, req, { provider, maxRounds = 12, timeoutMs = 90000, maxTokens = 200000, signal, emit = () => {} } = {}) {
  const t0 = Date.now();
  const metrics = { total: 0, llm: 0, tools: 0, rounds: 0, calls: 0, mode: 'tools', usage: { input: 0, output: 0, cacheRead: 0 } };
  const base = req.draft.usage?.tokens ?? 0;
  const session = { draft: req.draft, previews: [] };
  let warning;
  emit({ type: 'stage', stage: 'lendo o pedido' });
  if (req.answer) {
    const r = applyAnswer(ctx, session.draft, req.answer);
    session.draft = r.draft;
    warning = r.warning;
  }
  const system = [loadPlanPrompt(), compactCatalog(ctx).text];
  const conv = provider.open({ system, tools: PLAN_TOOLS });
  const { ctl, done } = combine(signal, timeoutMs);
  const finish = (reply, extra) => {
    metrics.total = Date.now() - t0;
    const w = [warning, extra].filter(Boolean).join('; ') || undefined;
    session.draft = { ...session.draft, usage: { tokens: tokens() } };
    return { draft: session.draft, reply: w && !reply.warning ? { ...reply, warning: w } : reply, previews: session.previews, metrics };
  };
  const stopped = reason => finish({ kind: 'none' }, reason);

  const send = async input => {
    metrics.rounds++;
    let out;
    try { out = await raceAbort(conv.send(input, { signal: ctl.signal }), ctl.signal); }
    catch (e) {
      if (ctl.signal.aborted) throw abortError();
      throw e;
    }
    metrics.llm += out.ms ?? 0;
    metrics.usage = sum(metrics.usage, out.usage);
    return out;
  };
  const tokens = () => base + metrics.usage.input + metrics.usage.output;

  try {
    let input = { text: userText(req, session.draft) };
    let reminded = false;
    while (metrics.rounds < maxRounds) {
      // One turn can go past the cap: it is only checked before each send.
      if (tokens() >= maxTokens) return stopped(`teto de ${maxTokens} tokens por rascunho`);
      const out = await send(input);
      if (!out.calls.length) {
        if (reminded) return finish({ kind: 'text', text: out.text ?? '' });
        reminded = true;
        input = { text: REMINDER };
        continue;
      }
      const results = [];
      let final = null;
      for (const c of out.calls) {
        metrics.calls++;
        emit({ type: 'stage', stage: QUERY.has(c.name) ? 'consultando a base' : 'planejando' });
        const s = Date.now();
        const r = await runPlanTool(ctx, session, c.name, c.input);
        const ms = Date.now() - s;
        metrics.tools += ms;
        emit({ type: 'tool', name: c.name, ok: r.ok, ms });
        if (r.ok && r.final && !final) final = r.final;
        results.push({ id: c.id, content: r.content ?? 'ok', ...(r.ok ? {} : { isError: true }) });
      }
      if (final) return finish(final);
      input = { results };
    }
    return stopped(`teto de ${maxRounds} rodadas`);
  } catch (e) {
    if (e.code === 'E_LLM_ABORT' && ctl.timedOut && !signal?.aborted) return stopped(`teto de ${Math.round(timeoutMs / 1000)} s`);
    // Keep the tool work so the route can still return it.
    e.draft = { ...session.draft, usage: { tokens: tokens() } };
    e.previews = session.previews;
    throw e;
  } finally { done(); }
}
