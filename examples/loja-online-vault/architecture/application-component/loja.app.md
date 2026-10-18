---
id: loja.app
type: application-component
title: App Mobile
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: React Native
relationships:
  - id: loja.app-serving-cliente
    type: serving
    to: cliente
    description: Compra pelo celular
    technology: HTTPS
serving:
  - "[[business-actor/cliente|Cliente]]"
tags:
  - archlens/application-component
  - archlens/c4/container
---
# App Mobile

App iOS/Android

<!-- archlens:begin -->
## Relações
- **serving** → [[business-actor/cliente|Cliente]] — Compra pelo celular [HTTPS]
<!-- archlens:end -->
