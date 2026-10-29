export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, code: string | undefined, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface BaseInfo { id: string; name: string; ok: boolean; error?: string }
export interface ViewEntry { key: string; title: string; spec: ViewSpec; saved: boolean }
export interface ElementEntry {
  id: string; name: string; type: string; layer: string; kind?: string | null; parent?: string | null; group?: string | null;
  /** Nome ArchiMate do tipo e nome C4 do tipo (null sem tipo C4), já prontos para mostrar. */
  typeLabel?: string; c4Label?: string | null;
}
export interface Catalog { id: string; name: string; views: ViewEntry[]; elements: ElementEntry[] }
export interface FindHit { id: string; name: string; type: string; kind?: string | null; typeLabel?: string; c4Label?: string | null; score: number }
export type ViewSpec = { level?: string; [k: string]: unknown };
/** Estado do aninhamento da visão (null: C4 ou sem pai visual). */
export interface NestState { mode: 'edges' | 'nested'; except: string[]; holders: string[]; open: string[] }
export interface ViewResult {
  html: string;
  data: unknown;
  alerts: string[];
  nodes: unknown;
  layoutStyle?: string;
  ms: { resolve: number; layout: number; render: number };
  spec: ViewSpec;
  title: string;
  nest?: NestState | null;
  cached: boolean;
}
export interface Action { label: string; spec?: ViewSpec; sub?: Action[]; primary?: boolean; matrix?: boolean }
export interface ViewNode {
  name: string; typeLabel?: string; c4Label?: string | null; layer?: string; technology?: string | null; description?: string | null;
  role?: string | null; isAnchor?: boolean; distance?: number | null; status?: string;
}
export interface ViewEdge {
  id: string; from: string; to: string; type: string; label?: string | null; technology?: string | null; derived?: boolean;
  help?: { sentence?: string };
}
export interface ViewData { nodes: Record<string, ViewNode>; edges: ViewEdge[] }
export interface Ref { id: string; name: string; type?: string }
export interface RelRef extends Ref { label?: string | null; technology?: string | null; sentence?: string }
export interface Card {
  element: { id: string; name: string; type: string; kind?: string | null; typeLabel?: string; c4Label?: string | null; status?: string; technology?: string | null; description?: string | null; aliases?: string[] };
  parent: Ref | null;
  children: Ref[];
  outgoing: Record<string, RelRef[]>;
  incoming: Record<string, RelRef[]>;
  properties?: Record<string, unknown>;
  sources?: { kind?: string; ref?: string; excerpt?: string; date?: string }[];
  rounds?: { id?: string; date?: string; summary?: string; how?: string[] }[];
}
export interface ElementDetail { card: Card | null; actions: Action[] }

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* corpo não JSON */ }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(e.error ?? `HTTP ${res.status}`, e.code, res.status);
  }
  return data as T;
}

const b = (base: string) => `/api/bases/${encodeURIComponent(base)}`;

export const getBases = () => call<BaseInfo[]>('/api/bases');
export const getCatalog = (base: string) => call<Catalog>(`${b(base)}/catalog`);
export const find = (base: string, q: string) => call<FindHit[]>(`${b(base)}/find?q=${encodeURIComponent(q)}`);
export const getView = (base: string, spec: ViewSpec) => call<ViewResult>(`${b(base)}/view`, { spec });
export const getElement = (base: string, id: string) => call<ElementDetail>(`${b(base)}/elements/${encodeURIComponent(id)}`);
/** Só as ações (menu de contexto, duplo clique, Explorador), sem o cartão. */
export const getActions = (base: string, id: string) => call<{ actions: Action[] }>(`${b(base)}/elements/${encodeURIComponent(id)}/actions`);
export const flip = (base: string, spec: ViewSpec) => call<{ spec: ViewSpec }>(`${b(base)}/flip`, { spec });

export interface Info { ask: { enabled: false } | { enabled: true; provider: string; model: string; mode: 'tools' | 'json' } }
export const getInfo = () => call<Info>('/api/info');

export interface AskOption { id: string; name: string; typeLabel?: string; c4Label?: string | null; type?: string }
export type AskResult =
  | { kind: 'view'; spec: ViewSpec; title?: string; answer?: boolean; warning?: string }
  | { kind: 'element'; id: string; warning?: string }
  | { kind: 'clarify'; question?: string; options: AskOption[]; warning?: string }
  | { kind: 'none'; warning?: string };
export interface AnswerRow { name: string; type: string; kind?: string | null; status?: string | null; technology?: string | null }
export interface MatrixRow { name: string; typeLabel?: string; layerLabel?: string; role?: string; distance?: number | null; path: { via: string; name: string }[]; shown?: boolean }
export interface ViewAnswer {
  title: string; spec: ViewSpec;
  sections: { label: string; rows: AnswerRow[] }[];
  edges: { from: string; to: string; type: string; sentence: string }[];
  matrix?: MatrixRow[];
  notes: string[];
}
export interface AskRequest {
  question: string;
  context?: { spec?: ViewSpec; nodes?: string[]; selected?: string };
  chosen?: string;
  history?: { question: string; title?: string }[];
}
export type AskEvent =
  | { type: 'stage'; stage: string }
  | { type: 'tool'; name: string; ok: boolean; ms: number }
  | { type: 'result'; result: AskResult; view?: ViewResult; answer?: ViewAnswer; markdown?: string }
  | { type: 'error'; error: string; code?: string }
  | { type: 'done'; metrics: { total: number; [k: string]: unknown } };

/** A pergunta como fluxo NDJSON: um evento por linha. Abortar o sinal fecha a conexão (e o servidor para o agente). */
export async function ask(base: string, body: AskRequest, onEvent: (e: AskEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${b(base)}/ask`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) {
    let data: { error?: string; code?: string } = {};
    try { data = await res.json(); } catch { /* corpo não JSON */ }
    throw new ApiError(data.error ?? `HTTP ${res.status}`, data.code, res.status);
  }
  if (!res.body) throw new ApiError('resposta sem corpo', undefined, res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const flush = (line: string) => { if (line.trim()) onEvent(JSON.parse(line) as AskEvent); };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { flush(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  flush(buf + dec.decode());
}
