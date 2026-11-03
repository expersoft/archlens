// The preview of a planning draft: the base as the plan would leave it, drawn with what changes marked.
import { relationshipIds } from '../../../../scripts/lib/merge.mjs';
import { preview as previewOf } from '../../../../scripts/lib/api.mjs';
import { previewSummary, annotateView } from '../../../../scripts/lib/preview.mjs';
import { normalizeModel, c4KindOf } from '../../../../scripts/lib/model.mjs';
import { resolveView } from '../../../../scripts/lib/query.mjs';
import { layoutView } from '../../../../scripts/lib/layout.mjs';
import { renderHtml, viewData } from '../../../../scripts/lib/render.mjs';

const TOUCHED = new Set(['added', 'changed', 'removed', 'retired']);
const planError = (message, code) => Object.assign(new Error(message), { code });

function open(ctx, draft) {
  if (!draft.delta) throw planError('o rascunho ainda não tem delta para pré-visualizar', 'E_GUI_PREVIEW');
  const { preview: p, warning } = previewOf(ctx.store, draft.plan ? { plan: draft.plan } : { delta: draft.delta });
  return { p, warning, model: normalizeModel(p.raw) };
}

const nodesOf = (model, p, spec) => {
  try { return resolveView(model, spec, { keep: p.keep }).nodes; } catch { return []; }
};

/** The system an element belongs to in the preview model (itself, if it is one). */
function systemIn(model, id) {
  const seen = new Set();
  for (let el = model.elements.get(id); el && !seen.has(el.id); el = el.parent ? model.elements.get(el.parent) : undefined) {
    if (c4KindOf(model, el) === 'softwareSystem') return el.id;
    seen.add(el.id);
  }
  return null;
}

// Ids the draft touches: elements added, changed or removed, and both ends of every relationship that is.
function touchedIds(model, p) {
  const ids = new Set([...p.changes].filter(([, c]) => TOUCHED.has(c.kind)).map(([id]) => id));
  const changed = new Set([...p.relChanges].filter(([, c]) => TOUCHED.has(c.kind)).map(([id]) => id));
  if (changed.size) {
    for (const [r, id] of relationshipIds(p.raw)) if (changed.has(id)) { ids.add(r.from); ids.add(r.to); }
  }
  return [...ids].filter(id => model.elements.has(id));
}

function specsOf(model, p) {
  const touched = touchedIds(model, p);
  const systems = new Set(touched.map(id => systemIn(model, id)));
  const change = { key: 'delta', title: 'O que muda' };
  const c4 = { ...change, focus: touched, depth: 1 };
  // The first that shows a touched element: containers of the one system the change is in, the landscape, then
  // ArchiMate around the touched elements (C4 ignores the purely ArchiMate ones).
  const candidates = [];
  if (systems.size === 1 && !systems.has(null)) candidates.push({ ...c4, notation: 'c4', level: 'container', scope: [...systems][0] });
  candidates.push({ ...c4, notation: 'c4', level: 'landscape' });
  const archimate = { ...change, notation: 'archimate', viewpoint: 'layered', anchor: touched[0], traverse: { mode: 'both', maxDepth: 1 }, include: touched };
  const shows = s => nodesOf(model, p, s).some(n => (touched.length ? n.isFocus || touched.includes(n.id) : true));
  const spec = touched.length ? [...candidates, archimate].find(shows) ?? archimate : candidates.at(-1);
  const ids = new Set(touched);
  const saved = p.views.filter(v => nodesOf(model, p, v).some(n => ids.has(n.id)));
  return [spec, ...saved];
}

/** The change view, then every saved view whose result holds an element the draft adds, changes or removes. */
export function defaultPreviewSpecs(ctx, draft) {
  const { p, model } = open(ctx, draft);
  return specsOf(model, p);
}

async function drawView(model, p, spec, kind) {
  const view = resolveView(model, spec, { keep: p.keep });
  if (!view.nodes.length) throw planError(`visão "${spec.key ?? 'view'}" ficou vazia — revise scope/anchor/filtros`, 'E_VIEW_EMPTY');
  const laid = await layoutView(annotateView(view, p));
  const html = renderHtml({ title: model.name, subtitle: 'archlens · prévia', views: [laid], embed: true });
  return { key: laid.key, title: laid.title, html, viewData: viewData(laid), kind };
}

/**
 * The views of the preview. Without `specs`: the defaults (the change view that cannot be drawn comes back with an `error`, a saved one goes to `skipped`). With `specs`:
 * exactly those, drawn with the draft's change on them; an invalid one is an error.
 */
export async function buildPreview(ctx, draft, specs) {
  const { p, warning, model } = open(ctx, draft);
  const views = [], skipped = [];
  if (specs) for (const s of specs) views.push(await drawView(model, p, s, 'asked'));
  else {
    const [change, ...saved] = specsOf(model, p);
    try { views.push(await drawView(model, p, change, 'change')); } catch (e) {
      views.push({ kind: 'change', key: 'delta', title: 'O que muda', error: e.message });
    }
    for (const s of saved) {
      try { views.push(await drawView(model, p, s, 'saved')); } catch (e) { skipped.push({ key: s.key, error: e.message }); }
    }
  }
  return { views, skipped, summary: previewSummary(p), ...(warning ? { warning } : {}) };
}
