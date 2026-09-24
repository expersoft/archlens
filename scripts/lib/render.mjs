// Renderer: laid-out views → one self-contained, animated HTML page (inline SVG + CSS + JS, no network).
import { ELEMENT_TYPES, LAYER_LABELS, RELATIONSHIP_TYPES } from './registry.mjs';
import { MIN_SCREEN_PX } from './layout.mjs';
import { ICONS } from './icons.mjs';
import { explainEdge, GLOSSARY } from './explain.mjs';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = n => Math.round(n * 10) / 10;
const LAYER_VAR = { business: 'biz', application: 'app', technology: 'tech', physical: 'tech', motivation: 'mot', strategy: 'str', implementation: 'impl', other: 'oth' };

// Edge styles per relationship type: dash pattern + markers (start/end).
const EDGE_STYLE = {
  uses: { dash: '10 6', end: 'arrow' },
  composition: { start: 'diamond' },
  aggregation: { start: 'diamond-o' },
  assignment: { start: 'dot', end: 'arrow' },
  realization: { dash: '8 5', end: 'tri-o' },
  serving: { end: 'open' },
  access: { dash: '2 5', end: 'open-s' },
  influence: { dash: '8 5', end: 'open' },
  triggering: { end: 'arrow' },
  flow: { dash: '9 5', end: 'arrow' },
  specialization: { end: 'tri-o' },
  association: {},
};
const MARKERS = {
  arrow: { w: 14, ref: 13, d: 'M0,1 L14,7 L0,13 z', fill: true },
  open: { w: 14, ref: 13, d: 'M1,1 L13,7 L1,13', fill: false },
  'open-s': { w: 11, ref: 10, d: 'M1,1.5 L10,5.5 L1,9.5', fill: false, h: 11 },
  'tri-o': { w: 16, ref: 15, d: 'M1,1 L15,8 L1,15 z', fill: 'bg' },
  diamond: { w: 18, ref: 17, d: 'M1,7 L9,1 L17,7 L9,13 z', fill: true, h: 14 },
  'diamond-o': { w: 18, ref: 17, d: 'M1,7 L9,1 L17,7 L9,13 z', fill: 'bg', h: 14 },
  dot: { w: 10, ref: 5, d: 'M5,0 a5,5 0 1,0 0.01,0 z', fill: true, h: 10 },
};
const TONES = { base: 'var(--edge)', up: 'var(--up)', down: 'var(--down)' };

function markerDefs(prefix) {
  let out = '';
  for (const [tone, color] of Object.entries(TONES)) {
    for (const [name, m] of Object.entries(MARKERS)) {
      const h = m.h ?? m.w;
      const fill = m.fill === true ? color : m.fill === 'bg' ? 'var(--bg)' : 'none';
      out += `<marker id="${prefix}-${name}-${tone}" viewBox="0 0 ${m.w} ${h}" refX="${m.ref}" refY="${h / 2}" markerWidth="${m.w}" markerHeight="${h}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="${m.d}" fill="${fill}" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/></marker>`;
    }
  }
  return `<defs>${out}</defs>`;
}

function roundedPolyline(pts, r = 12) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const k = Math.min(r, la / 2, lb / 2);
    const p1 = { x: p.x + (a.x - p.x) * k / la, y: p.y + (a.y - p.y) * k / la };
    const p2 = { x: p.x + (b.x - p.x) * k / lb, y: p.y + (b.y - p.y) * k / lb };
    d += ` L${f(p1.x)},${f(p1.y)} Q${f(p.x)},${f(p.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${f(last.x)},${f(last.y)}`;
}
const edgePath = e => e.curve
  ? `M${f(e.points[0].x)},${f(e.points[0].y)} C${f(e.points[1].x)},${f(e.points[1].y)} ${f(e.points[2].x)},${f(e.points[2].y)} ${f(e.points[3].x)},${f(e.points[3].y)}`
  : roundedPolyline(e.points);

function textLines(lines, cx, y, size, lh, cls, weight) {
  return lines.map((l, i) => `<text class="${cls}" x="${f(cx)}" y="${f(y + i * lh)}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} text-anchor="middle" dominant-baseline="hanging">${esc(l)}</text>`).join('');
}

// ------------------------------------------------------------------ C4 shapes

function c4Node(n, i) {
  const { x, y, w, h } = n;
  const kind = n.external ? 'external' : n.c4Kind === 'softwareSystem' ? 'system' : n.c4Kind;
  const cls = `node c4 k-${kind}${n.isFocus ? ' focus' : ''}${n.isScope ? ' scope' : ''}${n.inferred ? ' inferred' : ''}`;
  let shape;
  if (n.c4Kind === 'person') {
    shape = `<circle class="shape" cx="${f(x + w / 2)}" cy="${f(y + 30)}" r="28"/><rect class="shape" x="${f(x)}" y="${f(y + 50)}" width="${f(w)}" height="${f(h - 50)}" rx="34"/>`;
  } else if (n.queue) {
    // Message queue/topic: horizontal cylinder (C4-PlantUML ContainerQueue).
    const rx = 16, ry = h / 2;
    shape = `<path class="shape" d="M${f(x + rx)},${f(y)} h${f(w - 2 * rx)} a${rx},${f(ry)} 0 0,1 0,${f(h)} h${f(-(w - 2 * rx))} a${rx},${f(ry)} 0 0,1 0,${f(-h)} z"/>`
      + `<path class="rim" d="M${f(x + w - rx)},${f(y)} a${rx},${f(ry)} 0 0,0 0,${f(h)}"/>`;
  } else if (n.database) {
    const ry = 13;
    shape = `<path class="shape" d="M${f(x)},${f(y + ry)} a${f(w / 2)},${ry} 0 0,0 ${f(w)},0 a${f(w / 2)},${ry} 0 0,0 ${f(-w)},0 v${f(h - 2 * ry)} a${f(w / 2)},${ry} 0 0,0 ${f(w)},0 v${f(-(h - 2 * ry))}"/>`
      + `<path class="rim" d="M${f(x)},${f(y + ry)} a${f(w / 2)},${ry} 0 0,0 ${f(w)},0"/>`;
  } else {
    shape = `<rect class="shape" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="12"/>`;
  }
  const L = n.lines;
  const content = L.title.length * 25 + 6 + L.meta.length * 19 + (L.desc.length ? 10 + L.desc.length * 19 : 0);
  const top = y + n.headH + n.topH + (h - n.headH - n.topH - content) / 2 + (n.c4Kind === 'person' ? 4 : 0);
  const cx = x + w / 2;
  let t = textLines(L.title, cx, top, 20, 25, 'title', 700);
  t += textLines(L.meta, cx, top + L.title.length * 25 + 6, 15, 19, 'meta');
  if (L.desc.length) t += textLines(L.desc, cx, top + L.title.length * 25 + 6 + L.meta.length * 19 + 10, 15, 19, 'desc');
  const tip = `${n.name} [${n.c4Label}${n.technology ? `: ${n.technology}` : ''}]${n.description ? `\n${n.description}` : ''}`;
  return `<g class="${cls}" data-node="${esc(n.id)}" style="--i:${i}" tabindex="0" role="button" aria-label="${esc(tip)}">${shape}${t}</g>`;
}

function c4Boundary(b) {
  return `<g class="boundary" data-boundary="${esc(b.id)}"><rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="16"/>`
    + `<text class="b-title" x="${f(b.x + 22)}" y="${f(b.y + 16)}" font-size="20" font-weight="700" dominant-baseline="hanging">${esc(b.name)}</text>`
    + `<text class="b-meta" x="${f(b.x + 22)}" y="${f(b.y + 40)}" font-size="15" dominant-baseline="hanging">[${esc(b.c4Label)}]</text></g>`;
}

// ------------------------------------------------------------------ ArchiMate shapes

