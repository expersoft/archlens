---
name: archlens
description: Use when the user wants architecture diagrams in C4 (landscape, context, container, component, dynamic) or ArchiMate (business, application, technology layers, cross-layer support or impact views), described in free text or JSON; when they want to create or enrich an ARCHITECTURE.md knowledge base incrementally (new prompts, "X was replaced", "add Y", with provenance, lifecycle status and history); or asks to extract new diagrams from an existing ARCHITECTURE.md — e.g. "what supports this product/process", "dependency/impact matrix of this component", "focus on X", as-is/to-be, animated HTML for presentations.
---

# archlens

Arquitetura como **modelo**, diagramas como **consultas**. O modelo (metamodelo ArchiMate, com perfil C4
por cima) mora na pasta `architecture/`, a base de conhecimento (manifesto, `model.json`, `views.json`,
`changelog.json`, `notes/`). O `ARCHITECTURE.md` é o documento legível gerado a partir dela: nunca o edite.
A base **evolui por rodadas**: cada informação nova (prompt, texto, documento, repositório) vira um
**delta**, que passa por `merge --plan` → perguntas ao usuário → `merge --apply`, com proveniência,
ciclo de vida e histórico. Cada diagrama é uma *view spec* resolvida sobre a base e renderizada em HTML
animado, autocontido e pronto para apresentação.

**Princípio:** nunca desenhe um diagrama "à mão". Modele uma vez e peça visões. Se falta algo na
visão, falta no modelo: corrija o modelo.

`SKILL_DIR` = pasta deste arquivo. CLI: `node $SKILL_DIR/scripts/archlens.mjs <comando>`.
Requer Node ≥ 18. A checagem visual (`deliver`/`build`) usa `playwright-core` + Chromium
(`npm install` e `npx playwright install chromium` em `SKILL_DIR`). Sem eles, a checagem é pulada com aviso.

## Fluxo

1. **Localize a base.** Procure `architecture/archlens.json` (a CLI também acha sozinha, subindo a
   partir do diretório atual). Se só existir um `ARCHITECTURE.md` com bloco `archlens-json` (formato antigo), proponha
   `archlens migrate ARCHITECTURE.md` e **pergunte antes**. Se não existe base, o primeiro delta a cria; mas, se o
   repositório já tem um `ARCHITECTURE.md` que não foi gerado pelo archlens (sem `source:` no cabeçalho), **pergunte
   antes** ao usuário: movê-lo, ou usar o conteúdo dele como texto livre do primeiro delta. A CLI nunca o sobrescreve
   (`E_STORE_DOC_FOREIGN`).
2. **Só pedido de visão, nada novo a modelar?** Vá ao passo 7.
3. **Traduza a informação nova em delta** (`references/merge.md`):
   - **texto livre**: siga `references/free-text.md` (`source` com o trecho, `inferred` + `confidence`,
     `assumptions`). Pergunte ao usuário **só** o que bloqueia;
   - **JSON DSL**: embrulhe em `{"archlens-delta":"1.0","source":…,"model":…}`;
   - **"X foi desligado / será substituído / renomeie Y"**: `ops` (`status`, `rename`, `alias`, `remove`);
   - **repositório (pasta ou URL git)**: `archlens scan <repo> --base <base>` e mostre o resumo; pergunte o papel
     (sistema ou serviço) e o sistema, comentando a sugestão e os motivos — **nunca assuma pelo nome**; se o resumo
     mostrar `já na base: … (semelhança de nome …)`, confirme com o usuário e passe `--id <id existente>` (sem isso o
     plano traz uma possível duplicata e a infraestrutura ganha ids com o prefixo errado); depois
     `archlens scan <repo> --base <base> --as system|service [--system <id>] [--id <id>] --delta d.json`; troque nomes
     técnicos por nomes de negócio (técnicos em `aliases`) e siga para o plano. Na primeira leitura, `--base` pode
     apontar a base que o merge vai criar, e `--system` pode nomear um sistema novo (o delta o cria). Placeholders
     `ext.*` de leituras anteriores que representam o repositório lido saem por `remove` no próprio delta (confirme
     com `yes`). Sem graphify, sugira rodá-lo no repositório. Detalhes em `references/repo-reading.md`.

   Sempre preencha `source` (`kind` + `ref`) e `summary`. Reutilize os ids da base.
4. **Planeje**: `archlens merge architecture/ delta.json --plan plano.json`. Mostre o resumo ao usuário.
   Se o plano vier **bloqueado**, corrija o delta e planeje de novo.
   **Mostre a prévia** antes das perguntas: `archlens deliver architecture/ --delta delta.json --out prévia.html`
   (ou `--plan plano.json` depois de algumas respostas). Novo aparece em esboço com `+`, alterado com `~`,
   removido riscado com `−`, decisão pendente com `?`. A prévia nunca grava a base. O arquivo da base é obrigatório
   (mesmo que ainda não exista); com `--plan`, se a base mudou desde o plano, a CLI avisa e usa a base atual.
