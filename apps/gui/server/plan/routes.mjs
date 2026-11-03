// The planning routes: /plan (the agent, as NDJSON), /plan/open (restore a draft) and /plan/preview (draw it).
import { newDraft, checkDraft, replanDraft, DRAFT_MAX_BYTES } from './draft.mjs';
import { runPlan } from './agent.mjs';
import { buildPreview } from './preview.mjs';

const MESSAGE_MAX = 20000;
const HISTORY_MAX = 40;
const SPECS_MAX = 20;
const BODY_MAX = DRAFT_MAX_BYTES + 256 * 1024; // a draft plus the message and the history
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The draft from the browser: validated, then planned again over the current base (never used as sent). */
function draftFrom(ctx, raw) {
  if (ctx.store?.remote) {
    throw Object.assign(new Error('planejar ainda não funciona numa base gbrain no modo MCP; use a skill archlens-plan'), { status: 409, code: 'E_GUI_PLAN_MCP' });
  }
  return replanDraft(ctx, checkDraft(raw, ctx));
}

function historyOf(history, httpError) {
  if (history === undefined) return [];
  if (!Array.isArray(history) || history.length > HISTORY_MAX
    || !history.every(m => isObject(m) && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.length <= MESSAGE_MAX)) {
    throw httpError(400, 'history inválido: use uma lista de { role, text }');
  }
  return history.map(({ role, text }) => ({ role, text }));
}

/**
 * Route table entries, to be mounted only when planning is on.
 * `h` brings the server's helpers (readJson, httpError, streaming headers) so this file does not import app.mjs.
 */
export function planRoutes({ registry, provider, config, telemetry, h }) {
  const { readJson, httpError, STREAMED, NDJSON_HEADERS } = h;

  async function plan(req, res, b) {
    const body = await readJson(req, BODY_MAX);
    const ctx = registry.get(b);
    const message = typeof body.message === 'string' ? body.message.trim() : undefined;
    if (body.message !== undefined && message === undefined) throw httpError(400, 'message deve ser texto');
    if (message && message.length > MESSAGE_MAX) throw httpError(400, `a mensagem passa de ${MESSAGE_MAX} caracteres`);
    const { answer } = body;
    if (answer !== undefined && !(isObject(answer) && typeof answer.key === 'string' && typeof answer.resolution === 'string')) {
      throw httpError(400, 'answer deve ser { key, resolution }');
    }
    if (!message && !answer) throw httpError(400, 'informe a mensagem em {message} ou a resposta em {answer}');
    // `history` holds the prior turns only; the current text goes only in `message` (the agent adds it itself).
    const history = historyOf(body.history, httpError);
    const replanned = draftFrom(ctx, body.draft === undefined ? newDraft(ctx) : body.draft);

    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    res.writeHead(200, NDJSON_HEADERS);
    const write = ev => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(ev) + '\n'); };
    const t0 = Date.now();
    let metrics = { total: 0, llm: 0, tools: 0, rounds: 0, calls: 0, mode: 'tools', usage: { input: 0, output: 0, cacheRead: 0 } };
    let outcome = 'error';
    try {
      const out = await runPlan(ctx, { draft: replanned.draft, message, answer, history }, {
        provider, signal: ctl.signal, emit: write, maxRounds: config.plan.maxRounds, timeoutMs: config.plan.timeoutMs, maxTokens: config.plan.maxTokens,
      });
      metrics = out.metrics;
      let { reply } = out;
      if (replanned.warning && !reply.warning) reply = { ...reply, warning: replanned.warning };
      outcome = reply.kind;
      write({ type: 'result', draft: out.draft, reply, previews: out.previews });
    } catch (e) {
      metrics.total = Date.now() - t0;
      if (e.code !== 'E_LLM_ABORT' || !ctl.signal.aborted) {
        // The work done so far goes back with the error.
        write({ type: 'error', error: e.message ?? String(e), ...(e.code ? { code: e.code } : {}), draft: e.draft ?? replanned.draft, previews: e.previews ?? [],
          ...(replanned.warning ? { warning: replanned.warning } : {}) });
      }
    }
    write({ type: 'done', metrics });
    if (!ctl.signal.aborted) {
      telemetry.record({
        at: new Date().toISOString(), base: b, route: 'plan', provider: provider.name, model: provider.model, mode: 'tools', outcome,
        ms: { total: metrics.total, llm: metrics.llm, tools: metrics.tools }, rounds: metrics.rounds, calls: metrics.calls,
        cacheRead: metrics.usage?.cacheRead ?? 0, question: message,
      });
    }
    res.end();
    return STREAMED;
  }

  return [
    ['POST', /^\/api\/bases\/([^/]+)\/plan$/, (req, [b], _url, res) => plan(req, res, b)],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/open$/, async (req, [b]) => {
      const { draft } = await readJson(req, BODY_MAX);
      return draftFrom(registry.get(b), draft);
    }],
    ['POST', /^\/api\/bases\/([^/]+)\/plan\/preview$/, async (req, [b]) => {
      const { draft, specs } = await readJson(req, BODY_MAX);
      if (specs !== undefined && !(Array.isArray(specs) && specs.every(isObject))) throw httpError(400, 'specs deve ser uma lista de visões');
      if (specs && specs.length > SPECS_MAX) throw httpError(400, `no máximo ${SPECS_MAX} visões por pedido`);
      const ctx = registry.get(b);
      return buildPreview(ctx, draftFrom(ctx, draft).draft, specs);
    }],
  ];
}
