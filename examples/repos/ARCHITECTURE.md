---
archlens: "1.0"
name: "Arquitetura"
source: architecture/
revision: 4
updated: 2026-10-04
notations: [c4, archimate]
elements: 19
relationships: 13
---

# Arquitetura

> Gerado por archlens a partir de `architecture/`. Não edite: escreva em `architecture/notes/*.md` e evolua a base com `archlens merge`.

## Visão geral

_Descreva aqui o propósito da arquitetura, o problema de negócio e as principais decisões._

## Resumo

| Camada | Elementos |
| --- | --- |
| Aplicação | 15 |
| Tecnologia | 4 |

| Tipo C4 | Quantidade |
| --- | --- |
| Software System | 5 |
| Container | 9 |

## Contexto e atores

_Nenhum._

## Modelo C4

### loja — Software System

| Container | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| pedidos | — | — | R | `loja.pedidos` |
| pedidos-db 🛢 | — | — | R | `loja.pedidos-pedidos-db` |

### financeiro — Software System

| Container | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| pagamentos | — | — | R | `financeiro.pagamentos` |
| redis | — | — | R | `financeiro.pagamentos-redis` |
| pagamentos-db 🛢 | — | — | R | `financeiro.pagamentos-pagamentos-db` |

### antifraude.acme.com — Software System (externo)

### kafka — Software System (externo)

### infra — Software System

| Container | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| pedidos 🛢 | aws_db_instance | — | R | `infra-cloud.pedidos` |
| eventos | aws_msk_cluster | — | R | `infra-cloud.eventos` |

## Camada de Aplicação

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| loja | Application Component (C4 Software System) | — | R | `loja` |
| pedidos | Application Component (C4 Container) | — | R | `loja.pedidos` |
| pedidos-db | Data Object (C4 Container) | — | R | `loja.pedidos-pedidos-db` |
| API de Pedidos | Application Interface | — | R | `loja.pedidos.api-api-de-pedidos` |
| pedido-criado | Application Component (C4 Container) | — | R | `topic.pedido-criado` |
| financeiro | Application Component (C4 Software System) | — | R | `financeiro` |
| pagamentos | Application Component (C4 Container) | — | R | `financeiro.pagamentos` |
| redis | Application Component (C4 Container) | — | R | `financeiro.pagamentos-redis` |
| pagamentos-db | Data Object (C4 Container) | — | R | `financeiro.pagamentos-pagamentos-db` |
| antifraude.acme.com ⚠︎ | Application Component (C4 Software System) | — | R | `ext.antifraude-acme-com` |
| kafka ⚠︎ | Application Component (C4 Software System) | — | R | `ext.kafka` |
| pagamento-aprovado | Application Component (C4 Container) | — | R | `topic.pagamento-aprovado` |
| infra | Application Component (C4 Software System) | — | R | `infra-cloud` |
| pedidos | Data Object (C4 Container) | — | R | `infra-cloud.pedidos` |
| eventos | Application Component (C4 Container) | — | R | `infra-cloud.eventos` |

## Camada de Tecnologia

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| PostgreSQL 16 | System Software | — | R | `tech.postgres-16` |
| Redis | System Software | — | R | `tech.redis` |
| PostgreSQL 15 | System Software | — | R | `tech.postgres-15` |
| principal | Node | — | R | `tech.aws-eks-cluster-principal` |

## Relacionamentos

| Origem | Relação | Destino | Descrição | Tecnologia |
| --- | --- | --- | --- | --- |
| PostgreSQL 16 | realization | pedidos-db | — | — |
| pedidos | usa | pedidos-db | depends_on | — |
| pedidos | realization | API de Pedidos | — | — |
| pedidos | flow | pedido-criado | publica PedidoCriado | — |
| Redis | serving | redis | — | — |
| PostgreSQL 15 | realization | pagamentos-db | — | — |
| pagamentos | usa | antifraude.acme.com | via ANTIFRAUDE_URL | — |
| pagamentos | usa | kafka | via KAFKA_BROKERS | — |
| pagamentos | usa | pedidos | via PEDIDOS_URL | — |
| pedido-criado | flow | pagamentos | assina pedido-criado | — |
| pagamentos | flow | pagamento-aprovado | publica pagamento-aprovado | — |
| pedidos | usa | pagamentos | via PAGAMENTOS_URL | — |
| eventos | serving | principal | — | — |

