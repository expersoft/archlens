/** Ctrl/Meta+B, Ctrl/Meta+Alt+B e Ctrl/Meta+K (por `code`: no macOS Option+B gera '∫'). */
export function isGuiShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && (e.code === 'KeyB' || e.code === 'KeyK');
}
