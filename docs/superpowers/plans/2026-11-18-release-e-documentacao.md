# Release automatizado e documentação por público (P14) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** preparar uma versão sem editar arquivo à mão, criar tag e release do GitHub na promoção para a `main`, e organizar a documentação por público com links e comandos conferidos no CI.

**Architecture:** um script testável (`scripts/release.mjs`) faz todo o trabalho de preparação; dois workflows finos o chamam (preparar no `workflow_dispatch`, tag no push para a `main`). Dois scripts de derivados no padrão do `check-ask` (`gen-cli-doc.mjs`, `check-docs.mjs`) entram no `npm run ci` e no job "Lint e derivados". A reorganização da documentação vem por último, já vigiada pelo check.

**Tech Stack:** Node (ESM, `node:test`, `node:child_process`), GitHub Actions, `gh` (no runner), YAML vendorizado (`scripts/lib/scan/yaml.mjs`, `readYaml`) para testar os workflows.

**Spec:** `docs/superpowers/specs/2026-11-18-release-e-documentacao-design.md` (ler antes; decisões citadas por número).

## Global Constraints

- Linha v0, branch `chore/p14-release-e-docs`, PR para `develop-v2`. Sem npm (`"private": true` fica). Promoção para a `main` manual.
- Changelog escrito à mão; o script só fecha a seção: `## [Não lançado]` → `## [<versão>] — <AAAA-MM-DD>`, nova `## [Não lançado]` vazia acima, links de comparação atualizados.
- Tipos de versão: `patch`, `minor`, `major`, `premajor`, `preminor`, `prerelease`; `--preid` padrão `alpha`.
- Recusas do `release.mjs`: árvore suja; `[Não lançado]` vazia; tag da nova versão já existe; versão atual sem tag ("promova a <atual> para a `main` antes de preparar outra").
- Workflow de preparar: recusa pré-versão quando `branch` é `develop-v2`; recusa se `chore/release-<versão>` existe no remoto; dispara `ci.yml` na branch do release.
- Workflow de tag: só push para a `main`; tag anotada `v<versão>` com mensagem `archlens <versão>`; versão com `-` vira pré-lançamento.
- `README.md` com no máximo 8192 bytes; nenhuma seção do README antigo sem destino (mapa da decisão 10).
- Tudo em pt-BR. Mensagens de commit com as linhas de atribuição da sessão; todo commit diz "archlens-ask: sem impacto".
- Lint como catraca: `npm run lint` não passa de 114 avisos.

## Review Focus

1. **`[Não lançado]` só com subtítulos vazios** (`### Adicionado` sem itens): conta como vazia e o release é recusado. Teste na Tarefa 2.
2. **Notas de uma versão que é prefixo de outra** (`0.6.0` contra `0.6.0-alpha.1`, pontos no número): extrai só a seção exata. Teste na Tarefa 2.
3. **Changelog sem a linha de link `[Não lançado]:`** no fim: o fechamento acrescenta as duas linhas em vez de falhar ou duplicar. Teste na Tarefa 2.
4. **Âncora para título com acento, crase ou pontuação, e links dentro de bloco de código**: a âncora é achada pela regra do GitHub, e o que está em código não é conferido. Teste na Tarefa 4.
5. **Link para pasta (`docs/plans/`) ou com `%20`**: pasta existente vale, e o caminho é decodificado antes de conferir. Teste na Tarefa 4.

---

### Task 1: `package.json` no formato do npm

**Files:**
- Modify: `package.json` (só formatação)
- Test: `tests/skills.test.mjs` (onde já moram os testes de manifesto)

- [ ] **Step 1: teste que falha**

```js
test('package.json está no formato que o npm grava (npm version só muda a versão)', () => {
  const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
});
```

- [ ] **Step 2:** `node --test tests/skills.test.mjs` → falha neste teste.
- [ ] **Step 3:** regravar `package.json` com `JSON.stringify(pkg, null, 2) + '\n'`, sem mudar conteúdo.
- [ ] **Step 4:** `node --test tests/skills.test.mjs` → passa. Conferir o critério de aceite: `npm version patch --no-git-tag-version && git diff --stat -- package.json` mostra 1 linha mudada; depois `git checkout -- package.json package-lock.json .claude-plugin`.
- [ ] **Step 5: Commit** `chore: package.json no formato do npm (P14)`.

