# P12 — Conectores remotos: neo4j, relacional, S3

**Trilha:** Funcional · **Tamanho:** G (um ciclo por conector) · **Depende de:** P04 · **Itens do roadmap:** e.4.2, e.4.3, e.4.4

## Objetivo

A base pode morar num banco de grafos, num banco relacional ou num bucket, com as mesmas garantias dos conectores de
arquivo.

## Evidência

- `docs/superpowers/roadmap.md`: e.4.2 (neo4j), e.4.3 (relacional), e.4.4 (S3), todos "depois de e.4.1", sem spec.
- Contrato em `scripts/lib/store/contract.mjs`; conectores atuais `json`, `markdown`, `gbrain`, `legacy`
  (`CONNECTOR_KINDS`). O contrato é síncrono (P04 resolve).
- O núcleo tem **zero dependências de execução** e o plugin instalado não tem `node_modules`. Drivers de banco e SDKs
  de nuvem quebram essa propriedade.
- `store convert` já converte entre conectores (`scripts/lib/store/convert.mjs`).
- A GUI tem um caminho próprio para bases remotas (`isRemote` em `apps/gui/server/bases.mjs`).

## Escopo

Para cada conector, um ciclo com: `init`, leitura, `readSubgraph`, versão por objeto ou por base, `apply`
tudo-ou-nada, histórico, `store convert` de e para ele, teste de contrato, teste de integração com o serviço real em
contêiner, documentação em `references/base.md`.

1. **S3 (e compatíveis).** O mais simples: os mesmos arquivos do conector json ou markdown num bucket; versão por
   ETag; escrita condicional para a versão otimista.
2. **Relacional (PostgreSQL primeiro).** Tabelas de elementos, relações, visões e changelog; transação no `apply`;
   versão por linha.
3. **neo4j.** Elementos como nós, relações como arestas; `readSubgraph` como consulta nativa; transação no `apply`.

## Fora do escopo

Usar o banco para responder consultas no lugar do núcleo (as travessias continuam em `query-*.mjs`). Hospedar o banco.

## Critérios de aceite

- O teste de contrato de P04 passa contra cada conector, com o serviço real rodando em contêiner no CI.
- `store convert` ida e volta (json → conector → json) devolve uma base idêntica.
- Dois `apply` concorrentes que se cruzam: um é recusado, nada fica gravado pela metade.
- Instalar o plugin sem os drivers continua funcionando para os conectores de arquivo; pedir um conector sem o driver
  dá erro com a instrução de instalação.
- A GUI abre uma base em cada conector.

## Decisões a fechar no brainstorm

- **Qual conector primeiro e para quê.** Pergunte ao dono o caso de uso concreto de cada um; sem caso de uso, o
  conector não deve ser feito. S3 resolve "base compartilhada sem git"; relacional e neo4j só se justificam se outra
  ferramenta for consultar a base por lá.
- Como distribuir drivers: dependências opcionais, pacote separado por conector, ou conectores como plugins carregados
  por nome.
- Onde ficam as credenciais (ambiente, perfil da nuvem), nunca no manifesto da base.
- Esquema relacional e de grafo: estável e documentado (outros vão consultar) ou detalhe interno.

## Obrigações do repositório

archlens-ask: copia o layout das páginas no gbrain; conectores novos não mudam isso ("sem impacto" se confirmado).
Mudança em `store/`: avaliar a GUI e rodar `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P12-conectores-remotos.md`, o spec de P04 já aprovado e
> `docs/superpowers/specs/2026-10-17-store-connectors-design.md`. Comece o brainstorm pelo caso de uso: quem vai ler
> ou gravar a base por esse conector e por que os conectores atuais não servem. Um conector por ciclo.
