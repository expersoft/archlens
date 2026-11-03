import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { startServer } from './app.mjs';
import { createBaseRegistry } from './bases.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ex = n => join(root, 'examples', n, 'architecture');
const tmp = () => mkdtempSync(join(tmpdir(), 'archlens-gui-'));
const config = () => ({ port: 0, bases: [
  { id: 'loja-online', path: ex('loja-online') }, { id: 'telemedicina', path: ex('telemedicina') }] });

async function withServer(fn, opts = {}) {
  const srv = await startServer({ config: config(), ...opts });
  try { await fn(srv.url, srv); } finally { await srv.close(); }
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const LAND = { notation: 'c4', level: 'landscape' };

test('GET /api/bases lista as duas bases de exemplo', () => withServer(async url => {
  const r = await fetch(`${url}/api/bases`);
  assert.equal(r.status, 200);
  const l = await r.json();
  assert.deepEqual(l.map(b => b.id), ['loja-online', 'telemedicina']);
  assert.ok(l.every(b => b.ok));
}));

test('POST view: landscape da loja, embutida e com cache', () => withServer(async url => {
  const r = await post(`${url}/api/bases/loja-online/view`, { spec: LAND });
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.ok(v.nodes.includes('loja'));
  assert.ok(!v.html.includes('class="bar"'));
  assert.equal(v.cached, false);
  const again = await (await post(`${url}/api/bases/loja-online/view`, { spec: { level: 'landscape', notation: 'c4' } })).json();
  assert.equal(again.cached, true);
}));

test('POST view: erros 400 com texto do resolveView, JSON ruim e spec ausente', () => withServer(async url => {
  const r = await post(`${url}/api/bases/loja-online/view`, { spec: { notation: 'c4', level: 'container', scope: 'nao-existe' } });
  assert.equal(r.status, 400);
  const e = await r.json();
  assert.ok(e.error);
  assert.equal((await post(`${url}/api/bases/loja-online/view`, '{ruim')).status, 400);
  assert.equal((await post(`${url}/api/bases/loja-online/view`, {})).status, 400);
  assert.equal((await fetch(`${url}/api/bases/zzz/catalog`)).status, 400);
}));

test('GET elements: id com ponto; id desconhecido codificado dá 400', () => withServer(async url => {
  const r = await fetch(`${url}/api/bases/telemedicina/elements/${encodeURIComponent('tele.api')}`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.card.element.name, 'API de Agendamento');
  assert.ok(j.actions.some(a => a.label === 'Matriz de dependência'));
  const bad = await fetch(`${url}/api/bases/telemedicina/elements/${encodeURIComponent('a/b c')}`);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'E_UNKNOWN_REF');
}));

test('GET elements/:id/actions: só as ações; id desconhecido dá 400', () => withServer(async url => {
  const r = await fetch(`${url}/api/bases/telemedicina/elements/${encodeURIComponent('tele.api')}/actions`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(Object.keys(j), ['actions']);
  assert.ok(j.actions.some(a => a.label === 'Matriz de dependência'));
  const bad = await fetch(`${url}/api/bases/telemedicina/elements/nao-existe/actions`);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'E_UNKNOWN_REF');
}));

test('o cartão sai do snapshot em memória, sem reler o conector', async () => {
  const dir = join(tmp(), 'arch');
  cpSync(ex('loja-online'), dir, { recursive: true });
  const cfg = { port: 0, bases: [{ id: 'l', path: dir }] };
  const registry = createBaseRegistry(cfg, { pollMs: 100000 });
  const srv = await startServer({ config: cfg, registry });
  try {
    const id = registry.get('l').model.elements.keys().next().value;
    registry.get('l').store.read = () => { throw new Error('releu o conector'); };
    const r = await fetch(`${srv.url}/api/bases/l/elements/${encodeURIComponent(id)}`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).card.element.id, id);
  } finally { await srv.close(); registry.close(); }
});

