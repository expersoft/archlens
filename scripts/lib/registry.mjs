// Metamodel registry: ArchiMate 3.2 element/relationship catalogue plus the C4 profile on top of it.

const el = (layer, aspect, label, icon) => ({ layer, aspect, label, icon });

export const ELEMENT_TYPES = {
  // Strategy
  'resource': el('strategy', 'passive', 'Resource', 'resource'),
  'capability': el('strategy', 'behavior', 'Capability', 'capability'),
  'value-stream': el('strategy', 'behavior', 'Value Stream', 'value-stream'),
  'course-of-action': el('strategy', 'behavior', 'Course of Action', 'course-of-action'),
  // Business
  'business-actor': el('business', 'active', 'Business Actor', 'actor'),
  'business-role': el('business', 'active', 'Business Role', 'role'),
  'business-collaboration': el('business', 'active', 'Business Collaboration', 'collaboration'),
  'business-interface': el('business', 'active', 'Business Interface', 'interface'),
  'business-process': el('business', 'behavior', 'Business Process', 'process'),
  'business-function': el('business', 'behavior', 'Business Function', 'function'),
  'business-interaction': el('business', 'behavior', 'Business Interaction', 'interaction'),
  'business-event': el('business', 'behavior', 'Business Event', 'event'),
  'business-service': el('business', 'behavior', 'Business Service', 'service'),
  'business-object': el('business', 'passive', 'Business Object', 'object'),
  'contract': el('business', 'passive', 'Contract', 'contract'),
  'representation': el('business', 'passive', 'Representation', 'representation'),
  'product': el('business', 'composite', 'Product', 'product'),
  // Application
  'application-component': el('application', 'active', 'Application Component', 'component'),
  'application-collaboration': el('application', 'active', 'Application Collaboration', 'collaboration'),
  'application-interface': el('application', 'active', 'Application Interface', 'interface'),
  'application-function': el('application', 'behavior', 'Application Function', 'function'),
  'application-interaction': el('application', 'behavior', 'Application Interaction', 'interaction'),
  'application-process': el('application', 'behavior', 'Application Process', 'process'),
  'application-event': el('application', 'behavior', 'Application Event', 'event'),
  'application-service': el('application', 'behavior', 'Application Service', 'service'),
  'data-object': el('application', 'passive', 'Data Object', 'object'),
  // Technology
  'node': el('technology', 'active', 'Node', 'node'),
  'device': el('technology', 'active', 'Device', 'device'),
  'system-software': el('technology', 'active', 'System Software', 'system-software'),
  'technology-collaboration': el('technology', 'active', 'Technology Collaboration', 'collaboration'),
  'technology-interface': el('technology', 'active', 'Technology Interface', 'interface'),
  'path': el('technology', 'active', 'Path', 'path'),
  'communication-network': el('technology', 'active', 'Communication Network', 'network'),
  'technology-function': el('technology', 'behavior', 'Technology Function', 'function'),
  'technology-process': el('technology', 'behavior', 'Technology Process', 'process'),
  'technology-interaction': el('technology', 'behavior', 'Technology Interaction', 'interaction'),
  'technology-event': el('technology', 'behavior', 'Technology Event', 'event'),
  'technology-service': el('technology', 'behavior', 'Technology Service', 'service'),
  'artifact': el('technology', 'passive', 'Artifact', 'artifact'),
  // Physical
  'equipment': el('physical', 'active', 'Equipment', 'equipment'),
  'facility': el('physical', 'active', 'Facility', 'facility'),
  'distribution-network': el('physical', 'active', 'Distribution Network', 'network'),
  'material': el('physical', 'passive', 'Material', 'material'),
  // Motivation
  'stakeholder': el('motivation', 'motivation', 'Stakeholder', 'stakeholder'),
  'driver': el('motivation', 'motivation', 'Driver', 'driver'),
  'assessment': el('motivation', 'motivation', 'Assessment', 'assessment'),
  'goal': el('motivation', 'motivation', 'Goal', 'goal'),
  'outcome': el('motivation', 'motivation', 'Outcome', 'outcome'),
  'principle': el('motivation', 'motivation', 'Principle', 'principle'),
  'requirement': el('motivation', 'motivation', 'Requirement', 'requirement'),
  'constraint': el('motivation', 'motivation', 'Constraint', 'constraint'),
  'meaning': el('motivation', 'motivation', 'Meaning', 'meaning'),
  'value': el('motivation', 'motivation', 'Value', 'value'),
  // Implementation & Migration
  'work-package': el('implementation', 'behavior', 'Work Package', 'work-package'),
  'deliverable': el('implementation', 'passive', 'Deliverable', 'deliverable'),
  'implementation-event': el('implementation', 'behavior', 'Implementation Event', 'event'),
  'plateau': el('implementation', 'composite', 'Plateau', 'plateau'),
  'gap': el('implementation', 'passive', 'Gap', 'gap'),
  // Other
  'grouping': el('other', 'composite', 'Grouping', 'grouping'),
  'location': el('other', 'composite', 'Location', 'location'),
};

