// Layout: ELK (layered, compound boundaries) for C4; for ArchiMate one of three styles (flow, bands,
// bands-flow), picked per view by layout.style or scored automatically.
// All sizes are SVG user units; the page scales them with the viewBox.
import { createRequire } from 'node:module';
import { ELEMENT_TYPES, LAYER_LABELS } from './registry.mjs';

const require = createRequire(import.meta.url);
const ELK = require('../vendor/elk.bundled.js');
const elk = new ELK();

export const FONT = { title: 20, meta: 15, desc: 15, edge: 15, band: 16, amName: 17 };
export const MIN_FONT = 15;            // smallest text that carries meaning (meta, descriptions, edge labels)
export const MIN_SCREEN_PX = 14;       // legibility target on screen
const DEFAULT_RATIO = 16 / 9;
const CHAR = 0.56;                     // average glyph width / font size for system sans

export function wrap(text, fontSize, maxWidth, maxLines = 99) {
  if (!text) return [];
  // "\n" forces a line break (e.g. business name + code name underneath)
  if (String(text).includes('\n')) {
    const lines = String(text).split('\n').flatMap(p => wrap(p, fontSize, maxWidth));
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '…'); }
    return lines;
  }
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * CHAR)));
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > maxChars) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, maxChars - 1) + '-'); w = w.slice(maxChars - 1); }
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '…'); }
  return lines;
}
const textWidth = (lines, size) => Math.max(0, ...lines.map(l => l.length * size * CHAR));

export async function layoutView(view) {
  if (view.notation === 'c4') return layoutC4(view);
  return layoutArchimateStyled(view);
}

/** On-screen legibility of a laid-out view in a viewport of vw × vh pixels. */
export function legibility(laid, vw, vh) {
  const scale = Math.min(vw / laid.width, vh / laid.height);
  const minFontPx = +(MIN_FONT * scale).toFixed(1);
  const fill = +((laid.width * scale) / vw).toFixed(3);
  const ok = minFontPx >= MIN_SCREEN_PX;
  return {
    scale: +scale.toFixed(3), minFontPx, fill, ok,
    suggestion: ok ? '' : `em ${vw}×${vh} o texto fica com ~${minFontPx}px (< ${MIN_SCREEN_PX}px): divida a visão (focus + depth, exclude, collapse ou layers) ou apresente com zoom`,
  };
}

// ---------------------------------------------------------------- C4

const C4_W = 280;

function c4NodeBox(n) {
  const inner = C4_W - 32 - (n.queue ? 24 : 0);
  const title = wrap(n.name, FONT.title, inner, 3);
  const metaText = `[${n.c4Label}${n.technology ? `: ${n.technology}` : ''}]`;
  const meta = wrap(metaText, FONT.meta, inner, 2);
  const desc = wrap(n.description, FONT.desc, inner, 3);
  const head = n.c4Kind === 'person' ? 56 : 0;
  const top = n.database ? 22 : 0;
  const h = Math.max(n.c4Kind === 'person' ? 170 : 130,
    head + top + 22 + title.length * 25 + 6 + meta.length * 19 + (desc.length ? 10 + desc.length * 19 : 0) + 20);
  return { w: C4_W, h, lines: { title, meta, desc }, headH: head, topH: top };
}

function edgeLabel(e) {
  const lines = [...wrap(e.step ? `${e.step}. ${e.label || ''}`.trim() : e.label, FONT.edge, 230, 3)];
  if (e.technology) lines.push(...wrap(`[${e.technology}]`, FONT.edge - 1, 230, 2));
  return { lines, w: Math.ceil(textWidth(lines, FONT.edge)) + 12, h: lines.length * 19 + 6 };
}

async function runElk(view, direction, ratio, layerGap = 120) {
  const boxes = new Map(view.nodes.map(n => [n.id, c4NodeBox(n)]));
  const toElkNode = n => ({ id: n.id, width: boxes.get(n.id).w, height: boxes.get(n.id).h });
  const children = [];
  for (const b of view.boundaries) {
    children.push({
      id: `boundary:${b.id}`,
      layoutOptions: { 'elk.padding': '[top=64,left=36,bottom=36,right=36]' },
      children: view.nodes.filter(n => n.boundary === b.id).map(toElkNode),
    });
  }
  children.push(...view.nodes.filter(n => !n.boundary).map(toElkNode));
  const labels = new Map(view.edges.map(e => [e.id, edgeLabel(e)]));
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.aspectRatio': String(ratio),
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=32,left=12,bottom=32,right=12]',
      'elk.spacing.nodeNode': '70',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.spacing.edgeNode': '30',
      'elk.spacing.edgeEdge': '24',
      'elk.spacing.edgeLabel': '6',
      'elk.layered.spacing.edgeNodeBetweenLayers': '30',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'MEDIAN_LAYER',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.json.edgeCoords': 'ROOT',
      'elk.json.shapeCoords': 'ROOT',
    },
    children,
    edges: view.edges.map(e => ({
      id: e.id, sources: [e.from], targets: [e.to],
      labels: [{ id: `${e.id}:label`, text: labels.get(e.id).lines.join(' ') || ' ', width: labels.get(e.id).w, height: labels.get(e.id).h }],
    })),
  };
  const res = await elk.layout(graph);
  return { res, boxes, labels };
}

