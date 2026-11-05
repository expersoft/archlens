import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.mjs';
import { createBaseRegistry } from './bases.mjs';
import { rebuild } from './plan/routes.mjs';
import { scripted } from './ask/scripted.mjs';
import { newDraft, hashOps } from './plan/draft.mjs';
import { openStore, resolveBase, storeError } from '../../../scripts/lib/store/index.mjs';
import { plan as planDelta } from '../../../scripts/lib/api.mjs';
import { applyAndDocument } from '../../../scripts/lib/apply-flow.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (calls = []) => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `t${i}`, name, input })), ms: 1, usage: USAGE });
const json = { 'content-type': 'application/json' };
const lines = async res => (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
const delta = elements => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'teste' }, model: { elements, relationships: [] } });
const NEW = delta([{ id: 'sistema-novo', name: 'Sistema Novo Zeta', type: 'application-component' }]);
const ALTER = delta([{ id: 'loja.pedidos', name: 'API de Pedidos', type: 'application-component', description: 'Descrição nova para o teste de apply' }]);

function lojaCopy() {
  const top = mkdtempSync(join(tmpdir(), 'archlens-papply-'));
  const dir = join(top, 'architecture');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  cpSync(join(root, 'examples/loja-online/ARCHITECTURE.md'), join(top, 'ARCHITECTURE.md'));
  return { top, dir };
}

async function withPlan(fn, { provider = scripted([]), plan = true, registry, copy = lojaCopy() } = {}) {
  const { top, dir } = copy;
  const cfg = { port: 0, bases: [{ id: 'loja', path: dir }], llm: { provider: 'anthropic' },
    ...(plan ? { plan: { maxRounds: 8, timeoutMs: 20000, maxTokens: 100000 } } : {}) };
  const srv = await startServer({ config: cfg, provider, registry: registry?.(dir) });
  try { await fn(srv.url, dir, top); } finally { await srv.close(); }
}
const post = (url, path, body) => fetch(`${url}/api/bases/loja/${path}`, { method: 'POST', headers: json, body: JSON.stringify(body) });
const opened = async (url, d) => (await post(url, 'plan/open', { draft: { ...newDraft({ id: 'loja', version: '' }), delta: d } })).json();
const modelOf = dir => JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8'));
const PATHS = /\/home|\/tmp|[A-Z]:\\|archlens plan/;
const flat = els => els.flatMap(e => [e, ...flat(e.children ?? [])]);
const elementOf = (dir, id) => flat(modelOf(dir).elements).find(e => e.id === id);

/** Holds the turn of the base as a remote read under way does; `release` lets the queue go on. */
function holdTurn(registry) {
  let release;
  const held = registry.inTurn('loja', () => new Promise(done => { release = done; }));
  return { held, release: () => release() };
}
const settle = () => new Promise(done => setTimeout(done, 150));

