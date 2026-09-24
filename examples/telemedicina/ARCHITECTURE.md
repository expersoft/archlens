---
archlens: "1.0"
name: "Teleconsulta — Clínica Vida"
generated: 2026-09-24
notations: [c4, archimate]
elements: 32
relationships: 44
---

# Teleconsulta — Clínica Vida

> Base de conhecimento gerada pela skill **archlens**. As tabelas são derivadas do bloco
> `archlens-json` no fim do documento, que é a fonte de verdade: edite o JSON e regenere.
> Texto entre marcadores `<!-- keep:... -->` é preservado ao regenerar.

## Visão geral

<!-- keep:overview -->
Modelo extraído de texto livre (ver entrada.md). Itens marcados como inferidos não foram ditos explicitamente e precisam de confirmação.
<!-- /keep:overview -->

## Resumo

| Camada | Elementos |
| --- | --- |
| Negócio | 11 |
| Aplicação | 16 |
| Tecnologia | 5 |

| Tipo C4 | Quantidade |
| --- | --- |
| Person | 2 |
| Software System | 6 |
| Container | 6 |

## Contexto e atores

| Ator | Tipo | Descrição | id |
| --- | --- | --- | --- |
| Paciente | Business Actor | Agenda, paga e participa da teleconsulta | `paciente` |
| Médico | Business Actor | Atende, registra prontuário e emite receita | `medico` |

## Modelo C4

### Plataforma de Teleconsulta — Software System

Agendamento, pagamento e sala de vídeo

| Container | Tecnologia | Descrição | id |
| --- | --- | --- | --- |
| App do Paciente | React Native | — | `tele.app` |
| Site do Paciente | SPA | — | `tele.site` |
| Portal Médico | Web | — | `tele.portal-medico` |
| API de Agendamento | Node.js | Agenda, cobrança e criação de salas | `tele.api` |
| Banco de Agendamentos 🛢 | PostgreSQL | — | `tele.db` |
| Worker de Notificações | Node.js | — | `tele.notificador` |

### PEP (Tasy) — Software System

Prontuário eletrônico legado

### Twilio Video — Software System (externo)

### Gateway de Pagamento — Software System (externo)

### WhatsApp Business API — Software System (externo)

### Assinatura ICP-Brasil — Software System (externo)

## Camada de Negócio

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| Paciente | Business Actor (C4 Person) | Agenda, paga e participa da teleconsulta | `paciente` |
| Médico | Business Actor (C4 Person) | Atende, registra prontuário e emite receita | `medico` |
| Teleconsulta | Product | — | `prod-tele` |
| Agendamento de consulta | Business Service | — | `bs-agendamento` |
| Consulta por vídeo | Business Service | — | `bs-consulta` |
| Receita digital | Business Service | — | `bs-receita` |
| Agendar teleconsulta | Business Process | — | `bp-agendar` |
| Realizar teleconsulta | Business Process | — | `bp-realizar` |
| Emitir receita | Business Process | — | `bp-emitir` |
| Prontuário | Business Object | — | `bo-prontuario` |
| Receita | Business Object | — | `bo-receita` |

## Camada de Aplicação

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| Plataforma de Teleconsulta | Application Component (C4 Software System) | Agendamento, pagamento e sala de vídeo | `tele` |
| App do Paciente ⚠︎ | Application Component (C4 Container) | — | `tele.app` |
| Site do Paciente | Application Component (C4 Container) | — | `tele.site` |
| Portal Médico | Application Component (C4 Container) | — | `tele.portal-medico` |
| API de Agendamento | Application Component (C4 Container) | Agenda, cobrança e criação de salas | `tele.api` |
| Banco de Agendamentos | Data Object (C4 Container) | — | `tele.db` |
| Worker de Notificações ⚠︎ | Application Component (C4 Container) | — | `tele.notificador` |
| PEP (Tasy) | Application Component (C4 Software System) | Prontuário eletrônico legado | `pep` |
| Twilio Video | Application Component (C4 Software System) | — | `twilio` |
| Gateway de Pagamento ⚠︎ | Application Component (C4 Software System) | — | `gateway` |
| WhatsApp Business API | Application Component (C4 Software System) | — | `whatsapp` |
| Assinatura ICP-Brasil ⚠︎ | Application Component (C4 Software System) | — | `icp` |
| Agenda e cobrança | Application Service | — | `as-agenda` |
| Sala de vídeo | Application Service | — | `as-video` |
| Registro clínico | Application Service | — | `as-registro` |
| Assinatura digital | Application Service | — | `as-assinatura` |

