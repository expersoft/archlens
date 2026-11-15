# P04 — Contrato de conector assíncrono

**Linha:** v1 · **Tamanho:** G · **Depende de:** P02 · **Desbloqueia:** P12, P16, P17

## Objetivo

O contrato do store aceita conectores que fazem E/S assíncrona (rede, banco), e a GUI deixa de bloquear o servidor
enquanto lê ou grava uma base.

## Evidência

- `scripts/lib/store/contract.mjs`: `CONNECTOR_METHODS = ['describe','read','readDoc','readSubgraph',
  'version','objectVersions','apply','history']`, todos síncronos.
- `scripts/lib/`: 54 chamadas `readFileSync`/`writeFileSync`; git por `spawnSync` em `store/gbrain-git.mjs`,
  `store/config.mjs`, `store/convert.mjs`, `scan/git.mjs`.
- `apps/gui/server/bases.mjs`: `readStore` lança "conector assíncrono ainda não suportado pela GUI" se `read()`
  devolver uma promise; bases gbrain são lidas num worker thread para o `git fetch` não travar as requisições; o
  primeiro carregamento é síncrono. O `apply` da GUI e o clone de repositório também foram para workers
  (`plan/apply-worker.mjs`, `plan/repo-worker.mjs`): três contornos para o mesmo problema.
- `scripts/lib/api.mjs` (`plan`, `finalize`, `apply`, `query`) chama `store.read()` de forma síncrona.
- O modo MCP do gbrain já é um caso de E/S que não cabe no contrato: o CLI prepara pedidos e confere recibos
  (`--read-check`, `--receipts`, `--resume`, `--undo`).

## Escopo

1. **Contrato v3:** métodos que tocam E/S devolvem promise. Definir o que continua síncrono (por exemplo `describe`).
2. **Adaptar os conectores atuais** (json, markdown, gbrain git, gbrain MCP, legado) e o teste de contrato
   (`tests/store-contract.test.mjs`), que passa a ser a régua para conectores novos.
3. **Propagar `await`** por `api.mjs`, `apply-flow.mjs`, `build.mjs`, CLI e servidor da GUI.
4. **GUI:** avaliar quais dos três workers deixam de ser necessários com o conector assíncrono; carregamento inicial
   assíncrono; manter a garantia de que a versão e o conteúdo vêm da mesma leitura.
5. **Garantias preservadas:** versão otimista por objeto, tudo-ou-nada na gravação (`store/atomic.mjs`), erros `E_STORE_*`.
6. **Guia "como escrever um conector"** em `references/` ou `docs/`, com o teste de contrato como checklist.

## Fora do escopo

Escrever conectores novos (P12). Mudar o formato 2.0 da base.

## Critérios de aceite

- O teste de contrato roda igual contra todos os conectores, incluindo um conector de teste em memória com latência
  artificial.
- Com uma base lenta (latência artificial de 2 s), outras rotas da GUI continuam respondendo.
- `apply` concorrente de dois planos que se cruzam: um é recusado com `E_STORE_CONFLICT`, nada fica gravado pela metade.
- Saída da CLI inalterada nos exemplos.

## Decisões a fechar no brainstorm

- Tudo assíncrono, ou contrato duplo (síncrono para arquivo, assíncrono para remoto) com um adaptador.
- Leitura parcial como caminho principal: hoje quase tudo lê a base inteira; `readSubgraph` existe mas é pouco usado.
  Conectores de grafo (neo4j) só valem a pena se as consultas pedirem subgrafos. Decidir se isso entra aqui ou em P12.
- Se o modo MCP do gbrain passa a caber no contrato novo ou continua como fluxo à parte.
- Dividir em ciclos: (1) contrato e conectores de arquivo, (2) gbrain, (3) GUI.
- O contrato precisa servir a três usos novos: conectores de banco (P12), o **conector remoto** por HTTP (P17) e a
  **replicação** primário → réplicas (P16). Prever no contrato: fluxo de mudanças desde uma versão, marcação de
  conector somente leitura e leitura condicional por versão.
- **Contexto por chamada (D1, D2):** o conector recebe a organização e a credencial em cada abertura, nunca de
  variável global, para que o PostgreSQL declare o `org_id` da transação e os conectores de repositório usem a
  credencial certa.

## Obrigações do repositório

archlens-ask: copia o layout das páginas no gbrain; se o layout não mudar, "sem impacto". GUI: mudança em `store/`
exige avaliar impacto e rodar `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P04-store-assincrono.md`,
> `docs/superpowers/specs/2026-10-17-store-connectors-design.md` e
> `docs/superpowers/specs/2026-10-18-gbrain-connector-design.md`. Levante todos os pontos que chamam o store de forma
> síncrona e proponha o contrato v3 antes do brainstorm.
