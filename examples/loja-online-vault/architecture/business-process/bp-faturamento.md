---
id: bp-faturamento
type: business-process
title: Faturamento
aliases:
  - Faturamento
relationships:
  - id: bp-faturamento-triggering-bp-expedicao
    type: triggering
    to: bp-expedicao
  - id: bp-faturamento-access-bo-pedido
    type: access
    to: bo-pedido
    accessType: read
  - id: bp-faturamento-access-bo-nota
    type: access
    to: bo-nota
    accessType: write
access:
  - "[[business-object/bo-pedido|Pedido]]"
  - "[[business-object/bo-nota|Nota Fiscal]]"
triggering:
  - "[[business-process/bp-expedicao|Expedição]]"
tags:
  - archlens/business-process
---
# Faturamento

<!-- archlens:begin -->

## Relações

- **triggering** → [[business-process/bp-expedicao|Expedição]]
- **access** (read) → [[business-object/bo-pedido|Pedido]]
- **access** (write) → [[business-object/bo-nota|Nota Fiscal]]

<!-- archlens:end -->
