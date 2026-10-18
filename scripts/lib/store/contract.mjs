// The connector contract (store v2): what every store adapter offers, the default subgraph reader, and fileConnector,
// which builds a connector from "how to read the base folder" and "which files the base should have".
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyOps, contentVersion, manifestOf } from './ops.mjs';
import { writeFilesAtomically } from './atomic.mjs';
import { storeError } from './errors.mjs';
import { objectVersionsOf, checkExpect } from './versions.mjs';

export const CONNECTOR_METHODS = ['describe', 'read', 'readSubgraph', 'version', 'objectVersions', 'apply', 'history'];
export const CONNECTOR_KINDS = ['json', 'markdown', 'legacy'];
// "object": each object has its own version (apply checks the plan's objects); "base": one version for the whole base.
export const VERSIONING = ['object', 'base'];

export function checkConnector(c) {
  if (!CONNECTOR_KINDS.includes(c?.kind)) throw new Error(`conector de tipo desconhecido: ${c?.kind}`);
  if (!VERSIONING.includes(c.versioning)) throw new Error(`o conector ${c.kind} não declara versioning (${VERSIONING.join(' | ')})`);
  for (const m of CONNECTOR_METHODS) if (typeof c[m] !== 'function') throw new Error(`o conector ${c.kind} não tem ${m}()`);
  return c;
}

/** objectVersions for a "base" connector: the version of the whole base for every ref. */
export const baseVersions = (refs, snapshot) => new Map([...refs].map(ref => [ref, contentVersion(snapshot)]));

export const short = v => (v ? String(v).replace(/^sha256:/, '').slice(0, 12) : 'base inexistente');
export const conflictError = (baseVersion, now) => storeError('E_STORE_CONFLICT',
  `a base mudou depois que as mudanças foram calculadas (${short(baseVersion)} → ${short(now)}); nada foi gravado. `
  + 'Gere o plano de novo com "archlens merge --plan"');
/** Objects of the plan (`conflicts`: [{ ref, planned, current }]) that changed since it was made. */
export const objectConflictError = conflicts => storeError('E_STORE_CONFLICT',
  `${conflicts.length} objeto(s) do plano mudaram depois que as mudanças foram calculadas (${conflicts.map(c => c.ref).join(', ')}); nada foi gravado. `
  + 'Gere o plano de novo com "archlens plan --answers"', { conflicts });

/**
 * The part of `raw` reachable from `seeds` in `depth` hops over relationships (of the types in `via`, all when absent)
 * and parent links, plus the ancestors and groupings of what was reached, so the result validates.
 */
export function subgraphOf(raw, { seeds = [], depth = 1, via } = {}) {
  const els = new Map((raw.model?.elements ?? []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  for (const s of seeds) if (!els.has(s)) throw storeError('E_UNKNOWN_REF', `"${s}" não existe na base`);
  const allowed = via ? new Set(via) : null;
  const next = new Map();
  const link = (a, b) => { if (!next.has(a)) next.set(a, new Set()); next.get(a).add(b); };
  for (const r of raw.model?.relationships ?? []) {
    if (r && els.has(r.from) && els.has(r.to) && (!allowed || allowed.has(r.type))) { link(r.from, r.to); link(r.to, r.from); }
  }
  for (const e of els.values()) if (e.parent != null && els.has(e.parent)) { link(e.id, e.parent); link(e.parent, e.id); }
  const keep = new Set(seeds);
  let frontier = [...seeds];
  for (let d = 0; d < depth; d++) {
    const found = [];
    for (const id of frontier) for (const x of next.get(id) ?? []) if (!keep.has(x)) { keep.add(x); found.push(x); }
    frontier = found;
  }
  for (const id of [...keep]) {
    for (let p = els.get(id)?.parent; p != null && els.has(p) && !keep.has(p); p = els.get(p).parent) keep.add(p);
  }
  for (const id of [...keep]) { const g = els.get(id)?.group; if (g != null && els.has(g)) keep.add(g); }
  return { raw: { ...manifestOf(raw), model: {
    elements: (raw.model?.elements ?? []).filter(e => keep.has(e?.id)),
    relationships: (raw.model?.relationships ?? []).filter(r => keep.has(r?.from) && keep.has(r?.to)),
  } } };
}

/** The round the ops appended, as written (its id is the one given when written), or null. */
export const appendedEntry = (next, ops) => (ops.some(o => o?.op === 'appendHistory') ? next.raw.changelog?.at(-1) ?? null : null);

/**
 * A connector over a base folder. `load(opts)` reads it ({ raw, notes, ctx } or null when there is no base);
 * `contents(next, cur)` lists every file the base should have (relative path → text, null to delete); `after(next)`
 * runs once the files are in place; `preserved()` lists the files this apply wrote to keep text people wrote in what it
 * removed. apply writes only the files whose text changes, all or nothing, once the plan's versions still hold: `expect`
 * (ref → version, for "object" connectors) or `baseVersion`; checked on the base it reads and again right before the swap.
 */
export function fileConnector({ kind, dir, locator, describe, load, contents, after, preserved, versioning = 'base' }) {
  const c = {
    kind, writable: true, locator, versioning,
    describe: () => describe,
    read(opts) { const r = load(opts); return r && { raw: r.raw, notes: r.notes }; },
    readSubgraph(query) {
      const r = c.read();
      if (!r) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${describe}`);
      return subgraphOf(r.raw, query);
    },
    version() { return contentVersion(c.read()); },
    objectVersions(refs, snapshot = c.read()) {
      return versioning === 'object' ? objectVersionsOf(snapshot, refs) : baseVersions(refs, snapshot);
    },
    history() { return c.read()?.raw.changelog ?? []; },
    apply(ops, { expect, baseVersion = null } = {}) {
      const verify = base => {
        if (expect) {
          const conflicts = checkExpect(c.objectVersions(Object.keys(expect), base), expect);
          if (conflicts.length) throw objectConflictError(conflicts);
          return;
        }
        const now = contentVersion(base);
        if (now !== baseVersion) throw conflictError(baseVersion, now);
      };
      const cur = load();
      verify(cur);
      const next = applyOps(cur, ops);
      const changes = new Map();
      for (const [rel, text] of contents(next, cur)) {
        const path = join(dir, rel);
        const exists = existsSync(path);
        if (text === null ? exists : !(exists && readFileSync(path, 'utf8') === text)) changes.set(rel, text);
      }
      writeFilesAtomically(dir, changes, { check: () => verify(load()) });
      after?.(next);
      return { version: contentVersion(next), preserved: preserved?.() ?? [], entry: appendedEntry(next, ops) };
    },
  };
  return c;
}
