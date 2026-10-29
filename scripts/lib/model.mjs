// Load + normalize a 2.0 base into a flat, ArchiMate-typed in-memory model. The free vocabulary (c4:*, "uses",
// "children") is read only by canonical.mjs, at the entrance.
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, C4_KIND_TYPES, checkRelationship, STATUSES } from './registry.mjs';
import { readSources, sourceProblem } from './sources.mjs';
import { aliasKey } from './match.mjs';
import { FORMAT, isCanonicalFormat } from './canonical.mjs';

const ELEMENT_FIELDS = ['description', 'technology', 'owner', 'url', 'inferred', 'confidence', 'statusReason'];
const isPropertyValue = v => ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'));

/**
 * @returns {{ name, description, meta, elements: Map<string, object>, relationships: object[],
 *             views: object[], issues: object[] }}
 */
export function normalizeModel(raw) {
  const issues = [];
  const issue = (level, code, message, path, hint) => issues.push({ level, code, message, path, hint });
  const checkStatus = (status, where, p) => {
    if (status !== undefined && !STATUSES.includes(status)) issue('error', 'E_STATUS', `status "${status}" inválido em ${where}`, `${p}.status`, `use ${STATUSES.join(' | ')}`);
  };
  const checkSources = (list, p) => list.forEach((s, j) => {
    const why = sourceProblem(s);
    if (why) issue('error', 'E_SOURCE', 'fonte inválida', `${p}.sources[${j}]`, why);
  });
  const checkProperties = (props, owner, p) => {
    for (const [k, v] of Object.entries(props || {})) {
      if (!isPropertyValue(v)) {
        issue('error', 'E_SCHEMA', `propriedade "${k}" de "${owner}" não é texto, número, booleano nem lista de textos`, `${p}.properties.${k}`,
          'use um valor simples ou uma lista de textos, ex.: ["web","mobile"]');
      }
    }
  };
  const elements = new Map();
  const relationships = [];
  const empty = () => ({ name: raw?.name ?? 'sem nome', description: raw?.description ?? '', meta: {}, assumptions: [], elements, relationships, views: [], issues });

  if (!raw || typeof raw !== 'object' || !raw.model) {
    issue('error', 'E_SCHEMA', 'documento sem a chave "model"', '$', `use { "archlens": "${FORMAT}", "name": "...", "model": { "elements": [], "relationships": [] } }`);
    return empty();
  }
  if (!isCanonicalFormat(raw.archlens)) {
    issue('error', 'E_STORE_FORMAT', `base no formato ${raw.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}`, 'archlens',
      'rode "archlens migrate <base>" para converter (a skill pergunta antes de gravar)');
    return empty();
  }

  (raw.model.elements || []).forEach((e, i) => {
    const p = `model.elements[${i}]`;
    if (!e || typeof e.id !== 'string' || !e.id) {
      issue('error', 'E_MISSING_ID', 'elemento sem "id"', p, 'todo elemento precisa de um id único (ex.: "loja.api")');
      return;
    }
    if (elements.has(e.id)) {
      issue('error', 'E_DUPLICATE_ID', `id duplicado "${e.id}"`, p, 'renomeie um dos elementos; ids são globais');
      return;
    }
    if (e.children !== undefined) {
      issue('error', 'E_SCHEMA', `"${e.id}" tem "children", que não existe no formato ${FORMAT}`, `${p}.children`, 'liste cada filho no topo com "parent": "<id do pai>"');
    }
    const spec = ELEMENT_TYPES[e.type];
    if (!spec) {
      issue('error', 'E_UNKNOWN_TYPE', `tipo desconhecido "${e.type}" em "${e.id}"`, `${p}.type`,
        'use um tipo ArchiMate sem prefixo (veja references/archimate.md); c4:* só vale na entrada (prompt, delta, scan), que o traduz');
      return;
    }
    let c4 = null;
    if (e.c4 != null) {
      const kind = e.c4?.kind;
      if (!C4_KIND_TYPES[kind]?.includes(e.type)) {
        issue('error', 'E_C4_TYPE', `c4.kind "${kind}" não combina com o tipo "${e.type}" em "${e.id}"`, `${p}.c4`,
          C4_KIND_TYPES[kind] ? `um ${kind} é ${C4_KIND_TYPES[kind].join(' ou ')}` : `use ${Object.keys(C4_KIND_TYPES).join(' | ')}`);
      } else c4 = { kind, external: !!e.external };
    }
    const node = {
      id: e.id,
      name: e.name ?? e.id,
      type: e.type,
      layer: spec.layer,
      aspect: spec.aspect,
      c4,
      parent: e.parent ?? null,
      group: e.group ?? null,
      tags: (e.tags || []).map(String),
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
    checkProperties(e.properties, e.id, p);
    checkSources(node.sources, p);
    elements.set(e.id, node);
    if (e.group != null && typeof e.group !== 'string') { // null: explicitly no group
      issue('error', 'E_SCHEMA', `"group" de "${e.id}" não é um id`, `${p}.group`, 'use o id de um elemento do tipo "grouping"');
      node.group = null;
    }
  });

  for (const n of elements.values()) {
    if (n.parent != null && !elements.has(n.parent)) {
      issue('error', 'E_UNKNOWN_REF', `parent "${n.parent}" de "${n.id}" não existe`, `${n.path}.parent`, 'corrija o id do pai');
      n.parent = null;
    }
  }
  for (const n of elements.values()) {
    const seen = new Set([n.id]);
    for (let cur = n.parent; cur != null; cur = elements.get(cur)?.parent) {
      if (!seen.has(cur)) { seen.add(cur); continue; }
      issue('error', 'E_PARENT_CYCLE', `"${n.id}" está dentro de si mesmo pela cadeia de "parent"`, `${n.path}.parent`, 'corrija o "parent" de um dos elementos do ciclo');
      n.parent = null;
      break;
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
    if (!RELATIONSHIP_TYPES[r.type]) {
      issue('error', 'E_REL_TYPE', `tipo de relacionamento desconhecido "${r.type}"`, `${p}.type`,
        `use ${Object.keys(RELATIONSHIP_TYPES).join('|')}; "uses" só vale na entrada, que o traduz para serving ou access`);
      return;
    }
    const rel = {
      from: r.from, to: r.to, type: r.type,
      description: r.description, technology: r.technology,
      tags: (r.tags || []).map(String), properties: { ...(r.properties || {}) },
      path: p, status: r.status ?? 'active', sources: readSources(r),
    };
    if (r.inferred !== undefined) rel.inferred = r.inferred;
    if (r.type === 'access' && r.accessType) rel.accessType = r.accessType;
    if (r.statusReason) rel.statusReason = r.statusReason;
    checkStatus(r.status, p, p);
    checkProperties(r.properties, `${r.from} → ${r.to}`, p);
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

/** C4 kind of an element: the stored c4.kind (2.0 never infers it on read). */
export function c4KindOf(model, el) {
  return el?.c4?.kind ?? null;
}

/** Orientation of a relationship as a C4 "uses" arrow (consumer → provider), or null if structural. */
export function c4Orientation(rel) {
  switch (rel.type) {
    case 'serving': return { from: rel.to, to: rel.from };
    case 'access': case 'flow': case 'triggering': case 'association': return { from: rel.from, to: rel.to };
    default: return null;
  }
}
