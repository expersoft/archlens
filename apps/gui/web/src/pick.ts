import type { ViewEntry } from './api';

const framed = (v: ViewEntry) => !!(v.spec?.groups as { frames?: unknown } | undefined)?.frames;

/** Landscape salva; senão landscape sugerida (sem molduras, se houver); senão a primeira visão. */
export function pickInitialView(views: ViewEntry[]): ViewEntry | undefined {
  const land = views.filter((v) => v.spec?.level === 'landscape');
  return land.find((v) => v.saved)
    ?? land.find((v) => !framed(v))
    ?? land[0]
    ?? views[0];
}
