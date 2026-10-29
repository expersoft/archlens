---
name: archlens-plan
description: Use when the user brings new information for the architecture knowledge base (the architecture/ folder behind ARCHITECTURE.md), in free text, a document, a JSON DSL model or a repository (folder or git URL) to read — e.g. "add Y", "X was replaced / shut down / renamed", "what does this repo bring that the base doesn't have", "how would the base look if…", or a view to keep — or wants to create a new base. Turns it into a delta, asks the user each decision and ends with a reviewed final plan and an HTML preview; never writes the base.
---

# archlens-plan

Leia `references/base.md` antes do primeiro comando (caminhos relativos a `$ARCHLENS`).

`SKILL_DIR` = pasta deste arquivo; `ARCHLENS="$(realpath "$SKILL_DIR/../..")"` = o repositório do archlens (o `realpath` segue o link
simbólico da instalação; sem ele, o `..` sai pelo `~/.claude` e não acha o repositório). CLI: `node "$ARCHLENS/scripts/archlens.mjs" <comando>` (abaixo,
`archlens <comando>`). `$OUT` = uma pasta **fora** da base (ex.: `/tmp/archlens`).

Esta skill **nunca grava a base**: usa só `scan`, `plan`, `show` e a prévia `deliver --delta/--plan`, com a saída
em `$OUT` (`remote pull`/`check` só atualizam o espelho local de uma base gbrain no modo MCP). Gravar é da skill archlens-apply, e só com o plano final que esta skill entrega.

## Fluxo

1. **Localize a base** (`references/base.md`). Base 1.x: proponha a migração (skill archlens-apply, com o ok do
   usuário) antes de planejar. `ARCHITECTURE.md` alheio: pergunte antes.
   - **Sem base**: pergunte ao usuário o tipo de repositório (`json` local, `markdown`/Obsidian, gbrain no modo git ou
     no modo MCP) e os parâmetros dele (`references/base.md`, *Repositórios da base*);
     quem cria a base com `archlens init` é a skill archlens-apply. Sem preferência, uma base `json` também nasce no
     primeiro apply.
   - **Base gbrain no modo MCP** (`store.mode: "mcp"`): uma vez por sessão, confira o MCP com `archlens remote <base> check`
     (siga o pedido e rode `check --ingest`). Antes de ler a base (`scan --base`, `plan`, `show`, prévias), atualize o
     espelho: `archlens remote <base> pull`, faça as chamadas do pedido nas ferramentas do MCP (na ordem, gravando o
     resultado bruto) e `archlens remote <base> pull --ingest resposta.json` até a CLI dizer que o espelho está em dia.
     Bases grandes ficam bem mais baratas no modo git.
2. **Traduza a informação nova em delta** (`references/merge.md`):
   - **texto livre**: siga `references/free-text.md` (`source` com o trecho, `inferred` + `confidence`,
     `assumptions`). Pergunte ao usuário **só** o que bloqueia;
   - **JSON DSL**: embrulhe em `{"archlens-delta":"1.0","source":…,"model":…}`;
   - **"X foi desligado / será substituído / renomeie Y"**: `ops` (`status`, `rename`, `alias`, `remove`);
   - **visão que o usuário quer manter** (vinda da skill archlens-query): delta só com `views` (`key` único, `title`);
   - **repositório (pasta ou URL git)**: `archlens scan <repo> --base <base>` e mostre o resumo; pergunte o papel
     (sistema ou serviço) e o sistema, comentando a sugestão e os motivos — **nunca assuma pelo nome**; se o resumo
     mostrar `já na base: … (semelhança de nome …)`, confirme com o usuário e passe `--id <id existente>` (sem isso o
     plano traz uma possível duplicata e a infraestrutura ganha ids com o prefixo errado); depois
     `archlens scan <repo> --base <base> --as system|service [--system <id>] [--id <id>] --delta d.json`; troque nomes
     técnicos por nomes de negócio (técnicos em `aliases`) e siga para o plano. Na primeira leitura, `--base` pode
     apontar a base que o apply vai criar, e `--system` pode nomear um sistema novo (o delta o cria). Placeholders
     `ext.*` de leituras anteriores que representam o repositório lido saem por `remove` no próprio delta (confirme
     com `yes`). Sem graphify, sugira rodá-lo no repositório. Detalhes em `references/repo-reading.md`.

   Sempre preencha `source` (`kind` + `ref`) e `summary`. Reutilize os ids da base (`archlens views <base>` e as
   tabelas do `ARCHITECTURE.md` mostram os ids).
3. **Planeje**: `archlens plan <base> delta.json --out p1.json`. Mostre o resumo ao usuário. O plano sai **aberto**
   (com perguntas) ou **final** (pronto); a CLI imprime o próximo passo. Se vier **bloqueado**, corrija o delta e
   planeje de novo.
   **Mostre a prévia** antes das perguntas: `archlens deliver <base> --delta delta.json --out $OUT/prévia.html`
   (sempre em `$OUT`, fora da base). Novo aparece em esboço com `+`, alterado com `~`, removido riscado com `−`, decisão
   pendente com `?`. A prévia nunca grava a base. O caminho da base é obrigatório (mesmo que ainda não exista);
   com `--plan`, se a base mudou desde o plano, a CLI avisa e usa a base atual.