## Rastreabilidade

Cadeias de suporte calculadas a partir do modelo (o que sustenta cada oferta, e quem depende de cada aplicação).

### Dependências por aplicação

| Aplicação | Negócio que depende dela | Tecnologia que a sustenta |
| --- | --- | --- |
| loja | — | PostgreSQL 16 |
| pedidos | — | PostgreSQL 16 |
| pedido-criado | — | — |
| financeiro | — | PostgreSQL 16, Redis, PostgreSQL 15 |
| pagamentos | — | PostgreSQL 16 |
| redis | — | Redis |
| pagamento-aprovado | — | — |
| infra | — | — |
| eventos | — | — |

## Ciclo de vida

_Todos os elementos e relações estão ativos._

## Premissas e inferências

_Nenhuma premissa registrada._

| Item | Tipo | Confiança | Origem no texto |
| --- | --- | --- | --- |
| antifraude.acme.com | Application Component | baixa | host em ANTIFRAUDE_URL |
| kafka | Application Component | baixa | host em KAFKA_BROKERS |
| pagamentos → antifraude.acme.com | usa | — | — |
| pagamentos → kafka | usa | — | — |
| pagamentos → pedidos | usa | — | — |
| pedidos → pagamentos | usa | — | — |

## Fontes

| Tipo | Referência | Data | Itens |
| --- | --- | --- | --- |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pedidos@766f5ce · . | — | 2 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pedidos@766f5ce · docker-compose.yml | — | 5 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pedidos@766f5ce · api/openapi.yaml | — | 2 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pedidos@766f5ce · api/asyncapi.yaml | — | 2 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pagamentos@766f5ce · asyncapi.json | — | 4 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pagamentos@766f5ce · . | — | 2 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pagamentos@766f5ce · chart/Chart.yaml | — | 3 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pagamentos@766f5ce · k8s/deploy.yaml | — | 6 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pagamentos@766f5ce · chart/values.yaml | — | 2 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/infra@766f5ce · . | — | 1 |
| repo | /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/infra@766f5ce · main.tf | — | 4 |

## Visões

| key | Notação | Tipo | Escopo / âncora | Descrição |
| --- | --- | --- | --- | --- |
| `impacto-pedidos` | archimate | impact | pedidos | Impacto de Pedidos |
| `impacto-pagamentos` | archimate | impact | pagamentos | Impacto de Pagamentos |
| `impacto-infra` | archimate | impact | infra | Impacto da Infraestrutura |

## Histórico

| Data | Fonte | Resumo | Mudanças | Decisões |
| --- | --- | --- | --- | --- |
| 2026-10-04 | prompt visões de impacto do exemplo | Visões de impacto de pedidos, pagamentos e infraestrutura | +3 ~0 −0 | — |
| 2026-10-04 | repo /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/infra@766f5ce | Leitura de infra@766f5ce | +5 ~0 −0 | — |
| 2026-10-04 | repo /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pagamentos@766f5ce | Leitura de pagamentos@766f5ce | +17 ~0 −1 | duplicata descartada: tech.postgres-15 ≠ tech.postgres-16 |
| 2026-10-04 | repo /home/rodrigo/repos/github.com/expersoft/archlens/examples/repos/pedidos@766f5ce | Leitura de pedidos@766f5ce | +12 ~0 −0 | — |

## Notas

_Decisões, riscos e pendências._

## Modelo canônico

A fonte de verdade está em `architecture/`: `archlens.json` (manifesto), `model.json` ou `model/*.json` (elementos e relações), `views.json` (visões), `changelog.json` (histórico) e `notes/*.md` (texto autoral). Consulte-a com a CLI (`archlens views`, `archlens resolve`) em vez de copiar trechos daqui.
