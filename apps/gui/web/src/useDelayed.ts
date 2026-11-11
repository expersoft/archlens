import { useEffect, useState } from 'react';

/** Liga só depois de `on` ficar ligado por `ms` (um aviso que não pisca em esperas curtas); desliga na hora. */
export function useDelayed(on: boolean, ms = 300): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) { setLate(false); return; }
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return on && late;
}
