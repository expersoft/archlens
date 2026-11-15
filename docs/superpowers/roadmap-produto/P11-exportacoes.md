# P11 — Exportações

**Trilha:** Funcional · **Tamanho:** M · **Depende de:** P01 · **Item do roadmap:** d

## Objetivo

O que está no archlens sai em formatos que outras ferramentas leem: diagramas como texto para wikis e a base inteira
para ferramentas de arquitetura.

## Evidência

- `docs/superpowers/roadmap.md`, item d, status "depois", sem spec: Structurizr DSL, PlantUML/Mermaid, ArchiMate Open
  Exchange.
- Saídas atuais: HTML animado, SVG e PNG (pelo cliente), markdown e JSON (`query --format md|json`).
- O archlens-ask já produz Mermaid, mas como regra de texto para o assistente (`portable/archlens-ask/`), não como
  código do núcleo.
- O modelo é ArchiMate 3.2 com perfil C4 (`scripts/lib/registry.mjs`: `ELEMENT_TYPES`, `RELATIONSHIP_TYPES`), o que
  torna o mapeamento para Open Exchange e para Structurizr quase direto.

## Escopo

1. **Arquitetura de exportadores:** uma interface só (`(model, view|null, opções) → texto`) e um comando
   (`archlens export <base> --format … [--view …]`), para que formatos novos sejam um módulo e um teste.
2. **Mermaid** por visão (C4 e flowchart), para colar em markdown, GitHub e wikis.
3. **PlantUML** por visão (C4-PlantUML e a biblioteca ArchiMate).
4. **Structurizr DSL:** o workspace inteiro (modelo C4 e as visões salvas).
5. **ArchiMate Model Exchange File Format** (XML do Open Group): modelo inteiro e visões, que abre no Archi.
6. **GUI:** opção de exportar a visão atual nos formatos de texto.
7. **`ARCHITECTURE.md`:** opção de embutir Mermaid ao lado dos links para os diagramas, para o documento ser legível
   no GitHub sem abrir o HTML.

## Fora do escopo

Importar desses formatos (vale um plano próprio depois; a entrada hoje é texto livre, DSL JSON e leitura de
repositório). Fidelidade de layout: os formatos de texto deixam o layout com a ferramenta de destino.

## Critérios de aceite

- Cada formato tem teste de snapshot sobre fixtures congeladas e um teste de validade com a ferramenta real quando
  ela puder rodar no CI (Mermaid CLI, PlantUML, validação do XML contra o XSD do Open Group, Structurizr CLI).
- O arquivo Open Exchange de `examples/loja-online` abre no Archi com todos os elementos e relações.
- O que o formato de destino não representa (por exemplo relações derivadas, ciclo de vida, proveniência) é listado
  como aviso na saída, nunca descartado em silêncio.
- Exportar não grava nada na base.

## Decisões a fechar no brainstorm

- Ordem dos formatos, conforme as ferramentas que o time do dono já usa.
- Como levar o que não cabe: propriedades do Open Exchange, `tags`/`properties` do Structurizr, ou perda documentada.
- Se o Mermaid do núcleo substitui as regras de Mermaid do archlens-ask ou convivem. Lembrete do `AGENTS.md`: o
  núcleo manda, o archlens-ask acompanha.
- Se a exportação entra na skill `archlens-query` como mais um formato de resposta.

## Obrigações do repositório

archlens-ask: avaliar; se o Mermaid do núcleo divergir das regras do pacote, alinhar o pacote. Mudança na skill
`archlens-query` pede `npm --prefix apps/gui run prompt`. `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P11-exportacoes.md`, `references/notation.md` e
> `scripts/lib/registry.mjs`. Proponha a tabela de mapeamento de tipos para cada formato antes do brainstorm. Consulte
> a especificação atual de cada formato; não confie na memória.