5. **Pergunte, uma decisão por vez**: cada item com `resolution: null` (conflito, possível duplicata, remoção,
   `retired`), com a sua recomendação. **Comece pelas possíveis duplicatas.** Se alguma for `same`, grave as
   respostas e gere o plano de novo reaproveitando-as:
   `archlens merge architecture/ delta.json --plan plano2.json --answers plano.json` (relações e filhos passam a
   apontar para o elemento da base e podem surgir perguntas novas); depois responda o resto no plano novo. **Nunca
   decida sozinho.**
6. **Aplique**: grave as respostas no plano e rode `archlens merge architecture/ --apply plano.json`. Ele
   valida, grava `architecture/`, regenera o `ARCHITECTURE.md` e registra a rodada. Sugira o commit que ele imprime.
7. **Traduza cada pedido de visão em view spec** (tabela abaixo; detalhes em `references/views.md`). Visões que
   o usuário quer manter entram na base por delta (`views`); consultas avulsas usam `--spec`.
   `archlens views architecture/` lista as definidas e sugere outras.
8. **Gere**: `archlens build architecture/` (documento + HTML em `architecture/diagrams/` +
   screenshots 1920×1080 / 1280×720) ou `archlens deliver architecture/ --spec '<json>' --out x.html`.
9. **Leia o relatório de qualidade** e aja (seção *Alertas*). Olhe ao menos um screenshot por visão nova.
10. **Escreva a interpretação** em `architecture/notes/overview.md` (propósito, decisões, riscos) e
    `architecture/notes/notes.md`; depois `archlens doc architecture/`.
11. **Entregue**: caminhos do `.md` e do `.html`, visões, premissas abertas, alertas e o commit sugerido.

## Pedido → view spec

| O usuário pede | View spec |
|---|---|
| panorama de todos os sistemas | `{notation:"c4", level:"landscape"}` |
| contexto do sistema X | `{notation:"c4", level:"context", scope:"X"}` |
| containers de X | `{notation:"c4", level:"container", scope:"X"}` |
| …focando em Y (e vizinhos) | acrescente `focus:["Y"], depth:1` |
| componentes do container C | `{notation:"c4", level:"component", scope:"C"}` |
| fluxo / sequência de uma operação | `{notation:"c4", level:"dynamic", scope:"X ou C", steps:[{from,to,description}]}` |
| camada de negócio / aplicação / tecnologia | `{notation:"archimate", viewpoint:"business" \| "application" \| "technology"}` |
| tudo que sustenta a oferta/produto P | `{notation:"archimate", viewpoint:"product-support", anchor:"P"}` |
| aplicações e infra por trás do processo Q | `{notation:"archimate", viewpoint:"layered", anchor:"Q", traverse:{mode:"supporters"}, granularity:"container"}` |
| matriz de dependência / impacto do componente A | `{notation:"archimate", viewpoint:"impact", anchor:"A"}` (traz a matriz, tecla M) |
| negócio × tecnologia sem a camada do meio | `{viewpoint:"custom", layers:["business","technology"], anchor:"P", derive:true}` |
| panorama com as plataformas / agrupamentos | `{notation:"c4", level:"landscape", groups:{frames:true}}` |
| interações entre os sistemas de A e de B | acrescente `groups:{only:["A","B"]}` (molduras aparecem sozinhas) |
| só o que cruza entre A e B | `groups:{only:["A","B"], crossOnly:true}` |
| sem molduras | `groups:{frames:false}` |
| como está hoje (as-is) | acrescente `status:["active","deprecated"]` |
| como fica depois das mudanças (to-be) | acrescente `status:["draft","planned","active"]` (sem `draft` para só o decidido) |
| como fica se aplicarmos este delta? | `deliver architecture/ --delta delta.json` (prévia, nada é gravado) |
| e se eu responder X nesta pergunta? | responda no plano e rode `deliver architecture/ --plan plano.json` |

**Estilo do layout ArchiMate** (`layout.style`, detalhes em `references/views.md`): sem pedido explícito,
omita-o (`auto` escolhe o mais legível). Se o prompt pedir, grave na visão:

| O usuário diz | `layout.style` |
|---|---|
| "camadas horizontais", "clássico", "linhas por tipo" | `bands` |
| "fluxo", "cadeia de dependências", "como o C4", "da esquerda para a direita" | `flow` (+ `direction:"DOWN"` se pedir faixas, `"RIGHT"` se pedir colunas) |
| "camadas com o fluxo dentro", "faixas com a cadeia" | `bands-flow` |

Toda visão precisa de `key` único e de um `title` legível. O modelo pode ter muitas conexões: a visão
recorta com scope, focus, depth, anchor, traverse, layers, granularity, collapse, include e exclude.

