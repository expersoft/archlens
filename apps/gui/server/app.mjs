// HTTP server of the GUI: JSON API over the base registry, plus optional static files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { query } from '../../../scripts/lib/api.mjs';
import { createBaseRegistry } from './bases.mjs';
import { catalog, findElements, labelsOf } from './catalog.mjs';
import { renderSpec, createViewCache } from './views.mjs';
import { actionsFor, flipSpec } from './navigation.mjs';
import { viewAnswer, formatViewAnswer } from '../../../scripts/lib/query-md.mjs';
import { createProvider } from './ask/providers.mjs';
import { runAsk } from './ask/agent.mjs';
import { createTelemetry, summarize } from './ask/telemetry.mjs';

const BODY_LIMIT = 1024 * 1024;
const QUESTION_MAX = 2000;
const STREAMED = Symbol('streamed');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

// Every response: no framing by another origin.
const SAFE_HEADERS = { 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" };
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Hostname part of a Host header, lowercased (keeps the brackets of an IPv6 literal). */
function hostnameOf(header) {
  const h = String(header ?? '').trim().toLowerCase();
  if (h.startsWith('[')) { const end = h.indexOf(']'); return end < 0 ? h : h.slice(0, end + 1); }
  const colon = h.indexOf(':');
  return colon < 0 ? h : h.slice(0, colon);
}

/**
 * DNS rebinding guard: a page on another name that resolves to this machine must not read the API.
 * Bound to all interfaces (0.0.0.0 or ::, team mode behind a proxy) any Host is accepted.
 */
function hostAllowed(header, configured) {
  if (configured === '0.0.0.0' || configured === '::') return true;
  const h = hostnameOf(header);
  if (LOCAL_HOSTS.has(h)) return true;
  const c = String(configured ?? '').toLowerCase();
  return !!c && (h === c || h === `[${c}]`);
}

const httpError = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

// CSRF guard for every POST: a cross-site page can send text/plain without a preflight and spend the user's LLM quota.
function checkPostOrigin(req) {
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw httpError(415, 'envie o corpo como application/json', 'E_GUI_CONTENT_TYPE');
  }
  const { origin } = req.headers;
  let cross = req.headers['sec-fetch-site'] === 'cross-site';
  if (origin && !cross) {
    try { cross = new URL(origin).host.toLowerCase() !== String(req.headers.host ?? '').toLowerCase(); } catch { cross = true; }
  }
  if (cross) throw httpError(403, 'origem não permitida', 'E_GUI_ORIGIN');
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length, ...SAFE_HEADERS, ...headers });
  res.end(buf);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0, over = false;
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) over = true; else chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (over) return reject(httpError(413, 'corpo da requisição acima de 1 MB'));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolveBody({});
      try { resolveBody(JSON.parse(text)); } catch { reject(httpError(400, 'JSON inválido no corpo da requisição')); }
    });
  });
}

