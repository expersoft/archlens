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
}
export interface Catalog { id: string; name: string; views: ViewEntry[]; elements: ElementEntry[] }
export interface FindHit { id: string; name: string; type: string; kind?: string | null; score: number }
export type ViewSpec = { level?: string; [k: string]: unknown };
export interface ViewResult {
  html: string;
  data: unknown;
  alerts: string[];
  nodes: unknown;
  layoutStyle?: string;
  ms: { resolve: number; layout: number; render: number };
  spec: ViewSpec;
  title: string;
  cached: boolean;
}
export interface Action { label: string; spec?: ViewSpec; sub?: Action[]; primary?: boolean; matrix?: boolean }
export interface ElementDetail { card: unknown; actions: Action[] }

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
export const flip = (base: string, spec: ViewSpec) => call<{ spec: ViewSpec }>(`${b(base)}/flip`, { spec });
