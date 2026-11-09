import { useEffect, useRef, useState } from 'react';
import type { PropValue } from '../api';

/** O texto digitado de volta num valor: o tipo da propriedade original manda (lista, número, booleano); senão texto. */
export function parsePropValue(text: string, original: PropValue | undefined): PropValue {
  if (Array.isArray(original)) return text.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (typeof original === 'number') {
    const n = Number(text);
    return text.trim() !== '' && Number.isFinite(n) ? n : text;
  }
  if (typeof original === 'boolean') {
    const t = text.trim().toLowerCase();
    return t === 'true' ? true : t === 'false' ? false : text;
  }
  return text;
}

const show = (v: PropValue | undefined) => (v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Row { rid: number; key: string; text: string; fresh: boolean; removed: boolean }

export interface PropsEditorProps {
  /** As propriedades como estão no rascunho (a referência dos destaques). */
  base: Record<string, PropValue>;
  /** O ponto de partida do editor. */
  value: Record<string, PropValue>;
  /** Só o que mudou em relação a `base`; `null` marca a propriedade removida. */
  onConfirm: (props: Record<string, PropValue | null>) => void;
  onCancel: () => void;
  busy?: boolean;
  /** Avisa quando há texto não confirmado. */
  onDirty?: (dirty: boolean) => void;
}

/** Editor das propriedades de um nó: linhas chave/valor, × remove (riscada até confirmar), "+ Adicionar propriedade". */
export function PropsEditor({ base, value, onConfirm, onCancel, busy, onDirty }: PropsEditorProps) {
  const nextId = useRef(0);
  const [initial] = useState<Row[]>(() => Object.entries(value).map(([key, v]): Row => ({ rid: nextId.current++, key, text: show(v), fresh: false, removed: false })));
  const [rows, setRows] = useState<Row[]>(initial);
  const patch = (rid: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...p } : r)));

  const changes: Record<string, PropValue | null> = Object.create(null);
  const status = new Map<number, 'mod' | 'add' | 'del' | ''>();
  for (const r of rows) {
    const k = r.key.trim();
    const inBase = Object.prototype.hasOwnProperty.call(base, k) && !r.fresh;
    if (r.removed) { status.set(r.rid, 'del'); if (inBase) changes[k] = null; continue; }
    if (r.fresh || !inBase) { status.set(r.rid, 'add'); if (k) changes[k] = parsePropValue(r.text, base[k]); continue; }
    const v = parsePropValue(r.text, base[k]);
    if (same(v, base[k])) status.set(r.rid, '');
    else { status.set(r.rid, 'mod'); changes[k] = v; }
  }
  const live = rows.filter((r) => !r.removed);
  const keys = live.map((r) => r.key.trim());
  const dupe = (k: string) => k !== '' && keys.filter((x) => x === k).length > 1
    || rows.some((r) => r.removed && r.key.trim() === k && live.some((l) => l.fresh && l.key.trim() === k));
  const invalid = live.some((r) => r.key.trim() === '' || dupe(r.key.trim()));
  const dirty = rows.length !== initial.length || rows.some((r, i) => r.removed || r.fresh || r.text !== initial[i]?.text);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  return (
    <div className="np-edit">
      <div className="np-rows">
        {rows.map((r) => (
          <div key={r.rid} className={`np-row${status.get(r.rid) ? ` np-${status.get(r.rid)}` : ''}`}>
            {r.fresh
              ? <input className="np-k" aria-label="Nova chave" value={r.key} onChange={(e) => patch(r.rid, { key: e.target.value })} />
              : <span className="np-k">{r.key}</span>}
            <input className="np-v" aria-label={`Valor de ${r.key.trim()}`} value={r.text} disabled={r.removed}
              onChange={(e) => patch(r.rid, { text: e.target.value })} />
            <button type="button" className="np-x" aria-label={`Remover ${r.key.trim()}`} title="Remover"
              onClick={() => (r.fresh ? setRows((rs) => rs.filter((x) => x.rid !== r.rid)) : patch(r.rid, { removed: !r.removed }))}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="linkish" onClick={() => setRows((rs) => [...rs, { rid: nextId.current++, key: '', text: '', fresh: true, removed: false }])}>+ Adicionar propriedade</button>
      <div className="np-edit-actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="primary" disabled={invalid || busy || Object.keys(changes).length === 0} onClick={() => onConfirm(changes)}>Confirmar</button>
      </div>
    </div>
  );
}
