---
archlens: "2.0"
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
| Atendente SAC | Business Actor | Resolve dúvidas e problemas de pedidos | `atendente` |
| Comprador | Business Role | — | `br-comprador` |
| Cliente | Business Actor | Compra produtos pela web ou pelo app | `cliente` |
| Operador de Logística | Business Actor | Separa e despacha pedidos | `operador` |

## Agrupamentos

### Plataforma de Back-office

`plat-backoffice`

Sistemas internos de faturamento, expedição e atendimento.

| Camada | Membros |
| --- | --- |
| Aplicação | CRM, ERP |

### Plataforma de Vendas

`plat-vendas`

Sistemas que sustentam a jornada de compra: vitrine, checkout e análise de risco.

| Camada | Membros |
| --- | --- |
| Aplicação | Serviço Antifraude, Plataforma de E-commerce |

## Modelo C4

### Serviço Antifraude — Software System (externo)

Score de risco da transação

### CRM — Software System (externo)

Atendimento (SaaS)

### ERP — Software System

Faturamento, fiscal e expedição (legado on-premises)

### Gateway de Pagamentos — Software System (externo)

Autoriza cartões e Pix

### Plataforma de E-commerce — Software System

Vitrine, carrinho e checkout

| Container | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| App Mobile | React Native | App iOS/Android | — | `loja.app` |
| BFF | Node.js / GraphQL | Agrega APIs para os canais | — | `loja.bff` |
| Índice de Busca 🛢 | Elasticsearch | Busca textual de produtos | — | `loja.busca` |
| Cache de Carrinho 🛢 | Redis | Carrinhos ativos | — | `loja.cache` |
| API de Catálogo | Go | Produtos, preços e estoque | — | `loja.catalogo` |
| DB Catálogo 🛢 | MongoDB | Produtos e atributos | — | `loja.db-catalogo` |
| DB Pedidos 🛢 | PostgreSQL | Pedidos e pagamentos | — | `loja.db-pedidos` |
| Barramento de Eventos | Kafka | Tópicos de pedidos e estoque | — | `loja.eventos` |
| API de Pedidos | Java / Spring Boot | Carrinho, checkout e ciclo de vida do pedido | — | `loja.pedidos` |
| Web Storefront | Next.js | Vitrine e checkout web | — | `loja.web` |

#### Componentes de API de Pedidos

| Componente | Tecnologia | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Carrinho Service | Spring Bean | Itens, preços e cupons | — | `loja.pedidos.carrinho` |
| Checkout Controller | Spring MVC | Orquestra o fechamento do pedido | — | `loja.pedidos.checkout` |
| Publicador de Eventos | Kafka client | Publica eventos de domínio | — | `loja.pedidos.eventos` |
| Pagamento Adapter | Spring Bean | Antifraude + autorização no gateway | — | `loja.pedidos.pagamento` |
| Pedido Repository | Spring Data JPA | Persistência de pedidos | — | `loja.pedidos.repo` |

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
| Atendente SAC | Business Actor (C4 Person) | Resolve dúvidas e problemas de pedidos | — | `atendente` |
| Nota Fiscal | Business Object | — | — | `bo-nota` |
| Pedido | Business Object | — | — | `bo-pedido` |
| Tratar solicitação | Business Process | — | — | `bp-atendimento` |
| Checkout | Business Process | Do carrinho ao pedido pago | — | `bp-checkout` |
| Expedição | Business Process | — | — | `bp-expedicao` |
| Faturamento | Business Process | — | — | `bp-faturamento` |
| Comprador | Business Role (C4 Person) | — | — | `br-comprador` |
| Atendimento pós-venda | Business Service | — | — | `bs-atendimento` |
| Compra online | Business Service | — | — | `bs-compra` |
| Entrega do pedido | Business Service | — | — | `bs-entrega` |
| Pagamento seguro | Business Service | — | — | `bs-pagamento` |
| Cliente | Business Actor (C4 Person) | Compra produtos pela web ou pelo app | — | `cliente` |
| Termos de Compra | Contract | — | — | `ct-termos` |
| Operador de Logística | Business Actor (C4 Person) | Separa e despacha pedidos | — | `operador` |
| Entrega Expressa | Product | Entrega em até 24h nas capitais | — | `prod-expressa` |
| Venda Online | Product | Oferta principal: comprar pela web/app e receber em casa | — | `prod-venda` |

