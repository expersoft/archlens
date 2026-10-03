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

export function listFiles(root) {
  const patterns = gitignore(root);
  const out = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || rel === 'graphify-out/cache' || ignored(rel, patterns)) continue;
        walk(abs);
      } else if (e.isFile() && !ignored(rel, patterns)) out.push({ path: rel, abs, size: statSync(abs).size });
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
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
