// The preview of a planning draft: the base as the plan would leave it, drawn with what changes marked.
import { createHash } from 'node:crypto';
import { relationshipIds } from '../../../../scripts/lib/merge.mjs';
import { preview as previewOf, show } from '../../../../scripts/lib/api.mjs';
import { previewSummary, annotateView } from '../../../../scripts/lib/preview.mjs';
import { normalizeModel } from '../../../../scripts/lib/model.mjs';
import { resolveView } from '../../../../scripts/lib/query.mjs';
import { emptyViewMessage } from '../../../../scripts/lib/query-where.mjs';
import { layoutView } from '../../../../scripts/lib/layout.mjs';
import { renderHtml, viewData } from '../../../../scripts/lib/render.mjs';
import { lineDiff } from '../../../../scripts/lib/node-doc.mjs';
import { ELEMENT_TYPES } from '../../../../scripts/lib/registry.mjs';
import { navHelpers } from '../bases.mjs';
import { actionsFor, flipSpec, titleFor } from '../navigation.mjs';

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

// Ids the draft touches: elements added, changed or removed, and both ends of every relationship that is.
function touchedIds(model, p) {
  const ids = new Set([...p.changes].filter(([, c]) => TOUCHED.has(c.kind)).map(([id]) => id));
  const changed = new Set([...p.relChanges].filter(([, c]) => TOUCHED.has(c.kind)).map(([id]) => id));
  if (changed.size) {
    for (const [r, id] of relationshipIds(p.raw)) if (changed.has(id)) { ids.add(r.from); ids.add(r.to); }
  }
  return [...ids].filter(id => model.elements.has(id));
}

/**
 * The change view. Without `notation`, the first that shows a touched element: containers of the one system the change
 * is in, the landscape, then ArchiMate around the touched elements (C4 ignores the purely ArchiMate ones). With it, the
 * first of that notation.
 */
function changeSpec(model, p, notation) {
  const touched = touchedIds(model, p);
  const { systemOf } = navHelpers(model);
  const systems = new Set(touched.map(systemOf));
  const change = { key: 'delta', title: 'O que muda' };
  const c4 = { ...change, focus: touched, depth: 1 };
  const candidates = [];
  if (systems.size === 1 && !systems.has(null)) candidates.push({ ...c4, notation: 'c4', level: 'container', scope: [...systems][0] });
  candidates.push({ ...c4, notation: 'c4', level: 'landscape' });
  const archimate = { ...change, notation: 'archimate', viewpoint: 'layered', anchor: touched[0], traverse: { mode: 'both', maxDepth: 1 }, include: touched };
  const shows = s => nodesOf(model, p, s).some(n => (touched.length ? n.isFocus || touched.includes(n.id) : true));
  if (notation === 'archimate' && touched.length) return archimate;
  if (notation === 'c4') return candidates.find(shows) ?? candidates.at(-1);
  return touched.length ? [...candidates, archimate].find(shows) ?? archimate : candidates.at(-1);
}

function specsOf(model, p, notation) {
  const ids = new Set(touchedIds(model, p));
  const saved = p.views.filter(v => nodesOf(model, p, v).some(n => ids.has(n.id)));
  return [changeSpec(model, p, notation), ...saved];
}

/** The change view, then every saved view whose result holds an element the draft adds, changes or removes. */
export function defaultPreviewSpecs(ctx, draft) {
  const { p, model } = open(ctx, draft);
  return specsOf(model, p);
}

/** Navigation over the preview: the base as the draft leaves it, so what the draft adds can be explored too. */
function navOf(ctx, draft) {
  const { p, model } = open(ctx, draft);
  return { p, model, nav: { model, ...navHelpers(model) } };
}

// A navigated view carries its own key and title, so it can be listed and drawn again with the next draft.
const keyed = (nav, spec) => ({ key: `nav-${createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0, 10)}`, title: titleFor(nav, spec), ...spec });
const keyActions = (nav, actions) => actions.map(a => ({ ...a, ...(a.spec ? { spec: keyed(nav, a.spec) } : {}), ...(a.sub ? { sub: keyActions(nav, a.sub) } : {}) }));

/** The context-menu actions of an element, over the preview model (it may be one the draft adds). */
export function previewActions(ctx, draft, id) {
  const { nav } = navOf(ctx, draft);
  return keyActions(nav, actionsFor(nav, id));
}

