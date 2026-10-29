import { useEffect, type ReactNode } from 'react';
import { useStoredState } from './store';
import { useTheme, type Theme } from './theme';

export type LeftTab = 'chat' | 'tree' | null;

export interface ShellProps {
  leftContent: { chat: ReactNode; tree: ReactNode };
  rightContent: ReactNode;
  children: ReactNode;
  presenting?: boolean;
  status?: ReactNode;
  /** Se informado, o tema é controlado por quem chama (App); senão o Shell guarda o seu. */
  theme?: Theme;
  onThemeChange?: (t: Theme) => void;
}

const narrow = () => typeof window !== 'undefined' && window.innerWidth < 1100;

export function Shell(p: ShellProps) {
  const [left, setLeft] = useStoredState<LeftTab>('archlens-left', narrow() ? null : 'chat');
  const [lastLeft, setLastLeft] = useStoredState<'chat' | 'tree'>('archlens-left-last', 'chat');
  const [right, setRight] = useStoredState<boolean>('archlens-right', !narrow());
  const [ownTheme, setOwnTheme] = useTheme();
  const theme = p.theme ?? ownTheme;
  const setTheme = p.onThemeChange ?? setOwnTheme;
  const presenting = !!p.presenting;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // largura estreita na montagem: as duas começam fechadas (sobrepõe o valor guardado)
  useEffect(() => {
    if (narrow()) { setLeft(null); setRight(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (left) setLastLeft(left); }, [left, setLastLeft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      if (e.altKey) setRight((r) => !r);
      else setLeft((l) => (l ? null : lastLeft));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastLeft, setLeft, setRight]);

  const toggleLeft = (tab: 'chat' | 'tree') => setLeft((l) => (l === tab ? null : tab));

  return (
    <div className="app" data-presenting={presenting || undefined}>
      {!presenting && (
        <header className="top" data-testid="topbar">
          <b>archlens</b>
          <select aria-label="Base" disabled><option>Base</option></select>
          <input type="search" placeholder="Buscar elemento…" aria-label="Buscar" disabled />
          <div className="seg" role="group" aria-label="Notação">
            <button className="on" disabled>ArchiMate</button>
            <button disabled>C4</button>
          </div>
          <span className="status">{p.status}</span>
          <button className="icon" aria-label="Alternar tema" title="Alternar tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </header>
      )}
      <div className="main">
        {!presenting && (
          <nav className="rail" aria-label="Painel esquerdo">
            <button aria-label="Conversa" title="Conversa (Ctrl+B)" className={left === 'chat' ? 'on' : ''} onClick={() => toggleLeft('chat')}>💬</button>
            <button aria-label="Explorador" title="Explorador (Ctrl+B)" className={left === 'tree' ? 'on' : ''} onClick={() => toggleLeft('tree')}>🗂</button>
          </nav>
        )}
        {!presenting && left && (
          <aside className="side" data-testid="side-left">{left === 'chat' ? p.leftContent.chat : p.leftContent.tree}</aside>
        )}
        <main className="center">{p.children}</main>
        {!presenting && right && (
          <aside className="side r" data-testid="side-right">{p.rightContent}</aside>
        )}
        {!presenting && (
          <nav className="rail r" aria-label="Painel direito">
            <button aria-label="Detalhes" title="Detalhes (Ctrl+Alt+B)" className={right ? 'on' : ''} onClick={() => setRight((r) => !r)}>ⓘ</button>
          </nav>
        )}
      </div>
    </div>
  );
}