## Alertas do deliver/build (e o que fazer)

| Alerta | Ação |
|---|---|
| `texto ~Npx (< 14px)` | divida a visão: `focus`+`depth`, `exclude`, `granularity:"container"`, `collapse:["application-service"]`, ou `layers` menores. Em visões C4 grandes, crie uma visão por container |
| `ocupa N% da largura (< 90%)` | C4: `layout:{direction:"auto"}` ou `"DOWN"`. Se persistir, a visão é estreita demais: divida-a |
| ArchiMate com setas difíceis de seguir | veja o estilo escolhido no build; force outro com `layout:{style:"flow"|"bands"|"bands-flow"}` |
| `visão tem N nós` (> 40) | quase sempre ilegível no telão: recorte |
| visão vazia | scope/anchor errado ou faltam ligações entre camadas (veja *Erros comuns*) |
| erro de JS | bug do renderer: reporte com o HTML |

`--strict` recusa substituir a saída se houver alerta.

## Erros comuns

- **Aplicar para "ver como fica"**: use a prévia (`--delta` / `--plan`). O apply grava a base e entra no histórico.
- **`draft` × `planned`**: `draft` é "em discussão"; `planned` é "decidido, ainda não existe".
- **Direção do `uses`**: em C4 é consumidor → provedor (`cliente uses web`). A CLI converte para
  ArchiMate (`web serving cliente`). Não inverta à mão.
- **Camadas desconectadas**: travessias ArchiMate só cruzam camadas por relações. Ligue containers C4
  a application services (`realization`) e estes a processos (`serving`). Ligue a tecnologia aos
  containers (`serving`/`realization`). Sem isso, "o que sustenta o produto" para no negócio.
- **Banco como sistema**: em C4, use `c4:container` com `tags:["database"]` (vira data object). O SGBD
  (PostgreSQL, RDS) é `archimate:system-software` servindo o container da aplicação.
- **Hierarquia C4**: component dentro de container, que fica dentro de softwareSystem (`E_C4_HIERARCHY`).
- **Ids instáveis**: ids são a chave da base de conhecimento. Não os renomeie sem necessidade; use
  `sistema.container.componente`.
- **Editar o `ARCHITECTURE.md`**: é gerado e será sobrescrito. Texto autoral vai em `architecture/notes/*.md`; o
  modelo muda por delta. Recomende `archlens check` no CI ou no pre-commit.
- **Agrupador virando sistema**: "Camada de Autorização", "Plataforma de Crédito" e afins organizam sistemas;
  modele como `grouping` e preencha `group` nos membros. Um `c4:softwareSystem` falso aparece como caixa e quebra
  as relações entre as aplicações.
- **Elemento dentro do `grouping`**: não aninhe membros em `children` (nem use `parent`) de um agrupamento; use
  `"group": "<agrupamento>"`. Aninhado, ele é lido como membro com o aviso `W_GROUP_CHILD`.
- **Base no formato antigo**: comandos de leitura, `merge --plan` e as prévias funcionam; só `merge --apply`, `doc`
  e `build` recusam. Rode `archlens migrate` (com o ok do usuário).
- **Duplicata aceita sem perguntar**: `possible-duplicate` é sempre pergunta ao usuário. Um `same` errado funde
  dois elementos diferentes.
- **Assumir o sistema pelo nome do repositório**: `terminus-*` é só um indício; pergunte.
- **Aplicar sem olhar os `retired` sugeridos** por uma nova leitura: confirme um a um.
- **Visão gigante**: um diagrama com 60 nós não comunica nada. Prefira várias visões, que as setas
  ←/→ encadeiam como slides.

## Referências

- `references/merge.md`: delta, plano, classes, respostas, erros do merge, proveniência, ciclo de vida e histórico
- `references/notation.md`: DSL JSON completa (elementos, relações, campos, exemplos)
- `references/views.md`: view specs, travessia, derivação, granularidade, layout, animação
- `references/archimate.md`: catálogo ArchiMate 3.2, regras de relacionamento, direção de suporte
- `references/c4.md`: níveis C4, mapeamento para ArchiMate, elevação de relações
- `references/free-text.md`: como extrair o modelo de texto livre
- `references/repo-reading.md`: `archlens scan`, leitura de repositórios, mapeamento, nova leitura e limites
- `references/knowledge-doc.md`: a pasta `architecture/`, o `ARCHITECTURE.md` gerado, `check` e `migrate`
- `docs/GUIA.md`: guia do usuário (apresentação, atalhos, exemplos)
- `examples/`: `loja-online` (DSL completa, 13 visões) e `telemedicina` (texto livre + `delta-01.json`/`plano-01.json`,
  uma rodada de merge com duplicata, `deprecated`/`planned` e a visão to-be)
