// HTTP server of the GUI: JSON API over the base registry, plus optional static files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { query } from '../../../scripts/lib/api.mjs';
import { createBaseRegistry } from './bases.mjs';
import { catalog, findElements } from './catalog.mjs';
import { renderSpec, createViewCache } from './views.mjs';

const BODY_LIMIT = 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

const httpError = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length, ...headers });
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
      return { card: query(ctx.store, { element: id, format: 'json' }), actions: [] };
    }],
    ['POST', /^\/api\/bases\/([^/]+)\/flip$/, async () => { throw httpError(501, 'ainda não implementado'); }],
  ];

  const handler = async (req, res) => {
    try {
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

  const host = config?.host ?? '127.0.0.1';
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
