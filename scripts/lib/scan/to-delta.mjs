// Inventory + role + base → delta (rules in references/repo-reading.md). Pure: no I/O.
import { normalizeRepoUrl } from './git.mjs';
import { ENGINES, tagOf } from './infra.mjs';
import { aliasKey } from '../match.mjs';

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const repoKey = repo => (repo.url ? normalizeRepoUrl(repo.url) : repo.path);

/** Image name without registry, path and tag ("ghcr.io/acme/pagamentos:2.1" → "pagamentos"). */
const imageName = image => String(image).split('@')[0].split(/:(?=[^/]*$)/)[0].split('/').at(-1);

/**
 * A compose service this repository builds (build:) or whose image carries the repository's name; any other
 * service is a sibling (another repository's image) that only runs alongside, so it is a host, not a deployable.
 */
export const ownService = (f, repo) => f.kind !== 'service' || f.build != null || f.image == null || norm(imageName(f.image)) === norm(repo.name);

/** The element of the base already standing for this repository (properties.repo), or null. */
export function repoElement(base, inv) {
  if (!base) return null;
  const key = repoKey(inv.repo);
  return [...base.elements.values()].find(e => e.properties?.repo === key) ?? null;
}

const DEFAULT_ROOT_AT = { file: '.', line: 1 };
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const canonical = s => JSON.stringify(Object.keys(s).sort().map(k => [k, s[k]]));

