// What the GUI lists for a base: its views (saved and suggested) and its elements; plus search by name.
import { suggestViews } from '../../../scripts/lib/suggest.mjs';
import { similarity } from '../../../scripts/lib/match.mjs';

export function catalog(ctx) {
  const { model } = ctx;
  const saved = model.views.map(v => ({ key: v.key, title: v.title ?? v.key, spec: v, saved: true }));
  const keys = new Set(saved.map(v => v.key));
  const suggested = suggestViews(model).filter(v => !keys.has(v.key))
    .map(({ why, ...spec }) => ({ key: spec.key, title: why, spec, saved: false }));
  const elements = [...model.elements.values()].map(e => ({
    id: e.id, name: e.name, type: e.type, layer: e.layer, kind: ctx.kind(e), parent: e.parent, group: e.group,
  }));
  return { id: ctx.id, name: ctx.name, views: [...saved, ...suggested], elements };
}

const norm = s => String(s ?? '').toLowerCase();

export function findElements(ctx, text, limit = 8) {
  const q = norm(text).trim();
  if (!q) return [];
  const out = [];
  for (const e of ctx.model.elements.values()) {
    const name = norm(e.name);
    let score = 0;
    if (name.includes(q) || norm(e.id).includes(q)) {
      // inclusion beats similarity; the larger share of the name it covers, the better
      score = 0.9 + 0.1 * Math.min(1, q.length / Math.max(name.length, 1));
    } else {
      const s = Math.max(similarity(text, e.name ?? ''), ...(e.aliases ?? []).map(a => similarity(text, a)));
      if (s >= 0.5) score = s;
    }
    if (score > 0) out.push({ id: e.id, name: e.name, type: e.type, kind: ctx.kind(e), score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
