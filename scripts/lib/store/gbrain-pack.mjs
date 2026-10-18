// The gbrain schema pack of a vault: one page type per ArchiMate type in use (its folder is the path prefix), the
// relationship types in use as link types, and the frontmatter fields that carry them.
import { stringify } from '../../vendor/yaml/index.js';
import { RELATIONSHIP_TYPES } from '../registry.mjs';

export const PACK_FILE = 'gbrain-pack.yaml';
const INVERSE = {
  composition: 'composed_into', aggregation: 'aggregated_into', assignment: 'assigned_from', realization: 'realized_by',
  serving: 'served_by', access: 'accessed_by', influence: 'influenced_by', triggering: 'triggered_by', flow: 'flows_from',
  specialization: 'generalization_of', association: 'association',
};

// The page types of the pages that are not elements (gbrain layout only), with their path under the prefix.
const EXTRA_TYPES = [['archlens-manifest', 'manifest.md'], ['archlens-view', 'views/'], ['archlens-note', 'notes/'], ['archlens-changelog', 'changelog.md']];

/** `gbrain` (on with a `prefix` like "archlens/") is the layout of the gbrain: the four extra page types, folders under the prefix. */
export function gbrainPack(raw, { prefix, gbrain = Boolean(prefix) } = {}) {
  const at = prefix ? `${prefix.replace(/^\/+|\/+$/g, '')}/` : '';
  const els = (raw.model?.elements ?? []).filter(e => e && typeof e.type === 'string');
  const typeOf = new Map(els.map(e => [e.id, e.type]));
  const rels = (raw.model?.relationships ?? []).filter(r => r && typeOf.has(r.from));
  const types = [...new Set(els.map(e => e.type))].sort();
  const relTypes = Object.keys(RELATIONSHIP_TYPES).filter(t => rels.some(r => r.type === t));
  const links = [];
  for (const t of types) {
    for (const r of relTypes) if (rels.some(x => x.type === r && typeOf.get(x.from) === t)) links.push({ page_type: t, fields: [r], link_type: r });
    if (els.some(e => e.type === t && e.parent != null)) links.push({ page_type: t, fields: ['parent'], link_type: 'part_of' });
    if (els.some(e => e.type === t && e.group != null)) links.push({ page_type: t, fields: ['group'], link_type: 'member_of' });
  }
  return stringify({
    api_version: 'gbrain-schema-pack-v1',
    name: 'archlens',
    version: '2.0.0',
    description: 'Arquitetura (ArchiMate 3.2 + perfil C4) mantida pelo archlens. Gerado pelo archlens; não edite.',
    page_types: [
      ...types.map(t => ({ name: t, primitive: 'entity', path_prefixes: [`${at}${t}/`], aliases: [], extractable: false, expert_routing: false })),
      ...(gbrain ? EXTRA_TYPES.map(([name, path]) => ({ name, primitive: 'entity', path_prefixes: [`${at}${path}`], aliases: [], extractable: false, expert_routing: false })) : []),
    ],
    link_types: [
      ...relTypes.map(r => ({ name: r, inverse: INVERSE[r] })),
      ...(els.some(e => e.parent != null) ? [{ name: 'part_of', inverse: 'composed_of' }] : []),
      ...(els.some(e => e.group != null) ? [{ name: 'member_of', inverse: 'has_member' }] : []),
    ],
    takes_kinds: ['fact', 'take', 'bet', 'hunch'],
    borrow_from: [],
    frontmatter_links: links,
    enrichable_types: [],
    filing_rules: [],
  }, { lineWidth: 0 });
}
