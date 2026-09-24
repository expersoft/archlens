// Model validation: errors block rendering, warnings are advisory. Codes are stable.
import { normalizeModel } from './model.mjs';

export function validateModel(raw) {
  const model = normalizeModel(raw);
  const strip = ({ level, ...rest }) => rest;
  const errors = model.issues.filter(i => i.level === 'error').map(strip);
  const warnings = model.issues.filter(i => i.level === 'warning').map(strip);

  // Advisory checks that need the whole model.
  const connected = new Set();
  for (const r of model.relationships) { connected.add(r.from); connected.add(r.to); }
  for (const e of model.elements.values()) {
    if (e.parent) { connected.add(e.id); connected.add(e.parent); }
  }
  for (const e of model.elements.values()) {
    if (!connected.has(e.id)) warnings.push({ code: 'W_ORPHAN', message: `"${e.id}" não tem relacionamentos`, path: e.path, hint: 'conecte-o ou remova-o; elementos isolados não aparecem em visões com âncora' });
  }
  const inferred = [...model.elements.values()].filter(e => e.inferred);
  if (inferred.length) {
    warnings.push({ code: 'W_INFERRED', message: `${inferred.length} elemento(s) inferidos de texto livre`, path: 'model.elements', hint: 'revise a seção "Premissas e inferências" do ARCHITECTURE.md' });
  }
  const seenViews = new Set();
  (model.views || []).forEach((v, i) => {
    if (!v.key) errors.push({ code: 'E_VIEW_KEY', message: 'visão sem "key"', path: `views[${i}]`, hint: 'dê um identificador único à visão' });
    else if (seenViews.has(v.key)) errors.push({ code: 'E_VIEW_KEY', message: `visão duplicada "${v.key}"`, path: `views[${i}]`, hint: 'keys de visões são únicas' });
    seenViews.add(v.key);
    for (const f of ['scope', 'anchor', ...(v.focus || []), ...(v.expand || [])].map(k => (k === 'scope' || k === 'anchor') ? v[k] : k)) {
      if (f && !model.elements.has(f)) errors.push({ code: 'E_UNKNOWN_REF', message: `visão "${v.key}" referencia "${f}", que não existe`, path: `views[${i}]`, hint: 'use o id de um elemento do modelo' });
    }
  });
  return { errors, warnings, model };
}
