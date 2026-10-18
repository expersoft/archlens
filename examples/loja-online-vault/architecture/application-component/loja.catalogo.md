---
id: loja.catalogo
type: application-component
title: API de Catálogo
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Go
relationships:
  - id: loja.catalogo-serving-loja.bff
    type: serving
    to: loja.bff
    description: Consulta produtos
    technology: REST
  - id: loja.catalogo-realization-as-catalogo
    type: realization
    to: as-catalogo
  - id: loja.catalogo-access-do-produto
    type: access
    to: do-produto
    accessType: readwrite
realization:
  - "[[application-service/as-catalogo|Serviço de Catálogo]]"
serving:
  - "[[application-component/loja.bff|BFF]]"
access:
  - "[[data-object/do-produto|Registro de Produto]]"
tags:
  - archlens/application-component
  - archlens/c4/container
---
# API de Catálogo

Produtos, preços e estoque

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.bff|BFF]] — Consulta produtos [REST]
- **realization** → [[application-service/as-catalogo|Serviço de Catálogo]]
- **access** (readwrite) → [[data-object/do-produto|Registro de Produto]]
<!-- archlens:end -->
