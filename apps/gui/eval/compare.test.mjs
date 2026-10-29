import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from '../server/bases.mjs';
import { score } from './compare.mjs';
import { runEval } from './run.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ask = join(root, 'portable/archlens-ask/eval');
const perguntas = JSON.parse(readFileSync(join(ask, 'perguntas.json'), 'utf8'));
const q = id => perguntas.find(p => p.id === id);
const gab = id => JSON.parse(readFileSync(join(ask, 'gabarito', `${id}.json`), 'utf8'));
const registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: join(root, 'examples/loja-online/architecture') }] }, { pollMs: 1e6 });
const ctx = registry.get('loja');
test.after(() => registry.close());

test('same selection with a different spec passes', () => {
  const spec = { ...q('suporte-processo').spec, key: 'outra', title: 'Meu título' };
  const r = score(q('suporte-processo'), { kind: 'view', spec }, ctx, gab('suporte-processo'));
  assert.equal(r.ok, true, r.reason);
});

test('missing node fails with the reason', () => {
  const spec = { ...q('suporte-processo').spec, granularity: 'component' };
  const r = score(q('suporte-processo'), { kind: 'view', spec }, ctx, gab('suporte-processo'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /a mais/);
});

test('derived edge may differ in type', () => {
  const g = gab('suporte-processo');
  const i = g.edges.findIndex(e => e.derived === false);
  const flip = derived => ({ ...g, edges: g.edges.map((e, k) => (k === i ? { ...e, type: 'flow-x', derived } : e)) });
  const res = { kind: 'view', spec: q('suporte-processo').spec };
  assert.equal(score(q('suporte-processo'), res, ctx, flip(true)).ok, true);
  assert.equal(score(q('suporte-processo'), res, ctx, flip(false)).ok, false);
});

test('ambiguous question needs clarify', () => {
  const opts = ids => ({ kind: 'clarify', question: '?', options: ids.map(id => ({ id })) });
  assert.equal(score(q('ambiguo'), opts(['loja.pedidos', 'loja.db-pedidos']), ctx, null).ok, true);
  assert.equal(score(q('ambiguo'), opts(['loja.pedidos']), ctx, null).ok, false);
  assert.equal(score(q('ambiguo'), { kind: 'element', id: 'loja.pedidos' }, ctx, null).ok, false);
});

test('element question needs the element', () => {
  assert.equal(score(q('cartao'), { kind: 'element', id: 'loja.pedidos' }, ctx, gab('cartao')).ok, true);
  assert.equal(score(q('cartao'), { kind: 'element', id: 'loja.web' }, ctx, gab('cartao')).ok, false);
  assert.equal(score(q('cartao'), { kind: 'none' }, ctx, gab('cartao')).ok, false);
});

test('manual question is not scored', () => {
  assert.equal(score(q('duas-bases'), { kind: 'none' }, ctx, null).ok, null);
});

test('dry run scores every automatic question', async () => {
  const { rows, summary } = await runEval({ dry: true });
  const auto = rows.filter(r => r.ok !== null);
  assert.ok(auto.length >= 13);
  for (const r of auto) assert.equal(r.ok, true, `${r.id}: ${r.reason}`);
  assert.equal(summary.accuracy, 1);
});
