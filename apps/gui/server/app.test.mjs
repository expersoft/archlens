import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  assert.deepEqual(j.actions, []);
  const bad = await fetch(`${url}/api/bases/telemedicina/elements/${encodeURIComponent('a/b c')}`);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'E_UNKNOWN_REF');
}));

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

test('flip ainda é 501; rota desconhecida é 404; sem staticDir não-api é 404', () => withServer(async url => {
  assert.equal((await post(`${url}/api/bases/loja-online/flip`, { spec: LAND })).status, 501);
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
