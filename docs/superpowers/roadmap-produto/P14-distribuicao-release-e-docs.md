# P14 — Distribuição, release e documentação

**Trilha:** Engenharia · **Tamanho:** P · **Depende de:** P01

## Objetivo

Publicar uma versão é um passo só, o roadmap reflete a realidade, e cada público (usuário, administrador,
contribuidor) tem a sua documentação.

## Evidência

- Release manual descrito no `README.md` ("Publicar uma versão"): criar branch, `npm version`, **desfazer à mão a
  reformatação do `package.json`**, `npm run ask`, editar o `CHANGELOG.md`, validar o plugin, testar, abrir PR, criar
  e enviar a tag depois do merge, e levar à `main`.
- `package.json` tem `"private": true`: o comando `archlens` só existe por link simbólico ou `npm link`.
- `docs/superpowers/roadmap.md` está desatualizado: não cita a GUI, os lançadores nem os specs em aberto, e marca o
  archlens-ask como "em andamento, branch `feat/archlens-ask`".
- O `README.md` (21 KB) mistura apresentação, instalação, referência da CLI, GUI e processo de release. Há
  `docs/GUIA.md` para o usuário; não há guia de administrador nem `CONTRIBUTING.md`.
- O `README.md` aponta "Plano de implementação" para `docs/plans/`, enquanto os planos estão em `docs/superpowers/plans/`.
- Toda a documentação e todas as mensagens estão em português.

## Escopo

1. **Release automatizado** (GitHub Actions): a partir de um gatilho, sobe a versão, regenera os derivados
   (`sync-plugin`, `npm run ask`), fecha a seção do `CHANGELOG.md`, abre o PR; no merge, cria a tag e o release do
   GitHub com as notas. Corrigir a causa da reformatação do `package.json` em vez de desfazê-la à mão.
2. **Promoção para a `main`** (de onde o marketplace do plugin lê) como passo explícito do mesmo fluxo.
3. **Decidir e, se for o caso, publicar no npm** (`npx archlens`), o que simplifica a instalação da CLI fora do plugin.
4. **Roadmap vivo:** `docs/superpowers/roadmap.md` atualizado com o que já foi entregue e apontando para esta pasta;
   cada plano P01–P14 ganha status ali.
5. **Documentação por público:** `README.md` curto (o que é, instalar, primeiro uso); referência da CLI gerada do
   texto de ajuda; guia do administrador (com P08); `CONTRIBUTING.md` com o fluxo de SDD do repositório e as
   obrigações do `AGENTS.md`; links quebrados corrigidos.
6. **Check de links e de exemplos de comando** na documentação, no CI.

## Fora do escopo

Tradução do produto (ver decisões). Site de documentação.

## Critérios de aceite

- Publicar uma versão exige uma ação humana para iniciar e uma para aprovar o PR; nenhum arquivo editado à mão.
- `npm run check-plugin` e `npm run check-ask` passam no PR de release sem intervenção.
- O `roadmap.md` lista tudo que existe no repositório e nenhum item entregue aparece como pendente.
- Nenhum link interno quebrado na documentação.

## Decisões a fechar no brainstorm

- Publicar no npm ou continuar privado; nome do pacote e escopo.
- Geração do changelog: manter a escrita à mão (o atual é cuidado e em português) ou gerar de commits convencionais.
- **Idioma.** Hoje é tudo pt-BR. Para um time interno brasileiro isso é adequado; se houver intenção de público
  externo, a internacionalização (mensagens da CLI, prompts, interface, documentação) é um plano próprio e grande.
  Decidir agora só se entra no roadmap.
- Quem faz o merge para a `main`: há uma nota de memória do projeto sobre o fluxo de release; confirmar com o dono.

## Obrigações do repositório

archlens-ask: o `REFERENCE.md` cita a versão, então todo release roda `npm run ask`. GUI: sem impacto.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P14-distribuicao-release-e-docs.md`, a seção "Publicar uma
> versão" do `README.md` e `scripts/sync-plugin.mjs`. Comece atualizando o `docs/superpowers/roadmap.md` (é barato e
> independe do resto) e depois conduza o brainstorm do fluxo de release.
