---
id: loja.pedidos.pagamento
type: application-component
title: Pagamento Adapter
aliases:
  - Pagamento Adapter
c4: component
parent: "[[application-component/loja.pedidos|API de Pedidos]]"
technology: Spring Bean
relationships:
  - id: loja.pedidos.pagamento-serving-loja.pedidos.checkout
    type: serving
    to: loja.pedidos.checkout
    description: Solicita autorização
  - id: loja.pedidos.pagamento-realization-as-pagamento
    type: realization
    to: as-pagamento
realization:
  - "[[application-service/as-pagamento|Serviço de Pagamento]]"
serving:
  - "[[application-component/loja.pedidos.checkout|Checkout Controller]]"
tags:
  - archlens/application-component
  - archlens/c4/component
---
# Pagamento Adapter

Antifraude + autorização no gateway

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.pedidos.checkout|Checkout Controller]] — Solicita autorização
- **realization** → [[application-service/as-pagamento|Serviço de Pagamento]]
<!-- archlens:end -->
