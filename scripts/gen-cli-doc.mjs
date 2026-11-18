#!/usr/bin/env node
// docs/cli.md, the CLI reference, generated from the help text of scripts/archlens.mjs so it never drifts from it.
// npm run cli-doc rewrites it; --check only reports (exit 1), as check-ask does. The CLI runs its main() when
// imported, so the help comes from running it, not from importing HELP.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/cli.md', import.meta.url));

/** The help text of the CLI, as `archlens --help` prints it. */
export function cliHelp() {
  return execFileSync(process.execPath, [fileURLToPath(new URL('./archlens.mjs', import.meta.url)), '--help'], { cwd: ROOT, encoding: 'utf8' });
}

/** The commands the help lists: the first word of each line indented by exactly two spaces. */
export function cliCommands(help) {
  const out = [];
  for (const line of help.split('\n')) {
    const m = /^ {2}([a-z][a-z-]*)(?:\s|$)/.exec(line);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** docs/cli.md for this help text. */
export function cliDoc(help) {
  return [
    '# Referência da CLI',
    '',
    '<!-- Gerado por `npm run cli-doc` a partir de `archlens --help`. Não edite: mude o texto de ajuda em scripts/archlens.mjs. -->',
    '',
    'O texto abaixo é o que `archlens --help` imprime. Guia de uso: [GUIA.md](GUIA.md).',
    '',
    '```text',
    help.trimEnd(),
    '```',
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const want = cliDoc(cliHelp());
  let have = '';
  try { have = readFileSync(OUT, 'utf8'); } catch { /* not there yet */ }
  if (process.argv.includes('--check')) {
    if (have !== want) console.error('archlens: docs/cli.md não acompanha a ajuda da CLI; rode "npm run cli-doc"');
    process.exitCode = have === want ? 0 : 1;
  } else if (have !== want) {
    writeFileSync(OUT, want);
    console.log('✓ docs/cli.md regenerado');
  } else console.log('= docs/cli.md já em dia');
}
