# Release automatizado e documentação por público (P14)

Brief: [`roadmap-produto/P14-distribuicao-release-e-docs.md`](../roadmap-produto/P14-distribuicao-release-e-docs.md).
Linha **v0** (`develop-v2`), por PR a partir de `chore/p14-release-e-docs`.

## Intenção

Publicar uma versão do archlens deixa de ser uma lista de oito passos à mão, um deles desfazendo a reformatação do
`package.json`. Passa a ser: uma ação para preparar, a aprovação do PR, e a promoção para a `main`, que continua
manual por decisão do dono. A documentação passa a ter um lugar por público (quem usa, quem opera a GUI, quem
contribui) e o CI confere que os links e os comandos citados nela existem.

**Objetivos.** Preparar uma versão sem editar arquivo à mão. Tag e release do GitHub criados sozinhos quando a versão
chega à `main`. README curto. Referência da CLI que não envelhece. `CONTRIBUTING.md`. Nenhum link interno quebrado.

**Não objetivos.** Publicar no npm. Promover para a `main` automaticamente. Traduzir o produto. Guia do administrador
(fica com o P08). Site de documentação. Checar links externos.

**O que seria fracasso mesmo funcionando.** Um release que perde o texto do changelog escrito à mão. Um PR de release
sem CI. Uma tag criada numa versão que os usuários ainda não receberam. Documentação reorganizada com conteúdo
perdido no caminho.

## Ponto de partida

- `README.md` (29 KB), seção "Publicar uma versão": branch, `npm version`, desfazer a reformatação, `npm run ask`,
  editar o `CHANGELOG.md`, validar o plugin, testar, PR, tag à mão, PR para a `main`.
- **Causa da reformatação:** o `package.json` guarda objetos numa linha só (`"bin": { … }`); o `npm version` regrava o
  arquivo com `JSON.stringify(…, null, 2)`. Reproduzido nesta sessão: um `npm version patch` muda 19 linhas.