### Task 2: `scripts/release.mjs`

**Files:**
- Create: `scripts/release.mjs`
- Modify: `package.json` (script `"release": "node scripts/release.mjs"`)
- Test: `tests/release.test.mjs`

**Interfaces:**
- Produces (exportados):
  - `closeChangelog(text: string, { version: string, previous: string, date: string }): string` — lança `Object.assign(new Error(...), { code: 'E_RELEASE_EMPTY' })` se `[Não lançado]` não tiver nenhuma linha de conteúdo além de subtítulos.
  - `releaseNotes(text: string, version: string): string | null` — corpo da seção `## [<versão>] — …` (sem o título, sem espaços nas pontas), `null` se não existir.
  - `prepareRelease({ root: string, type: string, preid?: string, date: string, exec: (cmd: string, args: string[]) => string }): { version: string, previous: string, notes: string }` — erros com `code` `E_RELEASE_DIRTY`, `E_RELEASE_EMPTY`, `E_RELEASE_TAG_EXISTS`, `E_RELEASE_UNTAGGED`, `E_RELEASE_TYPE`.
- CLI:
  - `node scripts/release.mjs <tipo> [--preid <id>] [--date <AAAA-MM-DD>] [--notes <arquivo>]` → imprime a versão nova; data padrão = hoje (UTC).
  - `node scripts/release.mjs notes <versão> [--out <arquivo>]` → imprime ou grava as notas; sai com 1 se a seção não existe (usado pelo `tag.yml`).
- Ordem de `prepareRelease`: `git status --porcelain` (vazio, senão `E_RELEASE_DIRTY`); `git tag -l v*` (a atual precisa ter tag, senão `E_RELEASE_UNTAGGED`); confere `[Não lançado]` não vazia **antes** de mexer em arquivo; `npm version <tipo> --no-git-tag-version [--preid <id>]`; lê a versão nova (`E_RELEASE_TAG_EXISTS` se a tag existe); `npm run ask`; grava o changelog fechado.

- [ ] **Step 1: testes que falham** em `tests/release.test.mjs`:

```js
const LOG = `# Changelog\n\nTexto.\n\n## [Não lançado]\n\n### Adicionado\n\n- Coisa nova.\n\n## [0.6.0] — 2026-11-03\n\n- Antiga.\n\n[Não lançado]: https://github.com/expersoft/archlens/compare/v0.6.0...HEAD\n[0.6.0]: https://github.com/expersoft/archlens/compare/v0.5.0...v0.6.0\n`;