## Camada de Aplicação

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| Serviço Antifraude | Application Component (C4 Software System) | Score de risco da transação | P | `antifraude` |
| Serviço de Catálogo | Application Service | — | — | `as-catalogo` |
| Serviço de Checkout | Application Service | — | — | `as-checkout` |
| Consulta de Pedidos | Application Service | — | — | `as-consulta` |
| Serviço de Faturamento | Application Service | — | — | `as-faturamento` |
| Serviço de Logística | Application Service | — | — | `as-logistica` |
| Serviço de Pagamento | Application Service | — | — | `as-pagamento` |
| CRM | Application Component (C4 Software System) | Atendimento (SaaS) | P | `crm` |
| Registro de Pedido | Data Object | — | — | `do-pedido` |
| Registro de Produto | Data Object | — | — | `do-produto` |
| ERP | Application Component (C4 Software System) | Faturamento, fiscal e expedição (legado on-premises) | P | `erp` |
| Gateway de Pagamentos | Application Component (C4 Software System) | Autoriza cartões e Pix | — | `gateway` |
| Plataforma de E-commerce | Application Component (C4 Software System) | Vitrine, carrinho e checkout | P | `loja` |
| App Mobile | Application Component (C4 Container) | App iOS/Android | — | `loja.app` |
| BFF | Application Component (C4 Container) | Agrega APIs para os canais | — | `loja.bff` |
| Índice de Busca | Application Component (C4 Container) | Busca textual de produtos | — | `loja.busca` |
| Cache de Carrinho | Application Component (C4 Container) | Carrinhos ativos | — | `loja.cache` |
| API de Catálogo | Application Component (C4 Container) | Produtos, preços e estoque | — | `loja.catalogo` |
| DB Catálogo | Application Component (C4 Container) | Produtos e atributos | — | `loja.db-catalogo` |
| DB Pedidos | Application Component (C4 Container) | Pedidos e pagamentos | — | `loja.db-pedidos` |
| Barramento de Eventos | Application Component (C4 Container) | Tópicos de pedidos e estoque | — | `loja.eventos` |
| API de Pedidos | Application Component (C4 Container) | Carrinho, checkout e ciclo de vida do pedido | — | `loja.pedidos` |
| Carrinho Service | Application Component (C4 Component) | Itens, preços e cupons | — | `loja.pedidos.carrinho` |
| Checkout Controller | Application Component (C4 Component) | Orquestra o fechamento do pedido | — | `loja.pedidos.checkout` |
| Publicador de Eventos | Application Component (C4 Component) | Publica eventos de domínio | — | `loja.pedidos.eventos` |
| Pagamento Adapter | Application Component (C4 Component) | Antifraude + autorização no gateway | — | `loja.pedidos.pagamento` |
| Pedido Repository | Application Component (C4 Component) | Persistência de pedidos | — | `loja.pedidos.repo` |
| Web Storefront | Application Component (C4 Container) | Vitrine e checkout web | — | `loja.web` |
| API da Transportadora | Application Component (C4 Software System) | Coleta e rastreio | — | `transportadora` |

## Camada de Tecnologia

