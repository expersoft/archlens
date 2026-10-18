---
id: loja.cache
type: application-component
title: Cache de Carrinho
aliases:
  - Cache de Carrinho
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Redis
relationships:
  - id: loja.cache-serving-loja.pedidos.carrinho
    type: serving
    to: loja.pedidos.carrinho
    description: Lê e grava carrinho
    technology: RESP
serving:
  - "[[application-component/loja.pedidos.carrinho|Carrinho Service]]"
tags:
  - archlens/application-component
  - archlens/c4/container
  - archlens/tag/database
---
# Cache de Carrinho

Carrinhos ativos

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.pedidos.carrinho|Carrinho Service]] — Lê e grava carrinho [RESP]
<!-- archlens:end -->
