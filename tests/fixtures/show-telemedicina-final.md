# Plano: Proposta: lembretes por SMS via fila, chatbot de triagem em discussão

Base `architecture` na versão `sha256:a6a5…` · fonte: prompt rodada 2026-10-05: lembretes por SMS (em avaliação) · 2026-10-01 · **final**

**+3 elementos · ~2 alterados · −1 removido(s) · relações +3 −1**

## Decisões
- 3. conflito tele.notificador.technology: base "Node.js" ≠ delta "Node.js 22" → **take**
- 5. possível duplicata: "agendamento-api" parece "tele.api" (1; mesmo tipo; nome parecido; mesmo pai e mesma tecnologia) → **same**
- 6. conflito tele.api.name: base "API de Agendamento" ≠ delta "Agendamento API" → **keep**
- 12. remover whatsapp: 1 elemento(s), 1 relação(ões) → **yes**

## Novos
| id | nome | tipo | C4 | pai |
|---|---|---|---|---|
| sms | Gateway SMS | application-component | softwareSystem |  |
| tele.chatbot | Chatbot de Triagem | application-component | container | tele |
| tele.fila | Fila de Lembretes | application-component | container | tele |

## Alterados
- **API de Agendamento** (`tele.api`): aliases + `Agendamento API`
- **Worker de Notificações** (`tele.notificador`): technology `Node.js` → `Node.js 22`

## Removidos
- **WhatsApp Business API** (`whatsapp`): application-component

## Relações
- + Gateway SMS → Worker de Notificações (serving): Envia lembrete
- + Fila de Lembretes → API de Agendamento (serving): Agenda lembrete
- + Fila de Lembretes → Worker de Notificações (serving): Consome lembretes
- − WhatsApp Business API → Worker de Notificações (serving): Envia lembretes