- `scripts/sync-plugin.mjs` já roda no script `version` do npm e regrava `.claude-plugin/*.json`.
- **Prática real do último release:** PR `chore/release-0.6.0` → `develop-v2` (#31), depois PR `develop-v2` → `main`
  (#32). A tag `v0.6.0` está no **commit de merge da `main`** (`3aad1f3`), não no de `develop-v2` como o README diz.
- `CHANGELOG.md` em Keep a Changelog, pt-BR: seção `## [Não lançado]`, versões como `## [0.6.0] — 2026-11-03`, links de
  comparação no fim do arquivo.
- `ci.yml` dispara em `pull_request`, em push para `main` e `develop-v2`, e em `workflow_dispatch`; permissão
  `contents: read`.
- `docs/superpowers/roadmap.md` já foi posto em dia neste ciclo (commit `47b9713` na branch do P14).

## Abordagens

| Abordagem | Troca |
|---|---|
| **Workflow no GitHub sobre um script do repositório** — **escolhida** | Uma ação no Actions prepara tudo e abre o PR; o mesmo script roda na máquina de quem quiser. Exige liberar o Actions a abrir PR e disparar o CI explicitamente |
| Só o script, rodado à mão | Sem limitações do GitHub, mas depende de quem roda ter o `gh` autenticado e repete passos locais |
| Ferramenta pronta (release-please) | Gera o changelog dos commits, o que contradiz manter o texto escrito à mão |

Escolha do dono (2026-11-18): a primeira.

## Decisões

1. **Promoção para a `main` manual** (decisão do dono). O fluxo para no PR de release mergeado em `develop-v2`.
   Promover continua sendo um PR `develop-v2` → `main` aberto e mergeado por uma pessoa, como o #32.
2. **Sem npm** (decisão do dono). `"private": true` fica.
3. **Changelog escrito à mão** *(proposta aceita pelo dono)*. O script só fecha a seção: `## [Não lançado]` vira
   `## [<versão>] — <AAAA-MM-DD>`, nasce uma seção `## [Não lançado]` vazia acima, e os links de comparação do fim são
   atualizados (`[Não lançado]` passa a comparar a partir da nova tag; entra `[<versão>]` comparando com a anterior).
   Seção `[Não lançado]` vazia recusa o release.
4. **Idioma:** tudo segue em pt-BR; internacionalização não entra no roadmap agora *(proposta aceita)*.
5. **`package.json` reformatado uma vez** no formato do npm (`JSON.stringify(pkg, null, 2) + '\n'`). Um teste falha se
   o arquivo sair desse formato, para a causa não voltar.
6. **`scripts/release.mjs`**, o núcleo testável:
   - `node scripts/release.mjs <patch|minor|major|prerelease> [--preid <id>] [--date <AAAA-MM-DD>] [--notes <arquivo>]`;
   - tipos aceitos: `patch`, `minor`, `major`, `premajor`, `preminor`, `prerelease` (os do `npm version`; `premajor`
     com `--preid alpha` leva 0.x a `1.0.0-alpha.0`, o que o P00 vai usar);
   - recusa com mensagem clara: árvore suja, seção `[Não lançado]` vazia, tag da nova versão já existente, e **versão
     atual ainda sem tag** ("promova a <atual> para a `main` antes de preparar outra"): assim não se acumulam duas
     versões entre promoções, e o link de comparação do changelog nunca aponta para uma tag que não existe *(decisão
     minha)*;
   - a data é a da preparação (como sempre foi), não a da promoção *(decisão minha)*;
   - roda `npm version <tipo> --no-git-tag-version` (que já chama o `sync-plugin`), `npm run ask` e fecha o changelog;
   - imprime a versão nova; com `--notes`, grava o texto da seção da versão (as notas do release);
   - não faz commit, não cria branch, não fala com o GitHub. Funções puras exportadas para teste: fechar o changelog e
     extrair as notas de uma versão.
7. **`.github/workflows/release.yml` — "Preparar versão"** (`workflow_dispatch`):
   - entradas: `tipo` (os mesmos do script), `branch` (padrão `develop-v2`), `preid` (padrão `alpha`, só para os tipos
     de pré-versão);
   - **recusa pré-versão em `develop-v2`**: uma pré-versão promovida para a `main` chegaria a quem instala pelo
     marketplace *(decisão minha)*;
   - permissões: `contents: write`, `pull-requests: write`, `actions: write`;
   - passos: checkout da `branch`, `npm ci` (raiz e GUI), `release.mjs`, `npm run ci`, branch
     `chore/release-<versão>`, commit `chore(release): versão <versão>`, push, PR para a `branch` com as notas no corpo
     e a lista do que conferir, e por fim `gh workflow run ci.yml --ref chore/release-<versão>`;
   - recusa se a branch `chore/release-<versão>` já existir no remoto.
   - **Por que disparar o CI:** um PR aberto pelo `GITHUB_TOKEN` não dispara workflows (regra do GitHub contra laços);
     `workflow_dispatch` é a exceção documentada. As checagens rodam no commit do PR e devem aparecer nele. **Isso só se
     confirma na primeira execução real**; se não aparecerem, o plano B é um token próprio (`RELEASE_TOKEN`) criado pelo
     dono e usado no push e no PR.
8. **`.github/workflows/tag.yml` — tag e release no GitHub:**
   - dispara em push para a `main`;
   - lê a versão do `package.json`; se a tag `v<versão>` não existe e o `CHANGELOG.md` tem a seção da versão, cria a
     tag anotada (`archlens <versão>`) no commit do push e o release do GitHub com as notas extraídas pelo
     `release.mjs`; versão com `-` sai como pré-lançamento;
   - permissão `contents: write`.
   - **Por que na `main`** *(decisão minha)*: é onde a tag `v0.6.0` está e é o momento em que a versão chega a quem
     instala pelo marketplace. Assim o release do GitHub nunca anuncia uma versão que os usuários ainda não têm. Custo:
     a tag depende da promoção manual acontecer.
9. **Linha v1 (preparação para o P00).** `release.mjs` aceita `prerelease --preid alpha` e o workflow aceita a branch
   como entrada. O `tag.yml` só olha a `main`; o P00 acrescenta a branch da v1 para os pré-lançamentos. Nada mais da v1
   entra aqui.
10. **Documentação por público:**
    - **`README.md` curto** (meta: até 8 KB): o que é, instalar (plugin, CLI, atualização), primeiro uso, tabela de
      links. Nenhum conteúdo some: cada trecho que sai vai para um dos arquivos abaixo, e o PR lista para onde foi cada
      seção.
    - **`docs/cli.md`, gerado** do texto de ajuda da CLI (`HELP` em `scripts/archlens.mjs`) por
      `scripts/gen-cli-doc.mjs`; `npm run cli-doc` regenera, `--check` falha se estiver defasado (mesmo padrão do
      `check-ask`). Entra no `npm run ci` e no job "Lint e derivados".
    - **`docs/GUI.md`**: a seção "GUI" do README (configuração do `archlens serve`, LLM, Planejar, edição pela tela),
      movida sem reescrever. É a semente do guia do administrador que o P08 completa. O `GUIA.md` continua sendo o
      guia de uso e passa a apontar para ela.
    - **Mapa do resto do README** *(decisão minha)*: "Documentação do nó" e "Manter o ARCHITECTURE.md em dia" vão para o
      `GUIA.md`; "Verificação automática (CI)" e "Publicar uma versão" vão para o `CONTRIBUTING.md`; a lista de
      recursos do topo vai inteira para o `GUIA.md` (seção "O que o archlens faz") e o README fica com uma versão
      condensada dela. Nada é reescrito além dos links que mudam de lugar.
    - **`CONTRIBUTING.md`**: o fluxo de SDD do repositório (brief → spec → plano → execução → revisão), branch e PR por
      plano, as obrigações do `AGENTS.md` com os comandos, como publicar uma versão (o workflow, o plano B local com
      `release.mjs`, e a promoção manual para a `main`), e que o `roadmap.md` é atualizado no PR que entrega um plano.
    - O link "Plano de implementação" do README passa a apontar para `docs/superpowers/` (specs e planos atuais); o
      plano original de setembro em `docs/plans/` fica, citado como histórico.
11. **Check de documentação no CI** (`scripts/check-docs.mjs`, `npm run check-docs`, no `npm run ci` e no job
    "Lint e derivados"):
    - **links:** em todo `.md` versionado (`git ls-files`), todo link relativo aponta para arquivo ou pasta existente, e
      toda âncora (`arquivo.md#secao` ou `#secao`) existe entre os títulos do arquivo de destino, com a regra de âncora
      do GitHub (minúsculas, acentos mantidos, pontuação removida, espaço vira hífen, repetidos ganham `-1`, `-2`);
      links `http(s)` e `mailto:` não são checados;
    - **comandos:** em blocos de código `bash` desses arquivos, toda linha que chama `archlens <comando>`,
      `bin/archlens <comando>` ou `node scripts/archlens.mjs <comando>` usa um comando que existe na CLI (a lista vem do
      mesmo `HELP`);
    - exclusões só para pastas de dados de teste, cada uma com um comentário dizendo por quê.

## Fora do escopo

Publicar no npm. Promoção automática para a `main`. Tradução. Guia do administrador (P08). Links externos. Mudar o
conteúdo das referências (`references/`) ou das skills além de consertar links.

## Critérios de aceite

- A 0.7.0 sai pelo `release.mjs` sem nenhum arquivo editado à mão, e o PR dela passa no `check-plugin` e no
  `check-ask` sem intervenção. A partir da 0.7.1, preparar uma versão é disparar "Preparar versão" e aprovar o PR.
- Depois da promoção para a `main`, a tag `v<versão>` e o release do GitHub existem, com as notas do changelog.
- `npm version patch --no-git-tag-version` num checkout limpo muda só a linha da versão no `package.json`.
- O `roadmap.md` lista tudo o que existe e nenhum item entregue aparece como pendente.
- `npm run check-docs` passa, e um link quebrado ou um comando inexistente colocado de propósito o faz falhar.
- `README.md` com até 8 KB, e nenhuma seção do README antigo sem destino.

## Primeiro release

Um workflow com `workflow_dispatch` só pode ser disparado depois que o arquivo está na branch padrão (`main`), e a
`main` só recebe código pela promoção manual. Por isso o próprio P14 não pode sair pelo botão.

**Decisão do dono (2026-11-18):** a **0.7.0** (que leva o P07 e o P14) é preparada com `scripts/release.mjs` rodado
à mão, num PR próprio para `develop-v2` depois do merge do P14. Quando o dono promove a 0.7.0 para a `main`, o
`tag.yml` (que já estará lá) cria a tag e o release, e o botão "Preparar versão" passa a existir. O primeiro critério
de aceite e a confirmação de que o CI aparece no PR de release ficam para a 0.7.1.

Descartado: promover para a `main` sem subir a versão. Quem já instalou não receberia nada (o Claude Code guarda o
plugin pelo número da versão) e quem instalasse receberia código novo com o número 0.6.0.

## O que fica para o dono

- Ligar "Allow GitHub Actions to create and approve pull requests" em Settings → Actions → General.
- Na primeira versão preparada pelo workflow, conferir se as checagens do CI aparecem no PR; se não, criar o
  `RELEASE_TOKEN` (plano B da decisão 7).
- A proteção de branch do P01 continua pendente.

## O que fica para quem implementa

Nomes internos de funções, a ordem das fatias, o texto do `CONTRIBUTING.md` e do README curto, o formato exato da lista
de conferência no corpo do PR. Não dá para testar os workflows de verdade antes do merge: eles são conferidos por
leitura, por um teste que valida a sintaxe YAML e as entradas, e na primeira execução real.

## Obrigações do repositório

- **archlens-ask:** sem impacto no conteúdo; o `release.mjs` roda `npm run ask` porque o `REFERENCE.md` cita a versão.
- **GUI:** sem impacto no código; o README perde a seção que vira `docs/GUI.md`.
- `CHANGELOG.md` ganha a entrada deste ciclo em `[Não lançado]`.
