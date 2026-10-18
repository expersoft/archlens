# API de Pedidos — matriz de dependência e impacto

Visão: `{"key":"impacto-api-pedidos","notation":"archimate","viewpoint":"impact","anchor":"loja.pedidos","traverse":{"mode":"both"},"output":["diagram","matrix"],"title":"API de Pedidos — matriz de dependência e impacto"}`

## Motivação

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Reduzir abandono de carrinho | goal | active |  |
| Checkout < 2s (p95) | requirement | active |  |

## Negócio

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Cliente | business-actor (person) | active |  |
| Atendente SAC | business-actor (person) | active |  |
| Venda Online | product | active |  |
| Compra online | business-service | active |  |
| Pagamento seguro | business-service | active |  |
| Atendimento pós-venda | business-service | active |  |
| Comprador | business-role (person) | active |  |
| Checkout | business-process | active |  |
| Tratar solicitação | business-process | active |  |

## Aplicação

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Web Storefront | application-component (container) | active | Next.js |
| App Mobile | application-component (container) | active | React Native |
| BFF | application-component (container) | active | Node.js / GraphQL |
| API de Pedidos | application-component (container) | active | Java / Spring Boot |
| Cache de Carrinho | application-component (container) | active | Redis |
| DB Pedidos | application-component (container) | active | PostgreSQL |
| Barramento de Eventos | application-component (container) | active | Kafka |
| CRM | application-component (softwareSystem) | active |  |
| Gateway de Pagamentos | application-component (softwareSystem) | active |  |
| Serviço Antifraude | application-component (softwareSystem) | active |  |
| Serviço de Checkout | application-service | active |  |
| Serviço de Pagamento | application-service | active |  |
| Consulta de Pedidos | application-service | active |  |
| Registro de Pedido | data-object | active |  |

## Tecnologia

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Cluster Kubernetes (EKS) | node | active |  |
| Hospedagem de contêineres | technology-service | active |  |
| Mensageria | technology-service | active |  |
| PostgreSQL 16 (RDS) | system-software | active |  |
| Redis (ElastiCache) | system-software | active |  |
| Apache Kafka (MSK) | system-software | active |  |
| pedidos-api.jar | artifact | active |  |

## Relações

- Web Storefront serve Cliente. (serving)
- App Mobile serve Cliente. (serving)
- BFF serve Web Storefront. (serving)
- BFF serve App Mobile. (serving)
- API de Pedidos serve CRM. (serving)
- CRM serve Atendente SAC. (serving)
- Venda Online agrega Compra online. (aggregation)
- Venda Online agrega Pagamento seguro. (aggregation)
- Venda Online agrega Atendimento pós-venda. (aggregation)
- Checkout realiza Compra online. (realization)
- Checkout realiza Pagamento seguro. (realization)
- Tratar solicitação realiza Atendimento pós-venda. (realization)
- Compra online serve Comprador. (serving)
- Cliente desempenha o papel Comprador. (assignment)
- Atendente SAC executa Tratar solicitação. (assignment)
- Serviço de Checkout serve Checkout. (serving)
- Serviço de Pagamento serve Checkout. (serving)
- API de Pedidos realiza Consulta de Pedidos. (realization)
- Consulta de Pedidos serve Tratar solicitação. (serving)
- CRM serve Tratar solicitação. (serving)
- Cluster Kubernetes (EKS) realiza Hospedagem de contêineres. (realization)
- Hospedagem de contêineres serve API de Pedidos. (serving)
- Hospedagem de contêineres serve BFF. (serving)
- Apache Kafka (MSK) realiza Mensageria. (realization)
- Mensageria serve API de Pedidos. (serving)
- PostgreSQL 16 (RDS) serve API de Pedidos. (serving)
- Redis (ElastiCache) serve API de Pedidos. (serving)
- pedidos-api.jar realiza API de Pedidos. (realization)
- pedidos-api.jar roda em Cluster Kubernetes (EKS). (assignment)
- Checkout contribui para Reduzir abandono de carrinho. (realization)
- API de Pedidos atende a Checkout < 2s (p95). (realization)
- Checkout < 2s (p95) influencia Reduzir abandono de carrinho. (influence)
- Cache de Carrinho serve API de Pedidos. (serving)
- Serviço Antifraude serve API de Pedidos. (serving)
- Gateway de Pagamentos serve API de Pedidos. (serving)
- DB Pedidos serve API de Pedidos. (serving)
- API de Pedidos lê e grava Registro de Pedido. (access)
- Barramento de Eventos serve API de Pedidos. (serving)
- API de Pedidos serve BFF. (serving)
- API de Pedidos realiza Serviço de Checkout. (realization)
- API de Pedidos realiza Serviço de Pagamento. (realization)

## Matriz de dependência

