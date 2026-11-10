import { useEffect, useState } from 'react';
import { planEdit, planElement, type Draft, type PlanElement, type ScreenEdit } from './api';
import { load, save, unreadable } from './plan/draftStore';

/** The stored draft changed (Planejar, another tab) or Planejar got busy while Navegar's edit was on the server. */
export const CHANGED = 'O rascunho mudou enquanto a edição era gravada; tente de novo';
/** Planejar holds a draft only in memory (too big to store): Navegar does not write one beside it. */
export const UNSAVED = 'O rascunho atual é grande demais para salvar; continue no Planejar';
/** The saved draft cannot be read: Navegar never writes over it. */
export const UNREADABLE = 'O rascunho salvo está ilegível; abra o Planejar para resolver';
const TOO_BIG = 'o rascunho não cabe no navegador; continue no Planejar';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const same = (a: Draft | null, b: Draft | null) => JSON.stringify(a) === JSON.stringify(b);

export interface BrowseNode {
  /** The node as the saved draft leaves it; null without a saved draft (Navegar shows the base's card). */
  el: PlanElement | null;
  /** The node as the server answered (the base's when there is no draft): the raw doc the editor starts from. */
  node: PlanElement | null;
  error: string | null;
  loading: boolean;
}

/**
 * The selected node of Navegar as the draft of Planejar leaves it. The draft is read from the browser's storage (the
 * only copy Navegar sees); `rev` changing reads it again (Planejar got free, the mode changed).
 */
export function useBrowseNode(base: string | null, id: string | null, enabled: boolean, rev?: unknown): BrowseNode {
  const key = enabled && base && id ? `${base}\u0000${id}\u0000${String(rev)}` : null;
  const [st, setSt] = useState<{ key: string; node: PlanElement | null; fromDraft: boolean; error: string | null } | null>(null);
  useEffect(() => {
    if (!key || !base || !id) return undefined;
    const draft = load(base)?.draft ?? null;
    let stale = false;
    planElement(base, draft, id).then(
      (node) => { if (!stale) setSt({ key, node, fromDraft: !!draft, error: null }); },
      (e: unknown) => { if (!stale) setSt({ key, node: null, fromDraft: !!draft, error: errMsg(e) }); },
    );
    return () => { stale = true; };
  }, [key, base, id]);
  const cur = key && st?.key === key ? st : null;
  if (!key) return { el: null, node: null, error: null, loading: false };
  // A new `rev` keeps what was shown until the new answer comes (same node): no flicker back to the base card.
  const shown = cur ?? (st && st.key.startsWith(`${base}\u0000${id}\u0000`) ? st : null);
  return {
    el: shown?.fromDraft ? shown.node : null,
    node: shown?.node ?? null,
    error: shown?.error ?? null,
    loading: !cur,
  };
}

/**
 * Puts a Navegar edit into Planejar's draft: the saved draft (or none, and the server starts one) goes with the edit
 * to `/plan/edit`, and the answer is saved with the conversation saved at that moment. Compare-and-swap: when the
 * saved draft changed meanwhile, or `blocked` says Planejar got busy, the answer is dropped. A server refusal (a saved
 * draft of another version, say) comes back as the error, with nothing saved.
 */
export async function confirmBrowseEdit(
  base: string,
  edit: ScreenEdit | ((draft: Draft | null) => ScreenEdit),
  opts: { blocked?: () => string | null } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const busy = opts.blocked?.();
  if (busy) return { ok: false, error: busy };
  if (unreadable(base)) return { ok: false, error: UNREADABLE };
  const before = load(base);
  const draft = before?.draft ?? null;
  let next: Draft;
  try {
    next = (await planEdit(base, draft, typeof edit === 'function' ? edit(draft) : edit)).draft;
  } catch (e) { return { ok: false, error: errMsg(e) }; }
  const now = load(base);
  if (unreadable(base) || !same(now?.draft ?? null, draft) || opts.blocked?.()) return { ok: false, error: CHANGED };
  const chat = now?.chat ?? [];
  if (save(base, next, chat) === 'too-big') {
    save(base, draft, chat); // what was there before goes back
    return { ok: false, error: TOO_BIG };
  }
  return { ok: true };
}
