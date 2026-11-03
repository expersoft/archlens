import { useStoredState } from './store';

export type Theme = 'light' | 'dark';

/** Tema da interface (barra, laterais). Separado do tema do diagrama. */
export const GUI_THEME_KEY = 'archlens-gui-theme';
/** Tema do diagrama: a mesma chave que a página do iframe lê (scripts/lib/render.mjs). */
export const DIAGRAM_THEME_KEY = 'archlens-theme';

function systemTheme(): Theme {
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

const asTheme = (raw: string): Theme => (raw === 'dark' ? 'dark' : 'light');

/** Tema da interface; sem escolha própria, herda o tema do diagrama gravado (antes eram um só) ou o do sistema. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [raw, setTheme] = useStoredState<string>(GUI_THEME_KEY, stored(DIAGRAM_THEME_KEY) ?? systemTheme());
  return [asTheme(raw), setTheme];
}

/** Tema do diagrama, independente do da interface. */
export function useDiagramTheme(): [Theme, (t: Theme) => void] {
  const [raw, setTheme] = useStoredState<string>(DIAGRAM_THEME_KEY, systemTheme());
  return [asTheme(raw), setTheme];
}
