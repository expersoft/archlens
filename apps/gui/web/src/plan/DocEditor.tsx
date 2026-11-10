import { useEffect, useRef, useState } from 'react';
import { DocWindow } from '../DocWindow';
import { Markdown } from './Markdown';

export interface DocEditorProps {
  text: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
  busy?: boolean;
  /** Avisa quando há texto não confirmado. */
  onDirty?: (dirty: boolean) => void;
  /** Título e rótulos do editor ampliado (camada para a amostra de cor). */
  title?: string;
  layer?: string;
  labels?: string[];
}

/** Editor da documentação de um nó: Escrever e Prévia, e a janela ampliada (DocWindow) com sumário e os dois lado a lado. */
export function DocEditor({ text, onConfirm, onCancel, busy, onDirty, title, layer, labels }: DocEditorProps) {
  const [value, setValue] = useState(text);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [full, setFull] = useState(false);
  const fullBtn = useRef<HTMLButtonElement>(null);
  const wasFull = useRef(false);
  const dirty = value !== text;
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  // O botão sai da tela enquanto a janela está aberta: o foco volta a ele ao fechar.
  useEffect(() => {
    if (wasFull.current && !full) fullBtn.current?.focus();
    wasFull.current = full;
  }, [full]);

  const confirm = (v: string = value) => {
    if (v.trim() === '' && text.trim() !== '' && !window.confirm('Apagar a documentação deste nó?')) return;
    onConfirm(v);
  };
  const actions = (
    <div className="np-edit-actions">
      <button type="button" onClick={onCancel}>Cancelar</button>
      <button type="button" className="primary" disabled={!dirty || busy} onClick={() => confirm()}>Confirmar</button>
    </div>
  );
  const area = <textarea className="np-doc-ta" aria-label="Documentação" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />;

  if (full) {
    return (
      <DocWindow title={title ?? 'Documentação do nó'} layer={layer} labels={labels} text={value} original={text} editable busy={busy}
        onConfirm={confirm} onCancel={onCancel} onClose={(t) => { setValue(t); setFull(false); }} />
    );
  }
  return (
    <div className="np-edit">
      <div role="tablist" className="np-doc-tabs">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>Escrever</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Prévia</button>
        <span className="np-sp" />
        <button type="button" className="linkish" ref={fullBtn} onClick={() => setFull(true)}>Tela cheia</button>
      </div>
      {tab === 'write' ? area : <Markdown text={value} className="doc-text np-doc-prev" />}
      {actions}
    </div>
  );
}
