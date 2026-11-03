// LLM providers behind one interface: Anthropic (official SDK) and OpenAI-compatible (fetch).
// The API key and secret header values never appear in errors (see `redact`).
import Anthropic from '@anthropic-ai/sdk';

const configError = message => Object.assign(new Error(message), { code: 'E_GUI_CONFIG' });
const llmError = (code, message) => Object.assign(new Error(message), { code });
const BODY_LIMIT = 300;
const MAX_TOKENS = 8000;
const DEFAULTS = {
  anthropic: { model: 'claude-haiku-5-5', auth: 'x-api-key', apiKeyEnv: 'ANTHROPIC_API_KEY', endpoint: 'https://api.anthropic.com' },
  openai: { model: null, auth: 'bearer', apiKeyEnv: 'OPENAI_API_KEY', endpoint: 'https://api.openai.com/v1' },
};

// Replaces each secret, raw and JSON-escaped (a body may carry it escaped).
export const redact = (text, secrets) =>
  secrets.filter(Boolean).flatMap(s => [s, JSON.stringify(s).slice(1, -1)]).reduce((t, s) => t.split(s).join('***'), String(text));

const httpError = (status, body, secrets) =>
  llmError('E_LLM_HTTP', `o provedor de LLM respondeu ${status}: ${redact(body, secrets).slice(0, BODY_LIMIT)}`);
const abortError = () => llmError('E_LLM_ABORT', 'busca cancelada');

function resolveConfig(cfg, env) {
  const d = DEFAULTS[cfg.provider];
  if (!d) throw configError(`llm.provider deve ser "anthropic" ou "openai" (recebido: ${cfg.provider})`);
  const c = {
    provider: cfg.provider, model: cfg.model ?? d.model, effort: cfg.effort ?? 'low', endpoint: (cfg.endpoint ?? d.endpoint).replace(/\/+$/, ''),
    auth: cfg.auth ?? d.auth, headers: cfg.headers ?? {}, query: cfg.query ?? {},
    tools: cfg.tools ?? true, timeoutMs: cfg.timeoutMs ?? 45000,
  };
  if (!c.model) throw configError('defina llm.model para o provedor openai');
  const need = name => {
    // `missing` marks a credential gap (not a malformed config): a config file may then start with the search off.
    if (!env[name]) throw Object.assign(configError(`defina ${name} (ambiente ou .env) para a busca em texto`), { missing: name });
    return env[name];
  };
  c.key = c.auth === 'none' ? null : need(cfg.apiKeyEnv ?? d.apiKeyEnv);
  c.extra = {};
  for (const [header, variable] of Object.entries(cfg.headersEnv ?? {})) c.extra[header] = need(variable);
  c.secrets = [c.key, ...Object.values(c.extra)].filter(Boolean);
  return c;
}

const usageOf = (input, output, cacheRead) => ({ input: input ?? 0, output: output ?? 0, cacheRead: cacheRead ?? 0 });
const resultText = r => r.content;

// --- Anthropic, through the SDK ---

function anthropicClient(c, fetch) {
  const defaultHeaders = { ...c.headers, ...c.extra };
  // The SDK reads ANTHROPIC_CUSTOM_HEADERS from process.env, bypassing our env: null those names.
  for (const line of (process.env.ANTHROPIC_CUSTOM_HEADERS ?? '').split('\n')) {
    const name = line.slice(0, Math.max(line.indexOf(':'), 0)).trim();
    if (name && !(name in defaultHeaders)) defaultHeaders[name] = null;
  }
  // logLevel is explicit so ANTHROPIC_LOG=debug cannot log secret header values.
  const opts = { baseURL: c.endpoint, maxRetries: 1, timeout: c.timeoutMs, defaultHeaders, logLevel: 'off' };
  if (Object.keys(c.query).length) opts.defaultQuery = c.query;
  if (fetch) opts.fetch = fetch;
  // apiKey and authToken are always explicit: the SDK would otherwise read ANTHROPIC_AUTH_TOKEN and its
  // profile/credential chain. A non-null placeholder keeps the chain off; the header is then stripped.
  if (c.auth === 'x-api-key') { opts.apiKey = c.key; opts.authToken = null; }
  else if (c.auth === 'bearer') { opts.apiKey = null; opts.authToken = c.key; }
  else {
    opts.apiKey = 'unused'; opts.authToken = null;
    defaultHeaders['x-api-key'] = null;
    if (c.auth !== 'none') defaultHeaders[c.auth.header] = c.key;
  }
  if (c.auth !== 'bearer') defaultHeaders.authorization ??= null;
  return new Anthropic(opts);
}

function anthropicError(e, c) {
  if (e instanceof Anthropic.APIUserAbortError) return abortError();
  if (e.code === 'E_LLM_REFUSAL') return e;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return llmError('E_LLM_HTTP', 'o provedor de LLM não respondeu a tempo');
  if (e instanceof Anthropic.APIConnectionError) return llmError('E_LLM_HTTP', 'sem conexão com o provedor de LLM');
  if (e instanceof Anthropic.APIError) {
    const body = typeof e.error === 'string' ? e.error : e.error ? JSON.stringify(e.error) : e.message;
    return httpError(e.status ?? 0, body, c.secrets);
  }
  return llmError('E_LLM_HTTP', redact(e.message, c.secrets));
}

