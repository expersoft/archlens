---
id: ts-hosting
type: technology-service
title: Hospedagem de contêineres
aliases:
  - Hospedagem de contêineres
relationships:
  - id: ts-hosting-serving-loja.pedidos
    type: serving
    to: loja.pedidos
  - id: ts-hosting-serving-loja.catalogo
    type: serving
    to: loja.catalogo
  - id: ts-hosting-serving-loja.bff
    type: serving
    to: loja.bff
serving:
  - "[[application-component/loja.pedidos|API de Pedidos]]"
  - "[[application-component/loja.catalogo|API de Catálogo]]"
  - "[[application-component/loja.bff|BFF]]"
tags:
  - archlens/technology-service
---
# Hospedagem de contêineres

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.pedidos|API de Pedidos]]
- **serving** → [[application-component/loja.catalogo|API de Catálogo]]
- **serving** → [[application-component/loja.bff|BFF]]

<!-- archlens:end -->
