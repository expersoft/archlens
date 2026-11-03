import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { layoutView } from '../scripts/lib/layout.mjs';
import { buildView, viewAlerts } from '../scripts/lib/view-build.mjs';
import { asBase } from './helpers.mjs';

const model = () => normalizeModel(asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)))));
const spec = { key: 'k', notation: 'c4', level: 'container', scope: 'loja' };

test('buildView returns embedded html, data, nodes and timings', async () => {
  const r = await buildView(model(), spec);
  assert.ok(r.nodes.includes('loja.api'));
  assert.ok(!r.html.includes('class="bar"'));
  assert.ok(r.data.nodes['loja.api']);
  assert.ok(Number.isInteger(r.ms.resolve) && r.ms.resolve >= 0);
  assert.ok(Array.isArray(r.alerts));
  assert.ok(r.layoutStyle === null || typeof r.layoutStyle === 'string');
});

test('buildView rejects an empty view with E_VIEW_EMPTY', async () => {
  await assert.rejects(buildView(model(), { key: 'v', notation: 'c4', level: 'landscape', status: ['retired'] }), e => e.code === 'E_VIEW_EMPTY');
});

test('viewAlerts warns above 40 nodes', async () => {
  const view = resolveView(model(), spec);
  const laid = await layoutView(view);
  const big = { ...view, nodes: Array.from({ length: 41 }, (_, i) => ({ id: `n${i}` })) };
  const a = viewAlerts(big, laid);
  assert.ok(a.some(s => s.includes('41 nós') && s.includes('focus/depth')));
});
