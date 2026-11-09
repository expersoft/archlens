import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';

export interface DocEditorProps {
  text: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
  busy?: boolean;
  /** Avisa quando há texto não confirmado. */
  onDirty?: (dirty: boolean) => void;
}

/** Editor da documentação de um nó: Escrever e Prévia, e uma tela cheia com os dois lado a lado. */
export function DocEditor({ text, onConfirm, onCancel, busy, onDirty }: DocEditorProps) {
  const [value, setValue] = useState(text);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [full, setFull] = useState(false);
  const fullRef = useRef<HTMLDivElement>(null);
  const dirty = value !== text;
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    if (!full) return undefined;
    fullRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full]);

  const confirm = () => {
    if (value.trim() === '' && text.trim() !== '' && !window.confirm('Apagar a documentação deste nó?')) return;
    onConfirm(value);
  };
  const actions = (
    <div className="np-edit-actions">
      <button type="button" onClick={onCancel}>Cancelar</button>
      <button type="button" className="primary" disabled={!dirty || busy} onClick={confirm}>Confirmar</button>
    </div>
  );
  const area = <textarea className="np-doc-ta" aria-label="Documentação" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />;

  if (full) {
    return (
      <div className="doc-full np-doc-full" role="dialog" aria-modal="true" aria-label="Editar documentação em tela cheia" tabIndex={-1} ref={fullRef}>
        <div className="doc-full-bar">
          <button type="button" onClick={() => setFull(false)}>Fechar</button>
        </div>
        <div className="np-doc-split">
          <div><h3>Escrever</h3>{area}</div>
          <div><h3>Prévia</h3><Markdown text={value} className="doc-text" /></div>
        </div>
        {actions}
      </div>
    );
  }
  return (
    <div className="np-edit">
      <div role="tablist" className="np-doc-tabs">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>Escrever</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Prévia</button>
        <span className="np-sp" />
        <button type="button" className="linkish" onClick={() => setFull(true)}>Tela cheia</button>
      </div>
      {tab === 'write' ? area : <Markdown text={value} className="doc-text np-doc-prev" />}
      {actions}
    </div>
  );
}
