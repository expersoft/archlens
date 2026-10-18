#!/usr/bin/env node
// Rewrites .claude-plugin/{plugin,marketplace}.json from package.json, so the plugin version never drifts.
// Claude Code caches an installed plugin by version: a release that keeps the version never reaches the users.
// Runs on "npm version" (scripts.version); --check only reports drift (exit 1).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, '.claude-plugin');

export function pluginManifests(pkg) {
  const author = { name: pkg.author };
  const plugin = { name: pkg.name, version: pkg.version, description: pkg.description, author };
  const marketplace = {
    name: pkg.name,
    description: 'Marketplace do archlens: as skills archlens-plan, archlens-apply e archlens-query',
    owner: author,
    plugins: [{ name: pkg.name, source: './', version: pkg.version, description: pkg.description }],
  };
  return { plugin, marketplace };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = Object.entries(pluginManifests(pkg)).map(([name, json]) => [join(DIR, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`]);
  const stale = files.filter(([path, text]) => readFileSync(path, 'utf8') !== text);
  if (process.argv.includes('--check')) {
    for (const [path] of stale) console.error(`archlens: ${path} não acompanha o package.json; rode "node scripts/sync-plugin.mjs"`);
    process.exitCode = stale.length ? 1 : 0;
  } else {
    for (const [path, text] of stale) writeFileSync(path, text);
    console.log(stale.length ? `✓ manifestos do plugin na versão ${pkg.version}` : `= manifestos do plugin já na versão ${pkg.version}`);
  }
}
