import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { layoutView, legibility, layoutQuality, AM_STYLES } from '../scripts/lib/layout.mjs';
import { renderHtml, viewData } from '../scripts/lib/render.mjs';
import { previewModel, annotateView } from '../scripts/lib/preview.mjs';
import { asBase } from './helpers.mjs';

const raw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
test('layout assigns absolute coordinates to every node and edge', async () => {
  const m = normalizeModel(asBase(raw()));
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
  const m = normalizeModel(asBase(raw()));
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
  const m = normalizeModel(asBase(raw()));
  const laid = await layoutView(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja', layout: { direction: 'DOWN' } }));
  assert.equal(laid.direction, 'DOWN');
});

test('legibility reports on-screen font size and suggests splitting', async () => {
  const m = normalizeModel(asBase(raw()));
  const laid = await layoutView(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja' }));
  const big = legibility(laid, 1920, 1080);
  assert.ok(big.scale > 0 && big.minFontPx > 0);
  const tiny = legibility(laid, 320, 200);
  assert.equal(tiny.ok, false);
  assert.match(tiny.suggestion, /divid|focus/i);
});

test('rendered svg is fluid: viewBox, meet, no fixed size; presentation + navigation wired', async () => {
  const m = normalizeModel(asBase(raw()));
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
  const m = normalizeModel(asBase(raw()));
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
  const m = normalizeModel(asBase(raw()));
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
  const m = normalizeModel(asBase(raw()));
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
  const m = normalizeModel(asBase(r));
  const views = [
    await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'context', scope: 'loja' })),
    await layoutView(resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } })),
  ];
  const html = renderHtml({ title: 't', views });
  assert.match(html, /class="node c4 k-external[^"]* st-deprecated"/);
  assert.match(html, /class="node am l-[^"]* st-planned"/);
  assert.match(html, /\.node\.st-deprecated\{/);
});

const nodeG = (html, id) => html.match(new RegExp(`<g class="node [^"]*"[^>]*data-node="${id.replace(/\./g, '\\.')}"[\\s\\S]*?</g>(?=<g class="node |</g></g></svg>)`))?.[0] ?? '';

test('draft nodes and relationships are hand-drawn with rough.js (hachure + double outline), no SVG filters', async () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'loja').children.find(c => c.id === 'loja.web').status = 'draft';
  r.model.elements.find(e => e.id === 'venda').status = 'draft';
  r.model.relationships.find(x => x.from === 'k8s').status = 'draft';
  const m = normalizeModel(asBase(r));
  const views = [
    await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' })),
    await layoutView(resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } })),
  ];
  const html = renderHtml({ title: 't', views });
  assert.doesNotMatch(html, /feDisplacementMap|class="shape2"/, 'the displacement filters are gone');
  assert.match(html, /class="node c4 [^"]*st-draft sketchy"/);
  const web = nodeG(html, 'loja.web');
  assert.match(web, /<path class="sk-fill" d="M/);
  assert.ok((web.match(/class="sk-line"/g) || []).length >= 1, 'hand-drawn outline');
  assert.match(web, /<rect class="shape"/, 'the original shape stays underneath for hit-testing and focus');
  assert.match(nodeG(html, 'venda'), /<path class="sk-fill" d="M/, 'ArchiMate drafts are hand-drawn too');
  assert.match(html, /<g class="edge t-serving[^"]* sketchy"[\s\S]*?<path class="sk-edge" d="M/);
  assert.match(html, /<b>rascunho<\/b>/);
  assert.match(html, /--sketch-ink:/);
  assert.match(html, /\.node\.sketchy text\{[^}]*paint-order:stroke/, 'text halo');
  assert.equal(renderHtml({ title: 't', views }), html, 'deterministic: same model, same strokes');
});

test('every C4 shape can be hand-drawn: person, database (with rim) and queue', async () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'cliente').status = 'draft';
  const loja = r.model.elements.find(e => e.id === 'loja');
  loja.children.find(c => c.id === 'loja.db').status = 'draft';
  loja.children.push({ id: 'loja.fila', type: 'c4:container', name: 'Fila', tags: ['queue'], status: 'draft' });
  r.model.relationships.push({ from: 'loja.web', to: 'loja.fila' });
  const m = normalizeModel(asBase(r));
  const html = renderHtml({ title: 't', views: [await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }))] });
  for (const id of ['cliente', 'loja.db', 'loja.fila']) assert.match(nodeG(html, id), /<path class="sk-fill" d="M/, id);
  assert.ok((nodeG(html, 'loja.db').match(/class="sk-line"/g) || []).length >= 2, 'body and rim outlines');
  assert.ok((nodeG(html, 'cliente').match(/class="sk-line"/g) || []).length >= 2, 'head and body outlines');
  assert.match(html, /\.node\.sketchy\.focus \.shape,\.node\.sketchy\.anchor \.shape\{stroke:var\(--focus\)/);
});

