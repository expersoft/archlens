---
id: loja.pedidos.eventos
type: application-component
title: Publicador de Eventos
aliases:
  - Publicador de Eventos
c4: component
parent: "[[application-component/loja.pedidos|API de Pedidos]]"
technology: Kafka client
relationships:
  - id: loja.pedidos.eventos-serving-loja.pedidos.checkout
    type: serving
    to: loja.pedidos.checkout
    description: Publica PedidoCriado
serving:
  - "[[application-component/loja.pedidos.checkout|Checkout Controller]]"
tags:
  - archlens/application-component
  - archlens/c4/component
---
# Publicador de Eventos

Publica eventos de domínio

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.pedidos.checkout|Checkout Controller]] — Publica PedidoCriado

<!-- archlens:end -->