export const RELATIONSHIP_TYPES = {
  composition: { label: 'composition', category: 'structural', strength: 8 },
  aggregation: { label: 'aggregation', category: 'structural', strength: 7 },
  assignment: { label: 'assignment', category: 'structural', strength: 6 },
  realization: { label: 'realization', category: 'structural', strength: 5 },
  serving: { label: 'serving', category: 'dependency', strength: 4 },
  access: { label: 'access', category: 'dependency', strength: 3 },
  influence: { label: 'influence', category: 'dependency', strength: 2 },
  triggering: { label: 'triggering', category: 'dynamic', strength: 1 },
  flow: { label: 'flow', category: 'dynamic', strength: 1 },
  specialization: { label: 'specialization', category: 'other', strength: 0 },
  association: { label: 'association', category: 'other', strength: 0 },
};

// Presentation order of layers (top → bottom in layered diagrams).
export const LAYER_ORDER = ['motivation', 'strategy', 'business', 'application', 'technology', 'physical', 'implementation', 'other'];
export const CORE_LAYERS = ['business', 'application', 'technology'];
export const LAYER_LABELS = {
  motivation: 'Motivação', strategy: 'Estratégia', business: 'Negócio', application: 'Aplicação',
  technology: 'Tecnologia', physical: 'Física', implementation: 'Implementação e Migração', other: 'Outros',
};
// Abstraction rank used to judge the direction of serving/realization across layers.
export const LAYER_RANK = { physical: 0, technology: 1, application: 2, business: 3, strategy: 4, motivation: 5, implementation: 2.5, other: 2.5 };

export const C4_KINDS = ['person', 'softwareSystem', 'container', 'component', 'deploymentNode', 'infrastructureNode'];
export const C4_LABELS = {
  person: 'Person', softwareSystem: 'Software System', container: 'Container', component: 'Component',
  deploymentNode: 'Deployment Node', infrastructureNode: 'Infrastructure Node',
};

const C4_TO_ARCHIMATE = {
  person: 'business-actor',
  softwareSystem: 'application-component',
  container: 'application-component',
  component: 'application-component',
  deploymentNode: 'node',
  infrastructureNode: 'node',
};

// Tags that turn a C4 container into a passive data store in ArchiMate.
export const DATA_TAGS = ['database', 'datastore', 'data-store', 'bucket', 'storage'];

/**
 * Resolve a raw element type ("c4:container", "archimate:node" or bare "node") onto the
 * ArchiMate metamodel. `hints` may carry `tags` and an explicit `archimate` override.
 */
