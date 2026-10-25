import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeColors, relationshipInverses, buildReference } from '../scripts/gen-ask.mjs';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from '../scripts/lib/registry.mjs';

test('themeColors reads the light theme only', () => {
  const css = ':root{--biz:#fff5a8;--biz-s:#a89a2c;}\n@media (prefers-color-scheme: dark){:root{--biz:#5a5220;}}';
  assert.deepEqual(themeColors(css), { biz: '#fff5a8', 'biz-s': '#a89a2c' });
});

test('relationshipInverses covers every relationship type', () => {
  const inv = relationshipInverses();
  assert.deepEqual(Object.keys(inv).sort(), Object.keys(RELATIONSHIP_TYPES).sort());
  assert.equal(inv.serving, 'served_by');
  assert.equal(inv.triggering, 'triggered_by');
});

test('REFERENCE lists every element and relationship type, colors and support direction', () => {
  const md = buildReference();
  for (const t of Object.keys(ELEMENT_TYPES)) assert.match(md, new RegExp(`\\| \`${t}\` \\|`));
  for (const t of Object.keys(RELATIONSHIP_TYPES)) assert.match(md, new RegExp(`\\| \`${t}\` \\|`));
  for (const c of ['#fff5a8', '#a89a2c', '#b6eef6', '#cbe8b9', '#1168bd', '#3f86d0', '#8cc0f2', '#8791a1', '#f2b705']) assert.ok(md.includes(c), c);
  assert.match(md, /\| `access` \|[^\n]*destino → origem/);
  assert.match(md, /\| `serving` \|[^\n]*origem → destino/);
  assert.match(md, /classDef business fill:#fff5a8,stroke:#a89a2c/);
  assert.match(md, /UpdateElementStyle\(/);
});

test('buildGabarito runs the CLI query for each question with a query', async () => {
  const { buildGabarito } = await import('../scripts/gen-ask.mjs');
  const g = buildGabarito([
    { id: 'a', pergunta: 'x', element: 'loja.pedidos' },
    { id: 'b', pergunta: 'y', esperado: 'pergunta qual' },
  ]);
  assert.deepEqual([...g.keys()], ['portable/archlens-ask/eval/gabarito/a.json']);
  const a = JSON.parse(g.get('portable/archlens-ask/eval/gabarito/a.json'));
  assert.equal(a.element.id, 'loja.pedidos');
});

const viewsMd = () => readFileSync(new URL('../references/views.md', import.meta.url), 'utf8');

test('coverageTerms has viewpoints, C4 levels and spec fields', async () => {
  const { coverageTerms } = await import('../scripts/gen-ask.mjs');
  const t = coverageTerms(viewsMd());
  for (const x of ['impact', 'product-support', 'landscape', 'dynamic', 'anchor', 'granularity', 'nesting', 'focus']) assert.ok(t.includes(x), x);
  assert.ok(!t.includes('bands-flow'));
});

test('checkCoverage reports size and missing terms', async () => {
  const { coverageTerms, checkCoverage, INSTRUCTIONS_LIMIT } = await import('../scripts/gen-ask.mjs');
  const md = viewsMd();
  const ok = coverageTerms(md).map(x => `\`${x}\``).join(' ');
  assert.deepEqual(checkCoverage({ instructions: 'x', rules: ok, viewsMd: md }), []);
  const problems = checkCoverage({ instructions: 'x'.repeat(INSTRUCTIONS_LIMIT + 1), rules: ok.replace('`anchor`', ''), viewsMd: md });
  assert.equal(problems.length, 2);
  assert.match(problems.join('\n'), /anchor/);
});
