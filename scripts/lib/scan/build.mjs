// Build files: modules of a multi-module repository (Gradle, Maven, npm workspaces, Go) and the dependencies
// between them. Used for modules when there is no graphify graph, and for the "executable" flag in any case.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXECUTABLE_GRADLE = /com\.android\.application|plugins\.android\.application|id\s*\(?\s*["']application["']|org\.springframework\.boot|apply\s+plugin:\s*["']application["']/;
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null);

export function gradleModules(text) {
  const out = [];
  for (const m of text.matchAll(/include\s*\(?([^)\n]+)\)?/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^["']|["']$/g, '').replace(/^:/, '').replace(/:/g, '/');
      if (name) out.push(name);
    }
  }
  return out;
}

export function buildFacts(path, text, ctx) {
  const facts = [];
  const at = (file, line = 1) => ({ file, line });
  if (path.startsWith('settings.gradle')) {
    for (const m of gradleModules(text)) {
      const file = existsSync(join(ctx.root, m, 'build.gradle.kts')) ? `${m}/build.gradle.kts` : `${m}/build.gradle`;
      const bt = read(join(ctx.root, file)) ?? '';
      facts.push({ kind: 'module', name: m, executable: EXECUTABLE_GRADLE.test(bt), at: at(path) });
      bt.split('\n').forEach((l, i) => {
        for (const d of l.matchAll(/project\(\s*["']:([^"']+)["']\s*\)/g)) facts.push({ kind: 'module-dep', from: m, to: d[1].replace(/:/g, '/'), count: 1, at: at(file, i + 1) });
      });
    }
  } else if (path === 'pom.xml') {
    for (const [, m] of text.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)) {
      const child = read(join(ctx.root, m, 'pom.xml')) ?? '';
      facts.push({ kind: 'module', name: m, executable: /spring-boot-maven-plugin|maven-shade-plugin|<mainClass>/.test(child), at: at(path) });
    }
  } else if (path === 'package.json') {
    const root = JSON.parse(text);
    const globs = Array.isArray(root.workspaces) ? root.workspaces : root.workspaces?.packages ?? [];
    const dirs = globs.flatMap(g => (g.endsWith('/*')
      ? (existsSync(join(ctx.root, g.slice(0, -2))) ? readdirSync(join(ctx.root, g.slice(0, -2)), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => `${g.slice(0, -2)}/${e.name}`) : [])
      : [g]));
    const pkgs = dirs.map(d => ({ dir: d, pkg: JSON.parse(read(join(ctx.root, d, 'package.json')) ?? 'null') })).filter(x => x.pkg);
    const byName = new Map(pkgs.map(x => [x.pkg.name, x.dir]));
    for (const { dir, pkg } of pkgs) {
      facts.push({ kind: 'module', name: dir, executable: !!(pkg.bin || pkg.scripts?.start), at: at(`${dir}/package.json`) });
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (byName.has(dep)) facts.push({ kind: 'module-dep', from: dir, to: byName.get(dep), count: 1, at: at(`${dir}/package.json`) });
      }
    }
  } else if (path === 'go.mod') {
    const name = /^module\s+(\S+)/m.exec(text)?.[1]?.split('/').at(-1) ?? 'main';
    facts.push({ kind: 'module', name, executable: existsSync(join(ctx.root, 'main.go')) || existsSync(join(ctx.root, 'cmd')), at: at(path) });
  }
  return facts;
}
