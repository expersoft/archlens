import { toCanonical } from '../scripts/lib/canonical.mjs';
import { applyOps, contentVersion } from '../scripts/lib/store/ops.mjs';
import { subgraphOf, conflictError } from '../scripts/lib/store/contract.mjs';

/** A free-vocabulary fixture (c4:*, uses, children) as a 2.0 base, the way migrate writes it. */
export const asBase = raw => toCanonical(raw).raw;

/** In-memory connector over `base` ({ raw, notes } or null), recording each method called. */
export function memStore(base) {
  let cur = base ? { raw: structuredClone(base), notes: {} } : null;
  const calls = [];
  const track = (name, fn) => (...a) => { calls.push(name); return fn(...a); };
  return {
    calls,
    locator: { path: '/x/architecture' },
    read: track('read', () => (cur ? structuredClone(cur) : null)),
    version: track('version', () => contentVersion(cur)),
    apply: track('apply', (ops, { baseVersion } = {}) => {
      const now = contentVersion(cur);
      if (baseVersion !== undefined && baseVersion !== now) throw conflictError(baseVersion, now);
      cur = applyOps(cur, ops);
      return { version: contentVersion(cur), preserved: [] };
    }),
    history: track('history', () => cur?.raw.changelog ?? []),
    readSubgraph: track('readSubgraph', opts => subgraphOf(cur.raw, opts)),
  };
}
