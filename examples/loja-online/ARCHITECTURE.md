---
archlens: "1.0"
name: "Loja Online"
generated: 2026-09-24
notations: [c4, archimate]
elements: 60
relationships: 78
---

# Loja Online

> Base de conhecimento gerada pela skill **archlens**. As tabelas são derivadas do bloco
> `archlens-json` no fim do documento, que é a fonte de verdade: edite o JSON e regenere.
> Texto entre marcadores `<!-- keep:... -->` é preservado ao regenerar.

## Visão geral

<!-- keep:overview -->
Plataforma de e-commerce B2C: vitrine web e app, checkout com antifraude e gateway externo, faturamento e expedição no ERP legado. O modelo junta a visão C4 dos sistemas com as camadas ArchiMate de negócio, aplicação e tecnologia, para rastrear ofertas e processos até a infraestrutura.
<!-- /keep:overview -->

## Resumo

| Camada | Elementos |
| --- | --- |
| Motivação | 2 |
| Negócio | 17 |
| Aplicação | 29 |
| Tecnologia | 12 |

| Tipo C4 | Quantidade |
| --- | --- |
| Person | 4 |
| Software System | 6 |
| Container | 10 |
| Component | 5 |

## Contexto e atores

| Ator | Tipo | Descrição | id |
| --- | --- | --- | --- |
| Cliente | Business Actor | Compra produtos pela web ou pelo app | `cliente` |
| Atendente SAC | Business Actor | Resolve dúvidas e problemas de pedidos | `atendente` |
| Operador de Logística | Business Actor | Separa e despacha pedidos | `operador` |
| Comprador | Business Role | — | `br-comprador` |

## Modelo C4

### Plataforma de E-commerce — Software System

Vitrine, carrinho e checkout

| Container | Tecnologia | Descrição | id |
| --- | --- | --- | --- |
| Web Storefront | Next.js | Vitrine e checkout web | `loja.web` |
| App Mobile | React Native | App iOS/Android | `loja.app` |
| BFF | Node.js / GraphQL | Agrega APIs para os canais | `loja.bff` |
| API de Pedidos | Java / Spring Boot | Carrinho, checkout e ciclo de vida do pedido | `loja.pedidos` |
| API de Catálogo | Go | Produtos, preços e estoque | `loja.catalogo` |
| Índice de Busca 🛢 | Elasticsearch | Busca textual de produtos | `loja.busca` |
| Cache de Carrinho 🛢 | Redis | Carrinhos ativos | `loja.cache` |
| DB Pedidos 🛢 | PostgreSQL | Pedidos e pagamentos | `loja.db-pedidos` |
| DB Catálogo 🛢 | MongoDB | Produtos e atributos | `loja.db-catalogo` |
| Barramento de Eventos | Kafka | Tópicos de pedidos e estoque | `loja.eventos` |

#### Componentes de API de Pedidos

| Componente | Tecnologia | Descrição | id |
| --- | --- | --- | --- |
| Checkout Controller | Spring MVC | Orquestra o fechamento do pedido | `loja.pedidos.checkout` |
| Carrinho Service | Spring Bean | Itens, preços e cupons | `loja.pedidos.carrinho` |
| Pagamento Adapter | Spring Bean | Antifraude + autorização no gateway | `loja.pedidos.pagamento` |
| Pedido Repository | Spring Data JPA | Persistência de pedidos | `loja.pedidos.repo` |
| Publicador de Eventos | Kafka client | Publica eventos de domínio | `loja.pedidos.eventos` |

### ERP — Software System

Faturamento, fiscal e expedição (legado on-premises)

### CRM — Software System (externo)

Atendimento (SaaS)

### Gateway de Pagamentos — Software System (externo)

Autoriza cartões e Pix

### Serviço Antifraude — Software System (externo)

Score de risco da transação

### API da Transportadora — Software System (externo)

Coleta e rastreio

## Camada de Motivação

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| Reduzir abandono de carrinho | Goal | — | `goal-abandono` |
| Checkout < 2s (p95) | Requirement | — | `req-latencia` |

## Camada de Negócio

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| Cliente | Business Actor (C4 Person) | Compra produtos pela web ou pelo app | `cliente` |
| Atendente SAC | Business Actor (C4 Person) | Resolve dúvidas e problemas de pedidos | `atendente` |
| Operador de Logística | Business Actor (C4 Person) | Separa e despacha pedidos | `operador` |
| Venda Online | Product | Oferta principal: comprar pela web/app e receber em casa | `prod-venda` |
| Entrega Expressa | Product | Entrega em até 24h nas capitais | `prod-expressa` |
| Termos de Compra | Contract | — | `ct-termos` |
| Compra online | Business Service | — | `bs-compra` |
| Pagamento seguro | Business Service | — | `bs-pagamento` |
| Entrega do pedido | Business Service | — | `bs-entrega` |
| Atendimento pós-venda | Business Service | — | `bs-atendimento` |
| Comprador | Business Role | — | `br-comprador` |
| Checkout | Business Process | Do carrinho ao pedido pago | `bp-checkout` |
| Faturamento | Business Process | — | `bp-faturamento` |
| Expedição | Business Process | — | `bp-expedicao` |
| Tratar solicitação | Business Process | — | `bp-atendimento` |
| Pedido | Business Object | — | `bo-pedido` |
| Nota Fiscal | Business Object | — | `bo-nota` |