export function resolveType(raw, hints = {}) {
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

export function resolveRelType(raw) {
  if (typeof raw !== 'string') return { error: 'E_REL_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : [null, raw];
  if ((ns === 'c4' || ns === null) && name === 'uses') return { type: 'uses' };
  if ((ns === 'archimate' || ns === null) && RELATIONSHIP_TYPES[name]) return { type: name };
  return { error: 'E_REL_TYPE' };
}

export const isPassive = t => ELEMENT_TYPES[t]?.aspect === 'passive';
export const isMotivation = t => ELEMENT_TYPES[t]?.layer === 'motivation';

/**
 * Simplified ArchiMate relationship rules. Returns null when fine, or { level, code, hint }.
 * Not the full normative table: it catches the mistakes that matter for traversal.
 */
export function checkRelationship(type, src, dst) {
  const a = ELEMENT_TYPES[src], b = ELEMENT_TYPES[dst];
  if (!a || !b) return null;
  const composite = x => x.aspect === 'composite';
  if (type === 'association') return null;
  if (type === 'specialization') {
    return src === dst ? null : { level: 'error', code: 'E_REL_INVALID', hint: 'specialization só entre elementos do mesmo tipo' };
  }
  if (type === 'access') {
    if (b.aspect !== 'passive') return { level: 'error', code: 'E_REL_INVALID', hint: `access precisa de um alvo passivo (data-object, business-object, artifact...), mas "${dst}" é ${b.aspect}` };
    if (a.aspect === 'passive') return { level: 'error', code: 'E_REL_INVALID', hint: 'a origem de access deve ser comportamento ou estrutura ativa' };
    return null;
  }
  if (type === 'influence') {
    return (a.layer === 'motivation' || b.layer === 'motivation') ? null
      : { level: 'warning', code: 'W_REL_SUSPECT', hint: 'influence normalmente envolve elementos de motivação' };
  }
  if (type === 'assignment') {
    if (a.aspect === 'passive') return { level: 'error', code: 'E_REL_INVALID', hint: 'assignment parte de estrutura ativa (ator, componente, nó...)' };
    return null;
  }
  if (type === 'serving') {
    if (a.aspect === 'passive' || b.aspect === 'passive') {
      return { level: 'error', code: 'E_REL_INVALID', hint: 'serving liga comportamento/estrutura ativa; para dados use access' };
    }
    if (a.layer !== 'motivation' && b.layer !== 'motivation' && !composite(a) && !composite(b)
      && LAYER_RANK[a.layer] > LAYER_RANK[b.layer]) {
      return { level: 'warning', code: 'W_REL_DIRECTION', hint: `serving normalmente vai da camada inferior para a superior; "${src}" (${a.layer}) servindo "${dst}" (${b.layer}) parece invertido` };
    }
    return null;
  }
  if (type === 'realization') {
    if (b.layer === 'motivation' || b.layer === 'strategy' || a.layer === 'implementation') return null;
    if (LAYER_RANK[a.layer] > LAYER_RANK[b.layer] && !composite(a) && !composite(b)) {
      return { level: 'warning', code: 'W_REL_DIRECTION', hint: `realization normalmente vai do concreto (camada inferior) para o abstrato; "${src}" → "${dst}" parece invertido` };
    }
    return null;
  }
  if (type === 'triggering' || type === 'flow') {
    if (a.aspect === 'passive' || b.aspect === 'passive') return { level: 'error', code: 'E_REL_INVALID', hint: `${type} liga comportamentos (ou estruturas ativas), nunca elementos passivos` };
    return null;
  }
  return null; // composition / aggregation: accepted
}

/** Which end of a relationship "supports" the other. Returns [supporter, supported] or null. */
export function supportDirection(rel) {
  switch (rel.type) {
    case 'serving': case 'realization': case 'assignment': case 'influence':
      return [rel.from, rel.to];
    case 'composition': case 'aggregation': case 'access':
      return [rel.to, rel.from];
    case 'triggering': case 'flow':
      return [rel.from, rel.to];
    default:
      return null;
  }
}

/** Orient a (derived) relationship of `type` given supporter/supported ends. */
export function orientBySupport(type, supporter, supported) {
  return ['composition', 'aggregation', 'access'].includes(type)
    ? { from: supported, to: supporter }
    : { from: supporter, to: supported };
}
