# P03 — Decompor o render e a CLI

**Linha:** v1 · **Tamanho:** M · **Depende de:** P02 (ou ao menos da fronteira pública de P02) · **Desbloqueia:** P15

## Objetivo

Os dois maiores arquivos do núcleo deixam de concentrar responsabilidades, e o código que roda no navegador passa a
ser um módulo de verdade: com lint, tipos e teste unitário.

## Evidência

- `scripts/lib/render.mjs` (1182 linhas): desenho dos nós C4 e ArchiMate, legenda, `viewSvg`, `viewData`,
  `renderHtml`, a folha de estilos inteira e o **cliente do navegador como texto** (a partir da linha ~675: tema,
  zoom/pan, trace, story, cartões, gaveta, matriz, exportação SVG/PNG, atalhos, ponte `postMessage` do modo embutido).
- O cliente só é exercido pelo Playwright (`deliver`, e2e da GUI). Ele monta HTML com `innerHTML` em vários pontos
  (cartões, gaveta, aba de documentação do nó, matriz), com escape manual (`escH`).
- `scripts/archlens.mjs` (891 linhas): `main()` é um `switch` com 20 comandos; `migrate` ocupa ~90 linhas, `remote` e
  `store` mais ~70; `fail()` chama `process.exit` de dentro da lógica.
- Outros candidatos: `store/gbrain-mcp.mjs` (939), `layout.mjs` (863), `merge.mjs` (763).

## Escopo

1. **Cliente do diagrama em arquivo próprio**, com módulos (tema, navegação, cartões, exportação, ponte), incluído no
   HTML único no momento do render. O resultado continua sendo **um arquivo HTML autocontido**.
2. **Testes unitários do cliente** (jsdom) para escape de conteúdo, navegação entre visões e mensagens da ponte.
3. **`render` em partes:** nós C4, nós ArchiMate, arestas, legenda, página, estilos.
4. **CLI como registro de comandos:** um módulo por comando (`{ name, usage, run(args, io) }`), `main()` só roteia.
   Lógica que hoje está na CLI e é regra de negócio (por exemplo o fluxo de `migrate` e de `remote apply`) desce para
   o núcleo. Comandos devolvem resultado e código de saída; só `main()` chama `process.exit`.
5. **Avaliar** `gbrain-mcp`, `layout` e `merge` com o mesmo critério e decompor só onde houver costura clara.

## Impacto do forward-merge (linha v0 → v1)

Depois deste plano, `render.mjs` e `scripts/archlens.mjs` deixam de existir como arquivos únicos na v1. Uma correção
feita neles na v0 **não é levada pelo merge**: precisa ser refeita à mão no módulo correspondente. Por isso:

- este plano vem depois de P02 e P04 na fundação;
- o PR inclui um mapa "trecho antigo → módulo novo", usado para portar correções;
- vale decidir com o dono se ele espera a v0 entrar em fim de vida (P00).

## Fora do escopo

Mudar o visual ou o comportamento dos diagramas; trocar o layout; novos comandos.

## Critérios de aceite

- Os HTML de `npm run examples` ficam idênticos byte a byte, ou as diferenças são listadas e justificadas no PR.
- Nenhum arquivo do núcleo passa de ~400 linhas sem justificativa registrada.
- O cliente tem teste unitário cobrindo todo ponto que grava `innerHTML` com texto vindo da base.
- `tests/cli.test.mjs` passa sem alteração de asserções; o texto de ajuda e os códigos de saída não mudam.

## Decisões a fechar no brainstorm

- Como incluir o cliente no HTML sem build no plugin: ler o arquivo em tempo de render, ou gerar um módulo com o texto
  embutido e um check de frescor (como `check-ask`).
- Se o cliente vira TypeScript (precisa de etapa de compilação) ou JS com JSDoc verificado.
- Se a ponte da GUI (`apps/gui/web/src/bridge.ts`) e o cliente passam a compartilhar a definição das mensagens.

## Obrigações do repositório

GUI: o `AGENTS.md` exige avaliar a ponte do iframe (`embed`) e a forma de `viewData`; rodar `npm run gui:test` e o
e2e. archlens-ask: sem impacto se a saída não muda; confirmar com `npm run check-ask`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` e `P03-decompor-render-e-cli.md`. Mapeie as seções de
> `scripts/lib/render.mjs` e os comandos de `scripts/archlens.mjs` e proponha os cortes antes do brainstorm. A regra
> é refatorar sem mudar saída: monte primeiro o teste que compara os HTML dos exemplos.
