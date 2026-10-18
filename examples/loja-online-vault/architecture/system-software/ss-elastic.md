---
id: ss-elastic
type: system-software
title: Elasticsearch
aliases:
  - Elasticsearch
relationships:
  - id: ss-elastic-serving-loja.catalogo
    type: serving
    to: loja.catalogo
serving:
  - "[[application-component/loja.catalogo|API de Catálogo]]"
tags:
  - archlens/system-software
---
# Elasticsearch

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.catalogo|API de Catálogo]]
<!-- archlens:end -->
