---
id: erp
type: application-component
title: ERP
aliases:
  - ERP
c4: softwareSystem
group: "[[grouping/plat-backoffice|Plataforma de Back-office]]"
technology: SAP ECC
properties:
  owner: TI Corporativa
sources:
  - kind: prompt
    ref: agrupamentos
relationships:
  - id: erp-serving-operador
    type: serving
    to: operador
    description: Gerencia expedição
  - id: erp-realization-as-faturamento
    type: realization
    to: as-faturamento
  - id: erp-realization-as-logistica
    type: realization
    to: as-logistica
realization:
  - "[[application-service/as-faturamento|Serviço de Faturamento]]"
  - "[[application-service/as-logistica|Serviço de Logística]]"
serving:
  - "[[business-actor/operador|Operador de Logística]]"
tags:
  - archlens/application-component
  - archlens/c4/softwareSystem
---
# ERP

Faturamento, fiscal e expedição (legado on-premises)

<!-- archlens:begin -->

## Relações

- **serving** → [[business-actor/operador|Operador de Logística]] — Gerencia expedição
- **realization** → [[application-service/as-faturamento|Serviço de Faturamento]]
- **realization** → [[application-service/as-logistica|Serviço de Logística]]

<!-- archlens:end -->
