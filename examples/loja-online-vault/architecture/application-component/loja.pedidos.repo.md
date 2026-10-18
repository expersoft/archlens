---
id: loja.pedidos.repo
type: application-component
title: Pedido Repository
aliases:
  - Pedido Repository
c4: component
parent: "[[application-component/loja.pedidos|API de Pedidos]]"
technology: Spring Data JPA
relationships:
  - id: loja.pedidos.repo-serving-loja.pedidos.checkout
    type: serving
    to: loja.pedidos.checkout
    description: Persiste pedido
  - id: loja.pedidos.repo-access-do-pedido
    type: access
    to: do-pedido
    accessType: write
serving:
  - "[[application-component/loja.pedidos.checkout|Checkout Controller]]"
access:
  - "[[data-object/do-pedido|Registro de Pedido]]"
tags:
  - archlens/application-component
  - archlens/c4/component
---
# Pedido Repository

Persistência de pedidos

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.pedidos.checkout|Checkout Controller]] — Persiste pedido
- **access** (write) → [[data-object/do-pedido|Registro de Pedido]]
<!-- archlens:end -->
