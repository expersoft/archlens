---
id: loja.pedidos
type: application-component
title: API de Pedidos
aliases:
  - API de Pedidos
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Java / Spring Boot
properties:
  squad: Checkout
relationships:
  - id: loja.pedidos-serving-crm
    type: serving
    to: crm
    description: Consulta pedidos
    technology: REST
  - id: loja.pedidos-realization-as-consulta
    type: realization
    to: as-consulta
  - id: loja.pedidos-realization-req-latencia
    type: realization
    to: req-latencia
realization:
  - "[[application-service/as-consulta|Consulta de Pedidos]]"
  - "[[requirement/req-latencia|Checkout < 2s (p95)]]"
serving:
  - "[[application-component/crm|CRM]]"
tags:
  - archlens/application-component
  - archlens/c4/container
---
# API de Pedidos

Carrinho, checkout e ciclo de vida do pedido

<!-- archlens:begin -->

## Relações

- **serving** → [[application-component/crm|CRM]] — Consulta pedidos [REST]
- **realization** → [[application-service/as-consulta|Consulta de Pedidos]]
- **realization** → [[requirement/req-latencia|Checkout < 2s (p95)]]

## Contém

- [[application-component/loja.pedidos.carrinho|Carrinho Service]]
- [[application-component/loja.pedidos.checkout|Checkout Controller]]
- [[application-component/loja.pedidos.eventos|Publicador de Eventos]]
- [[application-component/loja.pedidos.pagamento|Pagamento Adapter]]
- [[application-component/loja.pedidos.repo|Pedido Repository]]

<!-- archlens:end -->

## Responsabilidades

A API de Pedidos é dona do carrinho e do ciclo de vida do pedido: criação, pagamento, faturamento e entrega. Nenhum outro
container grava em pedidos; o [[application-component/crm|CRM]] e o atendimento consultam por REST.

## Arquitetura

- **Entrada:** o [[application-component/loja.pedidos.checkout|Checkout Controller]] recebe o fechamento vindo do BFF.
- **Pagamento:** o [[application-component/loja.pedidos.pagamento|Pagamento Adapter]] isola o gateway externo.
- **Eventos:** cada mudança de estado sai pelo [[application-component/loja.pedidos.eventos|Publicador de Eventos]].

## Operação

| Sinal | Alvo |
|---|---|
| p95 do checkout | abaixo de 2 s |
| Pedidos sem evento publicado | zero |

Em incidente, comece pelos pedidos parados em `AGUARDANDO_PAGAMENTO`.