| Elemento | Tipo | Camada | Relação | Dist. | Caminho |
|---|---|---|---|---|---|
| Checkout < 2s (p95) | Requirement | Motivação | depende | 1 | realization → Checkout < 2s (p95) |
| Reduzir abandono de carrinho | Goal | Motivação | depende | 2 | realization → Checkout < 2s (p95) · influence → Reduzir abandono de carrinho |
| Atendente SAC | Business Actor | Negócio | depende | 2 | serving → CRM · serving → Atendente SAC |
| Tratar solicitação | Business Process | Negócio | depende | 2 | serving → CRM · serving → Tratar solicitação |
| Atendimento pós-venda | Business Service | Negócio | depende | 3 | serving → CRM · serving → Tratar solicitação · realization → Atendimento pós-venda |
| Checkout | Business Process | Negócio | depende | 3 | composition → Checkout Controller · realization → Serviço de Checkout · serving → Checkout |
| Cliente | Business Actor | Negócio | depende | 4 | composition → Checkout Controller · serving → BFF · serving → Web Storefront · serving → Cliente |
| Compra online | Business Service | Negócio | depende | 4 | composition → Checkout Controller · realization → Serviço de Checkout · serving → Checkout · realization → Compra online |
| Pagamento seguro | Business Service | Negócio | depende | 4 | composition → Checkout Controller · realization → Serviço de Checkout · serving → Checkout · realization → Pagamento seguro |
| Venda Online | Product | Negócio | depende | 4 | serving → CRM · serving → Tratar solicitação · realization → Atendimento pós-venda · aggregation → Venda Online |
| Comprador | Business Role | Negócio | depende | 5 | composition → Checkout Controller · serving → BFF · serving → Web Storefront · serving → Cliente · assignment → Comprador |
| Consulta de Pedidos | Application Service | Aplicação | depende | 1 | realization → Consulta de Pedidos |
| CRM | Application Component | Aplicação | depende | 1 | serving → CRM |
| BFF | Application Component | Aplicação | depende | 2 | composition → Checkout Controller · serving → BFF |
| Serviço de Checkout | Application Service | Aplicação | depende | 2 | composition → Checkout Controller · realization → Serviço de Checkout |
| Serviço de Pagamento | Application Service | Aplicação | depende | 2 | composition → Pagamento Adapter · realization → Serviço de Pagamento |
| App Mobile | Application Component | Aplicação | depende | 3 | composition → Checkout Controller · serving → BFF · serving → App Mobile |
| Web Storefront | Application Component | Aplicação | depende | 3 | composition → Checkout Controller · serving → BFF · serving → Web Storefront |
| Hospedagem de contêineres | Technology Service | Tecnologia | sustenta | 1 | serving → Hospedagem de contêineres |
| Mensageria | Technology Service | Tecnologia | sustenta | 1 | serving → Mensageria |
| pedidos-api.jar | Artifact | Tecnologia | sustenta | 1 | realization → pedidos-api.jar |
| PostgreSQL 16 (RDS) | System Software | Tecnologia | sustenta | 1 | serving → PostgreSQL 16 (RDS) |
| Redis (ElastiCache) | System Software | Tecnologia | sustenta | 1 | serving → Redis (ElastiCache) |
| Carrinho Service (oculto na visão) | Application Component | Aplicação | ambos | 1 | composition → Carrinho Service |
| Checkout Controller (oculto na visão) | Application Component | Aplicação | ambos | 1 | composition → Checkout Controller |
| Pagamento Adapter (oculto na visão) | Application Component | Aplicação | ambos | 1 | composition → Pagamento Adapter |
| Pedido Repository (oculto na visão) | Application Component | Aplicação | ambos | 1 | composition → Pedido Repository |
| Plataforma de E-commerce (oculto na visão) | Application Component | Aplicação | ambos | 1 | composition → Plataforma de E-commerce |
| Publicador de Eventos (oculto na visão) | Application Component | Aplicação | ambos | 1 | composition → Publicador de Eventos |
| Barramento de Eventos | Application Component | Aplicação | sustenta | 2 | composition → Publicador de Eventos · serving → Barramento de Eventos |
| Cache de Carrinho | Application Component | Aplicação | sustenta | 2 | composition → Carrinho Service · serving → Cache de Carrinho |
| DB Pedidos | Application Component | Aplicação | sustenta | 2 | composition → Pedido Repository · serving → DB Pedidos |
| Gateway de Pagamentos | Application Component | Aplicação | sustenta | 2 | composition → Pagamento Adapter · serving → Gateway de Pagamentos |
| Registro de Pedido | Data Object | Aplicação | sustenta | 2 | composition → Pedido Repository · access → Registro de Pedido |
| Serviço Antifraude | Application Component | Aplicação | sustenta | 2 | composition → Pagamento Adapter · serving → Serviço Antifraude |
| Apache Kafka (MSK) | System Software | Tecnologia | sustenta | 2 | serving → Mensageria · realization → Apache Kafka (MSK) |
| Cluster Kubernetes (EKS) | Node | Tecnologia | sustenta | 2 | serving → Hospedagem de contêineres · realization → Cluster Kubernetes (EKS) |
