import { useCallback, useState } from 'react';

// Strings ficam cruas (ex.: archlens-theme = "dark", como a página do iframe lê); o resto vai em JSON.
function read<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return initial;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
  } catch { return initial; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* sem storage */ }
}

export function useStoredState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => read(key, initial));
  const set = useCallback((v: T | ((p: T) => T)) => {
    setVal((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      write(key, next);
      return next;
    });
  }, [key]);
  return [val, set];
}
