---
id: as-checkout
type: application-service
title: Serviço de Checkout
relationships:
  - id: as-checkout-serving-bp-checkout
    type: serving
    to: bp-checkout
serving:
  - "[[business-process/bp-checkout|Checkout]]"
tags:
  - archlens/application-service
---
# Serviço de Checkout

<!-- archlens:begin -->
## Relações
- **serving** → [[business-process/bp-checkout|Checkout]]
<!-- archlens:end -->