async function layoutC4(view) {
  const ratio = view.layout?.aspectRatio ?? DEFAULT_RATIO;
  const explicit = view.layout?.direction;
  const direction = explicit ?? view.direction ?? 'RIGHT';
  const score = r => Math.abs(Math.log((r.res.width / r.res.height) / ratio));
  let best;
  for (const dir of direction === 'auto' ? ['RIGHT', 'DOWN'] : [direction]) {
    const r = { ...(await runElk(view, dir, ratio)), dir };
    if (!best || score(r) < score(best) - 0.15) best = r;
  }
  // Landscape by default, but never a tall, narrow strip: fall back to DOWN when RIGHT is much too tall.
  if (!explicit && best.dir === 'RIGHT' && best.res.width / best.res.height < ratio * 0.8) {
    const r = { ...(await runElk(view, 'DOWN', ratio)), dir: 'DOWN' };
    if (score(r) < score(best) - 0.15) best = r;
  }
  // Still narrower than the target? Widen the gaps between layers (never the boxes) to fill the width.
  if (best.dir === 'RIGHT' && best.res.width / best.res.height < ratio) {
    const layers = new Set();
    const walkX = n => { if (!n.id.startsWith('boundary:')) layers.add(Math.round(n.x / 20)); (n.children || []).forEach(walkX); };
    (best.res.children || []).forEach(walkX);
    const gaps = Math.max(1, layers.size - 1);
    const extra = (best.res.height * ratio - best.res.width) / gaps;
    if (extra > 10) best = { ...(await runElk(view, 'RIGHT', ratio, Math.min(420, 120 + extra))), dir: 'RIGHT' };
  }
  const { res, boxes, labels } = best;
  const pos = new Map();
  const visit = n => { pos.set(n.id, n); (n.children || []).forEach(visit); };
  (res.children || []).forEach(visit);

  const nodes = view.nodes.map(n => {
    const p = pos.get(n.id), b = boxes.get(n.id);
    return { ...n, x: p.x, y: p.y, w: b.w, h: b.h, lines: b.lines, headH: b.headH, topH: b.topH };
  });
  const boundaries = view.boundaries.map(b => {
    const p = pos.get(`boundary:${b.id}`);
    return { ...b, x: p.x, y: p.y, w: p.width, h: p.height };
  });
  const edges = view.edges.map(e => {
    const le = (res.edges || []).find(x => x.id === e.id);
    const s = le?.sections?.[0];
    const points = s ? [s.startPoint, ...(s.bendPoints || []), s.endPoint] : [];
    const l = le?.labels?.[0];
    const lab = labels.get(e.id);
    return { ...e, points, labelBox: l ? { x: l.x, y: l.y, w: l.width, h: l.height } : null, labelLines: lab.lines };
  });
  return { ...view, direction: best.dir, width: Math.ceil(res.width), height: Math.ceil(res.height), nodes, edges, boundaries, bands: [], minFont: MIN_FONT, fonts: FONT };
}

// ---------------------------------------------------------------- ArchiMate

const AM_W = 210, STRIP = 56, PAD_X = 36, BAND_PAD = 44, COL_GAP = 46;

function amGroup(n) {
  if (n.layer === 'motivation' || n.layer === 'implementation' || n.layer === 'other') return 0;
  if (n.aspect === 'composite' || ELEMENT_TYPES[n.type].icon === 'service') return 0;
  if (n.aspect === 'behavior') return 1;
  return 2;
}

function amNodeBox(n) {
  const name = wrap(n.name, FONT.amName, AM_W - 44, 3);
  return { w: AM_W, h: Math.max(76, 30 + name.length * 22 + 18), lines: { title: name } };
}

// ---------------------------------------------------------------- ArchiMate — style "flow" (ELK)

// Each (layer × aspect group) is an ELK partition, so layers keep their order while ELK layers, orders and
// routes (orthogonal) exactly as in C4. Direction: DOWN = horizontal bands, RIGHT = layer columns;
// "auto" (default) keeps whichever canvas renders larger (more legible) on a screen of the target ratio.
async function layoutArchimateElk(view) {
  const ratio = view.layout?.aspectRatio ?? DEFAULT_RATIO;
  const want = view.layout?.direction;
  const dirs = want === 'DOWN' || want === 'RIGHT' ? [want] : ['DOWN', 'RIGHT'];
  const scale = l => Math.min(ratio / l.width, 1 / l.height);
  let best;
  for (const d of dirs) { const l = await runAmElk(view, d); if (!best || scale(l) > scale(best)) best = l; }
  return best;
}

