// Incremental merge of a delta into the knowledge base. planMerge classifies and never decides;
// applyPlan replays the same merge with the user's answers. Pure: no file I/O.
import { createHash } from 'node:crypto';
import { resolveType, STATUSES } from './registry.mjs';
import { validateModel } from './validate.mjs';
import { aliasKey, findCandidates } from './match.mjs';
import { addSources, deltaSources } from './sources.mjs';
import { canonicalRel } from './model.mjs';
import { indexTree, orderDelta, attach, detach, descendantsOf } from './raw-tree.mjs';

export const PLAN_VERSION = '1.0';
const ELEMENT_FIELDS = ['type', 'name', 'description', 'technology', 'external', 'archimate', 'owner', 'url', 'status', 'statusReason'];
const REL_FIELDS = ['description', 'technology', 'accessType', 'status', 'statusReason'];
export const VIEW_REFS = ['scope', 'anchor'];
export const VIEW_LISTS = ['focus', 'expand', 'include'];
const RESOLUTION = {
  conflict: /^(keep|take|value:[\s\S]*)$/,
  'view-conflict': /^(keep|take)$/,
  'possible-duplicate': /^(same|different)$/,
  op: /^(yes|no)$/,
};

export function mergeError(code, message, extra = {}) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return Object.assign(err, extra);
}

export function hashRaw(raw) {
  return raw ? `sha256:${createHash('sha256').update(JSON.stringify(raw)).digest('hex')}` : 'none';
}

/** JSON with sorted keys (undefined dropped), so equality ignores key order. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const isoToday = () => new Date().toISOString().slice(0, 10);

/**
 * `answers` (Map or object, key → resolution) pre-fills questions answered in an earlier plan, so that
 * a possible duplicate answered "same" is planned (and its follow-up questions asked) as apply will see it.
 */
export function planMerge(baseRaw, delta, { base = 'ARCHITECTURE.md', today, answers } = {}) {
  checkDelta(delta);
  const earlier = answers instanceof Map ? answers : new Map(Object.entries(answers ?? {}));
  const ctx = runMerge(baseRaw, delta, { mode: 'plan', resolutions: earlier });
  const errors = [...ctx.errors, ...validateModel(ctx.raw).errors];
  const summary = {};
  for (const it of ctx.items) if (!it.when) summary[it.class] = (summary[it.class] ?? 0) + 1;
  return {
    'archlens-plan': PLAN_VERSION, base, baseHash: hashRaw(baseRaw), created: today ?? isoToday(), delta,
    items: ctx.items.map((it, i) => ({ n: i + 1, ...it })), summary, blocked: errors.length > 0, errors,
  };
}

export function applyPlan(baseRaw, plan, { today } = {}) {
  if (plan?.['archlens-plan'] !== PLAN_VERSION) throw mergeError('E_PLAN_SCHEMA', 'o arquivo não é um plano do archlens (gere com "archlens merge --plan")');
  if (hashRaw(baseRaw) !== plan.baseHash) throw mergeError('E_PLAN_STALE', 'a base mudou depois que o plano foi gerado; rode "archlens merge --plan" de novo');
  const resolutions = new Map(plan.items.filter(i => 'resolution' in i).map(i => [i.key, i.resolution]));
  const applies = it => {
    if (!it.when) return true;
    const at = it.when.lastIndexOf('=');
    return resolutions.get(it.when.slice(0, at)) === it.when.slice(at + 1);
  };
  const open = plan.items.filter(i => 'resolution' in i && applies(i));
  const pending = open.filter(i => i.resolution == null);
  if (pending.length) throw mergeError('E_PLAN_PENDING', `${pending.length} decisão(ões) sem resposta: item(ns) ${pending.map(i => i.n).join(', ')}`, { pending });
  const bad = open.filter(i => !RESOLUTION[resolutionKind(i)].test(String(i.resolution)));
  if (bad.length) throw mergeError('E_PLAN_RESOLUTION', `resposta inválida no(s) item(ns) ${bad.map(i => `${i.n} ("${i.resolution}")`).join(', ')}`);
  const date = today ?? isoToday();
  const ctx = runMerge(baseRaw, plan.delta, { mode: 'apply', resolutions });
  const errors = [...ctx.errors, ...validateModel(ctx.raw).errors];
  if (errors.length) throw mergeError('E_MERGE_INVALID', `o resultado do merge é inválido (${errors.length} erro(s)); nada foi gravado`, { errors });
  if (baseRaw && canonicalJson(ctx.raw) === canonicalJson(baseRaw)) return { raw: baseRaw, entry: null };
  const entry = changelogEntry(ctx, date);
  ctx.raw.changelog = [...(ctx.raw.changelog || []), entry];
  return { raw: ctx.raw, entry };
}