## Camada de Tecnologia

| Elemento | Tipo ArchiMate | Descrição | id |
| --- | --- | --- | --- |
| AWS ECS | Node | — | `tn-ecs` |
| Execução de contêineres | Technology Service | — | `ts-containers` |
| PostgreSQL (RDS) ⚠︎ | System Software | — | `ss-rds` |
| Datacenter da clínica | Node | — | `tn-dc` |
| VPN AWS ↔ datacenter ⚠︎ | Communication Network | — | `cn-vpn` |

## Relacionamentos

| Origem | Relação | Destino | Descrição | Tecnologia |
| --- | --- | --- | --- | --- |
| Paciente | usa | App do Paciente | Agenda e entra na consulta | HTTPS |
| Paciente | usa | Site do Paciente | Agenda e entra na consulta | HTTPS |
| Médico | usa | Portal Médico | Atende e prescreve | HTTPS |
| App do Paciente | usa | API de Agendamento | Agenda e paga | REST |
| Site do Paciente | usa | API de Agendamento | Agenda e paga | REST |
| Portal Médico | usa | API de Agendamento | Consulta agenda do dia | REST |
| API de Agendamento | usa | Banco de Agendamentos | Lê e grava agendamentos | SQL |
| API de Agendamento | usa | Gateway de Pagamento | Cobra a consulta | HTTPS |
| API de Agendamento | usa | Twilio Video | Cria sala de vídeo | REST |
| App do Paciente | usa | Twilio Video | Transmite vídeo | WebRTC |
| Portal Médico | usa | Twilio Video | Transmite vídeo | WebRTC |
| Worker de Notificações | usa | Banco de Agendamentos | Lê consultas próximas | SQL |
| Worker de Notificações | usa | WhatsApp Business API | Envia lembretes | HTTPS |
| Portal Médico | usa | PEP (Tasy) | Registra prontuário | HL7 FHIR |
| Portal Médico | usa | Assinatura ICP-Brasil | Assina receita | HTTPS |
| Teleconsulta | aggregation | Agendamento de consulta | — | — |
| Teleconsulta | aggregation | Consulta por vídeo | — | — |
| Teleconsulta | aggregation | Receita digital | — | — |
| Agendar teleconsulta | realization | Agendamento de consulta | — | — |
| Realizar teleconsulta | realization | Consulta por vídeo | — | — |
| Emitir receita | realization | Receita digital | — | — |
| Agendar teleconsulta | triggering | Realizar teleconsulta | — | — |
| Realizar teleconsulta | triggering | Emitir receita | — | — |
| Paciente | assignment | Agendar teleconsulta | — | — |
| Médico | assignment | Realizar teleconsulta | — | — |
| Médico | assignment | Emitir receita | — | — |
| Realizar teleconsulta | access | Prontuário | — | — |
| Emitir receita | access | Receita | — | — |
| API de Agendamento | realization | Agenda e cobrança | — | — |
| Agenda e cobrança | serving | Agendar teleconsulta | — | — |
| Twilio Video | realization | Sala de vídeo | — | — |
| Sala de vídeo | serving | Realizar teleconsulta | — | — |
| PEP (Tasy) | realization | Registro clínico | — | — |
| Registro clínico | serving | Realizar teleconsulta | — | — |
| Assinatura ICP-Brasil | realization | Assinatura digital | — | — |
| Assinatura digital | serving | Emitir receita | — | — |
| AWS ECS | realization | Execução de contêineres | — | — |
| Execução de contêineres | serving | API de Agendamento | — | — |
| Execução de contêineres | serving | Worker de Notificações | — | — |
| Execução de contêineres | serving | Portal Médico | — | — |
| Execução de contêineres | serving | Site do Paciente | — | — |
| PostgreSQL (RDS) | serving | API de Agendamento | — | — |
| Datacenter da clínica | serving | PEP (Tasy) | — | — |
| VPN AWS ↔ datacenter | serving | PEP (Tasy) | — | — |

## Rastreabilidade

Cadeias de suporte calculadas a partir do modelo (o que sustenta cada oferta, e quem depende de cada aplicação).

### Teleconsulta (Product) — o que sustenta

