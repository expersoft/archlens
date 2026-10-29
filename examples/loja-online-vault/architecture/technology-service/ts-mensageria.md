---
id: ts-mensageria
type: technology-service
title: Mensageria
aliases:
  - Mensageria
relationships:
  - id: ts-mensageria-serving-loja.pedidos
    type: serving
    to: loja.pedidos
  - id: ts-mensageria-serving-erp
    type: serving
    to: erp
serving:
  - "[[application-component/loja.pedidos|API de Pedidos]]"
  - "[[application-component/erp|ERP]]"
tags:
  - archlens/technology-service
---
# Mensageria

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.pedidos|API de Pedidos]]
- **serving** → [[application-component/erp|ERP]]

<!-- archlens:end -->