async function withoutChromium(fn) {
  const saved = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = mkdtempSync(join(tmpdir(), 'archlens-nobrowser-'));
  try { return await fn(); } finally {
    if (saved === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = saved;
  }
}

test('opsHash: o servidor devolve o hash das ops do plano final em /plan, /plan/open e /plan/preview', () => withPlan(async url => {
  const out = await opened(url, NEW);
  assert.equal(out.draft.plan.state, 'final');
  assert.equal(out.opsHash, hashOps(out.draft.plan.ops));
  assert.match(out.opsHash, /^[0-9a-f]{64}$/);
  assert.equal((await opened(url, ALTER)).opsHash, null);
  const preview = await (await post(url, 'plan/preview', { draft: out.draft })).json();
  assert.equal(preview.opsHash, out.opsHash);
  const evs = await lines(await post(url, 'plan', { draft: out.draft, message: 'pronto?', history: [] }));
  assert.equal(evs.find(e => e.type === 'result').opsHash, out.opsHash);
}, { provider: scripted([turn([['reply', { text: 'sim' }]])]) }));

// Before any test that launches Chromium: playwright-core keeps the browsers path it read first.
test('apply com build indisponível', () => withPlan(async (url, dir) => {
  const { draft, opsHash } = await opened(url, NEW);
  const out = await withoutChromium(async () => {
    const r = await post(url, 'plan/apply', { draft, confirm: opsHash });
    assert.equal(r.status, 200);
    return r.json();
  });
  assert.equal(out.build.available, false);
  assert.equal(out.build.reason, 'Chromium indisponível no servidor; rode "npx playwright install chromium" na máquina do servidor');
  assert.ok(!out.build.reason.includes(tmpdir()) && !PATHS.test(out.build.reason));
  assert.equal(out.entry.added[0], 'sistema-novo');
  assert.equal(elementOf(dir, 'sistema-novo').name, 'Sistema Novo Zeta');
}));

test('apply grava, roda o build e devolve o relatório', () => withPlan(async (url, dir, top) => {
  const { draft, opsHash } = await opened(url, NEW);
  const before = draft.base.version;
  const r = await post(url, 'plan/apply', { draft, confirm: opsHash });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.entry.summary, '+1 ~0 −0');
  assert.deepEqual(out.entry.added, ['sistema-novo']);
  assert.equal(out.doc, 'ARCHITECTURE.md');
  assert.equal(out.notesDraftNeeded, true);
  assert.equal(typeof out.build.available, 'boolean');
  assert.equal(typeof out.build.problems, 'number');
  assert.ok(Array.isArray(out.build.results));
  if (out.build.available) assert.ok(out.build.results.length > 0);
  assert.ok(out.build.results.every(x => !('shot' in x)), 'sem caminhos da máquina');
  assert.equal(elementOf(dir, 'sistema-novo').name, 'Sistema Novo Zeta');
  assert.match(readFileSync(join(top, 'ARCHITECTURE.md'), 'utf8'), /Sistema Novo Zeta/);
  assert.match(readFileSync(join(dir, 'diagrams', 'architecture.html'), 'utf8'), /Sistema Novo Zeta/);
  // The registry sees the new version right away (no wait for the poll).
  const again = await opened(url, NEW);
  assert.notEqual(again.draft.base.version, before);
  const catalog = await (await fetch(`${url}/api/bases/loja/catalog`)).json();
  assert.ok(JSON.stringify(catalog).includes('sistema-novo'));
}));

test('apply recusa quando a base mudou depois da confirmação', () => withPlan(async (url, dir) => {
  const { draft, opsHash } = await opened(url, NEW);
  // Another write between the confirmation and the apply: the same id, another name.
  const store = openStore(resolveBase(dir));
  applyAndDocument(store, planDelta(store, delta([{ id: 'sistema-novo', name: 'Outro Nome', type: 'application-component' }])).plan);
  const r = await post(url, 'plan/apply', { draft, confirm: opsHash });
  assert.equal(r.status, 409);
  const e = await r.json();
  assert.equal(e.code, 'E_GUI_PLAN_CHANGED');
  assert.match(e.error, /não está final.*base mudou/);
  assert.ok(e.draft.plan, 'o plano novo volta');
  assert.notEqual(e.draft.base.version, draft.base.version);
  assert.equal(elementOf(dir, 'sistema-novo').name, 'Outro Nome');
}));

test('apply recusa confirmação de outro plano final', () => withPlan(async (url, dir) => {
  const { draft, opsHash } = await opened(url, NEW);
  const r = await post(url, 'plan/apply', { draft, confirm: 'f'.repeat(64) });
  assert.equal(r.status, 409);
  const e = await r.json();
  assert.equal(e.code, 'E_GUI_PLAN_CHANGED');
  assert.equal(e.opsHash, opsHash);
  assert.equal(elementOf(dir, 'sistema-novo'), undefined);
  assert.equal((await post(url, 'plan/apply', { draft })).status, 400);
}));

test('apply recusa plano aberto', () => withPlan(async (url, dir) => {
  const { draft } = await opened(url, ALTER);
  const r = await post(url, 'plan/apply', { draft, confirm: 'x' });
  assert.equal(r.status, 409);
  const e = await r.json();
  assert.equal(e.code, 'E_GUI_PLAN_CHANGED');
  assert.equal(e.opsHash, null);
  assert.deepEqual(e.questions.map(q => q.key), ['el:loja.pedidos:description']);
  assert.ok(e.questions[0].question.length > 5);
  assert.notEqual(elementOf(dir, 'loja.pedidos').description, 'Descrição nova para o teste de apply');
}));

