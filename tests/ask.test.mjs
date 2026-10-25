import { test } from 'node:test';
import assert from 'node:assert/strict';
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