export function toDelta(inv, { role, system, id, base = null } = {}) {
  const key = repoKey(inv.repo);
  const ref = `${key}@${inv.repo.commit ? inv.repo.commit.slice(0, 7) : 'sem-commit'}`;
  const facts = inv.facts;
  const inBase = x => !!base?.elements.has(x);
  const elements = new Map();
  const rels = [];
  const relSeen = new Set();
  const src = (at, excerpt) => ({ kind: 'repo', ref, path: at.file, line: at.line, ...(excerpt ? { excerpt } : {}) });
  // Elements already in the base: only id + enrichment (no name/type/parent, so no false conflicts).
  const put = (el, at, excerpt) => {
    const s = src(at, excerpt);
    const cur = elements.get(el.id);
    if (cur) {
      if (!cur.sources.some(x => x.path === s.path && x.line === s.line)) cur.sources.push(s);
      return el.id;
    }
    const body = inBase(el.id) ? Object.fromEntries(Object.entries(el).filter(([k]) => !['name', 'type', 'parent'].includes(k))) : el;
    elements.set(el.id, { ...body, sources: [s] });
    return el.id;
  };
  const link = (from, to, type, at, { excerpt, ...extra } = {}) => {
    if (!from || !to || from === to) return;
    if (elements.get(to)?.parent === from || base?.elements.get(to)?.parent === from) return; // container → own component
    const k = `${from}|${type}|${to}`;
    if (relSeen.has(k)) return;
    relSeen.add(k);
    rels.push({ from, to, type, ...extra, sources: [src(at, excerpt)] });
  };
  const childId = (parent, name) => {
    const k = aliasKey(name);
    const hit = base && [...base.elements.values()].find(e => e.parent === parent
      && (aliasKey(e.name) === k || e.aliases.some(x => aliasKey(x) === k) || e.id === `${parent}.${norm(name)}`));
    return hit?.id ?? `${parent}.${norm(name)}`;
  };
  const existing = repoElement(base, inv);

  // sibling compose services (another repository's image): hosts for depends_on/env-ref, never deployables
  const siblings = new Set(facts.filter(x => x.kind === 'service' && !ownService(x, inv.repo)).map(x => norm(x.name)));
  const runtimeNames = [];
  for (const f of facts.filter(x => ['service', 'workload', 'chart'].includes(x.kind) && ownService(x, inv.repo))) {
    if (!runtimeNames.some(n => norm(n) === norm(f.name))) runtimeNames.push(f.name);
  }

  // the repository: a system (role system) or one container of a system (role service)
  let sysId, ownId = null;
  if (role === 'system') {
    sysId = id ?? existing?.id ?? norm(inv.repo.name);
    put({ id: sysId, type: 'c4:softwareSystem', name: inv.repo.name, properties: { repo: key, repoRole: 'system' } }, DEFAULT_ROOT_AT);
  } else {
    sysId = system;
    // always part of this reading (for an existing system only the provenance goes out), so it is never "vanished"
    put({ id: sysId, type: 'c4:softwareSystem', name: sysId }, DEFAULT_ROOT_AT);
    ownId = id ?? existing?.id ?? `${sysId}.${norm(inv.repo.name)}`;
    // the names it runs under (compose service, k8s workload, Helm chart), so later readings find it by host
    const aliases = runtimeNames.filter(n => norm(n) !== norm(inv.repo.name));
    put({ id: ownId, type: 'c4:container', parent: sysId, name: inv.repo.name, ...(aliases.length ? { aliases } : {}),
      properties: { repo: key, repoRole: 'service' } }, DEFAULT_ROOT_AT);
  }

  // modules and their dependencies (graphify and build facts merged by name): provenance from the build file when
  // there is one; for a dependency, the larger count (graphify counts code references) and its description
  const fromGraph = at => String(at?.file ?? '').startsWith('graphify-out/');
  const preferBuild = (cur, next) => (!cur || (fromGraph(cur) && !fromGraph(next)) ? next : cur);
  const modules = new Map();
  for (const f of facts.filter(x => x.kind === 'module')) {
    const m = modules.get(f.name);
    modules.set(f.name, { name: f.name, executable: !!(m?.executable || f.executable), at: preferBuild(m?.at, f.at) });
  }
  const depsBy = new Map();
  for (const f of facts.filter(x => x.kind === 'module-dep')) {
    const k = `${f.from}>${f.to}`;
    const d = depsBy.get(k);
    depsBy.set(k, d ? { ...d, count: Math.max(d.count, f.count), at: preferBuild(d.at, f.at) } : { ...f });
  }
  const modDeps = [...depsBy.values()];

  // deployables (role system): compose services, k8s/helm workloads, executable modules — merged by name
  const deploy = new Map();
  if (role === 'system') {
    for (const f of facts.filter(x => (x.kind === 'service' || x.kind === 'workload') && ownService(x, inv.repo))) {
      const k = norm(f.name);
      if (!deploy.has(k)) deploy.set(k, { name: f.name, dir: f.build ?? null, at: f.at, technology: f.image });
    }
    for (const m of modules.values()) {
      if (!m.executable) continue;
      const d = deploy.get(norm(m.name));
      if (d) d.dir ??= m.name; else deploy.set(norm(m.name), { name: m.name, dir: m.name, at: m.at });
    }
    for (const d of deploy.values()) {
      d.id = childId(sysId, d.name);
      put({ id: d.id, type: 'c4:container', parent: sysId, name: d.name, ...(d.technology ? { technology: d.technology } : {}) }, d.at);
    }
  }
  const deployables = [...deploy.values()];

  // Placeholders (ext.*) that earlier readings of other repositories created for a host that is this
  // repository: this reading claims them (removed, their relationships moved to the real element).
  const claims = new Map(); // placeholder id → real id
  if (base) {
    const placeholders = [...base.elements.values()].filter(e => e.id.startsWith('ext.') && (e.c4?.external || e.external)
      && e.inferred && e.sources.length && e.sources.every(x => x.kind === 'repo'));
    const claim = (realId, names) => {
      const b = base.elements.get(realId);
      const keys = new Set([...names, realId.split('.').at(-1), ...(b ? [b.name, ...b.aliases] : [])].map(norm).filter(Boolean));
      for (const p of placeholders) if (!claims.has(p.id) && p.id !== realId && keys.has(norm(p.name))) claims.set(p.id, realId);
    };
    if (role === 'service') claim(ownId, [inv.repo.name, ...runtimeNames]);
    for (const d of deployables) claim(d.id, [d.name]);
    if (role === 'system') claim(sysId, [inv.repo.name]);
  }
  const ownerOf = file => {
    if (role === 'service') return ownId;
    const hit = deployables.filter(d => d.dir != null && (d.dir === '' || file === d.dir || file.startsWith(`${d.dir}/`))).sort((x, y) => y.dir.length - x.dir.length)[0];
    return hit?.id ?? (deployables.length === 1 ? deployables[0].id : sysId);
  };
  const deployId = name => deploy.get(norm(name))?.id;

  // modules → elements
  const modEl = new Map();
  for (const m of modules.values()) {
    if (role === 'service') {
      const mid = `${ownId}.${norm(m.name)}`;
      put({ id: mid, type: 'c4:component', parent: ownId, name: m.name }, m.at);
      modEl.set(m.name, mid);
    } else if (m.executable) {
      modEl.set(m.name, deployId(m.name));
    } else {
      const users = modDeps.filter(d => d.to === m.name && modules.get(d.from)?.executable).sort((x, y) => y.count - x.count);
      if (users.length) {
        const parent = deployId(users[0].from);
        const mid = `${parent}.${norm(m.name)}`;
        put({ id: mid, type: 'c4:component', parent, name: m.name, inferred: true, confidence: 'média' }, m.at, `usado sobretudo por ${users[0].from}`);
        modEl.set(m.name, mid);
      } else {
        const mid = childId(sysId, m.name);
        put({ id: mid, type: 'c4:container', parent: sysId, name: m.name, tags: ['library'] }, m.at);
        modEl.set(m.name, mid);
      }
    }
  }
  for (const d of modDeps) link(modEl.get(d.from), modEl.get(d.to), 'uses', d.at, { description: `${d.count} referência(s) no código` });

  // infrastructure: compose/k8s/helm engines and Terraform resources
  const infra = new Map();
  const infraIdOf = name => (role === 'service' ? `${ownId}-${norm(name)}` : childId(sysId, name));
  const engine = (eng, version, at) => {
    const label = ENGINES.find(e => e.engine === eng)?.label ?? eng;
    return put({ id: `tech.${norm(eng)}${version ? `-${norm(version)}` : ''}`, type: 'archimate:system-software', name: version ? `${label} ${version}` : label }, at);
  };
  for (const f of facts.filter(x => x.kind === 'infra-image')) {
    const iid = put({ id: infraIdOf(f.service), type: 'c4:container', parent: sysId, name: f.service, tags: [tagOf(f.category)] }, f.at);
    infra.set(f.service, iid);
    link(engine(f.engine, f.version, f.at), iid, f.category === 'database' ? 'archimate:realization' : 'archimate:serving', f.at);
  }
  for (const f of facts.filter(x => x.kind === 'cloud-resource')) {
    const rk = `${f.type}.${f.name}`;
    if (f.category === 'cluster') {
      const nid = put({ id: `tech.${norm(f.type)}-${norm(f.name)}`, type: 'archimate:node', name: f.name, technology: f.type }, f.at);
      infra.set(rk, nid);
      for (const d of deployables) link(nid, d.id, 'archimate:serving', f.at);
      if (ownId) link(nid, ownId, 'archimate:serving', f.at);
      continue;
    }
    infra.set(rk, put({ id: infraIdOf(f.name), type: 'c4:container', parent: sysId, name: f.name, technology: f.type, tags: [tagOf(f.category)] }, f.at));
  }
  const cloud = new Map(facts.filter(x => x.kind === 'cloud-resource').map(f => [`${f.type}.${f.name}`, f]));
  for (const f of facts.filter(x => x.kind === 'tf-ref')) {
    if (cloud.get(f.from)?.category === 'database') continue; // serving cannot target a data object
    link(infra.get(f.to), infra.get(f.from), 'archimate:serving', f.at);
  }

  // relations between what runs: depends_on and hosts in configuration
  const runId = name => (siblings.has(norm(name)) ? null : deployId(name) ?? infra.get(name) ?? (role === 'service' ? ownId : null));
  const baseHost = host => {
    if (!base) return null;
    const k = aliasKey(host);
    // Only what a host can be (a live container or software system, never a topic); rank the real
    // container first, then an internal system, and only then an external/ext.* placeholder.
    const rank = e => (e.c4.external || e.id.startsWith('ext.') ? 2 : e.c4.kind === 'container' ? 0 : 1);
    const hits = [...base.elements.values()].filter(e => ['container', 'softwareSystem'].includes(e.c4?.kind)
      && e.status !== 'retired' && !e.tags.includes('topic') && !e.id.startsWith('topic.')
      && (e.id === norm(host) || e.id.endsWith(`.${norm(host)}`) || e.aliases.some(x => aliasKey(x) === k)));
    const hit = hits.sort((x, y) => rank(x) - rank(y))[0]?.id ?? null;
    return claims.get(hit) ?? hit;
  };
  const hostId = (host, at, excerpt) => deployId(host) ?? infra.get(host) ?? baseHost(host)
    ?? put({ id: `ext.${norm(host)}`, type: 'c4:softwareSystem', name: host, external: true, inferred: true, confidence: 'baixa' }, at, excerpt);
  for (const f of facts.filter(x => x.kind === 'depends-on')) {
    // a sibling service is resolved like any host (base element or placeholder)
    const to = siblings.has(norm(f.to)) ? hostId(f.to, f.at, `depends_on ${f.to}`) : runId(f.to);
    link(runId(f.from), to, 'uses', f.at, { description: 'depends_on' });
  }
  for (const f of facts.filter(x => x.kind === 'env-ref')) {
    const from = runId(f.from);
    if (!from) continue;
    link(from, hostId(f.host, f.at, `host em ${f.var}`), 'uses', f.at, { description: `via ${f.var}`, inferred: true, excerpt: `${f.var} → ${f.host}` });
  }

  // contracts: APIs (interfaces) and channels (topics)
  for (const f of facts.filter(x => x.kind === 'api')) {
    const owner = ownerOf(f.at.file);
    const aid = put({ id: `${owner}.api-${norm(f.title)}`, type: 'archimate:application-interface', name: f.title,
      properties: { version: f.version, operations: f.operations } }, f.at);
    link(owner, aid, 'archimate:realization', f.at);
  }
  for (const f of facts.filter(x => x.kind === 'channel')) {
    const tid = put({ id: `topic.${norm(f.name)}`, type: 'c4:container', name: f.name, tags: ['topic'] }, f.at);
    const owner = ownerOf(f.at.file);
    if (f.action === 'publish') link(owner, tid, 'archimate:flow', f.at, { description: `publica ${f.message ?? f.name}` });
    else link(tid, owner, 'archimate:flow', f.at, { description: `assina ${f.message ?? f.name}` });
  }

  // graphify: business flows and domain concepts (deductions)
  for (const f of facts.filter(x => x.kind === 'flow')) {
    const pid = put({ id: `proc.${norm(f.label).slice(0, 60)}`, type: 'archimate:business-process', name: f.label, inferred: true, confidence: f.confidence }, f.at);
    const parts = [...new Set(f.participants.map(m => modEl.get(m)).filter(Boolean))];
    for (const p of parts.length ? parts : [ownId ?? sysId]) link(p, pid, 'archimate:serving', f.at);
  }
  for (const f of facts.filter(x => x.kind === 'domain-concept')) {
    const data = /data|infra|persist/i.test(f.module ?? '');
    const oid = put({ id: `obj.${norm(f.label)}`, type: data ? 'archimate:data-object' : 'archimate:business-object', name: f.label, inferred: true, confidence: 'média' }, f.at);
    link(modEl.get(f.module) ?? ownId ?? sysId, oid, 'archimate:access', f.at);
  }

  // claimed placeholders: removed, and every base relationship at either end re-emitted on the real element
  // with its ORIGINAL provenance (it is the other repository's fact, not this reading's)
  const ops = [];
  for (const [pid, realId] of claims) {
    ops.push({ op: 'remove', id: pid, reason: `substituído por ${realId} (lido em ${ref})` });
    for (const r of base.relationships) {
      const ends = r.c4 ?? r;
      if (!claims.has(ends.from) && !claims.has(ends.to)) continue;
      if (ends.from !== pid && ends.to !== pid) continue; // moved once, by the placeholder at its "from" or "to"
      const from = claims.get(ends.from) ?? ends.from;
      const to = claims.get(ends.to) ?? ends.to;
      if (from === to) continue;
      const type = r.c4 ? 'uses' : `archimate:${r.type}`;
      const k = `${from}|${type}|${to}`;
      const sources = r.sources.map(x => ({ ...x }));
      const known = rels.find(x => `${x.from}|${x.type}|${x.to}` === k);
      if (known) {
        for (const x of sources) if (!known.sources.some(y => canonical(y) === canonical(x))) known.sources.push(x);
        continue;
      }
      relSeen.add(k);
      rels.push({ from, to, type, ...pick(r, ['description', 'technology', 'inferred', 'accessType']),
        ...(r.status && r.status !== 'active' ? pick(r, ['status', 'statusReason']) : {}), sources });
    }
  }

  // what vanished: base elements whose only sources are this repository and that this reading did not produce
  // Elements this reading still points at (e.g. a host resolved to an existing base element) count as found.
  if (base) {
    const touched = new Set(rels.flatMap(r => [r.from, r.to]));
    for (const e of base.elements.values()) {
      if (elements.has(e.id) || touched.has(e.id) || claims.has(e.id) || e.status === 'retired' || !e.sources.length) continue;
      if (e.sources.every(s => s.kind === 'repo' && String(s.ref ?? '').startsWith(`${key}@`))) {
        ops.push({ op: 'status', id: e.id, status: 'retired', reason: `não encontrado em ${ref}` });
      }
    }
  }
  return {
    'archlens-delta': '1.0',
    source: { kind: 'repo', ref },
    summary: `Leitura de ${inv.repo.name}${inv.repo.commit ? `@${inv.repo.commit.slice(0, 7)}` : ''}`,
    model: { elements: [...elements.values()], relationships: rels },
    ...(ops.length ? { ops } : {}),
  };
}
