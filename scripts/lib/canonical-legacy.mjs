// Frozen 1.x reader (normalizeModel of archlens 0.3), kept only so "migrate" can validate a 1.x base and check
// that the 2.0 translation means the same thing. Never use it for anything else.
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, checkRelationship, isPassive, STATUSES, STORE_TAGS } from './registry.mjs';
import { readSources, sourceProblem } from './sources.mjs';
import { aliasKey } from './match.mjs';

const ELEMENT_FIELDS = ['description', 'technology', 'owner', 'url', 'inferred', 'confidence', 'statusReason'];

/**
 * @returns {{ name, description, meta, elements: Map<string, object>, relationships: object[],
 *             views: object[], issues: object[] }}
 */
export function normalizeLegacy(raw) {
  const issues = [];
  const issue = (level, code, message, path, hint) => issues.push({ level, code, message, path, hint });
  const checkStatus = (status, where, p) => {
    if (status !== undefined && !STATUSES.includes(status)) issue('error', 'E_STATUS', `status "${status}" inválido em ${where}`, `${p}.status`, `use ${STATUSES.join(' | ')}`);
  };
  const checkSources = (list, p) => list.forEach((s, j) => {
    const why = sourceProblem(s);
    if (why) issue('error', 'E_SOURCE', 'fonte inválida', `${p}.sources[${j}]`, why);
  });
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
        group: e.group ?? null,
        tags,
        properties: { ...(e.properties || {}) },
        status: e.status ?? 'active',
        aliases: Array.isArray(e.aliases) ? e.aliases.map(String) : [],
        sources: readSources(e),
        path: p,
      };
      for (const f of ELEMENT_FIELDS) if (e[f] !== undefined) node[f] = e[f];
      checkStatus(e.status, `"${e.id}"`, p);
      if (e.aliases !== undefined && !Array.isArray(e.aliases)) {
        issue('error', 'E_SCHEMA', `"aliases" de "${e.id}" não é uma lista`, `${p}.aliases`, 'use uma lista de nomes, ex.: "aliases": ["orders-service"]');
      }
      checkSources(node.sources, p);
      elements.set(e.id, node);
      if (e.group != null && typeof e.group !== 'string') { // null: explicitly no group
        issue('error', 'E_SCHEMA', `"group" de "${e.id}" não é um id`, `${p}.group`, 'use o id de um elemento do tipo "grouping"');
        node.group = null;
      }
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

  // An element nested in (or "parent" of) a grouping is read as its member: groupings are not containers.
  for (const n of elements.values()) {
    const g = n.parent != null ? elements.get(n.parent) : null;
    if (g?.type !== 'grouping') continue;
    n.parent = null;
    if (n.type === 'grouping') {
      issue('error', 'E_GROUP_NESTED', `o agrupamento "${n.id}" não pode ficar dentro de outro ("${g.id}")`, n.path,
        'agrupamentos não se aninham; mova-o para o topo do modelo');
      continue;
    }
    if (n.group == null) n.group = g.id;
    issue('warning', 'W_GROUP_CHILD', `${n.id} está aninhado no agrupamento ${g.id}; foi tratado como membro — prefira "group": "${g.id}" no elemento`, n.path,
      `mova "${n.id}" para o topo do modelo com "group": "${g.id}"`);
  }

  // Groupings: "group" names a grouping element; members inherit it down the parent hierarchy.
  for (const n of elements.values()) {
    if (n.group == null) continue;
    const g = elements.get(n.group);
    if (n.type === 'grouping') {
      issue('error', 'E_GROUP_NESTED', `o agrupamento "${n.id}" não pode pertencer a outro ("${n.group}")`, `${n.path}.group`,
        'agrupamentos não se aninham; remova "group" do agrupamento');
      n.group = null;
    } else if (!g || g.type !== 'grouping') {
      issue('error', 'E_GROUP_REF', g ? `"group" de "${n.id}" aponta para "${n.group}", que não é um agrupamento`
        : `"group" de "${n.id}" aponta para "${n.group}", que não existe`, `${n.path}.group`, 'use o id de um elemento do tipo "grouping"');
      n.group = null;
    }
  }
  const effectiveGroup = id => {
    const seen = new Set();
    for (let cur = id; cur != null && !seen.has(cur); cur = elements.get(cur)?.parent) {
      seen.add(cur);
      const g = elements.get(cur)?.group;
      if (g) return g;
    }
    return null;
  };
  for (const n of elements.values()) n.groupId = n.type === 'grouping' ? null : effectiveGroup(n.id);

  // Aliases identify one element only (compared like the merge compares them).
  const aliasOwner = new Map();
  for (const n of elements.values()) aliasOwner.set(aliasKey(n.id), n.id);
  for (const n of elements.values()) {
    for (const a of n.aliases) {
      const k = aliasKey(a);
      const owner = aliasOwner.get(k);
      if (owner && owner !== n.id) {
        issue('error', 'E_ALIAS_CONFLICT', `alias "${a}" de "${n.id}" já identifica "${owner}"`, `${n.path}.aliases`, 'um alias aponta para um único elemento; remova-o de um dos dois');
      } else aliasOwner.set(k, n.id);
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
    const grp = ['from', 'to'].find(end => elements.get(r[end]).type === 'grouping');
    if (grp) {
      issue('error', 'E_GROUP_REL', `relação com o agrupamento "${r[grp]}"`, `${p}.${grp}`,
        'agrupamentos não são nós: indique os membros com "group" em vez de relacioná-los ao agrupamento');
      return;
    }
    const c = legacyRel(r, id => elements.get(id)?.type);
    if (c.error) {
      issue('error', 'E_REL_TYPE', `tipo de relacionamento desconhecido "${r.type}"`, `${p}.type`,
        'use "uses" (C4) ou archimate:composition|aggregation|assignment|realization|serving|access|influence|triggering|flow|specialization|association');
      return;
    }
    const rel = {
      from: c.from, to: c.to, type: c.type,
      description: r.description, technology: r.technology,
      tags: (r.tags || []).map(String), properties: { ...(r.properties || {}) },
      c4: resolveRelType(r.type ?? 'uses').type === 'uses' ? { from: r.from, to: r.to } : null, path: p,
      status: r.status ?? 'active', sources: readSources(r),
    };
    if (r.inferred !== undefined) rel.inferred = r.inferred;
    if (c.accessType) rel.accessType = c.accessType;
    if (r.statusReason) rel.statusReason = r.statusReason;
    checkStatus(r.status, p, p);
    checkSources(rel.sources, p);
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

/** ArchiMate reading of a raw relationship: `uses` becomes access (passive target) or inverted serving. */
function legacyRel(r, typeOf) {
  const t = resolveRelType(r.type ?? 'uses');
  if (t.error) return { error: t.error };
  if (t.type !== 'uses') return { type: t.type, from: r.from, to: r.to, ...(r.accessType ? { accessType: r.accessType } : {}) };
  const target = typeOf(r.to);
  if (target && isPassive(target)) return { type: 'access', from: r.from, to: r.to, accessType: r.accessType ?? 'readwrite' };
  return { type: 'serving', from: r.to, to: r.from };
}

/** Effective C4 kind: explicit facet, or inferred from ArchiMate type + nesting. */
export function legacyKindOf(model, el) {
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


const C4_TO_ARCHIMATE = {
  person: 'business-actor', softwareSystem: 'application-component', container: 'application-component',
  component: 'application-component', deploymentNode: 'node', infrastructureNode: 'node',
};
const DATA_TAGS = STORE_TAGS;

function resolveType(raw, hints = {}) {
  if (typeof raw !== 'string') return { error: 'E_UNKNOWN_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : ['archimate', raw];
  if (ns === 'c4') {
    if (!C4_TO_ARCHIMATE[name]) return { error: 'E_UNKNOWN_TYPE' };
    let type = C4_TO_ARCHIMATE[name];
    if (name === 'container' && (hints.tags || []).some(t => DATA_TAGS.includes(String(t).toLowerCase()))) type = 'data-object';
    if (hints.archimate) {
      const override = hints.archimate.replace(/^archimate:/, '');
      if (!ELEMENT_TYPES[override]) return { error: 'E_UNKNOWN_TYPE' };
      type = override;
    }
    return { type, c4Kind: name };
  }
  if (ns === 'archimate' && ELEMENT_TYPES[name]) return { type: name, c4Kind: null };
  return { error: 'E_UNKNOWN_TYPE' };
}

function resolveRelType(raw) {
  if (typeof raw !== 'string') return { error: 'E_REL_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : [null, raw];
  if ((ns === 'c4' || ns === null) && name === 'uses') return { type: 'uses' };
  if ((ns === 'archimate' || ns === null) && RELATIONSHIP_TYPES[name]) return { type: name };
  return { error: 'E_REL_TYPE' };
}
