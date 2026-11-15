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

## Isolamento por organização em cada conector

Decisão D1 (RLS no PostgreSQL) com as salvaguardas aceitas pelo dono em 2026-11-15. Nenhum outro conector tem algo
equivalente à RLS; cada um isola de um jeito, e a garantia do serviço é a do mais fraco.

**PostgreSQL**

1. **Dois papéis:** um de migração, dono das tabelas; um da aplicação, sem `BYPASSRLS` e sem ser dono de nada. RLS
   habilitada **e forçada** em toda tabela.
2. **Organização por transação, declarada uma vez.** Toda unidade de trabalho passa por um único invólucro do
   conector (algo como `withOrg(orgId, fn)`) que: pega a conexão do pool, abre a transação, executa
   `select set_config('app.org_id', $1, true)` como primeira instrução, roda `fn` e encerra. O terceiro argumento
   `true` faz o valor valer só até o fim da transação: ele some sozinho no `commit` ou no `rollback`, e a conexão
   volta limpa ao pool. **Não** é um `set` antes de cada consulta, e **não** é um `set` de sessão.
   - Nunca `SET` de sessão (`set_config(..., false)`): o valor ficaria na conexão devolvida ao pool e valeria para
     quem a pegasse depois; com um pool em modo transação (PgBouncer) ele pode cair na conexão de outro cliente.
   - `set_config` com parâmetro, não `SET LOCAL` com texto concatenado: `SET` não aceita parâmetro.
   - Leituras também rodam dentro de transação. Fora de uma, o valor não existe e a política devolve zero linhas.
   - As políticas usam `current_setting('app.org_id', true)`: sem valor, comparam com nulo e nada aparece.
   - O código de aplicação não tem acesso ao pool, só ao invólucro.
3. **Teste de esquema:** falha se existir tabela sem `org_id`, sem política, sem RLS forçada, ou índice e restrição
   de unicidade que não comecem por `org_id`.
4. **Modo dedicado sem código novo.** Como o conector é resolvido por organização (P17), uma organização pode ter o
   primário apontando para **outro** PostgreSQL. O mesmo esquema com RLS roda lá com uma organização só. É a saída
   para cliente que exige isolamento físico ou residência de dados.

**Demais conectores**

| Conector | Fronteira de isolamento | Regra |
|---|---|---|
| git e gbrain git | repositório (ou prefixo) e credencial por organização | clone em área própria da organização; a credencial vem só do provedor de segredos |
| S3 e compatíveis | prefixo por organização; bucket próprio no modo dedicado | os ids de organização e de base são validados antes de compor a chave (sem `..`, sem barra); credencial restrita ao prefixo onde o provedor permitir |
| neo4j | **um banco por organização** | só como destino de réplica; proibido grafo compartilhado com filtro por propriedade, que não tem imposição alguma. Confirmar na documentação atual do neo4j em que edição existem vários bancos |
| gbrain MCP | o servidor gbrain | o archlens não consegue garantir nem testar; fora do SaaS como primário |
| json e markdown | pasta por organização | só self-hosted; ids validados contra travessia de caminho |

A memória do servidor conta como mais um lugar: modelo carregado e cache de visões têm a organização na chave (P17).

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
- PostgreSQL: depois de uma transação da organização A, a mesma conexão do pool usada sem declarar organização não
  enxerga nada de A. O teste roda também com um pool em modo transação na frente do banco.
- PostgreSQL: o teste de esquema (tabela sem política, índice sem `org_id`) roda no CI.
- Uma organização em modo dedicado (outro PostgreSQL) funciona só com configuração, sem ramo de código.
- S3 e arquivos: um id de organização ou de base com `..` ou barra é recusado antes de qualquer acesso.
- Tudo roda só com PostgreSQL e armazenamento compatível com S3 comuns, sem extensão ou serviço de uma nuvem (D8).

## Decisões a fechar no brainstorm

- **Caso de uso de cada conector.** O do PostgreSQL está dado (primário do servidor central). Para S3 e neo4j,
  pergunte ao dono o caso concreto; sem ele, o conector não deve ser feito. Com réplicas (P16), neo4j faz mais
  sentido como **destino de réplica** para consulta por outras ferramentas do que como primário.
- Como distribuir drivers: dependências opcionais, pacote separado por conector, ou conectores como plugins carregados
  por nome.
- Onde ficam as credenciais (ambiente, perfil da nuvem), nunca no manifesto da base.
- Esquema relacional e de grafo: estável e documentado (outros vão consultar) ou detalhe interno.
- Uma requisição que precise de mais de uma transação: o invólucro declara de novo em cada uma; decidir se alguma
  operação longa (replicação, `build`) precisa de outro desenho.
- Custo da viagem extra do `set_config` por transação: medir no P05; pode ir no mesmo envio da primeira consulta.
- Particionar as tabelas por `org_id` desde já (facilita mover um tenant grande para o modo dedicado) ou só quando
  houver necessidade.
- Migrações de esquema: ferramenta e como rodam em implantação com várias réplicas.

## Obrigações do repositório

archlens-ask: copia o layout das páginas no gbrain; conectores novos não mudam isso ("sem impacto" se confirmado).
Mudança em `store/`: avaliar a GUI e rodar `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P12-conectores-remotos.md`, o spec de P04 já aprovado e
> `docs/superpowers/specs/2026-10-17-store-connectors-design.md`. Comece o brainstorm pelo caso de uso: quem vai ler
> ou gravar a base por esse conector e por que os conectores atuais não servem. Um conector por ciclo.