const resolutionKind = it => (it.class === 'conflict' && it.kind === 'view' ? 'view-conflict' : it.class);

function checkDelta(delta) {
  if (!delta || typeof delta !== 'object' || delta['archlens-delta'] !== '1.0') {
    throw mergeError('E_DELTA_SCHEMA', 'o delta precisa de "archlens-delta": "1.0" (veja references/merge.md)');
  }
  for (const [i, op] of (delta.ops || []).entries()) {
    if (!op || !op.op || !op.id) throw mergeError('E_DELTA_SCHEMA', `ops[${i}] precisa de "op" e "id"`);
  }
}

function emptyBase(delta) {
  return {
    archlens: '1.0', name: delta.name ?? 'Arquitetura', ...(delta.description ? { description: delta.description } : {}),
    model: { elements: [], relationships: [] }, views: [],
  };
}

function runMerge(baseRaw, delta, { mode, resolutions = new Map() }) {
  const raw = baseRaw ? structuredClone(baseRaw) : emptyBase(delta);
  raw.model.elements ??= [];
  raw.model.relationships ??= [];
  delta = structuredClone(delta); // never mutate (or share nested objects with) the caller's delta
  const ctx = {
    raw, delta, mode, resolutions, items: [], errors: [],
    tree: indexTree(raw), aliases: new Map(), idMap: new Map(), fresh: new Set(),
    log: { added: [], changed: new Set(), status: {}, removed: [], decisions: [] },
  };
  // Fuzzy pool frozen before any merge, so simulated answers in plan mode cannot change what apply sees.
  ctx.pool = [...ctx.tree].map(([, { el, parent }]) => describe(el, parent));
  for (const [id, { el }] of ctx.tree) for (const a of aliasesOf(el)) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), id);
  ctx.typeOf = id => {
    const el = ctx.tree.get(id)?.el;
    return el ? resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null : null;
  };
  mergeElements(ctx);
  mergeRelationships(ctx);
  mergeViews(ctx);
  mergeAssumptions(ctx);
  runOps(ctx);
  return ctx;
}

export const validResolution = (it, r) => r != null && RESOLUTION[resolutionKind(it)].test(String(r));

/**
 * Records a question. Plan mode answers with an earlier valid answer (pre-filled in the item) or the
 * simulated default (left pending); apply mode with the user's answer.
 */
function decide(ctx, item, simulated) {
  const r = ctx.resolutions.get(item.key);
  if (ctx.mode === 'plan') {
    const earlier = validResolution(item, r) ? r : null;
    ctx.items.push({ ...item, resolution: earlier });
    return earlier ?? simulated;
  }
  ctx.items.push({ ...item, resolution: null });
  if (r == null) {
    throw mergeError('E_PLAN_REPLAN', `a decisão "${item.key}" não está no plano (uma resposta, como "same" numa possível duplicata, abriu perguntas novas); gere o plano de novo reaproveitando as respostas: archlens merge <base.md> <delta.json> --plan <novo.json> --answers <plano.json>`);
  }
  return r;
}

function note(ctx, item) {
  ctx.items.push(item);
}

/** Delta reference → canonical base id (delta id already merged, base id, or base alias). */
function resolveRef(ctx, ref) {
  if (ref == null) return ref;
  if (ctx.idMap.has(ref)) return ctx.idMap.get(ref);
  if (ctx.tree.has(ref)) return ref;
  return ctx.aliases.get(aliasKey(ref)) ?? ref;
}

