// Model validation: errors block rendering, warnings are advisory. Codes are stable.
import { normalizeModel } from './model.mjs';
import { supportDirection, STATUSES } from './registry.mjs';

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
    if (e.type === 'grouping') continue;
    if (!connected.has(e.id)) warnings.push({ code: 'W_ORPHAN', message: `"${e.id}" não tem relacionamentos`, path: e.path, hint: 'conecte-o ou remova-o; elementos isolados não aparecem em visões com âncora' });
  }
  const withMembers = new Set([...model.elements.values()].map(e => e.groupId).filter(Boolean));
  for (const g of model.elements.values()) {
    if (g.type === 'grouping' && !withMembers.has(g.id)) {
      warnings.push({ code: 'W_GROUP_EMPTY', message: `agrupamento "${g.id}" não tem membros`, path: g.path,
        hint: 'preencha "group" nos elementos que pertencem a ele, ou remova o agrupamento' });
    }
  }
  for (const r of model.relationships) {
    if (r.status === 'retired') continue;
    const dir = supportDirection(r);
    if (!dir) continue;
    const [sup, dep] = dir.map(id => model.elements.get(id));
    if (sup?.status === 'retired' && dep && dep.status !== 'retired') {
      warnings.push({ code: 'W_RETIRED_DEPENDENCY', message: `"${dep.id}" (${dep.status}) depende de "${sup.id}", que está retired`, path: r.path,
        hint: 'aponte a dependência para o substituto ou mude o status do dependente' });
    }
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
    if (v.status !== undefined && (!Array.isArray(v.status) || v.status.some(s => !STATUSES.includes(s)))) {
      errors.push({ code: 'E_VIEW_STATUS', message: `visão "${v.key}" tem "status" inválido: ${JSON.stringify(v.status)}`, path: `views[${i}].status`,
        hint: `use uma lista com ${STATUSES.join(' | ')}, ex.: ["planned","active"]` });
    }
    for (const gid of v.groups?.only || []) {
      if (model.elements.get(gid)?.type !== 'grouping') {
        errors.push({ code: 'E_VIEW_GROUP', message: `visão "${v.key}" lista "${gid}" em groups.only, que não é um agrupamento`, path: `views[${i}].groups.only`,
          hint: 'use ids de elementos do tipo "grouping"' });
      }
    }
    for (const f of ['scope', 'anchor', ...(v.focus || []), ...(v.expand || [])].map(k => (k === 'scope' || k === 'anchor') ? v[k] : k)) {
      if (f && !model.elements.has(f)) errors.push({ code: 'E_UNKNOWN_REF', message: `visão "${v.key}" referencia "${f}", que não existe`, path: `views[${i}]`, hint: 'use o id de um elemento do modelo' });
    }
  });
  return { errors, warnings, model };
}
