---
id: cliente
type: business-actor
title: Cliente
aliases:
  - Cliente
c4: person
relationships:
  - id: cliente-assignment-br-comprador
    type: assignment
    to: br-comprador
assignment:
  - "[[business-role/br-comprador|Comprador]]"
tags:
  - archlens/business-actor
  - archlens/c4/person
---
# Cliente

Compra produtos pela web ou pelo app

<!-- archlens:begin -->
## Relações
- **assignment** → [[business-role/br-comprador|Comprador]]
<!-- archlens:end -->
