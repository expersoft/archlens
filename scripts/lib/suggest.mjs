// Suggest views the model can answer, so a knowledge base can be mined for new diagrams.
import { c4KindOf, childrenOf } from './model.mjs';
import { CORE_LAYERS } from './registry.mjs';

export function suggestViews(model) {
  const els = [...model.elements.values()];
  const kind = e => c4KindOf(model, e);
  const out = [];
  const systems = els.filter(e => kind(e) === 'softwareSystem');
  if (systems.length > 1) out.push({ key: 'landscape', notation: 'c4', level: 'landscape', why: 'todos os sistemas e pessoas' });
  for (const s of systems.filter(s => !s.c4?.external)) {
    out.push({ key: `context-${s.id}`, notation: 'c4', level: 'context', scope: s.id, why: `contexto de ${s.name}` });
    const containers = childrenOf(model, s.id).filter(c => kind(c) === 'container');
    if (containers.length) out.push({ key: `containers-${s.id}`, notation: 'c4', level: 'container', scope: s.id, why: `${containers.length} containers de ${s.name}` });
    for (const c of containers) {
      const comps = childrenOf(model, c.id).filter(x => kind(x) === 'component');
      if (comps.length) out.push({ key: `components-${c.id}`, notation: 'c4', level: 'component', scope: c.id, why: `${comps.length} componentes de ${c.name}` });
    }
  }
  for (const layer of CORE_LAYERS) {
    const n = els.filter(e => e.layer === layer).length;
    if (n) out.push({ key: `layer-${layer}`, notation: 'archimate', viewpoint: layer, why: `${n} elementos na camada` });
  }
  for (const p of els.filter(e => ['product', 'capability', 'value-stream'].includes(e.type))) {
    out.push({ key: `support-${p.id}`, notation: 'archimate', viewpoint: 'product-support', anchor: p.id, traverse: { mode: 'supporters' }, why: `o que sustenta ${p.name}` });
  }
  for (const p of els.filter(e => e.type === 'business-process')) {
    out.push({ key: `process-${p.id}`, notation: 'archimate', viewpoint: 'layered', anchor: p.id, traverse: { mode: 'supporters' }, why: `aplicações e tecnologia por trás de ${p.name}` });
  }
  for (const a of els.filter(e => e.type === 'application-component' && ['softwareSystem', 'container'].includes(kind(e)) && !e.c4?.external)) {
    out.push({ key: `impact-${a.id}`, notation: 'archimate', viewpoint: 'impact', anchor: a.id, traverse: { mode: 'both' }, output: ['diagram', 'matrix'], why: `matriz de dependência de ${a.name}` });
  }
  return out;
}
