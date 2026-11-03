import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { resolveView } from '../../../scripts/lib/query.mjs';
import { ALL_TOOLS, QUERY_TOOLS, FINAL_TOOLS, runTool, finalize } from './ask/tools.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const open = () => {
  const registry = createBaseRegistry({ port: 0, bases: [{ id: 'loja', path: join(root, 'examples/loja-online/architecture') }] }, { pollMs: 1e6 });
  return { registry, ctx: registry.get('loja') };
};
const SUPORTE = { notation: 'archimate', viewpoint: 'layered', anchor: 'bp-checkout', traverse: { mode: 'supporters' }, granularity: 'container' };

test('tool order is stable', () => {
  assert.deepEqual(ALL_TOOLS.map(t => t.name), ['find_elements', 'element_card', 'relations', 'try_view', 'show_view', 'show_element', 'clarify']);
  assert.equal(QUERY_TOOLS.length + FINAL_TOOLS.length, ALL_TOOLS.length);
});

test('try_view summarises without JSON', async () => {
  const { registry, ctx } = open();
  try {
    const r = await runTool(ctx, 'try_view', { spec: SUPORTE });
    assert.ok(r.ok, r.content);
    assert.ok(r.content.includes('nós:') && r.content.includes('Aplicação'));
    assert.ok(!r.content.includes('{"'));
    assert.equal(r.best.nodes, resolveView(ctx.model, { key: 'ask', ...SUPORTE }).nodes.length);
  } finally { registry.close(); }
});

test('try_view reports core errors', async () => {
  const { registry, ctx } = open();
  try {
    const r = await runTool(ctx, 'try_view', { spec: { notation: 'archimate', viewpoint: 'layered', anchor: 'nao-existe' } });
    assert.equal(r.ok, false);
    assert.ok(r.content.includes('nao-existe'));
  } finally { registry.close(); }
});

test('element_card and find_elements', async () => {
  const { registry, ctx } = open();
  try {
    const c = await runTool(ctx, 'element_card', { id: 'loja.pedidos' });
    assert.ok(c.ok && c.content.includes('API de Pedidos'));
    assert.equal((await runTool(ctx, 'element_card', { id: 'loja.pedido' })).ok, false);
    const n = await runTool(ctx, 'find_elements', { text: 'zzzqqq' });
    assert.ok(n.ok && n.content === 'nenhum elemento para "zzzqqq"');
  } finally { registry.close(); }
});

test('show_view accepts a saved view key', () => {
  const { registry, ctx } = open();
  try {
    const r = finalize(ctx, 'show_view', { view: 'suporte-checkout' });
    assert.ok(r.ok);
    assert.equal(r.result.kind, 'view');
    assert.deepEqual(r.result.spec, ctx.model.views.find(v => v.key === 'suporte-checkout'));
  } finally { registry.close(); }
});

test('show_view asks for a cut above 40 nodes', () => {
  const { registry, ctx } = open();
  try {
    // 'application' has only 29 nodes in this example; 'layered' has 60
    const spec = { notation: 'archimate', viewpoint: 'layered' };
    const n = resolveView(ctx.model, { key: 'ask', ...spec }).nodes.length;
    assert.ok(n > 40, `example has ${n} nodes`);
    const r = finalize(ctx, 'show_view', { spec });
    assert.equal(r.ok, false);
    assert.ok(r.content.includes(String(n)));
    assert.ok(finalize(ctx, 'show_view', { spec, confirmLarge: true }).ok);
  } finally { registry.close(); }
});

test('show_view rejects bad specs, show_element suggests', () => {
  const { registry, ctx } = open();
  try {
    assert.equal(finalize(ctx, 'show_view', { spec: { notation: 'c4', level: 'context', scope: 'nao-existe' } }).ok, false);
    assert.equal(finalize(ctx, 'show_view', {}).ok, false);
    assert.deepEqual(finalize(ctx, 'show_element', { id: 'loja' }).result, { kind: 'element', id: 'loja' });
    assert.equal(finalize(ctx, 'show_element', { id: 'loja.pedido' }).ok, false);
  } finally { registry.close(); }
});

test('clarify drops unknown ids', () => {
  const { registry, ctx } = open();
  try {
    const r = finalize(ctx, 'clarify', { question: 'qual?', options: ['loja.pedidos', 'x'] });
    assert.ok(r.ok);
    assert.equal(r.result.options.length, 1);
    assert.equal(r.result.options[0].name, 'API de Pedidos');
    assert.ok(r.result.options[0].typeLabel);
    assert.equal(finalize(ctx, 'clarify', { question: 'q', options: ['x'] }).ok, false);
  } finally { registry.close(); }
});

test('relations caps the list', async () => {
  const { registry, ctx } = open();
  try {
    const ids = [...ctx.model.elements.keys()];
    const r = await runTool(ctx, 'relations', { ids });
    assert.ok(r.ok);
    assert.ok(r.content.split('\n').filter(l => l.includes('->')).length <= 80);
    const few = await runTool(ctx, 'relations', { ids: ['loja.web'] });
    assert.ok(few.content.includes('(') && few.content.includes('-serving->'));
  } finally { registry.close(); }
});
