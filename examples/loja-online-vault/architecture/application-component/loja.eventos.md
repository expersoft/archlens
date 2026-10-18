---
id: loja.eventos
type: application-component
title: Barramento de Eventos
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Kafka
relationships:
  - id: loja.eventos-serving-loja.pedidos.eventos
    type: serving
    to: loja.pedidos.eventos
    description: Publica eventos
    technology: Kafka
  - id: loja.eventos-serving-erp
    type: serving
    to: erp
    description: Consome pedidos pagos
    technology: Kafka
serving:
  - "[[application-component/loja.pedidos.eventos|Publicador de Eventos]]"
  - "[[application-component/erp|ERP]]"
tags:
  - archlens/application-component
  - archlens/c4/container
  - archlens/tag/queue
---
# Barramento de Eventos

Tópicos de pedidos e estoque

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.pedidos.eventos|Publicador de Eventos]] — Publica eventos [Kafka]
- **serving** → [[application-component/erp|ERP]] — Consome pedidos pagos [Kafka]
<!-- archlens:end -->
