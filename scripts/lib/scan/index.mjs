// Repository scan: walk the files, hand each recognised one to its extractor, collect the facts (inventory).
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { listFiles, detect } from './walk.mjs';
import { readYaml } from './yaml.mjs';
import { repoInfo, repoName, normalizeRepoUrl, isGitUrl, cloneShallow, assertFolder, remoteUrl } from './git.mjs';
import { composeFacts } from './compose.mjs';
import { k8sFacts } from './k8s.mjs';
import { helmChartFacts, helmValuesFacts } from './helm.mjs';
import { terraformFacts } from './terraform.mjs';
import { openapiFacts } from './openapi.mjs';
import { asyncapiFacts } from './asyncapi.mjs';
import { graphifyFacts } from './graphify.mjs';
import { buildFacts } from './build.mjs';

const MAX = 2 * 1024 * 1024, MAX_GRAPH = 64 * 1024 * 1024;
// a .json/.yaml named after an API contract is reported when it cannot be read; other generic ones stay ignored
const contractNamed = path => /openapi|swagger|asyncapi/i.test(basename(path));
// the reader's calendar day (not UTC): a scan late in the evening is still dated today
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** One file → { kind: inventory file counter | null, facts }. Content-typed YAML/JSON is decided here. */
function extract(type, path, text, ctx) {
  if (type === 'compose') return { kind: 'compose', facts: composeFacts(path, text) };
  if (type === 'helm-chart') {
    const facts = helmChartFacts(path, text);
    ctx.chartNames.set(dirname(path), facts[0].name);
    return { kind: 'helm', facts };
  }
  if (type === 'helm-values') return { kind: 'helm', facts: helmValuesFacts(path, text, ctx.chartNames.get(dirname(path)) ?? 'chart') };
  if (type === 'graphify') return { kind: 'graphify', facts: graphifyFacts(path, text, ctx) };
  if (type === 'build') return { kind: 'build', facts: buildFacts(path, text, ctx) };
  if (type === 'terraform') return { kind: 'terraform', facts: terraformFacts(path, text) };
  if (type === 'yaml' || type === 'json') {
    let docs;
    if (type === 'json') {
      try {
        docs = [{ data: JSON.parse(text), lineOf: () => 1 }];
      } catch (e) {
        if (contractNamed(path)) throw e;
        return { kind: null, facts: [] };
      }
    } else {
      docs = readYaml(text);
    }
    const first = docs[0]?.data ?? {};
    if (first.openapi || first.swagger) return { kind: 'openapi', facts: openapiFacts(path, docs[0]) };
    if (first.asyncapi) return { kind: 'asyncapi', facts: asyncapiFacts(path, docs[0]) };
    if (type === 'yaml' && docs.some(d => d.data?.apiVersion && d.data?.kind)) return { kind: 'k8s', facts: k8sFacts(path, docs) };
    return { kind: null, facts: [] };
  }
  return { kind: null, facts: [] };
}

/** --helm-render: `helm template <chart>` for each chart, read as k8s manifests; without helm, one warning fact. */
function renderCharts(root, chartDirs, files) {
  const facts = [];
  for (const d of chartDirs) {
    const file = `${d === '.' ? '' : `${d}/`}templates (helm template)`;
    const r = spawnSync('helm', ['template', join(root, d)], { encoding: 'utf8', timeout: 60000, maxBuffer: MAX_GRAPH });
    if (r.error?.code === 'ENOENT') return [{ kind: 'warning', message: 'helm não encontrado: --helm-render ignorado', at: { file: '.', line: 1 } }];
    if (r.error || r.status !== 0) {
      const why = r.error ? r.error.message : (r.stderr || '').trim().split('\n').at(-1);
      facts.push({ kind: 'unreadable', error: `helm template falhou: ${why}`, at: { file, line: 1 } });
      continue;
    }
    try {
      facts.push(...k8sFacts(file, readYaml(r.stdout)).map(f => ({ ...f, at: { file, line: 1 } })));
      files.helm++;
    } catch (e) {
      facts.push({ kind: 'unreadable', error: String(e.message).split('\n')[0], at: { file, line: 1 } });
    }
  }
  return facts;
}

