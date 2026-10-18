// The plan report (`archlens show`): a deterministic markdown summary of what a plan does, for a PR or a conversation.
// reportData builds the structure (also the --json output); formatReport only lays it out.
import { indexTree } from './raw-tree.mjs';
import { relationshipIds } from './merge.mjs';
import { describeItem } from './merge-report.mjs';
import { short } from './store/contract.mjs';

const byKey = (a, b) => (a.id ?? a.key ?? '') < (b.id ?? b.key ?? '') ? -1 : (a.id ?? a.key ?? '') > (b.id ?? b.key ?? '') ? 1 : 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Structured content of the report: `plan` is open or final, `preview` is what api.preview gave for it. */
export function reportData(baseRaw, plan, preview, { currentVersion } = {}) {
  const before = baseRaw ? indexTree(baseRaw) : new Map();
  const after = indexTree(preview.raw); // includes the ghosts of removed elements
  const nameOf = id => before.get(id)?.el.name ?? after.get(id)?.el.name ?? id;
  const kinds = k => [...preview.changes].filter(([, c]) => k.includes(c.kind));
  const describe = (id, kind) => {
    const el = (kind === 'added' ? after : before.get(id) ? before : after).get(id);
    return { id, name: el.el.name, type: el.el.type, c4: el.el.c4?.kind ?? null, parent: el.parent ?? null };
  };

  const added = kinds(['added']).map(([id]) => describe(id, 'added')).sort(byKey);
  const removed = kinds(['removed']).map(([id]) => describe(id, 'removed')).sort(byKey);
  const changed = kinds(['changed', 'retired']).map(([id, c]) => ({
    id, name: nameOf(id), retired: c.kind === 'retired', fields: c.fields ?? [],
  })).sort(byKey);

  const ids = relationshipIds(preview.raw);
  const label = r => {
    const id = r.id && preview.relChanges.has(r.id) ? r.id : ids.get(r);
    return { id, from: r.from, to: r.to, type: r.type, description: r.description ?? null,
      fromName: nameOf(r.from), toName: nameOf(r.to) };
  };
  const relationships = [];
  for (const r of preview.raw.model.relationships ?? []) {
    const l = label(r);
    const c = preview.relChanges.get(l.id);
    if (c) relationships.push({ ...l, kind: c.kind, fields: c.fields ?? [] });
  }
  relationships.sort(byKey);

  const baseViews = new Map((baseRaw?.views ?? []).map(v => [v.key, v]));
  const views = [
    ...(plan.delta?.views ?? []).filter(v => v?.key).map(v => ({ key: v.key, title: v.title ?? null, kind: baseViews.has(v.key) ? 'changed' : 'added' })),
    ...preview.droppedViews.map(key => ({ key, title: baseViews.get(key)?.title ?? null, kind: 'dropped' })),
  ].sort(byKey);

  const answered = plan.items.filter(i => i.resolution != null);
  const decisions = answered.map(i => ({ n: i.n, text: describeItem(i).split('  → ')[0], resolution: i.resolution }));
  const seen = new Map();
  for (const list of preview.pending.values()) for (const p of list) seen.set(p.n, p);
  const pending = [...seen.values()].sort((a, b) => a.n - b.n)
    .map(p => ({ n: p.n, question: p.question.replace('  →', ' →'), options: p.options, assumed: p.assumed }));

  const src = plan.delta?.source;
  return {
    title: plan.delta?.summary ?? '(sem resumo)',
    header: {
      base: plan.base,
      version: plan.storeVersion ?? null,
      source: src ? `${src.kind}${src.ref ? ` ${src.ref}` : ''}` : null,
      date: plan.created ?? null,
    },
    state: plan.state === 'final' ? 'final' : 'aberto',
    totals: {
      added: added.length, changed: changed.length, removed: removed.length,
      relAdded: relationships.filter(r => r.kind === 'added').length,
      relRemoved: relationships.filter(r => r.kind === 'removed').length,
    },
    pending, decisions, added, changed, removed, relationships, views,
    stale: plan.storeVersion != null && currentVersion !== undefined && plan.storeVersion !== currentVersion,
    ...(plan.storeVersion != null && currentVersion !== undefined ? { currentVersion } : {}),
  };
}

const code = v => `\`${v}\``;
const val = v => (v === undefined || v === null || v === '' ? '(vazio)' : code(typeof v === 'string' ? v : JSON.stringify(v)));

/** One field change: `old` → `new`, or + / − for the items of a list. */
function fieldText({ field, before, after }) {
  if (Array.isArray(before ?? []) && Array.isArray(after ?? []) && (Array.isArray(before) || Array.isArray(after)) && field !== 'id') {
    const b = before ?? [], a = after ?? [];
    const parts = [
      ...a.filter(x => !b.some(y => same(x, y))).map(x => `+ ${val(x)}`),
      ...b.filter(x => !a.some(y => same(x, y))).map(x => `− ${val(x)}`),
    ];
    return `${field} ${parts.join(' ')}`;
  }
  return `${field} ${val(before)} → ${val(after)}`;
}

export function formatReport(d) {
  const out = [];
  if (d.stale) out.push(`> Atenção: a base mudou depois deste plano (${short(d.header.version)} → ${short(d.currentVersion)}); os nomes e valores antigos vêm da base de agora.`, '');
  out.push(`# Plano: ${d.title}`, '');
  const h = d.header;
  out.push([`Base ${code(h.base)}${h.version ? ` na versão ${code(`sha256:${short(h.version).slice(0, 4)}…`)}` : ''}`,
    ...(h.source ? [`fonte: ${h.source}`] : []), ...(h.date ? [h.date] : []), `**${d.state}**`].join(' · '), '');
  const t = d.totals;
  out.push(`**+${t.added} elementos · ~${t.changed} alterados · −${t.removed} removido(s) · relações +${t.relAdded} −${t.relRemoved}**`);
  const section = (title, lines) => { if (lines.length) out.push('', `## ${title}`, ...lines); };
  section('Decisões pendentes', d.pending.map(p => `- ${p.n}. ${p.question}${p.assumed ? ` (a prévia assume ${p.assumed})` : ''}`));
  section('Decisões', d.decisions.map(x => `- ${x.n}. ${x.text} → **${x.resolution}**`));
  if (d.added.length) {
    section('Novos', ['| id | nome | tipo | C4 | pai |', '|---|---|---|---|---|',
      ...d.added.map(e => `| ${e.id} | ${e.name} | ${e.type} | ${e.c4 ?? ''} | ${e.parent ?? ''} |`)]);
  }
  section('Alterados', d.changed.map(e => `- **${e.name}** (${code(e.id)}): ${e.fields.map(fieldText).join('; ')}${e.retired ? ' (aposentado)' : ''}`));
  section('Removidos', d.removed.map(e => `- **${e.name}** (${code(e.id)}): ${e.type}${e.parent ? `, dentro de ${code(e.parent)}` : ''}`));
  const sign = { added: '+', removed: '−', changed: '~', retired: '~' };
  section('Relações', d.relationships.map(r => `- ${sign[r.kind]} ${r.fromName} → ${r.toName} (${r.type})${r.description ? `: ${r.description}` : ''}`
    + `${r.fields.length ? `; ${r.fields.map(fieldText).join('; ')}` : ''}${r.kind === 'retired' ? ' (aposentada)' : ''}`));
  const viewText = { added: '+ nova', changed: '~ definição alterada', dropped: '− some ou muda no apply' };
  section('Visões', d.views.map(v => `- ${code(v.key)}${v.title ? ` ${v.title}` : ''}: ${viewText[v.kind]}`));
  return out.join('\n') + '\n';
}
