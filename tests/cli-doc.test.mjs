// docs/cli.md is generated from the CLI help (npm run cli-doc) and must not drift from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cliHelp, cliCommands, cliDoc } from '../scripts/gen-cli-doc.mjs';

const help = cliHelp();

test('cliCommands lê os comandos do texto de ajuda', () => {
  const cmds = cliCommands(help);
  for (const c of ['plan', 'apply', 'query', 'serve', 'store', 'merge', 'build', 'init']) assert.ok(cmds.includes(c), c);
  for (const c of ['Uso', 'archlens', 'uso']) assert.ok(!cmds.includes(c), c);
  assert.equal(new Set(cmds).size, cmds.length, 'sem repetição');
});

test('cliDoc traz o texto de ajuda inteiro e o aviso de arquivo gerado', () => {
  const doc = cliDoc(help);
  assert.ok(doc.includes(help.trimEnd()));
  assert.match(doc, /npm run cli-doc/);
});

test('docs/cli.md está em dia com a ajuda da CLI', () => {
  assert.equal(readFileSync(new URL('../docs/cli.md', import.meta.url), 'utf8'), cliDoc(help));
});