async function runAmElk(view, DIR) {
  const boxes = new Map(view.nodes.map(n => [n.id, amNodeBox(n)]));
  const part = new Map(view.nodes.map(n => [n.id, Math.max(0, view.layers.indexOf(n.layer)) * 3 + amGroup(n)]));
  const labels = new Map(view.edges.map(e => [e.id, edgeLabel(e)]));
  const edges = view.edges.filter(e => part.has(e.from) && part.has(e.to));
  // Feed ELK every edge pointing "forward" in the partition order; flip the route back afterwards.
  const flipped = new Set(edges.filter(e => part.get(e.from) > part.get(e.to)).map(e => e.id));
  const H = DIR === 'RIGHT';
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': DIR,
      'elk.partitioning.activate': 'true',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': H ? `[top=${STRIP + 8},left=${PAD_X},bottom=${PAD_X},right=${PAD_X}]` : `[top=${BAND_PAD},left=${STRIP + PAD_X},bottom=${BAND_PAD},right=${PAD_X}]`,
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.edgeNode': '30',
      'elk.spacing.edgeEdge': '22',
      'elk.spacing.edgeLabel': '6',
      'elk.layered.spacing.edgeNodeBetweenLayers': '30',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'MEDIAN_LAYER',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.json.edgeCoords': 'ROOT',
      'elk.json.shapeCoords': 'ROOT',
    },
    children: view.nodes.map(n => ({ id: n.id, width: boxes.get(n.id).w, height: boxes.get(n.id).h,
      layoutOptions: { 'elk.partitioning.partition': String(part.get(n.id)) } })),
    edges: edges.map(e => {
      const [src, dst] = flipped.has(e.id) ? [e.to, e.from] : [e.from, e.to];
      const lab = labels.get(e.id);
      return { id: e.id, sources: [src], targets: [dst],
        labels: e.label ? [{ id: `${e.id}:label`, text: lab.lines.join(' '), width: lab.w, height: lab.h }] : [] };
    }),
  };
  const res = await elk.layout(graph);
  const pos = new Map(res.children.map(c => [c.id, c]));
  const width = Math.ceil(res.width), height = Math.ceil(res.height);

  // Bands (or columns): split halfway between the last node of a layer and the first node of the next.
  const Y = H ? 'x' : 'y', S = H ? 'width' : 'height';
  const extent = view.layers.map(layer => {
    const ps = view.nodes.filter(n => n.layer === layer).map(n => pos.get(n.id));
    return ps.length ? { layer, top: Math.min(...ps.map(p => p[Y])), bottom: Math.max(...ps.map(p => p[Y] + p[S])) } : null;
  }).filter(Boolean);
  const bands = extent.map((b, i) => {
    const top = i ? (extent[i - 1].bottom + b.top) / 2 : 0;
    const bottom = i < extent.length - 1 ? (b.bottom + extent[i + 1].top) / 2 : (H ? width : height);
    return H ? { layer: b.layer, label: LAYER_LABELS[b.layer], x: top, y: 0, width: bottom - top, height, vertical: true }
      : { layer: b.layer, label: LAYER_LABELS[b.layer], x: 0, y: top, width, height: bottom - top };
  });
  const nodes = view.nodes.map(n => {
    const p = pos.get(n.id), b = boxes.get(n.id);
    return { ...n, x: p.x, y: p.y, w: b.w, h: b.h, lines: b.lines };
  });
  const outEdges = edges.map(e => {
    const le = (res.edges || []).find(x => x.id === e.id);
    const sec = le?.sections?.[0];
    let points = sec ? [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint] : [];
    if (flipped.has(e.id)) points = points.reverse();
    const l = le?.labels?.[0];
    return { ...e, points, labelBox: l ? { x: l.x, y: l.y, w: l.width, h: l.height } : null, labelLines: e.label ? labels.get(e.id).lines : [] };
  });
  return { ...view, direction: DIR, width, height, nodes, edges: outEdges, boundaries: [], bands, minFont: MIN_FONT, fonts: FONT };
}

// ---------------------------------------------------------------- ArchiMate — style "bands"

// Same horizontal bands and rows as the band placer, but: edges are orthogonal, every horizontal run gets
// its own track in the gap ("channel") it uses, channels grow with their track count, and edges that skip
// rows go down a vertical lane through free space between the boxes of the rows in between.
const TRACK = 20, LANE = 14, MIN_ROW_GAP = 72, EDGE_CLEAR = 14;

