# P06 — Autenticação, autorização e auditoria

**Trilha:** Servidor de time · **Tamanho:** G · **Depende de:** P01 · **Desbloqueia:** P08, P09

## Objetivo

A GUI pode rodar num servidor compartilhado: cada pessoa entra com a própria identidade, vê só as bases a que tem
acesso, só grava se tiver papel para isso, e toda gravação fica registrada com autor.

## Evidência

- `apps/gui/server/app.mjs`: nenhuma rota confere identidade. `hostAllowed()` devolve `true` para qualquer Host quando
  o servidor é ligado em `0.0.0.0` ou `::` (o comentário diz "team mode behind a proxy").
- Com `plan` ligado, `apps/gui/server/plan/routes.mjs` expõe `/plan/apply` (grava a base, regenera o documento e os
  diagramas) e clona repositórios com o token do servidor (`plan.gitTokenEnv`).
- As rotas `/ask` e `/plan` gastam a cota do LLM do servidor. O único teto é por mensagem (`plan.maxTokens`).
- O changelog da base não tem autor. Num gbrain em modo git, o autor do commit é o do servidor.
- `GET /api/telemetry` é aberto; com `telemetry.questions: true` guarda o texto das perguntas.
- Já existe e deve ser mantido: checagem de origem e `content-type` nos POST, limites de corpo, cabeçalhos
  `x-frame-options` e `frame-ancestors`.

## Escopo

1. **Autenticação.** Sem identidade, nenhuma rota `/api` responde quando o servidor não está em modo local. O modo
   local (`127.0.0.1`, sem configuração de autenticação) continua sem login.
2. **Sessão** segura (cookie `HttpOnly`, `Secure`, `SameSite`), expiração e saída.
3. **Papéis por base:** leitor (ver, perguntar), editor (planejar, aplicar), administrador (configuração, telemetria).
   Configurados no arquivo da GUI; a API recusa com 403 e a interface esconde o que a pessoa não pode fazer.
4. **Auditoria:** autor e horário em cada entrada do changelog gravada pela GUI; autor do commit no gbrain git; log de
   acesso e de gravação.
5. **Cotas de LLM** por usuário e por período, e limite de requisições.
6. **Recusar configuração insegura:** subir em `0.0.0.0` sem autenticação exige uma opção explícita e imprime aviso.
7. **Testes de autorização** por rota (matriz papel × rota), incluindo as rotas de streaming.

## Fora do escopo

Multi-tenant e cobrança. Fluxo de revisão e aprovação (P09). Empacotamento (P08).

## Critérios de aceite

- Com autenticação ligada, toda rota `/api` sem sessão devolve 401; a matriz papel × rota tem teste automático.
- Um leitor não consegue aplicar um plano nem pela interface nem chamando a API direto.
- Cada entrada nova do changelog gravada pela GUI tem autor.
- O modo local continua funcionando sem configurar nada (`bin/archlens serve architecture --open`).
- O formato do changelog continua aceito pelos conectores e pelo `archlens check`.

## Decisões a fechar no brainstorm

- **Mecanismo:** OIDC no próprio servidor (Entra ID, Google, Keycloak), confiar num cabeçalho de identidade de um
  proxy autenticador (oauth2-proxy, IAP), ou os dois. O proxy é o caminho mais curto e mantém o servidor sem
  dependências; OIDC próprio dá uma instalação mais simples para quem não tem proxy.
- Onde mora o mapeamento pessoa ou grupo → papel (arquivo de configuração, grupos do provedor).
- Onde guardar sessão e contadores de cota (memória, arquivo, banco). Afeta P08 (uma ou várias réplicas).
- Se o autor entra no formato da base (campo novo no changelog): isso é mudança do núcleo e do formato.

## Obrigações do repositório

Campo de autor no changelog toca o formato: avaliar archlens-ask (`npm run ask`, `check-ask`) e os conectores.
`AGENTS.md`, sentido único: o núcleo não muda para acomodar a GUI além do que fizer sentido para a CLI também
(`apply --author`, por exemplo).

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P06-autenticacao-e-autorizacao.md`,
> `docs/superpowers/specs/2026-10-28-archlens-gui-design.md` e `apps/gui/server/app.mjs`. Conduza o brainstorm
> começando pelo ambiente real do dono: que provedor de identidade o time usa e se já existe um proxy na frente dos
> serviços internos.
