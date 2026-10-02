---
archlens: "1.0"
name: "Teleconsulta — Clínica Vida"
source: architecture/
revision: 1
updated: 2026-09-30
notations: [c4, archimate]
elements: 33
relationships: 46
---

# Teleconsulta — Clínica Vida

> Gerado por archlens a partir de `architecture/`. Não edite: escreva em `architecture/notes/*.md` e evolua a base com `archlens merge`.

## Visão geral

Modelo extraído de texto livre (ver entrada.md). Itens marcados como inferidos não foram ditos explicitamente e precisam de confirmação.

## Resumo

| Camada | Elementos |
| --- | --- |
| Negócio | 11 |
| Aplicação | 17 |
| Tecnologia | 5 |

| Tipo C4 | Quantidade |
| --- | --- |
| Person | 2 |
| Software System | 7 |
| Container | 6 |

## Contexto e atores

| Ator | Tipo | Descrição | id |
| --- | --- | --- | --- |
| Paciente | Business Actor | Agenda, paga e participa da teleconsulta | `paciente` |
| Médico | Business Actor | Atende, registra prontuário e emite receita | `medico` |

## Modelo C4

### Plataforma de Teleconsulta — Software System

Agendamento, pagamento e sala de vídeo

| Container | Tecnologia | Descrição | Status | Fontes | id |
| --- | --- | --- | --- | --- | --- |
| App do Paciente | React Native | — | active | P | `tele.app` |
| Site do Paciente | SPA | — | active | P | `tele.site` |
| Portal Médico | Web | — | active | P | `tele.portal-medico` |
| API de Agendamento | Node.js | Agenda, cobrança e confirmação de consultas | active | P | `tele.api` |
| Banco de Agendamentos 🛢 | PostgreSQL | — | active | P | `tele.db` |
| Worker de Notificações | Node.js | — | active | P | `tele.notificador` |

### PEP (Tasy) — Software System

Prontuário eletrônico legado

### Twilio Video — Software System (externo)

### Gateway de Pagamento — Software System (externo)

### WhatsApp Business API — Software System (externo)

### Assinatura ICP-Brasil — Software System (externo)

### PEP em nuvem — Software System (externo)

Prontuário eletrônico SaaS que substitui o Tasy

## Camada de Negócio

| Elemento | Tipo ArchiMate | Descrição | Status | Fontes | id |
| --- | --- | --- | --- | --- | --- |
| Paciente | Business Actor (C4 Person) | Agenda, paga e participa da teleconsulta | active | P | `paciente` |
| Médico | Business Actor (C4 Person) | Atende, registra prontuário e emite receita | active | P | `medico` |
| Teleconsulta | Product | — | active | P | `prod-tele` |
| Agendamento de consulta | Business Service | — | active | — | `bs-agendamento` |
| Consulta por vídeo | Business Service | — | active | — | `bs-consulta` |
| Receita digital | Business Service | — | active | — | `bs-receita` |
| Agendar teleconsulta | Business Process | — | active | — | `bp-agendar` |
| Realizar teleconsulta | Business Process | — | active | — | `bp-realizar` |
| Emitir receita | Business Process | — | active | — | `bp-emitir` |
| Prontuário | Business Object | — | active | — | `bo-prontuario` |
| Receita | Business Object | — | active | — | `bo-receita` |

## Camada de Aplicação

| Elemento | Tipo ArchiMate | Descrição | Status | Fontes | id |
| --- | --- | --- | --- | --- | --- |
| Plataforma de Teleconsulta | Application Component (C4 Software System) | Agendamento, pagamento e sala de vídeo | active | — | `tele` |
| App do Paciente | Application Component (C4 Container) | — | active | P | `tele.app` |
| Site do Paciente | Application Component (C4 Container) | — | active | P | `tele.site` |
| Portal Médico | Application Component (C4 Container) | — | active | P | `tele.portal-medico` |
| API de Agendamento | Application Component (C4 Container) | Agenda, cobrança e confirmação de consultas | active | P | `tele.api` |
| Banco de Agendamentos | Data Object (C4 Container) | — | active | P | `tele.db` |
| Worker de Notificações ⚠︎ | Application Component (C4 Container) | — | active | P | `tele.notificador` |
| PEP (Tasy) | Application Component (C4 Software System) | Prontuário eletrônico legado | deprecated | P | `pep` |
| Twilio Video | Application Component (C4 Software System) | — | active | P | `twilio` |
| Gateway de Pagamento ⚠︎ | Application Component (C4 Software System) | — | active | P | `gateway` |
| WhatsApp Business API | Application Component (C4 Software System) | — | active | P | `whatsapp` |
| Assinatura ICP-Brasil ⚠︎ | Application Component (C4 Software System) | — | active | P | `icp` |
| Agenda e cobrança | Application Service | — | active | — | `as-agenda` |
| Sala de vídeo | Application Service | — | active | — | `as-video` |
| Registro clínico | Application Service | — | active | — | `as-registro` |
| Assinatura digital | Application Service | — | active | — | `as-assinatura` |
| PEP em nuvem | Application Component (C4 Software System) | Prontuário eletrônico SaaS que substitui o Tasy | planned | P | `pep-nuvem` |