function layoutArchimateRouted(view) {
  const ratio = view.layout?.aspectRatio ?? DEFAULT_RATIO;
  const boxes = new Map(view.nodes.map(n => [n.id, amNodeBox(n)]));
  const adj = new Map(view.nodes.map(n => [n.id, []]));
  for (const e of view.edges) { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); }
  const groups = [];
  for (const layer of view.layers) for (const g of [0, 1, 2]) {
    const members = view.nodes.filter(n => n.layer === layer && amGroup(n) === g).map(n => n.id);
    if (members.length) groups.push({ layer, g, members });
  }
  const maxGroup = Math.max(1, ...groups.map(g => g.members.length));
  const rowH = members => Math.max(...members.map(id => boxes.get(id).h));
  const colGap = COL_GAP + 3 * LANE;
  const measure = C => {
    let h = 0;
    for (const layer of view.layers) {
      let first = true; h += 2 * BAND_PAD;
      for (const g of groups.filter(x => x.layer === layer)) for (let i = 0; i < g.members.length; i += C) {
        h += rowH(g.members.slice(i, i + C)) + (first ? 0 : MIN_ROW_GAP + 3 * TRACK); first = false;
      }
    }
    return { w: STRIP + 2 * PAD_X + C * AM_W + (C - 1) * colGap, h };
  };
  let C = maxGroup;
  for (let c = 1; c <= maxGroup; c++) { const m = measure(c); if (m.w / m.h >= ratio) { C = c; break; } }

  // Barycenter ordering inside each group (same as the band placer).
  const rank = new Map();
  groups.forEach((g, gi) => g.members.forEach((id, i) => rank.set(id, { gi, x: (i + 0.5) / g.members.length })));
  for (let it = 0; it < 8; it++) for (const g of it % 2 ? [...groups].reverse() : groups) {
    const bary = id => { const ns = adj.get(id).filter(o => rank.get(o)?.gi !== rank.get(id).gi); return ns.length ? ns.reduce((s, o) => s + rank.get(o).x, 0) / ns.length : rank.get(id).x; };
    g.members = g.members.map(id => [id, bary(id)]).sort((a, b) => a[1] - b[1]).map(s => s[0]);
    g.members.forEach((id, i) => { rank.get(id).x = (i + 0.5) / g.members.length; });
  }
  const rows = []; // { layer, members, h, first (of band) }
  for (const layer of view.layers) {
    let first = true;
    for (const g of groups.filter(x => x.layer === layer)) for (let i = 0; i < g.members.length; i += C) {
      const members = g.members.slice(i, i + C);
      rows.push({ layer, members, h: rowH(members), first }); first = false;
    }
  }
  const rowOf = new Map(); rows.forEach((r, ri) => r.members.forEach(id => rowOf.set(id, ri)));

  const attempt = width => {
    // x: justified slots pulled toward neighbours (same as the band placer), min distance keeps lane room.
    const left = STRIP + PAD_X, right = width - PAD_X, usable = right - left;
    const cx = new Map();
    rows.forEach(r => { const slot = usable / r.members.length; r.members.forEach((id, k) => cx.set(id, left + slot * (k + 0.5))); });
    for (let pass = 0; pass < 3; pass++) {
      const c = new Map(cx);
      for (const r of rows) {
        const slot = usable / r.members.length;
        const items = r.members.map((id, k) => {
          const ns = adj.get(id).filter(o => rowOf.get(o) !== rowOf.get(id));
          const bc = ns.length ? ns.reduce((s, o) => s + c.get(o), 0) / ns.length : null;
          const base = left + slot * (k + 0.5);
          return { id, x: bc === null ? base : 0.5 * base + 0.5 * bc };
        }).sort((a, b) => a.x - b.x);
        const min = AM_W + colGap;
        for (let k = 0; k < items.length; k++) items[k].x = Math.max(items[k].x, k ? items[k - 1].x + min : left + AM_W / 2);
        for (let k = items.length - 1; k >= 0; k--) items[k].x = Math.min(items[k].x, k < items.length - 1 ? items[k + 1].x - min : right - AM_W / 2);
        r.members = items.map(i => i.id);
        items.forEach(i => cx.set(i.id, i.x));
      }
    }
    const xr = id => ({ x0: cx.get(id) - boxes.get(id).w / 2, x1: cx.get(id) + boxes.get(id).w / 2 });

    // Plan: which sides, which channel(s), which vertical lane.
    const lanes = []; // { x, r0, r1 } vertical runs through rows r0..r1
    const freeX = (r0, r1, want) => {
      const blocked = [];
      for (let r = r0; r <= r1; r++) for (const id of rows[r].members) { const { x0, x1 } = xr(id); blocked.push([x0 - EDGE_CLEAR, x1 + EDGE_CLEAR]); }
      for (const l of lanes) if (l.r0 <= r1 && l.r1 >= r0) blocked.push([l.x - LANE, l.x + LANE]);
      blocked.sort((a, b) => a[0] - b[0]);
      const cands = [want, left - PAD_X / 2 + 4, right + PAD_X / 2 - 4];
      for (const [a, b] of blocked) cands.push(a - 1, b + 1);
      let best = null;
      for (const x of cands) {
        if (x < STRIP + 8 || x > width - 8) continue;
        if (blocked.some(([a, b]) => x > a && x < b)) continue;
        if (best === null || Math.abs(x - want) < Math.abs(best - want)) best = x;
      }
      return best ?? want;
    };
    const plan = view.edges.map(e => {
      if (!rowOf.has(e.from) || !rowOf.has(e.to)) return null;
      const ra = rowOf.get(e.from), rb = rowOf.get(e.to);
      if (ra === rb) {
        const [a, b] = [xr(e.from), xr(e.to)];
        const lo = Math.min(a.x1, b.x1), hi = Math.max(a.x0, b.x0);
        const between = rows[ra].members.some(id => id !== e.from && id !== e.to && xr(id).x0 < hi && xr(id).x1 > lo);
        if (!between) return { e, kind: 'side', sa: cx.get(e.from) < cx.get(e.to) ? 'right' : 'left', sb: cx.get(e.from) < cx.get(e.to) ? 'left' : 'right' };
        return { e, kind: 'under', sa: 'bottom', sb: 'bottom', ch: ra + 1 };
      }
      const down = ra < rb, ru = Math.min(ra, rb), rl = Math.max(ra, rb);
      const p = { e, kind: 'cross', sa: down ? 'bottom' : 'top', sb: down ? 'top' : 'bottom', ru, rl };
      if (rl > ru + 1) {
        const [u, l] = down ? [e.from, e.to] : [e.to, e.from];
        const want = (cx.get(u) + cx.get(l)) / 2;
        p.lane = freeX(ru + 1, rl - 1, want);
        lanes.push({ x: p.lane, r0: ru + 1, r1: rl - 1 });
      }
      return p;
    }).filter(Boolean);

    // Ports: spread along each side, ordered by where the edge heads to.
    const ends = new Map();
    const reg = (id, side, key, toward) => { const k = id + '\u0000' + side; if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ key, toward }); };
    for (const p of plan) {
      const ta = p.lane ?? cx.get(p.e.to), tb = p.lane ?? cx.get(p.e.from);
      reg(p.e.from, p.sa, p.e.id + ':from', ta); reg(p.e.to, p.sb, p.e.id + ':to', tb);
    }
    const portX = new Map(), portT = new Map(); // x on top/bottom, fraction t on left/right
    for (const [k, list] of ends) {
      const [id, side] = k.split('\u0000');
      list.sort((a, b) => a.toward - b.toward);
      const { x0 } = xr(id), w = boxes.get(id).w;
      list.forEach((q, i) => {
        const t = (i + 1) / (list.length + 1);
        if (side === 'top' || side === 'bottom') portX.set(q.key, x0 + w * (0.12 + 0.76 * t)); else portT.set(q.key, 0.25 + 0.5 * t);
      });
    }

    // Horizontal runs per channel → tracks (greedy interval colouring).
    const runs = new Map(); // ch → [{ key, a, b }]
    const run = (ch, key, x1, x2) => { if (!runs.has(ch)) runs.set(ch, []); runs.get(ch).push({ key, a: Math.min(x1, x2), b: Math.max(x1, x2) }); };
    for (const p of plan) {
      const id = p.e.id, fx = portX.get(id + ':from'), tx = portX.get(id + ':to');
      if (p.kind === 'under') run(p.ch, id, fx, tx);
      if (p.kind === 'cross') {
        const [ux, lx] = p.sa === 'bottom' ? [fx, tx] : [tx, fx];
        if (p.lane === undefined) run(p.ru + 1, id, ux, lx);
        else { run(p.ru + 1, id + '#1', ux, p.lane); run(p.rl, id + '#2', p.lane, lx); }
      }
    }
    const track = new Map(), tracks = new Map();
    for (const [ch, list] of runs) {
      list.sort((p, q) => p.a - q.a);
      const ends = [];
      for (const r of list) {
        let k = ends.findIndex(end => end < r.a - 10);
        if (k < 0) { k = ends.length; ends.push(0); }
        ends[k] = r.b; track.set(r.key, k);
      }
      tracks.set(ch, ends.length);
    }

    // y: channel c sits above row c (c = rows.length is below the last row).
    const chH = c => {
      const base = c === 0 || c === rows.length ? BAND_PAD : rows[c].first ? 2 * BAND_PAD : MIN_ROW_GAP;
      return Math.max(base, ((tracks.get(c) || 0) + 1) * TRACK + 8);
    };
    const chTop = [], rowTop = [];
    let y = 0;
    for (let c = 0; c <= rows.length; c++) { chTop[c] = y; y += chH(c); if (c < rows.length) { rowTop[c] = y; y += rows[c].h; } }
    const height = y;
    const trackY = (ch, key) => chTop[ch] + chH(ch) * ((track.get(key) ?? 0) + 1) / ((tracks.get(ch) || 0) + 1);
    const node = id => { const b = boxes.get(id), r = rowOf.get(id); return { x: cx.get(id) - b.w / 2, y: rowTop[r] + (rows[r].h - b.h) / 2, w: b.w, h: b.h }; };

    const edges = plan.map(p => {
      const e = p.e, a = node(e.from), b = node(e.to), id = e.id;
      let pts;
      if (p.kind === 'side') {
        const y0 = a.y + a.h * portT.get(id + ':from'), y1 = b.y + b.h * portT.get(id + ':to');
        const x0 = p.sa === 'right' ? a.x + a.w : a.x, x1 = p.sb === 'right' ? b.x + b.w : b.x, mx = (x0 + x1) / 2;
        pts = Math.abs(y0 - y1) < 1 ? [{ x: x0, y: y0 }, { x: x1, y: y0 }] : [{ x: x0, y: y0 }, { x: mx, y: y0 }, { x: mx, y: y1 }, { x: x1, y: y1 }];
      } else if (p.kind === 'under') {
        const fx = portX.get(id + ':from'), tx = portX.get(id + ':to'), ty = trackY(p.ch, id);
        pts = [{ x: fx, y: a.y + a.h }, { x: fx, y: ty }, { x: tx, y: ty }, { x: tx, y: b.y + b.h }];
      } else {
        const fx = portX.get(id + ':from'), tx = portX.get(id + ':to');
        const down = p.sa === 'bottom';
        const [u, l, ux, lx] = down ? [a, b, fx, tx] : [b, a, tx, fx];
        let path;
        if (p.lane === undefined) {
          const ty = trackY(p.ru + 1, id);
          path = [{ x: ux, y: u.y + u.h }, { x: ux, y: ty }, { x: lx, y: ty }, { x: lx, y: l.y }];
        } else {
          const t1 = trackY(p.ru + 1, id + '#1'), t2 = trackY(p.rl, id + '#2');
          path = [{ x: ux, y: u.y + u.h }, { x: ux, y: t1 }, { x: p.lane, y: t1 }, { x: p.lane, y: t2 }, { x: lx, y: t2 }, { x: lx, y: l.y }];
        }
        pts = down ? path : path.reverse();
      }
      pts = pts.filter((q, i) => i === 0 || Math.abs(q.x - pts[i - 1].x) + Math.abs(q.y - pts[i - 1].y) > 0.5);
      let lb = null;
      if (e.label) {
        let best = null;
        for (let i = 1; i < pts.length; i++) { const len = Math.abs(pts[i].x - pts[i - 1].x); if (Math.abs(pts[i].y - pts[i - 1].y) < 1 && (!best || len > best.len)) best = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: pts[i].y }; }
        const m = best ?? { x: (pts[0].x + pts.at(-1).x) / 2, y: (pts[0].y + pts.at(-1).y) / 2 };
        lb = { x: m.x, y: m.y - 14, w: 0, h: 0 };
      }
      return { ...e, points: pts, labelBox: lb, labelLines: wrap(e.label, FONT.edge, 200, 2) };
    });
    const bands = [];
    for (const layer of view.layers) {
      const rs = rows.map((r, i) => i).filter(i => rows[i].layer === layer);
      if (!rs.length) continue;
      const top = rs[0] === 0 ? 0 : chTop[rs[0]] + chH(rs[0]) / 2;
      const last = rs.at(-1), bottom = last === rows.length - 1 ? height : chTop[last + 1] + chH(last + 1) / 2;
      bands.push({ layer, label: LAYER_LABELS[layer], x: 0, y: top, width, height: bottom - top });
    }
    const nodes = view.nodes.map(n => ({ ...n, ...node(n.id), lines: boxes.get(n.id).lines }));
    return { ...view, direction: 'DOWN', width, height: Math.ceil(height), nodes, edges, boundaries: [], bands, columns: C, minFont: MIN_FONT, fonts: FONT };
  };
  // Channels grow with the edges, so re-run once with a canvas wide enough for the final height.
  let laid = attempt(Math.ceil(Math.max(measure(C).w, measure(C).h * ratio)));
  if (laid.width < laid.height * ratio * 0.95) laid = attempt(Math.ceil(laid.height * ratio));
  return laid;
}

