---
name: archlens
description: Use when the user wants architecture diagrams in C4 (landscape, context, container, component, dynamic) or ArchiMate (business, application, technology layers, cross-layer support or impact views), described in free text or JSON, or asks to extract new diagrams from an existing ARCHITECTURE.md knowledge base — e.g. "what supports this product/process", "dependency/impact matrix of this component", "focus on X", animated HTML for presentations.
---

# archlens

Arquitetura como **modelo**, diagramas como **consultas**. Texto livre ou DSL JSON viram um modelo
persistente (metamodelo ArchiMate, com perfil C4 por cima). O modelo mora num `ARCHITECTURE.md`
(base de conhecimento). Cada diagrama é uma *view spec* resolvida sobre esse modelo e renderizada
em HTML animado, autocontido e pronto para apresentação.

**Princípio:** nunca desenhe um diagrama "à mão". Modele uma vez e peça visões. Se falta algo na
visão, falta no modelo: corrija o modelo.

`SKILL_DIR` = pasta deste arquivo. CLI: `node $SKILL_DIR/scripts/archlens.mjs <comando>`.
Requer Node ≥ 18. A checagem visual (`deliver`/`build`) usa `playwright-core` + Chromium
(`npm install` e `npx playwright install chromium` em `SKILL_DIR`). Sem eles, a checagem é pulada com aviso.

## Fluxo

1. **Identifique a entrada**
   - **JSON DSL**: use como está → passo 2.
   - **Texto livre**: modele seguindo `references/free-text.md`. Registre `source` (trecho do texto),
     marque `inferred: true` + `confidence` no que não foi dito, e preencha `assumptions`.
     Pergunte ao usuário **só** o que bloqueia (ex.: "o ERP é interno ou SaaS externo?").
   - **`ARCHITECTURE.md` existente**: não remodele. Use-o direto (a CLI lê o bloco `archlens-json`)
     e vá para o passo 4. Para mudar o modelo, edite o JSON e regenere.
2. **Escreva/atualize `model.json`** conforme `references/notation.md`.
3. **Valide**: `archlens validate model.json`. Corrija todo `E_*`. Leia os `W_*`: `W_REL_DIRECTION`
   quase sempre indica serving/realization invertido.
4. **Traduza cada pedido em view spec** (tabela abaixo; detalhes em `references/views.md`) e
   acrescente em `views`. `archlens views model.json` lista as visões definidas e sugere outras.
5. **Gere tudo**: `archlens build model.json --out-dir <pasta>`. Isso escreve o `ARCHITECTURE.md`,
   um HTML com todas as visões (setas ←/→ navegam) e screenshots 1920×1080 / 1280×720.
6. **Leia o relatório de qualidade** e aja (seção *Alertas*). Olhe ao menos um screenshot por
   visão nova antes de entregar.
7. **Escreva a interpretação** no `ARCHITECTURE.md`, dentro dos blocos `<!-- keep:overview -->`
   (propósito, decisões, riscos) e `<!-- keep:notes -->`. O resto do documento é regenerado.
8. **Entregue**: caminhos do `.md` e do `.html`, lista de visões, premissas abertas e alertas.

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

Toda visão precisa de `key` único e de um `title` legível. O modelo pode ter muitas conexões: a visão
recorta com scope, focus, depth, anchor, traverse, layers, granularity, collapse, include e exclude.

## Alertas do deliver/build (e o que fazer)

| Alerta | Ação |
|---|---|
| `texto ~Npx (< 14px)` | divida a visão: `focus`+`depth`, `exclude`, `granularity:"container"`, `collapse:["application-service"]`, ou `layers` menores. Em visões C4 grandes, crie uma visão por container |
| `ocupa N% da largura (< 90%)` | C4: `layout:{direction:"auto"}` ou `"DOWN"`. Se persistir, a visão é estreita demais: divida-a |
| `visão tem N nós` (> 40) | quase sempre ilegível no telão: recorte |
| visão vazia | scope/anchor errado ou faltam ligações entre camadas (veja *Erros comuns*) |
| erro de JS | bug do renderer: reporte com o HTML |

`--strict` recusa substituir a saída se houver alerta.

## Erros comuns

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
- **Visão gigante**: um diagrama com 60 nós não comunica nada. Prefira várias visões, que as setas
  ←/→ encadeiam como slides.

## Referências

- `references/notation.md`: DSL JSON completa (elementos, relações, campos, exemplos)
- `references/views.md`: view specs, travessia, derivação, granularidade, layout, animação
- `references/archimate.md`: catálogo ArchiMate 3.2, regras de relacionamento, direção de suporte
- `references/c4.md`: níveis C4, mapeamento para ArchiMate, elevação de relações
- `references/free-text.md`: como extrair o modelo de texto livre
- `references/knowledge-doc.md`: estrutura do ARCHITECTURE.md e atualização incremental
- `docs/GUIA.md`: guia do usuário (apresentação, atalhos, exemplos)
- `examples/`: `loja-online` (DSL completa, 13 visões) e `telemedicina` (a partir de texto livre)
