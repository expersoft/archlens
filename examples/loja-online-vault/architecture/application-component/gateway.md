---
id: gateway
type: application-component
title: Gateway de Pagamentos
c4: softwareSystem
external: true
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