// ---------------------------------------------------------------- ArchiMate — style "bands-flow"

// Horizontal bands with the flow ordering: inside each band ELK (RIGHT) lays out the band's own nodes and
// edges, so dependency chains read left → right. Bands are stacked, shifted to line up with their
// neighbours, spaced by the number of edges crossing them, and cross-band edges go through a grid router.
const MIX_TRACK = 16, GRID = 10;

async function layoutArchimateMix(view) {
  const boxes = new Map(view.nodes.map(n => [n.id, amNodeBox(n)]));
  const labels = new Map(view.edges.map(e => [e.id, edgeLabel(e)]));
  const layerOf = new Map(view.nodes.map(n => [n.id, n.layer]));
  const edges = view.edges.filter(e => layerOf.has(e.from) && layerOf.has(e.to));
  const layers = view.layers.filter(l => view.nodes.some(n => n.layer === l));
  const bandIx = new Map(layers.map((l, i) => [l, i]));

  // 1. each band on its own
  const bandsLaid = [];
  for (const layer of layers) {
    const ids = view.nodes.filter(n => n.layer === layer).map(n => n.id);
    const set = new Set(ids);
    const inner = edges.filter(e => set.has(e.from) && set.has(e.to));
    const res = await elk.layout({
      id: 'band',
      layoutOptions: {
        'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
        'elk.aspectRatio': '5', 'elk.padding': '[top=0,left=0,bottom=0,right=0]',
        'elk.spacing.nodeNode': '50', 'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.spacing.componentComponent': '60',
        'elk.spacing.edgeNode': '26', 'elk.spacing.edgeEdge': '18', 'elk.spacing.edgeLabel': '6',
        'elk.layered.spacing.edgeNodeBetweenLayers': '26', 'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
        'elk.edgeLabels.placement': 'CENTER', 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.json.edgeCoords': 'ROOT', 'elk.json.shapeCoords': 'ROOT',
      },
      children: ids.map(id => ({ id, width: boxes.get(id).w, height: boxes.get(id).h })),
      edges: inner.map(e => ({ id: e.id, sources: [e.from], targets: [e.to],
        labels: e.label ? [{ id: e.id + ':label', text: labels.get(e.id).lines.join(' '), width: labels.get(e.id).w, height: labels.get(e.id).h }] : [] })),
    });
    bandsLaid.push({ layer, ids, inner, res, w: res.width, h: res.height });
  }

  // 2. horizontal alignment: shift each band toward the median offset of its cross-band neighbours
  const contentW = Math.max(...bandsLaid.map(b => b.w));
  const left = STRIP + PAD_X, width = Math.ceil(left + contentW + PAD_X);
  const local = new Map();
  for (const b of bandsLaid) for (const c of b.res.children) local.set(c.id, { x: c.x, y: c.y });
  const off = bandsLaid.map(b => left + (contentW - b.w) / 2);
  const cross = edges.filter(e => layerOf.get(e.from) !== layerOf.get(e.to));
  for (let pass = 0; pass < 4; pass++) {
    bandsLaid.forEach((b, i) => {
      const d = [];
      for (const e of cross) {
        const [mine, other] = bandIx.get(layerOf.get(e.from)) === i ? [e.from, e.to] : bandIx.get(layerOf.get(e.to)) === i ? [e.to, e.from] : [];
        if (!mine) continue;
        const oi = bandIx.get(layerOf.get(other));
        d.push((off[oi] + local.get(other).x + boxes.get(other).w / 2) - (off[i] + local.get(mine).x + boxes.get(mine).w / 2));
      }
      if (!d.length) return;
      d.sort((a, c) => a - c);
      off[i] = Math.min(Math.max(off[i] + d[Math.floor(d.length / 2)] * 0.8, left), left + contentW - b.w);
    });
  }

  // 3. vertical stacking: gap between bands grows with the edges crossing that boundary
  const crossing = k => cross.filter(e => { const a = bandIx.get(layerOf.get(e.from)), c = bandIx.get(layerOf.get(e.to)); return Math.min(a, c) <= k && Math.max(a, c) > k; }).length;
  const top = [];
  let y = BAND_PAD;
  const gaps = [];
  bandsLaid.forEach((b, i) => {
    top[i] = y; y += b.h;
    if (i < bandsLaid.length - 1) { gaps[i] = Math.max(2 * BAND_PAD, (crossing(i) + 1) * MIX_TRACK + 40); y += gaps[i]; }
  });
  const height = Math.ceil(y + BAND_PAD);
  const node = id => { const i = bandIx.get(layerOf.get(id)), p = local.get(id), b = boxes.get(id); return { x: off[i] + p.x, y: top[i] + p.y, w: b.w, h: b.h }; };
  const bands = bandsLaid.map((b, i) => {
    const y0 = i ? top[i] - gaps[i - 1] / 2 : 0, y1 = i < bandsLaid.length - 1 ? top[i] + b.h + gaps[i] / 2 : height;
    return { layer: b.layer, label: LAYER_LABELS[b.layer], x: 0, y: y0, width, height: y1 - y0 };
  });

  // 4. edges: intra-band routes from ELK (shifted), cross-band routes from the grid router
  const out = new Map();
  bandsLaid.forEach((b, i) => {
    for (const e of b.inner) {
      const le = (b.res.edges || []).find(x => x.id === e.id), sec = le?.sections?.[0];
      const pts = sec ? [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint].map(p => ({ x: p.x + off[i], y: p.y + top[i] })) : [];
      const l = le?.labels?.[0];
      out.set(e.id, { ...e, points: pts, labelBox: l ? { x: l.x + off[i], y: l.y + top[i], w: l.width, h: l.height } : null, labelLines: e.label ? labels.get(e.id).lines : [] });
    }
  });
  const router = gridRouter(width, height, view.nodes.map(n => node(n.id)));
  for (const e of out.values()) router.occupy(e.points);
  // ports: spread along the facing side, ordered by the other end's x
  const sideOf = e => bandIx.get(layerOf.get(e.from)) < bandIx.get(layerOf.get(e.to)) ? ['bottom', 'top'] : ['top', 'bottom'];
  const ends = new Map();
  for (const e of cross) {
    const [sa, sb] = sideOf(e), a = node(e.from), b = node(e.to);
    for (const [id, side, key, ox] of [[e.from, sa, e.id + ':from', b.x + b.w / 2], [e.to, sb, e.id + ':to', a.x + a.w / 2]]) {
      const k = id + '\u0000' + side; if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ key, ox });
    }
  }
  const port = new Map();
  for (const [k, list] of ends) {
    const [id, side] = k.split('\u0000'), n = node(id);
    list.sort((p, q) => p.ox - q.ox);
    // ports on grid columns, so the router's stubs stay straight
    list.forEach((q, i) => port.set(q.key, { x: Math.round((n.x + n.w * (0.15 + 0.7 * (i + 1) / (list.length + 1))) / GRID) * GRID, y: side === 'top' ? n.y : n.y + n.h, side }));
  }
  // shortest first, so long edges bend around the short ones
  const order = [...cross].sort((p, q) => Math.abs(port.get(p.id + ':from').y - port.get(p.id + ':to').y) - Math.abs(port.get(q.id + ':from').y - port.get(q.id + ':to').y));
  for (const e of order) {
    const pts = router.route(port.get(e.id + ':from'), port.get(e.id + ':to'));
    let lb = null;
    if (e.label) {
      let best = null;
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].y - pts[i - 1].y) < 1) { const len = Math.abs(pts[i].x - pts[i - 1].x); if (!best || len > best.len) best = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: pts[i].y }; }
      if (best) lb = { x: best.x, y: best.y - 14, w: 0, h: 0 };
    }
    out.set(e.id, { ...e, points: pts, labelBox: lb, labelLines: wrap(e.label, FONT.edge, 200, 2) });
  }
  const nodes = view.nodes.map(n => ({ ...n, ...node(n.id), lines: boxes.get(n.id).lines }));
  return { ...view, direction: 'DOWN', width, height, nodes, edges: edges.map(e => out.get(e.id)).filter(Boolean), boundaries: [], bands, minFont: MIN_FONT, fonts: FONT };
}

