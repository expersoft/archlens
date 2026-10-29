import type { ViewEntry } from './api';

/** Primeira visão salva de nível landscape; senão a primeira visão. */
export function pickInitialView(views: ViewEntry[]): ViewEntry | undefined {
  return views.find((v) => v.saved && v.spec?.level === 'landscape') ?? views[0];
}
