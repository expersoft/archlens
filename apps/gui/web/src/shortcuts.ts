/** Ctrl/Meta+B, Ctrl/Meta+Alt+B e Ctrl/Meta+K (por `code`: no macOS Option+B gera '∫'). */
export function isGuiShortcut(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'code'>): boolean {
  return (e.ctrlKey || e.metaKey) && (e.code === 'KeyB' || e.code === 'KeyK');
}
