import type { Draft, PlanItem } from '../api';
import type { CallLog } from '../CallFooter';

/** One message of the planning conversation. `text` is what goes back to the agent in `history`. */
export interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** A decision asked of the user; `answered` holds the resolution once chosen. */
  item?: PlanItem;
  answered?: string;
  warning?: string;
  error?: string;
  stage?: string;
  status?: 'running' | 'canceled';
  /** The agent's draft of the interpretation notes; `notesState` once the user decided. */
  notes?: { overview: string; notes: string };
  notesState?: 'saved' | 'skipped';
  /** Start, end and tokens of the agent's call behind this message. */
  call?: CallLog;
}

const draftKey = (b: string) => `archlens-gui-draft:${b}`;
const chatKey = (b: string) => `archlens-gui-chat:${b}`;

/**
 * The saved draft and conversation of a base, or null (nothing saved, unreadable, or storage blocked). After an apply
 * only the conversation is kept: `draft` is null then.
 */
export function load(base: string): { draft: Draft | null; chat: ChatMsg[] } | null {
  try {
    const rawDraft = localStorage.getItem(draftKey(base));
    let draft: Draft | null = null;
    if (rawDraft != null) {
      draft = JSON.parse(rawDraft) as Draft;
      if (draft === null || typeof draft !== 'object') return null;
    }
    let chat: ChatMsg[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(chatKey(base)) ?? '[]');
      if (Array.isArray(parsed)) chat = parsed as ChatMsg[];
    } catch { /* conversa ilegível: fica só o rascunho */ }
    return draft || chat.length ? { draft, chat } : null;
  } catch { return null; }
}

/** What a save that had to cut the conversation says (the draft is whole). */
export const TRIMMED = 'a conversa antiga foi cortada para caber no navegador; o rascunho está inteiro';

/**
 * The draft always wins over the conversation: when storage is full the oldest messages go first. Without a draft (after
 * an apply) only the conversation is kept.
 */
export function save(base: string, draft: Draft | null, chat: ChatMsg[]): 'ok' | 'chat-trimmed' | 'too-big' {
  const putDraft = () => { try { localStorage.setItem(draftKey(base), JSON.stringify(draft)); return true; } catch { return false; } };
  let trimmed = false;
  if (!draft) {
    try { localStorage.removeItem(draftKey(base)); } catch { /* sem storage */ }
  } else if (!putDraft()) {
    // the old conversation may be what fills the storage; a stale draft must not survive a failed write
    try { localStorage.removeItem(chatKey(base)); } catch { /* sem storage */ }
    trimmed = true;
    if (!putDraft()) {
      try { localStorage.removeItem(draftKey(base)); } catch { /* sem storage */ }
      return 'too-big';
    }
  }
  if (!chat.length) {
    try { localStorage.removeItem(chatKey(base)); } catch { /* sem storage */ }
    return trimmed ? 'chat-trimmed' : 'ok';
  }
  try {
    localStorage.setItem(chatKey(base), JSON.stringify(chat));
    return trimmed ? 'chat-trimmed' : 'ok';
  } catch { /* cheio: corta a conversa */ }
  for (let keep = Math.floor(chat.length / 2); keep > 0; keep = Math.floor(keep / 2)) {
    try { localStorage.setItem(chatKey(base), JSON.stringify(chat.slice(-keep))); return 'chat-trimmed'; } catch { /* tenta menos */ }
  }
  try { localStorage.removeItem(chatKey(base)); } catch { /* sem storage */ }
  return 'chat-trimmed';
}

/** A draft is saved but cannot be read (broken JSON, not an object): writing over it would lose it. */
export function unreadable(base: string): boolean {
  let raw: string | null;
  try { raw = localStorage.getItem(draftKey(base)); } catch { return false; }
  if (raw == null) return false;
  try { const d: unknown = JSON.parse(raw); return d === null || typeof d !== 'object'; } catch { return true; }
}

export function clear(base: string) {
  try { localStorage.removeItem(draftKey(base)); localStorage.removeItem(chatKey(base)); } catch { /* sem storage */ }
}

/** The draft changes something: a delta from the conversation or edits made on screen. */
export const hasChanges = (d: Draft | null): boolean =>
  !!d && (!!d.delta || Object.keys((d.edits as object | undefined) ?? {}).length > 0);