function amNode(n, i) {
  const { x, y, w, h } = n;
  const spec = ELEMENT_TYPES[n.type];
  const lv = LAYER_VAR[n.layer];
  const rx = spec.icon === 'service' ? h / 2 : spec.aspect === 'behavior' ? 14 : spec.icon === 'value-stream' ? 4 : 3;
  const cls = `node am l-${lv}${n.isAnchor ? ' anchor' : ''}${n.role ? ` r-${n.role}` : ''}${n.inferred ? ' inferred' : ''}`;
  const icon = ICONS[spec.icon] ?? '';
  const nameTop = y + (h - n.lines.title.length * 22) / 2;
  const tip = `${n.name} — ${spec.label}${n.technology ? ` [${n.technology}]` : ''}${n.description ? `\n${n.description}` : ''}`;
  return `<g class="${cls}" data-node="${esc(n.id)}" data-distance="${n.distance ?? ''}" style="--i:${i}" tabindex="0" role="button" aria-label="${esc(tip)}">`
    + `<rect class="shape" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}"/>`
    + (icon ? `<g class="icon" transform="translate(${f(x + w - 36)},${f(y + 8)})">${icon}</g>` : '')
    + textLines(n.lines.title, x + w / 2 - 6, nameTop, 17, 22, 'title', 650)
    + (n.distance !== null && n.distance !== undefined && !n.isAnchor ? `<text class="dist" x="${f(x + 10)}" y="${f(y + h - 8)}" font-size="15">${n.role === 'dependent' ? '↑' : n.role === 'supporter' ? '↓' : '↕'}${n.distance}</text>` : '')
    + '</g>';
}

function band(b, layers) {
  const lv = LAYER_VAR[b.layer];
  const cy = b.y + b.height / 2;
  return `<g class="band b-${lv}" data-layer="${b.layer}" style="--b:${layers.indexOf(b.layer)}"><rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.width)}" height="${f(b.height)}"/>`
    + `<text x="28" y="${f(cy)}" font-size="16" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 28 ${f(cy)})">${esc(b.label.toUpperCase())}</text></g>`;
}

// ------------------------------------------------------------------ edges

function edge(e, prefix, showLabel) {
  const st = EDGE_STYLE[e.type] ?? {};
  let start = st.start, end = st.end;
  if (e.type === 'access') {
    if (e.accessType === 'read') { start = 'open-s'; end = undefined; }
    else if (e.accessType === 'readwrite') start = 'open-s';
    else if (e.accessType === 'access') end = undefined;
  }
  const d = edgePath(e);
  if (!d) return '';
  const dash = e.derived ? '12 7' : st.dash;
  const m = (which, name) => name ? ` marker-${which}="url(#${prefix}-${name}-base)" data-m${which[0]}="${name}"` : '';
  const title = `${e.derived ? 'derivado: ' : ''}${e.type}${e.label ? ` — ${e.label}` : ''}${e.technology ? ` [${e.technology}]` : ''}${e.via?.length ? `\nvia ${e.via.join(' → ')}` : ''}`;
  let label = '';
  if (e.labelBox && e.labelLines?.length) {
    const lh = 19;
    const w = Math.max(...e.labelLines.map(l => l.length)) * 15 * 0.56 + 14;
    const h = e.labelLines.length * lh + 8;
    const cx = e.curve ? e.labelBox.x : e.labelBox.x + e.labelBox.w / 2;
    const cy = e.curve ? e.labelBox.y - h / 2 : e.labelBox.y;
    label = `<g class="elabel${showLabel ? '' : ' on-demand'}"><rect x="${f(cx - w / 2)}" y="${f(cy)}" width="${f(w)}" height="${f(h)}" rx="6"/>`
      + textLines(e.labelLines, cx, cy + 5, 15, lh, 'etext') + '</g>';
  }
  return `<g class="edge t-${e.type}${e.derived ? ' derived' : ''}${e.implicit ? ' implicit' : ''}" data-edge="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${e.step ? ` data-step="${e.step}"` : ''} aria-label="${esc(title)}">`
    + `<path class="hit" d="${d}"/>`
    + `<path class="line" d="${d}"${dash ? ` stroke-dasharray="${dash}"` : ''}${m('start', start)}${m('end', end)}/>`
    + `<path class="flow" d="${d}"/>${label}</g>`;
}

// ------------------------------------------------------------------ legend

// A tiny inline SVG line drawn with the same markers/dashes as the diagram (markers from the global "lg" defs).
function relSample(type, { derived = false, accessType } = {}) {
  const st = EDGE_STYLE[type] ?? {};
  let start = st.start, end = st.end;
  if (type === 'access' && accessType === 'readwrite') start = 'open-s';
  const dash = derived ? '12 7' : st.dash;
  return `<svg class="sample" viewBox="0 0 64 20" width="64" height="20" aria-hidden="true"><line x1="${start ? 20 : 4}" y1="10" x2="${end ? 44 : 60}" y2="10" stroke="var(--edge)" stroke-width="2.4"${dash ? ` stroke-dasharray="${dash}"` : ''}${derived ? ' opacity=".75"' : ''}${start ? ` marker-start="url(#lg-${start}-base)"` : ''}${end ? ` marker-end="url(#lg-${end}-base)"` : ''}/></svg>`;
}

function legend(v) {
  const items = [];
  if (v.notation === 'c4') {
    const kinds = new Map();
    for (const n of v.nodes) kinds.set(n.external ? 'external' : n.c4Kind, n.external ? 'Externo' : n.c4Label);
    for (const [k, l] of kinds) items.push(`<li><i class="sw c4-${k === 'softwareSystem' ? 'system' : k}"></i>${esc(l)}</li>`);
    if (v.nodes.some(n => n.queue)) items.push(`<li><svg class="sample" viewBox="0 0 64 20" width="64" height="20" aria-hidden="true"><path d="M8,2 h48 a6,8 0 0,1 0,16 h-48 a6,8 0 0,1 0,-16 z M56,2 a6,8 0 0,0 0,16" fill="var(--c4-container)" stroke="var(--edge)" stroke-width="1.4"/></svg><span><b>fila / tópico</b> — mensageria (publica → tópico ← consome)</span></li>`);
    items.push(`<li>${relSample('uses')}<span><b>usa</b> — consumidor → provedor</span></li>`);
  } else {
    for (const l of v.layers) items.push(`<li><i class="sw am-${LAYER_VAR[l]}"></i>${esc(LAYER_LABELS[l])}</li>`);
    for (const t of [...new Set(v.edges.map(e => e.type))]) {
      const g = GLOSSARY.types[t];
      items.push(`<li>${relSample(t)}<span><b>${esc(g?.label ?? t)}</b> — ${esc(g?.reading.split(':')[1]?.split('.')[0]?.trim() ?? '')}</span></li>`);
    }
    if (v.edges.some(e => e.derived)) items.push(`<li>${relSample('serving', { derived: true })}<span><b>derivada</b> — via elementos ocultos</span></li>`);
  }
  return `<ul>${items.join('')}</ul><button class="linkish" data-act="glossary">Como ler as relações?</button>`;
}

function glossaryHtml(types) {
  const order = ['uses', 'serving', 'realization', 'assignment', 'access', 'composition', 'aggregation', 'triggering', 'flow', 'influence', 'specialization', 'association'];
  const shown = order.filter(t => types.has(t));
  const rest = order.filter(t => !types.has(t));
  const entry = t => {
    const g = GLOSSARY.types[t];
    return `<article id="gl-${t}" class="gl-entry"><header>${relSample(t, { accessType: t === 'access' ? 'readwrite' : undefined })}<h4>${esc(g.label)}</h4></header>`
      + `<p>${esc(g.meaning)}</p><p class="gl-read">${esc(g.reading)}</p><p class="gl-ex">Ex.: ${esc(g.example)}</p><p class="gl-not">${esc(g.notation)}</p></article>`;
  };
  return `<section id="glossary"><h3>Como ler as relações</h3>`
    + `<div class="gl-grid">${shown.map(entry).join('')}</div>`
    + (rest.length ? `<details><summary>Outras relações ArchiMate</summary><div class="gl-grid">${rest.map(entry).join('')}</div></details>` : '')
    + `<article class="gl-entry gl-derived"><header>${relSample('serving', { derived: true })}<h4>relação derivada</h4></header><p>${esc(GLOSSARY.derived)}</p></article>`
    + `<h3>Confusões comuns</h3><dl class="gl-faq">${GLOSSARY.confusions.map(c => `<dt>${esc(c.q)}</dt><dd>${esc(c.a)}</dd>`).join('')}</dl></section>`;
}

