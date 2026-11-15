# P12 — Conectores remotos: neo4j, relacional, S3

**Linha:** v1 · **Tamanho:** G (um ciclo por conector) · **Depende de:** P04 · **Desbloqueia:** P16 · **Itens do roadmap:** e.4.2, e.4.3, e.4.4

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

1. **Relacional (PostgreSQL).** Passa a ser o primeiro: o dono quer o PostgreSQL como **repositório principal**
   de um servidor central (R3, R4). Tabelas de elementos, relações, visões e changelog; transação no `apply`; versão
   por linha; um fluxo de mudanças que a replicação (P16) possa consumir. **Multi-organização desde o primeiro
   esquema (D1):** toda tabela tem `org_id`; Row-Level Security habilitada e forçada; o papel da aplicação não pode
   contorná-la; a organização é declarada na conexão a cada transação; no self-hosted existe uma organização só.
2. **S3 (e compatíveis).** Os mesmos arquivos do conector json ou markdown num bucket; versão por ETag; escrita
   condicional para a versão otimista.
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
- PostgreSQL: uma suíte de isolamento grava bases de duas organizações e tenta ler, alterar e apagar as de uma com a
  sessão da outra, por SQL direto com o papel da aplicação e pelo conector; todas as tentativas falham. Esquecer de
  declarar a organização na conexão resulta em zero linhas, não em todas.
- Tudo roda só com PostgreSQL e armazenamento compatível com S3 comuns, sem extensão ou serviço de uma nuvem (D8).

## Decisões a fechar no brainstorm

- **Caso de uso de cada conector.** O do PostgreSQL está dado (primário do servidor central). Para S3 e neo4j,
  pergunte ao dono o caso concreto; sem ele, o conector não deve ser feito. Com réplicas (P16), neo4j faz mais
  sentido como **destino de réplica** para consulta por outras ferramentas do que como primário.
- Como distribuir drivers: dependências opcionais, pacote separado por conector, ou conectores como plugins carregados
  por nome.
- Onde ficam as credenciais (ambiente, perfil da nuvem), nunca no manifesto da base.
- Esquema relacional e de grafo: estável e documentado (outros vão consultar) ou detalhe interno.
- Como a organização chega à conexão com pool (variável de sessão por transação) sem vazar entre requisições.
- Migrações de esquema: ferramenta e como rodam em implantação com várias réplicas.

## Obrigações do repositório

archlens-ask: copia o layout das páginas no gbrain; conectores novos não mudam isso ("sem impacto" se confirmado).
Mudança em `store/`: avaliar a GUI e rodar `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P12-conectores-remotos.md`, o spec de P04 já aprovado e
> `docs/superpowers/specs/2026-10-17-store-connectors-design.md`. Comece o brainstorm pelo caso de uso: quem vai ler
> ou gravar a base por esse conector e por que os conectores atuais não servem. Um conector por ciclo.
