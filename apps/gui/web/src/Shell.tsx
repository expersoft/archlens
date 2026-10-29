import { useEffect, useRef, type ReactNode } from 'react';
import type { BaseInfo } from './api';
import { useStoredState } from './store';
import { isGuiShortcut } from './shortcuts';
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
  /** Notação da visão atual; o seletor ArchiMate | C4 só age se onNotation for informado. */
  notation?: 'archimate' | 'c4';
  onNotation?: (n: 'archimate' | 'c4') => void;
  bases?: BaseInfo[];
  base?: string | null;
  onBase?: (id: string) => void;
  /** Enter no campo de busca, com texto não vazio. */
  onSearch?: (q: string) => void;
  /** Cada incremento abre a aba Conversa (ex.: lista de resultados da busca). */
  chatRequest?: number;
  /** Cada incremento abre a lateral direita (ex.: cartão do elemento achado por uma pergunta). */
  rightRequest?: number;
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
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // largura estreita na montagem: as duas começam fechadas (sobrepõe o valor guardado)
  useEffect(() => {
    if (narrow()) { setLeft(null); setRight(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (left) setLastLeft(left); }, [left, setLastLeft]);
  useEffect(() => { if (p.chatRequest) setLeft('chat'); }, [p.chatRequest, setLeft]);
  useEffect(() => { if (p.rightRequest) setRight(true); }, [p.rightRequest, setRight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isGuiShortcut(e)) return;
      if (e.code === 'KeyK') { e.preventDefault(); search.current?.focus(); search.current?.select(); return; }
      if (e.code !== 'KeyB') return;
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
          <select aria-label="Base" value={p.base ?? ''} disabled={!p.bases?.length || !p.onBase} onChange={(e) => p.onBase?.(e.target.value)}>
            {!p.bases?.length && <option value="">Base</option>}
            {p.bases?.map((b) => <option key={b.id} value={b.id} disabled={!b.ok} title={b.ok ? undefined : b.error}>{b.name}</option>)}
          </select>
          <input
            ref={search}
            type="search"
            placeholder="Buscar elemento ou perguntar… (Ctrl+K)"
            aria-label="Buscar"
            disabled={!p.onSearch}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const q = e.currentTarget.value.trim();
              if (q) p.onSearch?.(q);
            }}
          />
          <div className="seg" role="group" aria-label="Notação">
            <button className={p.notation !== 'c4' ? 'on' : ''} disabled={!p.onNotation} onClick={() => p.notation === 'c4' && p.onNotation?.('archimate')}>ArchiMate</button>
            <button className={p.notation === 'c4' ? 'on' : ''} disabled={!p.onNotation} onClick={() => p.notation !== 'c4' && p.onNotation?.('c4')}>C4</button>
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
            <button aria-label="Conversa e histórico" title="Conversa e histórico (Ctrl+B)" className={left === 'chat' ? 'on' : ''} onClick={() => toggleLeft('chat')}>💬</button>
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
