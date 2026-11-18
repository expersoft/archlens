# Contribuindo com o archlens

Este arquivo é para quem muda o archlens: o fluxo de trabalho, as obrigações de cada PR, o CI e como sair uma versão.
Para usar o archlens, veja o [guia](docs/GUIA.md); para operar a GUI, [docs/GUI.md](docs/GUI.md).

## Fluxo de trabalho

Toda mudança que não é trivial passa por um ciclo de SDD (desenvolvimento guiado por especificação), registrado no
repositório:

1. **Brief**: o problema e o que se quer. Os planos do roadmap de produto já têm o seu em
   [`docs/superpowers/roadmap-produto/`](docs/superpowers/roadmap-produto/README.md).
2. **Spec**: as decisões, as abordagens consideradas e os critérios de aceite, em
   `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`, aprovado antes de construir.
3. **Plano**: as tarefas, cada uma com o teste que a prova, em `docs/superpowers/plans/AAAA-MM-DD-<tema>.md`.
4. **Execução**: teste que falha primeiro, depois o código; um commit por passo que se sustenta sozinho.
5. **Revisão**: uma revisão do diff inteiro antes do PR.

Com o plugin [superpowers](https://github.com/obra/superpowers), as skills `brainstorming`, `writing-plans`,
`executing-plans` (ou `subagent-driven-development`) e `requesting-code-review` conduzem esse ciclo. Sem ele, o brief
serve de entrada do mesmo jeito.

**Branch e PR por plano.** Cada plano (ou correção) tem a sua branch, criada a partir da linha certa (`develop-v2` para a
0.x), e entra por PR. O PR que entrega um plano atualiza o andamento em
[`docs/superpowers/roadmap.md`](docs/superpowers/roadmap.md).

## Obrigações de cada PR

As regras completas estão no [`AGENTS.md`](AGENTS.md). Em resumo:

- **archlens-ask:** avaliar se a mudança toca o que ele copia. Se tocar, `npm run ask` e atualizar à mão
  `INSTRUCTIONS.md`, `RULES.md`, `EXAMPLES.md` e, se for o caso, `eval/perguntas.json`. Se não tocar, escrever
  "archlens-ask: sem impacto" na descrição do PR.
- **GUI:** em mudanças de `render.mjs`, `query*.mjs`, `view-build.mjs` ou `store/`, avaliar o impacto e rodar
  `npm run gui:test`; mudou o cliente do diagrama ou o servidor, rodar também `npm --prefix apps/gui run test:e2e`.
  Prompts da GUI desatualizados: `npm --prefix apps/gui run prompt`.
- **Exemplos são documentação viva:** testes de snapshot leem `tests/fixtures/`, nunca `examples/`. Quem edita um
  exemplo roda `npm run ask`.
- **Referência da CLI:** mudou o texto de ajuda em `scripts/archlens.mjs`? `npm run cli-doc` regenera `docs/cli.md`.
- **Lint como catraca:** não rebaixe regra nova a aviso para um PR passar.
- **Changelog:** o que muda para quem usa entra em `## [Não lançado]` no [`CHANGELOG.md`](CHANGELOG.md), escrito à mão.

Antes de abrir o PR: `npm run ci` (lint, derivados, links e comandos da documentação e a suíte da raiz) e, se a mudança
toca a GUI, `npm run gui:test`.

## Verificação automática (CI)

Todo PR roda `.github/workflows/ci.yml`: lint (Biome), derivados em dia (`check-plugin`, `check-ask`, `check-schemas`,
`check-cli-doc`, `prompt:check`), links e comandos da documentação (`check-docs`), `npm audit`, a suíte da raiz e a
suíte e o build da GUI em Node 20, 22 e 24, os testes com Chromium (e2e da GUI e checagem visual, com relatório de
cobertura no resumo do job) e os lançadores no Windows.

A integração com um gbrain real (`.github/workflows/gbrain.yml`) roda à mão e uma vez por semana; não bloqueia PR.

**Proteção de branch (configurar no GitHub, em `develop-v2` e `main`):** exigir PR, exigir os checks `Lint e derivados`,
`Núcleo e CLI (Node 20)`, `(Node 22)`, `(Node 24)`, `GUI (Node 20)`, `(Node 22)`, `(Node 24)`,
`Testes com Chromium (e2e e checagem visual)` e `Lançadores no Windows`, e exigir a branch em dia com o destino.

## Publicar uma versão

A versão do plugin vem do `package.json`; nunca edite `.claude-plugin/*.json` à mão (o `npm version` regrava os dois
manifestos, e um teste recusa manifestos fora de sincronia). O Claude Code guarda o plugin instalado por versão: só chega
a quem usa o que sai numa versão nova.

1. **Escreva o changelog.** A seção `## [Não lançado]` do `CHANGELOG.md` precisa dizer o que muda; vazia, o release é
   recusado.
2. **Prepare a versão.** No GitHub, Actions → **Preparar versão** → *Run workflow*: escolha o tipo (`patch`, `minor`,
   `major`) e a branch (`develop-v2`). O workflow sobe a versão, regrava os manifestos do plugin, regenera o
   archlens-ask, fecha a seção do changelog com a data, roda `npm run ci` e abre o PR `chore/release-<versão>`, disparando
   o CI nele.
3. **Revise e faça o merge** do PR de release em `develop-v2`.
4. **Promova para a `main`** com um PR `develop-v2` → `main`. É esse passo que entrega a versão a quem instala pelo
   marketplace. No merge, o workflow **Tag e release** cria a tag `v<versão>` e o release do GitHub com as notas do
   changelog.

Recusas, todas antes de mexer em qualquer arquivo: árvore suja, versão atual ainda sem tag (promova-a antes de preparar
outra), tag da nova versão já existente e changelog vazio. Pré-versões (`premajor`, `preminor`, `prerelease`, com
`--preid alpha`) saem só da linha v1, nunca de `develop-v2`.

**Sem o Actions (plano B).** O mesmo trabalho roda na sua máquina, a partir de um checkout limpo:

```bash
git switch -c chore/release-<versão>
npm run release -- minor          # ou patch / major; imprime a versão nova
npm run ci
git add -A && git commit -m "chore(release): versão <versão>"
```

Depois, PR para `develop-v2` e os passos 3 e 4 acima. `npm run test:gbrain` (integração com um gbrain real; precisa do
bun e de rede) é opcional.

**Configuração do repositório que o fluxo precisa.** "Allow GitHub Actions to create and approve pull requests" ligado em
Settings → Actions → General. Se as checagens do CI não aparecerem no PR aberto pelo workflow, crie um token próprio
(segredo `RELEASE_TOKEN`) e use-o no push e no `gh pr create` do `release.yml`.
