---
id: transportadora
type: application-component
title: API da Transportadora
aliases:
  - API da Transportadora
c4: softwareSystem
external: true
relationships:
  - id: transportadora-serving-erp
    type: serving
    to: erp
    description: Solicita coleta
    technology: REST
serving:
  - "[[application-component/erp|ERP]]"
tags:
  - archlens/application-component
  - archlens/c4/softwareSystem
---
# API da Transportadora

Coleta e rastreio

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/erp|ERP]] — Solicita coleta [REST]

<!-- archlens:end -->