// ------------------------------------------------------------------ page

function viewSvg(v, idx) {
  const prefix = `v${idx}`;
  const W = Math.ceil(v.width), H = Math.ceil(v.height);
  const showLabels = v.edgeLabels ?? v.notation === 'c4';
  const parts = [];
  if (v.notation === 'c4') parts.push(...v.boundaries.map(c4Boundary));
  else parts.push(...v.bands.map(b => band(b, v.layers)));
  const edges = v.edges.map(e => edge(e, prefix, showLabels)).join('');
  const nodes = v.nodes.map((n, i) => v.notation === 'c4' ? c4Node(n, i) : amNode(n, i)).join('');
  return `<svg class="diagram n-${v.notation}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-w="${W}" data-h="${H}" style="--ratio:${(H / W).toFixed(5)}" role="img" aria-label="${esc(v.title)}" xmlns="http://www.w3.org/2000/svg">`
    + markerDefs(prefix)
    + `<rect class="bgrect" x="0" y="0" width="${W}" height="${H}"/>`
    + `<g class="content">${parts.join('')}<g class="edges">${edges}</g><g class="nodes">${nodes}</g></g></svg>`;
}

function viewData(v) {
  return {
    key: v.key, title: v.title, description: v.description, notation: v.notation, animation: v.animation,
    level: v.level ?? null, viewpoint: v.viewpoint ?? null, anchor: v.anchor ?? null, scope: v.scope ?? null, mode: v.mode ?? null,
    width: Math.ceil(v.width), height: Math.ceil(v.height), minFont: v.minFont,
    nodes: Object.fromEntries(v.nodes.map(n => [n.id, {
      name: n.name, typeLabel: ELEMENT_TYPES[n.type]?.label, c4Label: n.c4Label ?? null, layer: n.layer,
      technology: n.technology ?? '', description: n.description ?? '', tags: n.tags ?? [], properties: n.properties ?? {},
      distance: n.distance ?? null, role: n.role ?? null, isAnchor: !!n.isAnchor, inferred: !!n.inferred,
      x: n.x, y: n.y, w: n.w, h: n.h,
    }])),
    edges: v.edges.map(e => ({
      id: e.id, from: e.from, to: e.to, type: e.type, label: e.label ?? '', technology: e.technology ?? '', derived: !!e.derived, via: e.via ?? [], step: e.step ?? null,
      help: explainEdge(e, Object.fromEntries(v.nodes.map(n => [n.id, { name: n.name, type: n.type }])), v.notation),
    })),
    matrix: v.matrix ?? null,
  };
}

export function renderHtml({ title, subtitle = '', views }) {
  const data = views.map(viewData);
  const json = JSON.stringify({ title, minScreenPx: MIN_SCREEN_PX, views: data }).replace(/</g, '\\u003c');
  const sections = views.map((v, i) => `<section class="view" data-view="${esc(v.key)}" data-index="${i}"${i ? ' hidden' : ''}>${viewSvg(v, i)}<div class="legend" hidden>${legend(v)}</div></section>`).join('');
  const options = views.map((v, i) => `<option value="${esc(v.key)}"${i ? '' : ' selected'}>${i + 1}. ${esc(v.title)}</option>`).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="bar">
  <div class="brand"><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}</div>
  <nav class="views">
    <button data-act="prev" title="Visão anterior (←)">‹</button>
    <select id="viewSelect" aria-label="Visão">${options}</select>
    <button data-act="next" title="Próxima visão (→)">›</button>
  </nav>
  <div class="tools">
    <button data-act="play" title="Animar (espaço)">▶ Animar</button>
    <button data-act="flow" title="Partículas de fluxo (A)">Fluxo</button>
    <button data-act="labels" title="Rótulos das relações (R)">Rótulos</button>
    <button data-act="matrix" title="Matriz de impacto (M)" hidden>Matriz</button>
    <button data-act="legend" title="Legenda (L)">Legenda</button>
    <button data-act="fit" title="Ajustar à largura (0)">Ajustar</button>
    <button data-act="theme" title="Tema claro/escuro (T)">Tema</button>
    <button data-act="export" title="Exportar SVG / PNG (E)">Exportar</button>
    <button data-act="present" class="primary" title="Modo apresentação (P)">Apresentar</button>
  </div>
</header>
<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">${markerDefs('lg')}</svg>
<main class="stage">${sections}</main>
<div class="hovercard" role="tooltip" hidden></div>
<div class="caption" hidden></div>
<div class="legibility" hidden></div>
<aside class="drawer" aria-hidden="true"><button class="close" data-act="close" aria-label="Fechar">×</button><div class="drawer-body"></div></aside>
<div class="sheet" hidden><div class="sheet-head"><strong>Matriz de dependência</strong><button data-act="matrix">Fechar</button></div><div class="sheet-body"></div></div>
<div class="export-menu" hidden><button data-act="svg">Baixar SVG</button><button data-act="png">Baixar PNG (2×)</button></div>
<div class="help" hidden>
  <button class="close" data-act="help" aria-label="Fechar">×</button>
  <section><h3>Atalhos</h3>
  <ul><li><kbd>←</kbd>/<kbd>→</kbd> visão anterior/próxima</li><li><kbd>P</kbd> apresentação (tela cheia)</li><li><kbd>0</kbd> ajustar à largura</li><li><kbd>F</kbd> focar o nó selecionado</li><li>roda do mouse / arrastar: zoom e pan</li><li>passar o mouse: prévia das ligações e explicação da relação</li><li>clique numa relação: fixa a explicação</li><li><kbd>Espaço</kbd> animar · <kbd>A</kbd> fluxo · <kbd>R</kbd> rótulos</li><li><kbd>M</kbd> matriz · <kbd>L</kbd> legenda · <kbd>G</kbd> glossário · <kbd>T</kbd> tema · <kbd>E</kbd> exportar</li><li><kbd>Esc</kbd> limpar seleção</li></ul></section>
  ${glossaryHtml(new Set(views.flatMap(v => v.edges.map(e => e.type))))}
</div>
<script id="archlens-data" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>
`;
}

const CSS = `
:root{
  --bar-h:56px;
  --bg:#f6f7f9;--panel:#ffffff;--ink:#18202c;--muted:#5a6475;--line:#d8dce3;--edge:#535f70;--up:#1c6fd1;--down:#e0560b;--focus:#f2b705;
  --c4-person:#0b3d78;--c4-system:#1168bd;--c4-container:#3f86d0;--c4-component:#8cc0f2;--c4-external:#8791a1;--c4-ink:#ffffff;--c4-component-ink:#0b2540;--boundary:#7d8799;
  --biz:#fff5a8;--biz-s:#a89a2c;--app:#b6eef6;--app-s:#338fa0;--tech:#cbe8b9;--tech-s:#558f42;--mot:#dcd6ff;--mot-s:#6f62c9;--str:#f6dcaa;--str-s:#ae8330;--impl:#ffdfe3;--impl-s:#b85f6c;--oth:#ffffff;--oth-s:#8f8f8f;
  --band-biz:#fffbe0;--band-app:#e9fafc;--band-tech:#eef8e8;--band-mot:#f1efff;--band-str:#fdf4e3;--band-impl:#fff1f3;--band-oth:#f7f7f7;
  --am-ink:#18202c;
  color-scheme:light;
}
:root[data-theme="dark"]{
  --bg:#10141b;--panel:#18202a;--ink:#e8edf4;--muted:#98a3b4;--line:#2a3340;--edge:#a9b4c4;--up:#5aa7ff;--down:#ff8a4c;--focus:#ffd24a;
  --c4-person:#1d5aa3;--c4-system:#2a78c9;--c4-container:#4a93dc;--c4-component:#9ccaf5;--c4-external:#5d6778;--boundary:#8190a6;
  --biz:#5a5220;--biz-s:#d7c44e;--app:#17454e;--app-s:#56c3d6;--tech:#28481f;--tech-s:#86c96c;--mot:#353061;--mot-s:#a79cf0;--str:#5a4520;--str-s:#e0b25a;--impl:#5a2a31;--impl-s:#ee97a3;--oth:#232b36;--oth-s:#8f98a6;
  --band-biz:#1d1b10;--band-app:#101e22;--band-tech:#121c10;--band-mot:#18162a;--band-str:#1f1910;--band-impl:#221316;--band-oth:#161b22;
  --am-ink:#eef2f7;
  color-scheme:dark;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow:hidden}
