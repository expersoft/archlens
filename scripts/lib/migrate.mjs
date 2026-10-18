// 1.x → 2.0: translate with toCanonical, check that the 2.0 model means what the 1.x reader read (elements, kinds,
// parents, groups, relationships), rewrite relationship ids that changed in saved views and record the round. Pure.
import { toCanonical, isEngineRealization, FORMAT } from './canonical.mjs';
import { normalizeLegacy, legacyKindOf } from './canonical-legacy.mjs';
import { normalizeModel } from './model.mjs';
import { validateModel } from './validate.mjs';
import { canonicalJson } from './merge.mjs';

export function migrateRaw(raw, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const legacy = normalizeLegacy(raw);
  const legacyErrors = legacy.issues.filter(i => i.level === 'error').map(({ level, ...i }) => i);
  if (legacyErrors.length) return { raw: null, report: null, idMap: new Map(), errors: legacyErrors, diffs: [] };
  const { raw: v2, report, databases } = toCanonical(raw);
  const model = normalizeModel(v2);
  const { diffs, idMap } = equivalence(legacy, model, databases);
  for (const v of v2.views ?? []) {
    if (Array.isArray(v.steps)) v.steps = v.steps.map(s => (s.rel && idMap.get(s.rel) && idMap.get(s.rel) !== s.rel ? { ...s, rel: idMap.get(s.rel) } : s));
  }
  const seq = (v2.changelog ?? []).filter(e => e.date === today).length + 1;
  v2.changelog = [...(v2.changelog ?? []), {
    id: `${today}-${String(seq).padStart(2, '0')}`, date: today, summary: `migração para o formato ${FORMAT}`,
    added: [], changed: [], status: {}, removed: [], decisions: reportLines(report),
  }];
  const errors = validateModel(v2).errors;
  return { raw: errors.length || diffs.length ? null : v2, report, idMap, errors, diffs };
}

export function reportLines(r) {
  return [
    `${r.types} tipo(s) reescrito(s) para ArchiMate`,
    `${r.uses} relação(ões) "uses" convertida(s) para serving/access`,
    `${r.databases} banco(s) de dados: data-object → application-component (container)`,
    `${r.kinds} kind(s) C4 inferido(s) pela hierarquia`,
  ];
}

/** Differences between the 1.x reading and the 2.0 model, and 1.x relationship id → 2.0 id. */
function equivalence(legacy, model, databases) {
  const diffs = [];
  for (const [id, a] of legacy.elements) {
    const b = model.elements.get(id);
    if (!b) { diffs.push(`elemento ${id} sumiu`); continue; }
    const type = databases.has(id) && a.type === 'data-object' ? 'application-component' : a.type;
    const pairs = [['type', type, b.type], ['c4', legacyKindOf(legacy, a), b.c4?.kind ?? null], ['parent', a.parent, b.parent],
      ['group', a.groupId, b.groupId], ['status', a.status, b.status], ['properties', a.properties, b.properties]];
    for (const [f, x, y] of pairs) if (canonicalJson(x ?? null) !== canonicalJson(y ?? null)) diffs.push(`${id}.${f}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
  }
  for (const id of model.elements.keys()) if (!legacy.elements.has(id)) diffs.push(`elemento ${id} apareceu`);
  // 1.x accesses to a database are 2.0 servings from it, engines realizing it serve it; the rest keeps from/type/to.
  const key = r => `${r.from}|${r.type}|${r.to}`;
  const types = new Map([...legacy.elements].map(([id, e]) => [id, e.type]));
  const expected = legacy.relationships.map(r => {
    if (r.type === 'access' && databases.has(r.to)) return { id: r.id, from: r.to, type: 'serving', to: r.from };
    if (isEngineRealization(r, types, databases)) return { id: r.id, from: r.from, type: 'serving', to: r.to };
    return r;
  });
  const group = list => { const m = new Map(); for (const r of list) m.set(key(r), [...(m.get(key(r)) ?? []), r.id]); return m; };
  const before = group(expected), after = group(model.relationships);
  const idMap = new Map();
  for (const [k, ids] of before) {
    const now = after.get(k) ?? [];
    if (now.length !== ids.length) diffs.push(`relação ${k}: ${ids.length} antes, ${now.length} depois`);
    ids.forEach((id, i) => { if (now[i]) idMap.set(id, now[i]); });
  }
  for (const [k, ids] of after) if (!before.has(k)) diffs.push(`relação ${k} apareceu (${ids.join(', ')})`);
  return { diffs, idMap };
}
