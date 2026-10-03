// Inventory + role + base → delta (rules in references/repo-reading.md). Pure: no I/O.
import { normalizeRepoUrl } from './git.mjs';

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const repoKey = repo => (repo.url ? normalizeRepoUrl(repo.url) : repo.path);

/** The element of the base already standing for this repository (properties.repo), or null. */
export function repoElement(base, inv) {
  if (!base) return null;
  const key = repoKey(inv.repo);
  return [...base.elements.values()].find(e => e.properties?.repo === key) ?? null;
}
