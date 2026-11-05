import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { resolveView } from '../../../scripts/lib/query.mjs';
import { ALL_TOOLS, QUERY_TOOLS, FINAL_TOOLS, DOC_LLM_MAX, runTool, finalize } from './ask/tools.mjs';

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

test('try_view answers an empty where without failing', async () => {
  const { registry, ctx } = open();
  try {
    const r = await runTool(ctx, 'try_view', { spec: { notation: 'c4', level: 'landscape', where: { owner: 'ninguém' } } });
    assert.ok(r.ok, r.content);
    assert.ok(r.content.includes('nenhum nó tem esse valor'));
    assert.equal(r.best, undefined);
  } finally { registry.close(); }
});

test('try_view counts where results apart from their frames', async () => {
  const { registry, ctx } = open();
  try {
    const spec = { notation: 'archimate', viewpoint: 'application', include: ['loja.pedidos'], where: { owner: 'ninguém' } };
    const r = await runTool(ctx, 'try_view', { spec });
    assert.ok(r.ok, r.content);
    const lines = r.content.split('\n');
    assert.ok(lines.includes('nós: 1'), r.content);
    assert.ok(lines.includes('nomes: API de Pedidos'), r.content);
    assert.ok(lines.includes('molduras: Plataforma de E-commerce'), r.content);
  } finally { registry.close(); }
});

test('show_view ends an empty where with the answer', () => {
  const { registry, ctx } = open();
  try {
    const out = finalize(ctx, 'show_view', { spec: { notation: 'c4', level: 'landscape', where: { owner: 'ninguém' } } });
    assert.deepEqual(out, { ok: true, result: { kind: 'none', warning: 'Nenhum nó tem esse valor em "where".' } });
  } finally { registry.close(); }
});

test('try_view warns that a dynamic view ignores where', async () => {
  const { registry, ctx } = open();
  try {
    const steps = [{ from: 'loja.pedidos', to: 'loja.web', description: 'x' }];
    const r = await runTool(ctx, 'try_view', { spec: { notation: 'c4', level: 'dynamic', scope: 'loja', steps, where: { owner: 'x' } } });
    assert.ok(r.ok, r.content);
    assert.ok(r.content.includes('ignora "where"'));
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

// --- Documentation of a node, over a copy of the vault example. ---
const vaultWith = text => {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-tools-')), 'arch');
  cpSync(join(root, 'examples/loja-online-vault/architecture'), dir, { recursive: true });
  const page = join(dir, 'application-component/loja.pedidos.md');
  const t = readFileSync(page, 'utf8');
  const end = '<!-- archlens:end -->';
  writeFileSync(page, `${t.slice(0, t.indexOf(end) + end.length)}\n\n${text}\n`);
  const registry = createBaseRegistry({ port: 0, bases: [{ id: 'v', path: dir }] }, { pollMs: 1e6 });
  return { registry, ctx: registry.get('v') };
};

test('element_card traz a documentação do nó', async () => {
  const { registry, ctx } = vaultWith('Texto da API de Pedidos.');
  try {
    const r = await runTool(ctx, 'element_card', { id: 'loja.pedidos' });
    assert.ok(r.ok, r.content);
    assert.ok(r.content.includes('## Documentação') && r.content.includes('Texto da API de Pedidos.'));
    assert.ok(!(await runTool(ctx, 'element_card', { id: 'loja.web' })).content.includes('Texto da API de Pedidos.'));
  } finally { registry.close(); }
});

test('element_card respeita DOC_LLM_MAX', async () => {
  const { registry, ctx } = vaultWith('x'.repeat(DOC_LLM_MAX + 500));
  try {
    assert.equal(DOC_LLM_MAX, 8000);
    const { content } = await runTool(ctx, 'element_card', { id: 'loja.pedidos' });
    assert.ok(content.includes('x'.repeat(DOC_LLM_MAX)) && !content.includes('x'.repeat(DOC_LLM_MAX + 1)));
    assert.ok(content.includes(`[documentação cortada em ${DOC_LLM_MAX} caracteres]`));
  } finally { registry.close(); }
});

test('element_card de um id desconhecido segue dizendo o que há de parecido', async () => {
  const { registry, ctx } = vaultWith('Texto.');
  try {
    const r = await runTool(ctx, 'element_card', { id: 'loja.pedido' });
    assert.equal(r.ok, false);
    assert.ok(r.content.includes('loja.pedidos'));
  } finally { registry.close(); }
});
