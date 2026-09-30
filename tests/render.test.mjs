import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { layoutView, legibility, layoutQuality, AM_STYLES } from '../scripts/lib/layout.mjs';
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
  assert.match(html, /svg\.diagram\{[^}]*width:100%;height:100%/, 'svg fills the stage so zoom/pan use the whole screen');
  assert.ok(!html.includes('--ratio'), 'svg height is not tied to the diagram aspect ratio');
  assert.ok(html.includes('fitRect') && html.includes('ResizeObserver'), 'viewBox follows the element aspect ratio');
  for (const needle of ['requestFullscreen', 'ArrowRight', 'ArrowLeft', "case 'p'", "case '0'", "case 'f'", 'wheel']) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
});

test('edges carry plain-language help; page has hover card, marker legend and glossary', async () => {
  const m = normalizeModel(raw());
  const views = [];
  for (const spec of m.views) views.push(await layoutView(resolveView(m, spec)));
  const html = renderHtml({ title: 'Loja Mini', views });
  const data = JSON.parse(html.match(/<script id="archlens-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const serving = data.views.flatMap(v => v.edges).find(e => e.type === 'serving');
  assert.match(serving.help.sentence, / serve /);
  assert.ok(serving.help.impact && serving.help.reading);
  assert.ok(data.views[0].edges.every(e => e.help && e.help.sentence));
  assert.match(html, /class="hovercard"/);
  assert.match(html, /id="glossary"/);
  for (const t of ['serving', 'realization', 'aggregation', 'uses']) assert.match(html, new RegExp(`id="gl-${t}"`), `glossary entry ${t}`);
  assert.match(html, /class="legend"[\s\S]*?marker-end="url\(#lg-/, 'legend draws real markers');
  assert.ok(!/<g class="node[^>]*><title>/.test(html), 'no native tooltips competing with the hover card');
  for (const needle of ['pointerover', 'focusin', 'previewing', 'pinCard']) assert.ok(html.includes(needle), `missing ${needle}`);
});

const amSpec = { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } };
const isOrthogonal = pts => pts.every((p, i) => !i || Math.abs(p.x - pts[i - 1].x) < 0.5 || Math.abs(p.y - pts[i - 1].y) < 0.5);

test('archimate: every layout.style is honoured, keeps layer order and routes edges orthogonally', async () => {
  const m = normalizeModel(raw());
  for (const style of AM_STYLES) {
    const laid = await layoutView(resolveView(m, { ...amSpec, layout: { style } }));
    assert.equal(laid.layoutStyle, style);
    assert.equal(laid.layoutAuto, false);
    assert.deepEqual(laid.bands.map(b => b.layer), ['business', 'application', 'technology'], style);
    for (const e of laid.edges) assert.ok(e.points.length >= 2 && isOrthogonal(e.points), `${style}: ${e.id} not orthogonal`);
    for (const n of laid.nodes) {
      const b = laid.bands.find(x => x.layer === n.layer);
      assert.ok(n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.width + 0.5 && n.y + n.h <= b.y + b.height + 0.5, `${style}: ${n.id} outside its band`);
    }
    if (style !== 'flow') for (const b of laid.bands) assert.ok(!b.vertical && b.x === 0 && b.width === laid.width, `${style}: horizontal full-width bands`);
    assert.equal(layoutQuality(laid).through, 0, `${style}: no edge crosses a box`);
  }
});

test('archimate: layout.style auto keeps the best-scoring style', async () => {
  const m = normalizeModel(raw());
  const laid = await layoutView(resolveView(m, amSpec));
  assert.equal(laid.layoutAuto, true);
  assert.deepEqual(Object.keys(laid.layoutScores).sort(), [...AM_STYLES].sort());
  const best = Math.min(...Object.values(laid.layoutScores).map(q => q.score));
  assert.equal(laid.layoutScores[laid.layoutStyle].score, best);
});

test('layoutQuality counts crossings, edges through boxes and bends', () => {
  const nodes = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 200, y: 0, w: 10, h: 10 }, { id: 'c', x: 90, y: 40, w: 20, h: 20 }];
  const edges = [
    { id: 'h', from: 'a', to: 'b', points: [{ x: 10, y: 50 }, { x: 200, y: 50 }] },               // passes through c
    { id: 'v', from: 'a', to: 'b', points: [{ x: 60, y: 0 }, { x: 60, y: 100 }, { x: 80, y: 100 }] }, // crosses h, 1 bend
  ];
  const q = layoutQuality({ width: 1920, height: 1024, nodes, edges, bands: [] });
  assert.equal(q.crossings, 1);
  assert.equal(q.through, 1);
  assert.equal(q.bends, 1);
});

test('render marks deprecated and planned nodes', async () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'pagamentos').status = 'deprecated';
  r.model.elements.find(e => e.id === 'k8s').status = 'planned';
  const m = normalizeModel(r);
  const views = [
    await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'context', scope: 'loja' })),
    await layoutView(resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } })),
  ];
  const html = renderHtml({ title: 't', views });
  assert.match(html, /class="node c4 k-external[^"]* st-deprecated"/);
  assert.match(html, /class="node am l-[^"]* st-planned"/);
  assert.match(html, /\.node\.st-deprecated\{/);
});

test('draft nodes and relationships are drawn as a sketch with the filters defined in each view', async () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'loja').children.find(c => c.id === 'loja.web').status = 'draft';
  r.model.relationships.find(x => x.from === 'k8s').status = 'draft';
  const m = normalizeModel(r);
  const views = [
    await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' })),
    await layoutView(resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } })),
  ];
  const html = renderHtml({ title: 't', views });
  assert.match(html, /<filter id="v0-sk1"[^>]*>[\s\S]*?feDisplacementMap/);
  assert.match(html, /<filter id="v1-sk2"/);
  assert.match(html, /<filter id="lg-sk1"/);
  assert.match(html, /class="node c4 [^"]*st-draft sketchy"/);
  assert.match(html, /class="shape2" filter="url\(#v0-sk2\)"/);
  assert.match(html, /class="edge t-serving[^"]* sketchy"/);
  assert.match(html, /<b>rascunho<\/b>/);
  assert.match(html, /--sketch-ink:/);
});
