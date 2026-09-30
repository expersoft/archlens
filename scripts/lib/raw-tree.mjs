// Index over the raw (un-normalized) model tree, so the merge edits it in place and keeps the nesting.

/** id → { el, list, parent }: the raw element, the array holding it and its parent id. */
export function indexTree(raw) {
  const index = new Map();
  const walk = (list, parent) => {
    for (const el of list) {
      if (!el || typeof el.id !== 'string') continue;
      index.set(el.id, { el, list, parent: el.parent ?? parent });
      if (Array.isArray(el.children)) walk(el.children, el.id);
    }
  };
  walk(raw.model.elements, null);
  return index;
}

/**
 * Delta elements flattened (children → parent id) and ordered so that a parent declared in the delta
 * always comes before its children, even when a child is listed first with "parent".
 */
export function orderDelta(elements = []) {
  const flat = [];
  const walk = (list, parent) => {
    for (const e of list || []) {
      if (!e || typeof e !== 'object') continue;
      const { children, ...el } = e;
      flat.push({ el, parent: e.parent ?? parent ?? null });
      walk(children, e.id);
    }
  };
  walk(elements, null);
  const byId = new Map(flat.map(x => [x.el.id, x]));
  const out = [];
  const done = new Set();
  const visit = (x, stack) => {
    if (done.has(x) || stack.has(x)) return;
    stack.add(x);
    const p = byId.get(x.parent);
    if (p) visit(p, stack);
    done.add(x);
    out.push(x);
  };
  for (const x of flat) visit(x, new Set());
  return out;
}

/** Puts `el` inside the children of `parentId` when it is in the tree, else at the top level (with "parent" if given). */
export function attach(raw, index, el, parentId) {
  const p = parentId != null ? index.get(parentId) : null;
  let list;
  if (p) {
    list = (p.el.children ??= []);
    delete el.parent;
  } else {
    list = raw.model.elements;
    if (parentId != null) el.parent = parentId; else delete el.parent;
  }
  list.push(el);
  index.set(el.id, { el, list, parent: parentId ?? null });
}

/** Takes `id` out of the array that holds it (nested children go with it). */
export function detach(index, id) {
  const entry = index.get(id);
  const i = entry.list.indexOf(entry.el);
  if (i >= 0) entry.list.splice(i, 1);
}

/** ids nested under `id`, at any depth. */
export function descendantsOf(index, id) {
  const out = [];
  for (const [x, { parent }] of index) {
    const seen = new Set();
    for (let cur = parent; cur != null && !seen.has(cur); cur = index.get(cur)?.parent) {
      seen.add(cur);
      if (cur === id) { out.push(x); break; }
    }
  }
  return out;
}