test('GET find: busca por nome', () => withServer(async url => {
  const l = await (await fetch(`${url}/api/bases/telemedicina/find?q=agendamento`)).json();
  assert.ok(l.slice(0, 3).some(e => e.id === 'tele.api'));
  assert.ok(l.every(e => typeof e.score === 'number' && e.kind !== undefined));
  assert.deepEqual(await (await fetch(`${url}/api/bases/telemedicina/find?q=`)).json(), []);
}));

test('GET catalog: visões salvas e sugeridas, elementos', () => withServer(async url => {
  const c = await (await fetch(`${url}/api/bases/telemedicina/catalog`)).json();
  assert.equal(c.id, 'telemedicina');
  assert.ok(c.views.length > 0 && c.views.every(v => v.key && v.spec && typeof v.saved === 'boolean'));
  assert.ok(c.views.some(v => !v.saved));
  const api = c.elements.find(e => e.id === 'tele.api');
  assert.equal(api.name, 'API de Agendamento');
  assert.ok('layer' in api && 'kind' in api && 'parent' in api && 'group' in api);
}));

test('refresh invalida o cache', async () => {
  const dir = join(tmp(), 'arch');
  cpSync(ex('loja-online'), dir, { recursive: true });
  const cfg = { port: 0, bases: [{ id: 'l', path: dir }] };
  const registry = createBaseRegistry(cfg, { pollMs: 100000 });
  const srv = await startServer({ config: cfg, registry });
  try {
    const u = `${srv.url}/api/bases/l/view`;
    await post(u, { spec: LAND });
    assert.equal((await (await post(u, { spec: LAND })).json()).cached, true);
    const m = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8'));
    m.elements[0].name = 'Outro Nome';
    writeFileSync(join(dir, 'model.json'), JSON.stringify(m, null, 2));
    await registry.refresh();
    assert.equal((await (await post(u, { spec: LAND })).json()).cached, false);
  } finally { await srv.close(); registry.close(); }
});

test('flip: 400 sem spec, troca C4 por ArchiMate; rota desconhecida é 404; sem staticDir não-api é 404', () => withServer(async url => {
  assert.equal((await post(`${url}/api/bases/loja-online/flip`, {})).status, 400);
  assert.deepEqual((await (await post(`${url}/api/bases/loja-online/flip`, { spec: LAND })).json()).spec,
    { notation: 'archimate', viewpoint: 'application', granularity: 'container' });
  assert.equal((await fetch(`${url}/api/nada`)).status, 404);
  assert.equal((await fetch(`${url}/`)).status, 404);
}));

test('corpo acima de 1 MB dá 413', () => withServer(async url => {
  const r = await post(`${url}/api/bases/loja-online/view`, JSON.stringify({ spec: LAND, pad: 'x'.repeat(1024 * 1024 + 10) }));
  assert.equal(r.status, 413);
}));

test('estáticos: tipos, fallback para index.html e path traversal', async () => {
  const parent = tmp();
  const dir = join(parent, 'web');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<h1>oi</h1>');
  writeFileSync(join(dir, 'assets', 'a.js'), 'x');
  writeFileSync(join(parent, 'segredo.txt'), 'segredo');
  await withServer(async url => {
    const idx = await fetch(`${url}/`);
    assert.match(idx.headers.get('content-type'), /text\/html/);
    assert.equal(await idx.text(), '<h1>oi</h1>');
    const js = await fetch(`${url}/assets/a.js`);
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal(await (await fetch(`${url}/qualquer/rota`)).text(), '<h1>oi</h1>');
    assert.equal((await fetch(`${url}/api/nada`)).status, 404);
    assert.notEqual(await (await fetch(`${url}/%2e%2e/segredo.txt`)).text(), 'segredo');
    assert.notEqual(await (await fetch(`${url}/..%2fsegredo.txt`)).text(), 'segredo');
  }, { staticDir: dir });
});