## Camada de Aplicação

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| Plataforma de E-commerce | Application Component (C4 Software System) | Vitrine, carrinho e checkout | `loja` |
| Web Storefront | Application Component (C4 Container) | Vitrine e checkout web | `loja.web` |
| App Mobile | Application Component (C4 Container) | App iOS/Android | `loja.app` |
| BFF | Application Component (C4 Container) | Agrega APIs para os canais | `loja.bff` |
| API de Pedidos | Application Component (C4 Container) | Carrinho, checkout e ciclo de vida do pedido | `loja.pedidos` |
| Checkout Controller | Application Component (C4 Component) | Orquestra o fechamento do pedido | `loja.pedidos.checkout` |
| Carrinho Service | Application Component (C4 Component) | Itens, preços e cupons | `loja.pedidos.carrinho` |
| Pagamento Adapter | Application Component (C4 Component) | Antifraude + autorização no gateway | `loja.pedidos.pagamento` |
| Pedido Repository | Application Component (C4 Component) | Persistência de pedidos | `loja.pedidos.repo` |
| Publicador de Eventos | Application Component (C4 Component) | Publica eventos de domínio | `loja.pedidos.eventos` |
| API de Catálogo | Application Component (C4 Container) | Produtos, preços e estoque | `loja.catalogo` |
| Índice de Busca | Data Object (C4 Container) | Busca textual de produtos | `loja.busca` |
| Cache de Carrinho | Data Object (C4 Container) | Carrinhos ativos | `loja.cache` |
| DB Pedidos | Data Object (C4 Container) | Pedidos e pagamentos | `loja.db-pedidos` |
| DB Catálogo | Data Object (C4 Container) | Produtos e atributos | `loja.db-catalogo` |
| Barramento de Eventos | Application Component (C4 Container) | Tópicos de pedidos e estoque | `loja.eventos` |
| ERP | Application Component (C4 Software System) | Faturamento, fiscal e expedição (legado on-premises) | `erp` |
| CRM | Application Component (C4 Software System) | Atendimento (SaaS) | `crm` |
| Gateway de Pagamentos | Application Component (C4 Software System) | Autoriza cartões e Pix | `gateway` |
| Serviço Antifraude | Application Component (C4 Software System) | Score de risco da transação | `antifraude` |
| API da Transportadora | Application Component (C4 Software System) | Coleta e rastreio | `transportadora` |
| Serviço de Checkout | Application Service | — | `as-checkout` |
| Serviço de Catálogo | Application Service | — | `as-catalogo` |
| Serviço de Pagamento | Application Service | — | `as-pagamento` |
| Serviço de Faturamento | Application Service | — | `as-faturamento` |
| Serviço de Logística | Application Service | — | `as-logistica` |
| Consulta de Pedidos | Application Service | — | `as-consulta` |
| Registro de Pedido | Data Object | — | `do-pedido` |
| Registro de Produto | Data Object | — | `do-produto` |

## Camada de Tecnologia

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| Cluster Kubernetes (EKS) | Node | — | `tn-k8s` |
| Hospedagem de contêineres | Technology Service | — | `ts-hosting` |
| Mensageria | Technology Service | — | `ts-mensageria` |
| PostgreSQL 16 (RDS) | System Software | — | `ss-postgres` |
| MongoDB Atlas | System Software | — | `ss-mongo` |
| Redis (ElastiCache) | System Software | — | `ss-redis` |
| Apache Kafka (MSK) | System Software | — | `ss-kafka` |
| Elasticsearch | System Software | — | `ss-elastic` |
| CDN CloudFront | Node | — | `tn-cdn` |
| Servidor SAP (on-premises) | Node | — | `tn-sap` |
| VPN site-to-site | Communication Network | — | `cn-vpn` |
| pedidos-api.jar | Artifact | — | `art-pedidos` |

## Relacionamentos

