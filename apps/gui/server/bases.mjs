// Registry of the bases the GUI serves: loads each one, keeps its model, and reloads it when the store version changes.
import { Worker } from 'node:worker_threads';
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';
import { contentVersion } from '../../../scripts/lib/store/ops.mjs';
import { subgraphOf } from '../../../scripts/lib/store/contract.mjs';
import { normalizeModel, c4KindOf } from '../../../scripts/lib/model.mjs';

const guiError = (message) => Object.assign(new Error(message), { code: 'E_GUI_BASE' });

/** A connector that goes to a remote on every read (gbrain git: one `git fetch` each), run synchronously. */
const isRemote = store => store.kind === 'gbrain';

/** The C4 kind of an element and the system it belongs to (itself, if it is one), over one model. */
export function navHelpers(model) {
  const kind = el => c4KindOf(model, el);
  const systemOf = id => {
    const seen = new Set();
    let cur = model.elements.get(id);
    while (cur && !seen.has(cur.id)) {
      if (kind(cur) === 'softwareSystem') return cur.id;
      seen.add(cur.id);
      cur = cur.parent ? model.elements.get(cur.parent) : undefined;
    }
    return null;
  };
  return { kind, systemOf };
}

/**
 * The context of one snapshot of the base: `raw`, its `version` and the model the views use. `readDoc(id)` resolves to the
 * current documentation of a node, read with `readRemoteDoc` on a remote connector.
 */
function contextOf(entry, store, raw, version, readRemoteDoc) {
  if (!raw) throw guiError('a base está vazia ou não existe');
  const model = normalizeModel(raw);
  const fmt = (model.issues ?? []).find(i => i.code === 'E_STORE_FORMAT');
  if (fmt) throw Object.assign(new Error(fmt.message), { code: 'E_STORE_FORMAT' });
  const { kind, systemOf } = navHelpers(model);
  // The reads of `query --element` over this snapshot: the card matches the views and never goes back to the connector.
  // The documentation is the exception: it is not in `raw`, so `readDoc` asks the connector for the current text, and on a
  // remote one that runs git on this thread (`ctx.readDoc` does not).
  const snapshot = { read: () => ({ raw }), readSubgraph: q => subgraphOf(raw, q), history: () => raw.changelog ?? [], readDoc: id => store.readDoc(id) };
  const readDoc = async id => (isRemote(store) ? readRemoteDoc(id) : snapshot.readDoc(id));
  return { id: entry.id, name: entry.name ?? model.name ?? entry.id, store, raw, model, version, kind, systemOf, snapshot, readDoc };
}

/** One read of the store: the version is that of the same snapshot. */
function readStore(store) {
  const snap = store.read();
  if (typeof snap?.then === 'function') {
    throw Object.assign(new Error('conector assíncrono ainda não suportado pela GUI'), { code: 'E_GUI_BASE' });
  }
  return { raw: snap?.raw ?? null, version: contentVersion(snap) };
}

/** A read in a worker thread (see bases-worker.mjs): `data` is { path, known } or { path, doc }. */
function readOffThread(data, workers) {
  return new Promise((done, fail) => {
    const w = new Worker(new URL('./bases-worker.mjs', import.meta.url), { workerData: data });
    workers.add(w);
    w.once('message', m => (m.error ? fail(Object.assign(new Error(m.error.message), { code: m.error.code })) : done(m)));
    w.once('error', fail);
    w.once('exit', code => { workers.delete(w); if (code) fail(guiError(`a leitura da base parou (código ${code})`)); });
  });
}

/** Runs `read` after the remote reads of this base under way: they all fetch and check out in the same worktree of the tip. */
const inTurn = (slot, read) => (slot.remoteRead = (slot.remoteRead ?? Promise.resolve()).then(read, read));

const describe = e => `${e.code ? `${e.code}: ` : ''}${e.message}`;

/**
 * `pollMs`: how often a local base (json, markdown) is checked. `remotePollMs`: a remote one (gbrain git), read in a
 * worker thread so its `git fetch` does not stall the requests.
 */
export function createBaseRegistry(config, { pollMs = 5000, remotePollMs = 30000 } = {}) {
  const slots = new Map(); // id → { entry, store?, remote, ctx?, error?, busy?, remoteRead? }
  const workers = new Set();
  for (const entry of config.bases) slots.set(entry.id, { entry, remote: false });

  const remoteDoc = slot => id => inTurn(slot, () => readOffThread({ path: slot.entry.path, doc: id }, workers)).then(m => m.text);

  const load = slot => {
    try {
      slot.store ??= openStore(resolveBase(slot.entry.path));
      slot.remote = isRemote(slot.store);
      const { raw, version } = readStore(slot.store);
      slot.ctx = contextOf(slot.entry, slot.store, raw, version, remoteDoc(slot));
      slot.error = undefined;
    } catch (e) { slot.ctx = undefined; slot.error = describe(e); }
  };

  // The first load is synchronous (a remote one included), so list()/get() work right after creation.
  for (const slot of slots.values()) load(slot);

  const check = async slot => {
    if (!slot.store) return load(slot);
    const known = slot.ctx?.version;
    const { raw, version } = slot.remote ? await inTurn(slot, () => readOffThread({ path: slot.entry.path, known }, workers)) : readStore(slot.store);
    if (slot.ctx && version === known) return;
    slot.ctx = contextOf(slot.entry, slot.store, raw, version, remoteDoc(slot));
    slot.error = undefined;
  };
  const refreshSlot = slot => (slot.busy ??= check(slot)
    .catch(e => { slot.ctx = undefined; slot.error = describe(e); })
    .finally(() => { slot.busy = null; }));
  const refresh = (pick = () => true) => Promise.all([...slots.values()].filter(pick).map(refreshSlot)).then(() => {});

  const timers = [
    setInterval(() => { refresh(s => !s.remote); }, pollMs),
    setInterval(() => { refresh(s => s.remote); }, remotePollMs),
  ];
  for (const t of timers) t.unref();

  return {
    refresh: () => refresh(),
    /** Reads one base again now (after the GUI wrote it), after any read already under way. */
    async reload(id) {
      const slot = slots.get(id);
      if (!slot) throw guiError(`base desconhecida: ${id}`);
      await slot.busy;
      await refreshSlot(slot);
    },
    list: () => [...slots.values()].map(({ entry, ctx, error }) => (ctx
      ? { id: entry.id, name: ctx.name, ok: true }
      : { id: entry.id, name: entry.name ?? entry.id, ok: false, error })),
    get(id) {
      const slot = slots.get(id);
      if (!slot) throw guiError(`base desconhecida: ${id}`);
      if (!slot.ctx) throw guiError(`base "${id}" com erro: ${slot.error}`);
      return slot.ctx;
    },
    close() {
      for (const t of timers) clearInterval(t);
      for (const w of workers) void w.terminate();
    },
  };
}
