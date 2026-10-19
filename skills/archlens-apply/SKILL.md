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

## Criar a base (`init`)

Sem base, a skill archlens-plan ou archlens-query pergunta ao usuário o tipo de repositório e os parâmetros
(`references/base.md`, *Repositórios da base*) e passa para cá. Confirme com o usuário e rode:

`archlens init <pasta> --store json|markdown|gbrain [--name N]`, com, no gbrain:

- **modo git**: `--mode git --repo <clone> [--remote origin] [--branch main] [--prefix archlens]` (o clone já existe: o
  CLI não clona nem guarda credenciais);
- **modo MCP**: `--mode mcp --server <nome do MCP no Claude Code> [--source-id <fonte>] [--prefix archlens]`; em seguida
  confira a sessão (abaixo). Bases grandes ficam bem mais baratas no modo git: avise o usuário.

Pasta que já tem base: `E_STORE_EXISTS` (para levar uma base local ao gbrain, `store convert`, em *Outras tarefas*).

## Base gbrain no modo MCP

O CLI não fala com o MCP: ele grava um pedido (lista de chamadas `{ tool, arguments }`) e você faz as chamadas nas
ferramentas do MCP configurado, na ordem, sem decidir nada, gravando o resultado bruto de cada uma em
`{ "archlens-remote": "1.0", "request": "<id>", "results": [...] }`; depois rode o comando que a CLI imprimir.

- **Uma vez por sessão**, confira o MCP: `archlens remote <base> check`, faça as chamadas (`whoami`, `request_tools`) e
  `archlens remote <base> check --ingest resposta.json`. Sem o conjunto completo de ferramentas, gravar é recusado
  (`E_STORE_GBRAIN_SURFACE`): sugira o modo git.
- **Antes de ler a base** (`show`, `build`, `doc`, `store convert` a partir do gbrain): `archlens remote <base> pull` e
  `archlens remote <base> pull --ingest resposta.json` até a CLI dizer que o espelho está em dia.
- Cada página lida ou gravada passa pelo seu contexto: em bases grandes, recomende o modo git.

## Fluxo

1. **Confira o plano**: `archlens show <base> p2.json`. O cabeçalho precisa dizer **final** e a revisão do usuário
   precisa estar feita. Aberto: volte à skill archlens-plan.
