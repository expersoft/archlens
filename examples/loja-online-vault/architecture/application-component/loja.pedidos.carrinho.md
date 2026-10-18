---
id: loja.pedidos.carrinho
type: application-component
title: Carrinho Service
c4: component
parent: "[[application-component/loja.pedidos|API de Pedidos]]"
technology: Spring Bean
relationships:
  - id: loja.pedidos.carrinho-serving-loja.bff
    type: serving
    to: loja.bff
    description: Gerencia carrinho
    technology: REST
  - id: loja.pedidos.carrinho-serving-loja.pedidos.checkout
    type: serving
    to: loja.pedidos.checkout
    description: Obtém itens
serving:
  - "[[application-component/loja.bff|BFF]]"
  - "[[application-component/loja.pedidos.checkout|Checkout Controller]]"
tags:
  - archlens/application-component
  - archlens/c4/component
---
# Carrinho Service

Itens, preços e cupons

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.bff|BFF]] — Gerencia carrinho [REST]
- **serving** → [[application-component/loja.pedidos.checkout|Checkout Controller]] — Obtém itens
<!-- archlens:end -->