test('closeChangelog fecha a seção, abre outra vazia e atualiza os links', () => {
  const out = closeChangelog(LOG, { version: '0.7.0', previous: '0.6.0', date: '2026-11-18' });
  assert.match(out, /## \[Não lançado\]\n\n## \[0\.7\.0\] — 2026-11-18\n\n### Adicionado\n\n- Coisa nova\./);
  assert.match(out, /\[Não lançado\]: https:\/\/github\.com\/expersoft\/archlens\/compare\/v0\.7\.0\.\.\.HEAD\n\[0\.7\.0\]: https:\/\/github\.com\/expersoft\/archlens\/compare\/v0\.6\.0\.\.\.v0\.7\.0\n\[0\.6\.0\]:/);
});
test('closeChangelog recusa [Não lançado] vazio, mesmo só com subtítulos', () => {
  const vazio = LOG.replace('- Coisa nova.\n', '');
  assert.throws(() => closeChangelog(vazio, { version: '0.7.0', previous: '0.6.0', date: '2026-11-18' }), { code: 'E_RELEASE_EMPTY' });
});
test('closeChangelog acrescenta os links quando o arquivo não tem a linha [Não lançado]:', () => {
  const semLinks = LOG.replace(/\n\[Não lançado\]:.*\n/, '\n');
  const out = closeChangelog(semLinks, { version: '0.7.0', previous: '0.6.0', date: '2026-11-18' });
  assert.equal(out.match(/^\[Não lançado\]:/gm).length, 1);
  assert.equal(out.match(/^\[0\.7\.0\]:/gm).length, 1);
});
test('releaseNotes pega só a seção exata da versão', () => {
  const log = `## [Não lançado]\n\n## [0.6.0-alpha.1] — 2026-11-01\n\n- Alfa.\n\n## [0.6.0] — 2026-11-03\n\n- Estável.\n`;
  assert.equal(releaseNotes(log, '0.6.0'), '- Estável.');
  assert.equal(releaseNotes(log, '0.6.0-alpha.1'), '- Alfa.');
  assert.equal(releaseNotes(log, '0.6'), null);
});
```

  e `prepareRelease` com um `exec` falso sobre uma pasta temporária com `package.json` (`"version": "0.6.0"`) e `CHANGELOG.md` (= `LOG`): o falso de `npm version` grava a versão nova no `package.json`; afirmar a lista de comandos chamados em ordem, o changelog gravado e o retorno `{ version: '0.7.0', previous: '0.6.0', notes: '### Adicionado\n\n- Coisa nova.' }`. Um teste por recusa: `git status` com saída → `E_RELEASE_DIRTY`; tags sem `v0.6.0` → `E_RELEASE_UNTAGGED` sem ter chamado `npm version`; tags com `v0.7.0` → `E_RELEASE_TAG_EXISTS`; tipo `qualquer` → `E_RELEASE_TYPE`; `premajor` com `preid` `alpha` passa `--preid alpha` ao `npm version`.

- [ ] **Step 2:** `node --test tests/release.test.mjs` → falha (módulo ausente).
- [ ] **Step 3:** implementar. A CLI só roda quando o arquivo é o executado (molde de `scripts/sync-plugin.mjs`); `exec` real é `execFileSync(cmd, args, { cwd: root, encoding: 'utf8' })`.
- [ ] **Step 4:** `node --test tests/release.test.mjs` → passa.
- [ ] **Step 5: ensaio real, sem commit.** `node scripts/release.mjs minor --date 2026-11-18 --notes /tmp/notas.md` (num checkout limpo) → imprime `0.7.0`; `git diff --stat` mostra só `package.json` (1 linha), `package-lock.json`, `.claude-plugin/*.json`, `portable/archlens-ask/REFERENCE.md` e `CHANGELOG.md`; `npm run check-plugin && npm run check-ask` passam. Depois `git checkout -- .`.
- [ ] **Step 6: Commit** `feat: scripts/release.mjs prepara uma versão sem edição à mão (P14)`.

### Task 3: Workflows de preparar e de tag

**Files:**
- Create: `.github/workflows/release.yml`, `.github/workflows/tag.yml`
- Test: `tests/workflows.test.mjs`

**Interfaces:**
- Consumes: CLI do `release.mjs` (Tarefa 2): `<tipo> --preid --notes` e `notes <versão> --out`.

- [ ] **Step 1: testes que falham** em `tests/workflows.test.mjs`, lendo com `readYaml(texto)[0].data`:
  - `release.yml`: `on.workflow_dispatch.inputs` tem `tipo` (`type: choice`, opções exatamente os seis tipos), `branch` (padrão `develop-v2`) e `preid` (padrão `alpha`); `permissions` é `{ contents: 'write', 'pull-requests': 'write', actions: 'write' }`; o checkout busca as tags (`fetch-depth: 0`); algum passo roda `node scripts/release.mjs`, algum roda `npm run ci`, algum contém `gh pr create` e algum contém `gh workflow run ci.yml`; existe um passo que falha quando o tipo começa por `pre` e a branch é `develop-v2` (o texto do passo contém `develop-v2` e `exit 1`), e ele vem antes do passo do `release.mjs`; existe um passo que confere a branch `chore/release-` no remoto (`git ls-remote --heads`) e falha se ela existir.
  - `tag.yml`: dispara só em `push` para `branches: [main]`; `permissions` é `{ contents: 'write' }`; algum passo contém `release.mjs notes`, algum contém `git tag -a`, algum contém `gh release create` e `--prerelease`.
  - Os dois arquivos passam pelo `readYaml` sem erro.
- [ ] **Step 2:** `node --test tests/workflows.test.mjs` → falha.
- [ ] **Step 3:** escrever os dois workflows (Node 22 e cache como em `ci.yml`). `release.yml`: commit com `github-actions[bot]`, mensagem `chore(release): versão <versão>`; corpo do PR = notas + lista do que conferir (changelog, `REFERENCE.md`, manifestos, e "depois do merge, promover para a `main` por PR"). `tag.yml`: só age se `git tag -l v<versão>` vier vazio e `release.mjs notes` achar a seção; senão termina sem erro, dizendo por quê.
- [ ] **Step 4:** `node --test tests/workflows.test.mjs` → passa.
- [ ] **Step 5: Commit** `ci: workflows de preparar versão e de tag na main (P14)`.

### Task 4: Referência da CLI gerada e check de documentação

**Files:**
- Create: `scripts/gen-cli-doc.mjs`, `scripts/check-docs.mjs`, `docs/cli.md` (gerado)
- Modify: `package.json` (scripts `cli-doc`, `check-cli-doc`, `check-docs`; `ci` passa a ser `npm run lint && npm run check-plugin && npm run check-ask && npm run check-schemas && npm run check-cli-doc && npm run check-docs && npm test`), `.github/workflows/ci.yml` (dois passos no job "Lint e derivados": "Referência da CLI em dia" e "Links e comandos da documentação"), arquivos `.md` com links quebrados que o check achar
- Test: `tests/cli-doc.test.mjs`, `tests/check-docs.test.mjs`

**Interfaces:**
- Produces:
  - `gen-cli-doc.mjs`: `cliHelp(): string` (stdout de `node scripts/archlens.mjs --help`; o módulo da CLI roda ao ser importado, por isso não se importa `HELP`); `cliCommands(help: string): string[]` (primeira palavra das linhas que começam com dois espaços e uma palavra minúscula, sem repetir; inclui `store`); `cliDoc(help: string): string` (título, aviso "gerado por `npm run cli-doc`, não edite", e o texto num bloco ```` ```text ````). CLI com `--check` (sai com 1 e diz o que rodar).
  - `check-docs.mjs`: `slugify(heading: string): string`; `anchorsOf(markdown: string): Set<string>`; `linksOf(markdown: string): { target: string, line: number }[]` (ignora blocos e trechos de código); `commandsOf(markdown: string): { command: string, line: number }[]` (linhas de blocos `bash`/`sh` com `archlens `, `bin/archlens ` ou `node scripts/archlens.mjs `); `checkDocs({ root: string, files: string[], commands: string[] }): string[]` (problemas como `arquivo:linha: …`). A CLI usa `git ls-files '*.md'`, exclui só pastas de dado de teste (cada uma com comentário) e sai com 1 se houver problema.

- [ ] **Step 1: testes que falham.**
  - `tests/cli-doc.test.mjs`: `cliCommands(cliHelp())` contém `plan`, `apply`, `query`, `serve`, `store`, `merge` e não contém `Uso` nem `archlens`; `cliDoc(h)` contém `h` inteiro; `readFileSync('docs/cli.md')` é igual a `cliDoc(cliHelp())`.
  - `tests/check-docs.test.mjs`:

```js
test('slugify segue a regra do GitHub', () => {
  assert.equal(slugify('Publicar uma versão'), 'publicar-uma-versão');
  assert.equal(slugify('Comando `archlens`'), 'comando-archlens');
  assert.equal(slugify('E.4.1 — Base compartilhada!'), 'e41--base-compartilhada');
});
test('anchorsOf numera títulos repetidos', () => {
  assert.deepEqual([...anchorsOf('# A\n## A\n### A\n')], ['a', 'a-1', 'a-2']);
});
test('linksOf ignora código, decodifica %20 e guarda a linha', () => {
  const md = 'ver [x](a%20b.md#t)\n\n```\n[y](nao.md)\n```\ne `[z](nem.md)`\n';
  assert.deepEqual(linksOf(md), [{ target: 'a b.md#t', line: 1 }]);
});
```

  e `checkDocs` numa pasta temporária: link para arquivo inexistente → problema com `arquivo:linha`; link para pasta existente → nada; `outro.md#titulo-com-acentuação` com o título lá → nada; âncora inexistente → problema; `https://…` e `mailto:` → nada; bloco `bash` com `archlens fazer-tudo` → problema; com `bin/archlens build x` → nada.
- [ ] **Step 2:** `node --test tests/cli-doc.test.mjs tests/check-docs.test.mjs` → falham.
- [ ] **Step 3:** implementar os dois scripts e gerar `docs/cli.md` com `npm run cli-doc`.
- [ ] **Step 4:** os testes passam. Rodar `npm run check-docs` no repositório e corrigir cada link ou comando quebrado que aparecer (correção do link, nunca exclusão do arquivo do check). Listar no corpo do commit o que foi corrigido.
- [ ] **Step 5:** `npm run ci` → passa; `npm run lint` com 114 avisos.
- [ ] **Step 6: Commit** `feat: referência da CLI gerada e check de links e comandos na documentação (P14)`.

### Task 5: Documentação por público

**Files:**
- Create: `docs/GUI.md`, `CONTRIBUTING.md`
- Modify: `README.md`, `docs/GUIA.md`, `AGENTS.md` (lista do que o CI confere ganha `check-cli-doc` e `check-docs`), `CHANGELOG.md` (entrada do P14 em `[Não lançado]`), `docs/superpowers/roadmap.md` (P14 → feito, com spec, plano e o PR), `docs/superpowers/roadmap-produto/README.md` (linha de andamento)
- Test: `tests/check-docs.test.mjs`

- [ ] **Step 1: teste que falha** em `tests/check-docs.test.mjs`:

```js
test('README.md cabe em 8 KB', () => {
  assert.ok(statSync(new URL('../README.md', import.meta.url)).size <= 8192);
});
```

- [ ] **Step 2:** `node --test tests/check-docs.test.mjs` → falha (29 KB).
- [ ] **Step 3: mover, sem reescrever**, pelo mapa da decisão 10 do spec: seção "GUI" inteira → `docs/GUI.md`; "Documentação do nó", "Manter o ARCHITECTURE.md em dia" e a lista completa de recursos (nova seção "O que o archlens faz") → `docs/GUIA.md`; "Verificação automática (CI)" e "Publicar uma versão" (reescrita para o fluxo novo: workflow, plano B com `npm run release`, promoção manual por PR para a `main`) → `CONTRIBUTING.md`. `CONTRIBUTING.md` também traz o fluxo de SDD, branch e PR por plano, as obrigações do `AGENTS.md` com os comandos e a regra de atualizar o `roadmap.md` no PR que entrega um plano. README fica com: o que é (lista condensada), instalar (plugin, CLI, atualização), primeiro uso, tabela de links (incluindo `docs/cli.md`, `docs/GUI.md`, `CONTRIBUTING.md`, `SECURITY.md`; "Plano de implementação" → `docs/superpowers/`, com `docs/plans/` citado como histórico).
- [ ] **Step 4: nada sem destino.** Script avulso (não versionado): para cada título `##`/`###` de `git show origin/develop-v2:README.md`, conferir que ele existe em `README.md`, `docs/GUIA.md`, `docs/GUI.md` ou `CONTRIBUTING.md`. Saída esperada: nenhum título órfão. O mapa vai para a descrição do PR.
- [ ] **Step 5:** `node --test tests/check-docs.test.mjs` passa; `npm run check-docs` passa (links que apontavam para seções do README agora apontam para o novo lugar).
- [ ] **Step 6:** `npm run ci && npm run gui:test` → passa.
- [ ] **Step 7: Commit** `docs: README curto, GUI.md, CONTRIBUTING.md e documentação por público (P14)`.

### Fechamento

- [ ] Revisão do diff inteiro (`superpowers:requesting-code-review`), com foco nos workflows, que só rodam de verdade depois do merge.
- [ ] Abrir o PR `chore/p14-release-e-docs` → `develop-v2` seguindo o template do repositório, com: o mapa do README, "archlens-ask: sem impacto", e o que fica para o dono (permissão do Actions para abrir PR; conferir o CI no primeiro PR de release; preparar a 0.7.0 com `npm run release -- minor` num PR próprio depois deste merge).