export function scanDir(root, { url, today = isoToday(), helmRender = false } = {}) {
  const info = repoInfo(root);
  // identity: the url given, else the "origin" remote of a local clone, else (no url) the absolute path
  const id = url ?? (info.commit ? remoteUrl(root) : null);
  const ctx = { root, commit: info.commit, helmRender, chartNames: new Map() };
  const files = { compose: 0, k8s: 0, helm: 0, terraform: 0, openapi: 0, asyncapi: 0, graphify: 0, build: 0, ignored: 0 };
  const facts = [];
  const { files: all, skipped } = listFiles(root);
  files.ignored += skipped;
  const chartDirs = new Set(all.filter(f => f.path.endsWith('Chart.yaml')).map(f => dirname(f.path)));
  // Helm templates are Go templates, not YAML: never parsed as manifests (--helm-render renders them instead)
  const inTemplates = p => [...chartDirs].some(d => p.startsWith(d === '.' ? 'templates/' : `${d}/templates/`));

  // Pre-read Chart.yaml files to populate ctx.chartNames before processing values files
  for (const f of all) {
    if (f.path.endsWith('Chart.yaml') && f.size <= MAX) {
      try {
        const text = readFileSync(f.abs, 'utf8');
        const chartFacts = helmChartFacts(f.path, text);
        ctx.chartNames.set(dirname(f.path), chartFacts[0].name);
      } catch {
        // Chart.yaml parse errors will be reported as unreadable in the main loop
      }
    }
  }

  for (const f of all) {
    const type = inTemplates(f.path) ? null : detect(f.path, chartDirs);
    if (!type) { files.ignored++; continue; }
    if (f.size > (type === 'graphify' ? MAX_GRAPH : MAX)) {
      if ((type === 'yaml' || type === 'json') && !contractNamed(f.path)) { files.ignored++; continue; }
      facts.push({ kind: 'unreadable', error: `arquivo grande demais (${(f.size / 1048576).toFixed(1)} MB)`, at: { file: f.path, line: 1 } });
      continue;
    }
    try {
      const out = extract(type, f.path, readFileSync(f.abs, 'utf8'), ctx);
      if (!out.kind) { files.ignored++; continue; }
      files[out.kind]++;
      facts.push(...out.facts);
    } catch (e) {
      facts.push({ kind: 'unreadable', error: String(e.message).split('\n')[0], at: { file: f.path, line: 1 } });
    }
  }

  if (helmRender) facts.push(...renderCharts(root, [...chartDirs].sort(), files));

  // Post-pass: filter tf-refs to only those between emitted resources
  const emittedResources = new Set(facts.filter(f => f.kind === 'cloud-resource').map(f => `${f.type}.${f.name}`));
  const filteredFacts = facts.filter(f => {
    if (f.kind === 'tf-ref') {
      return emittedResources.has(f.from) && emittedResources.has(f.to);
    }
    return true;
  });

  return {
    'archlens-inventory': '1.0',
    repo: { ...(id ? { url: normalizeRepoUrl(id) } : {}), path: root, name: repoName(id ?? root), commit: info.commit, dirty: info.dirty, scannedAt: today },
    files, facts: filteredFacts,
  };
}

/** A local folder or a git url (shallow clone in a temp folder, removed afterwards). */
export function scanSource(target, { ref, today, helmRender } = {}) {
  if (!isGitUrl(target)) return scanDir(assertFolder(target), { today, helmRender });
  const dir = cloneShallow(target, { ref });
  try {
    const inv = scanDir(dir, { url: target, today, helmRender });
    return { ...inv, repo: { ...inv.repo, path: normalizeRepoUrl(target) } }; // the temp folder is gone afterwards
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
