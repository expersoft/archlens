---
id: loja.db-pedidos
type: application-component
title: DB Pedidos
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: PostgreSQL
relationships:
  - id: loja.db-pedidos-serving-loja.pedidos.repo
    type: serving
    to: loja.pedidos.repo
    description: Lê e grava pedidos
    technology: JDBC
serving:
  - "[[application-component/loja.pedidos.repo|Pedido Repository]]"
tags:
  - archlens/application-component
  - archlens/c4/container
  - archlens/tag/database
---
# DB Pedidos

Pedidos e pagamentos

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.pedidos.repo|Pedido Repository]] — Lê e grava pedidos [JDBC]
<!-- archlens:end -->
