// The files a repository scan looks at: build/dependency folders and .gitignore entries skipped, types by name.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, dirname, extname, sep } from 'node:path';

const IGNORE_DIRS = new Set(['node_modules', 'vendor', '.git', 'build', 'dist', 'target', '.gradle', '.venv', '.idea', '__pycache__', '.terraform']);

function gitignore(root) {
  const p = join(root, '.gitignore');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('!'))
    .map(l => l.replace(/^\//, '').replace(/\/$/, ''));
}

const ignored = (rel, patterns) => patterns.some(p => (p.startsWith('*.') ? rel.endsWith(p.slice(1))
  : rel === p || rel.startsWith(`${p}/`) || rel.split('/').includes(p)));

// Test code and its fixtures describe other (often fake) systems: skipped at any depth below the root, unless a
// folder above them is a deploy folder (deploy/k8s/overlays/test is an environment, not test code). spec/ is read:
// it usually holds the API contracts.
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'fixtures']);
const DEPLOY_DIRS = new Set(['deploy', 'k8s', 'kustomize', 'helm', 'charts', 'environments', 'overlays', 'infra', 'terraform']);
const skippedTestDir = rel => {
  const parts = rel.split('/');
  return TEST_DIRS.has(parts.at(-1)) && !parts.slice(0, -1).some(p => DEPLOY_DIRS.has(p));
};
// graphify-out/ is usually gitignored, but its graph is exactly what the scan wants.
const GRAPH = 'graphify-out/graph.json';

/** Files of the scan, plus the files inside skipped test/fixture folders (the caller reports the recognised ones). */
export function listFiles(root) {
  const patterns = gitignore(root);
  const out = [];
  const inTests = [];
  const collect = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) collect(abs); } else if (e.isFile()) inTests.push({ path: relative(root, abs).split(sep).join('/') });
    }
  };
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || rel === 'graphify-out/cache' || (rel !== 'graphify-out' && ignored(rel, patterns))) continue;
        if (skippedTestDir(rel)) { collect(abs); continue; }
        walk(abs);
      } else if (e.isFile() && (rel === GRAPH || !ignored(rel, patterns))) out.push({ path: rel, abs, size: statSync(abs).size });
    }
  };
  walk(root);
  const byPath = (a, b) => a.path.localeCompare(b.path);
  return { files: out.sort(byPath), inTests: inTests.sort(byPath) };
}

/** Type of a file by its name (content-based types — k8s, OpenAPI, AsyncAPI — are decided after parsing). */
export function detect(path, chartDirs) {
  const base = basename(path), ext = extname(path).toLowerCase(), dir = dirname(path);
  if (path === 'graphify-out/graph.json') return 'graphify';
  if (path.startsWith('graphify-out/')) return null;
  if (/^(docker-)?compose[\w.-]*\.ya?ml$/i.test(base)) return 'compose';
  if (base === 'Chart.yaml') return 'helm-chart';
  if (/^values[\w.-]*\.ya?ml$/i.test(base) && chartDirs.has(dir)) return 'helm-values';
  if (ext === '.tf') return 'terraform';
  if (['settings.gradle', 'settings.gradle.kts', 'pom.xml', 'go.mod'].includes(base) && dir === '.') return 'build';
  if (base === 'package.json' && dir === '.') return 'build';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  if (ext === '.json' && !/(^|\/)(package-lock|tsconfig|composer)\b/.test(path)) return 'json';
  return null;
}
