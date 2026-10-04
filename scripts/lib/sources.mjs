// Provenance: where each fact of the knowledge base came from (prompt round, repository, document, manual edit).
export const SOURCE_KINDS = ['prompt', 'repo', 'doc', 'manual'];

/** Identity of a source inside one item's list; the excerpt only distinguishes sources without ref/path. */
export function sourceKey(s) {
  return s.ref || s.path ? `${s.kind}|${s.ref ?? ''}|${s.path ?? ''}${s.line != null ? `|${s.line}` : ''}` : `${s.kind}|~${s.excerpt ?? ''}`;
}

/** Sources declared on a raw element/relationship, accepting the legacy `source: "<excerpt>"`. */
export function readSources(item) {
  if (Array.isArray(item.sources)) return item.sources;
  if (typeof item.source === 'string' && item.source) return [{ kind: 'prompt', excerpt: item.source }];
  return [];
}

/** Sources a delta item brings: its own, or the delta's source (keeping a legacy excerpt as `excerpt`). */
export function deltaSources(item, deltaSource) {
  if (Array.isArray(item.sources)) return item.sources.map(s => ({ ...s }));
  if (typeof item.source === 'string' && item.source) return [{ ...(deltaSource ?? { kind: 'prompt' }), excerpt: item.source }];
  return deltaSource ? [{ ...deltaSource }] : [];
}

/** Repository of a repo source: its ref without the trailing "@<commit>" (null for other kinds). */
export const repoOfSource = s => (s?.kind === 'repo' && typeof s.ref === 'string' && s.ref.includes('@') ? s.ref.slice(0, s.ref.lastIndexOf('@')) : null);

/**
 * Appends the sources not yet present; migrates a legacy `source` string first. Returns how many were added.
 * Provenance follows the latest reading: incoming repo sources replace the target's sources of the same repository
 * (unchanged ones stay in place), except those added earlier in the same merge (`fresh`, a WeakSet it fills).
 */
export function addSources(target, list, fresh = null) {
  if (!list.length) return 0;
  if (!Array.isArray(target.sources)) {
    const legacy = readSources(target);
    delete target.source;
    target.sources = [...legacy];
  }
  const repos = new Set(list.map(repoOfSource).filter(Boolean));
  if (repos.size) {
    const incoming = new Set(list.map(sourceKey));
    target.sources = target.sources.filter(s => fresh?.has(s) || !repos.has(repoOfSource(s)) || incoming.has(sourceKey(s)));
  }
  const seen = new Set(target.sources.map(sourceKey));
  let added = 0;
  for (const s of list) {
    const k = sourceKey(s);
    if (seen.has(k)) continue;
    const copy = { ...s };
    target.sources.push(copy);
    fresh?.add(copy);
    seen.add(k);
    added++;
  }
  return added;
}

/** null when the source is well-formed, otherwise a hint for E_SOURCE. */
export function sourceProblem(s) {
  if (!s || typeof s !== 'object') return 'cada fonte é um objeto { kind, ref?, path?, excerpt?, date? }';
  if (!SOURCE_KINDS.includes(s.kind)) return `kind deve ser ${SOURCE_KINDS.join(' | ')}`;
  if (!s.ref && !s.excerpt) return 'informe ref (repo, documento, rodada) ou excerpt (trecho que justifica o item)';
  return null;
}