// Orthogonal A* on a GRID-sized lattice: boxes are obstacles, bends cost, reusing a cell in the same
// direction as an earlier edge costs a lot (edges keep apart), crossing one costs a little.
function gridRouter(width, height, rects) {
  const W = Math.ceil(width / GRID) + 1, H = Math.ceil(height / GRID) + 1;
  const blocked = new Uint8Array(W * H), used = new Uint8Array(W * H * 2); // [h, v]
  const cellX = x => Math.max(0, Math.min(W - 1, Math.round(x / GRID))), cellY = y => Math.max(0, Math.min(H - 1, Math.round(y / GRID)));
  for (const r of rects) {
    for (let cy = cellY(r.y - 12); cy <= cellY(r.y + r.h + 12); cy++) for (let cx = cellX(r.x - 12); cx <= cellX(r.x + r.w + 12); cx++) blocked[cy * W + cx] = 1;
  }
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx <= cellX(STRIP); cx++) blocked[cy * W + cx] = 1;
  const mark = (x0, y0, x1, y1) => {
    const [a, b] = [cellX(x0), cellX(x1)].sort((p, q) => p - q), [c, d] = [cellY(y0), cellY(y1)].sort((p, q) => p - q);
    const o = a === b ? 1 : 0;
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) { const k = cy * W + cx; used[k * 2 + o] = 1; if (o === 0) { if (cy > 0) used[(k - W) * 2] = 1; if (cy < H - 1) used[(k + W) * 2] = 1; } else { if (cx > 0) used[(k - 1) * 2 + 1] = 1; if (cx < W - 1) used[(k + 1) * 2 + 1] = 1; } }
  };
  const occupy = pts => { for (let i = 1; i < pts.length; i++) mark(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y); };
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  function route(p0, p1) {
    // leave / enter the box through a short straight stub outside the obstacle margin
    const out = s => s === 'top' ? -1 : 1;
    const sx = cellX(p0.x), sy = cellY(p0.y + out(p0.side) * 24), tx = cellX(p1.x), ty = cellY(p1.y + out(p1.side) * 24);
    const N = W * H, g = new Float64Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
    const heap = [];
    const push = (f, s) => { heap.push([f, s]); let i = heap.length - 1; while (i) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const startDir = p0.side === 'top' ? 3 : 2;
    const s0 = (sy * W + sx) * 4 + startDir;
    g[s0] = 0; push(0, s0);
    const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (!blocked[y * W + x] || (x === tx && y === ty) || (x === sx && y === sy));
    let goal = -1;
    while (heap.length) {
      const [, st] = pop();
      const c = st >> 2, d = st & 3, x = c % W, y = (c / W) | 0;
      if (x === tx && y === ty) { goal = st; break; }
      for (let nd = 0; nd < 4; nd++) {
        if ((d ^ nd) === 1 && d >> 1 === nd >> 1) continue; // no U-turn
        const nx = x + DX[nd], ny = y + DY[nd];
        if (!free(nx, ny)) continue;
        const k = ny * W + nx, o = nd >> 1; // 0 horizontal, 1 vertical
        const cost = 1 + (nd !== d ? 6 : 0) + (used[k * 2 + o] ? 40 : 0) + (used[k * 2 + (1 - o)] ? 1.5 : 0);
        const ns = k * 4 + nd, ng = g[st] + cost;
        if (ng < g[ns]) { g[ns] = ng; prev[ns] = st; push(ng + Math.abs(nx - tx) + Math.abs(ny - ty), ns); }
      }
    }
    if (goal < 0) return [p0, p1];
    const cells = [];
    for (let st = goal; st >= 0; st = prev[st]) cells.push(st >> 2);
    cells.reverse();
    let pts = [{ x: p0.x, y: p0.y }, { x: p0.x, y: sy * GRID }];
    for (const c of cells) pts.push({ x: (c % W) * GRID, y: ((c / W) | 0) * GRID });
    pts.push({ x: p1.x, y: ty * GRID }, { x: p1.x, y: p1.y });
    // snap the stubs: the first/last grid columns are the port columns
    pts[2].x = p0.x; pts[pts.length - 3].x = p1.x;
    for (let i = 2; i < pts.length - 2 && Math.abs(pts[i].x - sx * GRID) < 0.5; i++) pts[i].x = p0.x;
    for (let i = pts.length - 3; i > 1 && Math.abs(pts[i].x - tx * GRID) < 0.5; i--) pts[i].x = p1.x;
    // drop collinear points
    const simple = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = simple[simple.length - 1], b = pts[i], c = pts[i + 1];
      if ((Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5)) continue;
      simple.push(b);
    }
    simple.push(pts[pts.length - 1]);
    occupy(simple);
    return simple;
  }
  return { route, occupy };
}

