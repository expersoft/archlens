---
id: ss-postgres
type: system-software
title: PostgreSQL 16 (RDS)
aliases:
  - PostgreSQL 16 (RDS)
relationships:
  - id: ss-postgres-serving-loja.pedidos
    type: serving
    to: loja.pedidos
serving:
  - "[[application-component/loja.pedidos|API de Pedidos]]"
tags:
  - archlens/system-software
---
# PostgreSQL 16 (RDS)

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.pedidos|API de Pedidos]]
<!-- archlens:end -->
