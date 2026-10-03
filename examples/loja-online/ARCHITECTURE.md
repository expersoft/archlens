---
archlens: "1.0"
name: "Loja Online"
source: architecture/
revision: 1
updated: 2026-10-02
notations: [c4, archimate]
elements: 62
relationships: 78
---

# Loja Online

> Gerado por archlens a partir de `architecture/`. Não edite: escreva em `architecture/notes/*.md` e evolua a base com `archlens merge`.

## Visão geral

Plataforma de e-commerce B2C: vitrine web e app, checkout com antifraude e gateway externo, faturamento e expedição no ERP legado. O modelo junta a visão C4 dos sistemas com as camadas ArchiMate de negócio, aplicação e tecnologia, para rastrear ofertas e processos até a infraestrutura.

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

## Agrupamentos

### Plataforma de Vendas

`plat-vendas`

Sistemas que sustentam a jornada de compra: vitrine, checkout e análise de risco.

| Camada | Membros |
| --- | --- |
| Aplicação | Plataforma de E-commerce, Serviço Antifraude |

### Plataforma de Back-office

`plat-backoffice`

Sistemas internos de faturamento, expedição e atendimento.

| Camada | Membros |
| --- | --- |
| Aplicação | ERP, CRM |

## Modelo C4

### Plataforma de E-commerce — Software System

Vitrine, carrinho e checkout

| Container | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Web Storefront | Next.js | Vitrine e checkout web | — | `loja.web` |
| App Mobile | React Native | App iOS/Android | — | `loja.app` |
| BFF | Node.js / GraphQL | Agrega APIs para os canais | — | `loja.bff` |
| API de Pedidos | Java / Spring Boot | Carrinho, checkout e ciclo de vida do pedido | — | `loja.pedidos` |
| API de Catálogo | Go | Produtos, preços e estoque | — | `loja.catalogo` |
| Índice de Busca 🛢 | Elasticsearch | Busca textual de produtos | — | `loja.busca` |
| Cache de Carrinho 🛢 | Redis | Carrinhos ativos | — | `loja.cache` |
| DB Pedidos 🛢 | PostgreSQL | Pedidos e pagamentos | — | `loja.db-pedidos` |
| DB Catálogo 🛢 | MongoDB | Produtos e atributos | — | `loja.db-catalogo` |
| Barramento de Eventos | Kafka | Tópicos de pedidos e estoque | — | `loja.eventos` |

#### Componentes de API de Pedidos

| Componente | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Checkout Controller | Spring MVC | Orquestra o fechamento do pedido | — | `loja.pedidos.checkout` |
| Carrinho Service | Spring Bean | Itens, preços e cupons | — | `loja.pedidos.carrinho` |
| Pagamento Adapter | Spring Bean | Antifraude + autorização no gateway | — | `loja.pedidos.pagamento` |
| Pedido Repository | Spring Data JPA | Persistência de pedidos | — | `loja.pedidos.repo` |
| Publicador de Eventos | Kafka client | Publica eventos de domínio | — | `loja.pedidos.eventos` |

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

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Reduzir abandono de carrinho | Goal | — | — | `goal-abandono` |
| Checkout < 2s (p95) | Requirement | — | — | `req-latencia` |

## Camada de Negócio

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Cliente | Business Actor (C4 Person) | Compra produtos pela web ou pelo app | — | `cliente` |
| Atendente SAC | Business Actor (C4 Person) | Resolve dúvidas e problemas de pedidos | — | `atendente` |
| Operador de Logística | Business Actor (C4 Person) | Separa e despacha pedidos | — | `operador` |
| Venda Online | Product | Oferta principal: comprar pela web/app e receber em casa | — | `prod-venda` |
| Entrega Expressa | Product | Entrega em até 24h nas capitais | — | `prod-expressa` |
| Termos de Compra | Contract | — | — | `ct-termos` |
| Compra online | Business Service | — | — | `bs-compra` |
| Pagamento seguro | Business Service | — | — | `bs-pagamento` |
| Entrega do pedido | Business Service | — | — | `bs-entrega` |
| Atendimento pós-venda | Business Service | — | — | `bs-atendimento` |
| Comprador | Business Role | — | — | `br-comprador` |
| Checkout | Business Process | Do carrinho ao pedido pago | — | `bp-checkout` |
| Faturamento | Business Process | — | — | `bp-faturamento` |
| Expedição | Business Process | — | — | `bp-expedicao` |
| Tratar solicitação | Business Process | — | — | `bp-atendimento` |
| Pedido | Business Object | — | — | `bo-pedido` |
| Nota Fiscal | Business Object | — | — | `bo-nota` |