| Elemento | Tipo ArchiMate | Descrição | Fontes | id |
| --- | --- | --- | --- | --- |
| pedidos-api.jar | Artifact | — | — | `art-pedidos` |
| VPN site-to-site | Communication Network | — | — | `cn-vpn` |
| Elasticsearch | System Software | — | — | `ss-elastic` |
| Apache Kafka (MSK) | System Software | — | — | `ss-kafka` |
| MongoDB Atlas | System Software | — | — | `ss-mongo` |
| PostgreSQL 16 (RDS) | System Software | — | — | `ss-postgres` |
| Redis (ElastiCache) | System Software | — | — | `ss-redis` |
| CDN CloudFront | Node | — | — | `tn-cdn` |
| Cluster Kubernetes (EKS) | Node | — | — | `tn-k8s` |
| Servidor SAP (on-premises) | Node | — | — | `tn-sap` |
| Hospedagem de contêineres | Technology Service | — | — | `ts-hosting` |
| Mensageria | Technology Service | — | — | `ts-mensageria` |

## Relacionamentos

| Origem | Relação | Destino | Descrição | Tecnologia |
| --- | --- | --- | --- | --- |
| Pagamento Adapter | usa | Serviço Antifraude | Avalia risco | HTTPS |
| pedidos-api.jar | realization | API de Pedidos | — | — |
| Serviço de Catálogo | serving | Checkout | — | — |
| Serviço de Checkout | serving | Checkout | — | — |
| Consulta de Pedidos | serving | Tratar solicitação | — | — |
| Serviço de Faturamento | serving | Faturamento | — | — |
| Serviço de Logística | serving | Expedição | — | — |
| Serviço de Pagamento | serving | Checkout | — | — |
| Atendente SAC | assignment | Tratar solicitação | — | — |
| Tratar solicitação | realization | Atendimento pós-venda | — | — |
| Checkout | realization | Compra online | — | — |
| Checkout | realization | Pagamento seguro | — | — |
| Checkout | triggering | Faturamento | — | — |
| Checkout | access | Pedido | — | — |
| Checkout | realization | Reduzir abandono de carrinho | — | — |
| Expedição | realization | Entrega do pedido | — | — |
| Faturamento | triggering | Expedição | — | — |
| Faturamento | access | Pedido | — | — |
| Faturamento | access | Nota Fiscal | — | — |
| Compra online | serving | Comprador | — | — |
| Cliente | assignment | Comprador | — | — |
| VPN site-to-site | serving | ERP | — | — |
| Atendente SAC | usa | CRM | Atende clientes | — |
| CRM | serving | Tratar solicitação | — | — |
| Registro de Pedido | realization | Pedido | — | — |
| Operador de Logística | usa | ERP | Gerencia expedição | — |
| ERP | realization | Serviço de Faturamento | — | — |
| ERP | realization | Serviço de Logística | — | — |
| Pagamento Adapter | usa | Gateway de Pagamentos | Autoriza pagamento | HTTPS |
| Cliente | usa | App Mobile | Compra pelo celular | HTTPS |
| Web Storefront | usa | BFF | Consulta e envia pedidos | GraphQL |
| App Mobile | usa | BFF | Consulta e envia pedidos | GraphQL |
| BFF | usa | Índice de Busca | Busca textual | HTTP |
| API de Catálogo | usa | Índice de Busca | Indexa produtos | HTTP |
| Carrinho Service | usa | Cache de Carrinho | Lê e grava carrinho | RESP |
| BFF | usa | API de Catálogo | Consulta produtos | REST |
| API de Catálogo | realization | Serviço de Catálogo | — | — |
| API de Catálogo | access | Registro de Produto | — | — |
| API de Catálogo | usa | DB Catálogo | Lê e grava produtos | MongoDB wire |
| Pedido Repository | usa | DB Pedidos | Lê e grava pedidos | JDBC |
| Publicador de Eventos | usa | Barramento de Eventos | Publica eventos | Kafka |
| ERP | usa | Barramento de Eventos | Consome pedidos pagos | Kafka |
| CRM | usa | API de Pedidos | Consulta pedidos | REST |
| API de Pedidos | realization | Consulta de Pedidos | — | — |
| API de Pedidos | realization | Checkout < 2s (p95) | — | — |
| BFF | usa | Carrinho Service | Gerencia carrinho | REST |
| Checkout Controller | usa | Carrinho Service | Obtém itens | — |
| BFF | usa | Checkout Controller | Fecha pedido | REST |
| Checkout Controller | realization | Serviço de Checkout | — | — |
| Checkout Controller | usa | Publicador de Eventos | Publica PedidoCriado | — |
| Checkout Controller | usa | Pagamento Adapter | Solicita autorização | — |
| Pagamento Adapter | realization | Serviço de Pagamento | — | — |
| Checkout Controller | usa | Pedido Repository | Persiste pedido | — |
| Pedido Repository | access | Registro de Pedido | — | — |
| Cliente | usa | Web Storefront | Navega e compra | HTTPS |
| Operador de Logística | assignment | Expedição | — | — |
| Entrega Expressa | aggregation | Entrega do pedido | — | — |
| Venda Online | aggregation | Compra online | — | — |
| Venda Online | aggregation | Pagamento seguro | — | — |
| Venda Online | aggregation | Entrega do pedido | — | — |
| Venda Online | aggregation | Atendimento pós-venda | — | — |
| Venda Online | aggregation | Termos de Compra | — | — |
| Checkout < 2s (p95) | influence | Reduzir abandono de carrinho | — | — |
| Elasticsearch | serving | API de Catálogo | — | — |
| Apache Kafka (MSK) | realization | Mensageria | — | — |
| MongoDB Atlas | serving | API de Catálogo | — | — |
| PostgreSQL 16 (RDS) | serving | API de Pedidos | — | — |
| Redis (ElastiCache) | serving | API de Pedidos | — | — |
| CDN CloudFront | serving | Web Storefront | — | — |
| Cluster Kubernetes (EKS) | realization | Hospedagem de contêineres | — | — |
| Cluster Kubernetes (EKS) | assignment | pedidos-api.jar | — | — |
| Servidor SAP (on-premises) | serving | ERP | — | — |
| ERP | usa | API da Transportadora | Solicita coleta | REST |
| Hospedagem de contêineres | serving | API de Pedidos | — | — |
| Hospedagem de contêineres | serving | API de Catálogo | — | — |
| Hospedagem de contêineres | serving | BFF | — | — |
| Mensageria | serving | API de Pedidos | — | — |
| Mensageria | serving | ERP | — | — |

