# Plano: Remove a API e liga o cliente ao gateway

Base `architecture` na versão `sha256:a782…` · fonte: prompt limpeza · 2026-10-01 · **final**

**+0 elementos · ~0 alterados · −3 removido(s) · relações +1 −7**

## Decisões
- 2. remover loja.api: 3 elemento(s), 7 relação(ões) → **yes**

## Removidos
- **API** (`loja.api`): application-component, dentro de `loja`
- **Catalogo** (`loja.api.catalogo`): application-component, dentro de `loja.api`
- **Checkout** (`loja.api.checkout`): application-component, dentro de `loja.api`

## Relações
- − Cluster K8s → API (serving)
- − Catalogo → Web (serving): Lista produtos
- − Checkout → Servico de checkout (realization)
- − Checkout → Web (serving): Fecha pedido
- − DB → Checkout (serving): Grava pedido
- + Gateway de Pagamentos → Cliente (serving): Paga direto
- − Gateway de Pagamentos → Checkout (serving): Autoriza pagamento
- − PostgreSQL 16 → API (serving)
