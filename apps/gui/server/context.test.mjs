import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { compactCatalog, relationsDigest, userMessage, loadPrompt } from './ask/context.mjs';
import { runTool } from './ask/tools.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const open = () => {
  const registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: join(root, 'examples/loja-online/architecture') }] }, { pollMs: 1e6 });
  return { registry, ctx: registry.get('loja') };
};

test('compact catalog lists every element and the saved views', () => {
  const { registry, ctx } = open();
  try {
    const c = compactCatalog(ctx);
    assert.equal(c.summarized, false);
    assert.ok(c.text.split('\n').some(l => l.startsWith('loja.pedidos | API de Pedidos | ') && l.includes('container')));
    assert.ok(c.text.includes('## Visões salvas'));
    assert.ok(c.text.includes('suporte-checkout'));
    assert.equal(compactCatalog(ctx), c, 'memoized by version');
  } finally { registry.close(); }
});

test('catálogo resumido acima do limite', async () => {
  const { registry, ctx } = open();
  try {
    const c = compactCatalog(ctx, { limit: 2000 });
    assert.equal(c.summarized, true);
    assert.ok(c.text.startsWith('catálogo resumido: use find_elements para o resto'));
    assert.ok(!/^loja\.pedidos\.\S+ \|/m.test(c.text));
    const r = await runTool(ctx, 'find_elements', { text: 'Carrinho Service' });
    assert.ok(r.ok && r.content.includes('loja.pedidos.carrinho'));
  } finally { registry.close(); }
});

test('relations digest is capped', () => {
  const { registry, ctx } = open();
  try {
    assert.match(relationsDigest(ctx), /-\w+-> /);
    assert.match(relationsDigest(ctx, { limit: 100 }), /… \d+ relações omitidas$/);
  } finally { registry.close(); }
});

test('user message carries view, selection, choice and history', () => {
  const { registry, ctx } = open();
  try {
    const history = Array.from({ length: 6 }, (_, i) => ({ question: `p${i}`, title: `t${i}` }));
    const m = userMessage({ question: 'o que sustenta?', context: { spec: { notation: 'c4', level: 'landscape' }, nodes: ['loja'], selected: 'loja' }, history, chosen: 'loja.pedidos' }, ctx);
    for (const s of ['o que sustenta?', 'Visão atual:', 'Nós visíveis:', 'Selecionado:', 'Escolha do usuário: loja.pedidos (API de Pedidos)']) assert.ok(m.includes(s), s);
    assert.equal(m.split('\n').filter(l => l.includes(' → ')).length, 4);
    assert.equal(userMessage({ question: 'x' }, ctx), 'x');
  } finally { registry.close(); }
});

test('loadPrompt appends the json protocol only in json mode', () => {
  const t = loadPrompt({ mode: 'tools' }), j = loadPrompt({ mode: 'json' });
  assert.ok(j.startsWith(t) && j.length > t.length);
});