- **Negócio:** Paciente, Médico, Agendamento de consulta, Consulta por vídeo, Receita digital, Agendar teleconsulta, Realizar teleconsulta, Emitir receita, Prontuário, Receita
- **Aplicação:** Plataforma de Teleconsulta, App do Paciente, Site do Paciente, Portal Médico, API de Agendamento, Banco de Agendamentos, PEP (Tasy), Twilio Video, Gateway de Pagamento, Assinatura ICP-Brasil, Agenda e cobrança, Sala de vídeo, Registro clínico, Assinatura digital
- **Tecnologia:** AWS ECS, Execução de contêineres, PostgreSQL (RDS), Datacenter da clínica, VPN AWS ↔ datacenter

### Dependências por aplicação

| Aplicação | Negócio que depende dela | Tecnologia que a sustenta |
| --- | --- | --- |
| Plataforma de Teleconsulta | Paciente, Médico, Teleconsulta, Agendamento de consulta, Consulta por vídeo, Receita digital, Agendar teleconsulta, Realizar teleconsulta, Emitir receita | AWS ECS, Execução de contêineres, PostgreSQL (RDS), Datacenter da clínica, VPN AWS ↔ datacenter |
| App do Paciente | Paciente, Teleconsulta, Agendamento de consulta, Agendar teleconsulta | AWS ECS, Execução de contêineres, PostgreSQL (RDS) |
| Site do Paciente | Paciente, Teleconsulta, Agendamento de consulta, Agendar teleconsulta | AWS ECS, Execução de contêineres, PostgreSQL (RDS) |
| Portal Médico | Médico, Teleconsulta, Consulta por vídeo, Receita digital, Realizar teleconsulta, Emitir receita | AWS ECS, Execução de contêineres, PostgreSQL (RDS), Datacenter da clínica, VPN AWS ↔ datacenter |
| API de Agendamento | Paciente, Médico, Teleconsulta, Agendamento de consulta, Consulta por vídeo, Receita digital, Agendar teleconsulta, Realizar teleconsulta, Emitir receita | AWS ECS, Execução de contêineres, PostgreSQL (RDS) |
| Worker de Notificações | — | AWS ECS, Execução de contêineres |
| PEP (Tasy) | Médico, Teleconsulta, Consulta por vídeo, Receita digital, Realizar teleconsulta, Emitir receita | Datacenter da clínica, VPN AWS ↔ datacenter |

## Premissas e inferências

<!-- keep:assumptions -->
- "Paga com cartão" implica um gateway de pagamento externo; o fornecedor não foi informado.
- O worker de notificações foi inferido a partir de "lembretes por WhatsApp"; pode ser parte da própria API.
- A integração com o PEP (Tasy) foi assumida via HL7 FHIR a partir do portal médico.
- Como o PEP está no datacenter e o restante na AWS, assumiu-se uma VPN site-to-site entre eles.
- A assinatura ICP-Brasil foi modelada como serviço externo de assinatura em nuvem.
<!-- /keep:assumptions -->

| Item | Tipo | Confiança | Origem no texto |
| --- | --- | --- | --- |
| App do Paciente | Application Component | alta | agenda pelo app |
| Worker de Notificações | Application Component | média | Lembretes são enviados por WhatsApp |
| Gateway de Pagamento | Application Component | média | paga com cartão |
| Assinatura ICP-Brasil | Application Component | média | receita digital assinada com certificado ICP-Brasil |
| PostgreSQL (RDS) | System Software | média | — |
| VPN AWS ↔ datacenter | Communication Network | baixa | — |
| API de Agendamento → Gateway de Pagamento | usa | — | — |
| Worker de Notificações → Banco de Agendamentos | usa | — | — |
| Portal Médico → PEP (Tasy) | usa | — | — |
| Portal Médico → Assinatura ICP-Brasil | usa | — | — |
| API de Agendamento → PostgreSQL (RDS) | serving | — | — |
| PEP (Tasy) → VPN AWS ↔ datacenter | serving | — | — |

## Visões

| key | Notação | Tipo | Escopo / âncora | Descrição |
| --- | --- | --- | --- | --- |
| `contexto` | c4 | context | Plataforma de Teleconsulta | Contexto — Plataforma de Teleconsulta |
| `containers` | c4 | container | Plataforma de Teleconsulta | Containers — Plataforma de Teleconsulta |
| `suporte-teleconsulta` | archimate | product-support | Teleconsulta | Oferta Teleconsulta — do negócio à infraestrutura |
| `impacto-api-agenda` | archimate | impact | API de Agendamento | API de Agendamento — matriz de impacto |

