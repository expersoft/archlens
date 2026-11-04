import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';
import { plan as planOf } from '../scripts/lib/api.mjs';
import { applyAndDocument, writeNotes, writeDocument } from '../scripts/lib/apply-flow.mjs';
import { buildDiagrams, renderViews } from '../scripts/lib/build.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/loja-online/', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

/** A temporary copy of the loja-online example (architecture/ and ARCHITECTURE.md). */
const lojaCopy = () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-flow-'));
  cpSync(join(EXAMPLE, 'architecture'), join(dir, 'architecture'), { recursive: true });
  cpSync(join(EXAMPLE, 'ARCHITECTURE.md'), join(dir, 'ARCHITECTURE.md'));
  return dir;
};
const storeAt = dir => openStore(resolveBase(join(dir, 'architecture')));
const delta = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'rodada', date: '2026-11-03' }, summary: 'notificações push',
  model: { elements: [{ id: 'loja.notificacoes', type: 'application-component', name: 'Serviço de notificações push', parent: 'loja' }] } };
const finalPlan = store => {
  const { plan } = planOf(store, delta, { today: '2026-11-03' });
  assert.equal(plan.state, 'final');
  return plan;
};
/** [relative path, content] of every file under architecture/. */
const snapshot = dir => {
  const out = [];
  const root = join(dir, 'architecture');
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push([p.slice(root.length), readFileSync(p).toString('base64')]);
    }
  };
  walk(root);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};

test('applyAndDocument grava a base e o ARCHITECTURE.md e devolve a rodada', () => {
  const dir = lojaCopy();
  const store = storeAt(dir);
  const res = applyAndDocument(store, finalPlan(store));
  assert.ok(res.entry);
  assert.deepEqual(res.entry.added, ['loja.notificacoes']);
  assert.deepEqual(res.preserved, []);
  assert.equal(res.doc, join(dir, 'ARCHITECTURE.md'));
  assert.ok(store.read().raw.model.elements.some(e => e.id === 'loja.notificacoes'));
  assert.match(readFileSync(res.doc, 'utf8'), /Serviço de notificações push/);
});

test('applyAndDocument: base gravada e documento que falha devolve docError em vez de lançar', () => {
  const dir = lojaCopy();
  const store = storeAt(dir);
  const apply = store.apply.bind(store);
  const read = store.read;
  store.apply = (...a) => { const r = apply(...a); store.read = () => { store.read = read; throw new Error('disco cheio'); }; return r; };
  const res = applyAndDocument(store, finalPlan(store));
  assert.deepEqual(res.entry.added, ['loja.notificacoes']);
  assert.equal(res.doc, null);
  assert.match(res.docError.message, /disco cheio/);
  assert.ok(store.read().raw.model.elements.some(e => e.id === 'loja.notificacoes'));
});

test('applyAndDocument sem mudanças devolve entry null', () => {
  const dir = lojaCopy();
  const store = storeAt(dir);
  const plan = finalPlan(store);
  applyAndDocument(store, plan);
  const again = planOf(store, delta, { today: '2026-11-03' }).plan;
  assert.deepEqual(applyAndDocument(store, again), { entry: null });
});

test('applyAndDocument recusa documento alheio antes de gravar', () => {
  const dir = lojaCopy();
  writeFileSync(join(dir, 'ARCHITECTURE.md'), '# Arquitetura escrita à mão\n');
  const store = storeAt(dir);
  const plan = finalPlan(store);
  const before = snapshot(dir);
  assert.throws(() => applyAndDocument(store, plan), e => e.code === 'E_STORE_DOC_FOREIGN' && /E_STORE_DOC_FOREIGN: .*source:/.test(e.message));
  assert.deepEqual(snapshot(dir), before);
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), '# Arquitetura escrita à mão\n');
  assert.throws(() => writeDocument(store, store.read().raw, {}), { code: 'E_STORE_DOC_FOREIGN' });
});

test('buildDiagrams sem Chromium devolve available false com reason, sem lançar', async () => {
  const dir = lojaCopy();
  const empty = mkdtempSync(join(tmpdir(), 'archlens-nobrowser-'));
  const saved = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = empty;
  try {
    const store = storeAt(dir);
    const out = join(dir, 'out');
    const res = await buildDiagrams(store, store.read().raw, { dir: out, name: 'architecture' });
    assert.equal(res.available, false);
    assert.match(res.reason, /Chromium|playwright/);
    assert.equal(res.problems, 0);
    assert.deepEqual(res.results, []);
    assert.equal(res.out, join(out, 'architecture.html'));
    assert.ok(existsSync(res.out));
    assert.match(readFileSync(res.out, 'utf8'), /Loja Online/);
  } finally {
    if (saved === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = saved;
  }
});

test('renderViews lança E_BUILD_INVALID com os erros e E_BUILD_EMPTY sem conteúdo', async () => {
  const store = storeAt(lojaCopy());
  const raw = store.read().raw;
  const bad = structuredClone(raw);
  bad.model.relationships.push({ from: 'loja', to: 'nao-existe', type: 'serving' });
  await assert.rejects(renderViews(bad, raw.views), e => e.code === 'E_BUILD_INVALID' && e.errors.length > 0);
  await assert.rejects(renderViews(raw, [{ key: 'vazia', notation: 'archimate', viewpoint: 'application',
    exclude: raw.model.elements.map(e => e.id) }]),
    e => e.code === 'E_BUILD_EMPTY');
  const ok = await renderViews(raw, raw.views.slice(0, 1));
  assert.match(ok.html, /<html/i);
  assert.equal(ok.laid.length, 1);
  assert.ok(Array.isArray(ok.warnings));
});

test('writeNotes grava notes/overview.md pelo conector e regenera o documento', () => {
  const dir = lojaCopy();
  const store = storeAt(dir);
  const res = writeNotes(store, { overview: 'A loja vende pela web e pelo app.' });
  assert.equal(res.doc, join(dir, 'ARCHITECTURE.md'));
  assert.match(readFileSync(join(dir, 'architecture', 'notes', 'overview.md'), 'utf8'), /A loja vende pela web e pelo app\./);
  assert.equal(store.read().notes.overview.trim(), 'A loja vende pela web e pelo app.');
  assert.match(readFileSync(res.doc, 'utf8'), /A loja vende pela web e pelo app\./);
});

test('CLI e funções dão o mesmo resultado', () => {
  const viaCli = lojaCopy();
  const viaCore = lojaCopy();
  const plan = finalPlan(storeAt(viaCli));
  writeFileSync(join(viaCli, 'plano.json'), JSON.stringify(plan, null, 2));
  for (const args of [['apply', 'architecture', 'plano.json'], ['doc', 'architecture']]) {
    const r = run(args, viaCli);
    assert.equal(r.status, 0, r.stderr);
  }
  applyAndDocument(storeAt(viaCore), plan);
  assert.deepEqual(snapshot(viaCore), snapshot(viaCli));
  assert.equal(readFileSync(join(viaCore, 'ARCHITECTURE.md'), 'utf8'), readFileSync(join(viaCli, 'ARCHITECTURE.md'), 'utf8'));
});