// ---------------------------------------------------------------- ArchiMate — style selection

// layout.style: "flow" (ELK, dependency flow; layers become bands or columns), "bands" (horizontal
// bands, rows by aspect, routed channels), "bands-flow" (horizontal bands, dependency flow inside each
// band) or "auto" (default): lay out all three and keep the best score (see layoutQuality).
export const AM_STYLES = ['flow', 'bands', 'bands-flow'];
const AM_ENGINES = { flow: layoutArchimateElk, bands: layoutArchimateRouted, 'bands-flow': layoutArchimateMix };

async function layoutArchimateStyled(view) {
  const want = view.layout?.style ?? 'auto';
  if (AM_ENGINES[want]) return { ...(await AM_ENGINES[want](view)), layoutStyle: want, layoutAuto: false };
  const tried = [];
  for (const style of AM_STYLES) {
    const laid = await AM_ENGINES[style](view);
    tried.push({ style, laid, q: layoutQuality(laid) });
  }
  tried.sort((a, b) => a.q.score - b.q.score);
  const best = tried[0];
  return { ...best.laid, layoutStyle: best.style, layoutAuto: true, layoutScores: Object.fromEntries(tried.map(t => [t.style, t.q])) };
}

/** Lower is better: how easy the edges are to follow (crossings, edges through boxes and bends, per
 *  edge) plus a soft penalty for small text at the initial fit on a 1920×1024 stage. */
