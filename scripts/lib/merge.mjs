// Incremental merge of a delta into the knowledge base. planMerge classifies and never decides;
// applyPlan replays the same merge with the user's answers. Pure: no file I/O.
import { createHash } from 'node:crypto';
import { resolveType } from './registry.mjs';
import { validateModel } from './validate.mjs';
import { aliasKey, findCandidates } from './match.mjs';
import { addSources, deltaSources } from './sources.mjs';
import { indexTree, orderDelta, attach, detach, descendantsOf } from './raw-tree.mjs';

export const PLAN_VERSION = '1.0';
const ELEMENT_FIELDS = ['type', 'name', 'description', 'technology', 'external', 'archimate', 'owner', 'url', 'status', 'statusReason'];
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

export function planMerge(baseRaw, delta, { base = 'ARCHITECTURE.md', today } = {}) {
  checkDelta(delta);
  const ctx = runMerge(baseRaw, delta, { mode: 'plan' });
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
  for (const [id, { el }] of ctx.tree) for (const a of el.aliases || []) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), id);
  ctx.typeOf = id => {
    const el = ctx.tree.get(id)?.el;
    return el ? resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null : null;
  };
  mergeElements(ctx);
  return ctx;
}

/** Records a question. Plan mode answers with the simulated default; apply mode with the user's answer. */
function decide(ctx, item, simulated) {
  ctx.items.push({ ...item, resolution: null });
  if (ctx.mode === 'plan') return simulated;
  const r = ctx.resolutions.get(item.key);
  if (r == null) throw mergeError('E_PLAN_REPLAN', `a decisão "${item.key}" não está no plano; rode "archlens merge --plan" de novo`);
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
  id: el.id, names: [el.name ?? el.id, ...(el.aliases || [])], parent: parent ?? null, technology: el.technology,
  type: resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null,
});

function findMatch(ctx, el, parentId) {
  if (ctx.tree.has(el.id)) return { id: el.id };
  for (const k of [el.id, el.name, ...(el.aliases || [])]) {
    const id = k == null ? null : ctx.aliases.get(aliasKey(k));
    if (id) return { id };
  }
  for (const a of el.aliases || []) if (ctx.tree.has(a)) return { id: a };
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
      if (ctx.mode === 'plan') mergeElementInto(ctx, c.id, el, parentId, { dry: true, when: `${key}=same` });
      if (res === 'same') {
        ctx.idMap.set(el.id, c.id);
        addAliases(ctx, c.id, [el.id]);
        ctx.log.decisions.push(`duplicata: ${el.id} = ${c.id}`);
        mergeElementInto(ctx, c.id, el, parentId);
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
    if (dry) { ctx.items.push({ ...item, resolution: null }); continue; }
    const res = decide(ctx, item, 'take');
    if (res === 'keep') continue;
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

function addAliases(ctx, id, list) {
  const target = ctx.tree.get(id).el;
  const known = new Set([aliasKey(id), ...(target.aliases || []).map(aliasKey)]);
  const extra = [];
  for (const a of list) {
    if (a == null || known.has(aliasKey(a))) continue;
    known.add(aliasKey(a));
    extra.push(a);
  }
  if (!extra.length) return false;
  target.aliases = [...(target.aliases || []), ...extra];
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

function mergeElementInto(ctx, baseId, el, parentId, { dry = false, when } = {}) {
  const entry = ctx.tree.get(baseId);
  const target = entry.el;
  const fields = fieldsOf(target, el, ELEMENT_FIELDS);
  if (parentId != null && parentId !== entry.parent) {
    fields.push(['parent', entry.parent ?? undefined, parentId, v => moveElement(ctx, baseId, resolveRef(ctx, v))]);
  }
  const { filled, changed } = reconcile(ctx, { fields, keyPrefix: `el:${el.id}`, kind: 'element', target: baseId, dry, when });
  if (dry) return;
  let more = addList(target, 'tags', el.tags);
  more = addAliases(ctx, baseId, el.aliases || []) || more;
  if (el.inferred === false && target.inferred) {
    delete target.inferred;
    delete target.confidence;
    more = true;
  }
  addSources(target, deltaSources(el, ctx.delta.source));
  if (filled || changed || more) ctx.log.changed.add(baseId);
  note(ctx, { key: `el:${el.id}`, class: filled || more ? 'enrich' : 'unchanged', kind: 'element', target: baseId, ...(el.id !== baseId ? { from: el.id } : {}) });
}

function insertElement(ctx, el, parentId) {
  const { source, sources, parent, ...rest } = el;
  const node = structuredClone(rest);
  const srcs = deltaSources(el, ctx.delta.source);
  if (srcs.length) node.sources = srcs;
  attach(ctx.raw, ctx.tree, node, parentId);
  ctx.fresh.add(node.id);
  ctx.idMap.set(el.id, node.id);
  for (const a of node.aliases || []) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), node.id);
  ctx.log.added.push(node.id);
  note(ctx, { key: `el:${el.id}`, class: 'new', kind: 'element', target: node.id, type: el.type, name: el.name ?? el.id, parent: parentId });
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
