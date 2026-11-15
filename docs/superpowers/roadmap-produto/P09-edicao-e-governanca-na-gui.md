# P09 — Edição e governança na GUI

**Trilha:** Servidor de time · **Tamanho:** G · **Depende de:** P06

## Objetivo

Um time evolui a base pela GUI com controle: propostas guardadas no servidor, revisão por outra pessoa antes de
gravar, e uma forma visual de ver o que mudou e quando.

## Evidência

- O rascunho de plano vive no navegador (`apps/gui/web/src/plan/draftStore.ts`) e viaja inteiro em cada requisição
  (`BODY_MAX` em `apps/gui/server/plan/routes.mjs`); o servidor refaz o plano a cada chamada (`replanDraft`). Trocar de
  máquina ou limpar o navegador perde o trabalho; ninguém mais vê a proposta.
- Quem planeja é quem aplica (`/plan/apply`); não há segundo par de olhos.
- A base guarda o changelog e o ciclo de vida (as-is/to-be, `draft`, `planned`), e a CLI desenha prévias de delta
  (`--delta`, `--plan`). A GUI mostra a prévia do plano corrente, mas não o histórico nem a comparação entre versões.
- Planejar pela GUI é recusado em base gbrain no modo MCP (`E_GUI_PLAN_MCP`).
- **Edição já entregue** (PRs #34, #36 e #37, ainda sem versão): documentação do nó, painel do nó, `Editar` no
  Navegar que leva ao Planejar com a mudança no Delta, editor ampliado da documentação, `Aplicar` com checklist de
  etapas gravando num worker. Specs: `2026-11-04-documentacao-do-no-design.md`,
  `2026-11-09-painel-do-no-e-edicao-no-planejar-design.md`, `2026-11-09-navegar-editavel-logo-avisos-design.md`,
  `2026-11-10-gui-notacao-carregamento-aplicar-design.md`. Toda edição passa pelo fluxo de plano, que é a base certa
  para a governança.

## Escopo

Três cortes de governança e um de complemento, cada um um ciclo próprio:

1. **Propostas no servidor.** O rascunho ganha identificador, dono, estado e histórico de mensagens, guardado no
   servidor. Lista de propostas por base. O que hoje está no navegador vira cache.
2. **Revisão e aprovação.** Estados (rascunho → em revisão → aprovada → aplicada, ou recusada), comentários por item
   do plano, regra configurável de quem aprova. Aplicar exige aprovação quando a base pede.
3. **Histórico e diferença visual.** Linha do tempo do changelog; escolher duas versões e ver o diagrama com a
   notação de prévia que já existe (`+ ~ −`); filtro as-is / to-be nas visões.
4. **Lacunas da edição que já existe.** Levantar, usando a GUI atual, o que ainda só se faz pelo chat ou pela CLI
   (por exemplo criar e remover elementos e relações, mover de pai, editar visões salvas) e decidir com o dono o que
   vale um formulário. Não refazer o que os PRs #34 a #37 entregaram.

Também: decidir o destino do planejar em base gbrain MCP (suportar, ou explicar na interface por que não).

## Fora do escopo

Edição gráfica livre do diagrama (arrastar caixas, desenhar setas). Edição simultânea em tempo real.

## Critérios de aceite

- Uma proposta criada num navegador aparece em outro, para outra pessoa com acesso à base.
- Numa base que exige aprovação, o autor não consegue aplicar a própria proposta; a tentativa pela API devolve 403.
- Se a base mudou entre a aprovação e a aplicação e a mudança cruza o plano, a aplicação é recusada e a proposta volta
  para revisão (o mecanismo `E_STORE_CONFLICT`/`E_PLAN_STALE` já existe).
- A comparação entre duas versões usa o núcleo (`previewModel`, `diffModels`), sem lógica de diff duplicada na GUI.

## Decisões a fechar no brainstorm

- Onde as propostas moram: arquivos numa pasta do servidor, dentro da própria base (viajam com o git), ou banco.
- Se a aprovação é do archlens ou delegada a um pull request quando a base mora em git (a GUI abre o PR; o merge é a
  aprovação). Esse caminho reaproveita a governança que o time já tem.
- Como reconstruir uma versão antiga da base: o changelog guarda o suficiente, ou depende do histórico do git.

## Obrigações do repositório

Mudança de formato do changelog ou da base: `npm run ask`, `check-ask`. Mudanças em `store/` e `query*`:
`npm run gui:test`. Mudança na skill `archlens-plan` ou em `references/`: `npm --prefix apps/gui run prompt`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P09-edicao-e-governanca-na-gui.md`,
> `docs/superpowers/specs/2026-11-03-gui-planejar-design.md` e os quatro specs de edição citados no brief. Faça o
> brainstorm só do primeiro corte que o dono escolher; os outros viram ciclos seguintes.