export function layoutQuality(laid, vw = 1920, vh = 1024) {
  const segs = [];
  for (const e of laid.edges) for (let i = 1; i < e.points.length; i++) segs.push({ e: e.id, a: e.points[i - 1], b: e.points[i] });
  const hs = segs.filter(s => Math.abs(s.a.y - s.b.y) < 0.5), vs = segs.filter(s => Math.abs(s.a.x - s.b.x) < 0.5);
  let crossings = 0;
  for (const h of hs) for (const v of vs) {
    if (h.e === v.e) continue;
    const [x0, x1] = [h.a.x, h.b.x].sort((p, q) => p - q), [y0, y1] = [v.a.y, v.b.y].sort((p, q) => p - q);
    if (v.a.x > x0 + 1 && v.a.x < x1 - 1 && h.a.y > y0 + 1 && h.a.y < y1 - 1) crossings++;
  }
  let through = 0;
  for (const s of segs) {
    const e = laid.edges.find(x => x.id === s.e);
    for (const n of laid.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      const [x0, x1] = [s.a.x, s.b.x].sort((p, q) => p - q), [y0, y1] = [s.a.y, s.b.y].sort((p, q) => p - q);
      if (x1 > n.x + 2 && x0 < n.x + n.w - 2 && y1 > n.y + 2 && y0 < n.y + n.h - 2) through++;
    }
  }
  const bends = laid.edges.reduce((t, e) => t + Math.max(0, e.points.length - 2), 0);
  const scale = Math.min(vw / laid.width, vh / laid.height);
  const textPx = MIN_FONT * scale;
  const E = Math.max(1, laid.edges.length);
  // Legibility is soft (zoom recovers detail, as in C4); edges that are hard to follow are not.
  // Layer columns (flow → RIGHT) pay a small toll: horizontal bands are the ArchiMate convention.
  const score = 3 * Math.max(0, MIN_SCREEN_PX - textPx) + Math.max(0, 18 - textPx)
    + 40 * crossings / E + 40 * through / E + 2 * bends / E + (laid.bands.some(b => b.vertical) ? 4 : 0);
  return { score: +score.toFixed(2), textPx: +textPx.toFixed(1), crossings, through, bends };
}
