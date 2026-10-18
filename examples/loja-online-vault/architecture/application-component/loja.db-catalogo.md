---
id: loja.db-catalogo
type: application-component
title: DB Catálogo
aliases:
  - DB Catálogo
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: MongoDB
relationships:
  - id: loja.db-catalogo-serving-loja.catalogo
    type: serving
    to: loja.catalogo
    description: Lê e grava produtos
    technology: MongoDB wire
serving:
  - "[[application-component/loja.catalogo|API de Catálogo]]"
tags:
  - archlens/application-component
  - archlens/c4/container
  - archlens/tag/database
---
# DB Catálogo

Produtos e atributos

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.catalogo|API de Catálogo]] — Lê e grava produtos [MongoDB wire]
<!-- archlens:end -->
