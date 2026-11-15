# P18 — SaaS multi-tenant

**Linha:** depois da 1.0.0 estável · **Tamanho:** G (um programa, não um ciclo) · **Depende de:** todos os anteriores, em especial P06, P08, P12, P17 · **Requisito:** R5

## Objetivo

Oferecer o archlens como serviço hospedado para várias organizações, cada uma isolada das outras, com seu próprio
provedor de identidade, suas bases, suas cotas e sua cobrança.

## Evidência

- Hoje o archlens é um processo com uma configuração (`archlens-gui.json`), uma lista de bases, uma chave de LLM e
  estado em memória: registro de bases (`bases.mjs`), cache de visões padrão por módulo (`views.mjs`), telemetria em
  arquivo local.
- Não há conceito de organização, de dono de base nem de cota.
- A pré-condição declarada pelo dono: só depois de todo o plano implementado e o projeto estável.

## Decisões já tomadas (2026-11-14)

| # | Decisão | Onde foi adiantada |
|---|---|---|
| D1 | Isolamento por linha com `org_id` e Row-Level Security no PostgreSQL, com modo dedicado por configuração | P12, P17 |
| D2 | Bases no banco do serviço ou no repositório do cliente, à escolha do tenant | P04, P12, P16, P17 |
| D3 | LLM com chave do serviço e cota, e chave do cliente (BYOK) | P06, P08 |
| D4 | Hierarquia organização → bases | P06, P17 |
| D5 | IdP corporativo só por agregador (um emissor OIDC para o archlens) | P06, P08 |
| D6 | Núcleo aberto (MIT), código do SaaS em pacote privado | P02, P17 |
| D7 | Cobrança indefinida: medição genérica de usuários, tokens e tamanho | P06, P08 |
| D8 | Hospedagem agnóstica em Kubernetes | P08, P12 |

## O que precisa estar pronto antes

Estes pontos são critérios de aceite de outros planos, justamente para o P18 não exigir reescrita:

| Ponto | Plano |
|---|---|
| Recursos da API endereçados por organização | P17 |
| Autorização sempre por `{organização, base, capacidade}` | P06 |
| Sessão, cotas e propostas fora da memória do processo | P06, P08, P09 |
| Nenhum cache ou configuração global por processo | P17, P08 |
| Um conector de banco como primário | P12 |
| Auditoria por usuário | P06 |
| Segredos e chave de LLM configuráveis por escopo | P06, P08 |
| `org_id` e RLS no esquema do PostgreSQL, com a suíte de isolamento | P12 |
| Pontos de extensão públicos para o pacote privado | P02, P17 |
| Eventos de medição emitidos e um coletor substituível | P06, P08 |
| Servidor sem estado local, implantável em Kubernetes com várias réplicas | P08 |

## Escopo

1. **Tenants:** criação (autoatendimento ou assistida), ciclo de vida (teste, ativo, suspenso, encerrado), exportação
   e exclusão de todos os dados de um tenant.
2. **Isolamento de dados (D1, D2):** o esquema com `org_id` e RLS vem do P12. Aqui: endurecer e auditar as
   políticas, ampliar a suíte que tenta cruzar tenants para toda rota e todo conector, e cobrir o caso em que a base
   mora no repositório do cliente (o isolamento passa a ser da credencial, não do banco).
3. **Identidade corporativa por tenant (D5):** automatizar, pela API de administração do agregador, a ligação do IdP
   de cada organização (OIDC e SAML), a descoberta pelo domínio do e-mail e o provisionamento (SCIM). O archlens
   continua falando com um emissor só; o que muda é a operação do agregador.
4. **Isolamento de execução:** clones de repositório, geração de diagramas (Chromium) e chamadas ao LLM de um tenant
   não afetam nem enxergam os de outro; limites de recursos por tenant.
5. **LLM (D3):** os dois modos já existem desde o P06/P08. Aqui: cota por plano, tela para o tenant cadastrar a
   própria chave, e política de retenção do que é enviado ao provedor.
6. **Planos, medição e cobrança (D7):** os eventos de medição já existem. Aqui: decidir o que se cobra, os limites
   por plano e a integração com um provedor de pagamento.
7. **Console de administração** do tenant (usuários, bases, IdP, cotas, auditoria) e console de operação do serviço.
8. **Operação (D8):** em Kubernetes, sem serviço específico de nuvem. Implantação com várias réplicas, cópia de segurança e restauração por tenant, observabilidade por
   tenant, página de status, resposta a incidentes.
9. **Conformidade:** LGPD (papéis de controlador e operador, contrato de tratamento, direitos do titular),
   residência de dados, termos de uso, e o caminho para auditorias de segurança que clientes corporativos pedem.
10. **Convivência com self-hosted (D6):** o repositório aberto serve aos dois modos; o que é exclusivo do SaaS vive
    no pacote privado e entra pelos pontos de extensão. Nenhuma mudança no núcleo só para o SaaS.

## Fora do escopo (a decidir no início do programa)

Marketplace de extensões, marca própria por tenant além do que já existe (`brand`), edição simultânea em tempo real.

## Critérios de aceite

- Uma suíte de isolamento tenta ler e gravar dados de outro tenant por toda rota da API e por todo conector, e falha
  em todas as tentativas.
- Uma organização nova liga o próprio IdP e entra sem intervenção da operação.
- Excluir um tenant remove seus dados de todos os armazenamentos, réplicas e cópias dentro do prazo declarado.
- O consumo de um tenant (LLM, CPU de layout, clones) não degrada o tempo de resposta dos outros além do orçamento.
- A edição self-hosted continua instalável e passa na mesma suíte.

## Decisões a fechar no brainstorm

- **Modelo de negócio primeiro:** para quem é o serviço, o que se cobra, e se isso justifica o custo de operar. Sem
  essa resposta, o programa não deve começar.
- Qual agregador de identidade operar (Keycloak, Cognito, Entra External ID) e quem o administra.
- O que se cobra (D7 deixou em aberto) e os limites de cada plano.
- Quando a base mora no repositório do cliente: quais conectores são aceitos e o que fazer com o gbrain em modo MCP.
- Quando oferecer o **modo dedicado** (o mecanismo já existe desde o P12: uma organização com primário em outro
  PostgreSQL): em que plano comercial, quem provisiona o banco e como ele entra em backup e monitoração.
- Quais requisitos de conformidade são condição de venda para os primeiros clientes.

## Obrigações do repositório

A definir quando o programa começar; valem as do `AGENTS.md` da linha em que ele for desenvolvido.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 2.6, R5) e `P18-saas-multi-tenant.md`. Este brief é um
> programa: o primeiro ciclo é só de descoberta. Conduza o brainstorm do modelo de negócio e do isolamento de dados,
> confira se os pontos da tabela "O que precisa estar pronto antes" foram de fato entregues, e proponha a divisão em
> ciclos.
