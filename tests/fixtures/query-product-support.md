# Oferta Venda Online — o que a sustenta

Visão: `{"key":"suporte-venda-online","notation":"archimate","viewpoint":"product-support","anchor":"prod-venda","traverse":{"mode":"supporters"},"collapse":["application-service","technology-service"],"title":"Oferta Venda Online — o que a sustenta"}`

## Negócio

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Atendente SAC | business-actor (person) | active |  |
| Operador de Logística | business-actor (person) | active |  |
| Venda Online | product | active |  |
| Termos de Compra | contract | active |  |
| Compra online | business-service | active |  |
| Pagamento seguro | business-service | active |  |
| Entrega do pedido | business-service | active |  |
| Atendimento pós-venda | business-service | active |  |
| Checkout | business-process | active |  |
| Expedição | business-process | active |  |
| Tratar solicitação | business-process | active |  |
| Pedido | business-object | active |  |

## Aplicação

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| API de Pedidos | application-component (container) | active | Java / Spring Boot |
| API de Catálogo | application-component (container) | active | Go |
| Índice de Busca | application-component (container) | active | Elasticsearch |
| Cache de Carrinho | application-component (container) | active | Redis |
| DB Pedidos | application-component (container) | active | PostgreSQL |
| DB Catálogo | application-component (container) | active | MongoDB |
| Barramento de Eventos | application-component (container) | active | Kafka |
| ERP | application-component (softwareSystem) | active | SAP ECC |
| CRM | application-component (softwareSystem) | active |  |
| Gateway de Pagamentos | application-component (softwareSystem) | active |  |
| Serviço Antifraude | application-component (softwareSystem) | active |  |
| API da Transportadora | application-component (softwareSystem) | active |  |
| Registro de Pedido | data-object | active |  |
| Registro de Produto | data-object | active |  |

## Tecnologia

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Cluster Kubernetes (EKS) | node | active |  |
| PostgreSQL 16 (RDS) | system-software | active |  |
| MongoDB Atlas | system-software | active |  |
| Redis (ElastiCache) | system-software | active |  |
| Apache Kafka (MSK) | system-software | active |  |
| Elasticsearch | system-software | active |  |
| Servidor SAP (on-premises) | node | active |  |
| VPN site-to-site | communication-network | active |  |
| pedidos-api.jar | artifact | active |  |

## Relações

- DB Catálogo serve API de Catálogo. (serving)
- Índice de Busca serve API de Catálogo. (serving)
- Barramento de Eventos serve ERP. (serving)
- API da Transportadora serve ERP. (serving)
- API de Pedidos serve CRM. (serving)
- CRM serve Atendente SAC. (serving)
- ERP serve Operador de Logística. (serving)
- Venda Online agrega Compra online. (aggregation)
- Venda Online agrega Pagamento seguro. (aggregation)
- Venda Online agrega Entrega do pedido. (aggregation)
- Venda Online agrega Atendimento pós-venda. (aggregation)
- Venda Online agrega Termos de Compra. (aggregation)
- Checkout realiza Compra online. (realization)
- Checkout realiza Pagamento seguro. (realization)
- Expedição realiza Entrega do pedido. (realization)
- Tratar solicitação realiza Atendimento pós-venda. (realization)
- Atendente SAC executa Tratar solicitação. (assignment)
- Operador de Logística executa Expedição. (assignment)
- Checkout grava Pedido. (access)
- CRM serve Tratar solicitação. (serving)
- Registro de Pedido realiza Pedido. (realization)
- API de Catálogo lê e grava Registro de Produto. (access)
- PostgreSQL 16 (RDS) serve API de Pedidos. (serving)
- Redis (ElastiCache) serve API de Pedidos. (serving)
- MongoDB Atlas serve API de Catálogo. (serving)
- Elasticsearch serve API de Catálogo. (serving)
- Servidor SAP (on-premises) serve ERP. (serving)
- VPN site-to-site serve ERP. (serving)
- pedidos-api.jar realiza API de Pedidos. (realization)
- pedidos-api.jar roda em Cluster Kubernetes (EKS). (assignment)
- API de Catálogo serve Checkout. (serving)
- API de Pedidos serve Tratar solicitação. (serving)
- Serviço Antifraude serve Checkout. (serving)
- Gateway de Pagamentos serve Checkout. (serving)
- Cache de Carrinho serve Checkout. (serving)
- DB Pedidos serve Checkout. (serving)
- Cluster Kubernetes (EKS) serve API de Catálogo. (serving)
- Apache Kafka (MSK) serve ERP. (serving)
