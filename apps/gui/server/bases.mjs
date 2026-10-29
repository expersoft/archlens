// Registry of the bases the GUI serves: loads each one, keeps its model, and reloads it when the store version changes.
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';
import { normalizeModel, c4KindOf } from '../../../scripts/lib/model.mjs';

const guiError = (message) => Object.assign(new Error(message), { code: 'E_GUI_BASE' });

function loadContext(entry) {
  const store = openStore(resolveBase(entry.path));
  const version = store.version();
  const snap = store.read();
  if (typeof version?.then === 'function' || typeof snap?.then === 'function') {
    throw Object.assign(new Error('conector assíncrono ainda não suportado pela GUI'), { code: 'E_GUI_BASE' });
  }
  const { raw } = snap;
  const model = normalizeModel(raw);
  const fmt = (model.issues ?? []).find(i => i.code === 'E_STORE_FORMAT');
  if (fmt) throw Object.assign(new Error(fmt.message), { code: 'E_STORE_FORMAT' });
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
  return { id: entry.id, name: entry.name ?? model.name ?? entry.id, store, raw, model, version, kind, systemOf };
}

const describe = e => `${e.code ? `${e.code}: ` : ''}${e.message}`;

export function createBaseRegistry(config, { pollMs = 5000 } = {}) {
  const slots = new Map(); // id → { entry, ctx?, error? }
  for (const entry of config.bases) slots.set(entry.id, { entry });

  const load = slot => {
    try { slot.ctx = loadContext(slot.entry); slot.error = undefined; }
    catch (e) { slot.ctx = undefined; slot.error = describe(e); }
  };

  // File connectors are synchronous, so list()/get() work right after creation.
  for (const slot of slots.values()) load(slot);

  let busy = null;
  const refresh = () => (busy ??= (async () => {
    for (const slot of slots.values()) {
      try {
        if (!slot.ctx || slot.ctx.store.version() !== slot.ctx.version) load(slot);
      } catch (e) { slot.ctx = undefined; slot.error = describe(e); }
    }
  })().finally(() => { busy = null; }));

  const timer = setInterval(() => { refresh().catch(() => {}); }, pollMs);
  timer.unref();

  return {
    refresh,
    list: () => [...slots.values()].map(({ entry, ctx, error }) => (ctx
      ? { id: entry.id, name: ctx.name, ok: true }
      : { id: entry.id, name: entry.name ?? entry.id, ok: false, error })),
    get(id) {
      const slot = slots.get(id);
      if (!slot) throw guiError(`base desconhecida: ${id}`);
      if (!slot.ctx) throw guiError(`base "${id}" com erro: ${slot.error}`);
      return slot.ctx;
    },
    close() { clearInterval(timer); },
  };
}
