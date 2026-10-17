// What the skill shows before asking the repository's role: counts, warnings, the suggested role and why, the base
// element that may already stand for the repository, and probable systems with their reasons. It never decides.
import { similarity, aliasKey } from '../match.mjs';
import { c4KindOf, ancestors } from '../model.mjs';
import { norm, repoElement, ownService } from './to-delta.mjs';

export function deployablesOf(inv) {
  const names = new Map();
  for (const f of inv.facts) {
    if ((f.kind === 'service' && ownService(f, inv.repo)) || f.kind === 'workload' || (f.kind === 'module' && f.executable)) if (!names.has(norm(f.name))) names.set(norm(f.name), f.name);
  }
  return [...names.values()];
}

export function summarize(inv, base) {
  const counts = {};
  for (const f of inv.facts) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  const deps = deployablesOf(inv);
  const role = deps.length >= 2
    ? { suggested: 'system', why: `${deps.length} deployáveis (${deps.join(', ')}): o repositório parece ser um sistema com containers` }
    : { suggested: 'service', why: deps.length ? `1 deployável (${deps[0]}): o repositório parece ser um serviço` : 'nenhum deployável identificado' };
  const warnings = [];
  if (!inv.files.graphify) warnings.push('graphify ausente: rode o graphify no repositório para enriquecer componentes, conceitos e fluxos');
  if (counts['graph-stale']) warnings.push('graphify desatualizado: o grafo foi gerado em outro commit; rode o graphify de novo');
  if (inv.repo.dirty) warnings.push('o repositório tem alterações não commitadas; a proveniência aponta para o commit atual');
  if (!inv.repo.commit) warnings.push('pasta fora de git: a proveniência fica sem commit');
  for (const f of inv.facts.filter(x => x.kind === 'warning')) warnings.push(f.message);
  if (counts.unreadable) warnings.push(`${counts.unreadable} arquivo(s) não puderam ser lidos (fatos "unreadable" no inventário)`);
  let existing = null;
  const systems = [];
  if (base) {
    const el = repoElement(base, inv);
    if (el) {
      existing = { id: el.id, name: el.name, by: 'repo', role: el.properties.repoRole ?? null };
      if (el.properties.repoRole === 'service' && deps.length >= 2) warnings.push(`registrado como service, mas o inventário tem ${deps.length} deployáveis: confirme o papel`);
    } else {
      for (const e of base.elements.values()) {
        if (!['softwareSystem', 'container'].includes(c4KindOf(base, e))) continue;
        const score = Math.max(...[e.name, e.id, ...e.aliases].map(n => similarity(inv.repo.name, n)));
        if (score >= 0.6 && (!existing || score > existing.score)) existing = { id: e.id, name: e.name, by: 'name', score: +score.toFixed(2) };
      }
    }
    systems.push(...probableSystems(inv, base));
  }
  const communities = inv.facts.filter(f => f.kind === 'community').map(f => ({ name: f.name, size: f.size }));
  return { repo: inv.repo, counts, files: inv.files, skipped: inv.skipped ?? [], role, existing, systems, communities, warnings };
}

function probableSystems(inv, base) {
  const why = new Map();
  const add = (id, reason) => { if (!id) return; if (!why.has(id)) why.set(id, []); if (!why.get(id).includes(reason)) why.get(id).push(reason); };
  const kind = e => c4KindOf(base, e);
  const systemOf = id => [id, ...ancestors(base, id)].find(x => base.elements.get(x) && kind(base.elements.get(x)) === 'softwareSystem');
  const first = aliasKey(inv.repo.name).split(' ')[0];
  for (const e of base.elements.values()) {
    if (kind(e) !== 'softwareSystem') continue;
    if ([e.name, e.id, ...e.aliases].some(n => aliasKey(n).split(' ')[0] === first)) add(e.id, `nome: o repositório começa com «${first}-» (prefixo)`);
  }
  for (const f of inv.facts.filter(f => f.kind === 'channel')) {
    const tid = `topic.${norm(f.name)}`;
    for (const r of base.relationships) {
      const other = r.from === tid ? r.to : r.to === tid ? r.from : null;
      if (other) add(systemOf(other), `tópico ${f.name} ligado a ${other}`);
    }
  }
  for (const f of inv.facts.filter(f => f.kind === 'env-ref')) {
    const hit = [...base.elements.values()].find(e => e.id.endsWith(`.${norm(f.host)}`) || e.aliases.some(a => aliasKey(a) === aliasKey(f.host)));
    if (hit) add(systemOf(hit.id), `chama ${f.host} (${hit.id})`);
  }
  for (const f of inv.facts.filter(f => f.kind === 'domain-concept')) {
    const obj = [...base.elements.values()].find(e => aliasKey(e.name) === aliasKey(f.label));
    if (!obj) continue;
    for (const r of base.relationships) if (r.to === obj.id || r.from === obj.id) add(systemOf(r.to === obj.id ? r.from : r.to), `conceito ${f.label} já modelado (${obj.id})`);
  }
  return [...why].map(([id, reasons]) => ({ id, name: base.elements.get(id).name, why: reasons })).sort((a, b) => b.why.length - a.why.length);
}

export function formatSummary(s) {
  const lines = [`Repositório ${s.repo.name}${s.repo.commit ? ` @ ${s.repo.commit.slice(0, 7)}` : ''}`];
  lines.push(`  arquivos: ${Object.entries(s.files).filter(([k, n]) => n && k !== 'ignored').map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhum reconhecido'}`);
  if (s.skipped?.length) { // the full list is in the inventory (skipped)
    const by = new Map();
    for (const x of s.skipped) by.set(x.reason, [...(by.get(x.reason) ?? []), x.path]);
    lines.push(`  arquivos reconhecidos e pulados: ${s.skipped.length} (${[...by].map(([r, ps]) => `${r}: ${ps.slice(0, 5).join(', ')}${ps.length > 5 ? ` e mais ${ps.length - 5}` : ''}`).join('; ')})`);
  }
  lines.push(`  fatos: ${Object.entries(s.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhum'}`);
  lines.push(`  papel sugerido: ${s.role.suggested} — ${s.role.why}`);
  if (s.existing) lines.push(`  já na base: ${s.existing.name} (${s.existing.id})${s.existing.by === 'repo' ? `, lido antes como ${s.existing.role}` : `, semelhança de nome ${s.existing.score}`}`);
  for (const x of s.systems) lines.push(`  sistema provável: ${x.name} (${x.id}) — ${x.why.join('; ')}`);
  if (s.communities?.length) lines.push(`  comunidades (sugestões de componentes): ${s.communities.map(c => `${c.name} (${c.size})`).join(', ')}`);
  for (const w of s.warnings) lines.push(`  aviso: ${w}`);
  lines.push('  próximo passo: confirme o papel e rode "archlens scan … --as system|service [--system <id>] [--id <id>] --delta d.json"');
  return lines.join('\n');
}
