// What the user edits on screen in Planejar: a layer of the draft apart from the agent's delta (a set_delta never
// erases it). The plan is made from the agent's delta with these edits on top; an edit answers its own question.
//
// Edits = { [id]: { properties?: { [k]: string | number | boolean | string[] | null }, doc?: string } }
//   (a null property removes the key from the base node)
// Kept  = { id, field, value }[]: "keep mine" answers to a chat proposal (`field` is `properties.<k>` or `doc`,
//   `value` the chat's proposed value); a different proposal opens a new conflict.

const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const editError = message => Object.assign(new Error(message), { code: 'E_GUI_DRAFT' });
const PROP = 'properties.';

const isValue = v => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
  || (Array.isArray(v) && v.every(x => typeof x === 'string'));
const isField = f => typeof f === 'string' && (f === 'doc' || (f.startsWith(PROP) && f.slice(PROP.length).trim() !== ''));
/** Keys a plain object reads from its prototype: refused, the core would drop them or answer the inherited value. */
export const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'];

function checkProperties(id, props) {
  if (!isObject(props)) throw editError(`as propriedades editadas de "${id}" são inválidas`);
  for (const [k, v] of Object.entries(props)) {
    if (!k.trim()) throw editError(`chave de propriedade vazia nas edições de "${id}"`);
    if (RESERVED_KEYS.includes(k.trim())) throw editError(`a chave "${k}" é reservada; use outro nome de propriedade em "${id}"`);
    if (!isValue(v)) throw editError(`valor inválido na propriedade "${k}" de "${id}"`);
  }
}

/** Validates the screen layer read from a draft (absent → empty); throws E_GUI_DRAFT. */
export function checkEdits(edits, kept) {
  const e = edits ?? {};
  if (!isObject(e)) throw editError('as edições da tela do rascunho são inválidas');
  for (const [id, entry] of Object.entries(e)) {
    if (!id.trim() || !isObject(entry)) throw editError('as edições da tela do rascunho são inválidas');
    const extra = Object.keys(entry).filter(k => k !== 'properties' && k !== 'doc');
    if (extra.length) throw editError(`campos desconhecidos nas edições de "${id}": ${extra.join(', ')}`);
    if (hasOwn(entry, 'properties')) checkProperties(id, entry.properties);
    if (hasOwn(entry, 'doc') && typeof entry.doc !== 'string') throw editError(`a documentação editada de "${id}" precisa ser texto`);
  }
  const k = kept ?? [];
  if (!Array.isArray(k) || !k.every(x => isObject(x) && typeof x.id === 'string' && isField(x.field) && hasOwn(x, 'value'))) {
    throw editError('as respostas de conflito do rascunho são inválidas');
  }
  return { edits: e, kept: k };
}

/** The element `id` of a delta, at the top of `model.elements` or nested in `children` (the delta allows both). */
export function findDeltaElement(delta, id) {
  const walk = list => {
    if (!Array.isArray(list)) return undefined;
    for (const e of list) {
      if (e?.id === id) return e;
      const found = walk(e?.children);
      if (found) return found;
    }
    return undefined;
  };
  return walk(delta?.model?.elements);
}

/** The agent's delta with the screen edits on top; edits for `removedIds` are dropped. No edits → `delta` itself. */
export function composeDelta(delta, edits, removedIds = new Set()) {
  const live = Object.entries(edits ?? {}).filter(([id]) => !removedIds.has(id));
  if (!live.length) return delta;
  const out = delta ? structuredClone(delta)
    : { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'gui' }, summary: 'Edições feitas na tela' };
  for (const [id, e] of live) {
    if (e.properties && Object.keys(e.properties).length) {
      out.model ??= {};
      out.model.elements ??= [];
      const el = findDeltaElement(out, id);
      if (el) el.properties = { ...(el.properties ?? {}), ...e.properties };
      else out.model.elements.push({ id, properties: { ...e.properties } });
    }
    if (typeof e.doc === 'string') {
      out.docs ??= [];
      const d = out.docs.find(x => x?.id === id);
      if (d) d.text = e.doc; else out.docs.push({ id, text: e.doc });
    }
  }
  return out;
}

const agentElement = findDeltaElement;
const agentDoc = (delta, id) => delta?.docs?.find(x => x?.id === id);
const isKept = (kept, id, field, value) => kept.some(k => k.id === id && k.field === field && same(k.value, value));

/** Where the agent proposes, for an edited node and field, a value other than the edited one and not kept yet. */
export function screenConflicts(delta, edits, kept = []) {
  const out = [];
  if (!delta) return out;
  for (const [id, e] of Object.entries(edits ?? {})) {
    const el = agentElement(delta, id);
    for (const [k, mine] of Object.entries(e.properties ?? {})) {
      if (!hasOwn(el?.properties, k)) continue;
      const theirs = el.properties[k];
      const field = PROP + k;
      if (!same(theirs, mine) && !isKept(kept, id, field, theirs)) out.push({ id, field, mine, theirs });
    }
    if (typeof e.doc === 'string') {
      const d = agentDoc(delta, id);
      if (d && d.text !== e.doc && !isKept(kept, id, 'doc', d.text)) out.push({ id, field: 'doc', mine: e.doc, theirs: d.text });
    }
  }
  return out;
}

const answersField = (key, id, field) => (field === 'doc' ? key.startsWith(`doc:${id}:`) : key === `el:${id}:${field}`);

/**
 * key → 'take' for the plan's questions an edit already answers (the edit is the user's own decision). Answered ones
 * count too: an edit made after an answer overrides it.
 */
