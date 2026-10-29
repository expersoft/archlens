---
id: loja.bff
type: application-component
title: BFF
aliases:
  - BFF
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Node.js / GraphQL
relationships:
  - id: loja.bff-serving-loja.web
    type: serving
    to: loja.web
    description: Consulta e envia pedidos
    technology: GraphQL
  - id: loja.bff-serving-loja.app
    type: serving
    to: loja.app
    description: Consulta e envia pedidos
    technology: GraphQL
serving:
  - "[[application-component/loja.web|Web Storefront]]"
  - "[[application-component/loja.app|App Mobile]]"
tags:
  - archlens/application-component
  - archlens/c4/container
---
# BFF

Agrega APIs para os canais

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.web|Web Storefront]] — Consulta e envia pedidos [GraphQL]
- **serving** → [[application-component/loja.app|App Mobile]] — Consulta e envia pedidos [GraphQL]

<!-- archlens:end -->
