---
id: antifraude
type: application-component
title: Serviço Antifraude
aliases:
  - Serviço Antifraude
c4: softwareSystem
group: "[[grouping/plat-vendas|Plataforma de Vendas]]"
external: true
sources:
  - kind: prompt
    ref: agrupamentos
relationships:
  - id: antifraude-serving-loja.pedidos.pagamento
    type: serving
    to: loja.pedidos.pagamento
    description: Avalia risco
    technology: HTTPS
serving:
  - "[[application-component/loja.pedidos.pagamento|Pagamento Adapter]]"
tags:
  - archlens/application-component
  - archlens/c4/softwareSystem
---
# Serviço Antifraude

Score de risco da transação

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.pedidos.pagamento|Pagamento Adapter]] — Avalia risco [HTTPS]

<!-- archlens:end -->
