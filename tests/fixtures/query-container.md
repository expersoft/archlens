# Container — Plataforma de E-commerce

Visão: `{"key":"view","notation":"c4","level":"container","scope":"loja"}`

## Pessoas

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Cliente | business-actor (person) | active |  |

## Sistemas de software

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| ERP | application-component (softwareSystem) | active | SAP ECC |
| CRM | application-component (softwareSystem) | active |  |
| Gateway de Pagamentos | application-component (softwareSystem) | active |  |
| Serviço Antifraude | application-component (softwareSystem) | active |  |

## Contêineres

| Nome | Tipo | Status | Tecnologia |
|---|---|---|---|
| Web Storefront | application-component (container) | active | Next.js |
| App Mobile | application-component (container) | active | React Native |
| BFF | application-component (container) | active | Node.js / GraphQL |
| API de Pedidos | application-component (container) | active | Java / Spring Boot |
| API de Catálogo | application-component (container) | active | Go |
| Índice de Busca | application-component (container) | active | Elasticsearch |
| Cache de Carrinho | application-component (container) | active | Redis |
| DB Pedidos | application-component (container) | active | PostgreSQL |
| DB Catálogo | application-component (container) | active | MongoDB |
| Barramento de Eventos | application-component (container) | active | Kafka |

## Relações

- Cliente usa Web Storefront. (uses)
- Cliente usa App Mobile. (uses)
- Web Storefront usa BFF. (uses)
- App Mobile usa BFF. (uses)
- BFF usa API de Catálogo. (uses)
- BFF usa Índice de Busca. (uses)
- BFF usa API de Pedidos. (uses)
- API de Catálogo usa DB Catálogo. (uses)
- API de Catálogo usa Índice de Busca. (uses)
- API de Pedidos usa Cache de Carrinho. (uses)
- API de Pedidos usa DB Pedidos. (uses)
- API de Pedidos usa Serviço Antifraude. (uses)
- API de Pedidos usa Gateway de Pagamentos. (uses)
- API de Pedidos usa Barramento de Eventos. (uses)
- ERP usa Barramento de Eventos. (uses)
- CRM usa API de Pedidos. (uses)
