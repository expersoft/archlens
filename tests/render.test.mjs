import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { layoutView, legibility } from '../scripts/lib/layout.mjs';
import { renderHtml } from '../scripts/lib/render.mjs';

const raw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
test('layout assigns absolute coordinates to every node and edge', async () => {
  const m = normalizeModel(raw());
  for (const spec of [
    { key: 'k', notation: 'c4', level: 'container', scope: 'loja' },
    { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } },
  ]) {
    const laid = await layoutView(resolveView(m, spec));
    for (const n of laid.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.w > 0 && n.h > 0, n.id);
    for (const e of laid.edges) assert.ok(e.points.length >= 2, e.id);
    assert.ok(laid.width > 0 && laid.height > 0);
    if (spec.notation === 'c4') assert.equal(laid.direction, 'RIGHT', 'C4 defaults to landscape');
    if (spec.notation === 'archimate') {
      assert.ok(laid.width / laid.height >= 1.5, `archimate canvas should be landscape, got ${laid.width}x${laid.height}`);
      for (const b of laid.bands) assert.ok(b.x === 0 && b.width === laid.width, 'bands span the full width');
      const bands = laid.bands.map(b => b.layer);
      assert.deepEqual(bands, ['business', 'application', 'technology']);
      const y = id => laid.nodes.find(n => n.id === id).y;
      assert.ok(y('venda') < y('loja.api.checkout') && y('loja.api.checkout') < y('k8s'), 'layers stack top-down');
    }
  }
});

test('renderHtml produces a self-contained page with every view', async () => {
  const m = normalizeModel(raw());
  const views = [];
  for (const spec of m.views) views.push(await layoutView(resolveView(m, spec)));
  const html = renderHtml({ title: 'Loja Mini', views });
  assert.match(html, /<title>Loja Mini/);
  assert.ok(!/<script[^>]+src=/.test(html), 'no external scripts');
  for (const v of views) assert.ok(html.includes(`data-view="${v.key}"`));
  assert.ok(html.includes('data-node="loja"'));
  assert.ok(html.includes('data-node="k8s"'));
});

test('view spec layout overrides direction', async () => {
  const m = normalizeModel(raw());
  const laid = await layoutView(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja', layout: { direction: 'DOWN' } }));
  assert.equal(laid.direction, 'DOWN');
});

test('legibility reports on-screen font size and suggests splitting', async () => {
  const m = normalizeModel(raw());
  const laid = await layoutView(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja' }));
  const big = legibility(laid, 1920, 1080);
  assert.ok(big.scale > 0 && big.minFontPx > 0);
  const tiny = legibility(laid, 320, 200);
  assert.equal(tiny.ok, false);
  assert.match(tiny.suggestion, /divid|focus/i);
});

test('rendered svg is fluid: viewBox, meet, no fixed size; presentation + navigation wired', async () => {
  const m = normalizeModel(raw());
  const views = [];
  for (const spec of m.views) views.push(await layoutView(resolveView(m, spec)));
  const html = renderHtml({ title: 'Loja Mini', views });
  const svgTags = html.match(/<svg class="diagram[^"]*"[^>]*>/g);
  assert.equal(svgTags.length, views.length);
  for (const t of svgTags) {
    assert.match(t, /viewBox="0 0 [\d.]+ [\d.]+"/);
    assert.match(t, /preserveAspectRatio="xMidYMid meet"/);
    assert.ok(!/\swidth="/.test(t) && !/\sheight="/.test(t), 'no fixed width/height attributes');
  }
  assert.ok(!/[{;]max-width\s*:\s*\d/.test(html), 'no fixed max-width on layout containers (media queries are fine)');
  for (const needle of ['requestFullscreen', 'ArrowRight', 'ArrowLeft', "case 'p'", "case '0'", "case 'f'", 'wheel']) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
});
