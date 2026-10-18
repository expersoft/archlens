---
id: loja
type: application-component
title: Plataforma de E-commerce
aliases:
  - Plataforma de E-commerce
c4: softwareSystem
group: "[[grouping/plat-vendas|Plataforma de Vendas]]"
properties:
  owner: Squad Checkout
  criticidade: alta
sources:
  - kind: prompt
    ref: agrupamentos
tags:
  - archlens/application-component
  - archlens/c4/softwareSystem
---
# Plataforma de E-commerce

Vitrine, carrinho e checkout

<!-- archlens:begin -->
## Contém
- [[application-component/loja.app|App Mobile]]
- [[application-component/loja.bff|BFF]]
- [[application-component/loja.busca|Índice de Busca]]
- [[application-component/loja.cache|Cache de Carrinho]]
- [[application-component/loja.catalogo|API de Catálogo]]
- [[application-component/loja.db-catalogo|DB Catálogo]]
- [[application-component/loja.db-pedidos|DB Pedidos]]
- [[application-component/loja.eventos|Barramento de Eventos]]
- [[application-component/loja.pedidos|API de Pedidos]]
- [[application-component/loja.web|Web Storefront]]
<!-- archlens:end -->