2. **Aplique**: `archlens apply <base> p2.json`. Ele valida o resultado, grava `architecture/`, regenera o
   `ARCHITECTURE.md`, registra a rodada no histórico e imprime a revisão e o commit sugerido. Plano sem mudanças:
   `= nada mudou; a base não foi regravada`. Na base `markdown`, o texto de uma página removida vai para
   `notes/removidos/<tipo>/<id>.md`, e o apply diz onde. **Modo git do gbrain**: o apply é um commit com push no
   repositório do gbrain (`E_STORE_GIT` traz a saída do git); lembre o usuário de que o sync do gbrain indexa as páginas.

   **Modo MCP do gbrain**, em passos (cada um imprime o próximo):
   0. `archlens remote <base> pull` (e os `--ingest` até o espelho estar em dia) **logo antes** do apply: as
      conferências do apply rodam contra esse espelho e a releitura;
   1. `archlens apply <base> p2.json` grava o pedido de releitura (`get_page` do que o plano lê e grava); faça as chamadas;
   2. `archlens apply <base> p2.json --read-check resposta.json` confere o que foi relido e grava o pedido de gravação
      (`put_pages`, `delete_page`, o histórico por último) e o registro em `.archlens/applies/<id>.json`; faça as chamadas;
   3. `archlens apply <base> --receipts resposta.json` confere os recibos e atualiza o espelho. Se ele pedir um
      seguimento (tags a tirar ou pôr, `remove_tag`/`add_tag`), faça essas chamadas e rode `--receipts` de novo.
   4. Apply **parcial**: chamadas sem recibo (a sessão caiu, ou um erro do cliente MCP como um timeout: grave o
      resultado como veio) → `archlens apply <base> --resume <id>`, que repete com os mesmos `request_id` (o gbrain nunca
      grava duas vezes; o `--undo` espera esses recibos); página em conflito (mudou no gbrain no meio) ou que o gbrain
      marcou como duplicata (`duplicate_of`: use uma fonte do gbrain por base) → `archlens apply <base> --undo <id>`, e
      depois `--receipts` do pedido do undo. A página de histórico apagada no gbrain (`E_STORE_HISTORY_RETRY`): restaure-a
      (`restore_page`) e `--resume <id>`, ou `--undo <id>`. **Pergunte ao usuário antes do undo.**

   | Recusa (nada gravado) | O que fazer |
   |---|---|
   | `E_PLAN_OPEN` | o plano tem perguntas sem resposta ou está bloqueado: skill archlens-plan |
   | `E_PLAN_SCHEMA` | não é um plano (ex.: um delta): skill archlens-plan, `archlens plan` primeiro |
   | `E_STORE_CONFLICT` | um objeto do plano mudou depois dele (outro apply em paralelo), ou um elemento parecido foi criado em paralelo: a mensagem lista os objetos. No modo MCP, `archlens remote <base> pull` antes; refaça com `archlens plan <base> --answers p2.json --out p3.json` (skill archlens-plan), revise e aplique o novo |
   | `E_REMOTE_STALE` | base MCP sem espelho: `archlens remote <base> pull` (acima) |
   | `E_STORE_APPLY` | modo MCP: `--resume`/`--undo` sem o que retomar ou desfazer, `--resume` com conflito, ou `--undo` com chamadas sem recibo: siga a mensagem (`--receipts` do pedido em aberto, `--resume <id>`, ou `--undo <id>`) |
   | `E_STORE_GBRAIN_SIZE` | modo MCP: página acima de 8 MB (limite do `put_pages`): reduza a página ou use o modo git |
   | `E_STORE_UNSUPPORTED` | `merge --apply` numa base MCP: feche com `archlens plan --answers` e use `archlens apply` |
   | `E_STORE_GBRAIN_SLUG` / `E_STORE_GBRAIN_RESERVED` | id que não é slug do gbrain (minúsculas, sem acento) ou nome/campo reservado do gbrain: corrija o delta (skill archlens-plan) |
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
| trocar de conector (Obsidian) | `archlens store convert <base> --to markdown\|json`; para `json`, o texto das páginas se perde e exige `--force` (pergunte antes) |
| levar a base local ao gbrain, modo git | `archlens store convert <base> --to gbrain --mode git --repo <clone> [--remote origin] [--branch main] [--prefix archlens]` (um commit; o prefixo precisa estar vazio) |
| levar a base local ao gbrain, modo MCP | `archlens remote <base> check --server <S>` (funciona na base local; siga o pedido), depois `archlens store convert <base> --to gbrain --mode mcp --server <S> [--source-id ID] [--prefix archlens]`: pedido só de criação; faça as chamadas e conclua com `archlens apply <base> --receipts resposta.json` (a pasta local só muda com o último recibo) |
| trazer a base do gbrain para local | `archlens store convert <base> --to json\|markdown` (modo MCP: lê o espelho; rode o `pull` antes) |
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
- **Aplicar plano aberto ou feito sobre objetos que mudaram**: o apply recusa; refaça o plano com `--answers`.
- **Gravar no gbrain pelos dois caminhos**: cada base tem um só (git ou MCP, escolhido no `init`); não grave as páginas
  da base pelo outro. Edição direta no gbrain só no texto depois de `<!-- archlens:end -->`.
- **Modo MCP: decidir no lugar da CLI**: faça exatamente as chamadas do pedido, na ordem, e guarde o resultado bruto
  (resposta que não corresponde: `E_REMOTE_RESPONSE`).
- **Aplicar sem olhar os `retired` sugeridos** por uma nova leitura: confira no `show` que cada um foi confirmado.
- **Editar o plano final à mão**: ele é para ler e revisar; mudanças voltam à skill archlens-plan.
- **Visão gigante**: um diagrama com 60 nós não comunica nada. Prefira várias visões, que as setas
  ←/→ encadeiam como slides.
- **Editar o `ARCHITECTURE.md`** e **base 1.x**: ver `references/base.md`.

## Referências

- `references/base.md`: base, conectores, regras comuns e a lista completa de referências
- `references/merge.md`: plano final, apply, erros, proveniência, ciclo de vida e histórico
- `references/knowledge-doc.md`: a pasta `architecture/`, o `ARCHITECTURE.md` gerado, o conector gbrain, `check` e `migrate`
- `references/views.md`: layout e legibilidade (para agir sobre os alertas)
