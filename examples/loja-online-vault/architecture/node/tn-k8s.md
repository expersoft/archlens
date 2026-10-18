---
id: tn-k8s
type: node
title: Cluster Kubernetes (EKS)
relationships:
  - id: tn-k8s-realization-ts-hosting
    type: realization
    to: ts-hosting
  - id: tn-k8s-assignment-art-pedidos
    type: assignment
    to: art-pedidos
assignment:
  - "[[artifact/art-pedidos|pedidos-api.jar]]"
realization:
  - "[[technology-service/ts-hosting|Hospedagem de contêineres]]"
tags:
  - archlens/node
---
# Cluster Kubernetes (EKS)

<!-- archlens:begin -->
## Relações
- **realization** → [[technology-service/ts-hosting|Hospedagem de contêineres]]
- **assignment** → [[artifact/art-pedidos|pedidos-api.jar]]
<!-- archlens:end -->
