import { useState } from 'react';
import type { Catalog, ElementEntry, ViewSpec } from './api';
import { LAYERS, typeHint } from './labels';

export interface ExplorerProps {
  catalog: Catalog;
  selected: string | null;
  onOpenView: (spec: ViewSpec, title: string) => void;
  onPick: (id: string) => void;
}

export function Explorer({ catalog, selected, onOpenView, onPick }: ExplorerProps) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const f = filter.trim().toLowerCase();

  const kids: Record<string, ElementEntry[]> = {};
  for (const e of catalog.elements) (kids[e.parent ?? '__root'] ??= []).push(e);

  const row = (e: ElementEntry, toggle: boolean) => (
    <div className={selected === e.id ? 'sel' : ''} data-id={e.id} onClick={() => onPick(e.id)}>
      <span className="tg" onClick={(ev) => { if (!toggle) return; ev.stopPropagation(); setOpen((o) => ({ ...o, [e.id]: !o[e.id] })); }}>
        {toggle && kids[e.id] ? (open[e.id] ? '▾' : '▸') : ''}
      </span>
      {e.name}<span className="t">{typeHint(e)}</span>
    </div>
  );
  const node = (e: ElementEntry): JSX.Element => (
    <li key={e.id}>
      {row(e, true)}
      {kids[e.id] && open[e.id] && <ul className="tree">{kids[e.id].map(node)}</ul>}
    </li>
  );

  const saved = catalog.views.filter((v) => v.saved);
  const suggested = catalog.views.filter((v) => !v.saved);
  const viewBtn = (v: Catalog['views'][number]) => (
    <li key={v.key}><button type="button" onClick={() => onOpenView(v.spec, v.title)}>{v.saved ? '★ ' : ''}{v.title}</button></li>
  );

  const known = new Set(LAYERS.map(([l]) => l));
  const layerOf = (e: ElementEntry) => (known.has(e.layer) ? e.layer : 'other');
  const roots = kids.__root ?? [];
  return (
    <div className="explorer">
      <div className="ph">Explorador</div>
      {!f && saved.length > 0 && <><div className="tag">Visões salvas</div><ul className="views">{saved.map(viewBtn)}</ul></>}
      {!f && suggested.length > 0 && <><div className="tag">Visões sugeridas</div><ul className="views">{suggested.map(viewBtn)}</ul></>}
      <input type="search" className="xfilter" aria-label="Filtrar elementos" placeholder="Filtrar…" value={filter} onChange={(ev) => setFilter(ev.target.value)} />
      <div className="xtree">
        {f ? (
          <ul className="tree">
            {catalog.elements.filter((e) => `${e.name} ${e.id}`.toLowerCase().includes(f)).map((e) => <li key={e.id}>{row(e, false)}</li>)}
          </ul>
        ) : LAYERS.filter(([l]) => roots.some((e) => layerOf(e) === l)).map(([l, label]) => (
          <div key={l}>
            <div className="tag">{label}</div>
            <ul className="tree">{roots.filter((e) => layerOf(e) === l).map(node)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