const describe = (el, parent) => ({
  id: el.id, names: [el.name ?? el.id, ...aliasesOf(el)], parent: parent ?? null, technology: el.technology,
  type: resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null,
});

function findMatch(ctx, el, parentId) {
  if (ctx.tree.has(el.id)) return { id: el.id };
  for (const k of [el.id, el.name, ...aliasesOf(el)]) {
    const id = k == null ? null : ctx.aliases.get(aliasKey(k));
    if (id) return { id };
  }
  for (const a of aliasesOf(el)) if (ctx.tree.has(a)) return { id: a };
  const pool = ctx.pool.filter(p => !ctx.fresh.has(p.id));
  const [best] = findCandidates(describe(el, parentId), pool);
  return best ? { candidate: best } : {};
}

function mergeElements(ctx) {
  for (const { el, parent } of orderDelta(ctx.delta.model?.elements)) {
    const parentId = parent == null ? null : resolveRef(ctx, parent);
    const match = findMatch(ctx, el, parentId);
    if (match.id) {
      ctx.idMap.set(el.id, match.id);
      mergeElementInto(ctx, match.id, el, parentId);
      continue;
    }
    if (match.candidate) {
      const c = match.candidate;
      const key = `dup:${el.id}`;
      const res = decide(ctx, { key, class: 'possible-duplicate', kind: 'element', target: el.id, candidate: c.id, score: c.score, why: c.why }, 'different');
      // Unanswered: show what "same" would ask, as conditional questions. Answered: plan it for real.
      if (ctx.mode === 'plan' && !ctx.items.at(-1).resolution) mergeElementInto(ctx, c.id, el, parentId, { dry: true, when: `${key}=same` });
      if (res === 'same') {
        ctx.idMap.set(el.id, c.id);
        ctx.log.decisions.push(`duplicata: ${el.id} = ${c.id}`);
        // The delta's id and name become aliases, so the same delta matches directly next time.
        mergeElementInto(ctx, c.id, el, parentId, { aliases: [el.id, el.name] });
        continue;
      }
      if (ctx.mode === 'apply') ctx.log.decisions.push(`duplicata descartada: ${el.id} ≠ ${c.id}`);
    }
    insertElement(ctx, el, parentId);
  }
}

const normType = t => String(t).replace(/^archimate:/, '');

function sameValue(field, a, b) {
  if (field === 'name') return aliasKey(a) === aliasKey(b);
  if (field === 'type') return normType(a) === normType(b);
  return canonicalJson(a) === canonicalJson(b);
}

function parseValue(text, like) {
  if (typeof like === 'boolean') return text === 'true';
  if (typeof like === 'number') return Number(text);
  return text;
}

/** [field, baseValue, deltaValue, apply] for the named fields plus every property the delta sets. */
function fieldsOf(target, incoming, names) {
  return [
    ...names.map(f => [f, target[f] ?? (f === 'status' ? 'active' : undefined), incoming[f], v => { target[f] = v; }]),
    ...Object.entries(incoming.properties || {}).map(([k, v]) => [`properties.${k}`, target.properties?.[k], v, x => { (target.properties ??= {})[k] = x; }]),
  ];
}

/** Field by field: empty in the base → fill; different → conflict question. Returns { filled, changed }. */
function reconcile(ctx, { fields, keyPrefix, kind, target, dry = false, when }) {
  let filled = false;
  let changed = false;
  for (const [field, bv, dv, apply] of fields) {
    if (dv === undefined || sameValue(field, bv, dv)) continue;
    if (bv === undefined || bv === '') {
      if (!dry) { apply(dv); filled = true; }
      continue;
    }
    const item = { key: `${keyPrefix}:${field}`, class: 'conflict', kind, target, field, base: bv, delta: dv, ...(when ? { when } : {}) };
    if (dry) {
      const r = ctx.mode === 'plan' ? ctx.resolutions.get(item.key) : null;
      ctx.items.push({ ...item, resolution: validResolution(item, r) ? r : null });
      continue;
    }
    const res = decide(ctx, item, 'take');
    if (res === 'keep') {
      // A kept name is still a name people use for the element: keep it as an alias (asked once).
      if (kind === 'element' && field === 'name' && addAliases(ctx, target, [dv])) changed = true;
      continue;
    }
    apply(res === 'take' ? dv : parseValue(res.slice('value:'.length), dv));
    changed = true;
    ctx.log.decisions.push(`conflito ${target}.${field}: ${res === 'take' ? `take ${JSON.stringify(dv)}` : res}`);
  }
  return { filled, changed };
}

