// Repository scan: walk the files, hand each recognised one to its extractor, collect the facts (inventory).
import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { listFiles, detect } from './walk.mjs';
import { readYaml } from './yaml.mjs';
import { repoInfo, repoName, normalizeRepoUrl, isGitUrl, cloneShallow, assertFolder } from './git.mjs';
import { composeFacts } from './compose.mjs';
import { k8sFacts } from './k8s.mjs';
import { helmChartFacts, helmValuesFacts } from './helm.mjs';

const MAX = 2 * 1024 * 1024, MAX_GRAPH = 64 * 1024 * 1024;
const isoToday = () => new Date().toISOString().slice(0, 10);

/** One file → { kind: inventory file counter | null, facts }. Content-typed YAML/JSON is decided here. */
function extract(type, path, text, ctx) {
  if (type === 'compose') return { kind: 'compose', facts: composeFacts(path, text) };
  if (type === 'helm-chart') {
    const facts = helmChartFacts(path, text);
    ctx.chartNames.set(dirname(path), facts[0].name);
    return { kind: 'helm', facts };
  }
  if (type === 'helm-values') return { kind: 'helm', facts: helmValuesFacts(path, text, ctx.chartNames.get(dirname(path)) ?? 'chart') };
  if (type === 'yaml') {
    const docs = readYaml(text);
    if (docs.some(d => d.data?.apiVersion && d.data?.kind)) return { kind: 'k8s', facts: k8sFacts(path, docs) };
    return { kind: null, facts: [] };
  }
  return { kind: null, facts: [] };
}

export function scanDir(root, { url, today = isoToday(), helmRender = false } = {}) {
  const info = repoInfo(root);
  const ctx = { root, commit: info.commit, helmRender, chartNames: new Map() };
  const files = { compose: 0, k8s: 0, helm: 0, terraform: 0, openapi: 0, asyncapi: 0, graphify: 0, build: 0, ignored: 0 };
  const facts = [];
  const all = listFiles(root);
  const chartDirs = new Set(all.filter(f => f.path.endsWith('Chart.yaml')).map(f => dirname(f.path)));

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
    const type = detect(f.path, chartDirs);
    if (!type || f.size > (type === 'graphify' ? MAX_GRAPH : MAX)) { files.ignored++; continue; }
    try {
      const out = extract(type, f.path, readFileSync(f.abs, 'utf8'), ctx);
      if (!out.kind) { files.ignored++; continue; }
      files[out.kind]++;
      facts.push(...out.facts);
    } catch (e) {
      facts.push({ kind: 'unreadable', error: String(e.message).split('\n')[0], at: { file: f.path, line: 1 } });
    }
  }
  return {
    'archlens-inventory': '1.0',
    repo: { ...(url ? { url: normalizeRepoUrl(url) } : {}), path: root, name: repoName(url ?? root), commit: info.commit, dirty: info.dirty, scannedAt: today },
    files, facts,
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
