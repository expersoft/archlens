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

/** Appends the sources not yet present; migrates a legacy `source` string first. Returns how many were added. */
export function addSources(target, list) {
  if (!list.length) return 0;
  if (!Array.isArray(target.sources)) {
    const legacy = readSources(target);
    delete target.source;
    target.sources = [...legacy];
  }
  const seen = new Set(target.sources.map(sourceKey));
  let added = 0;
  for (const s of list) {
    const k = sourceKey(s);
    if (seen.has(k)) continue;
    target.sources.push({ ...s });
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
