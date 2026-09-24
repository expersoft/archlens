// Load + normalize the archlens DSL into a flat, ArchiMate-typed in-memory model.
import {
  ELEMENT_TYPES, resolveType, resolveRelType, checkRelationship, isPassive,
} from './registry.mjs';

const ELEMENT_FIELDS = ['description', 'technology', 'owner', 'url', 'inferred', 'confidence', 'source'];

/**
 * @returns {{ name, description, meta, elements: Map<string, object>, relationships: object[],
 *             views: object[], issues: object[] }}
 */
export function normalizeModel(raw) {
  const issues = [];
  const issue = (level, code, message, path, hint) => issues.push({ level, code, message, path, hint });
  const elements = new Map();
  const relationships = [];

  if (!raw || typeof raw !== 'object' || !raw.model) {
    issue('error', 'E_SCHEMA', 'documento sem a chave "model"', '$', 'use { "archlens": "1.0", "name": "...", "model": { "elements": [], "relationships": [] } }');
    return { name: raw?.name ?? 'sem nome', description: '', meta: {}, elements, relationships, views: [], issues };
  }

  const pending = [];
  const walk = (list, parent, path) => {
    (list || []).forEach((e, i) => {
      const p = `${path}[${i}]`;
      if (!e || typeof e.id !== 'string' || !e.id) {
        issue('error', 'E_MISSING_ID', 'elemento sem "id"', p, 'todo elemento precisa de um id único (ex.: "loja.api")');
        return;
      }
      if (elements.has(e.id)) {
        issue('error', 'E_DUPLICATE_ID', `id duplicado "${e.id}"`, p, 'renomeie um dos elementos; ids são globais, inclusive entre filhos');
        return;
      }
      const tags = (e.tags || []).map(String);
      const r = resolveType(e.type, { tags, archimate: e.archimate });
      if (r.error) {
        issue('error', 'E_UNKNOWN_TYPE', `tipo desconhecido "${e.type}" em "${e.id}"`, `${p}.type`,
          'use c4:person|softwareSystem|container|component|deploymentNode|infrastructureNode ou archimate:<tipo> (veja references/archimate.md)');
        return;
      }
      const spec = ELEMENT_TYPES[r.type];
      const node = {
        id: e.id,
        name: e.name ?? e.id,
        type: r.type,
        layer: spec.layer,
        aspect: spec.aspect,
        c4: r.c4Kind ? { kind: r.c4Kind, external: !!e.external } : null,
        parent: e.parent ?? parent ?? null,
        tags,
        properties: { ...(e.properties || {}) },
        path: p,
      };
      for (const f of ELEMENT_FIELDS) if (e[f] !== undefined) node[f] = e[f];
      elements.set(e.id, node);
      if (e.parent && parent) issue('warning', 'W_PARENT_CONFLICT', `"${e.id}" tem "parent" e também está aninhado`, p, 'use só uma das formas');
      if (e.parent) pending.push(node);
      walk(e.children, e.id, `${p}.children`);
    });
  };
  walk(raw.model.elements, null, 'model.elements');

  for (const n of pending) {
    if (!elements.has(n.parent)) {
      issue('error', 'E_UNKNOWN_REF', `parent "${n.parent}" de "${n.id}" não existe`, `${n.path}.parent`, 'corrija o id do pai');
      n.parent = null;
    }
  }

  // C4 hierarchy rules
  const expectedParent = { component: 'container', container: 'softwareSystem' };
  for (const n of elements.values()) {
    if (!n.c4) continue;
    const parent = n.parent ? elements.get(n.parent) : null;
    const want = expectedParent[n.c4.kind];
    if (want && parent && parent.c4?.kind !== want) {
      issue('error', 'E_C4_HIERARCHY', `${n.c4.kind} "${n.id}" está dentro de ${parent.c4?.kind ?? parent.type} "${parent.id}"`, n.path,
        `um ${n.c4.kind} deve ficar dentro de um ${want}`);
    } else if (want && !parent) {
      issue('warning', 'W_C4_ORPHAN', `${n.c4.kind} "${n.id}" sem ${want} pai`, n.path, `aninhe-o em um ${want} para aparecer nas visões C4`);
    } else if (!want && parent?.c4 && ['person', 'softwareSystem'].includes(n.c4.kind)) {
      issue('error', 'E_C4_HIERARCHY', `${n.c4.kind} "${n.id}" não pode estar dentro de "${parent.id}"`, n.path, 'pessoas e sistemas são elementos de topo');
    }
  }

  const seen = new Map();
  (raw.model.relationships || []).forEach((r, i) => {
    const p = `model.relationships[${i}]`;
    if (!r || !r.from || !r.to) {
      issue('error', 'E_SCHEMA', 'relacionamento sem "from"/"to"', p, 'informe from e to com ids de elementos');
      return;
    }
    let bad = false;
    for (const end of ['from', 'to']) {
      if (!elements.has(r[end])) {
        issue('error', 'E_UNKNOWN_REF', `${end} "${r[end]}" não existe`, `${p}.${end}`, 'use o id de um elemento declarado');
        bad = true;
      }
    }
    if (bad) return;
    const t = resolveRelType(r.type ?? 'uses');
    if (t.error) {
      issue('error', 'E_REL_TYPE', `tipo de relacionamento desconhecido "${r.type}"`, `${p}.type`,
        'use "uses" (C4) ou archimate:composition|aggregation|assignment|realization|serving|access|influence|triggering|flow|specialization|association');
      return;
    }
    const rel = {
      from: r.from, to: r.to, type: t.type,
      description: r.description, technology: r.technology,
      tags: (r.tags || []).map(String), properties: { ...(r.properties || {}) },
      c4: null, path: p,
    };
    if (r.inferred !== undefined) rel.inferred = r.inferred;
    if (r.accessType) rel.accessType = r.accessType;
    if (t.type === 'uses') {
      rel.c4 = { from: r.from, to: r.to };
      if (isPassive(elements.get(r.to).type)) {
        rel.type = 'access';
        rel.accessType = r.accessType ?? 'readwrite';
      } else {
        rel.type = 'serving';
        rel.from = r.to;
        rel.to = r.from;
      }
    }
    const check = checkRelationship(rel.type, elements.get(rel.from).type, elements.get(rel.to).type);
    if (check) issue(check.level, check.code, `${rel.type} "${rel.from}" → "${rel.to}"`, p, check.hint);
    let id = r.id ?? `${rel.from}-${rel.type}-${rel.to}`;
    if (seen.has(id)) { seen.set(id, seen.get(id) + 1); id = `${id}#${seen.get(id)}`; } else seen.set(id, 1);
    rel.id = id;
    relationships.push(rel);
  });

  return {
    name: raw.name ?? 'Arquitetura',
    description: raw.description ?? '',
    meta: { ...(raw.meta || {}) },
    assumptions: raw.assumptions || [],
    elements, relationships,
    views: raw.views || [],
    issues,
  };
}

