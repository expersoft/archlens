---
id: atendente
type: business-actor
title: Atendente SAC
aliases:
  - Atendente SAC
c4: person
relationships:
  - id: atendente-assignment-bp-atendimento
    type: assignment
    to: bp-atendimento
assignment:
  - "[[business-process/bp-atendimento|Tratar solicitação]]"
tags:
  - archlens/business-actor
  - archlens/c4/person
---
# Atendente SAC

Resolve dúvidas e problemas de pedidos

<!-- archlens:begin -->

## Relações

- **assignment** → [[business-process/bp-atendimento|Tratar solicitação]]

<!-- archlens:end -->