## Rastreabilidade

Cadeias de suporte calculadas a partir do modelo (o que sustenta cada oferta, e quem depende de cada aplicação).

### Entrega Expressa (Product) — o que sustenta

- **Negócio:** Expedição, Entrega do pedido, Operador de Logística
- **Aplicação:** Serviço de Logística, ERP, Plataforma de E-commerce, Barramento de Eventos, API da Transportadora
- **Tecnologia:** VPN site-to-site, Apache Kafka (MSK), Servidor SAP (on-premises), Mensageria

### Venda Online (Product) — o que sustenta

- **Negócio:** Atendente SAC, Pedido, Tratar solicitação, Checkout, Expedição, Atendimento pós-venda, Compra online, Entrega do pedido, Pagamento seguro, Termos de Compra, Operador de Logística
- **Aplicação:** Serviço Antifraude, Serviço de Catálogo, Serviço de Checkout, Consulta de Pedidos, Serviço de Logística, Serviço de Pagamento, CRM, Registro de Pedido, Registro de Produto, ERP, Gateway de Pagamentos, Plataforma de E-commerce, Índice de Busca, Cache de Carrinho, API de Catálogo, DB Catálogo, DB Pedidos, Barramento de Eventos, API de Pedidos, Carrinho Service, Checkout Controller, Publicador de Eventos, Pagamento Adapter, Pedido Repository, API da Transportadora
- **Tecnologia:** pedidos-api.jar, VPN site-to-site, Elasticsearch, Apache Kafka (MSK), MongoDB Atlas, PostgreSQL 16 (RDS), Redis (ElastiCache), Cluster Kubernetes (EKS), Servidor SAP (on-premises), Hospedagem de contêineres, Mensageria

