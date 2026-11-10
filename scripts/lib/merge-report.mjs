// Human-readable report of a merge plan: what the agent shows the user before asking each question.
import { lineDiff } from './node-doc.mjs';

const LABELS = { new: 'novos', unchanged: 'sem mudança', enrich: 'enriquecidos', conflict: 'conflitos', 'possible-duplicate': 'possíveis duplicatas', op: 'operações' };
const show = v => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v));

/** The lines of a documentation item, what the person reviews: the whole of a new text, the difference on a replaced one. */
const docDiff = it => lineDiff(it.base, it.delta).map(({ sign, line }) => `      ${sign} ${line}`.trimEnd());

export function describeItem(it) {
  const cond = it.when ? ` (só se [${it.when.slice(0, it.when.lastIndexOf('='))}] = same)` : '';
  if (it.class === 'conflict' && it.kind === 'view') return `conflito na visão "${it.target}": a definição mudou  → keep | take`;
  if (it.class === 'conflict' && it.kind === 'doc') {
    return `documentação de ${it.target}: ${it.base.trim() ? 'o texto existente será trocado' : 'o texto foi esvaziado depois da resposta anterior; gravar o texto novo?'}  → keep | take`;
  }
  if (it.class === 'conflict' && it.delta === null && it.field?.startsWith('properties.')) {
    return `conflito ${it.target}: remover a propriedade "${it.field.slice('properties.'.length)}" (base ${show(it.base)})${cond}  → keep | take`;
  }
  if (it.class === 'conflict') return `conflito ${it.target}.${it.field}: base ${show(it.base)} ≠ delta ${show(it.delta)}${cond}  → keep | take | value:<x>`;
  if (it.class === 'possible-duplicate') return `possível duplicata: "${it.target}" parece "${it.candidate}" (${it.score}; ${it.why})  → same | different`;
  if (it.op === 'remove') {
    const c = it.cascade;
    const views = c.views.length ? `; visões: ${c.views.map(v => `${v.key} (${v.action})`).join(', ')}` : '';
    const members = c.members?.length ? `; membros sem agrupamento: ${c.members.join(', ')}` : '';
    return `remover ${it.target}: ${c.elements.length} elemento(s), ${c.relationships.length} relação(ões)${members}${views}  → yes | no`;
  }
  if (it.op === 'status') {
    const views = it.views?.length ? `; visões que deixam de abrir: ${it.views.join(', ')}` : '';
    return `status ${it.target}: ${it.from} → ${it.status}${it.reason ? ` (${it.reason})` : ''}${views}  → yes | no`;
  }
  return `${it.class} ${it.target}`;
}

export function formatPlanReport(plan) {
  const src = plan.delta.source;
  const out = [`Plano de merge: ${plan.base} ← ${src ? `${src.kind}${src.ref ? ` ${src.ref}` : ''}` : 'delta sem fonte'}`];
  if (plan.delta.summary) out.push(`  ${plan.delta.summary}`);
  out.push(`  ${Object.entries(plan.summary).map(([k, n]) => `${LABELS[k] ?? k}: ${n}`).join(' · ') || 'nada a fazer'}`);
  const questions = plan.items.filter(i => 'resolution' in i);
  if (questions.length) {
    const pending = questions.filter(i => i.resolution == null).length;
    const answered = questions.length - pending;
    out.push('', `Decisões (preencha "resolution" de cada item pendente no plano)${answered ? `: ${pending} pendente(s), ${answered} já respondida(s)` : ''}:`);
    for (const it of questions) {
      out.push(`  [${it.n}] ${describeItem(it)}${it.resolution != null ? `  ✓ respondido: ${it.resolution}` : ''}`);
      if (it.kind === 'doc') out.push(...docDiff(it));
    }
  }
  const fresh = plan.items.filter(i => i.class === 'new');
  if (fresh.length) out.push('', `Novos: ${fresh.map(i => i.target).join(', ')}`);
  for (const it of plan.items.filter(i => i.kind === 'doc' && i.class === 'enrich')) out.push('', `Documentação nova de ${it.target}:`, ...docDiff(it));
  if (plan.blocked) {
    out.push('', `✗ Plano bloqueado: o resultado teria ${plan.errors.length} erro(s). Corrija o delta e gere o plano de novo.`);
    for (const e of plan.errors) out.push(`  ${e.code}  ${e.message}`);
  }
  return out.join('\n');
}
