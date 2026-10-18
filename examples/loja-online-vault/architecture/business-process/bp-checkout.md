---
id: bp-checkout
type: business-process
title: Checkout
aliases:
  - Checkout
relationships:
  - id: bp-checkout-realization-bs-compra
    type: realization
    to: bs-compra
  - id: bp-checkout-realization-bs-pagamento
    type: realization
    to: bs-pagamento
  - id: bp-checkout-triggering-bp-faturamento
    type: triggering
    to: bp-faturamento
  - id: bp-checkout-access-bo-pedido
    type: access
    to: bo-pedido
    accessType: write
  - id: bp-checkout-realization-goal-abandono
    type: realization
    to: goal-abandono
realization:
  - "[[business-service/bs-compra|Compra online]]"
  - "[[business-service/bs-pagamento|Pagamento seguro]]"
  - "[[goal/goal-abandono|Reduzir abandono de carrinho]]"
access:
  - "[[business-object/bo-pedido|Pedido]]"
triggering:
  - "[[business-process/bp-faturamento|Faturamento]]"
tags:
  - archlens/business-process
---
# Checkout

Do carrinho ao pedido pago

<!-- archlens:begin -->
## Relações
- **realization** → [[business-service/bs-compra|Compra online]]
- **realization** → [[business-service/bs-pagamento|Pagamento seguro]]
- **triggering** → [[business-process/bp-faturamento|Faturamento]]
- **access** (write) → [[business-object/bo-pedido|Pedido]]
- **realization** → [[goal/goal-abandono|Reduzir abandono de carrinho]]
<!-- archlens:end -->
