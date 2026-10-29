import { useStoredState } from './store';

export type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [raw, setTheme] = useStoredState<string>('archlens-theme', systemTheme());
  const theme: Theme = raw === 'dark' ? 'dark' : 'light';
  return [theme, setTheme];
}