/** The same subject in the other notation, over the preview model; the change view gives the change view. */
export function previewFlip(ctx, draft, spec) {
  const { p, model, nav } = navOf(ctx, draft);
  if (spec.key === 'delta') return changeSpec(model, p, spec.notation === 'c4' ? 'archimate' : 'c4');
  return keyed(nav, flipSpec(nav, spec));
}

const SIGN = { added: '+', changed: '~', removed: '−', retired: '−' };
const VALUE_MAX = 300;
const text = v => {
  if (v === undefined || v === null || v === '') return '—';
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > VALUE_MAX ? `${t.slice(0, VALUE_MAX)}…` : t;
};
const fieldsOf = c => (c.fields ?? []).map(f => ({ field: f.field, before: text(f.before), after: text(f.after) }));

/**
 * What the draft adds (+), changes (~) and removes (−), elements then relationships, with the type, the description of
 * what is added and the fields that change, the documentation written (with its line diff), and the questions still open.
 */
function deltaList(model, p) {
  const changes = [...p.changes].map(([id, c]) => {
    const el = model.elements.get(id);
    return {
      sign: SIGN[c.kind], kind: 'element', id, name: el?.name ?? id, type: ELEMENT_TYPES[el?.type]?.label ?? el?.type ?? '',
      ...(c.kind === 'added' && el?.description ? { description: text(el.description) } : {}), fields: fieldsOf(c),
    };
  });
  const ends = new Map([...relationshipIds(p.raw)].map(([r, id]) => [id, r]));
  for (const [id, c] of p.relChanges) {
    const r = ends.get(id);
    const name = r ? `${model.elements.get(r.from)?.name ?? r.from} → ${model.elements.get(r.to)?.name ?? r.to}` : id;
    changes.push({
      sign: SIGN[c.kind], kind: 'relationship', id, name, type: r?.type ?? '', ends: r ? [r.from, r.to] : [],
      ...(c.kind === 'added' && r?.description ? { description: text(r.description) } : {}), fields: fieldsOf(c),
    });
  }
  // The documentation travels apart from the model: its changes come from the plan's items, in full (no VALUE_MAX cut).
  for (const it of p.plan?.items ?? []) {
    if (it.kind !== 'doc' || it.class === 'unchanged' || it.resolution === 'keep') continue;
    const before = it.base ?? '', after = it.delta ?? '';
    const sign = !before.trim() ? '+' : !after.trim() ? '−' : '~';
    changes.push({ sign, kind: 'doc', id: it.target, name: model.elements.get(it.target)?.name ?? it.target, diff: lineDiff(before, after) });
  }
  const seen = new Set();
  const questions = [];
  for (const q of [...p.pending.values()].flat()) {
    if (seen.has(q.key)) continue;
    seen.add(q.key);
    questions.push({ key: q.key, question: q.question, options: q.options, assumed: q.assumed });
  }
  return { changes, questions };
}

async function drawView(model, p, spec, kind) {
  const view = resolveView(model, spec, { keep: p.keep });
  if (!view.nodes.length) throw planError(emptyViewMessage(model, { key: 'view', ...spec }, view), 'E_VIEW_EMPTY');
  const laid = await layoutView(annotateView(view, p));
  const html = renderHtml({ title: model.name, subtitle: 'archlens · prévia', views: [laid], embed: true });
  return { key: laid.key, title: laid.title, html, viewData: viewData(laid), kind, spec };
}

/**
 * The views of the preview. Without `specs`: the defaults (the change view that cannot be drawn comes back with an `error`, a saved one goes to `skipped`). With `specs`:
 * exactly those, drawn with the draft's change on them; an invalid one is an error.
 */
export async function buildPreview(ctx, draft, specs, { notation } = {}) {
  const { p, warning, model } = open(ctx, draft);
  const views = [], skipped = [];
  if (specs) for (const s of specs) views.push(await drawView(model, p, s, 'asked'));
  else {
    const [change, ...saved] = specsOf(model, p, notation);
    try { views.push(await drawView(model, p, change, 'change')); } catch (e) {
      views.push({ kind: 'change', key: 'delta', title: 'O que muda', error: e.message, spec: change });
    }
    for (const s of saved) {
      try { views.push(await drawView(model, p, s, 'saved')); } catch (e) { skipped.push({ key: s.key, error: e.message }); }
    }
  }
  const report = draft.plan ? show(ctx.store, draft.plan) : null;
  return { views, skipped, summary: previewSummary(p), ...deltaList(model, p), report, ...(warning ? { warning } : {}) };
}