function addList(target, key, list = []) {
  const cur = target[key] ?? [];
  const extra = list.filter(x => !cur.includes(x));
  if (!extra.length) return false;
  target[key] = [...cur, ...extra];
  return true;
}

/** A malformed (non-list) "aliases" is ignored here and reported by validation, which blocks the plan. */
const aliasesOf = el => (Array.isArray(el.aliases) ? el.aliases : []);

function addAliases(ctx, id, list) {
  const target = ctx.tree.get(id).el;
  if (target.aliases !== undefined && !Array.isArray(target.aliases)) return false;
  const known = new Set([aliasKey(id), ...(target.name != null ? [aliasKey(target.name)] : []), ...aliasesOf(target).map(aliasKey)]);
  const extra = [];
  for (const a of list) {
    if (a == null || known.has(aliasKey(a))) continue;
    known.add(aliasKey(a));
    extra.push(a);
  }
  if (!extra.length) return false;
  target.aliases = [...aliasesOf(target), ...extra];
  for (const a of extra) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), id);
  return true;
}

function moveElement(ctx, baseId, newParent) {
  if (newParent === baseId || descendantsOf(ctx.tree, baseId).includes(newParent)) {
    ctx.errors.push({
      code: 'E_PARENT_CYCLE', path: 'model.elements',
      message: `mover "${baseId}" para dentro de "${newParent}" criaria um ciclo: o pai novo é o próprio elemento ou um descendente dele`,
      hint: 'corrija o "parent" no delta ou responda "keep" para manter o pai atual',
    });
    return;
  }
  detach(ctx.tree, baseId);
  attach(ctx.raw, ctx.tree, ctx.tree.get(baseId).el, newParent);
}

function mergeElementInto(ctx, baseId, el, parentId, { dry = false, when, aliases = [] } = {}) {
  const entry = ctx.tree.get(baseId);
  const target = entry.el;
  // A delta name that is already an alias of the element is not a conflict (the user answered it before).
  const knownName = el.name != null && aliasesOf(target).some(a => aliasKey(a) === aliasKey(el.name));
  const fields = fieldsOf(target, el, ELEMENT_FIELDS).filter(([f]) => !(f === 'name' && knownName));
  if (parentId != null && parentId !== entry.parent) {
    fields.push(['parent', entry.parent ?? undefined, parentId, v => moveElement(ctx, baseId, resolveRef(ctx, v))]);
  }
  const { filled, changed } = reconcile(ctx, { fields, keyPrefix: `el:${el.id}`, kind: 'element', target: baseId, dry, when });
  if (dry) return;
  let more = addList(target, 'tags', el.tags);
  more = addAliases(ctx, baseId, [...aliasesOf(el), ...aliases]) || more;
  if (el.inferred === false && target.inferred) {
    delete target.inferred;
    delete target.confidence;
    more = true;
  }
  addSources(target, deltaSources(el, ctx.delta.source));
  if (filled || changed || more) ctx.log.changed.add(baseId);
  note(ctx, { key: `el:${el.id}`, class: filled || changed || more ? 'enrich' : 'unchanged', kind: 'element', target: baseId, ...(el.id !== baseId ? { from: el.id } : {}) });
}