export function screenAnswers(plan, edits) {
  const out = {};
  if (!plan?.items) return out;
  const fields = Object.entries(edits ?? {}).flatMap(([id, e]) => [
    ...Object.keys(e.properties ?? {}).map(k => [id, PROP + k]),
    ...(typeof e.doc === 'string' ? [[id, 'doc']] : []),
  ]);
  for (const it of plan.items) {
    if (!('resolution' in it)) continue;
    if (fields.some(([id, field]) => answersField(it.key, id, field))) out[it.key] = 'take';
  }
  return out;
}

/** The plan with the answers of fields that left the screen layer cleared: they are the chat's question again. */
function reopen(plan, id, fields) {
  if (!plan?.items || !fields.length) return plan;
  return { ...plan, items: plan.items.map(it => ('resolution' in it && fields.some(f => answersField(it.key, id, f)) ? { ...it, resolution: null } : it)) };
}

const fieldsOf = entry => [...Object.keys(entry?.properties ?? {}).map(k => PROP + k), ...(typeof entry?.doc === 'string' ? ['doc'] : [])];

/** `edits` with `edits[id]` replaced by `entry` (an empty entry leaves the layer). */
function withEntry(edits, id, entry) {
  const out = { ...edits };
  const clean = { ...entry };
  if (clean.properties && !Object.keys(clean.properties).length) delete clean.properties;
  if (Object.keys(clean).length) out[id] = clean; else delete out[id];
  return out;
}

/**
 * Applies one screen edit to the draft: `properties` (replaces the node's edited properties; a value equal to the base
 * leaves the layer unless the chat proposes another), `doc`, `undo` (the node's edits and kept), `resolve` (a conflict:
 * `mine` keeps the edit for that proposal, `theirs` gives the field back to the chat). `baseProperties` is the node's
 * properties in the base (`{}` for a node new in the delta).
 */
export function applyEdit(draft, edit, baseProperties = {}) {
  const { edits, kept } = checkEdits(draft.edits, draft.kept);
  if (!isObject(edit) || typeof edit.id !== 'string' || !edit.id.trim()) throw editError('edição inválida');
  const { id } = edit;
  const entry = edits[id] ?? {};
  // What the chat proposes now for a field the user edits: the edit is the answer to it (only a later, different
  // proposal opens a conflict).
  const seen = [];
  let next;
  switch (edit.op) {
    case 'properties': {
      checkProperties(id, edit.properties);
      const base = baseProperties ?? {};
      const agent = agentElement(draft.delta, id)?.properties;
      const isBase = (k, v) => (v === null ? !hasOwn(base, k) : hasOwn(base, k) && same(base[k], v));
      const props = Object.fromEntries(Object.entries(edit.properties)
        .filter(([k, v]) => !(isBase(k, v) && (!hasOwn(agent, k) || isBase(k, agent[k])))));
      // Only the keys this edit changes answer the chat: a key re-sent unchanged keeps its pending conflict.
      const changed = (k, v) => !hasOwn(entry.properties, k) || !same(entry.properties[k], v);
      for (const [k, v] of Object.entries(props)) {
        if (changed(k, v) && hasOwn(agent, k) && !same(agent[k], v)) seen.push({ id, field: PROP + k, value: agent[k] });
      }
      const left = Object.keys(entry.properties ?? {}).filter(k => !hasOwn(props, k)).map(k => PROP + k);
      next = { edits: withEntry(edits, id, { ...entry, properties: props }), left };
      break;
    }
    case 'doc': {
      if (typeof edit.text !== 'string') throw editError(`a documentação editada de "${id}" precisa ser texto`);
      const chat = agentDoc(draft.delta, id);
      if (entry.doc !== edit.text && typeof chat?.text === 'string' && chat.text !== edit.text) seen.push({ id, field: 'doc', value: chat.text });
      next = { edits: withEntry(edits, id, { ...entry, doc: edit.text }), left: [] };
      break;
    }
    case 'undo':
      next = { edits: withEntry(edits, id, {}), left: fieldsOf(entry), kept: kept.filter(k => k.id !== id) };
      break;
    case 'resolve': {
      const c = screenConflicts(draft.delta, edits, kept).find(x => x.id === id && x.field === edit.field);
      if (!c) throw editError(`não há conflito em "${edit.field}" de "${id}"`);
      if (edit.choice === 'mine') next = { edits, left: [], kept: [...kept, { id, field: c.field, value: c.theirs }] };
      else if (edit.choice === 'theirs') {
        const rest = { ...entry, properties: { ...entry.properties } };
        if (c.field === 'doc') delete rest.doc; else delete rest.properties[c.field.slice(PROP.length)];
        next = { edits: withEntry(edits, id, rest), left: [c.field] };
      } else throw editError(`resposta de conflito desconhecida: ${edit.choice}`);
      break;
    }
    default:
      throw editError(`edição desconhecida: ${edit.op}`);
  }
  const nextKept = [
    ...(next.kept ?? kept).filter(k => !(k.id === id && (next.left.includes(k.field) || seen.some(x => x.field === k.field)))),
    ...seen,
  ];
  return { ...draft, edits: next.edits, kept: nextKept, plan: reopen(draft.plan, id, next.left) };
}

/** Who last set a node (or one of its fields) in the draft: the screen layer or the chat. */
export function originOf(edits, id, field) {
  const entry = edits?.[id];
  if (!entry) return 'chat';
  if (field === undefined) return fieldsOf(entry).length ? 'tela' : 'chat';
  if (field === 'doc') return typeof entry.doc === 'string' ? 'tela' : 'chat';
  return field.startsWith(PROP) && hasOwn(entry.properties, field.slice(PROP.length)) ? 'tela' : 'chat';
}