| Origem | Relação | Destino | Descrição | Tecnologia |
| --- | --- | --- | --- | --- |
| Cliente | usa | Web Storefront | Navega e compra | HTTPS |
| Cliente | usa | App Mobile | Compra pelo celular | HTTPS |
| Web Storefront | usa | BFF | Consulta e envia pedidos | GraphQL |
| App Mobile | usa | BFF | Consulta e envia pedidos | GraphQL |
| BFF | usa | API de Catálogo | Consulta produtos | REST |
| BFF | usa | Índice de Busca | Busca textual | HTTP |
| BFF | usa | Carrinho Service | Gerencia carrinho | REST |
| BFF | usa | Checkout Controller | Fecha pedido | REST |
| API de Catálogo | usa | DB Catálogo | Lê e grava produtos | MongoDB wire |
| API de Catálogo | usa | Índice de Busca | Indexa produtos | HTTP |
| Checkout Controller | usa | Carrinho Service | Obtém itens | — |
| Checkout Controller | usa | Pagamento Adapter | Solicita autorização | — |
| Checkout Controller | usa | Pedido Repository | Persiste pedido | — |
| Checkout Controller | usa | Publicador de Eventos | Publica PedidoCriado | — |
| Carrinho Service | usa | Cache de Carrinho | Lê e grava carrinho | RESP |
| Pedido Repository | usa | DB Pedidos | Lê e grava pedidos | JDBC |
| Pagamento Adapter | usa | Serviço Antifraude | Avalia risco | HTTPS |
| Pagamento Adapter | usa | Gateway de Pagamentos | Autoriza pagamento | HTTPS |
| Publicador de Eventos | usa | Barramento de Eventos | Publica eventos | Kafka |
| ERP | usa | Barramento de Eventos | Consome pedidos pagos | Kafka |
| ERP | usa | API da Transportadora | Solicita coleta | REST |
| CRM | usa | API de Pedidos | Consulta pedidos | REST |
| Atendente SAC | usa | CRM | Atende clientes | — |
| Operador de Logística | usa | ERP | Gerencia expedição | — |
| Venda Online | aggregation | Compra online | — | — |
| Venda Online | aggregation | Pagamento seguro | — | — |
| Venda Online | aggregation | Entrega do pedido | — | — |
| Venda Online | aggregation | Atendimento pós-venda | — | — |
| Venda Online | aggregation | Termos de Compra | — | — |
| Entrega Expressa | aggregation | Entrega do pedido | — | — |
| Checkout | realization | Compra online | — | — |
| Checkout | realization | Pagamento seguro | — | — |
| Expedição | realization | Entrega do pedido | — | — |
| Tratar solicitação | realization | Atendimento pós-venda | — | — |
| Checkout | triggering | Faturamento | — | — |
| Faturamento | triggering | Expedição | — | — |
| Compra online | serving | Comprador | — | — |
| Cliente | assignment | Comprador | — | — |
| Atendente SAC | assignment | Tratar solicitação | — | — |
| Operador de Logística | assignment | Expedição | — | — |
| Checkout | access | Pedido | — | — |
| Faturamento | access | Pedido | — | — |
| Faturamento | access | Nota Fiscal | — | — |
| Checkout Controller | realization | Serviço de Checkout | — | — |
| Serviço de Checkout | serving | Checkout | — | — |
| API de Catálogo | realization | Serviço de Catálogo | — | — |
| Serviço de Catálogo | serving | Checkout | — | — |
| Pagamento Adapter | realization | Serviço de Pagamento | — | — |
| Serviço de Pagamento | serving | Checkout | — | — |
| ERP | realization | Serviço de Faturamento | — | — |
| Serviço de Faturamento | serving | Faturamento | — | — |
| ERP | realization | Serviço de Logística | — | — |
| Serviço de Logística | serving | Expedição | — | — |
| API de Pedidos | realization | Consulta de Pedidos | — | — |
| Consulta de Pedidos | serving | Tratar solicitação | — | — |
| CRM | serving | Tratar solicitação | — | — |
| Registro de Pedido | realization | Pedido | — | — |
| Pedido Repository | access | Registro de Pedido | — | — |
| API de Catálogo | access | Registro de Produto | — | — |
| Cluster Kubernetes (EKS) | realization | Hospedagem de contêineres | — | — |
| Hospedagem de contêineres | serving | API de Pedidos | — | — |
| Hospedagem de contêineres | serving | API de Catálogo | — | — |
| Hospedagem de contêineres | serving | BFF | — | — |
| Apache Kafka (MSK) | realization | Mensageria | — | — |
| Mensageria | serving | API de Pedidos | — | — |
| Mensageria | serving | ERP | — | — |
| PostgreSQL 16 (RDS) | serving | API de Pedidos | — | — |
| Redis (ElastiCache) | serving | API de Pedidos | — | — |
| MongoDB Atlas | serving | API de Catálogo | — | — |
| Elasticsearch | serving | API de Catálogo | — | — |
| CDN CloudFront | serving | Web Storefront | — | — |
| Servidor SAP (on-premises) | serving | ERP | — | — |
| VPN site-to-site | serving | ERP | — | — |
| pedidos-api.jar | realization | API de Pedidos | — | — |
| Cluster Kubernetes (EKS) | assignment | pedidos-api.jar | — | — |
| Checkout | realization | Reduzir abandono de carrinho | — | — |
| API de Pedidos | realization | Checkout < 2s (p95) | — | — |
| Checkout < 2s (p95) | influence | Reduzir abandono de carrinho | — | — |

## Rastreabilidade

Cadeias de suporte calculadas a partir do modelo (o que sustenta cada oferta, e quem depende de cada aplicação).

### Venda Online (Product) — o que sustenta

- **Negócio:** Atendente SAC, Operador de Logística, Termos de Compra, Compra online, Pagamento seguro, Entrega do pedido, Atendimento pós-venda, Checkout, Expedição, Tratar solicitação, Pedido
- **Aplicação:** Plataforma de E-commerce, API de Pedidos, Checkout Controller, Carrinho Service, Pagamento Adapter, Pedido Repository, Publicador de Eventos, API de Catálogo, Índice de Busca, Cache de Carrinho, DB Pedidos, DB Catálogo, Barramento de Eventos, ERP, CRM, Gateway de Pagamentos, Serviço Antifraude, API da Transportadora, Serviço de Checkout, Serviço de Catálogo, Serviço de Pagamento, Serviço de Logística, Consulta de Pedidos, Registro de Pedido, Registro de Produto
- **Tecnologia:** Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria, PostgreSQL 16 (RDS), MongoDB Atlas, Redis (ElastiCache), Apache Kafka (MSK), Elasticsearch, Servidor SAP (on-premises), VPN site-to-site, pedidos-api.jar

### Entrega Expressa (Product) — o que sustenta

- **Negócio:** Operador de Logística, Entrega do pedido, Expedição
- **Aplicação:** Plataforma de E-commerce, Barramento de Eventos, ERP, API da Transportadora, Serviço de Logística
- **Tecnologia:** Mensageria, Apache Kafka (MSK), Servidor SAP (on-premises), VPN site-to-site

### Dependências por aplicação

