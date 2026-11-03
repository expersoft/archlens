import type { Draft, PlanItem } from '../api';

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
}

const draftKey = (b: string) => `archlens-gui-draft:${b}`;
const chatKey = (b: string) => `archlens-gui-chat:${b}`;

/** The saved draft and conversation of a base, or null (nothing saved, unreadable, or storage blocked). */
export function load(base: string): { draft: Draft; chat: ChatMsg[] } | null {
  try {
    const rawDraft = localStorage.getItem(draftKey(base));
    if (rawDraft == null) return null;
    const draft = JSON.parse(rawDraft) as Draft;
    if (draft === null || typeof draft !== 'object') return null;
    let chat: ChatMsg[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(chatKey(base)) ?? '[]');
      if (Array.isArray(parsed)) chat = parsed as ChatMsg[];
    } catch { /* conversa ilegível: fica só o rascunho */ }
    return { draft, chat };
  } catch { return null; }
}

/** The draft always wins over the conversation: when storage is full the oldest messages go first. */
export function save(base: string, draft: Draft, chat: ChatMsg[]): 'ok' | 'chat-trimmed' | 'too-big' {
  try { localStorage.setItem(draftKey(base), JSON.stringify(draft)); } catch { return 'too-big'; }
  try {
    localStorage.setItem(chatKey(base), JSON.stringify(chat));
    return 'ok';
  } catch { /* cheio: corta a conversa */ }
  for (let keep = Math.floor(chat.length / 2); keep > 0; keep = Math.floor(keep / 2)) {
    try { localStorage.setItem(chatKey(base), JSON.stringify(chat.slice(-keep))); return 'chat-trimmed'; } catch { /* tenta menos */ }
  }
  try { localStorage.removeItem(chatKey(base)); } catch { /* sem storage */ }
  return 'chat-trimmed';
}

export function clear(base: string) {
  try { localStorage.removeItem(draftKey(base)); localStorage.removeItem(chatKey(base)); } catch { /* sem storage */ }
}
