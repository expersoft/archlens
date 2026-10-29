// HTTP server of the GUI: JSON API over the base registry, plus optional static files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { query } from '../../../scripts/lib/api.mjs';
import { createBaseRegistry } from './bases.mjs';
import { catalog, findElements, labelsOf } from './catalog.mjs';
import { renderSpec, createViewCache } from './views.mjs';
import { actionsFor, flipSpec } from './navigation.mjs';

const BODY_LIMIT = 1024 * 1024;
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

export async function startServer({ config, staticDir, registry } = {}) {
  const ownRegistry = !registry;
  registry ??= createBaseRegistry(config);
  const cache = createViewCache();

  const routes = [
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
        for (const [method, re, fn] of routes) {
          const m = re.exec(pathname);
          if (!m) continue;
          if (req.method !== method) throw httpError(405, `método ${req.method} não permitido`);
          let params;
          try { params = m.slice(1).map(decodeURIComponent); } catch { throw httpError(400, 'URL com codificação inválida'); }
          return send(res, 200, await fn(req, params, url));
        }
        throw httpError(404, 'rota desconhecida');
      }
      if (staticDir && (req.method === 'GET' || req.method === 'HEAD')) return await serveStatic(res, staticDir, pathname);
      throw httpError(404, 'rota desconhecida');
    } catch (e) {
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
    close() {
      return new Promise(done => {
        server.close(() => done());
        server.closeAllConnections?.();
        if (ownRegistry) registry.close();
      });
    },
  };
}