## Notas

<!-- keep:notes -->
_Decisões, riscos e pendências._
<!-- /keep:notes -->

## Modelo canônico

```archlens-json
{
  "archlens": "1.0",
  "name": "Teleconsulta — Clínica Vida",
  "description": "Modelo extraído de texto livre (ver entrada.md). Itens marcados como inferidos não foram ditos explicitamente e precisam de confirmação.",
  "assumptions": [
    "\"Paga com cartão\" implica um gateway de pagamento externo; o fornecedor não foi informado.",
    "O worker de notificações foi inferido a partir de \"lembretes por WhatsApp\"; pode ser parte da própria API.",
    "A integração com o PEP (Tasy) foi assumida via HL7 FHIR a partir do portal médico.",
    "Como o PEP está no datacenter e o restante na AWS, assumiu-se uma VPN site-to-site entre eles.",
    "A assinatura ICP-Brasil foi modelada como serviço externo de assinatura em nuvem."
  ],
  "model": {
    "elements": [
      {
        "id": "paciente",
        "type": "c4:person",
        "name": "Paciente",
        "description": "Agenda, paga e participa da teleconsulta",
        "source": "O paciente agenda pelo app ou pelo site"
      },
      {
        "id": "medico",
        "type": "c4:person",
        "name": "Médico",
        "description": "Atende, registra prontuário e emite receita",
        "source": "O médico atende pelo portal médico"
      },
      {
        "id": "tele",
        "type": "c4:softwareSystem",
        "name": "Plataforma de Teleconsulta",
        "description": "Agendamento, pagamento e sala de vídeo",
        "children": [
          {
            "id": "tele.app",
            "type": "c4:container",
            "name": "App do Paciente",
            "technology": "React Native",
            "source": "agenda pelo app",
            "inferred": true,
            "confidence": "alta"
          },
          {
            "id": "tele.site",
            "type": "c4:container",
            "name": "Site do Paciente",
            "technology": "SPA",
            "source": "ou pelo site"
          },
          {
            "id": "tele.portal-medico",
            "type": "c4:container",
            "name": "Portal Médico",
            "technology": "Web",
            "source": "O médico atende pelo portal médico"
          },
          {
            "id": "tele.api",
            "type": "c4:container",
            "name": "API de Agendamento",
            "technology": "Node.js",
            "description": "Agenda, cobrança e criação de salas",
            "source": "O sistema de agendamento é interno, feito em Node.js"
          },
          {
            "id": "tele.db",
            "type": "c4:container",
            "name": "Banco de Agendamentos",
            "technology": "PostgreSQL",
            "tags": [
              "database"
            ],
            "source": "com PostgreSQL"
          },
          {
            "id": "tele.notificador",
            "type": "c4:container",
            "name": "Worker de Notificações",
            "technology": "Node.js",
            "inferred": true,
            "confidence": "média",
            "source": "Lembretes são enviados por WhatsApp"
          }
        ]
      },
      {
        "id": "pep",
        "type": "c4:softwareSystem",
        "name": "PEP (Tasy)",
        "description": "Prontuário eletrônico legado",
        "source": "O prontuário fica no PEP legado (Tasy)"
      },
      {
        "id": "twilio",
        "type": "c4:softwareSystem",
        "name": "Twilio Video",
        "external": true,
        "source": "As videochamadas usam um provedor externo (Twilio)"
      },
      {
        "id": "gateway",
        "type": "c4:softwareSystem",
        "name": "Gateway de Pagamento",
        "external": true,
        "inferred": true,
        "confidence": "média",
        "source": "paga com cartão"
      },
      {
        "id": "whatsapp",
        "type": "c4:softwareSystem",
        "name": "WhatsApp Business API",
        "external": true,
        "source": "Lembretes são enviados por WhatsApp"
      },
      {
        "id": "icp",
        "type": "c4:softwareSystem",
        "name": "Assinatura ICP-Brasil",
        "external": true,
        "inferred": true,
        "confidence": "média",
        "source": "receita digital assinada com certificado ICP-Brasil"
      },
      {
        "id": "prod-tele",
        "type": "archimate:product",
        "name": "Teleconsulta",
        "source": "A Clínica Vida quer oferecer teleconsultas"
      },
      {
        "id": "bs-agendamento",
        "type": "archimate:business-service",
        "name": "Agendamento de consulta"
      },
      {
        "id": "bs-consulta",
        "type": "archimate:business-service",
        "name": "Consulta por vídeo"
      },
      {
        "id": "bs-receita",
        "type": "archimate:business-service",
        "name": "Receita digital"
      },
      {
        "id": "bp-agendar",
        "type": "archimate:business-process",
        "name": "Agendar teleconsulta"
      },
      {
        "id": "bp-realizar",
        "type": "archimate:business-process",
        "name": "Realizar teleconsulta"
      },
      {
        "id": "bp-emitir",
        "type": "archimate:business-process",
        "name": "Emitir receita"
      },
      {
        "id": "bo-prontuario",
        "type": "archimate:business-object",
        "name": "Prontuário"
      },
      {
        "id": "bo-receita",
        "type": "archimate:business-object",
        "name": "Receita"
      },
      {
        "id": "as-agenda",
        "type": "archimate:application-service",
        "name": "Agenda e cobrança"
      },
      {
        "id": "as-video",
        "type": "archimate:application-service",
        "name": "Sala de vídeo"
      },
      {
        "id": "as-registro",
        "type": "archimate:application-service",
        "name": "Registro clínico"
      },
      {
        "id": "as-assinatura",
        "type": "archimate:application-service",
        "name": "Assinatura digital"
      },
      {
        "id": "tn-ecs",
        "type": "archimate:node",
        "name": "AWS ECS",
        "source": "roda na AWS em contêineres (ECS)"
      },
      {
        "id": "ts-containers",
        "type": "archimate:technology-service",
        "name": "Execução de contêineres"
      },
      {
        "id": "ss-rds",
        "type": "archimate:system-software",
        "name": "PostgreSQL (RDS)",
        "inferred": true,
        "confidence": "média"
      },
      {
        "id": "tn-dc",
        "type": "archimate:node",
        "name": "Datacenter da clínica",
        "source": "roda no datacenter da clínica"
      },
      {
        "id": "cn-vpn",
        "type": "archimate:communication-network",
        "name": "VPN AWS ↔ datacenter",
        "inferred": true,
        "confidence": "baixa"
      }
    ],
    "relationships": [
      {
        "from": "paciente",
        "to": "tele.app",
        "type": "uses",
        "description": "Agenda e entra na consulta",
        "technology": "HTTPS"
      },
      {
        "from": "paciente",
        "to": "tele.site",
        "type": "uses",
        "description": "Agenda e entra na consulta",
        "technology": "HTTPS"
      },
      {
        "from": "medico",
        "to": "tele.portal-medico",
        "type": "uses",
        "description": "Atende e prescreve",
        "technology": "HTTPS"
      },
      {
        "from": "tele.app",
        "to": "tele.api",
        "type": "uses",
        "description": "Agenda e paga",
        "technology": "REST"
      },
      {
        "from": "tele.site",
        "to": "tele.api",
        "type": "uses",
        "description": "Agenda e paga",
        "technology": "REST"
      },
      {
        "from": "tele.portal-medico",
        "to": "tele.api",
        "type": "uses",
        "description": "Consulta agenda do dia",
        "technology": "REST"
      },
      {
        "from": "tele.api",
        "to": "tele.db",
        "type": "uses",
        "description": "Lê e grava agendamentos",
        "technology": "SQL"
      },
      {
        "from": "tele.api",
        "to": "gateway",
        "type": "uses",
        "description": "Cobra a consulta",
        "technology": "HTTPS",
        "inferred": true
      },
      {
        "from": "tele.api",
        "to": "twilio",
        "type": "uses",
        "description": "Cria sala de vídeo",
        "technology": "REST"
      },
      {
        "from": "tele.app",
        "to": "twilio",
        "type": "uses",
        "description": "Transmite vídeo",
        "technology": "WebRTC"
      },
      {
        "from": "tele.portal-medico",
        "to": "twilio",
        "type": "uses",
        "description": "Transmite vídeo",
        "technology": "WebRTC"
      },
      {
        "from": "tele.notificador",
        "to": "tele.db",
        "type": "uses",
        "description": "Lê consultas próximas",
        "technology": "SQL",
        "inferred": true
      },
      {
        "from": "tele.notificador",
        "to": "whatsapp",
        "type": "uses",
        "description": "Envia lembretes",
        "technology": "HTTPS"
      },
      {
        "from": "tele.portal-medico",
        "to": "pep",
        "type": "uses",
        "description": "Registra prontuário",
        "technology": "HL7 FHIR",
        "inferred": true
      },
      {
        "from": "tele.portal-medico",
        "to": "icp",
        "type": "uses",
        "description": "Assina receita",
        "technology": "HTTPS",
        "inferred": true
      },
      {
        "from": "prod-tele",
        "to": "bs-agendamento",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-tele",
        "to": "bs-consulta",
        "type": "archimate:aggregation"
      },
      {
        "from": "prod-tele",
        "to": "bs-receita",
        "type": "archimate:aggregation"
      },
      {
        "from": "bp-agendar",
        "to": "bs-agendamento",
        "type": "archimate:realization"
      },
      {
        "from": "bp-realizar",
        "to": "bs-consulta",
        "type": "archimate:realization"
      },
      {
        "from": "bp-emitir",
        "to": "bs-receita",
        "type": "archimate:realization"
      },
      {
        "from": "bp-agendar",
        "to": "bp-realizar",
        "type": "archimate:triggering"
      },
      {
        "from": "bp-realizar",
        "to": "bp-emitir",
        "type": "archimate:triggering"
      },
      {
        "from": "paciente",
        "to": "bp-agendar",
        "type": "archimate:assignment"
      },
      {
        "from": "medico",
        "to": "bp-realizar",
        "type": "archimate:assignment"
      },
      {
        "from": "medico",
        "to": "bp-emitir",
        "type": "archimate:assignment"
      },
      {
        "from": "bp-realizar",
        "to": "bo-prontuario",
        "type": "archimate:access",
        "accessType": "write"
      },
      {
        "from": "bp-emitir",
        "to": "bo-receita",
        "type": "archimate:access",
        "accessType": "write"
      },
      {
        "from": "tele.api",
        "to": "as-agenda",
        "type": "archimate:realization"
      },
      {
        "from": "as-agenda",
        "to": "bp-agendar",
        "type": "archimate:serving"
      },
      {
        "from": "twilio",
        "to": "as-video",
        "type": "archimate:realization"
      },
      {
        "from": "as-video",
        "to": "bp-realizar",
        "type": "archimate:serving"
      },
      {
        "from": "pep",
        "to": "as-registro",
        "type": "archimate:realization"
      },
      {
        "from": "as-registro",
        "to": "bp-realizar",
        "type": "archimate:serving"
      },
      {
        "from": "icp",
        "to": "as-assinatura",
        "type": "archimate:realization"
      },
      {
        "from": "as-assinatura",
        "to": "bp-emitir",
        "type": "archimate:serving"
      },
      {
        "from": "tn-ecs",
        "to": "ts-containers",
        "type": "archimate:realization"
      },
      {
        "from": "ts-containers",
        "to": "tele.api",
        "type": "archimate:serving"
      },
      {
        "from": "ts-containers",
        "to": "tele.notificador",
        "type": "archimate:serving"
      },
      {
        "from": "ts-containers",
        "to": "tele.portal-medico",
        "type": "archimate:serving"
      },
      {
        "from": "ts-containers",
        "to": "tele.site",
        "type": "archimate:serving"
      },
      {
        "from": "ss-rds",
        "to": "tele.api",
        "type": "archimate:serving",
        "inferred": true
      },
      {
        "from": "tn-dc",
        "to": "pep",
        "type": "archimate:serving"
      },
      {
        "from": "cn-vpn",
        "to": "pep",
        "type": "archimate:serving",
        "inferred": true
      }
    ]
  },
  "views": [
    {
      "key": "contexto",
      "notation": "c4",
      "level": "context",
      "scope": "tele",
      "title": "Contexto — Plataforma de Teleconsulta"
    },
    {
      "key": "containers",
      "notation": "c4",
      "level": "container",
      "scope": "tele",
      "title": "Containers — Plataforma de Teleconsulta"
    },
    {
      "key": "suporte-teleconsulta",
      "notation": "archimate",
      "viewpoint": "product-support",
      "anchor": "prod-tele",
      "title": "Oferta Teleconsulta — do negócio à infraestrutura"
    },
    {
      "key": "impacto-api-agenda",
      "notation": "archimate",
      "viewpoint": "impact",
      "anchor": "tele.api",
      "title": "API de Agendamento — matriz de impacto"
    }
  ]
}
```