button,select{font:inherit;color:inherit}
.bar{position:fixed;inset:0 0 auto 0;height:var(--bar-h);display:flex;align-items:center;gap:16px;padding:0 16px;background:var(--panel);border-bottom:1px solid var(--line);z-index:20;transition:transform .25s ease}
.brand{display:flex;flex-direction:column;min-width:0;flex:0 1 auto}
.brand strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand span{font-size:12px;color:var(--muted)}
.views{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0}
.views select{flex:1 1 auto;min-width:0;width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.tools{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto}
.bar button{padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);cursor:pointer;white-space:nowrap}
.bar button:hover{border-color:var(--muted)}
.bar button.on{background:var(--ink);color:var(--bg)}
.bar button.primary{background:var(--c4-system);border-color:var(--c4-system);color:#fff}
.stage{position:fixed;inset:var(--bar-h) 0 0 0;display:flex;align-items:center;justify-content:center}
.view{width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative}
svg.diagram{display:block;width:100%;height:min(calc(100vh - var(--bar-h)),calc(100vw * var(--ratio)));cursor:grab;touch-action:none;user-select:none}
svg.diagram.panning{cursor:grabbing}
.bgrect{fill:transparent}
body.presenting .bar{transform:translateY(-100%)}
body.presenting.reveal-top .bar{transform:none}
body.presenting .stage{inset:0}
body.presenting svg.diagram{height:100vh}
/* C4 */
.node .shape{stroke-width:2;transition:filter .2s,opacity .25s}
.k-person .shape{fill:var(--c4-person);stroke:color-mix(in srgb,var(--c4-person) 70%,#000)}
.k-system .shape{fill:var(--c4-system);stroke:color-mix(in srgb,var(--c4-system) 70%,#000)}
.k-container .shape{fill:var(--c4-container);stroke:color-mix(in srgb,var(--c4-container) 70%,#000)}
.k-component .shape{fill:var(--c4-component);stroke:color-mix(in srgb,var(--c4-component) 65%,#000)}
.k-external .shape{fill:var(--c4-external);stroke:color-mix(in srgb,var(--c4-external) 70%,#000)}
.node.c4 .rim{fill:none;stroke:rgba(255,255,255,.55);stroke-width:2}
.node.c4 text{fill:var(--c4-ink)}
.node.k-component text{fill:var(--c4-component-ink)}
.node.c4 .meta,.node.c4 .desc{opacity:.9}
.node.focus .shape,.node.anchor .shape{stroke:var(--focus);stroke-width:5}
.node.inferred .shape{stroke-dasharray:8 5}
.boundary rect{fill:none;stroke:var(--boundary);stroke-width:2.2;stroke-dasharray:12 7}
.boundary text{fill:var(--muted)}
.boundary .b-title{fill:var(--ink)}
/* ArchiMate */
.node.am .shape{stroke-width:1.8}
.node.am text{fill:var(--am-ink)}
.node.am .icon{color:var(--am-ink);opacity:.8}
.node.am .dist{fill:var(--muted)!important;font-weight:700}
.l-biz .shape{fill:var(--biz);stroke:var(--biz-s)}.l-app .shape{fill:var(--app);stroke:var(--app-s)}.l-tech .shape{fill:var(--tech);stroke:var(--tech-s)}
.l-mot .shape{fill:var(--mot);stroke:var(--mot-s)}.l-str .shape{fill:var(--str);stroke:var(--str-s)}.l-impl .shape{fill:var(--impl);stroke:var(--impl-s)}.l-oth .shape{fill:var(--oth);stroke:var(--oth-s);stroke-dasharray:6 4}
.band rect{stroke:var(--line);stroke-width:1}
.b-biz rect{fill:var(--band-biz)}.b-app rect{fill:var(--band-app)}.b-tech rect{fill:var(--band-tech)}.b-mot rect{fill:var(--band-mot)}.b-str rect{fill:var(--band-str)}.b-impl rect{fill:var(--band-impl)}.b-oth rect{fill:var(--band-oth)}
.band text{fill:var(--muted);letter-spacing:.12em}
/* edges */
.edge .line{fill:none;stroke:var(--edge);stroke-width:2.4;transition:opacity .25s,stroke .2s}
.edge.t-association .line{stroke-width:1.8}
.edge.derived .line{opacity:.75}
.edge .hit{fill:none;stroke:transparent;stroke-width:18;pointer-events:stroke}
.edge .flow{fill:none;stroke:var(--edge);stroke-width:7;stroke-linecap:round;stroke-dasharray:0 34;opacity:0;pointer-events:none}
body.flowing .edge .flow{opacity:.9;animation:march 1.1s linear infinite}
@keyframes march{to{stroke-dashoffset:-34}}
.elabel rect{fill:var(--bg);opacity:.92;stroke:var(--line)}
.elabel .etext{fill:var(--ink)}
.elabel.on-demand{display:none}
body.labels .elabel.on-demand,.edge.up .elabel.on-demand,.edge.down .elabel.on-demand{display:inline}
.edge.up .line,.edge.up .flow{stroke:var(--up);stroke-width:3.4}
.edge.down .line,.edge.down .flow{stroke:var(--down);stroke-width:3.4}
.edge.up .flow,.edge.down .flow{opacity:.9;animation:march 1.1s linear infinite}
/* dimming during trace/animation */
.dimming .node:not(.lit) .shape,.dimming .node:not(.lit) text,.dimming .node:not(.lit) .icon{opacity:.18}
.dimming .edge:not(.up):not(.down):not(.lit){opacity:.1}
.dimming .edge.lit .line{stroke:var(--down);stroke-width:3.4}
.node.sel .shape{stroke:var(--focus);stroke-width:5}
.node.pulse .shape{animation:pulse 1s ease-out}
@keyframes pulse{0%{filter:drop-shadow(0 0 0 var(--focus))}40%{filter:drop-shadow(0 0 14px var(--focus))}100%{filter:drop-shadow(0 0 0 transparent)}}
/* intro */
.intro .node{animation:pop .5s cubic-bezier(.2,.8,.2,1.2) both;animation-delay:calc(var(--i) * 45ms)}
.intro .edge{animation:fade .6s ease both;animation-delay:calc(var(--n) * 45ms + 150ms)}
.intro .band{animation:fade .5s ease both;animation-delay:calc(var(--b) * 160ms)}
.intro .boundary{animation:fade .5s ease both}
@keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
.hidden-step{opacity:0!important;transition:opacity .3s}
/* overlays */
.drawer{position:fixed;top:calc(var(--bar-h) + 12px);right:12px;bottom:12px;width:min(420px,calc(100vw - 24px));background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);transform:translateX(calc(100% + 24px));transition:transform .25s ease;z-index:30;overflow:auto;padding:20px}
.drawer.open{transform:none}
body.presenting .drawer{top:12px}
body.presenting .drawer.open:not(:hover){transform:translateX(calc(100% + 24px))}
body.presenting.reveal-right .drawer.open{transform:none}
.drawer .close{position:absolute;top:10px;right:12px;border:0;background:none;font-size:24px;cursor:pointer;color:var(--muted)}
.drawer h2{margin:0 28px 4px 0;font-size:20px}
.drawer .kind{color:var(--muted);margin-bottom:12px}
.drawer dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:12px 0}
.drawer dt{color:var(--muted)}
.drawer dd{margin:0}
.drawer h3{font-size:14px;margin:16px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.drawer ul{margin:0;padding-left:18px}
.drawer li{margin:2px 0;cursor:pointer}
.chip{display:inline-block;padding:1px 8px;border-radius:99px;background:var(--bg);border:1px solid var(--line);font-size:13px;margin:2px 4px 2px 0}
.warn{color:var(--down)}
.caption{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 18px;font-size:18px;box-shadow:0 8px 30px rgba(0,0,0,.15);z-index:25;max-width:calc(100vw - 32px)}
.legibility{position:fixed;left:12px;bottom:12px;background:var(--panel);border:1px solid var(--down);color:var(--ink);border-radius:10px;padding:8px 12px;font-size:13px;z-index:24;max-width:min(520px,calc(100vw - 24px))}
.legend{position:absolute;left:12px;top:12px;background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:12px;padding:10px 14px;font-size:14px;z-index:5}
.legend ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.legend li{display:flex;align-items:center;gap:8px}
.legend{max-height:calc(100% - 24px);overflow:auto}
.sw{display:inline-block;width:18px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.25)}
.c4-person{background:var(--c4-person)}.c4-system{background:var(--c4-system)}.c4-container{background:var(--c4-container)}.c4-component{background:var(--c4-component)}.c4-external{background:var(--c4-external)}
.am-biz{background:var(--biz)}.am-app{background:var(--app)}.am-tech{background:var(--tech)}.am-mot{background:var(--mot)}.am-str{background:var(--str)}.am-impl{background:var(--impl)}.am-oth{background:var(--oth)}
.ln{display:inline-block;width:28px;border-top:2.4px solid var(--edge)}
.ln.dash,.ln.r-realization,.ln.r-influence,.ln.r-flow,.ln.derived{border-top-style:dashed}.ln.r-access{border-top-style:dotted}
.sheet{position:fixed;left:12px;right:12px;bottom:12px;max-height:55vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.2);z-index:28}
.sheet-head{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--panel);border-bottom:1px solid var(--line)}
.sheet-head button{border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:4px 10px;cursor:pointer}
.sheet-body{padding:0 16px 16px;overflow-x:auto}
.sheet table{border-collapse:collapse;width:100%;font-size:14px}
.sheet th,.sheet td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.sheet tr{cursor:pointer}
.sheet tr:hover td{background:var(--bg)}
.tag-dependent{color:var(--up);font-weight:600}.tag-supporter{color:var(--down);font-weight:600}.tag-both{font-weight:600}
.export-menu{position:fixed;top:calc(var(--bar-h) + 6px);right:12px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px;display:grid;gap:4px;z-index:40}
.export-menu button{border:0;background:none;padding:6px 12px;text-align:left;cursor:pointer;border-radius:6px}
.export-menu button:hover{background:var(--bg)}
.help{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(980px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 24px;z-index:50;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.help .close{position:sticky;top:0;float:right;border:0;background:none;font-size:26px;cursor:pointer;color:var(--muted)}
.help h3{margin:18px 0 8px}
.gl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.gl-entry{border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--bg)}
.gl-entry header{display:flex;align-items:center;gap:10px}
.gl-entry h4{margin:0;font-size:16px}
.gl-entry p{margin:6px 0;font-size:14px}
.gl-read{font-weight:600}
.gl-ex,.gl-not{color:var(--muted)}
.gl-derived{margin-top:10px}
.gl-faq dt{font-weight:700;margin-top:10px}
.gl-faq dd{margin:4px 0 0}
.help details{margin-top:10px}
.help summary{cursor:pointer;color:var(--muted)}
.flash{animation:flash 1.4s ease}
@keyframes flash{0%,40%{box-shadow:0 0 0 3px var(--focus)}100%{box-shadow:0 0 0 0 transparent}}
.linkish{border:0;background:none;padding:4px 0;color:var(--up);cursor:pointer;text-decoration:underline;font-size:14px}
.legend .sample,.gl-entry .sample{flex:0 0 auto;overflow:visible}
.legend li span{font-size:14px}
svg.defs{position:absolute;width:0;height:0;overflow:hidden}
/* hover preview + relation card */
.hovercard{position:fixed;z-index:45;width:max-content;max-width:min(440px,calc(100vw - 24px));background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.22);padding:12px 16px;font-size:15px;line-height:1.45;pointer-events:none}
.hovercard.pinned{pointer-events:auto;border-color:var(--focus)}
.hovercard p{margin:4px 0}
.hc-kind{font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.hc-sent{font-weight:700;font-size:17px}
.hc-read{color:var(--muted)}
.hc-imp{color:var(--down);font-weight:600}
.hc-der{font-style:italic}
.hovercard ul{margin:6px 0 0;padding-left:18px}
.edge .hit{cursor:help}
.previewing .node .shape,.previewing .node text,.previewing .node .icon,.previewing .edge{transition:opacity .15s}
.previewing .node:not(.pv) .shape,.previewing .node:not(.pv) text,.previewing .node:not(.pv) .icon{opacity:.4}
.previewing .edge:not(.pv){opacity:.22}
.edge.pv .line{stroke-width:3.6}
.edge.pv .flow{opacity:.9;animation:march 1.1s linear infinite}
.edge.pv .elabel.on-demand{display:inline}
.node.pv-main .shape{filter:drop-shadow(0 0 9px var(--focus))}
.help ul{padding-left:18px;margin:8px 0 0}
kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:13px}
@media (max-width:1400px){.brand{flex:0 1 22vw}.tools [data-act=flow],.tools [data-act=labels],.tools [data-act=legend],.tools [data-act=theme]{display:none}}
@media (max-width:900px){.brand span{display:none}.tools button:not(.primary):not([data-act=play]){display:none}}
@media (prefers-reduced-motion:reduce){.intro .node,.intro .edge,.intro .band,.intro .boundary{animation:none}body.flowing .edge .flow,.edge.pv .flow,.edge.up .flow,.edge.down .flow{animation:none}.edge.pv .flow{opacity:0}.flash{animation:none}}
`;

const JS = String.raw`
(() => {
  const DATA = JSON.parse(document.getElementById('archlens-data').textContent);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sections = $$('.view');
  const body = document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0, selected = null, timer = null;
  const vb = sections.map(s => { const svg = $('svg', s); return { x: 0, y: 0, w: +svg.dataset.w, h: +svg.dataset.h }; });

  // ---------- theme
  const root = document.documentElement;
  try { root.dataset.theme = localStorage.getItem('archlens-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { root.dataset.theme = 'light'; }
  const toggleTheme = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('archlens-theme', root.dataset.theme); } catch {} };

  // ---------- views
  const view = () => DATA.views[current];
  const sec = () => sections[current];
  const svg = () => $('svg', sec());
  function show(i, fromHash) {
    if (i < 0 || i >= sections.length) return;
    stop(); clearTrace(); clearPreview(); unpin();
    sections.forEach((s, k) => { s.hidden = k !== i; });
    current = i;
    $('#viewSelect').value = view().key;
    if (!fromHash) history.replaceState(null, '', '#' + encodeURIComponent(view().key));
    $('[data-act=matrix]').hidden = !view().matrix;
    if (!view().matrix) $('.sheet').hidden = true; else if (!$('.sheet').hidden) renderMatrix();
    $('[data-act=legend]').classList.toggle('on', !$('.legend', sec()).hidden);
    intro();
    requestAnimationFrame(checkLegibility);
  }
  function intro() {
    if (reduced) return;
    const s = svg();
    $$('.edge', s).forEach((e, k) => e.style.setProperty('--n', Math.min(k, 30) + (view().notation === 'c4' ? 6 : 10)));
    s.classList.remove('intro'); void s.getBoundingClientRect(); s.classList.add('intro');
    setTimeout(() => s.classList.remove('intro'), 2600);
  }

  // ---------- viewBox zoom / pan (animated, no CSS transforms: text stays crisp)
  let anim = null;
  function setVB(i, r) { vb[i] = r; $('svg', sections[i]).setAttribute('viewBox', [r.x, r.y, r.w, r.h].map(n => Math.round(n * 10) / 10).join(' ')); }
  function animateVB(target, ms = 380) {
    cancelAnimationFrame(anim);
    const i = current, from = { ...vb[i] }, t0 = performance.now();
    if (reduced) { setVB(i, target); checkLegibility(); return; }
    const step = now => {
      const t = Math.min(1, (now - t0) / ms), k = 1 - Math.pow(1 - t, 3);
      setVB(i, { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k });
      if (t < 1) anim = requestAnimationFrame(step); else checkLegibility();
    };
    anim = requestAnimationFrame(step);
  }
  const full = () => ({ x: 0, y: 0, w: view().width, h: view().height });
  const fit = () => animateVB(full());
  function focusNode(id) {
    const v = view(), n = v.nodes[id]; if (!n) return;
    const near = [id, ...v.edges.filter(e => e.from === id || e.to === id).map(e => e.from === id ? e.to : e.from)].map(k => v.nodes[k]).filter(Boolean);
    let x0 = Math.min(...near.map(m => m.x)), y0 = Math.min(...near.map(m => m.y));
    let x1 = Math.max(...near.map(m => m.x + m.w)), y1 = Math.max(...near.map(m => m.y + m.h));
    const s = svg().getBoundingClientRect(), aspect = s.width / s.height, pad = 60;
    let w = Math.max(x1 - x0 + 2 * pad, 1000), h = Math.max(y1 - y0 + 2 * pad, w / aspect);
    w = Math.max(w, h * aspect); h = w / aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    animateVB({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  function toSvg(e) {
    const s = svg(), p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(s.getScreenCTM().inverse());
  }
  sections.forEach((section, i) => {
    const s = $('svg', section);
    s.addEventListener('wheel', e => {
      e.preventDefault();
      const p = toSvg(e), k = Math.exp(e.deltaY * 0.0015), r = vb[i];
      const w = Math.min(Math.max(r.w * k, 120), DATA.views[i].width * 4), h = w * r.h / r.w;
      setVB(i, { x: p.x - (p.x - r.x) * (w / r.w), y: p.y - (p.y - r.y) * (h / r.h), w, h });
      checkLegibility();
    }, { passive: false });
    let drag = null;
    s.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.node, .edge')) return;
      drag = { x: e.clientX, y: e.clientY, r: { ...vb[i] }, moved: false, scale: s.getScreenCTM().a };
      s.setPointerCapture(e.pointerId); s.classList.add('panning');
    });
    s.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / drag.scale, dy = (e.clientY - drag.y) / drag.scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) { if (!drag.moved) { clearTimeout(hoverTimer); clearPreview(); hideCard(); } drag.moved = true; dragging = true; }
      setVB(i, { ...drag.r, x: drag.r.x - dx, y: drag.r.y - dy });
    });
    const end = e => { if (!drag) return; const moved = drag.moved; drag = null; dragging = false; s.classList.remove('panning'); if (!moved && !e.target.closest('.node, .edge')) { clearTrace(); unpin(); } };
    s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
    s.addEventListener('click', e => {
      const g = e.target.closest('.node'); if (g) { stop(); unpin(); trace(g.dataset.node); return; }
      const ed = e.target.closest('.edge'); if (ed) pinCard(ed.dataset.edge, e.clientX, e.clientY);
    });
    s.addEventListener('dblclick', e => {
      const g = e.target.closest('.node'); if (!g) return;
      const id = g.dataset.node;
      const target = DATA.views.findIndex(v => v.key !== view().key && (v.scope === id || v.anchor === id) && (v.notation !== 'c4' || v.level === 'container' || v.level === 'component'));
      if (target >= 0) show(target);
    });
    s.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.node')) trace(e.target.closest('.node').dataset.node); });
  });

  // ---------- hover preview (1 hop) + plain-language relation card
  const card = $('.hovercard');
  let hoverTimer = null, previewing = null, pinned = null, dragging = false;
  const canPreview = () => !selected && !timer && !dragging;
  const edgeById = id => view().edges.find(e => e.id === id);
  function cardHtml(kind, id) {
    const v = view();
    if (kind === 'edge') {
      const h = edgeById(id).help;
      return '<div class="hc-kind">' + escH(h.title) + '</div><p class="hc-sent">' + escH(h.sentence) + '</p><p>' + escH(h.meaning) + '</p>'
        + (h.derived ? '<p class="hc-der">' + escH(h.derived) + '</p>' : '')
        + (h.c4 ? '<p>' + escH(h.c4) + '</p>' : '') + '<p class="hc-read">' + escH(h.reading) + '</p>'
        + (h.impact ? '<p class="hc-imp">' + escH(h.impact) + '</p>' : '');
    }
    const n = v.nodes[id], rels = v.edges.filter(e => e.from === id || e.to === id);
    return '<div class="hc-kind">' + escH(n.c4Label || n.typeLabel) + (n.technology ? ' · ' + escH(n.technology) : '') + '</div><p class="hc-sent">' + escH(n.name) + '</p>'
      + (n.description ? '<p>' + escH(n.description) + '</p>' : '')
      + (rels.length ? '<ul>' + rels.slice(0, 6).map(e => '<li>' + escH(e.help.sentence) + '</li>').join('') + (rels.length > 6 ? '<li>+' + (rels.length - 6) + ' relações</li>' : '') + '</ul>' : '')
      + '<p class="hc-read">Clique para rastrear a cadeia completa.</p>';
  }
  function placeCard(x, y) {
    card.hidden = false;
    const r = card.getBoundingClientRect();
    let left = x + 18, top = y + 18;
    if (left + r.width > innerWidth - 12) left = Math.max(12, x - r.width - 18);
    if (top + r.height > innerHeight - 12) top = Math.max(12, innerHeight - r.height - 12);
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }
  function clearPreview() {
    const s = svg(); previewing = null; if (!s) return;
    s.classList.remove('previewing');
    $$('.pv', s).forEach(x => x.classList.remove('pv', 'pv-main'));
  }
  function preview(kind, id) {
    clearPreview();
    previewing = { kind, id };
    if (!canPreview()) return;
    const s = svg(), mark = nid => { const n = $('.node[data-node="' + CSS.escape(nid) + '"]', s); if (n) n.classList.add('pv'); };
    s.classList.add('previewing');
    if (kind === 'node') {
      mark(id); $('.node[data-node="' + CSS.escape(id) + '"]', s).classList.add('pv-main');
      $$('.edge', s).forEach(e => { if (e.dataset.from === id || e.dataset.to === id) { e.classList.add('pv'); mark(e.dataset.from); mark(e.dataset.to); } });
    } else {
      const e = $('.edge[data-edge="' + CSS.escape(id) + '"]', s); e.classList.add('pv'); mark(e.dataset.from); mark(e.dataset.to);
    }
  }
  function showCard(kind, id, x, y) { if (pinned) return; card.classList.remove('pinned'); card.innerHTML = cardHtml(kind, id); placeCard(x, y); }
  function hideCard() { if (!pinned) card.hidden = true; }
  function pinCard(id, x, y) {
    pinned = id;
    card.classList.add('pinned');
    card.innerHTML = cardHtml('edge', id) + '<button class="linkish" data-act="glossary" data-type="' + escH(edgeById(id).type) + '">Como ler este tipo de relação?</button>';
    placeCard(x, y);
  }
  function unpin() { pinned = null; card.hidden = true; card.classList.remove('pinned'); }
  sections.forEach(section => {
    const s = $('svg', section);
    const target = e => { const t = e.target.closest('.node, .edge'); return t ? { t, kind: t.classList.contains('node') ? 'node' : 'edge', id: t.dataset.node || t.dataset.edge } : null; };
    s.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch' || dragging) return;
      const h = target(e); if (!h) return;
      clearTimeout(hoverTimer);
      if (previewing && previewing.kind === h.kind && previewing.id === h.id) return;
      const x = e.clientX, y = e.clientY;
      hoverTimer = setTimeout(() => { preview(h.kind, h.id); showCard(h.kind, h.id, x, y); }, 100);
    });
    s.addEventListener('pointerout', e => {
      const h = target(e); if (!h || (e.relatedTarget && h.t.contains(e.relatedTarget))) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { clearPreview(); hideCard(); }, 90);
    });
    s.addEventListener('pointermove', e => { if (previewing && !pinned && !card.hidden) placeCard(e.clientX, e.clientY); });
    s.addEventListener('focusin', e => {
      const t = e.target.closest('.node'); if (!t) return;
      const r = t.getBoundingClientRect();
      preview('node', t.dataset.node); showCard('node', t.dataset.node, r.right, r.top);
    });
    s.addEventListener('focusout', () => { clearPreview(); hideCard(); });
  });

  // ---------- legibility
  function checkLegibility() {
    const s = svg(), r = vb[current]; if (!s) return;
    const box = s.getBoundingClientRect();
    const scale = Math.min(box.width / r.w, box.height / r.h);
    const px = view().minFont * scale;
    const el = $('.legibility');
    if (px < DATA.minScreenPx) {
      el.hidden = false;
      el.textContent = 'Texto a ~' + px.toFixed(1) + 'px nesta tela (mínimo ' + DATA.minScreenPx + 'px). Use a roda do mouse / F para focar, ou divida a visão (focus + depth, collapse, layers).';
    } else el.hidden = true;
  }
  addEventListener('resize', () => requestAnimationFrame(checkLegibility));

  // ---------- trace
  // C4: follow calls (consumer → provider). ArchiMate: follow support (supported → supporter).
  const SUPPORTED_FIRST = { composition: 1, aggregation: 1, access: 1 };
  function orient(e) {
    if (view().notation === 'c4') return [e.from, e.to];
    return SUPPORTED_FIRST[e.type] ? [e.from, e.to] : [e.to, e.from];
  }
  function walk(start, dir) {
    const seen = new Set([start]), out = new Set(); let frontier = [start];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) for (const e of view().edges) {
        const [p, q] = orient(e), [a, b] = dir === 'down' ? [p, q] : [q, p];
        if (a === id) { out.add(e.id); if (!seen.has(b)) { seen.add(b); next.push(b); } }
      }
      frontier = next;
    }
    return { nodes: seen, edges: out };
  }
  function clearTrace() {
    selected = null;
    const s = svg(); if (!s) return;
    s.classList.remove('dimming');
    $$('.node', s).forEach(n => n.classList.remove('lit', 'sel', 'pulse'));
    $$('.edge', s).forEach(e => { e.classList.remove('up', 'down', 'lit'); setTone(e, 'base'); });
    $('.drawer').classList.remove('open');
  }
  function setTone(e, tone) {
    const line = $('.line', e); const pre = 'v' + current;
    if (line.dataset.ms) line.setAttribute('marker-start', 'url(#' + pre + '-' + line.dataset.ms + '-' + tone + ')');
    if (line.dataset.me) line.setAttribute('marker-end', 'url(#' + pre + '-' + line.dataset.me + '-' + tone + ')');
  }
  function trace(id) {
    clearTrace(); clearPreview(); hideCard(); selected = id;
    const s = svg();
    const down = walk(id, 'down'), up = walk(id, 'up');
    s.classList.add('dimming');
    $$('.node', s).forEach(n => { if (down.nodes.has(n.dataset.node) || up.nodes.has(n.dataset.node)) n.classList.add('lit'); });
    const sel = $('.node[data-node="' + CSS.escape(id) + '"]', s); sel && sel.classList.add('sel');
    $$('.edge', s).forEach(e => {
      if (down.edges.has(e.dataset.edge)) { e.classList.add('down'); setTone(e, 'down'); }
      else if (up.edges.has(e.dataset.edge)) { e.classList.add('up'); setTone(e, 'up'); }
    });
    openDrawer(id);
  }

  // ---------- drawer
  const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function openDrawer(id) {
    const v = view(), n = v.nodes[id]; if (!n) return;
    const name = x => escH(v.nodes[x] ? v.nodes[x].name : x);
    const rels = v.edges.filter(e => e.from === id || e.to === id);
    const rel = e => escH(e.help.sentence) + (e.derived ? ' <span class="chip">derivada</span>' : '') + (e.technology ? ' <span class="chip">' + escH(e.technology) + '</span>' : '');
    let h = '<h2>' + escH(n.name) + '</h2><div class="kind">' + escH(n.c4Label || n.typeLabel) + (n.c4Label && n.typeLabel ? ' · ArchiMate ' + escH(n.typeLabel) : '') + '</div>';
    if (n.inferred) h += '<p class="warn">⚠︎ Inferido a partir de texto livre: confirme.</p>';
    if (n.description) h += '<p>' + escH(n.description) + '</p>';
    h += '<dl>';
    if (n.technology) h += '<dt>Tecnologia</dt><dd>' + escH(n.technology) + '</dd>';
    if (n.layer) h += '<dt>Camada</dt><dd>' + escH(n.layer) + '</dd>';
    if (n.role) h += '<dt>Papel</dt><dd>' + escH({ supporter: 'sustenta a âncora', dependent: 'depende da âncora', both: 'sustenta e depende', anchor: 'âncora' }[n.role] || n.role) + (n.distance ? ' · distância ' + n.distance : '') + '</dd>';
    for (const [k, val] of Object.entries(n.properties || {})) h += '<dt>' + escH(k) + '</dt><dd>' + escH(val) + '</dd>';
    h += '</dl>';
    if (n.tags && n.tags.length) h += n.tags.map(t => '<span class="chip">' + escH(t) + '</span>').join('');
    if (rels.length) h += '<h3>Relações</h3><ul>' + rels.map(e => '<li data-go="' + escH(e.from === id ? e.to : e.from) + '">' + rel(e) + '</li>').join('') + '</ul><button class="linkish" data-act="glossary">Como ler as relações?</button>';
    h += '<p style="color:var(--muted);font-size:13px;margin-top:18px">' + (v.notation === 'c4' ? 'Laranja: o que ele usa (downstream) · Azul: quem o usa (upstream).' : 'Laranja: o que o sustenta · Azul: o que depende dele.') + ' <kbd>F</kbd> foca, <kbd>Esc</kbd> limpa.</p>';
    $('.drawer-body').innerHTML = h;
    $('.drawer').classList.add('open');
  }
  $('.drawer').addEventListener('click', e => { const li = e.target.closest('[data-go]'); if (li) { trace(li.dataset.go); } });

  // ---------- animations: story (C4 dynamic), impact (anchored ArchiMate), layers, reveal
  function caption(text) { const c = $('.caption'); c.hidden = !text; c.textContent = text || ''; }
  function stop() {
    clearTimeout(timer); timer = null; caption('');
    const s = svg(); if (!s) return;
    $$('.hidden-step', s).forEach(x => x.classList.remove('hidden-step'));
    s.classList.remove('dimming');
    $$('.lit', s).forEach(x => x.classList.remove('lit'));
    $$('.pulse', s).forEach(x => x.classList.remove('pulse'));
    $('[data-act=play]').textContent = '▶ Animar';
  }
  function play() {
    if (timer) { stop(); return; }
    clearTrace();
    const v = view(), s = svg();
    $('[data-act=play]').textContent = '■ Parar';
    const steps = [];
    if (v.edges.some(e => e.step)) {
      const edges = v.edges.filter(e => e.step).sort((a, b) => a.step - b.step);
      s.classList.add('dimming');
      edges.forEach(e => steps.push(() => {
        [e.from, e.to].forEach(id => { const n = $('.node[data-node="' + CSS.escape(id) + '"]', s); n.classList.add('lit', 'pulse'); setTimeout(() => n.classList.remove('pulse'), 900); });
        $('.edge[data-edge="' + CSS.escape(e.id) + '"]', s).classList.add('lit');
        caption(e.step + '. ' + v.nodes[e.from].name + ' → ' + v.nodes[e.to].name + (e.label ? ': ' + e.label : ''));
      }));
    } else if (v.anchor) {
      const byDist = {};
      for (const [id, n] of Object.entries(v.nodes)) { const d = n.isAnchor ? 0 : (n.distance ?? 99); (byDist[d] = byDist[d] || []).push(id); }
      s.classList.add('dimming');
      const lit = new Set();
      Object.keys(byDist).map(Number).sort((a, b) => a - b).forEach(d => steps.push(() => {
        byDist[d].forEach(id => { lit.add(id); const n = $('.node[data-node="' + CSS.escape(id) + '"]', s); n.classList.add('lit', 'pulse'); setTimeout(() => n.classList.remove('pulse'), 900); });
        $$('.edge', s).forEach(e => { if (lit.has(e.dataset.from) && lit.has(e.dataset.to)) e.classList.add('lit'); });
        caption(d === 0 ? 'Âncora: ' + v.nodes[v.anchor].name : 'Distância ' + d + ': ' + byDist[d].map(id => v.nodes[id].name).join(', '));
      }));
    } else if (v.notation === 'archimate') {
      const bands = $$('.band', s).map(b => b.dataset.layer);
      const all = [...$$('.band', s), ...$$('.node', s), ...$$('.edge', s)];
      all.forEach(x => x.classList.add('hidden-step'));
      const shown = new Set();
      bands.forEach(layer => steps.push(() => {
        $('.band[data-layer="' + layer + '"]', s).classList.remove('hidden-step');
        Object.entries(v.nodes).filter(([, n]) => n.layer === layer).forEach(([id]) => { shown.add(id); $('.node[data-node="' + CSS.escape(id) + '"]', s).classList.remove('hidden-step'); });
        $$('.edge', s).forEach(e => { if (shown.has(e.dataset.from) && shown.has(e.dataset.to)) e.classList.remove('hidden-step'); });
        caption($('.band[data-layer="' + layer + '"] text', s).textContent);
      }));
    } else {
      const nodes = $$('.node', s), edges = $$('.edge', s);
      [...nodes, ...edges].forEach(x => x.classList.add('hidden-step'));
      const shown = new Set();
      nodes.forEach(n => steps.push(() => {
        n.classList.remove('hidden-step'); shown.add(n.dataset.node);
        edges.forEach(e => { if (shown.has(e.dataset.from) && shown.has(e.dataset.to)) e.classList.remove('hidden-step'); });
        caption(v.nodes[n.dataset.node].name);
      }));
    }
    let k = 0;
    const tick = () => { if (k < steps.length) { steps[k++](); timer = setTimeout(tick, v.edges.some(e => e.step) ? 1900 : 1300); } else { timer = setTimeout(() => { stop(); }, 2200); } };
    tick();
  }

  // ---------- matrix
  function renderMatrix() {
    const v = view(); if (!v.matrix) return;
    const role = r => ({ dependent: 'depende', supporter: 'sustenta', both: 'ambos' }[r] || r);
    let h = '<p style="color:var(--muted)">Âncora: <b>' + escH(v.nodes[v.anchor].name) + '</b>. "Depende": impactado se a âncora falhar. "Sustenta": a âncora precisa dele.</p><table><thead><tr><th>Elemento</th><th>Tipo</th><th>Camada</th><th>Relação</th><th>Dist.</th><th>Caminho</th></tr></thead><tbody>';
    for (const r of v.matrix) h += '<tr data-id="' + escH(r.id) + '"><td><b>' + escH(r.name) + '</b>' + (r.shown ? '' : ' <span class="chip">oculto na visão</span>') + '</td><td>' + escH(r.typeLabel) + '</td><td>' + escH(r.layerLabel) + '</td><td class="tag-' + r.role + '">' + role(r.role) + '</td><td>' + r.distance + '</td><td>' + r.path.map(p => escH(p.via) + ' → ' + escH(p.name)).join(' · ') + '</td></tr>';
    $('.sheet-body').innerHTML = h + '</tbody></table>';
  }
  $('.sheet').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr && view().nodes[tr.dataset.id]) { trace(tr.dataset.id); focusNode(tr.dataset.id); } });
  function toggleMatrix() { if (!view().matrix) return; const s = $('.sheet'); s.hidden = !s.hidden; if (!s.hidden) renderMatrix(); }

  // ---------- presentation (Fullscreen API)
  function present() {
    if (!document.fullscreenElement) { (root.requestFullscreen ? root.requestFullscreen() : Promise.reject()).catch(() => body.classList.toggle('presenting')); }
    else document.exitFullscreen();
  }
  document.addEventListener('fullscreenchange', () => { body.classList.toggle('presenting', !!document.fullscreenElement); requestAnimationFrame(checkLegibility); });
  addEventListener('mousemove', e => {
    if (!body.classList.contains('presenting')) return;
    body.classList.toggle('reveal-top', e.clientY < 64 || !!e.target.closest('.bar'));
    body.classList.toggle('reveal-right', e.clientX > innerWidth - 32 || !!e.target.closest('.drawer'));
  });

  // ---------- export
  function exportSvg() {
    const s = svg().cloneNode(true);
    const v = view();
    s.setAttribute('viewBox', '0 0 ' + v.width + ' ' + v.height);
    s.setAttribute('width', v.width); s.setAttribute('height', v.height);
    s.setAttribute('data-theme', root.dataset.theme);
    s.classList.remove('intro', 'dimming');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = [...document.styleSheets].map(ss => [...ss.cssRules].map(r => r.cssText).join('\n')).join('\n') + '\nsvg{background:var(--bg);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}';
    s.insertBefore(style, s.firstChild);
    return new XMLSerializer().serializeToString(s);
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function exportPng() {
    const v = view(), img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = v.width * 2; c.height = v.height * 2; const g = c.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0); c.toBlob(b => download(b, v.key + '.png')); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(exportSvg());
  }

  // ---------- toolbar + keys
  const actions = {
    prev: () => show(current - 1), next: () => show(current + 1), play, fit,
    flow: () => { body.classList.toggle('flowing'); $('[data-act=flow]').classList.toggle('on'); },
    labels: () => { body.classList.toggle('labels'); $('[data-act=labels]').classList.toggle('on'); },
    matrix: toggleMatrix, theme: toggleTheme, present,
    legend: () => { const l = $('.legend', sec()); l.hidden = !l.hidden; $('[data-act=legend]').classList.toggle('on', !l.hidden); },
    export: () => { const m = $('.export-menu'); m.hidden = !m.hidden; },
    svg: () => { download(new Blob([exportSvg()], { type: 'image/svg+xml' }), view().key + '.svg'); $('.export-menu').hidden = true; },
    png: () => { exportPng(); $('.export-menu').hidden = true; },
    close: clearTrace,
    help: () => { $('.help').hidden = !$('.help').hidden; },
    glossary: b => {
      $('.help').hidden = false;
      const t = (b && b.dataset && b.dataset.type && document.getElementById('gl-' + b.dataset.type)) || document.getElementById('glossary');
      const d = t.closest('details'); if (d) d.open = true;
      t.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
    },
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && actions[b.dataset.act]) actions[b.dataset.act](b); });
  $('#viewSelect').addEventListener('change', e => show(DATA.views.findIndex(v => v.key === e.target.value)));
  document.addEventListener('keydown', e => {
    if (e.target.matches('select, input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': show(current + 1); break;
      case 'ArrowLeft': case 'PageUp': show(current - 1); break;
      case 'p': case 'P': present(); break;
      case '0': fit(); break;
      case 'f': case 'F': if (selected) focusNode(selected); break;
      case ' ': e.preventDefault(); play(); break;
      case 'a': case 'A': actions.flow(); break;
      case 'r': case 'R': actions.labels(); break;
      case 'm': case 'M': toggleMatrix(); break;
      case 'l': case 'L': actions.legend(); break;
      case 't': case 'T': toggleTheme(); break;
      case 'e': case 'E': actions.export(); break;
      case '?': actions.help(); break;
      case 'g': case 'G': actions.glossary(); break;
      case 'Escape': stop(); clearTrace(); unpin(); $('.help').hidden = true; $('.export-menu').hidden = true; $('.sheet').hidden = true; if (vb[current].w !== view().width) fit(); break;
      default: return;
    }
  });
  addEventListener('hashchange', () => { const i = DATA.views.findIndex(v => '#' + encodeURIComponent(v.key) === location.hash); if (i >= 0 && i !== current) show(i, true); });

  const start = DATA.views.findIndex(v => '#' + encodeURIComponent(v.key) === location.hash);
  show(start >= 0 ? start : 0, true);
  window.archlens = { show, fit, focusNode, trace, play, stop, present, preview, pinCard, data: DATA, get current() { return current; } };
})();
`;