test('a render without drafts or preview has no hand-drawn strokes', async () => {
  const html = renderHtml({ title: 't', views: [await layoutView(resolveView(normalizeModel(asBase(raw())), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }))] });
  assert.doesNotMatch(html, /class="sk-(fill|line|edge)"/);
});

test('preview marks, banner and drawer data are rendered; a normal render has none of them', async () => {
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
    model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }, { id: 'loja.web', type: 'c4:container', technology: 'Remix' }] },
    ops: [{ op: 'remove', id: 'loja.db' }] };
  const p = previewModel(asBase(raw()), { delta: d });
  const v = annotateView(resolveView(normalizeModel(p.raw), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: p.keep }), p);
  const html = renderHtml({ title: 't', views: [await layoutView(v)], preview: { label: 'delta de teste' } });
  assert.match(html, /<div class="preview-banner" role="status">PRÉVIA · não é a base oficial — delta de teste<\/div>/);
  assert.match(html, /<body class="preview">/);
  assert.match(html, /class="node c4 [^"]*sketchy ch-added"/);
  assert.match(html, /class="node c4 [^"]*ch-changed pending"/);
  assert.match(html, /class="node c4 [^"]*ch-removed pending"/);
  assert.match(html, /<g class="mark m-pending">/);
  assert.match(html, /<g class="strike">/);
  assert.match(html, /class="edge [^"]*ch-removed"/);
  assert.match(html, /mudanças da prévia/);
  const data = JSON.parse(html.match(/<script id="archlens-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.views[0].nodes['loja.web'].changeFields, [{ field: 'technology', before: 'Next.js', after: 'Remix' }]);
  assert.equal(data.views[0].nodes['loja.db'].pending[0].assumed, 'yes');
  assert.deepEqual(data.views[0].nodes['loja.db'].pending[0].options, ['yes', 'no']);
  assert.match(html, /sai: 'sai'|removed: 'sai'/);
  assert.match(html, /opções: /);
  assert.match(html, /\.node\.c4 \.mark text/);
  const plain = renderHtml({ title: 't', views: [await layoutView(resolveView(normalizeModel(asBase(raw())), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }))] });
  assert.doesNotMatch(plain, /<div class="preview-banner"|<body class="preview"|<g class="mark /);
});

test('a relationship-only change and its open question are visible on the edge, in the legend and in the drawer', async () => {
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
    model: { relationships: [{ from: 'cliente', to: 'loja.web', type: 'uses', description: 'Compra online' }] } };
  const p = previewModel(asBase(raw()), { delta: d });
  const v = annotateView(resolveView(normalizeModel(p.raw), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: p.keep }), p);
  assert.ok(v.nodes.every(n => !n.change && !n.pending), 'no node changes');
  const html = renderHtml({ title: 't', views: [await layoutView(v)], preview: { label: 'x' } });
  const g = html.match(/<g class="edge [^"]*ch-changed"[\s\S]*?<path class="flow"[^>]*\/>(?:<g class="elabel[\s\S]*?<\/g>)?(?:<g class="mark[\s\S]*?<\/g>)?/)?.[0];
  assert.ok(g, 'edge marked ch-changed');
  assert.match(g, /<path class="sk-edge" d="M/);
  assert.match(g, /<g class="mark m-pending"><circle [^>]*r="10"\/>/);
  assert.match(html, /\.edge\.ch-changed \.sk-edge\{stroke-width:3\}/);
  assert.match(html.slice(html.indexOf('<section class="view"')), /mudanças da prévia/);
  assert.match(html, /e\.pending && e\.pending\.length/, 'the drawer lists the edge questions');
});

import { seedOf } from '../scripts/lib/sketch.mjs';

