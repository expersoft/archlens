#!/usr/bin/env node
// Regenerates schemas/*.schema.json from the registry so enums never drift from the code.
import { writeFileSync } from 'node:fs';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, C4_KINDS, LAYER_ORDER } from './lib/registry.mjs';
import { ARCHIMATE_VIEWPOINTS } from './lib/query-archimate.mjs';

export function buildSchemas() {
  const elementTypes = [...C4_KINDS.map(k => `c4:${k}`), ...Object.keys(ELEMENT_TYPES).flatMap(t => [`archimate:${t}`, t])];
  const relTypes = ['uses', 'c4:uses', ...Object.keys(RELATIONSHIP_TYPES).flatMap(t => [`archimate:${t}`, t])];
  const str = { type: 'string' };
  const element = {
    type: 'object', required: ['id', 'type'], additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 }, type: { enum: elementTypes }, name: str, description: str, technology: str,
      tags: { type: 'array', items: str }, external: { type: 'boolean' }, archimate: { enum: Object.keys(ELEMENT_TYPES).flatMap(t => [t, `archimate:${t}`]) },
      parent: str, children: { type: 'array', items: { $ref: '#/$defs/element' } },
      properties: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
      owner: str, url: str, inferred: { type: 'boolean' }, confidence: { enum: ['alta', 'média', 'baixa', 'high', 'medium', 'low'] }, source: str,
    },
  };
  const relationship = {
    type: 'object', required: ['from', 'to'], additionalProperties: false,
    properties: {
      id: str, from: str, to: str, type: { enum: relTypes }, description: str, technology: str,
      accessType: { enum: ['read', 'write', 'readwrite', 'access'] }, tags: { type: 'array', items: str },
      properties: { type: 'object' }, inferred: { type: 'boolean' },
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
      layout: { type: 'object', properties: { direction: { enum: ['RIGHT', 'DOWN', 'LEFT', 'UP', 'auto'] }, aspectRatio: { type: 'number', exclusiveMinimum: 0 } }, additionalProperties: false },
      animation: { enum: ['trace', 'story', 'impact', 'layers'] }, edgeLabels: { type: 'boolean' },
      level: { enum: ['landscape', 'context', 'container', 'component', 'dynamic'] }, scope: str,
      expand: { description: 'C4 container/dynamic: other software systems whose containers are also shown, each inside its own boundary', type: 'array', items: str },
      focus: { type: 'array', items: str }, depth: { type: 'integer', minimum: 0 },
      steps: { type: 'array', items: { type: 'object', properties: { from: str, to: str, rel: str, description: str, technology: str } } },
      viewpoint: { enum: ARCHIMATE_VIEWPOINTS }, layers: { type: 'array', items: { enum: LAYER_ORDER } },
      types: { type: 'array', items: str }, anchor: str,
      traverse: { type: 'object', additionalProperties: false, properties: {
        mode: { enum: ['supporters', 'dependents', 'both'] }, via: { type: 'array', items: { enum: Object.keys(RELATIONSHIP_TYPES) } },
        maxDepth: { type: 'integer', minimum: 1 }, hierarchy: { type: 'boolean' } } },
      granularity: { enum: ['component', 'container', 'system'] }, collapse: { type: 'array', items: str },
      derive: { type: 'boolean' }, output: { type: 'array', items: { enum: ['diagram', 'matrix'] } },
    },
  };
  const model = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/model.schema.json',
    title: 'archlens model',
    type: 'object', required: ['model'],
    properties: {
      archlens: str, name: str, description: str, meta: { type: 'object' },
      assumptions: { type: 'array', items: str },
      model: { type: 'object', required: ['elements'], properties: {
        elements: { type: 'array', items: { $ref: '#/$defs/element' } },
        relationships: { type: 'array', items: { $ref: '#/$defs/relationship' } } } },
      views: { type: 'array', items: { $ref: 'view.schema.json' } },
    },
    $defs: { element, relationship },
  };
  return { model, view };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { model, view } = buildSchemas();
  writeFileSync(new URL('../schemas/model.schema.json', import.meta.url), JSON.stringify(model, null, 2) + '\n');
  writeFileSync(new URL('../schemas/view.schema.json', import.meta.url), JSON.stringify(view, null, 2) + '\n');
  console.log('✓ schemas/model.schema.json, schemas/view.schema.json');
}
