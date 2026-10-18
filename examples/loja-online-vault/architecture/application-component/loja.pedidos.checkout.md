---
id: loja.pedidos.checkout
type: application-component
title: Checkout Controller
c4: component
parent: "[[application-component/loja.pedidos|API de Pedidos]]"
technology: Spring MVC
relationships:
  - id: loja.pedidos.checkout-serving-loja.bff
    type: serving
    to: loja.bff
    description: Fecha pedido
    technology: REST
  - id: loja.pedidos.checkout-realization-as-checkout
    type: realization
    to: as-checkout
realization:
  - "[[application-service/as-checkout|Serviço de Checkout]]"
serving:
  - "[[application-component/loja.bff|BFF]]"
tags:
  - archlens/application-component
  - archlens/c4/component
---
# Checkout Controller

Orquestra o fechamento do pedido

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.bff|BFF]] — Fecha pedido [REST]
- **realization** → [[application-service/as-checkout|Serviço de Checkout]]
<!-- archlens:end -->
