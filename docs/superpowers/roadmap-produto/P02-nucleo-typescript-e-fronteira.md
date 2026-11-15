# P02 — Núcleo em TypeScript com fronteira pública

**Linha:** v1 · **Tamanho:** G · **Depende de:** P00 · **Desbloqueia:** P03, P04, P13, P17

## Objetivo

O núcleo (`scripts/lib/`, CLI) passa a ter tipos verificados, e a GUI consome o núcleo por **uma fronteira pública
declarada**, não por 29 módulos internos.

## Evidência

- 64 módulos `.mjs` sem tipos; só `apps/gui/web` passa por `tsc`.
- O servidor da GUI importa 29 módulos de `scripts/lib/` por caminho relativo, em 16 arquivos (fora os testes). Entre
  eles: `api`, `query`, `merge`, `store/index`, `store/ops`, `store/contract`, `registry`, `model`, `view-build`,
  `render`, `layout`, `apply-flow`, `build`, `preview`, `scan/*`. Liste o conjunto atual com
  `grep -rh "scripts/lib/" apps/gui/server --include=*.mjs`.
- Os formatos (`raw`, `model`, `delta`, `plan`, `spec`, `ctx`, operações do store) são descritos em comentários e nos
  JSON Schemas gerados por `scripts/gen-schemas.mjs`.
- **Restrição dura:** o plugin instalado roda direto com `node`, sem `node_modules` e sem build (README, seção
  "Atualização"). As skills chamam `"$ARCHLENS/bin/archlens"`.

## Escopo

1. **Fronteira primeiro.** Um ponto de entrada do núcleo (por exemplo `scripts/lib/index` ou um pacote `core`) que
   exporta só o que a GUI e a CLI usam. A GUI passa a importar dele. Um teste ou regra de lint proíbe import profundo
   a partir de `apps/`.
2. **Tipos dos formatos.** Tipos para base, modelo normalizado, delta, plano, spec de visão, contrato do conector,
   resultado de `buildView`/`viewData`. Uma fonte só para tipos e JSON Schemas (hoje os schemas são gerados à parte).
3. **Conversão gradual** por pasta, das folhas para a raiz: `registry`, `model`, `validate` → `query*` → `merge` →
   `store/` → `render`/`layout` → CLI. Cada etapa é um PR com a suíte verde.
4. **`strict`** ligado no fim; `any` só com justificativa.
5. **Reorganização de pastas** (opcional neste plano): tirar o núcleo de `scripts/` para um nome que comunique a
   camada, mantendo `bin/archlens` e os caminhos que as skills usam.

## Impacto do forward-merge (linha v0 → v1)

Toda correção feita em `develop-v2` chega aqui por merge (P00). Para o git levar a correção ao arquivo certo:

- o commit que renomeia `.mjs` para `.ts` **não altera conteúdo**; as anotações de tipo vêm em commits seguintes;
- a conversão é por pasta, e cada etapa termina com um forward-merge limpo;
- a reorganização de pastas (item 5) fica **adiada até o fim da v0**: mover e renomear ao mesmo tempo quebra o
  reconhecimento de renomeação;
- arquivos que a v0 altera com frequência (ver `git log --since` em `develop-v2`) são convertidos por último.

## Fora do escopo

Quebrar `render.mjs` e a CLI (P03); tornar o store assíncrono (P04); mudar comportamento.

## Critérios de aceite

- `tsc --noEmit` passa no núcleo, na CLI e no servidor da GUI, e roda no CI.
- `apps/gui/server` não importa nenhum caminho interno do núcleo.
- O plugin instalado continua funcionando com o `node` do usuário, sem passo manual novo. Testar a instalação de
  verdade (`claude plugin install` numa pasta limpa), não só os testes.
- Nenhuma mudança de saída: `npm run examples` e `npm run ask` não alteram arquivos versionados.

## Decisões a fechar no brainstorm

- **Como rodar sem build.** Três caminhos:
  (a) `.ts` com sintaxe apagável, executado pelo próprio Node (remoção de tipos nativa, ativa por padrão a partir do
  Node 22.18; confirme na documentação do Node antes de decidir), o que sobe o mínimo de Node de 18 para 22;
  (b) compilar para `dist/` e versionar ou publicar o resultado;
  (c) JSDoc + `tsc --checkJs`, mantendo `.mjs` (não é a migração pedida, mas é o plano B se (a) e (b) não servirem).
- Se o núcleo vira um workspace npm separado (`packages/core`) e a GUI passa a depender dele por nome.
- Ordem e tamanho dos PRs; se congela outros PRs do núcleo durante a migração.
- Subir o Node mínimo para 22 é uma mudança incompatível aceitável numa major; confirmar com o dono.
- A fronteira pública do núcleo é também a base da API v1 (P17): desenhá-las juntas.
- Destino dos JSON Schemas: gerados dos tipos, ou os tipos gerados dos schemas.

## Obrigações do repositório

archlens-ask: `npm run ask` não pode mudar nada; se `scripts/gen-ask.mjs` mudar de caminho, atualizar
`portable/archlens-ask/README.md`. GUI: `npm run gui:test` e `prompt:check` a cada etapa.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` e `P02-nucleo-typescript-e-fronteira.md` na mesma pasta. Antes do
> brainstorm, liste o que cada módulo de `apps/gui/server` importa do núcleo e proponha a fronteira pública mínima.
> Verifique na documentação atual do Node o estado da execução nativa de TypeScript. Depois conduza o brainstorm das
> decisões abertas e divida o trabalho em ciclos.
