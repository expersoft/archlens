---
id: bp-expedicao
type: business-process
title: Expedição
aliases:
  - Expedição
relationships:
  - id: bp-expedicao-realization-bs-entrega
    type: realization
    to: bs-entrega
realization:
  - "[[business-service/bs-entrega|Entrega do pedido]]"
tags:
  - archlens/business-process
---
# Expedição

<!-- archlens:begin -->

## Relações

- **realization** → [[business-service/bs-entrega|Entrega do pedido]]

<!-- archlens:end -->
