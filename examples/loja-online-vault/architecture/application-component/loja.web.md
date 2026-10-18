---
id: loja.web
type: application-component
title: Web Storefront
aliases:
  - Web Storefront
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Next.js
relationships:
  - id: loja.web-serving-cliente
    type: serving
    to: cliente
    description: Navega e compra
    technology: HTTPS
serving:
  - "[[business-actor/cliente|Cliente]]"
tags:
  - archlens/application-component
  - archlens/c4/container
---
# Web Storefront

Vitrine e checkout web

<!-- archlens:begin -->

## Relações

- **serving** → [[business-actor/cliente|Cliente]] — Navega e compra [HTTPS]

<!-- archlens:end -->
