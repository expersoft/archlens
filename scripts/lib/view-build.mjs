import { resolveView } from './query.mjs';
import { emptyViewMessage } from './query-where.mjs';
import { layoutView, legibility } from './layout.mjs';
import { renderHtml, viewData } from './render.mjs';

const since = t0 => Math.round(performance.now() - t0);

/** Structured warnings for a laid-out view; `text` is what the CLI prints. */
export function viewAlertInfo(view, laid) {
  const key = view.key ?? laid.key;
  const nodes = view.nodes.length;
  const out = [];
  if (nodes > 40) out.push({ kind: 'size', text: `visão "${key}" tem ${nodes} nós; considere focus/depth, collapse ou layers`, nodes });
  if (laid.layoutNote) out.push({ kind: 'layout', text: `"${key}": ${laid.layoutNote}` });
  const leg = legibility(laid, 1920, 1080 - 56);
  if (!leg.ok) out.push({ kind: 'legibility', text: `"${key}": ${leg.suggestion}`, nodes, minFontPx: leg.minFontPx });
  return out;
}

/** Warnings for a laid-out view; the same text the CLI prints. */
export function viewAlerts(view, laid) {
  return viewAlertInfo(view, laid).map(a => a.text);
}

/** The single spec -> view path. Takes an already normalized model. */
export async function buildView(model, spec, { embed = true, title, subtitle } = {}) {
  let t = performance.now();
  const view = resolveView(model, spec);
  const resolve = since(t);
  if (!view.nodes.length) {
    throw Object.assign(new Error(emptyViewMessage(model, spec, view)), { code: 'E_VIEW_EMPTY' });
  }
  t = performance.now();
  const laid = await layoutView(view);
  const layout = since(t);
  t = performance.now();
  const html = renderHtml({ title: title ?? model.name, subtitle: subtitle ?? 'archlens', views: [laid], embed });
  const render = since(t);
  const alertInfo = viewAlertInfo(view, laid);
  const alerts = alertInfo.map(a => a.text);
  return {
    html,
    data: viewData(laid),
    alerts,
    alertInfo,
    nodes: view.nodes.map(n => n.id),
    layoutStyle: laid.layoutStyle ?? null,
    ms: { resolve, layout, render },
  };
}
