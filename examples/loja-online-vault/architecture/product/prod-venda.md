---
id: prod-venda
type: product
title: Venda Online
relationships:
  - id: prod-venda-aggregation-bs-compra
    type: aggregation
    to: bs-compra
  - id: prod-venda-aggregation-bs-pagamento
    type: aggregation
    to: bs-pagamento
  - id: prod-venda-aggregation-bs-entrega
    type: aggregation
    to: bs-entrega
  - id: prod-venda-aggregation-bs-atendimento
    type: aggregation
    to: bs-atendimento
  - id: prod-venda-aggregation-ct-termos
    type: aggregation
    to: ct-termos
aggregation:
  - "[[business-service/bs-compra|Compra online]]"
  - "[[business-service/bs-pagamento|Pagamento seguro]]"
  - "[[business-service/bs-entrega|Entrega do pedido]]"
  - "[[business-service/bs-atendimento|Atendimento pós-venda]]"
  - "[[contract/ct-termos|Termos de Compra]]"
tags:
  - archlens/product
---
# Venda Online

Oferta principal: comprar pela web/app e receber em casa

<!-- archlens:begin -->
## Relações
- **aggregation** → [[business-service/bs-compra|Compra online]]
- **aggregation** → [[business-service/bs-pagamento|Pagamento seguro]]
- **aggregation** → [[business-service/bs-entrega|Entrega do pedido]]
- **aggregation** → [[business-service/bs-atendimento|Atendimento pós-venda]]
- **aggregation** → [[contract/ct-termos|Termos de Compra]]
<!-- archlens:end -->
