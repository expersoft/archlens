// graphify (graphify-out/graph.json): build modules seen in the code graph, dependencies between them (aggregated),
// business flows (hyperedges), domain concepts (most connected domain nodes) and whether the graph is stale.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gradleModules } from './build.mjs';

const DEP_RELATIONS = new Set(['imports', 'calls', 'references', 'implements', 'inherits']);
const NOT_MODULES = new Set(['docs', 'doc', 'graphify-out', '.github', 'scripts', 'tools']);
const confidence = s => (s >= 0.9 ? 'alta' : s >= 0.7 ? 'média' : 'baixa');

function moduleNames(root, nodes) {
  for (const f of ['settings.gradle.kts', 'settings.gradle']) {
    const p = join(root, f);
    if (existsSync(p)) return new Set(gradleModules(readFileSync(p, 'utf8')));
  }
  return new Set(nodes.filter(n => n.file_type === 'code' && n.source_file?.includes('/')).map(n => n.source_file.split('/')[0]).filter(d => !NOT_MODULES.has(d)));
}

// Not a domain concept: a method or call ("fromJson()"), a member (".toEntity") or an id value type ("TreatmentId").
const isConcept = label => typeof label === 'string' && !label.includes('(') && !label.startsWith('.') && !/(Id|ID)$/.test(label);

export function graphifyFacts(path, text, ctx) {
  const g = JSON.parse(text);
  // graphs built on Windows carry backslashes in source_file
  const slash = f => (typeof f === 'string' ? f.replace(/\\/g, '/') : f);
  const nodes = (g.nodes ?? []).map(n => ({ ...n, source_file: slash(n.source_file) })), links = g.links ?? g.edges ?? [];
  const mods = moduleNames(ctx.root, nodes);
  const modOf = file => {
    if (!file) return null;
    const parts = file.split('/');
    for (let i = parts.length - 1; i >= 1; i--) if (mods.has(parts.slice(0, i).join('/'))) return parts.slice(0, i).join('/');
    return null;
  };
  const byId = new Map(nodes.map(n => [n.id, n]));
  const at = { file: path, line: 1 };
  const facts = [];
  const seen = new Set(nodes.filter(n => n.file_type === 'code').map(n => modOf(n.source_file)).filter(Boolean));
  for (const m of [...mods].filter(m => seen.has(m))) facts.push({ kind: 'module', name: m, executable: false, at });
  const deps = new Map();
  for (const l of links) {
    if (!DEP_RELATIONS.has(l.relation)) continue;
    const a = modOf(byId.get(l.source)?.source_file), b = modOf(byId.get(l.target)?.source_file);
    if (a && b && a !== b) deps.set(`${a}>${b}`, (deps.get(`${a}>${b}`) ?? 0) + 1);
  }
  for (const [k, count] of deps) { const [from, to] = k.split('>'); facts.push({ kind: 'module-dep', from, to, count, at }); }
  for (const h of g.hyperedges ?? g.graph?.hyperedges ?? []) {
    const own = (h.nodes ?? []).map(id => modOf(byId.get(id)?.source_file));
    // A node outside any module (document, concept) borrows the modules of its code-node neighbours.
    const viaLinks = (h.nodes ?? []).filter((id, i) => !own[i]).flatMap(id => links
      .filter(l => l.source === id || l.target === id)
      .map(l => byId.get(l.source === id ? l.target : l.source))
      .filter(n => n?.file_type === 'code').map(n => modOf(n.source_file)));
    const participants = [...new Set([...own, ...viaLinks].filter(Boolean))];
    facts.push({ kind: 'flow', label: h.label ?? h.id, participants, confidence: confidence(h.confidence_score ?? 1), at: { file: slash(h.source_file) ?? path, line: 1 } });
  }
  const degree = new Map();
  for (const l of links) for (const id of [l.source, l.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const concepts = nodes.filter(n => n.file_type === 'code' && /domain|dominio|core|model/i.test(modOf(n.source_file) ?? '') && !/test/i.test(n.source_file ?? '')
    && isConcept(n.label))
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, 10);
  for (const n of concepts) {
    facts.push({ kind: 'domain-concept', label: n.label, module: modOf(n.source_file), degree: degree.get(n.id) ?? 0,
      at: { file: n.source_file, line: Number(/L(\d+)/.exec(n.source_location ?? '')?.[1] ?? 1) } });
  }
  // communities: suggestions of components for the summary only (to-delta ignores them)
  const communities = new Map();
  for (const n of nodes) {
    const c = n.community_name;
    if (typeof c === 'string' && c.trim() && !/test|teste/i.test(c)) communities.set(c, (communities.get(c) ?? 0) + 1);
  }
  for (const [name, size] of [...communities].sort((x, y) => y[1] - x[1]).slice(0, 10)) facts.push({ kind: 'community', name, size, at });
  if (g.built_at_commit && ctx.commit && !ctx.commit.startsWith(g.built_at_commit) && !g.built_at_commit.startsWith(ctx.commit)) {
    facts.push({ kind: 'graph-stale', builtAt: g.built_at_commit, commit: ctx.commit, at });
  }
  return facts;
}