test('escuta em 127.0.0.1 por padrão e aceita config.host', async () => {
  const a = await startServer({ config: config() });
  try { assert.equal(a.address, '127.0.0.1'); assert.match(a.url, /^http:\/\/localhost:\d+$/); } finally { await a.close(); }
  const b = await startServer({ config: { ...config(), host: '0.0.0.0' } });
  try { assert.equal(b.address, '0.0.0.0'); assert.match(b.url, /^http:\/\/0\.0\.0\.0:\d+$/); } finally { await b.close(); }
});

test('importar index.mjs não inicia servidor e exporta a API', async () => {
  const code = `const m = await import(${JSON.stringify(new URL('./index.mjs', import.meta.url).href)}); console.log(JSON.stringify([typeof m.startServer, typeof m.loadConfig, m.DIST_DIR]));`;
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
  const [a, b, dist] = JSON.parse(out.trim());
  assert.equal(a, 'function'); assert.equal(b, 'function');
  assert.ok(dist.endsWith(join('apps', 'gui', 'dist')));
});

const rawGet = (url, host) => new Promise((ok, fail) => {
  const u = new URL(url);
  const req = request({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { host } }, res => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', fail);
  req.end();
});

test('Host: recusa nomes estranhos (DNS rebinding) e aceita localhost, 127.0.0.1 e [::1]', () => withServer(async url => {
  const port = new URL(url).port;
  const evil = await rawGet(`${url}/api/bases`, 'evil.example');
  assert.equal(evil.status, 403);
  assert.ok(JSON.parse(evil.body).error);
  assert.equal((await rawGet(`${url}/api/bases`, `EVIL.example:${port}`)).status, 403);
  for (const h of [`localhost:${port}`, `LocalHost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, 'localhost']) {
    assert.equal((await rawGet(`${url}/api/bases`, h)).status, 200, h);
  }
}));

test('Host: com host configurado aceita esse nome; com 0.0.0.0 aceita qualquer um', async () => {
  const a = await startServer({ config: { ...config(), host: '127.0.0.1' } });
  try {
    assert.equal((await rawGet(`${a.url}/api/bases`, 'evil.example')).status, 403);
    assert.equal((await rawGet(`${a.url}/api/bases`, `127.0.0.1:${new URL(a.url).port}`)).status, 200);
  } finally { await a.close(); }
  const b = await startServer({ config: { ...config(), host: '0.0.0.0' } });
  try {
    const port = new URL(b.url).port;
    assert.equal((await rawGet(`http://127.0.0.1:${port}/api/bases`, 'arquitetura.empresa.com')).status, 200);
  } finally { await b.close(); }
});

test('toda resposta proíbe o enquadramento por outra origem', () => withServer(async url => {
  for (const r of [await fetch(`${url}/api/bases`), await fetch(`${url}/api/nada`), await rawGet(`${url}/api/bases`, 'evil.example')]) {
    const h = r.headers instanceof Headers ? k => r.headers.get(k) : k => r.headers[k];
    assert.equal(h('x-frame-options'), 'SAMEORIGIN');
    assert.equal(h('content-security-policy'), "frame-ancestors 'self'");
  }
}));

test('catálogo, busca e cartão trazem typeLabel e c4Label', () => withServer(async url => {
  const c = await (await fetch(`${url}/api/bases/telemedicina/catalog`)).json();
  const api = c.elements.find(e => e.id === 'tele.api');
  assert.equal(api.typeLabel, 'Application Component');
  assert.equal(api.c4Label, 'Container');
  assert.ok(c.elements.every(e => typeof e.typeLabel === 'string' && 'c4Label' in e));
  const hits = await (await fetch(`${url}/api/bases/telemedicina/find?q=agendamento`)).json();
  const h = hits.find(e => e.id === 'tele.api');
  assert.equal(h.typeLabel, 'Application Component');
  assert.equal(h.c4Label, 'Container');
  const el = await (await fetch(`${url}/api/bases/telemedicina/elements/tele.api`)).json();
  assert.equal(el.card.element.typeLabel, 'Application Component');
  assert.equal(el.card.element.c4Label, 'Container');
}));