test('build que falha depois do apply: available false e erro sem caminhos', async () => {
  const { dir } = lojaCopy();
  const store = openStore(resolveBase(dir));
  const crash = async () => { throw Object.assign(new Error(`visão "x": ${dir}/views.json quebrado`), { code: 'E_BUILD_VIEW' }); };
  const out = await rebuild(store, crash);
  assert.equal(out.available, false);
  assert.equal(out.code, 'E_BUILD_VIEW');
  assert.match(out.error, /não foram regenerados.*a base foi gravada/);
  assert.ok(!out.error.includes(dir) && !PATHS.test(out.error));
});

test('apply com documento alheio → 409 com mensagem da GUI, base intocada', () => withPlan(async (url, dir, top) => {
  const { draft, opsHash } = await opened(url, NEW);
  writeFileSync(join(top, 'ARCHITECTURE.md'), '# Escrito à mão\n');
  const r = await post(url, 'plan/apply', { draft, confirm: opsHash });
  assert.equal(r.status, 409);
  const e = await r.json();
  assert.equal(e.code, 'E_STORE_DOC_FOREIGN');
  assert.equal(e.error, 'o ARCHITECTURE.md desta base não foi gerado por ela; mova-o ou gere em outro lugar antes de gravar');
  assert.equal(elementOf(dir, 'sistema-novo'), undefined);
  const n = await post(url, 'plan/notes', { notes: 'x' });
  assert.equal(n.status, 409);
  assert.equal((await n.json()).code, 'E_STORE_DOC_FOREIGN');
}));

// A write that lands between the replan and the store's write: the connector refuses it.
const racing = dir => {
  const real = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 100000 });
  const wrap = ctx => {
    const store = Object.create(ctx.store);
    store.apply = () => { throw storeError('E_STORE_CONFLICT', 'a base mudou'); };
    return { ...ctx, store };
  };
  return { list: () => real.list(), close: () => real.close(), reload: id => real.reload(id), inTurn: (id, fn) => real.inTurn(id, fn), get: id => wrap(real.get(id)) };
};

test('apply com conflito na gravação → 409 com mensagem da GUI, sem comando da CLI', () => withPlan(async (url, dir) => {
  const { draft, opsHash } = await opened(url, NEW);
  const r = await post(url, 'plan/apply', { draft, confirm: opsHash });
  assert.equal(r.status, 409);
  const e = await r.json();
  assert.equal(e.code, 'E_STORE_CONFLICT');
  assert.equal(e.error, 'a base mudou enquanto o plano era aplicado; nada foi gravado. Revise o plano novo');
  assert.ok(!PATHS.test(e.error));
  assert.equal(elementOf(dir, 'sistema-novo'), undefined);
}, { registry: racing }));

test('corpo null → 400 em apply, notes, open e preview', () => withPlan(async url => {
  for (const p of ['plan', 'plan/apply', 'plan/notes', 'plan/open', 'plan/preview']) {
    const r = await fetch(`${url}/api/bases/loja/${p}`, { method: 'POST', headers: json, body: 'null' });
    assert.equal(r.status, 400, p);
  }
}));

