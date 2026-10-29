// Per-object versions: the objects a plan reads and writes, and their versions in a base. An object is an element, a
// relationship, a view, a note or the manifest; the history never is. Pure.
import { createHash } from 'node:crypto';
import { canonicalJson } from '../merge.mjs';
import { manifestOf, relationshipsById } from './ops.mjs';

/** "element:<id>", "relationship:<id>", "view:<key>", "note:<name>"; the manifest is just "manifest". */
export const refOf = (kind, id) => (kind === 'manifest' ? 'manifest' : `${kind}:${id}`);

const parseRef = ref => {
  const at = ref.indexOf(':');
  return at < 0 ? { kind: ref, id: null } : { kind: ref.slice(0, at), id: ref.slice(at + 1) };
};

/**
 * The objects `ops` write. A relationship lives with its origin element, so writing it writes that element too
 * (for a removed relationship, the origin is looked up in `snapshot` when given).
 */
export function writeSetOf(ops, snapshot) {
  const out = new Set();
  let origins;
  const originOf = id => {
    origins ??= relationshipsById(snapshot?.raw);
    return origins.get(id)?.from;
  };
  for (const op of ops ?? []) {
    switch (op?.op) {
      case 'setManifest': out.add('manifest'); break;
      case 'upsertElement': out.add(refOf('element', op.element.id)); break;
      case 'removeElement': out.add(refOf('element', op.id)); break;
      case 'upsertRelationship':
        out.add(refOf('relationship', op.relationship.id));
        if (op.relationship.from != null) out.add(refOf('element', op.relationship.from));
        break;
      case 'removeRelationship': {
        out.add(refOf('relationship', op.id));
        const from = originOf(op.id);
        if (from != null) out.add(refOf('element', from));
        break;
      }
      case 'putView': out.add(refOf('view', op.view.key)); break;
      case 'removeView': out.add(refOf('view', op.key)); break;
      case 'putNote': out.add(refOf('note', op.name)); break;
      default: break; // appendHistory: the history is never a conflict
    }
  }
  return out;
}

const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/**
 * ref → version in `snapshot` ({ raw, notes } or null), null when the object does not exist: the hash of the canonical
 * content of an element with the relationships that leave it (a relationship has its origin element's version), of a
 * view, of a note's text or of the manifest. For connectors without their own objectVersions.
 */
export function objectVersionsOf(snapshot, refs) {
  const raw = snapshot?.raw ?? null;
  const elements = new Map((raw?.model?.elements ?? []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  const rels = relationshipsById(raw);
  const outgoing = new Map();
  for (const r of rels.values()) outgoing.set(r.from, [...(outgoing.get(r.from) ?? []), r]);
  const elementVersion = id => {
    const element = elements.get(id);
    if (!element) return null;
    const relationships = (outgoing.get(id) ?? []).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return sha(canonicalJson({ element, relationships }));
  };
  const versionOf = ref => {
    const { kind, id } = parseRef(ref);
    switch (kind) {
      case 'element': return elementVersion(id);
      case 'relationship': return rels.has(id) ? elementVersion(rels.get(id).from) : null;
      case 'view': {
        const view = (raw?.views ?? []).find(v => v?.key === id);
        return view ? sha(canonicalJson(view)) : null;
      }
      case 'note': return snapshot?.notes?.[id] != null ? sha(snapshot.notes[id]) : null;
      case 'manifest': return raw ? sha(canonicalJson(manifestOf(raw))) : null;
      default: return null;
    }
  };
  return new Map([...refs].map(ref => [ref, versionOf(ref)]));
}

/** The refs of `expect` (ref → version a plan read) whose version in `current` (ref → version) differs. */
export function checkExpect(current, expect) {
  const out = [];
  for (const [ref, planned] of Object.entries(expect ?? {})) {
    const now = current.get(ref) ?? null;
    if (now !== (planned ?? null)) out.push({ ref, planned: planned ?? null, current: now });
  }
  return out;
}