## Camada de Aplicação

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Plataforma de E-commerce | Application Component (C4 Software System) | Vitrine, carrinho e checkout | P | `loja` |
| Web Storefront | Application Component (C4 Container) | Vitrine e checkout web | — | `loja.web` |
| App Mobile | Application Component (C4 Container) | App iOS/Android | — | `loja.app` |
| BFF | Application Component (C4 Container) | Agrega APIs para os canais | — | `loja.bff` |
| API de Pedidos | Application Component (C4 Container) | Carrinho, checkout e ciclo de vida do pedido | — | `loja.pedidos` |
| Checkout Controller | Application Component (C4 Component) | Orquestra o fechamento do pedido | — | `loja.pedidos.checkout` |
| Carrinho Service | Application Component (C4 Component) | Itens, preços e cupons | — | `loja.pedidos.carrinho` |
| Pagamento Adapter | Application Component (C4 Component) | Antifraude + autorização no gateway | — | `loja.pedidos.pagamento` |
| Pedido Repository | Application Component (C4 Component) | Persistência de pedidos | — | `loja.pedidos.repo` |
| Publicador de Eventos | Application Component (C4 Component) | Publica eventos de domínio | — | `loja.pedidos.eventos` |
| API de Catálogo | Application Component (C4 Container) | Produtos, preços e estoque | — | `loja.catalogo` |
| Índice de Busca | Data Object (C4 Container) | Busca textual de produtos | — | `loja.busca` |
| Cache de Carrinho | Data Object (C4 Container) | Carrinhos ativos | — | `loja.cache` |
| DB Pedidos | Data Object (C4 Container) | Pedidos e pagamentos | — | `loja.db-pedidos` |
| DB Catálogo | Data Object (C4 Container) | Produtos e atributos | — | `loja.db-catalogo` |
| Barramento de Eventos | Application Component (C4 Container) | Tópicos de pedidos e estoque | — | `loja.eventos` |
| ERP | Application Component (C4 Software System) | Faturamento, fiscal e expedição (legado on-premises) | P | `erp` |
| CRM | Application Component (C4 Software System) | Atendimento (SaaS) | P | `crm` |
| Gateway de Pagamentos | Application Component (C4 Software System) | Autoriza cartões e Pix | — | `gateway` |
| Serviço Antifraude | Application Component (C4 Software System) | Score de risco da transação | P | `antifraude` |
| API da Transportadora | Application Component (C4 Software System) | Coleta e rastreio | — | `transportadora` |
| Serviço de Checkout | Application Service | — | — | `as-checkout` |
| Serviço de Catálogo | Application Service | — | — | `as-catalogo` |
| Serviço de Pagamento | Application Service | — | — | `as-pagamento` |
| Serviço de Faturamento | Application Service | — | — | `as-faturamento` |
| Serviço de Logística | Application Service | — | — | `as-logistica` |
| Consulta de Pedidos | Application Service | — | — | `as-consulta` |
| Registro de Pedido | Data Object | — | — | `do-pedido` |
| Registro de Produto | Data Object | — | — | `do-produto` |

## Camada de Tecnologia

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Cluster Kubernetes (EKS) | Node | — | — | `tn-k8s` |
| Hospedagem de contêineres | Technology Service | — | — | `ts-hosting` |
| Mensageria | Technology Service | — | — | `ts-mensageria` |
| PostgreSQL 16 (RDS) | System Software | — | — | `ss-postgres` |
| MongoDB Atlas | System Software | — | — | `ss-mongo` |
| Redis (ElastiCache) | System Software | — | — | `ss-redis` |
| Apache Kafka (MSK) | System Software | — | — | `ss-kafka` |
| Elasticsearch | System Software | — | — | `ss-elastic` |
| CDN CloudFront | Node | — | — | `tn-cdn` |
| Servidor SAP (on-premises) | Node | — | — | `tn-sap` |
| VPN site-to-site | Communication Network | — | — | `cn-vpn` |
| pedidos-api.jar | Artifact | — | — | `art-pedidos` |

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

## Ciclo de vida

_Todos os elementos e relações estão ativos._

## Premissas e inferências

_Nenhuma premissa registrada._

## Fontes

| Tipo | Referência | Data | Itens |
| --- | --- | --- | --- |
| prompt | agrupamentos | — | 6 |

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
| `plataformas` | c4 | landscape | — | Plataformas |
| `vendas-x-backoffice` | archimate | application | — | Vendas × Back-office |

## Histórico

| Data | Fonte | Resumo | Mudanças | Decisões |
| --- | --- | --- | --- | --- |
| 2026-10-02 | prompt agrupamentos | Plataformas de vendas e de back-office | +4 ~4 −0 | — |

## Notas

_Decisões, riscos e pendências._

## Modelo canônico

A fonte de verdade está em `architecture/`: `archlens.json` (manifesto), `model.json` ou `model/*.json` (elementos e relações), `views.json` (visões), `changelog.json` (histórico) e `notes/*.md` (texto autoral). Consulte-a com a CLI (`archlens views`, `archlens resolve`) em vez de copiar trechos daqui.