| Aplicação | Negócio que depende dela | Tecnologia que a sustenta |
| --- | --- | --- |
| Plataforma de E-commerce | Cliente, Atendente SAC, Operador de Logística, Venda Online, Entrega Expressa, Compra online, Pagamento seguro, Entrega do pedido, Atendimento pós-venda, Comprador, Checkout, Faturamento, Expedição, Tratar solicitação | Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria, PostgreSQL 16 (RDS), MongoDB Atlas, Redis (ElastiCache), Apache Kafka (MSK), Elasticsearch, CDN CloudFront, pedidos-api.jar |
| Web Storefront | Cliente, Comprador | Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria, PostgreSQL 16 (RDS), MongoDB Atlas, Redis (ElastiCache), Apache Kafka (MSK), Elasticsearch, CDN CloudFront, pedidos-api.jar |
| App Mobile | Cliente, Comprador | Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria, PostgreSQL 16 (RDS), MongoDB Atlas, Redis (ElastiCache), Apache Kafka (MSK), Elasticsearch, pedidos-api.jar |
| BFF | Cliente, Comprador | Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria, PostgreSQL 16 (RDS), MongoDB Atlas, Redis (ElastiCache), Apache Kafka (MSK), Elasticsearch, pedidos-api.jar |
| API de Pedidos | Cliente, Atendente SAC, Venda Online, Compra online, Pagamento seguro, Atendimento pós-venda, Comprador, Checkout, Tratar solicitação | Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria, PostgreSQL 16 (RDS), Redis (ElastiCache), Apache Kafka (MSK), pedidos-api.jar |
| API de Catálogo | Cliente, Venda Online, Compra online, Pagamento seguro, Comprador, Checkout | Cluster Kubernetes (EKS), Hospedagem de contêineres, MongoDB Atlas, Elasticsearch |
| Barramento de Eventos | Cliente, Atendente SAC, Operador de Logística, Venda Online, Entrega Expressa, Compra online, Pagamento seguro, Entrega do pedido, Atendimento pós-venda, Comprador, Checkout, Faturamento, Expedição, Tratar solicitação | — |
| ERP | Operador de Logística, Venda Online, Entrega Expressa, Entrega do pedido, Faturamento, Expedição | Mensageria, Apache Kafka (MSK), Servidor SAP (on-premises), VPN site-to-site |

## Premissas e inferências

<!-- keep:assumptions -->
_Nenhuma premissa registrada._
<!-- /keep:assumptions -->

## Visões

| key | Notação | Tipo | Escopo / âncora | Descrição |
| --- | --- | --- | --- | --- |
| `landscape` | c4 | landscape | — | Panorama de sistemas |
| `contexto` | c4 | context | Plataforma de E-commerce | Contexto — Plataforma de E-commerce |
| `containers` | c4 | container | Plataforma de E-commerce | Containers — Plataforma de E-commerce |
| `containers-foco-pedidos` | c4 | container | Plataforma de E-commerce, API de Pedidos | Containers — foco na API de Pedidos |
| `componentes-pedidos` | c4 | component | API de Pedidos | Componentes — API de Pedidos |
| `checkout-dinamico` | c4 | dynamic | API de Pedidos | Dinâmico — fechamento de pedido |
| `negocio` | archimate | business | — | Camada de Negócio |
| `aplicacao` | archimate | application | — | Camada de Aplicação (sistemas e containers) |
| `tecnologia` | archimate | technology | — | Camada de Tecnologia |
| `suporte-venda-online` | archimate | product-support (supporters) | Venda Online | Oferta Venda Online — o que a sustenta |
| `suporte-checkout` | archimate | layered (supporters) | Checkout | Processo de Checkout — dependências por camada |
| `impacto-api-pedidos` | archimate | impact (both) | API de Pedidos | API de Pedidos — matriz de dependência e impacto |
| `negocio-x-tecnologia` | archimate | custom (supporters) | Venda Online | Venda Online — negócio × tecnologia (relações derivadas) |

## Notas

<!-- keep:notes -->
_Decisões, riscos e pendências._
<!-- /keep:notes -->

## Modelo canônico

