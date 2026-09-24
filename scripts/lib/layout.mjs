// Layout: ELK (layered, compound boundaries) for C4; a deterministic band placer for ArchiMate.
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
  return view.notation === 'c4' ? layoutC4(view) : layoutArchimate(view);
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

const AM_W = 210, STRIP = 56, PAD_X = 36, BAND_PAD = 44, ROW_GAP = 76, COL_GAP = 46;

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

function layoutArchimate(view) {
  const ratio = view.layout?.aspectRatio ?? DEFAULT_RATIO;
  const boxes = new Map(view.nodes.map(n => [n.id, amNodeBox(n)]));
  const adj = new Map(view.nodes.map(n => [n.id, []]));
  for (const e of view.edges) { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); }

  // Groups (layer × aspect row), kept in model order initially.
  const groups = [];
  for (const layer of view.layers) {
    for (const g of [0, 1, 2]) {
      const members = view.nodes.filter(n => n.layer === layer && amGroup(n) === g).map(n => n.id);
      if (members.length) groups.push({ layer, g, members });
    }
  }
  const maxGroup = Math.max(1, ...groups.map(g => g.members.length));
  const bandCount = view.layers.length;
  const rowH = members => Math.max(...members.map(id => boxes.get(id).h));

  const measure = C => {
    let h = 0, rows = 0;
    for (const layer of view.layers) {
      h += 2 * BAND_PAD;
      const gs = groups.filter(g => g.layer === layer);
      let first = true;
      for (const g of gs) for (let i = 0; i < g.members.length; i += C) {
        h += rowH(g.members.slice(i, i + C)) + (first ? 0 : ROW_GAP); first = false; rows++;
      }
    }
    return { w: STRIP + 2 * PAD_X + C * AM_W + (C - 1) * COL_GAP, h, rows };
  };
  let C = maxGroup;
  for (let c = 1; c <= maxGroup; c++) { const m = measure(c); if (m.w / m.h >= ratio) { C = c; break; } }
  const natural = measure(C);
  const height = natural.h;
  const width = Math.ceil(Math.max(natural.w, height * ratio));

  // Order members inside each group by barycenter (a few alternating sweeps).
  const rank = new Map();
  groups.forEach((g, gi) => g.members.forEach((id, i) => rank.set(id, { gi, x: (i + 0.5) / g.members.length })));
  for (let it = 0; it < 8; it++) {
    const seq = it % 2 ? [...groups].reverse() : groups;
    for (const g of seq) {
      const bary = id => {
        const ns = adj.get(id).filter(o => rank.get(o)?.gi !== rank.get(id).gi);
        return ns.length ? ns.reduce((s, o) => s + rank.get(o).x, 0) / ns.length : rank.get(id).x;
      };
      const scored = g.members.map(id => [id, bary(id)]);
      scored.sort((a, b) => a[1] - b[1]);
      g.members = scored.map(s => s[0]);
      g.members.forEach((id, i) => { rank.get(id).x = (i + 0.5) / g.members.length; });
    }
  }

  // Place rows: justified slots, then pulled toward neighbours, overlaps resolved.
  const left = STRIP + PAD_X, right = width - PAD_X, usable = right - left;
  const nodes = new Map();
  const bands = [];
  const rows = [];
  let y = 0;
  for (const layer of view.layers) {
    const bandTop = y;
    y += BAND_PAD;
    let first = true;
    for (const g of groups.filter(x => x.layer === layer)) {
      for (let i = 0; i < g.members.length; i += C) {
        const members = g.members.slice(i, i + C);
        if (!first) y += ROW_GAP;
        first = false;
        const h = rowH(members);
        const slot = usable / members.length;
        const row = members.map((id, k) => ({ id, cx: left + slot * (k + 0.5), y: y + (h - boxes.get(id).h) / 2, row: rows.length }));
        rows.push(row);
        y += h;
      }
    }
    y += BAND_PAD;
    bands.push({ layer, label: LAYER_LABELS[layer], x: 0, y: bandTop, width, height: y - bandTop });
  }
  const centers = () => new Map(rows.flat().map(r => [r.id, r.cx]));
  for (let pass = 0; pass < 3; pass++) {
    const c = centers();
    for (const row of rows) {
      const slot = usable / row.length;
      row.forEach((r, k) => {
        const ns = adj.get(r.id).filter(o => !row.some(x => x.id === o));
        const bc = ns.length ? ns.reduce((s, o) => s + c.get(o), 0) / ns.length : null;
        const base = left + slot * (k + 0.5);
        r.cx = bc === null ? base : 0.5 * base + 0.5 * bc;
      });
      row.sort((a, b) => a.cx - b.cx);
      const min = AM_W + COL_GAP;
      for (let k = 0; k < row.length; k++) row[k].cx = Math.max(row[k].cx, k ? row[k - 1].cx + min : left + AM_W / 2);
      for (let k = row.length - 1; k >= 0; k--) row[k].cx = Math.min(row[k].cx, k < row.length - 1 ? row[k + 1].cx - min : right - AM_W / 2);
    }
  }
  for (const row of rows) for (const r of row) {
    const b = boxes.get(r.id);
    nodes.set(r.id, { x: r.cx - b.w / 2, y: r.y, w: b.w, h: b.h, lines: b.lines, row: r.row });
  }

  // Edge routing: ports spread along the facing sides, cubic curves between them.
  const ends = new Map(); // `${id}:${side}` → [{ e, end, otherX }]
  const plan = view.edges.map(e => {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b) return null;
    const acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
    let sa, sb;
    if (a.row === b.row) {
      const between = [...nodes.values()].some(n => n.row === a.row && n.x > Math.min(a.x, b.x) + 1 && n.x < Math.max(a.x, b.x) - 1);
      if (!between) { sa = acx < bcx ? 'right' : 'left'; sb = acx < bcx ? 'left' : 'right'; } else { sa = 'bottom'; sb = 'bottom'; }
    } else if (a.row < b.row) { sa = 'bottom'; sb = 'top'; } else { sa = 'top'; sb = 'bottom'; }
    const reg = (id, side, end, otherX) => { const k = `${id}:${side}`; if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ e, end, otherX }); };
    reg(e.from, sa, 'from', bcx); reg(e.to, sb, 'to', acx);
    return { e, sa, sb };
  });
  const port = new Map();
  for (const [k, list] of ends) {
    const [id, side] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)];
    const n = nodes.get(id);
    list.sort((p, q) => p.otherX - q.otherX);
    list.forEach((p, i) => {
      const t = (i + 1) / (list.length + 1);
      const pt = side === 'top' ? { x: n.x + n.w * (0.15 + 0.7 * t), y: n.y }
        : side === 'bottom' ? { x: n.x + n.w * (0.15 + 0.7 * t), y: n.y + n.h }
        : side === 'left' ? { x: n.x, y: n.y + n.h * (0.25 + 0.5 * t) }
        : { x: n.x + n.w, y: n.y + n.h * (0.25 + 0.5 * t) };
      port.set(`${p.e.id}:${p.end}`, { ...pt, side });
    });
  }
  const normal = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
  const edges = plan.filter(Boolean).map(({ e }) => {
    const p0 = port.get(`${e.id}:from`), p1 = port.get(`${e.id}:to`);
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    // Same-side ports (same row, not adjacent) dip into the gap below the row: keep it shallow.
    const k = p0.side === p1.side ? Math.min(52, 24 + dist * 0.05) : Math.max(36, Math.min(160, dist * 0.4));
    const [n0x, n0y] = normal[p0.side], [n1x, n1y] = normal[p1.side];
    const c1 = { x: p0.x + n0x * k, y: p0.y + n0y * k }, c2 = { x: p1.x + n1x * k, y: p1.y + n1y * k };
    const mid = bez(p0, c1, c2, p1, 0.5);
    return { ...e, points: [p0, c1, c2, p1], curve: true, labelBox: e.label ? { x: mid.x, y: mid.y, w: 0, h: 0 } : null, labelLines: wrap(e.label, FONT.edge, 200, 2) };
  });

  const outNodes = view.nodes.map(n => ({ ...n, ...nodes.get(n.id) }));
  return { ...view, direction: 'DOWN', width, height: Math.ceil(height), nodes: outNodes, edges, boundaries: [], bands, columns: C, minFont: MIN_FONT, fonts: FONT };
}

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}