const platRaw = () => JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
const renderPlat = async (spec, raw = platRaw()) => {
  const laid = await layoutView(resolveView(normalizeModel(asBase(raw)), spec));
  return renderHtml({ title: 't', views: [laid] });
};

test('frames are drawn with a stable color per grouping, a chip and a legend entry', async () => {
  const html = await renderPlat({ key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } });
  const c = seedOf('plat-aut') % 8;
  assert.match(html, new RegExp(`<g class="gframe gc-${c}" data-frame="plat-aut">`));
  assert.match(html, /class="f-chip"[^>]*>[\s\S]*?Plataforma de Autorização[\s\S]*?AGRUPAMENTO/);
  assert.match(html, /<b>agrupamento<\/b>/);
  const again = await renderPlat({ key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } });
  assert.equal(html, again, 'deterministic');
});

test('ArchiMate frames: one per group and layer, single-line chip', async () => {
  const html = await renderPlat({ key: 'g', notation: 'archimate', viewpoint: 'layered', granularity: 'system', groups: { only: ['plat-aut', 'plat-cred'] }, layout: { style: 'bands-flow' } });
  assert.equal((html.match(/data-frame="plat-aut"/g) || []).length, 3);
  assert.doesNotMatch(html.slice(html.indexOf('data-frame="plat-aut"'), html.indexOf('data-frame="plat-aut"') + 800), /AGRUPAMENTO/);
});

test('no frames when the view turns them off', async () => {
  const html = await renderPlat({ key: 'l', notation: 'c4', level: 'landscape', groups: { only: ['plat-aut', 'plat-cred'], frames: false } });
  assert.doesNotMatch(html, /class="gframe/);
  assert.doesNotMatch(html, /<b>agrupamento<\/b>/);
});

test('a draft grouping gets a hand-drawn frame', async () => {
  const raw = platRaw();
  raw.model.elements.find(e => e.id === 'plat-cred').status = 'draft';
  const html = await renderPlat({ key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } }, raw);
  assert.match(html, /<g class="gframe gc-\d sketchy" data-frame="plat-cred">[\s\S]*?class="ch-outline"/);
});

test('preview: a new grouping is sketched with "+" on its chip', async () => {
  const p = previewModel(asBase(platRaw()), { delta: { 'archlens-delta': '1.0', model: { elements: [
    { id: 'plat-fraude', type: 'grouping', name: 'Plataforma de Fraude' },
    { id: 'antifraude', type: 'c4:softwareSystem', name: 'Antifraude', group: 'plat-fraude' },
  ] } } });
  const v = annotateView(resolveView(normalizeModel(p.raw), { key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } }, { keep: p.keep }), p);
  const html = renderHtml({ title: 't', views: [await layoutView(v)] });
  assert.match(html, /<g class="gframe gc-\d sketchy ch-added" data-frame="plat-fraude">[\s\S]*?m-added/);
});

test('a nesting parent is drawn before its children, with its name at the top and the tooltip of the child', async () => {
  const m = normalizeModel({ archlens: '2.0', name: 'N', model: {
    elements: [
      { id: 'bus', type: 'application-component', name: 'Barramento' },
      { id: 'bus.a', type: 'application-component', name: 'Adapter' },
    ],
    relationships: [{ from: 'bus', to: 'bus.a', type: 'aggregation', description: 'reúne adaptadores' }],
  } });
  const laid = await layoutView(resolveView(m, { key: 'n', notation: 'archimate', viewpoint: 'application', nesting: 'nested' }));
  const html = renderHtml({ title: 'N', views: [laid] });
  const parentAt = html.indexOf('data-node="bus"'), childAt = html.indexOf('data-node="bus.a"');
  assert.ok(parentAt > 0 && parentAt < childAt, 'parent first');
  assert.match(html, /class="node am parent[^"]*" data-node="bus"/);
  assert.match(html, /aria-label="Adapter[^"]*reúne adaptadores/);
});

const busNested = () => normalizeModel({ archlens: '2.0', name: 'N', model: {
  elements: [
    { id: 'bus', type: 'application-component', name: 'Barramento' },
    { id: 'bus.a', type: 'application-component', name: 'Adapter' },
    { id: 'bus.b', type: 'application-component', name: 'Bridge' },
  ],
  relationships: [
    { from: 'bus', to: 'bus.a', type: 'aggregation' }, { from: 'bus', to: 'bus.b', type: 'aggregation' },
    { from: 'bus.a', to: 'bus.b', type: 'flow' },
  ],
} });

