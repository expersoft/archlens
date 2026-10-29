import { resolveView } from './query.mjs';
import { layoutView, legibility } from './layout.mjs';
import { renderHtml, viewData } from './render.mjs';

const since = t0 => Math.round(performance.now() - t0);

/** Warnings for a laid-out view; the same text the CLI prints. */
export function viewAlerts(view, laid) {
  const key = view.key ?? laid.key;
  const out = [];
  if (view.nodes.length > 40) out.push(`visão "${key}" tem ${view.nodes.length} nós; considere focus/depth, collapse ou layers`);
  if (laid.layoutNote) out.push(`"${key}": ${laid.layoutNote}`);
  const leg = legibility(laid, 1920, 1080 - 56);
  if (!leg.ok) out.push(`"${key}": ${leg.suggestion}`);
  return out;
}

/** The single spec -> view path. Takes an already normalized model. */
export async function buildView(model, spec, { embed = true, title, subtitle } = {}) {
  let t = performance.now();
  const view = resolveView(model, spec);
  const resolve = since(t);
  if (!view.nodes.length) {
    throw Object.assign(new Error(`visão "${spec.key}" ficou vazia — revise scope/anchor/filtros`), { code: 'E_VIEW_EMPTY' });
  }
  t = performance.now();
  const laid = await layoutView(view);
  const layout = since(t);
  t = performance.now();
  const html = renderHtml({ title: title ?? model.name, subtitle: subtitle ?? 'archlens', views: [laid], embed });
  const render = since(t);
  return {
    html,
    data: viewData(laid),
    alerts: viewAlerts(view, laid),
    nodes: view.nodes.map(n => n.id),
    layoutStyle: laid.layoutStyle ?? null,
    ms: { resolve, layout, render },
  };
}
