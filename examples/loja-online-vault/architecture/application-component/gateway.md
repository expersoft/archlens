---
id: gateway
type: application-component
title: Gateway de Pagamentos
aliases:
  - Gateway de Pagamentos
c4: softwareSystem
external: true
properties:
  squad: Pagamentos
relationships:
  - id: gateway-serving-loja.pedidos.pagamento
    type: serving
    to: loja.pedidos.pagamento
    description: Autoriza pagamento
    technology: HTTPS
serving:
  - "[[application-component/loja.pedidos.pagamento|Pagamento Adapter]]"
tags:
  - archlens/application-component
  - archlens/c4/softwareSystem
---
# Gateway de Pagamentos

Autoriza cartões e Pix

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/loja.pedidos.pagamento|Pagamento Adapter]] — Autoriza pagamento [HTTPS]

<!-- archlens:end -->

## Contrato

Fornecedor externo de cartões e Pix, acessado por HTTPS. O contrato prevê 99,9% de disponibilidade e janela de
manutenção aos domingos, das 2h às 4h.

## Quando falha

Timeouts não são recusa de pagamento: o [[application-component/loja.pedidos.pagamento|Pagamento Adapter]] consulta a
transação antes de tentar de novo, para não cobrar duas vezes.