test('nesting boxes are drawn below the edges, leaves above them (edges inside a box are not under its fill)', async () => {
  const laid = await layoutView(resolveView(busNested(), { key: 'n', notation: 'archimate', viewpoint: 'application', nesting: 'nested' }));
  const html = renderHtml({ title: 'N', views: [laid] });
  const edgesAt = html.indexOf('<g class="edges">');
  assert.ok(edgesAt > 0);
  assert.ok(html.indexOf('data-node="bus"') < edgesAt, 'parent before the edges');
  assert.ok(html.indexOf('data-node="bus.a"') > edgesAt && html.indexOf('data-node="bus.b"') > edgesAt, 'leaves after the edges');
  const order = [...html.matchAll(/class="node am[^"]*" data-node="([^"]+)"[^>]*style="--i:(\d+)"/g)].map(m => [m[1], +m[2]]);
  assert.deepEqual(order.map(o => o[1]).sort((a, b) => a - b), [0, 1, 2], 'one --i sequence across both node groups');
});

test('layer steps reveal a nested child with its outermost box\'s layer', async () => {
  const m = normalizeModel({ archlens: '2.0', name: 'X', model: { elements: [
    { id: 'srv', type: 'node', name: 'Servidor' },
    { id: 'app', type: 'application-component', name: 'App', parent: 'srv' },
    { id: 'proc', type: 'business-process', name: 'Vender' },
  ], relationships: [{ from: 'app', to: 'proc', type: 'serving' }] } });
  const laid = await layoutView(resolveView(m, { key: 'x', notation: 'archimate', viewpoint: 'layered', nesting: 'nested' }));
  assert.equal(laid.nodes.find(n => n.id === 'app').nestedIn, 'srv');
  const html = renderHtml({ title: 'X', views: [laid] });
  const data = JSON.parse(html.match(/<script id="archlens-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.views[0].nodes.app.band, 'technology');
  assert.equal(data.views[0].nodes.proc.band, 'business');
  assert.match(html, /n\.band === layer/);
});

const containerView = async () => {
  const m = normalizeModel(asBase(raw()));
  return layoutView(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja' }));
};

test('embed omits the page chrome and keeps the diagram', async () => {
  const html = renderHtml({ title: 'Loja Mini', views: [await containerView()], embed: true });
  for (const c of ['class="bar"', 'class="drawer"', 'class="legibility"']) assert.ok(!html.includes(c), c);
  assert.ok(html.includes('data-node="loja.api"'));
  assert.ok(html.includes('class="hovercard"'));
  assert.ok(html.includes('"embed":true'));
  assert.ok(html.includes(':root {--bar-h:0px}'), 'no blank band where the bar was');
  assert.ok(!renderHtml({ title: 'Loja Mini', views: [await containerView()] }).includes('--bar-h:0px'));
});

test('embed bridge: only the parent window commands, and select can center the node', async () => {
  const html = renderHtml({ title: 'Loja Mini', views: [await containerView()], embed: true });
  const bridge = html.slice(html.indexOf('const HOST_ACTS'));
  assert.match(bridge, /ev\.source !== window\.parent\) return/);
  assert.match(bridge, /m\.type === 'select'\) \{ if \(m\.id && view\(\)\.nodes\[m\.id\]\) \{ trace\(m\.id\); if \(m\.focus\) focusNode\(m\.id\); \}/);
});

test('embed off is byte-identical to before', async () => {
  const views = [await containerView()];
  const html = renderHtml({ title: 'Loja Mini', views });
  assert.equal(html, renderHtml({ title: 'Loja Mini', views, embed: false }));
  // snapshot taken before embed existed; the interaction script itself had to grow, so compare the page without it
  const noJs = h => h.replace(/<script>[\s\S]*<\/script>\n/, '<script></script>\n');
  const before = readFileSync(new URL('./fixtures/render-page.html', import.meta.url), 'utf8');
  assert.equal(noJs(html), noJs(before));
  assert.ok(!html.includes('"embed"'), 'no embed key in the data when off');
});

test('viewData is exported', async () => {
  const d = viewData(await containerView());
  assert.equal(d.nodes['loja.api'].name, 'API');
  assert.equal(typeof d.edges[0].help.sentence, 'string');
});