function insertElement(ctx, el, parentId) {
  const { source, sources, parent, ...rest } = el;
  const node = structuredClone(rest);
  const srcs = deltaSources(el, ctx.delta.source);
  if (srcs.length) node.sources = srcs;
  attach(ctx.raw, ctx.tree, node, parentId);
  ctx.fresh.add(node.id);
  ctx.idMap.set(el.id, node.id);
  for (const a of aliasesOf(node)) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), node.id);
  ctx.log.added.push(node.id);
  note(ctx, { key: `el:${el.id}`, class: 'new', kind: 'element', target: node.id, type: el.type, name: el.name ?? el.id, parent: parentId });
}

function relKey(ctx, r) {
  const c = canonicalRel(r, ctx.typeOf);
  return c.error ? null : `${c.from}|${c.type}|${c.to}`;
}

/** Generated id of a raw relationship (before de-duplication): explicit id, or from-type-to after reading `uses`. */
export function relId(ctx, r) {
  if (r.id) return r.id;
  const c = canonicalRel(r, ctx.typeOf);
  return c.error ? `${r.from}-${r.type}-${r.to}` : `${c.from}-${c.type}-${c.to}`;
}

/**
 * raw relationship → id, exactly as normalizeModel names it: walking the list in order, repeated ids get
 * "#2", "#3"…; relationships normalizeModel would skip (bad ends or type) keep their generated id.
 */
export function relIds(ctx) {
  const ids = new Map();
  const seen = new Map();
  for (const r of ctx.raw.model.relationships) {
    if (!r || typeof r !== 'object') continue;
    const valid = r.from && r.to && ctx.tree.has(r.from) && ctx.tree.has(r.to) && !canonicalRel(r, ctx.typeOf).error;
    let id = relId(ctx, r);
    if (valid) {
      if (seen.has(id)) { seen.set(id, seen.get(id) + 1); id = `${id}#${seen.get(id)}`; } else seen.set(id, 1);
    }
    ids.set(r, id);
  }
  return ids;
}

function mergeRelationships(ctx) {
  const byKey = new Map();
  const byId = new Map();
  const ids = relIds(ctx);
  for (const [r, id] of ids) {
    const k = relKey(ctx, r);
    if (k && !byKey.has(k)) byKey.set(k, r);
    byId.set(id, r);
  }
  (ctx.delta.model?.relationships || []).forEach((dr, i) => {
    const r = { ...dr, from: resolveRef(ctx, dr.from), to: resolveRef(ctx, dr.to) };
    const k = relKey(ctx, r);
    const base = (r.id && byId.get(r.id)) || (k && byKey.get(k));
    if (base) { mergeRelInto(ctx, base, ids.get(base), r, i); return; }
    const { source, sources, ...rest } = r;
    const generated = relId(ctx, { ...r, id: undefined });
    let id = r.id ?? generated;
    for (let n = 2; byId.has(id); n++) id = `${generated}#${n}`;
    const node = structuredClone({ ...rest, id });
    const srcs = deltaSources(dr, ctx.delta.source);
    if (srcs.length) node.sources = srcs;
    ctx.raw.model.relationships.push(node);
    byId.set(id, node);
    ids.set(node, id);
    if (k) byKey.set(k, node);
    ctx.log.added.push(id);
    note(ctx, { key: `rel:${i}`, class: 'new', kind: 'relationship', target: id, from: r.from, to: r.to, type: r.type ?? 'uses' });
  });
}

function mergeRelInto(ctx, base, id, r, i) {
  const { filled, changed } = reconcile(ctx, { fields: fieldsOf(base, r, REL_FIELDS), keyPrefix: `rel:${i}`, kind: 'relationship', target: id });
  let more = addList(base, 'tags', r.tags);
  if (r.inferred === false && base.inferred) { delete base.inferred; more = true; }
  addSources(base, deltaSources(r, ctx.delta.source));
  if (filled || changed || more) ctx.log.changed.add(id);
  note(ctx, { key: `rel:${i}`, class: filled || changed || more ? 'enrich' : 'unchanged', kind: 'relationship', target: id });
}