async function serveStatic(res, staticDir, pathname) {
  const base = resolve(staticDir);
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { rel = '/'; }
  const target = resolve(join(base, rel));
  let file = join(base, 'index.html');
  if (target === base || target.startsWith(base + sep)) {
    try { if ((await stat(target)).isFile()) file = target; } catch { /* fall back to index.html */ }
  }
  try {
    const data = await readFile(file);
    send(res, 200, data, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
  } catch {
    send(res, 404, { error: 'não encontrado' });
  }
}

export async function startServer({ config, staticDir, registry, provider } = {}) {
  // Throws E_GUI_CONFIG (no key) before anything listens; a test/e2e provider replaces the configured one.
  // A missing key for an `llm` from the config file only turns the search off (`askOff`): the diagrams stay usable.
  let askOff = null;
  if (!provider && config?.llm) {
    try { provider = createProvider(config.llm, { env: config.env ?? {} }); } catch (e) {
      if (!(e.missing && config.llmSource === 'file')) throw e;
      provider = null;
      askOff = e.message;
    }
  }
  provider ??= null;
  const ownRegistry = !registry;
  registry ??= createBaseRegistry(config);
  const cache = createViewCache();
  const telemetry = createTelemetry(config?.telemetry ?? {});

  // The question as an NDJSON stream: agent events, then result (or error), then done. A closed connection aborts.
  async function ask(req, res, b) {
    if (!provider) throw httpError(503, `busca em texto desligada: ${askOff ?? 'suba com --llm anthropic'}`, 'E_GUI_ASK_OFF');
    const body = await readJson(req);
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) throw httpError(400, 'informe a pergunta em {question}');
    if (question.length > QUESTION_MAX) throw httpError(400, `a pergunta passa de ${QUESTION_MAX} caracteres`);
    const ctx = registry.get(b);
    const ctl = new AbortController();
    // res, not req: req 'close' also fires once the request body is read.
    res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...SAFE_HEADERS });
    const write = ev => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(ev) + '\n'); };
    const t0 = Date.now();
    const mode = provider.tools ? 'tools' : 'json';
    let metrics = { total: 0, llm: 0, tools: 0, rounds: 0, calls: 0, mode, usage: { input: 0, output: 0, cacheRead: 0 } };
    let outcome = 'error', render = 0;
    try {
      const out = await runAsk(ctx, { ...body, question }, {
        provider, signal: ctl.signal, emit: write, maxRounds: config?.llm?.maxRounds, timeoutMs: config?.llm?.timeoutMs,
      });
      metrics = out.metrics;
      const { result } = out;
      const ev = { type: 'result', result };
      if (result.kind === 'view') {
        const spec = result.title ? { ...result.spec, title: result.title } : result.spec;
        const r0 = Date.now();
        ev.view = await renderSpec(ctx, spec, cache);
        render = Date.now() - r0;
        if (result.answer) {
          ev.answer = viewAnswer(ctx.model, result.spec);
          ev.markdown = formatViewAnswer(ev.answer);
        }
      }
      outcome = result.kind;
      write(ev);
    } catch (e) {
      metrics.total = Date.now() - t0;
      if (e.code !== 'E_LLM_ABORT' || !ctl.signal.aborted) write({ type: 'error', error: e.message ?? String(e), ...(e.code ? { code: e.code } : {}) });
    }
    metrics = { ...metrics, render };
    write({ type: 'done', metrics });
    if (!ctl.signal.aborted) {
      telemetry.record({
        at: new Date().toISOString(), base: b, provider: provider.name, model: provider.model, mode, outcome,
        ms: { total: metrics.total, llm: metrics.llm, tools: metrics.tools, render }, rounds: metrics.rounds, calls: metrics.calls,
        cacheRead: metrics.usage?.cacheRead ?? 0, question,
      });
    }
    res.end();
    return STREAMED;
  }

  const routes = [
    ['GET', /^\/api\/info$/, async () => ({
      ask: provider ? { enabled: true, provider: provider.name, model: provider.model, mode: provider.tools ? 'tools' : 'json' } : { enabled: false, ...(askOff ? { reason: askOff } : {}) },
    })],
    ['GET', /^\/api\/telemetry$/, async () => summarize(telemetry.recent())],
    ['POST', /^\/api\/bases\/([^/]+)\/ask$/, (req, [b], _url, res) => ask(req, res, b)],
    ['GET', /^\/api\/bases$/, async () => registry.list()],
    ['GET', /^\/api\/bases\/([^/]+)\/catalog$/, async (_req, [b]) => catalog(registry.get(b))],
    ['GET', /^\/api\/bases\/([^/]+)\/find$/, async (_req, [b], url) =>
      findElements(registry.get(b), url.searchParams.get('q') ?? '')],
    ['POST', /^\/api\/bases\/([^/]+)\/view$/, async (req, [b]) => {
      const { spec } = await readJson(req);
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw httpError(400, 'informe {spec} no corpo');
      return renderSpec(registry.get(b), spec, cache);
    }],
    ['GET', /^\/api\/bases\/([^/]+)\/elements\/([^/]+)$/, async (_req, [b, id]) => {
      const ctx = registry.get(b);
      const card = query(ctx.snapshot, { element: id, format: 'json' });
      const el = ctx.model.elements.get(id);
      if (card?.element && el) Object.assign(card.element, labelsOf(ctx, el));
      return { card, actions: actionsFor(ctx, id) };
    }],
    // Only the actions (context menu, double click): from the model in memory, no card.
    ['GET', /^\/api\/bases\/([^/]+)\/elements\/([^/]+)\/actions$/, async (_req, [b, id]) => {
      const ctx = registry.get(b);
      if (!ctx.model.elements.has(id)) throw httpError(400, `"${id}" não existe na base`, 'E_UNKNOWN_REF');
      return { actions: actionsFor(ctx, id) };
    }],
    ['POST', /^\/api\/bases\/([^/]+)\/flip$/, async (req, [b]) => {
      const { spec } = await readJson(req);
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw httpError(400, 'informe {spec} no corpo');
      return { spec: flipSpec(registry.get(b), spec) };
    }],
  ];

  const host = config?.host ?? '127.0.0.1';
  const handler = async (req, res) => {
    try {
      if (!hostAllowed(req.headers.host, host)) throw httpError(403, `Host não permitido: ${req.headers.host ?? '(ausente)'}`);
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        if (req.method === 'POST') checkPostOrigin(req);
        for (const [method, re, fn] of routes) {
          const m = re.exec(pathname);
          if (!m) continue;
          if (req.method !== method) throw httpError(405, `método ${req.method} não permitido`);
          let params;
          try { params = m.slice(1).map(decodeURIComponent); } catch { throw httpError(400, 'URL com codificação inválida'); }
          const out = await fn(req, params, url, res);
          return out === STREAMED ? undefined : send(res, 200, out);
        }
        throw httpError(404, 'rota desconhecida');
      }
      if (staticDir && (req.method === 'GET' || req.method === 'HEAD')) return await serveStatic(res, staticDir, pathname);
      throw httpError(404, 'rota desconhecida');
    } catch (e) {
      if (res.headersSent) return void res.end();
      if (e.status) return send(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}) });
      if (e.code) return send(res, 400, { error: e.message, code: e.code });
      console.error(e);
      send(res, 500, { error: e.message ?? String(e) });
    }
  };

  const server = createServer(handler);
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(config?.port ?? 0, host, ok); });
  const { port, address } = server.address();
  const url = `http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`;
  return {
    url,
    address,
    telemetry,
    provider,
    askOff,
    close() {
      return new Promise(done => {
        server.close(() => done());
        server.closeAllConnections?.();
        if (ownRegistry) registry.close();
      });
    },
  };
}
