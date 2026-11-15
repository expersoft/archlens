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

## Escopo

1. **Tenants:** criação (autoatendimento ou assistida), ciclo de vida (teste, ativo, suspenso, encerrado), exportação
   e exclusão de todos os dados de um tenant.
2. **Isolamento de dados:** definir o modelo (banco por tenant, esquema por tenant, ou linha com política de
   segurança) e prová-lo com testes que tentam cruzar tenants em toda rota.
3. **Identidade corporativa por tenant:** cada organização liga o próprio IdP (OIDC e SAML), com descoberta pelo
   domínio do e-mail, provisionamento de usuários e grupos (SCIM) e mapeamento de grupos para capacidades.
4. **Isolamento de execução:** clones de repositório, geração de diagramas (Chromium) e chamadas ao LLM de um tenant
   não afetam nem enxergam os de outro; limites de recursos por tenant.
5. **LLM:** chave do serviço com cota por plano, ou chave trazida pelo cliente; política de retenção do que é enviado
   ao provedor.
6. **Planos, medição e cobrança:** o que se mede (usuários, bases, elementos, tokens), limites por plano, integração
   com um provedor de pagamento.
7. **Console de administração** do tenant (usuários, bases, IdP, cotas, auditoria) e console de operação do serviço.
8. **Operação:** implantação com várias réplicas, cópia de segurança e restauração por tenant, observabilidade por
   tenant, página de status, resposta a incidentes.
9. **Conformidade:** LGPD (papéis de controlador e operador, contrato de tratamento, direitos do titular),
   residência de dados, termos de uso, e o caminho para auditorias de segurança que clientes corporativos pedem.
10. **Convivência com self-hosted:** a mesma base de código serve aos dois modos; o que for exclusivo do SaaS fica
    isolado.

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
- Modelo de isolamento de dados e a nuvem de hospedagem.
- Licença: o repositório é MIT hoje; decidir se o que é específico do SaaS segue aberto.
- Onde ficam as bases dos clientes: no banco do serviço, ou o serviço conecta no repositório/gbrain do cliente.
- Quais requisitos de conformidade são condição de venda para os primeiros clientes.

## Obrigações do repositório

A definir quando o programa começar; valem as do `AGENTS.md` da linha em que ele for desenvolvido.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 2.6, R5) e `P18-saas-multi-tenant.md`. Este brief é um
> programa: o primeiro ciclo é só de descoberta. Conduza o brainstorm do modelo de negócio e do isolamento de dados,
> confira se os pontos da tabela "O que precisa estar pronto antes" foram de fato entregues, e proponha a divisão em
> ciclos.
