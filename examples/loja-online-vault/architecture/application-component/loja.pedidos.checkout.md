---
id: loja.pedidos.checkout
type: application-component
title: Checkout Controller
aliases:
  - Checkout Controller
c4: component
parent: "[[application-component/loja.pedidos|API de Pedidos]]"
technology: Spring MVC
properties:
  squad: Checkout
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

## Fluxo do fechamento

1. Valida o carrinho e recalcula o total.
2. Pede a análise de risco antes de cobrar.
3. Chama o [[application-component/loja.pedidos.pagamento|Pagamento Adapter]].
4. Grava o pedido e publica `PedidoCriado`.

O fechamento é idempotente pela chave `Idempotency-Key`: repetir a chamada devolve o mesmo pedido.