export function childrenOf(model, id) {
  const out = [];
  for (const e of model.elements.values()) if (e.parent === id) out.push(e);
  return out;
}

export function ancestors(model, id) {
  const out = [];
  let cur = model.elements.get(id)?.parent;
  while (cur) { out.push(cur); cur = model.elements.get(cur)?.parent; }
  return out;
}

/** Effective C4 kind: explicit facet, or inferred from ArchiMate type + nesting. */
export function c4KindOf(model, el) {
  if (el.c4) return el.c4.kind;
  if (el.type === 'business-actor' || el.type === 'business-role') return el.parent ? null : 'person';
  if (el.type === 'application-component') {
    let depth = 0, cur = el.parent;
    while (cur) {
      const p = model.elements.get(cur);
      if (p?.type !== 'application-component' && p?.type !== 'data-object') return null;
      depth++; cur = p.parent;
    }
    return ['softwareSystem', 'container', 'component'][depth] ?? null;
  }
  return null;
}

/** Orientation of a relationship as a C4 "uses" arrow (consumer → provider), or null if structural. */
export function c4Orientation(rel) {
  if (rel.c4) return rel.c4;
  switch (rel.type) {
    case 'serving': return { from: rel.to, to: rel.from };
    case 'access': case 'flow': case 'triggering': case 'association': return { from: rel.from, to: rel.to };
    default: return null;
  }
}