function rewriteView(ctx, view) {
  const v = structuredClone(view);
  for (const f of VIEW_REFS) if (v[f]) v[f] = resolveRef(ctx, v[f]);
  for (const f of VIEW_LISTS) if (Array.isArray(v[f])) v[f] = v[f].map(x => resolveRef(ctx, x));
  if (Array.isArray(v.steps)) {
    v.steps = v.steps.map(s => ({ ...s, ...(s.from ? { from: resolveRef(ctx, s.from) } : {}), ...(s.to ? { to: resolveRef(ctx, s.to) } : {}) }));
  }
  return v;
}

function mergeViews(ctx) {
  if (!ctx.delta.views?.length) return;
  ctx.raw.views ??= [];
  for (const dv of ctx.delta.views) {
    const v = rewriteView(ctx, dv);
    const key = `view:${v.key}`;
    const i = ctx.raw.views.findIndex(x => x.key === v.key);
    if (i < 0) {
      ctx.raw.views.push(v);
      ctx.log.added.push(key);
      note(ctx, { key, class: 'new', kind: 'view', target: v.key });
      continue;
    }
    if (canonicalJson(ctx.raw.views[i]) === canonicalJson(v)) {
      note(ctx, { key, class: 'unchanged', kind: 'view', target: v.key });
      continue;
    }
    const res = decide(ctx, { key, class: 'conflict', kind: 'view', target: v.key, base: ctx.raw.views[i], delta: v }, 'take');
    if (res !== 'take') continue;
    ctx.raw.views[i] = v;
    ctx.log.changed.add(key);
    ctx.log.decisions.push(`visão ${v.key}: take`);
  }
}

function mergeAssumptions(ctx) {
  const current = ctx.raw.assumptions || [];
  const extra = [...new Set(ctx.delta.assumptions || [])].filter(a => !current.includes(a));
  if (!extra.length) return;
  ctx.raw.assumptions = [...current, ...extra];
  note(ctx, { key: 'assumptions', class: 'new', kind: 'assumption', target: `${extra.length} premissa(s)`, added: extra });
}

function findRelationship(ctx, id) {
  for (const [r, rid] of relIds(ctx)) if (rid === id) return r;
  return null;
}

function runOps(ctx) {
  (ctx.delta.ops || []).forEach((op, i) => {
    const key = `op:${i}`;
    const opError = (code, message, hint) => {
      ctx.errors.push({ code, message: `ops[${i}] (${op.op}): ${message}`, path: `ops[${i}]`, hint });
      note(ctx, { key, class: 'op', op: op.op, target: op.id, error: code });
    };
    const elId = resolveRef(ctx, op.id);
    const el = ctx.tree.get(elId)?.el ?? null;
    const rel = el ? null : findRelationship(ctx, op.id);
    if (!el && !rel) return opError('E_UNKNOWN_REF', `"${op.id}" não existe`, 'use o id (ou alias) de um elemento, ou o id de uma relação');
    const id = el ? elId : relIds(ctx).get(rel);
    const target = el ?? rel;
    switch (op.op) {
      case 'rename': {
        if (!el) return opError('E_OP', 'rename só vale para elementos', 'para relações, mude "description" pelo delta');
        if (!op.name || op.name === target.name) return note(ctx, { key, class: 'op', op: 'rename', target: id, noop: true });
        const old = target.name;
        target.name = op.name;
        if (old) addAliases(ctx, id, [old]);
        ctx.log.changed.add(id);
        return note(ctx, { key, class: 'op', op: 'rename', target: id, from: old ?? id, to: op.name });
      }
      case 'alias': {
        if (!el) return opError('E_OP', 'alias só vale para elementos', 'relações são casadas por origem, tipo e destino');
        if (addAliases(ctx, id, op.add || [])) ctx.log.changed.add(id);
        return note(ctx, { key, class: 'op', op: 'alias', target: id, add: op.add || [] });
      }
      case 'status': {
        if (!STATUSES.includes(op.status)) return opError('E_STATUS', `status "${op.status}" inválido`, `use ${STATUSES.join(' | ')}`);
        const from = target.status ?? 'active';
        if (from === op.status) return note(ctx, { key, class: 'op', op: 'status', target: id, status: op.status, noop: true });
        const item = { key, class: 'op', op: 'status', target: id, from, status: op.status, ...(op.reason ? { reason: op.reason } : {}) };
        if (op.status === 'retired') {
          if (decide(ctx, item, 'yes') !== 'yes') { ctx.log.decisions.push(`status ${id} → retired: recusado`); return undefined; }
        } else note(ctx, item);
        target.status = op.status;
        if (op.reason) target.statusReason = op.reason;
        addSources(target, ctx.delta.source ? [ctx.delta.source] : []);
        ctx.log.status[id] = op.status;
        return undefined;
      }
      case 'remove': {
        const { cascade, rels } = el ? removalCascade(ctx, id) : { cascade: { elements: [], relationships: [id], views: [] }, rels: [rel] };
        if (decide(ctx, { key, class: 'op', op: 'remove', target: id, cascade }, 'yes') !== 'yes') {
          ctx.log.decisions.push(`remover ${id}: recusado`);
          return undefined;
        }
        applyRemoval(ctx, cascade, rels);
        ctx.log.removed.push(...(el ? cascade.elements : [id]));
        return undefined;
      }
      default:
        return opError('E_OP', `operação desconhecida "${op.op}"`, 'use rename | alias | status | remove');
    }
  });
}

