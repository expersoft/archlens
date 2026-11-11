// Rendering of a base's views to one HTML page and its visual check: what "archlens build", "deliver" and "render" print
// comes back as data (warnings, quality results); refusals are errors with a code.
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { normalizeModel } from './model.mjs';
import { validateModel } from './validate.mjs';
import { resolveView } from './query.mjs';
import { layoutView } from './layout.mjs';
import { viewAlerts } from './view-build.mjs';
import { emptyViewMessage } from './query-where.mjs';
import { renderHtml } from './render.mjs';
import { suggestViews } from './suggest.mjs';
import { annotateView } from './preview.mjs';
import { inspectHtml } from './deliver.mjs';
import { docToHtml } from './node-doc.mjs';

// The message is the sentence the CLI prints (no code prefix); `warnings` holds what came before the refusal.
const buildError = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/** The safe HTML of the texts in `docs` (id → text), only for nodes present in some of the laid out views. */
function docsHtml(docs, laid) {
  if (!docs) return undefined;
  const ids = new Set(laid.flatMap(v => v.nodes.map(n => n.id)));
  const out = {};
  for (const [id, text] of Object.entries(docs)) if (ids.has(id) && text?.trim()) out[id] = docToHtml(text);
  return out;
}

/**
 * The page of `specs` over `raw`. `warnings` are the lines the CLI prints while rendering, in order ("  layout …" and
 * "  aviso: …"). Throws E_BUILD_INVALID (with `errors`) on model errors, E_BUILD_VIEW when a view does not resolve (outside
 * a preview) and E_BUILD_EMPTY when no view has content.
 */
export async function renderViews(raw, specs, { title, preview, docs } = {}) {
  const { errors } = validateModel(raw);
  if (errors.length) throw buildError('E_BUILD_INVALID', `${errors.length} erro(s) no modelo; corrija antes de renderizar`, { errors, warnings: [] });
  const model = normalizeModel(raw);
  const laid = [];
  const warnings = [];
  for (const spec of specs) {
    let view;
    try { view = resolveView(model, spec, preview ? { keep: preview.keep } : {}); } catch (e) {
      if (preview) { warnings.push(`  aviso: visão "${spec.key}" não abre na prévia: ${e.message}`); continue; }
      throw buildError('E_BUILD_VIEW', `visão "${spec.key}": ${e.message}`, { warnings });
    }
    if (preview) annotateView(view, preview);
    if (!view.nodes.length) { warnings.push(`  aviso: ${emptyViewMessage(model, spec, view)}`); continue; }
    const l = await layoutView(view);
    if (l.layoutStyle) warnings.push(`  layout "${spec.key}": ${l.layoutStyle}${l.layoutAuto ? ` (auto; ${Object.entries(l.layoutScores).map(([k, q]) => `${k} ${q.score}`).join(', ')})` : ' (pedido na visão)'}`);
    for (const a of viewAlerts(view, l)) warnings.push(`  aviso: ${a}`);
    laid.push(l);
  }
  if (!laid.length) throw buildError('E_BUILD_EMPTY', 'nenhuma visão com conteúdo', { warnings });
  const subtitle = `${laid.length} visão(ões) · archlens${preview ? ' · prévia' : ''}`;
  return { html: renderHtml({ title: title ?? model.name, subtitle, views: laid, docs: preview ? undefined : docsHtml(docs, laid), ...(preview ? { preview: { label: preview.label } } : {}) }), laid, warnings };
}

/**
 * Renders `specs` to `out` and checks it in Chromium (screenshots under `shots`: a folder, true for "<out>.shots", false for
 * none). With `strict` and quality problems, the page goes to "<out>.rejected.html" (`rejected`) and `out` is kept.
 * Without Chromium the page is written and `available` is false, with the `reason`.
 */
export async function deliverHtml(raw, specs, out, { title, preview, docs, shots = true, strict = false, onCheck } = {}) {
  const { html, warnings } = await renderViews(raw, specs, { title, preview, docs });
  const stem = out.replace(/\.html?$/i, '');
  const tmp = `${stem}.candidate-${process.pid}.html`;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(tmp, html);
  const shotsDir = typeof shots === 'string' ? shots : shots ? `${stem}.shots` : undefined;
  const report = await inspectHtml(tmp, { shotsDir, ...(onCheck ? { onCheck } : {}) });
  const problems = report.results.filter(r => r.issues.length).length;
  const res = { out, problems, results: report.results, available: report.available, ...(report.available ? {} : { reason: report.reason }), warnings, shots: shotsDir };
  if (problems && strict) {
    const rejected = `${stem}.rejected.html`;
    renameSync(tmp, rejected);
    return { ...res, rejected };
  }
  renameSync(tmp, out);
  return res;
}

/** Where "archlens build" saves the page of a base: its diagrams/ folder, or next to an old single-file base. */
const diagramsDir = loc => (loc.kind === 'folder' && loc.exists ? join(loc.path, 'diagrams') : dirname(loc.path));
const pageName = loc => (loc.kind === 'folder' ? 'architecture'
  : basename(loc.path).replace(/\.(json|md)$/i, '').replace(/^ARCHITECTURE$/i, 'architecture').replace(/\.model$/, ''));

/**
 * The saved diagrams of a base: `specs` (by default its views, or the suggested ones) rendered to <dir>/<name>.html and
 * checked. Does not write the document. Never throws for a missing Chromium (see deliverHtml).
 */
export async function buildDiagrams(store, raw, { dir = diagramsDir(store.locator), name, specs, title, preview, shots = true, strict = false, onCheck } = {}) {
  const model = specs ? null : normalizeModel(raw);
  const views = specs ?? (model.views.length ? model.views : suggestViews(model));
  mkdirSync(dir, { recursive: true });
  return deliverHtml(raw, views, join(dir, `${name ?? preview?.name ?? pageName(store.locator)}.html`), { title, preview, docs: preview ? undefined : store.read()?.docs, shots, strict, onCheck });
}
