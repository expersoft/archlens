import { useEffect, useState } from 'react';
import { getBases, getCatalog, getView, type ViewResult } from './api';
import { Diagram } from './Diagram';
import { Shell } from './Shell';
import { useTheme } from './theme';
import type { BridgeEvent } from './bridge';

export function App() {
  const [theme, setTheme] = useTheme();
  const [view, setView] = useState<ViewResult | null>(null);
  const [status, setStatus] = useState('Carregando…');
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    const on = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const base = (await getBases()).find((b) => b.ok);
        if (!base) { setStatus('Nenhuma base disponível'); return; }
        const cat = await getCatalog(base.id);
        const v = cat.views.find((x) => x.spec?.level === 'landscape') ?? cat.views[0];
        if (!v) { setStatus(`${cat.name}: sem visões`); return; }
        const r = await getView(base.id, v.spec);
        if (dead) return;
        setView(r);
        setStatus(`${cat.name} · ${r.title}`);
      } catch (e) {
        if (!dead) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { dead = true; };
  }, []);

  const onEvent = (e: BridgeEvent) => {
    if (e.type === 'theme') setTheme(e.theme);
  };

  return (
    <Shell
      theme={theme}
      onThemeChange={setTheme}
      presenting={presenting}
      status={status}
      leftContent={{ chat: <div className="ph">Conversa</div>, tree: <div className="ph">Explorador</div> }}
      rightContent={<div className="ph">Detalhes</div>}
    >
      {view ? <Diagram view={view} theme={theme} onEvent={onEvent} /> : <div className="empty">{status}</div>}
    </Shell>
  );
}