4. **Pergunte, uma decisão por vez**: cada item com `resolution: null` (conflito, possível duplicata, remoção,
   `retired`), na ordem de `n`, com a sua recomendação e o motivo. **Comece pelas possíveis duplicatas.** Pule os
   itens com `when` se a duplicata foi respondida `different`. **Nunca decida sozinho.** Grave cada resposta no
   campo `resolution` do item em `p1.json`.
5. **Refaça o plano com as respostas**: `archlens plan <base> --answers p1.json --out p2.json` (sem o delta: usa o
   do plano). Depois de uma duplicata `same`, relações e filhos passam a apontar para o elemento da base e podem
   surgir perguntas novas: volte ao passo 4 no plano novo. Repita até o plano sair **final**. Para ver "e se eu
   responder X?" no meio do caminho: `archlens deliver <base> --plan p1.json --out $OUT/prévia.html`.
6. **Entregue o plano final**: `archlens show <base> p2.json --out $OUT/plano.md` (relatório: decisões, novos,
   alterados, removidos, relações, visões) e a prévia `archlens deliver <base> --plan p2.json --out $OUT/prévia.html`
   (fora da base). Mostre o relatório e o caminho da prévia, as premissas abertas e peça a revisão. Para gravar, use
   a skill archlens-apply com `p2.json`.

## Pedidos de "como fica se…"

| O usuário pede | Comando (nada é gravado) |
|---|---|
| como fica se aplicarmos este delta? | `archlens deliver <base> --delta delta.json --out $OUT/prévia.html` |
| e se eu responder X nesta pergunta? | responda no plano e rode `archlens deliver <base> --plan p1.json --out $OUT/prévia.html` |
| o que este plano muda, em texto? | `archlens show <base> p1.json` (aberto ou final) |

## Erros comuns

- **Aplicar para "ver como fica"**: use a prévia (`--delta` / `--plan`). O apply grava a base e entra no histórico.
- **Duplicata aceita sem perguntar**: `possible-duplicate` é sempre pergunta ao usuário. Um `same` errado funde
  dois elementos diferentes.
- **Esquecer de refazer o plano depois de um `same`**: rode `plan --answers`; o plano novo trata o item como o
  elemento da base e pode trazer perguntas novas.
- **Assumir o sistema pelo nome do repositório**: `terminus-*` é só um indício; pergunte.
- **Passar pelos `retired` sugeridos** por uma nova leitura sem perguntar: confirme um a um.
- **`draft` × `planned`**: `draft` é "em discussão"; `planned` é "decidido, ainda não existe".
- **Direção do `uses`**: em C4 é consumidor → provedor (`cliente uses web`). A CLI converte para
  ArchiMate (`web serving cliente`). Não inverta à mão.
- **Propriedade onde cabe um elemento**: se a pergunta é "o que depende de X" por um valor, a propriedade não
  atravessa; promova a elemento (ver *Propriedades* em `references/base.md`).
- **Camadas desconectadas**: travessias ArchiMate só cruzam camadas por relações. Ligue containers C4
  a application services (`realization`) e estes a processos (`serving`). Ligue a tecnologia aos
  containers (`serving`/`realization`). Sem isso, "o que sustenta o produto" para no negócio.
- **Banco como sistema**: em C4, use `c4:container` com `tags:["database"]` (grava `application-component` +
  `c4.kind: container`; o C4 desenha o cilindro pela tag). O SGBD (PostgreSQL, RDS) é `archimate:system-software`
  servindo o banco; o conteúdo (tabelas), se conhecido, é `data-object` com `parent` no banco.
- **Hierarquia C4**: component dentro de container, que fica dentro de softwareSystem (`E_C4_HIERARCHY`).
- **Agrupador virando sistema**: "Camada de Autorização", "Plataforma de Crédito" e afins organizam sistemas;
  modele como `grouping` e preencha `group` nos membros. Um `c4:softwareSystem` falso aparece como caixa e quebra
  as relações entre as aplicações.
- **Elemento dentro do `grouping`**: não aninhe membros em `children` (nem use `parent`) de um agrupamento; use
  `"group": "<agrupamento>"`. Aninhado, ele é lido como membro com o aviso `W_GROUP_CHILD`.
- **Prévia dentro da base**: o `--out` da prévia e do `show` vai para fora da pasta `architecture/`.
- **Base no gbrain**: ids precisam ser slugs do gbrain (minúsculas, dígitos, `.`, `_`, `-`, sem acento;
  `E_STORE_GBRAIN_SLUG`), e campos com nomes que o gbrain reserva (`slug`, `trust_tier`, `source_kind`, …) são
  recusados (`E_STORE_GBRAIN_RESERVED`). Apply recusado com `E_STORE_CONFLICT` (outro arquiteto gravou um objeto do
  plano): no modo MCP, rode o `pull` antes de refazer o plano com `--answers`.

## Referências

- `references/base.md`: base, formato 2.0, propriedades, regras comuns e a lista completa de referências
- `references/merge.md`: delta, plano aberto e final, classes, respostas, `show`, erros, prévia
- `references/free-text.md`: como extrair o modelo de texto livre
- `references/notation.md`: DSL JSON completa
- `references/repo-reading.md`: `archlens scan`, leitura de repositórios
- `references/archimate.md` e `references/c4.md`: tipos, relações e níveis
