// Name matching for the merge: normalized alias keys and fuzzy similarity between element names.
export const FUZZY_THRESHOLD = 0.75;
// Below this, "same parent and same technology" is not enough to suspect a duplicate.
const SLOT_MIN_SIMILARITY = 0.4;

const GENERIC = new Set(['api', 'apis', 'service', 'servico', 'servicos', 'svc', 'app', 'aplicacao', 'sistema', 'system',
  'de', 'do', 'da', 'dos', 'das', 'e', 'the', 'of', 'and']);

/** Key for exact alias matching: no accents, lower case, punctuation collapsed to single spaces. */
export function aliasKey(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function nameTokens(s) {
  return aliasKey(s).split(' ').filter(t => t && !GENERIC.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity in [0, 1]: the better of token overlap (Jaccard) and edit distance over the significant tokens. */
export function similarity(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return aliasKey(a) && aliasKey(a) === aliasKey(b) ? 1 : 0;
  const sa = new Set(ta), sb = new Set(tb);
  const shared = [...sa].filter(t => sb.has(t)).length;
  const jaccard = shared / new Set([...sa, ...sb]).size;
  const ja = ta.join(' '), jb = tb.join(' ');
  const edit = 1 - levenshtein(ja, jb) / Math.max(ja.length, jb.length);
  return Math.round(Math.max(jaccard, edit) * 100) / 100;
}

/** Possible duplicates of `target` in `pool` (same ArchiMate type only), best first. */
export function findCandidates(target, pool) {
  if (!target.type) return [];
  const out = [];
  for (const c of pool) {
    if (c.id === target.id || c.type !== target.type) continue;
    const score = Math.max(0, ...target.names.flatMap(a => c.names.map(b => similarity(a, b))));
    const sameSlot = !!target.parent && target.parent === c.parent && !!target.technology && !!c.technology
      && aliasKey(target.technology) === aliasKey(c.technology) && score >= SLOT_MIN_SIMILARITY;
    if (score < FUZZY_THRESHOLD && !sameSlot) continue;
    const why = ['mesmo tipo', score >= FUZZY_THRESHOLD && 'nome parecido', sameSlot && 'mesmo pai e mesma tecnologia'].filter(Boolean).join('; ');
    out.push({ id: c.id, score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
