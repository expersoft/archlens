---
id: loja.busca
type: application-component
title: Índice de Busca
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Elasticsearch
relationships:
  - id: loja.busca-serving-loja.bff
    type: serving
    to: loja.bff
    description: Busca textual
    technology: HTTP
  - id: loja.busca-serving-loja.catalogo
    type: serving
    to: loja.catalogo
    description: Indexa produtos
    technology: HTTP
serving:
  - "[[application-component/loja.bff|BFF]]"
  - "[[application-component/loja.catalogo|API de Catálogo]]"
tags:
  - archlens/application-component
  - archlens/c4/container
  - archlens/tag/database
---
# Índice de Busca

Busca textual de produtos

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.bff|BFF]] — Busca textual [HTTP]
- **serving** → [[application-component/loja.catalogo|API de Catálogo]] — Indexa produtos [HTTP]
<!-- archlens:end -->
