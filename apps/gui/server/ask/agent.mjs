// The search agent: drives a provider through the tools until a validated final answer, within round/time ceilings.
import { compactCatalog, relationsDigest, userMessage, loadPrompt } from './context.mjs';
import { ALL_TOOLS, QUERY_TOOLS, runTool, finalize } from './tools.mjs';

const REMINDER = 'Responda chamando show_view, show_element ou clarify.';
const FINAL_NAMES = ['show_view', 'show_element', 'clarify'];
const isQuery = name => QUERY_TOOLS.some(t => t.name === name);
const abortError = () => Object.assign(new Error('busca cancelada'), { code: 'E_LLM_ABORT' });
const sum = (a, b) => ({ input: a.input + (b?.input ?? 0), output: a.output + (b?.output ?? 0), cacheRead: a.cacheRead + (b?.cacheRead ?? 0) });

// First balanced `{...}` in the text (strings respected), parsed.
function firstJson(text) {
  for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
    let depth = 0, inStr = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(text.slice(i, j + 1)); } catch { break; }
      }
    }
  }
  throw new Error('a resposta não tem um objeto JSON válido');
}

// Node 18 has no AbortSignal.any.
function combine(signal, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => { ctl.timedOut = true; ctl.abort(); }, ms);
  const onAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  return { ctl, done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } };
}

// Rejects as soon as the signal aborts, even if the provider ignores it.
function raceAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** @returns {Promise<{ result: object, metrics: object }>} */
export async function runAsk(ctx, req, { provider, maxRounds = 4, timeoutMs = 45000, signal, emit = () => {} } = {}) {
  const t0 = Date.now();
  const mode = provider.tools ? 'tools' : 'json';
  const metrics = { total: 0, llm: 0, tools: 0, rounds: 0, calls: 0, mode, usage: { input: 0, output: 0, cacheRead: 0 } };
  const catalog = compactCatalog(ctx).text;
  const system = mode === 'tools'
    ? [loadPrompt({ mode: 'tools' }), catalog]
    : [loadPrompt({ mode: 'json' }), `${catalog}\n\n## Relações\n${relationsDigest(ctx)}`];
  const conv = provider.open({ system, tools: mode === 'tools' ? ALL_TOOLS : null });
  const { ctl, done } = combine(signal, timeoutMs);
  let best = null;
  const finish = (result, warning) => {
    metrics.total = Date.now() - t0;
    return { result: warning ? { ...result, warning } : result, metrics };
  };
  const ceiling = reason => best
    ? finish({ kind: 'view', spec: best.spec }, `${reason}: melhor resultado obtido`)
    : finish({ kind: 'none' }, reason);
  const roundsReason = () => `teto de ${maxRounds} rodadas`;
  const timeReason = () => `teto de ${Math.round(timeoutMs / 1000)} s`;

  const send = async input => {
    metrics.rounds++;
    let reply;
    try { reply = await raceAbort(conv.send(input, { signal: ctl.signal }), ctl.signal); }
    catch (e) {
      if (ctl.signal.aborted) throw abortError();
      throw e;
    }
    metrics.llm += reply.ms ?? 0;
    metrics.usage = sum(metrics.usage, reply.usage);
    return reply;
  };

  try {
    emit({ type: 'stage', stage: 'interpretando' });
    let input = { text: userMessage(req, ctx) };
    let jsonRetried = false;
    while (metrics.rounds < maxRounds) {
      const reply = await send(input);

      if (mode === 'json') {
        let failure;
        try {
          const obj = firstJson(reply.text ?? '');
          const name = FINAL_NAMES.find(n => n in obj);
          if (!name) throw new Error('o objeto não traz show_view, show_element nem clarify');
          emit({ type: 'stage', stage: 'montando a visão' });
          const out = finalize(ctx, name, obj[name]);
          if (out.ok) return finish(out.result);
          failure = out.content;
        } catch (e) { failure = e.message; }
        if (jsonRetried) return finish({ kind: 'none' }, `sem resposta válida: ${failure}`);
        jsonRetried = true;
        input = { text: `Resposta inválida: ${failure}. Responda de novo só com o objeto JSON.` };
        continue;
      }

      if (!reply.calls.length) {
        input = { text: REMINDER };
        continue;
      }
      const results = [];
      let final = null;
      for (const call of reply.calls) {
        metrics.calls++;
        const s = Date.now();
        let out;
        if (isQuery(call.name)) {
          emit({ type: 'stage', stage: 'consultando a base' });
          out = await runTool(ctx, call.name, call.input);
          if (out.best) best = out.best;
        } else {
          emit({ type: 'stage', stage: 'montando a visão' });
          out = finalize(ctx, call.name, call.input);
          if (!out.ok && call.name === 'show_view' && /confirmLarge/.test(out.content)) {
            const spec = call.input?.spec ?? ctx.model.views.find(v => v.key === call.input?.view);
            if (spec && typeof spec === 'object') best = { spec: call.input?.spec ? { key: 'ask', ...spec } : spec };
          }
          if (out.ok && !final) final = out.result;
        }
        const ms = Date.now() - s;
        metrics.tools += ms;
        emit({ type: 'tool', name: call.name, ok: out.ok, ms });
        results.push({ id: call.id, content: out.content ?? 'ok', ...(out.ok ? {} : { isError: true }) });
      }
      if (final) return finish(final);
      input = { results };
    }
    return ceiling(roundsReason());
  } catch (e) {
    if (e.code === 'E_LLM_ABORT' && ctl.timedOut && !signal?.aborted) return ceiling(timeReason());
    throw e;
  } finally { done(); }
}