## Camada de Tecnologia

| Elemento | Tipo ArchiMate | Descrição | Status | Fontes | id |
| --- | --- | --- | --- | --- | --- |
| AWS ECS | Node | — | active | P | `tn-ecs` |
| Execução de contêineres | Technology Service | — | active | — | `ts-containers` |
| PostgreSQL (RDS) ⚠︎ | System Software | — | active | — | `ss-rds` |
| Datacenter da clínica | Node | — | active | P | `tn-dc` |
| VPN AWS ↔ datacenter ⚠︎ | Communication Network | — | active | — | `cn-vpn` |

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
| Portal Médico | usa | PEP em nuvem | Registra prontuário | HTTPS/FHIR |
| PEP em nuvem | realization | Registro clínico | — | — |

## Rastreabilidade

Cadeias de suporte calculadas a partir do modelo (o que sustenta cada oferta, e quem depende de cada aplicação).

### Teleconsulta (Product) — o que sustenta

- **Negócio:** Paciente, Médico, Agendamento de consulta, Consulta por vídeo, Receita digital, Agendar teleconsulta, Realizar teleconsulta, Emitir receita, Prontuário, Receita
- **Aplicação:** Plataforma de Teleconsulta, App do Paciente, Site do Paciente, Portal Médico, API de Agendamento, Banco de Agendamentos, PEP (Tasy), Twilio Video, Gateway de Pagamento, Assinatura ICP-Brasil, Agenda e cobrança, Sala de vídeo, Registro clínico, Assinatura digital, PEP em nuvem
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

## Ciclo de vida

| Item | Tipo | Status | Motivo | id |
| --- | --- | --- | --- | --- |
| PEP (Tasy) | Application Component | deprecated | substituição pelo PEP em nuvem | `pep` |
| PEP em nuvem | Application Component | planned | — | `pep-nuvem` |
| Portal Médico → PEP em nuvem | usa | planned | — | `pep-nuvem-serving-tele.portal-medico` |
| PEP em nuvem → Registro clínico | realization | planned | — | `pep-nuvem-realization-as-registro` |

## Premissas e inferências

- "Paga com cartão" implica um gateway de pagamento externo; o fornecedor não foi informado.
- O worker de notificações foi inferido a partir de "lembretes por WhatsApp"; pode ser parte da própria API.
- A integração com o PEP (Tasy) foi assumida via HL7 FHIR a partir do portal médico.
- Como o PEP está no datacenter e o restante na AWS, assumiu-se uma VPN site-to-site entre eles.
- A assinatura ICP-Brasil foi modelada como serviço externo de assinatura em nuvem.

| Item | Tipo | Confiança | Origem no texto |
| --- | --- | --- | --- |
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

## Fontes

| Tipo | Referência | Data | Itens |
| --- | --- | --- | --- |
| prompt | (trechos de texto livre) | — | 16 |
| prompt | rodada 2026-10-01: substituição do PEP | 2026-10-01 | 6 |

## Visões

| key | Notação | Tipo | Escopo / âncora | Descrição |
| --- | --- | --- | --- | --- |
| `contexto` | c4 | context | Plataforma de Teleconsulta | Contexto — Plataforma de Teleconsulta |
| `containers` | c4 | container | Plataforma de Teleconsulta | Containers — Plataforma de Teleconsulta |
| `suporte-teleconsulta` | archimate | product-support | Teleconsulta | Oferta Teleconsulta — do negócio à infraestrutura |
| `impacto-api-agenda` | archimate | impact | API de Agendamento | API de Agendamento — matriz de impacto |
| `containers-to-be` | c4 | container | Plataforma de Teleconsulta | Containers — to-be (sem o que está em desativação) |

## Histórico

| Data | Fonte | Resumo | Mudanças | Decisões |
| --- | --- | --- | --- | --- |
| 2026-09-30 | prompt rodada 2026-10-01: substituição do PEP | PEP Tasy será substituído por um PEP em nuvem; API de agendamento confirmada | +4 ~2 −0 status 1 | duplicata: api-agendamento = tele.api; conflito tele.api.description: take "Agenda, cobrança e confirmação de consultas" |

## Notas

_Decisões, riscos e pendências._

## Modelo canônico

A fonte de verdade está em `architecture/`: `archlens.json` (manifesto), `model.json` ou `model/*.json` (elementos e relações), `views.json` (visões), `changelog.json` (histórico) e `notes/*.md` (texto autoral). Consulte-a com a CLI (`archlens views`, `archlens resolve`) em vez de copiar trechos daqui.
