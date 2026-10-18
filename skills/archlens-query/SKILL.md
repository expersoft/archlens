---
name: archlens-query
description: Use when the user wants diagrams or answers from an existing architecture knowledge base (architecture/ folder, ARCHITECTURE.md) without changing it — C4 views (landscape, context, container, component, dynamic) or ArchiMate views (business, application, technology layers, cross-layer support or impact), asked in free text or as a JSON view spec; e.g. "what supports this product/process", "dependency/impact matrix of this component", "focus on X", "tell me about system X", as-is/to-be, a layout style, animated HTML for presentations. Never writes the base; a view to keep goes to archlens-plan.
---

# archlens-query

Leia `references/base.md` antes do primeiro comando (caminhos relativos a `$ARCHLENS`).

`SKILL_DIR` = pasta deste arquivo; `ARCHLENS="$(realpath "$SKILL_DIR/../..")"` = o repositório do archlens (o `realpath` segue o link
simbólico da instalação; sem ele, o `..` sai pelo `~/.claude` e não acha o repositório). CLI: `node "$ARCHLENS/scripts/archlens.mjs" <comando>` (abaixo,
`archlens <comando>`). `$OUT` = uma pasta **fora** da base (ex.: `/tmp/archlens`).

Esta skill **nunca grava a base**: `views`, `query`, `resolve`, `render` e `deliver --view/--spec`, com a saída em
`$OUT`. Informação nova para a base, ou "como fica se…": skill archlens-plan.

## Fluxo

1. **Localize a base** (`references/base.md`). Sem base, nada a consultar: a skill archlens-plan cria a primeira.
2. **Veja o que existe**: `archlens views <base>` lista as visões definidas e sugere outras.
3. **Traduza cada pedido em view spec** (tabela abaixo; detalhes em `references/views.md`). Visão salva: `--view
   <key>`; consulta avulsa: `--spec '<json>'`.
4. **Pergunta em texto** ("o que sustenta P?", "o que depende de A?"):
   `archlens query <base> --view <key> | --spec '<json>' [--format md|json] [--out $OUT/x.md]` (elementos por camada ou
   nível, relações em frases, matriz de impacto). **"Me fale do sistema X"**:
   `archlens query <base> --element <id> [--depth N] [--via t1,t2]` (pai, filhos, relações, fontes, rodadas;
   `--depth N` inclui "Em volta"). Id desconhecido: `E_UNKNOWN_REF` com sugestões por nome e alias.
5. **Diagrama**: `archlens deliver <base> --view <key> | --spec '<json>' --out $OUT/x.html` (HTML + screenshots
   1920×1080 / 1280×720 + checagens; `--suggested` inclui as sugeridas, `--open` abre no navegador).
   `archlens resolve <base> --spec '<json>'` mostra os nós e arestas sem renderizar.
6. **Leia o relatório de qualidade** e aja (seção *Alertas*). Olhe ao menos um screenshot por visão nova.
7. **Visão que o usuário quer manter**: monte o delta
   `{"archlens-delta":"1.0","source":{"kind":"prompt","ref":…},"summary":…,"views":[<spec com key e title>]}` e passe
   à skill archlens-plan (que segue até o apply, e o build gera o diagrama salvo).
8. **Entregue**: caminhos do `.html` e/ou `.md`, as specs usadas e os alertas. Nada foi gravado na base.

## Aninhamento (ArchiMate)

Por padrão a visão ArchiMate liga pai e filho por seta de composição (losango). Pedidos como "dentro de",
"aninhado", "caixas dentro de caixas" → `"nesting": "nested"`; "com o losango", "com setas de composição" → `"edges"`.
Em diagramas grandes use `"nesting": { "mode": "nested", "depth": N }` (só os N primeiros níveis ficam dentro; abaixo
disso o elemento fica ao lado, ligado pelo losango). Detalhes em `references/views.md`.

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
| matriz de dependência / impacto do componente A | `{notation:"archimate", viewpoint:"impact", anchor:"A"}` (traz a matriz, tecla M; em texto: `query --format md`) |
| negócio × tecnologia sem a camada do meio | `{viewpoint:"custom", layers:["business","technology"], anchor:"P", derive:true}` |
| panorama com as plataformas / agrupamentos | `{notation:"c4", level:"landscape", groups:{frames:true}}` |
| interações entre os sistemas de A e de B | acrescente `groups:{only:["A","B"]}` (molduras aparecem sozinhas) |
| só o que cruza entre A e B | `groups:{only:["A","B"], crossOnly:true}` |
| sem molduras | `groups:{frames:false}` |
| containers dentro do sistema, "caixas dentro de caixas" (ArchiMate) | acrescente `nesting:"nested"` (ou `nesting:{mode:"nested", depth:1}`) |
| C4 sem as setas derivadas por serviços e interfaces | acrescente `derive:false` |
| como está hoje (as-is) | acrescente `status:["active","deprecated"]` |
| como fica depois das mudanças (to-be) | acrescente `status:["draft","planned","active"]` (sem `draft` para só o decidido) |
| como fica se aplicarmos este delta? / e se eu responder X? | prévia de delta ou plano: skill archlens-plan |

**Estilo do layout ArchiMate** (`layout.style`, detalhes em `references/views.md`): sem pedido explícito,
omita-o (`auto` escolhe o mais legível). Se o prompt pedir, ponha na spec (e, para manter, na visão salva):

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
| ArchiMate com setas difíceis de seguir | veja o estilo escolhido no deliver; force outro com `layout:{style:"flow"|"bands"|"bands-flow"}` |
| `visão tem N nós` (> 40) | quase sempre ilegível no telão: recorte |
| visão vazia | scope/anchor errado ou faltam ligações entre camadas (veja *Erros comuns*) |
| erro de JS | bug do renderer: reporte com o HTML |

`--strict` recusa substituir a saída se houver alerta.

## Erros comuns

- **Gravar a visão direto na base**: esta skill não grava; visão a manter vira delta com `views` na skill
  archlens-plan.
- **Desenhar à mão o que falta no modelo**: se falta algo na visão, falta no modelo; leve a informação à skill
  archlens-plan.
- **Visão gigante**: um diagrama com 60 nós não comunica nada. Prefira várias visões, que as setas
  ←/→ encadeiam como slides.
- **Visão vazia por camadas desconectadas**: travessias ArchiMate só cruzam camadas por relações (container →
  application service por `realization`, service → processo por `serving`, tecnologia → container por
  `serving`/`realization`). Sem elas, "o que sustenta o produto" para no negócio: corrija o modelo pela skill
  archlens-plan.
- **Atravessar por propriedade**: propriedade só filtra; "tudo da squad Checkout" pede um elemento (ver
  *Propriedades* em `references/base.md`).
- **Saída dentro da base**: `--out` vai para `$OUT`, fora da pasta `architecture/` (os diagramas salvos são do build).

## Referências

- `references/base.md`: base, propriedades, regras comuns e a lista completa de referências
- `references/views.md`: view specs, travessia, derivação, granularidade, layout, animação, consulta em markdown
- `references/archimate.md`: catálogo ArchiMate 3.2 e direção de suporte
- `references/c4.md`: níveis C4 e elevação de relações
