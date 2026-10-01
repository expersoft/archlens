// Hand-drawn ("sketch") strokes for drafts and preview changes, like draw.io's Sketch style: rough.js
// (vendored) generates hachure fills and doubled, slightly bowed outlines as plain SVG paths at build time.
// Seeds come from element ids, so the same model always draws the same strokes. Colors are left to CSS.
import rough from '../vendor/rough.esm.mjs';

const gen = rough.generator();
const BASE = { roughness: 1.4, bowing: 1.2, strokeWidth: 1.8 };
const HACHURE = { fillStyle: 'hachure', hachureAngle: -41, fillWeight: 1 };

/** Hachure gap proportional to the box: about an eighth of its shorter side, between 7 and 16 units. */
export function hachureGapFor(w, h) {
  return Math.max(7, Math.min(16, Math.round(Math.min(w, h) / 8)));
}

/** Stable positive seed for an id (FNV-1a), offset by a salt so different parts of one element differ. */
export function seedOf(id, salt = 0) {
  let h = 2166136261;
  for (const ch of `${id}#${salt}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483646 + 1;
}

const num = v => Number.parseFloat(v);
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

/** Rounded rectangle as path data (rough.js has no rx/ry on rectangles). */
function roundedRect(x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!k) return `M${x},${y} h${w} v${h} h${-w} z`;
  return `M${x + k},${y} h${w - 2 * k} a${k},${k} 0 0 1 ${k},${k} v${h - 2 * k} a${k},${k} 0 0 1 ${-k},${k}`
    + ` h${-(w - 2 * k)} a${k},${k} 0 0 1 ${-k},${-k} v${-(h - 2 * k)} a${k},${k} 0 0 1 ${k},${-k} z`;
}

const short = d => d.replace(/-?\d+\.\d+/g, v => String(Math.round(Number(v) * 10) / 10));

/** rough.js drawable → SVG paths; hachure strokes (drawn thinner, with fillWeight) get "sk-fill", outlines lineClass. */
function toSvg(drawable, lineClass = 'sk-line') {
  return gen.toPaths(drawable).map(p => `<path class="${p.strokeWidth < BASE.strokeWidth ? 'sk-fill' : lineClass}" d="${short(p.d)}"/>`).join('');
}

function drawable(tag, seed, fill, size) {
  const a = attrs(tag);
  const opts = { ...BASE, seed, ...(fill ? { ...HACHURE, hachureGap: hachureGapFor(size.w, size.h), fill: '#000' } : {}) };
  if (tag.startsWith('<circle')) return gen.circle(num(a.cx), num(a.cy), 2 * num(a.r), opts);
  if (tag.startsWith('<rect')) return gen.path(roundedRect(num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx ?? 0)), opts);
  return gen.path(a.d, opts);
}

/**
 * Hand-drawn version of a node's shape markup. The original shapes stay (class "shape", styled almost
 * transparent) for hit-testing and the focus ring; each one gets hachure + outline, rims get an outline.
 */
export function sketchShape(shape, id, size = { w: 120, h: 60 }) {
  const parts = shape.match(/<(?:path|rect|circle) class="(?:shape|rim)"[^>]*\/>/g) ?? [];
  let out = shape;
  parts.forEach((tag, i) => {
    const isRim = tag.includes('class="rim"');
    out += toSvg(drawable(tag, seedOf(id, i), !isRim, size));
  });
  return out;
}

/** Hand-drawn outline only (preview: around a changed node). */
export function sketchOutline(x, y, w, h, r, id) {
  return toSvg(gen.path(roundedRect(x, y, w, h, r), { ...BASE, seed: seedOf(id, 'outline') }), 'ch-outline');
}

/** Hand-drawn strike (preview: removed / retired node). */
export function sketchStrike(x, y, w, h, id) {
  const line = (x1, y1, x2, y2, s) => toSvg(gen.line(x1, y1, x2, y2, { ...BASE, strokeWidth: 3, seed: seedOf(id, s) }), 'sk-strike');
  return line(x + 4, y + 4, x + w - 4, y + h - 4, 'a') + line(x + 4, y + h - 4, x + w - 4, y + 4, 'b');
}

/** Hand-drawn edge line along the edge's own path data. */
export function sketchEdge(d, id) {
  return toSvg(gen.path(d, { ...BASE, roughness: 1, bowing: 1, seed: seedOf(id, 'edge') }), 'sk-edge');
}