```archlens-json
{
  "archlens": "1.0",
  "name": "Loja Online",
  "description": "Plataforma de e-commerce B2C: vitrine web e app, checkout com antifraude e gateway externo, faturamento e expedição no ERP legado. O modelo junta a visão C4 dos sistemas com as camadas ArchiMate de negócio, aplicação e tecnologia, para rastrear ofertas e processos até a infraestrutura.",
  "model": {
    "elements": [
      {
        "id": "cliente",
        "type": "c4:person",
        "name": "Cliente",
        "description": "Compra produtos pela web ou pelo app"
      },
      {
        "id": "atendente",
        "type": "c4:person",
        "name": "Atendente SAC",
        "description": "Resolve dúvidas e problemas de pedidos"
      },
      {
        "id": "operador",
        "type": "c4:person",
        "name": "Operador de Logística",
        "description": "Separa e despacha pedidos"
      },
      {
        "id": "loja",
        "type": "c4:softwareSystem",
        "name": "Plataforma de E-commerce",
        "description": "Vitrine, carrinho e checkout",
        "properties": {
          "owner": "Squad Checkout",
          "criticidade": "alta"
        },
        "children": [
          {
            "id": "loja.web",
            "type": "c4:container",
            "name": "Web Storefront",
            "technology": "Next.js",
            "description": "Vitrine e checkout web"
          },
          {
            "id": "loja.app",
            "type": "c4:container",
            "name": "App Mobile",
            "technology": "React Native",
            "description": "App iOS/Android"
          },
          {
            "id": "loja.bff",
            "type": "c4:container",
            "name": "BFF",
            "technology": "Node.js / GraphQL",
            "description": "Agrega APIs para os canais"
          },
          {
            "id": "loja.pedidos",
            "type": "c4:container",
            "name": "API de Pedidos",
            "technology": "Java / Spring Boot",
            "description": "Carrinho, checkout e ciclo de vida do pedido",
            "children": [
              {
                "id": "loja.pedidos.checkout",
                "type": "c4:component",
                "name": "Checkout Controller",
                "technology": "Spring MVC",
                "description": "Orquestra o fechamento do pedido"
              },
              {
                "id": "loja.pedidos.carrinho",
                "type": "c4:component",
                "name": "Carrinho Service",
                "technology": "Spring Bean",
                "description": "Itens, preços e cupons"
              },
              {
                "id": "loja.pedidos.pagamento",
                "type": "c4:component",
                "name": "Pagamento Adapter",
                "technology": "Spring Bean",
                "description": "Antifraude + autorização no gateway"
              },
              {
                "id": "loja.pedidos.repo",
                "type": "c4:component",
                "name": "Pedido Repository",
                "technology": "Spring Data JPA",
                "description": "Persistência de pedidos"
              },
              {
                "id": "loja.pedidos.eventos",
                "type": "c4:component",
                "name": "Publicador de Eventos",
                "technology": "Kafka client",
                "description": "Publica eventos de domínio"
              }
            ]
          },
          {
            "id": "loja.catalogo",
            "type": "c4:container",
            "name": "API de Catálogo",
            "technology": "Go",
            "description": "Produtos, preços e estoque"
          },
          {
            "id": "loja.busca",
            "type": "c4:container",
            "name": "Índice de Busca",
            "technology": "Elasticsearch",
            "tags": [
              "database"
            ],
            "description": "Busca textual de produtos"
          },
          {
            "id": "loja.cache",
            "type": "c4:container",
            "name": "Cache de Carrinho",
            "technology": "Redis",
            "tags": [
              "database"
            ],
            "description": "Carrinhos ativos"
          },
          {
            "id": "loja.db-pedidos",
            "type": "c4:container",
            "name": "DB Pedidos",
            "technology": "PostgreSQL",
            "tags": [
              "database"
            ],
            "description": "Pedidos e pagamentos"
          },
          {
            "id": "loja.db-catalogo",
            "type": "c4:container",
            "name": "DB Catálogo",
            "technology": "MongoDB",
            "tags": [
              "database"
            ],
            "description": "Produtos e atributos"
          },
          {
            "id": "loja.eventos",
            "type": "c4:container",
            "name": "Barramento de Eventos",
            "technology": "Kafka",
            "tags": [
              "queue"
            ],
            "description": "Tópicos de pedidos e estoque"
          }
        ]
      },
      {
        "id": "erp",
        "type": "c4:softwareSystem",
        "name": "ERP",
        "technology": "SAP ECC",
        "description": "Faturamento, fiscal e expedição (legado on-premises)",
        "properties": {
          "owner": "TI Corporativa"
        }
      },
      {
        "id": "crm",
        "type": "c4:softwareSystem",
        "name": "CRM",
        "external": true,
        "description": "Atendimento (SaaS)"
      },
      {
        "id": "gateway",
        "type": "c4:softwareSystem",
        "name": "Gateway de Pagamentos",
        "external": true,
        "description": "Autoriza cartões e Pix"
      },
      {
        "id": "antifraude",
        "type": "c4:softwareSystem",
        "name": "Serviço Antifraude",
        "external": true,
        "description": "Score de risco da transação"
      },
      {
        "id": "transportadora",
        "type": "c4:softwareSystem",
        "name": "API da Transportadora",
        "external": true,
        "description": "Coleta e rastreio"
      },
      {
        "id": "prod-venda",
        "type": "archimate:product",
        "name": "Venda Online",
        "description": "Oferta principal: comprar pela web/app e receber em casa"
      },
      {
        "id": "prod-expressa",
        "type": "archimate:product",
        "name": "Entrega Expressa",
        "description": "Entrega em até 24h nas capitais"
      },
      {
        "id": "ct-termos",
        "type": "archimate:contract",
        "name": "Termos de Compra"
      },
      {
        "id": "bs-compra",
        "type": "archimate:business-service",
        "name": "Compra online"
      },
      {
        "id": "bs-pagamento",
        "type": "archimate:business-service",
        "name": "Pagamento seguro"
      },
      {
        "id": "bs-entrega",
        "type": "archimate:business-service",
        "name": "Entrega do pedido"
      },
      {
        "id": "bs-atendimento",
        "type": "archimate:business-service",
        "name": "Atendimento pós-venda"
      },
      {
        "id": "br-comprador",
        "type": "archimate:business-role",
        "name": "Comprador"
      },
      {
        "id": "bp-checkout",
        "type": "archimate:business-process",
        "name": "Checkout",
        "description": "Do carrinho ao pedido pago"
      },
      {
        "id": "bp-faturamento",
        "type": "archimate:business-process",
        "name": "Faturamento"
      },
      {
        "id": "bp-expedicao",
        "type": "archimate:business-process",
        "name": "Expedição"
      },
      {
        "id": "bp-atendimento",
        "type": "archimate:business-process",
        "name": "Tratar solicitação"
      },
      {
        "id": "bo-pedido",
        "type": "archimate:business-object",
        "name": "Pedido"
      },
      {
        "id": "bo-nota",
        "type": "archimate:business-object",
        "name": "Nota Fiscal"
      },
      {
        "id": "as-checkout",
        "type": "archimate:application-service",
        "name": "Serviço de Checkout"
      },
      {
        "id": "as-catalogo",
        "type": "archimate:application-service",
        "name": "Serviço de Catálogo"
      },
      {
        "id": "as-pagamento",
        "type": "archimate:application-service",
        "name": "Serviço de Pagamento"
      },
      {
        "id": "as-faturamento",
        "type": "archimate:application-service",
        "name": "Serviço de Faturamento"
      },
      {
        "id": "as-logistica",
        "type": "archimate:application-service",
        "name": "Serviço de Logística"
      },
      {
        "id": "as-consulta",
        "type": "archimate:application-service",
        "name": "Consulta de Pedidos"
      },
      {
        "id": "do-pedido",
        "type": "archimate:data-object",
        "name": "Registro de Pedido"
      },
      {
        "id": "do-produto",
        "type": "archimate:data-object",
        "name": "Registro de Produto"
      },
      {
        "id": "tn-k8s",
        "type": "archimate:node",
        "name": "Cluster Kubernetes (EKS)"
      },
      {
        "id": "ts-hosting",
        "type": "archimate:technology-service",
        "name": "Hospedagem de contêineres"
      },
      {
        "id": "ts-mensageria",
        "type": "archimate:technology-service",
        "name": "Mensageria"
      },
      {
        "id": "ss-postgres",
        "type": "archimate:system-software",
        "name": "PostgreSQL 16 (RDS)"
      },
      {
        "id": "ss-mongo",
        "type": "archimate:system-software",
        "name": "MongoDB Atlas"
      },
      {
        "id": "ss-redis",
        "type": "archimate:system-software",
        "name": "Redis (ElastiCache)"
      },
      {
        "id": "ss-kafka",
        "type": "archimate:system-software",
        "name": "Apache Kafka (MSK)"
      },
      {
        "id": "ss-elastic",
        "type": "archimate:system-software",
        "name": "Elasticsearch"
      },
      {
        "id": "tn-cdn",
        "type": "archimate:node",
        "name": "CDN CloudFront"
      },
      {
        "id": "tn-sap",
        "type": "archimate:node",
        "name": "Servidor SAP (on-premises)"
      },
      {
        "id": "cn-vpn",
        "type": "archimate:communication-network",
        "name": "VPN site-to-site"
      },
      {
        "id": "art-pedidos",
        "type": "archimate:artifact",
        "name": "pedidos-api.jar"
      },
      {
        "id": "goal-abandono",
        "type": "archimate:goal",
        "name": "Reduzir abandono de carrinho"
      },
      {
        "id": "req-latencia",
        "type": "archimate:requirement",
        "name": "Checkout < 2s (p95)"
      }
    ],
    "relationships": [
      {
        "from": "cliente",
        "to": "loja.web",
        "type": "uses",
        "description": "Navega e compra",
        "technology": "HTTPS"
      },
      {
        "from": "cliente",
        "to": "loja.app",
        "type": "uses",
        "description": "Compra pelo celular",
        "technology": "HTTPS"
      },
      {
        "from": "loja.web",
        "to": "loja.bff",
        "type": "uses",
        "description": "Consulta e envia pedidos",
        "technology": "GraphQL"
      },
      {
        "from": "loja.app",
        "to": "loja.bff",
        "type": "uses",
        "description": "Consulta e envia pedidos",
        "technology": "GraphQL"
      },
      {
        "from": "loja.bff",
        "to": "loja.catalogo",
        "type": "uses",
        "description": "Consulta produtos",
        "technology": "REST"
      },
      {
        "from": "loja.bff",
        "to": "loja.busca",
        "type": "uses",
        "description": "Busca textual",
        "technology": "HTTP"
      },
      {
        "from": "loja.bff",
        "to": "loja.pedidos.carrinho",
        "type": "uses",
        "description": "Gerencia carrinho",
        "technology": "REST"
      },
      {
        "from": "loja.bff",
        "to": "loja.pedidos.checkout",
        "type": "uses",
        "description": "Fecha pedido",
        "technology": "REST"
      },
      {
        "from": "loja.catalogo",
        "to": "loja.db-catalogo",
        "type": "uses",
        "description": "Lê e grava produtos",
        "technology": "MongoDB wire"
      },
      {
        "from": "loja.catalogo",
        "to": "loja.busca",
        "type": "uses",
        "description": "Indexa produtos",
        "technology": "HTTP"
      },
      {
        "from": "loja.pedidos.checkout",
        "to": "loja.pedidos.carrinho",
        "type": "uses",
        "description": "Obtém itens"
      },
      {
        "from": "loja.pedidos.checkout",
        "to": "loja.pedidos.pagamento",
        "type": "uses",
        "description": "Solicita autorização"
      },
      {
        "from": "loja.pedidos.checkout",
        "to": "loja.pedidos.repo",
        "type": "uses",
        "description": "Persiste pedido"
      },
      {
        "from": "loja.pedidos.checkout",
        "to": "loja.pedidos.eventos",
        "type": "uses",
        "description": "Publica PedidoCriado"
      },
      {
        "from": "loja.pedidos.carrinho",
        "to": "loja.cache",
        "type": "uses",
        "description": "Lê e grava carrinho",
        "technology": "RESP"
      },
      {
        "from": "loja.pedidos.repo",
        "to": "loja.db-pedidos",
        "type": "uses",
        "description": "Lê e grava pedidos",
        "technology": "JDBC"
      },
      {
        "from": "loja.pedidos.pagamento",
        "to": "antifraude",
        "type": "uses",
        "description": "Avalia risco",
        "technology": "HTTPS"
      },
      {
        "from": "loja.pedidos.pagamento",
        "to": "gateway",
        "type": "uses",
        "description": "Autoriza pagamento",
        "technology": "HTTPS"
      },
      {
        "from": "loja.pedidos.eventos",
        "to": "loja.eventos",
        "type": "uses",
        "description": "Publica eventos",
        "technology": "Kafka"
      },
      {
        "from": "erp",
        "to": "loja.eventos",
        "type": "uses",
        "description": "Consome pedidos pagos",
        "technology": "Kafka"
      },
      {
        "from": "erp",
        "to": "transportadora",
        "type": "uses",
        "description": "Solicita coleta",
        "technology": "REST"
      },
      {
        "from": "crm",
        "to": "loja.pedidos",
        "type": "uses",
        "description": "Consulta pedidos",
        "technology": "REST"
      },
      {
        "from": "atendente",
        "to": "crm",
        "type": "uses",
        "description": "Atende clientes"
      },
      {
        "from": "operador",
        "to": "erp",
        "type": "uses",
        "description": "Gerencia expedição"
      },
      {
        "from": "prod-venda",
        "to": "bs-compra",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-venda",
        "to": "bs-pagamento",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-venda",
        "to": "bs-entrega",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-venda",
        "to": "bs-atendimento",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-venda",
        "to": "ct-termos",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-expressa",
        "to": "bs-entrega",
        "type": "archimate:aggregation"
      },
      {
        "from": "bp-checkout",
        "to": "bs-compra",
        "type": "archimate:realization"
      },
      {
        "from": "bp-checkout",
        "to": "bs-pagamento",
        "type": "archimate:realization"
      },
      {
        "from": "bp-expedicao",
        "to": "bs-entrega",
        "type": "archimate:realization"
      },
      {
        "from": "bp-atendimento",
        "to": "bs-atendimento",
        "type": "archimate:realization"
      },
      {
        "from": "bp-checkout",
        "to": "bp-faturamento",
        "type": "archimate:triggering"
      },
      {
        "from": "bp-faturamento",
        "to": "bp-expedicao",
        "type": "archimate:triggering"
      },
      {
        "from": "bs-compra",
        "to": "br-comprador",
        "type": "archimate:serving"
      },
      {
        "from": "cliente",
        "to": "br-comprador",
        "type": "archimate:assignment"
      },
      {
        "from": "atendente",
        "to": "bp-atendimento",
        "type": "archimate:assignment"
      },
      {
        "from": "operador",
        "to": "bp-expedicao",
        "type": "archimate:assignment"
      },
      {
        "from": "bp-checkout",
        "to": "bo-pedido",
        "type": "archimate:access",
        "accessType": "write"
      },
      {
        "from": "bp-faturamento",
        "to": "bo-pedido",
        "type": "archimate:access",
        "accessType": "read"
      },
      {
        "from": "bp-faturamento",
        "to": "bo-nota",
        "type": "archimate:access",
        "accessType": "write"
      },
      {
        "from": "loja.pedidos.checkout",
        "to": "as-checkout",
        "type": "archimate:realization"
      },
      {
        "from": "as-checkout",
        "to": "bp-checkout",
        "type": "archimate:serving"
      },
      {
        "from": "loja.catalogo",
        "to": "as-catalogo",
        "type": "archimate:realization"
      },
      {
        "from": "as-catalogo",
        "to": "bp-checkout",
        "type": "archimate:serving"
      },
      {
        "from": "loja.pedidos.pagamento",
        "to": "as-pagamento",
        "type": "archimate:realization"
      },
      {
        "from": "as-pagamento",
        "to": "bp-checkout",
        "type": "archimate:serving"
      },
      {
        "from": "erp",
        "to": "as-faturamento",
        "type": "archimate:realization"
      },
      {
        "from": "as-faturamento",
        "to": "bp-faturamento",
        "type": "archimate:serving"
      },
      {
        "from": "erp",
        "to": "as-logistica",
        "type": "archimate:realization"
      },
      {
        "from": "as-logistica",
        "to": "bp-expedicao",
        "type": "archimate:serving"
      },
      {
        "from": "loja.pedidos",
        "to": "as-consulta",
        "type": "archimate:realization"
      },
      {
        "from": "as-consulta",
        "to": "bp-atendimento",
        "type": "archimate:serving"
      },
      {
        "from": "crm",
        "to": "bp-atendimento",
        "type": "archimate:serving"
      },
      {
        "from": "do-pedido",
        "to": "bo-pedido",
        "type": "archimate:realization"
      },
      {
        "from": "loja.pedidos.repo",
        "to": "do-pedido",
        "type": "archimate:access",
        "accessType": "write"
      },
      {
        "from": "loja.catalogo",
        "to": "do-produto",
        "type": "archimate:access",
        "accessType": "readwrite"
      },
      {
        "from": "tn-k8s",
        "to": "ts-hosting",
        "type": "archimate:realization"
      },
      {
        "from": "ts-hosting",
        "to": "loja.pedidos",
        "type": "archimate:serving"
      },
      {
        "from": "ts-hosting",
        "to": "loja.catalogo",
        "type": "archimate:serving"
      },
      {
        "from": "ts-hosting",
        "to": "loja.bff",
        "type": "archimate:serving"
      },
      {
        "from": "ss-kafka",
        "to": "ts-mensageria",
        "type": "archimate:realization"
      },
      {
        "from": "ts-mensageria",
        "to": "loja.pedidos",
        "type": "archimate:serving"
      },
      {
        "from": "ts-mensageria",
        "to": "erp",
        "type": "archimate:serving"
      },
      {
        "from": "ss-postgres",
        "to": "loja.pedidos",
        "type": "archimate:serving"
      },
      {
        "from": "ss-redis",
        "to": "loja.pedidos",
        "type": "archimate:serving"
      },
      {
        "from": "ss-mongo",
        "to": "loja.catalogo",
        "type": "archimate:serving"
      },
      {
        "from": "ss-elastic",
        "to": "loja.catalogo",
        "type": "archimate:serving"
      },
      {
        "from": "tn-cdn",
        "to": "loja.web",
        "type": "archimate:serving"
      },
      {
        "from": "tn-sap",
        "to": "erp",
        "type": "archimate:serving"
      },
      {
        "from": "cn-vpn",
        "to": "erp",
        "type": "archimate:serving"
      },
      {
        "from": "art-pedidos",
        "to": "loja.pedidos",
        "type": "archimate:realization"
      },
      {
        "from": "tn-k8s",
        "to": "art-pedidos",
        "type": "archimate:assignment"
      },
      {
        "from": "bp-checkout",
        "to": "goal-abandono",
        "type": "archimate:realization"
      },
      {
        "from": "loja.pedidos",
        "to": "req-latencia",
        "type": "archimate:realization"
      },
      {
        "from": "req-latencia",
        "to": "goal-abandono",
        "type": "archimate:influence"
      }
    ]
  },
  "views": [
    {
      "key": "landscape",
      "notation": "c4",
      "level": "landscape",
      "title": "Panorama de sistemas"
    },
    {
      "key": "contexto",
      "notation": "c4",
      "level": "context",
      "scope": "loja",
      "title": "Contexto — Plataforma de E-commerce"
    },
    {
      "key": "containers",
      "notation": "c4",
      "level": "container",
      "scope": "loja",
      "title": "Containers — Plataforma de E-commerce"
    },
    {
      "key": "containers-foco-pedidos",
      "notation": "c4",
      "level": "container",
      "scope": "loja",
      "focus": [
        "loja.pedidos"
      ],
      "depth": 1,
      "title": "Containers — foco na API de Pedidos"
    },
    {
      "key": "componentes-pedidos",
      "notation": "c4",
      "level": "component",
      "scope": "loja.pedidos",
      "title": "Componentes — API de Pedidos"
    },
    {
      "key": "checkout-dinamico",
      "notation": "c4",
      "level": "dynamic",
      "scope": "loja.pedidos",
      "title": "Dinâmico — fechamento de pedido",
      "steps": [
        {
          "from": "cliente",
          "to": "loja.web",
          "description": "Clica em Finalizar compra"
        },
        {
          "from": "loja.web",
          "to": "loja.bff",
          "description": "mutation checkout"
        },
        {
          "from": "loja.bff",
          "to": "loja.pedidos.checkout",
          "description": "POST /pedidos"
        },
        {
          "from": "loja.pedidos.checkout",
          "to": "loja.pedidos.carrinho",
          "description": "Obtém itens e cupons"
        },
        {
          "from": "loja.pedidos.checkout",
          "to": "loja.pedidos.pagamento",
          "description": "Solicita autorização"
        },
        {
          "from": "loja.pedidos.pagamento",
          "to": "antifraude",
          "description": "Avalia risco"
        },
        {
          "from": "loja.pedidos.pagamento",
          "to": "gateway",
          "description": "Autoriza cartão"
        },
        {
          "from": "loja.pedidos.checkout",
          "to": "loja.pedidos.repo",
          "description": "Persiste pedido"
        },
        {
          "from": "loja.pedidos.repo",
          "to": "loja.db-pedidos",
          "description": "INSERT pedido"
        },
        {
          "from": "loja.pedidos.checkout",
          "to": "loja.pedidos.eventos",
          "description": "PedidoCriado"
        },
        {
          "from": "loja.pedidos.eventos",
          "to": "loja.eventos",
          "description": "Publica no tópico pedidos"
        }
      ]
    },
    {
      "key": "negocio",
      "notation": "archimate",
      "viewpoint": "business",
      "title": "Camada de Negócio"
    },
    {
      "key": "aplicacao",
      "notation": "archimate",
      "viewpoint": "application",
      "granularity": "container",
      "title": "Camada de Aplicação (sistemas e containers)"
    },
    {
      "key": "tecnologia",
      "notation": "archimate",
      "viewpoint": "technology",
      "title": "Camada de Tecnologia"
    },
    {
      "key": "suporte-venda-online",
      "notation": "archimate",
      "viewpoint": "product-support",
      "anchor": "prod-venda",
      "traverse": {
        "mode": "supporters"
      },
      "collapse": [
        "application-service",
        "technology-service"
      ],
      "title": "Oferta Venda Online — o que a sustenta"
    },
    {
      "key": "suporte-checkout",
      "notation": "archimate",
      "viewpoint": "layered",
      "anchor": "bp-checkout",
      "traverse": {
        "mode": "supporters"
      },
      "granularity": "container",
      "title": "Processo de Checkout — dependências por camada"
    },
    {
      "key": "impacto-api-pedidos",
      "notation": "archimate",
      "viewpoint": "impact",
      "anchor": "loja.pedidos",
      "traverse": {
        "mode": "both"
      },
      "output": [
        "diagram",
        "matrix"
      ],
      "title": "API de Pedidos — matriz de dependência e impacto"
    },
    {
      "key": "negocio-x-tecnologia",
      "notation": "archimate",
      "viewpoint": "custom",
      "layers": [
        "business",
        "technology"
      ],
      "anchor": "prod-venda",
      "traverse": {
        "mode": "supporters"
      },
      "derive": true,
      "title": "Venda Online — negócio × tecnologia (relações derivadas)"
    }
  ]
}
```
