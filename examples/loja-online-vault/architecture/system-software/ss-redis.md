---
id: ss-redis
type: system-software
title: Redis (ElastiCache)
aliases:
  - Redis (ElastiCache)
relationships:
  - id: ss-redis-serving-loja.pedidos
    type: serving
    to: loja.pedidos
serving:
  - "[[application-component/loja.pedidos|API de Pedidos]]"
tags:
  - archlens/system-software
---
# Redis (ElastiCache)

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.pedidos|API de Pedidos]]

<!-- archlens:end -->
