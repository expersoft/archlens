---
name: archlens-apply
description: Use when the user wants to write a reviewed final archlens plan into the architecture knowledge base (architecture/ folder), regenerate ARCHITECTURE.md and the saved diagrams in architecture/diagrams/, write the interpretation notes, check the base in CI or pre-commit, migrate a 1.x base to format 2.0, or switch its store connector (json ↔ markdown, Obsidian vault, gbrain). Needs a final plan made by archlens-plan; requests to add or change something in the base without one go to archlens-plan.
---

# archlens-apply

Leia `references/base.md` antes do primeiro comando (caminhos relativos a `$ARCHLENS`).

`SKILL_DIR` = pasta deste arquivo; `ARCHLENS="$(realpath "$SKILL_DIR/../..")"` = o repositório do archlens (o `realpath` segue o link
simbólico da instalação; sem ele, o `..` sai pelo `~/.claude` e não acha o repositório). CLI: `node "$ARCHLENS/scripts/archlens.mjs" <comando>` (abaixo,
`archlens <comando>`).

Esta é a única skill que grava a base. **Sem plano final, não siga**: se o usuário pede "adicione Y na base",
"X foi substituído", "guarde esta visão" ou traz um delta, use a skill archlens-plan, que entrega o plano final
(`state: "final"`). Plano aberto também volta para ela.

## Fluxo

1. **Confira o plano**: `archlens show <base> p2.json`. O cabeçalho precisa dizer **final** e a revisão do usuário
   precisa estar feita. Aberto: volte à skill archlens-plan.
2. **Aplique**: `archlens apply <base> p2.json`. Ele valida o resultado, grava `architecture/`, regenera o
   `ARCHITECTURE.md`, registra a rodada no histórico e imprime a revisão e o commit sugerido. Plano sem mudanças:
   `= nada mudou; a base não foi regravada`. Na base `markdown`, o texto de uma página removida vai para
   `notes/removidos/<tipo>/<id>.md`, e o apply diz onde.

   | Recusa (nada gravado) | O que fazer |
   |---|---|
   | `E_PLAN_OPEN` | o plano tem perguntas sem resposta ou está bloqueado: skill archlens-plan |
   | `E_PLAN_SCHEMA` | não é um plano (ex.: um delta): skill archlens-plan, `archlens plan` primeiro |
   | `E_STORE_CONFLICT` | a base mudou depois do plano: refaça com `archlens plan <base> --answers p2.json --out p3.json` (skill archlens-plan), revise e aplique o novo |
   | `E_MERGE_INVALID` | o resultado com as respostas é inválido: reveja as respostas (skill archlens-plan) |
   | `E_STORE_FORMAT` | base 1.x: migre (abaixo) e refaça o plano |
3. **Gere**: `archlens build <base>` (documento + HTML das visões salvas em `architecture/diagrams/` +
   screenshots 1920×1080 / 1280×720).
4. **Leia o relatório de qualidade** e aja (seção *Alertas*). Olhe ao menos um screenshot por visão nova. Mudar
   uma visão salva é um delta com `views`: skill archlens-plan.
5. **Escreva a interpretação** em `architecture/notes/overview.md` (propósito, decisões, riscos) e
   `architecture/notes/notes.md`; depois `archlens doc <base>`.
6. **Entregue**: caminhos do `.md` e do `.html`, visões, premissas abertas, alertas e o commit sugerido (o apply
   imprime `git add architecture ARCHITECTURE.md && git commit …`).

## Outras tarefas

| O usuário pede | Comando |
|---|---|
| migrar uma base 1.x (`E_STORE_FORMAT`) | **pergunte antes**; `archlens migrate <base>` ou `archlens migrate ARCHITECTURE.md` (`--to DIR` grava noutra pasta). Planos anteriores deixam de valer |
| trocar de conector (Obsidian, gbrain) | `archlens store convert <base> --to markdown\|json`; para `json`, o texto das páginas se perde e exige `--force` (pergunte antes) |
| regenerar só o documento | `archlens doc <base>` (depois de editar `architecture/notes/*.md`) |
| regenerar documento e diagramas salvos | `archlens build <base>` |
| conferir no CI / pre-commit | `archlens check <base>` (valida e confere se o `ARCHITECTURE.md` está em dia) |

## Alertas do deliver/build (e o que fazer)

| Alerta | Ação |
|---|---|
| `texto ~Npx (< 14px)` | divida a visão: `focus`+`depth`, `exclude`, `granularity:"container"`, `collapse:["application-service"]`, ou `layers` menores. Em visões C4 grandes, crie uma visão por container |
| `ocupa N% da largura (< 90%)` | C4: `layout:{direction:"auto"}` ou `"DOWN"`. Se persistir, a visão é estreita demais: divida-a |
| ArchiMate com setas difíceis de seguir | veja o estilo escolhido no build; force outro com `layout:{style:"flow"|"bands"|"bands-flow"}` |
| `visão tem N nós` (> 40) | quase sempre ilegível no telão: recorte |
| visão vazia | scope/anchor errado ou faltam ligações entre camadas (veja *Camadas desconectadas* na skill archlens-plan) |
| erro de JS | bug do renderer: reporte com o HTML |

As ações mudam visões salvas: monte o delta com `views` e use a skill archlens-plan. Detalhes das view specs em
`references/views.md`.

## Erros comuns

- **Aplicar para "ver como fica"**: use a prévia da skill archlens-plan. O apply grava a base e entra no histórico.
- **Aplicar plano aberto ou feito sobre outra versão da base**: o apply recusa; refaça o plano com `--answers`.
- **Aplicar sem olhar os `retired` sugeridos** por uma nova leitura: confira no `show` que cada um foi confirmado.
- **Editar o plano final à mão**: ele é para ler e revisar; mudanças voltam à skill archlens-plan.
- **Visão gigante**: um diagrama com 60 nós não comunica nada. Prefira várias visões, que as setas
  ←/→ encadeiam como slides.
- **Editar o `ARCHITECTURE.md`** e **base 1.x**: ver `references/base.md`.

## Referências

- `references/base.md`: base, conectores, regras comuns e a lista completa de referências
- `references/merge.md`: plano final, apply, erros, proveniência, ciclo de vida e histórico
- `references/knowledge-doc.md`: a pasta `architecture/`, o `ARCHITECTURE.md` gerado, `check` e `migrate`
- `references/views.md`: layout e legibilidade (para agir sobre os alertas)