### Dependências por aplicação

| Aplicação | Negócio que depende dela | Tecnologia que a sustenta |
| --- | --- | --- |
| ERP | Expedição, Faturamento, Entrega do pedido, Operador de Logística, Entrega Expressa, Venda Online | VPN site-to-site, Apache Kafka (MSK), Servidor SAP (on-premises), Mensageria |
| Plataforma de E-commerce | Atendente SAC, Tratar solicitação, Checkout, Expedição, Faturamento, Comprador, Atendimento pós-venda, Compra online, Entrega do pedido, Pagamento seguro, Cliente, Operador de Logística, Entrega Expressa, Venda Online | pedidos-api.jar, Elasticsearch, Apache Kafka (MSK), MongoDB Atlas, PostgreSQL 16 (RDS), Redis (ElastiCache), CDN CloudFront, Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria |
| App Mobile | Comprador, Cliente | pedidos-api.jar, Elasticsearch, Apache Kafka (MSK), MongoDB Atlas, PostgreSQL 16 (RDS), Redis (ElastiCache), Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria |
| BFF | Comprador, Cliente | pedidos-api.jar, Elasticsearch, Apache Kafka (MSK), MongoDB Atlas, PostgreSQL 16 (RDS), Redis (ElastiCache), Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria |
| Índice de Busca | Checkout, Comprador, Compra online, Pagamento seguro, Cliente, Venda Online | — |
| Cache de Carrinho | Atendente SAC, Tratar solicitação, Checkout, Comprador, Atendimento pós-venda, Compra online, Pagamento seguro, Cliente, Venda Online | — |
| API de Catálogo | Checkout, Comprador, Compra online, Pagamento seguro, Cliente, Venda Online | Elasticsearch, MongoDB Atlas, Cluster Kubernetes (EKS), Hospedagem de contêineres |
| DB Catálogo | Checkout, Comprador, Compra online, Pagamento seguro, Cliente, Venda Online | — |
| DB Pedidos | Atendente SAC, Tratar solicitação, Checkout, Comprador, Atendimento pós-venda, Compra online, Pagamento seguro, Cliente, Venda Online | — |
| Barramento de Eventos | Atendente SAC, Tratar solicitação, Checkout, Expedição, Faturamento, Comprador, Atendimento pós-venda, Compra online, Entrega do pedido, Pagamento seguro, Cliente, Operador de Logística, Entrega Expressa, Venda Online | — |
| API de Pedidos | Atendente SAC, Tratar solicitação, Checkout, Comprador, Atendimento pós-venda, Compra online, Pagamento seguro, Cliente, Venda Online | pedidos-api.jar, Apache Kafka (MSK), PostgreSQL 16 (RDS), Redis (ElastiCache), Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria |
| Web Storefront | Comprador, Cliente | pedidos-api.jar, Elasticsearch, Apache Kafka (MSK), MongoDB Atlas, PostgreSQL 16 (RDS), Redis (ElastiCache), CDN CloudFront, Cluster Kubernetes (EKS), Hospedagem de contêineres, Mensageria |

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
| `aplicacao-aninhada` | archimate | application | — | Plataforma de E-commerce — containers dentro do sistema |

## Histórico

| Data | Fonte | Resumo | Mudanças | Decisões |
| --- | --- | --- | --- | --- |
| 2026-10-02 | prompt agrupamentos | Plataformas de vendas e de back-office | +4 ~4 −0 | — |

## Notas

_Decisões, riscos e pendências._

## Modelo canônico

A fonte de verdade está em `architecture/`: `archlens.json` (manifesto), `model.json` ou `model/*.json` (elementos e relações), `views.json` (visões), `changelog.json` (histórico) e `notes/*.md` (texto autoral). Consulte-a com a CLI (`archlens views`, `archlens resolve`) em vez de copiar trechos daqui.
