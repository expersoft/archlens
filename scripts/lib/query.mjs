import { resolveC4 } from './query-c4.mjs';
import { resolveArchimate } from './query-archimate.mjs';
import { viewError } from './query-util.mjs';

/** Resolve a view spec against a normalized model into a view IR (nodes, edges, boundaries/layers). */
export function resolveView(model, spec) {
  if (!spec || typeof spec !== 'object') throw viewError('E_VIEW_SPEC', 'visão inválida', 'passe um objeto com "key" e "notation"');
  const withKey = { key: spec.key ?? 'view', ...spec };
  if (withKey.notation === 'c4') return resolveC4(model, withKey);
  if (withKey.notation === 'archimate') return resolveArchimate(model, withKey);
  throw viewError('E_VIEW_NOTATION', `notação "${spec.notation}" desconhecida`, 'use "c4" ou "archimate"');
}
