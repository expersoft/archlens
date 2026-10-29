// Spec → ViewResult, with a small LRU cache keyed by base version and canonical spec.
import { buildView } from '../../../scripts/lib/view-build.mjs';

export const CACHE_MAX = 200;

/** JSON with object keys sorted recursively, so equivalent specs share a cache key. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function createViewCache(max = CACHE_MAX) {
  const map = new Map();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const v = map.get(key);
      map.delete(key); map.set(key, v);
      return v;
    },
    set(key, v) {
      map.delete(key); map.set(key, v);
      if (map.size > max) map.delete(map.keys().next().value);
    },
    get size() { return map.size; },
  };
}

const defaultCache = createViewCache();

/** @returns {Promise<object>} buildView result + { spec, title, cached } */
export async function renderSpec(ctx, spec, cache = defaultCache) {
  const key = `${ctx.version}\n${canonical(spec)}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };
  const built = await buildView(ctx.model, spec);
  const result = { ...built, spec, title: spec.title ?? spec.key ?? '', cached: false };
  cache.set(key, result);
  return result;
}
