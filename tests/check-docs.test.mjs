// scripts/check-docs.mjs: internal links, anchors and archlens commands cited in the documentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slugify, anchorsOf, linksOf, commandsOf, checkDocs } from '../scripts/check-docs.mjs';

test('slugify segue a regra do GitHub', () => {
  assert.equal(slugify('Publicar uma versão'), 'publicar-uma-versão');
  assert.equal(slugify('Comando `archlens`'), 'comando-archlens');
  assert.equal(slugify('E.4.1 — Base compartilhada!'), 'e41--base-compartilhada');
});

test('anchorsOf numera títulos repetidos e ignora # dentro de bloco de código', () => {
  assert.deepEqual([...anchorsOf('# A\n## A\n```\n# não\n```\n### A\n')], ['a', 'a-1', 'a-2']);
});

test('linksOf ignora código, decodifica %20 e guarda a linha', () => {
  const md = 'ver [x](a%20b.md#t)\n\n```\n[y](nao.md)\n```\ne `[z](nem.md)`\n';
  assert.deepEqual(linksOf(md), [{ target: 'a b.md#t', line: 1 }]);
});

test('commandsOf acha os comandos do archlens em blocos bash', () => {
  const md = 'archlens fora-de-bloco\n```bash\narchlens build x\nbin/archlens plan b d.json --out p.json\nnode scripts/archlens.mjs query b --view k\nnpm test\n```\n```json\n{"archlens": "2.0"}\n```\n';
  assert.deepEqual(commandsOf(md), [{ command: 'build', line: 3 }, { command: 'plan', line: 4 }, { command: 'query', line: 5 }]);
});

test('checkDocs aponta link, âncora e comando quebrados, e aceita o resto', () => {
  const root = mkdtempSync(join(tmpdir(), 'archlens-docs-'));
  mkdirSync(join(root, 'docs', 'plans'), { recursive: true });
  writeFileSync(join(root, 'outro.md'), '# Título com acentuação\n');
  writeFileSync(join(root, 'ok.md'), [
    '[pasta](docs/plans/) [arquivo](outro.md) [âncora](outro.md#título-com-acentuação) [aqui](#ok)',
    '[web](https://example.com/x) [mail](mailto:a@b.c)',
    '```bash', 'bin/archlens build x', '```', '', '# OK',
  ].join('\n'));
  writeFileSync(join(root, 'ruim.md'), '[sumiu](nao-existe.md)\n[âncora](outro.md#nao-tem)\n```bash\narchlens fazer-tudo\n```\n');
  const problems = checkDocs({ root, files: ['ok.md', 'outro.md', 'ruim.md'], commands: ['build', 'plan'] });
  assert.deepEqual(problems, [
    'ruim.md:1: link para nao-existe.md, que não existe',
    'ruim.md:2: âncora #nao-tem não existe em outro.md',
    'ruim.md:4: comando "archlens fazer-tudo" não existe na CLI',
  ]);
});
