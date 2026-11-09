import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { planEdit, planElement, type Draft, type PlanElement, type PropValue, type ScreenConflict, type ScreenEdit } from '../api';
import { Details } from '../Details';
import { DocTab } from '../DocTab';
import { DocEditor } from './DocEditor';
import { PropsEditor } from './PropsEditor';

export interface NodePanelProps {
  base: string;
  draft: Draft | null;
  /** O nó selecionado na prévia; null sem seleção. */
  id: string | null;
  /** Uma edição da tela devolveu um rascunho novo (usado pelo editor do nó). */
  onDraft: (draft: Draft, opsHash: string | null, conflicts: ScreenConflict[]) => void;
  /** Vai para outro nó (um clique em pai, filho ou relação). */
  onPick?: (id: string) => void;
  /** Há texto de edição não confirmado (o PlanView pergunta antes de trocar de nó ou de aba). */
  onDirty?: (dirty: boolean) => void;
  /** Um turno do chat está rodando: editar agora seria sobrescrito por ele. */
  locked?: boolean;
}
const LOCKED = 'Aguarde o chat terminar para editar';


type Loaded = { draft: Draft; id: string; el: PlanElement } | { draft: Draft; id: string; error: string };

/** A aba Nó do Planejar: o nó como o rascunho o deixa, com os mesmos cartões da tela Navegar. */
export function NodePanel({ base, draft, id, onPick, onDraft, onDirty, locked }: NodePanelProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [editing, setEditing] = useState<{ id: string; kind: 'properties' | 'doc' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // The host's callback may change identity on every render: it is read through a ref, never a dependency.
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const setDirty = useCallback((d: boolean) => { onDirtyRef.current?.(d); }, []);
  useEffect(() => () => { onDirtyRef.current?.(false); }, []);
  // Another node never inherits the editor of the previous one (the host already asked before leaving a dirty one).
  useEffect(() => { setEditing(null); setEditError(null); setDirty(false); }, [id, setDirty]);

  useEffect(() => {
    if (!id || !draft) return undefined;
    let stale = false;
    planElement(base, draft, id).then(
      (el) => { if (!stale) setLoaded({ draft, id, el }); },
      (e: unknown) => { if (!stale) setLoaded({ draft, id, error: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { stale = true; };
  }, [base, draft, id]);

  if (!id || !draft) return <p className="meta delta-empty">Selecione um nó na prévia ou no Delta.</p>;
  // Never shows the answer of another node; the previous draft's answer of the same node stays until the new one comes.
  const cur = loaded && loaded.id === id ? loaded : null;
  if (!cur) return <p className="meta delta-empty">Carregando…</p>;
  if ('error' in cur) return <p className="warn" role="alert">{cur.error}</p>;
  const { el } = cur;
  const mine = editing?.id === id ? editing.kind : null;
  const close = () => { setEditing(null); setEditError(null); setDirty(false); };
  const open = (kind: 'properties' | 'doc') => { setEditError(null); setEditing({ id, kind }); };
  const save = async (edit: ScreenEdit) => {
    setBusy(true);
    setEditError(null);
    try {
      const r = await planEdit(base, draft, edit);
      close();
      onDraft(r.draft, r.opsHash, r.screenConflicts);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const err = editError && <p className="warn np-edit-err" role="alert">{editError}</p>;
  const props = (el.card.properties ?? {}) as Record<string, PropValue>;
  const editBtn = (kind: 'properties' | 'doc', label: string) => (!el.removed && !mine
    ? <button type="button" className="linkish" aria-label={`Editar ${label}`} disabled={locked} title={locked ? LOCKED : undefined} onClick={() => open(kind)}>✎ Editar</button> : undefined);
  const screenProps = ((draft.edits as Record<string, { properties?: Record<string, PropValue | null> }> | undefined)?.[id]?.properties) ?? {};
  const propsSlot = mine === 'properties' ? (
    <>
      {err}
      <PropsEditor base={props} value={props} busy={busy || !!locked} onDirty={setDirty} onCancel={close}
        onConfirm={(changes) => void save({ op: 'properties', id, properties: { ...screenProps, ...changes } })} />
    </>
  ) : Object.keys(props).length ? (
    <dl>{Object.entries(props).map(([k, v]) => (
      <Fragment key={k}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></Fragment>
    ))}</dl>
  ) : <p className="muted">Este nó não tem propriedades.</p>;
  const docSlot = mine === 'doc' ? (
    <>
      {err}
      <DocEditor text={el.docRaw ?? ''} busy={busy || !!locked} onDirty={setDirty} onCancel={close}
        onConfirm={(text) => void save({ op: 'doc', id, text })} />
    </>
  ) : el.doc || el.removed
    ? <DocTab base={base} id={id} text={el.doc} max />
    : (
      <>
        <p className="muted">Este nó ainda não tem documentação.</p>
        <button type="button" className="linkish" disabled={locked} title={locked ? LOCKED : undefined} onClick={() => open('doc')}>Escrever</button>
      </>
    );
  return (
    <div className="node-panel">
      {el.removed && <p className="warn node-removed" role="status">Este nó é removido pelo rascunho.</p>}
      <Details
        card={el.card}
        viewNode={null}
        viewEdges={[]}
        nodeId={id}
        onPick={(x) => onPick?.(x)}
        onSelectInView={(x) => onPick?.(x)}
        onGlossary={() => {}}
        base={base}
        docsEnabled={el.docs}
        layer={el.card.element.layer}
        slots={{ properties: propsSlot, ...(el.docs ? { doc: docSlot } : {}) }}
        actions={{ properties: editBtn('properties', 'propriedades'), doc: el.docs ? editBtn('doc', 'documentação') : undefined }}
      />
    </div>
  );
}