test('notes grava e regenera o documento', () => withPlan(async (url, dir, top) => {
  const before = (await opened(url, NEW)).draft.base.version;
  const r = await post(url, 'plan/notes', { overview: '# Visão\n\nPropósito escrito pela GUI.\n', notes: 'Nota de interpretação da GUI.\n' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { doc: 'ARCHITECTURE.md' });
  assert.match(readFileSync(join(dir, 'notes', 'overview.md'), 'utf8'), /^# Visão\n\nPropósito escrito pela GUI\.\n/);
  assert.ok(existsSync(join(dir, 'notes', 'notes.md')));
  const doc = readFileSync(join(top, 'ARCHITECTURE.md'), 'utf8');
  assert.match(doc, /Propósito escrito pela GUI/);
  assert.match(doc, /Nota de interpretação da GUI/);
  assert.notEqual((await opened(url, NEW)).draft.base.version, before);
  for (const bad of [{}, { overview: 3 }, { notes: ['x'] }, { overview: 'x'.repeat(200_001) }]) {
    assert.equal((await post(url, 'plan/notes', bad)).status, 400, JSON.stringify(bad).slice(0, 40));
  }
}));

test('apply e notes: sem o modo ligado → 404', () => withPlan(async url => {
  for (const p of ['plan/apply', 'plan/notes']) assert.equal((await post(url, p, {})).status, 404);
}, { plan: false }));

test('documento que falha depois da gravação: sucesso com doc.error sem caminhos e registro recarregado', () => withPlan(async (url, dir) => {
  const { draft, opsHash } = await opened(url, NEW);
  const before = draft.base.version;
  const r = await post(url, 'plan/apply', { draft, confirm: opsHash });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.entry.added[0], 'sistema-novo');
  assert.equal(out.doc.error, 'a base foi gravada, mas o ARCHITECTURE.md não foi regenerado; rode "archlens doc" na base');
  assert.ok(!PATHS.test(JSON.stringify(out.doc)));
  assert.equal(elementOf(dir, 'sistema-novo').name, 'Sistema Novo Zeta');
  const again = await opened(url, NEW);
  assert.notEqual(again.draft.base.version, before);
}, { registry: dir => {
  const reg = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 100000 });
  const get = reg.get.bind(reg);
  // the write lands, then the document cannot be regenerated
  reg.get = id => {
    const ctx = get(id);
    const { store } = ctx;
    if (!store.__broken) {
      const apply = store.apply.bind(store);
      const read = store.read;
      // only the read that regenerates the document fails
      store.apply = (...a) => { const res = apply(...a); store.read = () => { store.read = read; throw new Error(`EACCES: ${dir}/x`); }; return res; };
      store.__broken = true;
    }
    return ctx;
  };
  return reg;
} }));

test('a gravação do plano espera a leitura na fila: nada do apply entra na worktree dela', () => withoutChromium(async () => {
  let registry;
  await withPlan(async (url, dir) => {
    const { draft, opsHash } = await opened(url, NEW);
    const { held, release } = holdTurn(registry);
    const pending = post(url, 'plan/apply', { draft, confirm: opsHash });
    await settle();
    assert.equal(elementOf(dir, 'sistema-novo'), undefined);
    release();
    await held;
    assert.equal((await pending).status, 200);
    assert.ok(elementOf(dir, 'sistema-novo'));
  }, { registry: dir => (registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 1e6 })) });
  registry.close();
}));

test('a gravação das notas espera a leitura na fila', async () => {
  let registry;
  await withPlan(async (url, dir) => {
    const notes = () => openStore(resolveBase(dir)).read().notes.notes ?? '';
    const { held, release } = holdTurn(registry);
    const pending = post(url, 'plan/notes', { notes: 'Nota escrita na vez dela.\n' });
    await settle();
    assert.ok(!notes().includes('Nota escrita na vez dela.'));
    release();
    await held;
    assert.equal((await pending).status, 200);
    assert.ok(notes().includes('Nota escrita na vez dela.'));
  }, { registry: dir => (registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 1e6 })) });
  registry.close();
});

test('uma leitura que falha não trava a fila, e o que vem depois roda na ordem', async () => {
  const dir = lojaCopy().dir;
  const registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: dir }] }, { pollMs: 1e6 });
  try {
    const order = [];
    const failed = registry.inTurn('loja', async () => { order.push('leitura'); throw new Error('falhou'); });
    const after = registry.inTurn('loja', () => { order.push('gravação'); return 'ok'; });
    await assert.rejects(failed, /falhou/);
    assert.equal(await after, 'ok');
    assert.deepEqual(order, ['leitura', 'gravação']);
    await assert.rejects(registry.inTurn('zzz', () => {}), /base desconhecida/);
  } finally { registry.close(); }
});