/** What removing element `id` takes with it: the plan's cascade (ids) and the raw relationships to drop. */
function removalCascade(ctx, id) {
  const gone = new Set([id, ...descendantsOf(ctx.tree, id)]);
  const ids = relIds(ctx);
  const rels = ctx.raw.model.relationships.filter(r => gone.has(r?.from) || gone.has(r?.to));
  const views = [];
  for (const v of ctx.raw.views || []) {
    if (VIEW_REFS.some(f => gone.has(v[f]))) views.push({ key: v.key, action: 'remove' });
    else if (VIEW_LISTS.some(f => (v[f] || []).some(x => gone.has(x))) || (v.steps || []).some(s => gone.has(s.from) || gone.has(s.to))) {
      views.push({ key: v.key, action: 'trim' });
    }
  }
  return { cascade: { elements: [...gone], relationships: rels.map(r => ids.get(r)), views }, rels };
}

function applyRemoval(ctx, cascade, rels) {
  const gone = new Set(cascade.elements);
  // By object: parallel relationships may share from/type/to, so ids alone would not tell them apart.
  const drop = new Set(rels);
  ctx.raw.model.relationships = ctx.raw.model.relationships.filter(r => !drop.has(r));
  for (const id of cascade.elements) if (ctx.tree.has(id)) detach(ctx.tree, id);
  for (const id of cascade.elements) ctx.tree.delete(id);
  for (const [k, id] of ctx.aliases) if (gone.has(id)) ctx.aliases.delete(k);
  ctx.pool = ctx.pool.filter(p => !gone.has(p.id));
  const action = new Map(cascade.views.map(v => [v.key, v.action]));
  if (!action.size) return;
  ctx.raw.views = ctx.raw.views.filter(v => action.get(v.key) !== 'remove').map(v => {
    if (action.get(v.key) !== 'trim') return v;
    const t = { ...v };
    for (const f of VIEW_LISTS) if (Array.isArray(t[f])) t[f] = t[f].filter(x => !gone.has(x));
    if (Array.isArray(t.steps)) t.steps = t.steps.filter(s => !gone.has(s.from) && !gone.has(s.to));
    return t;
  });
}

function changelogEntry(ctx, date) {
  const seq = (ctx.raw.changelog || []).filter(e => e.date === date).length + 1;
  const { added, changed, status, removed, decisions } = ctx.log;
  return {
    id: `${date}-${String(seq).padStart(2, '0')}`, date,
    ...(ctx.delta.source ? { source: ctx.delta.source } : {}),
    summary: ctx.delta.summary ?? `+${added.length} ~${changed.size} −${removed.length}`,
    added, changed: [...changed].filter(id => !added.includes(id)), status, removed, decisions,
  };
}