function anthropicProvider(c, fetch) {
  const client = anthropicClient(c, fetch);
  return {
    name: 'anthropic', model: c.model, tools: c.tools,
    open({ system, tools }) {
      const messages = [];
      const blocks = system.map(text => ({ type: 'text', text, cache_control: { type: 'ephemeral' } }));
      return {
        async send(input, { signal } = {}) {
          if (signal?.aborted) throw abortError();
          messages.push({
            role: 'user',
            content: 'text' in input ? input.text : input.results.map(r => ({
              type: 'tool_result', tool_use_id: r.id, content: resultText(r), ...(r.isError ? { is_error: true } : {}) })),
          });
          const t0 = Date.now();
          let res;
          try {
            res = await client.messages.create({
              model: c.model, max_tokens: MAX_TOKENS, system: blocks, messages,
              ...(tools ? { tools, tool_choice: { type: 'auto' } } : {}),
              output_config: { effort: c.effort },
            }, { signal });
          } catch (e) { throw anthropicError(e, c); }
          if (res.stop_reason === 'refusal') throw llmError('E_LLM_REFUSAL', 'o modelo recusou a pergunta');
          // Verbatim: thinking blocks must reach the next turn unchanged.
          messages.push({ role: 'assistant', content: res.content });
          return {
            text: res.content.filter(b => b.type === 'text').map(b => b.text).join(''),
            calls: res.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input ?? {} })),
            ms: Date.now() - t0,
            usage: usageOf(res.usage?.input_tokens, res.usage?.output_tokens, res.usage?.cache_read_input_tokens),
          };
        },
      };
    },
  };
}

// --- OpenAI-compatible, through fetch ---

function openaiHeaders(c) {
  const h = { 'content-type': 'application/json', ...c.headers, ...c.extra };
  if (c.auth === 'bearer') h.authorization = `Bearer ${c.key}`;
  else if (c.auth === 'x-api-key') h['x-api-key'] = c.key;
  else if (c.auth !== 'none') h[c.auth.header] = c.key;
  return h;
}

function openaiProvider(c, fetch) {
  const qs = new URLSearchParams(c.query).toString();
  const url = `${c.endpoint}/chat/completions${qs ? `?${qs}` : ''}`;
  const headers = openaiHeaders(c);
  return {
    name: 'openai', model: c.model, tools: c.tools,
    open({ system, tools }) {
      const messages = [{ role: 'system', content: system.join('\n\n') }];
      const toolDefs = tools?.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      return {
        async send(input, { signal } = {}) {
          if (signal?.aborted) throw abortError();
          if ('text' in input) messages.push({ role: 'user', content: input.text });
          else for (const r of input.results) messages.push({ role: 'tool', tool_call_id: r.id, content: resultText(r) });
          const ctl = new AbortController();
          const onAbort = () => ctl.abort();
          signal?.addEventListener('abort', onAbort, { once: true });
          const timer = setTimeout(() => { ctl.timedOut = true; ctl.abort(); }, c.timeoutMs);
          const t0 = Date.now();
          try {
            let res, raw;
            try {
              res = await fetch(url, {
                method: 'POST', headers, signal: ctl.signal,
                body: JSON.stringify({ model: c.model, messages, ...(toolDefs ? { tools: toolDefs, tool_choice: 'auto' } : {}) }),
              });
              raw = await res.text();
            } catch (e) {
              if (signal?.aborted) throw abortError();
              if (ctl.timedOut) throw llmError('E_LLM_HTTP', 'o provedor de LLM não respondeu a tempo');
              throw llmError('E_LLM_HTTP', redact(`sem conexão com o provedor de LLM: ${e.cause?.code ?? e.message}`, c.secrets));
            }
            if (!res.ok) throw httpError(res.status, raw, c.secrets);
            let data;
            try { data = JSON.parse(raw); } catch { throw httpError(res.status, raw, c.secrets); }
            const choice = data.choices?.[0];
            if (!choice) throw httpError(res.status, raw, c.secrets);
            if (choice.finish_reason === 'content_filter' || choice.message?.refusal) throw llmError('E_LLM_REFUSAL', 'o modelo recusou a pergunta');
            const m = choice.message;
            messages.push(m);
            return {
              text: typeof m.content === 'string' ? m.content : '',
              calls: (m.tool_calls ?? []).map(tc => ({ id: tc.id, name: tc.function.name, input: parseArgs(tc.function.arguments) })),
              ms: Date.now() - t0,
              usage: usageOf(data.usage?.prompt_tokens, data.usage?.completion_tokens, data.usage?.prompt_tokens_details?.cached_tokens),
            };
          } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
          }
        },
      };
    },
  };
}

function parseArgs(text) {
  if (!text) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function createProvider(cfg, { env = {}, fetch = globalThis.fetch } = {}) {
  const c = resolveConfig(cfg, env);
  return c.provider === 'anthropic' ? anthropicProvider(c, fetch === globalThis.fetch ? undefined : fetch) : openaiProvider(c, fetch);
}
