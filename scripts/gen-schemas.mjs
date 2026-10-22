#!/usr/bin/env node
// Regenerates schemas/*.schema.json from the registry so enums never drift from the code.
import { writeFileSync } from 'node:fs';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, C4_KINDS, C4_KIND_TYPES, LAYER_ORDER, STATUSES } from './lib/registry.mjs';
import { ARCHIMATE_VIEWPOINTS } from './lib/query-archimate.mjs';
import { OPS } from './lib/store/ops.mjs';
import { SOURCE_KINDS } from './lib/sources.mjs';

export function buildSchemas() {
  // Free vocabulary: only accepted at the entrance (deltas, prompts, scan); the stored model is strict 2.0.
  const freeElementTypes = [...C4_KINDS.map(k => `c4:${k}`), ...Object.keys(ELEMENT_TYPES).flatMap(t => [`archimate:${t}`, t])];
  const freeRelTypes = ['uses', 'c4:uses', ...Object.keys(RELATIONSHIP_TYPES).flatMap(t => [`archimate:${t}`, t])];
  const propertyValue = { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }] };
  const str = { type: 'string' };
  const status = { enum: STATUSES };
  const sources = { type: 'array', items: { $ref: '#/$defs/source' } };
  const source = {
    type: 'object', required: ['kind'], additionalProperties: false,
    properties: { kind: { enum: SOURCE_KINDS }, ref: str, path: str, line: { type: 'integer', minimum: 1 }, excerpt: str, date: str },
  };
  const changelogEntry = {
    type: 'object', required: ['id', 'date'],
    properties: {
      id: str, date: str, source: { $ref: '#/$defs/source' }, summary: str,
      added: { type: 'array', items: str }, changed: { type: 'array', items: str },
      status: { type: 'object', additionalProperties: status }, removed: { type: 'array', items: str },
      decisions: { type: 'array', items: str },
    },
  };
  const element = {
    type: 'object', required: ['id', 'type'], additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 }, type: { enum: Object.keys(ELEMENT_TYPES) }, name: str, description: str, technology: str,
      tags: { type: 'array', items: str }, external: { type: 'boolean' },
      c4: { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { enum: Object.keys(C4_KIND_TYPES) } } },
      parent: str, group: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: propertyValue },
      owner: str, url: str, inferred: { type: 'boolean' }, confidence: { enum: ['alta', 'média', 'baixa', 'high', 'medium', 'low'] }, source: str,
      aliases: { type: 'array', items: str }, status, statusReason: str, sources,
    },
  };
  const relationship = {
    type: 'object', required: ['from', 'to'], additionalProperties: false,
    properties: {
      id: str, from: str, to: str, type: { enum: Object.keys(RELATIONSHIP_TYPES) }, description: str, technology: str,
      accessType: { enum: ['read', 'write', 'readwrite', 'access'] }, tags: { type: 'array', items: str },
      properties: { type: 'object', additionalProperties: propertyValue }, inferred: { type: 'boolean' },
      status, statusReason: str, sources,
    },
  };
  const view = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/view.schema.json',
    title: 'archlens view spec',
    type: 'object', required: ['key', 'notation'],
    properties: {
      key: { type: 'string', minLength: 1 }, notation: { enum: ['c4', 'archimate'] }, title: str, description: str,
      include: { type: 'array', items: str }, exclude: { type: 'array', items: str },
      layout: { type: 'object', properties: { direction: { enum: ['RIGHT', 'DOWN', 'LEFT', 'UP', 'auto'] }, aspectRatio: { type: 'number', exclusiveMinimum: 0 }, style: { enum: ['auto', 'flow', 'bands', 'bands-flow'] } }, additionalProperties: false },
      animation: { enum: ['trace', 'story', 'impact', 'layers'] }, edgeLabels: { type: 'boolean' },
      level: { enum: ['landscape', 'context', 'container', 'component', 'dynamic'] }, scope: str,
      groups: { description: 'groupings: cut the view to their members (only, crossOnly) and draw frames', type: 'object', additionalProperties: false,
        properties: { only: { type: 'array', items: str, minItems: 1 }, crossOnly: { type: 'boolean' }, frames: { type: 'boolean' } } },
      expand: { description: 'C4 container/dynamic: other software systems whose containers are also shown, each inside its own boundary', type: 'array', items: str },
      focus: { type: 'array', items: str }, depth: { type: 'integer', minimum: 0 },
      steps: { type: 'array', items: { type: 'object', properties: { from: str, to: str, rel: str, description: str, technology: str } } },
      viewpoint: { enum: ARCHIMATE_VIEWPOINTS }, layers: { type: 'array', items: { enum: LAYER_ORDER } },
      types: { type: 'array', items: str }, anchor: str,
      traverse: { type: 'object', additionalProperties: false, properties: {
        mode: { enum: ['supporters', 'dependents', 'both'] }, via: { type: 'array', items: { enum: Object.keys(RELATIONSHIP_TYPES) } },
        maxDepth: { type: 'integer', minimum: 1 }, hierarchy: { type: 'boolean' } } },
      granularity: { enum: ['component', 'container', 'system'] }, collapse: { type: 'array', items: str },
      status: { description: 'lifecycle statuses shown (default: all but retired)', type: 'array', items: status },
      nesting: { anyOf: [{ enum: ['edges', 'nested'] }, { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { enum: ['edges', 'nested'] }, depth: { type: 'integer', minimum: 1 } } }] },
      derive: { type: 'boolean' }, output: { type: 'array', items: { enum: ['diagram', 'matrix'] } },
    },
  };
  const model = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/model.schema.json',
    title: 'archlens model',
    type: 'object', required: ['model'],
    properties: {
      archlens: { type: 'string', pattern: '^2\\.\\d+$' }, name: str, description: str, meta: { type: 'object' },
      assumptions: { type: 'array', items: str },
      properties: { description: 'property catalog (archlens.json)', type: 'object', additionalProperties: { type: 'object', additionalProperties: false, properties: {
        label: str, type: { enum: ['string', 'number', 'boolean', 'string[]'] }, values: { type: 'array' }, appliesTo: { type: 'array', items: str } } } },
      model: { type: 'object', required: ['elements'], properties: {
        elements: { type: 'array', items: { $ref: '#/$defs/element' } },
        relationships: { type: 'array', items: { $ref: '#/$defs/relationship' } } } },
      views: { type: 'array', items: { $ref: 'view.schema.json' } },
      changelog: { type: 'array', items: { $ref: '#/$defs/changelogEntry' } },
    },
    $defs: { element, relationship, source, changelogEntry },
  };
  const deltaElement = {
    ...element, required: ['id'],
    properties: { ...element.properties, type: { enum: freeElementTypes },
      archimate: { enum: Object.keys(ELEMENT_TYPES).flatMap(t => [t, `archimate:${t}`]) },
      children: { type: 'array', items: { $ref: '#/$defs/element' } } },
  };
  const deltaRelationship = { ...relationship, properties: { ...relationship.properties, type: { enum: freeRelTypes } } };
  const op = (name, props, required) => ({
    type: 'object', additionalProperties: false, required: ['op', 'id', ...required],
    properties: { op: { const: name }, id: str, ...props },
  });
  const delta = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/delta.schema.json',
    title: 'archlens delta (one enrichment round)',
    type: 'object', required: ['archlens-delta'],
    properties: {
      'archlens-delta': { const: '1.0' }, source: { $ref: '#/$defs/source' }, summary: str, name: str, description: str,
      assumptions: { type: 'array', items: str },
      model: { type: 'object', properties: {
        elements: { type: 'array', items: { $ref: '#/$defs/element' } },
        relationships: { type: 'array', items: { $ref: '#/$defs/relationship' } } } },
      views: { type: 'array', items: { $ref: 'view.schema.json' } },
      ops: { type: 'array', items: { oneOf: [
        op('rename', { name: str }, ['name']),
        op('alias', { add: { type: 'array', items: str } }, ['add']),
        op('status', { status, reason: str }, ['status']),
        op('remove', {}, []),
      ] } },
    },
    $defs: { element: deltaElement, relationship: deltaRelationship, source },
  };
  const plan = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/plan.schema.json',
    title: 'archlens merge plan',
    type: 'object', required: ['archlens-plan', 'baseHash', 'delta', 'items'],
    properties: {
      'archlens-plan': { const: '1.0' }, base: str, baseHash: str, storeVersion: { type: ['string', 'null'] }, created: str, delta: { $ref: 'delta.schema.json' },
      items: { type: 'array', items: { type: 'object', required: ['n', 'key', 'class'], properties: {
        n: { type: 'integer' }, key: str,
        class: { enum: ['new', 'unchanged', 'enrich', 'conflict', 'possible-duplicate', 'op'] },
        kind: { enum: ['element', 'relationship', 'view', 'assumption'] },
        field: str, when: str, resolution: { type: ['string', 'null'] } } } },
      summary: { type: 'object', additionalProperties: { type: 'integer' } },
      blocked: { type: 'boolean' }, errors: { type: 'array' },
      // Only a final plan carries the store operations that apply it (the last one is appendHistory).
      state: { enum: ['open', 'final'] }, entry: { type: ['object', 'null'] },
      ops: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { enum: OPS } } } },
      // ref ("element:<id>", "relationship:<id>", "view:<key>", "note:<name>", "manifest") → version read (null: absent).
      objects: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
      // New element id → the possible duplicates found for it when the plan was made.
      knownCandidates: { type: 'object', additionalProperties: { type: 'array', items: str } },
    },
  };
  return { model, view, delta, plan };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const schemas = buildSchemas();
  for (const [name, schema] of Object.entries(schemas)) {
    writeFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), JSON.stringify(schema, null, 2) + '\n');
  }
  console.log(`✓ ${Object.keys(schemas).map(n => `schemas/${n}.schema.json`).join(', ')}`);
}
