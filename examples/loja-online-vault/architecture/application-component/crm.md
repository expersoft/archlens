---
id: crm
type: application-component
title: CRM
aliases:
  - CRM
c4: softwareSystem
group: "[[grouping/plat-backoffice|Plataforma de Back-office]]"
external: true
sources:
  - kind: prompt
    ref: agrupamentos
relationships:
  - id: crm-serving-atendente
    type: serving
    to: atendente
    description: Atende clientes
  - id: crm-serving-bp-atendimento
    type: serving
    to: bp-atendimento
serving:
  - "[[business-actor/atendente|Atendente SAC]]"
  - "[[business-process/bp-atendimento|Tratar solicitação]]"
tags:
  - archlens/application-component
  - archlens/c4/softwareSystem
---
# CRM

Atendimento (SaaS)

<!-- archlens:begin -->

## Relações

- **serving** → [[business-actor/atendente|Atendente SAC]] — Atende clientes
- **serving** → [[business-process/bp-atendimento|Tratar solicitação]]

<!-- archlens:end -->
