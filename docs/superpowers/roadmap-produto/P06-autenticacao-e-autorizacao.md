# P06 — Autenticação, autorização e auditoria

**Linha:** v1 · **Tamanho:** G · **Depende de:** P00 · **Desbloqueia:** P08, P09, P15, P17 · **Requisito:** R2

## Objetivo

Cada pessoa entra com a identidade do provedor que a empresa já usa, vê só as bases a que tem acesso, só planeja,
aplica ou aprova se tiver essa permissão, e toda gravação fica registrada com autor.

## Evidência

- `apps/gui/server/app.mjs`: nenhuma rota confere identidade. `hostAllowed()` devolve `true` para qualquer Host quando
  o servidor é ligado em `0.0.0.0` ou `::` (o comentário diz "team mode behind a proxy").
- Com `plan` ligado, `apps/gui/server/plan/routes.mjs` expõe `/plan/apply` (grava a base, regenera o documento e os
  diagramas) e clona repositórios com o token do servidor (`plan.gitTokenEnv`). `archlens serve` já avisa no terminal:
  "qualquer um que alcance a porta pode aplicar".
- As rotas `/ask` e `/plan` gastam a cota do LLM do servidor. O único teto é por mensagem (`plan.maxTokens`).
- O changelog da base não tem autor. Num gbrain em modo git, o autor do commit é o do servidor.
- `GET /api/telemetry` é aberto; com `telemetry.questions: true` guarda o texto das perguntas.
- A CLI não tem conceito de usuário: quem tem acesso ao conector faz tudo.
- Já existe e deve ser mantido: checagem de origem e `content-type` nos POST, limites de corpo, cabeçalhos
  `x-frame-options` e `frame-ancestors`.

## Escopo

1. **Autenticação por OpenID Connect**, com um provedor genérico configurável por descoberta (`issuer`): cobre Entra
   ID, AWS Cognito, Google, Keycloak, Okta e qualquer IdP compatível. Fluxo de código de autorização com PKCE. Mais de
   um provedor configurado ao mesmo tempo.
2. **Provedores sociais.** Google entra pelo item 1. Facebook e outros que não seguem OIDC por inteiro: ver decisões
   (federar por um agregador, ou adaptador próprio).
3. **Clientes que não são navegador** (com P17): fluxo de código de dispositivo ou PKCE com retorno em `localhost`
   para a CLI e o desktop; tokens pessoais com escopo e validade para automação. O servidor MCP (P17) usa o mesmo IdP como emissor dos
   tokens dos assistentes.
4. **Sessão** segura (cookie `HttpOnly`, `Secure`, `SameSite`), expiração, renovação e saída (incluindo a saída
   iniciada pelo IdP, se suportada).
5. **Autorização por capacidade e por base.** Capacidades: `ver`, `perguntar` (gasta LLM), `planejar`, `aplicar`,
   `aprovar`, `administrar`. Atribuídas a pessoas ou a **grupos do IdP** (claim de grupos ou papéis), por base ou por
   padrão da organização. Papéis nomeados (leitor, editor, aprovador, administrador) são só conjuntos prontos.
6. **Política por base:** `aprovação obrigatória` (sim ou não), quantos aprovadores, se o autor pode aprovar a
   própria proposta. O P06 define e impõe a política na API; a tela e o fluxo de revisão são do P09.
7. **Auditoria:** autor e horário em cada entrada do changelog; autor do commit no gbrain git; log de acesso, de
   gravação e de negação.
8. **Cotas de LLM** por usuário e por período, e limite de requisições.
9. **Recusar configuração insegura:** subir fora de `localhost` sem autenticação exige opção explícita e avisa.
10. **Testes de autorização** por rota (matriz capacidade × rota), incluindo as rotas de streaming, e testes do fluxo
    OIDC contra um IdP de teste em contêiner.
11. **Preparo para o P18:** toda decisão de acesso parte de `{organização, base, capacidade}`, com uma organização
    padrão; sessão e cotas atrás de uma interface de armazenamento, não em variáveis do processo.

## Fora do escopo

SAML, SCIM e IdP por tenant (P18). Tela de revisão e aprovação (P09). Empacotamento (P08). Cadastro próprio de
usuário e senha: o archlens não guarda senhas.

## Critérios de aceite

- Login funciona com pelo menos dois IdPs diferentes configurados só por `issuer`, `client_id` e segredo (por
  exemplo Entra ID e Keycloak), sem código específico de provedor.
- Com autenticação ligada, toda rota `/api` sem sessão ou token devolve 401; a matriz capacidade × rota tem teste.
- Quem não tem `planejar` não vê o Planejar nem consegue chamar suas rotas; quem não tem `aplicar` não aplica; numa
  base com aprovação obrigatória, aplicar sem aprovação devolve 403 mesmo para quem tem `aplicar`.
- Trocar o grupo da pessoa no IdP muda o acesso no próximo login, sem editar a configuração do archlens.
- Cada entrada nova do changelog tem autor, e o formato continua legível pela linha v0.
- O modo local continua funcionando sem configurar nada (`bin/archlens serve architecture --open`).

## Decisões a fechar no brainstorm

- **Facebook e afins:** federar por um agregador que fale OIDC (Cognito, Keycloak, Entra External ID), que é a via
  recomendada, ou escrever adaptadores OAuth 2.0 por provedor. Perguntar ao dono qual o caso de uso de login social
  numa ferramenta de arquitetura corporativa antes de investir.
- OIDC no próprio servidor (recomendado, dado o requisito) e, além disso, aceitar identidade vinda de um proxy
  autenticador para quem já tem um.
- Biblioteca de OIDC ou implementação própria. O núcleo tem zero dependências; o servidor pode ter. Autenticação não
  é lugar para código caseiro.
- Onde mora o mapeamento grupo → capacidade: arquivo de configuração, ou tela de administração com armazenamento.
- Onde guardar sessão e contadores (memória, arquivo, banco, Redis). Afeta P08 e P18.
- Campo de autor no changelog: campo opcional novo no formato 2.0 (a v0 ignora) ou só no log do servidor.

## Obrigações do repositório

Campo de autor no changelog toca o formato: avaliar archlens-ask (`npm run ask`, `check-ask`), os conectores e a
compatibilidade com a v0 (P00). `AGENTS.md`, sentido único: o núcleo não muda para acomodar a GUI além do que fizer
sentido para a CLI também (`apply --author`, por exemplo).

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seções 2.4 e 2.6, R2), `P06-autenticacao-e-autorizacao.md`,
> `docs/superpowers/specs/2026-10-28-archlens-gui-design.md` e `apps/gui/server/app.mjs`. Conduza o brainstorm
> começando pelo ambiente real do dono: quais IdPs precisam funcionar no primeiro dia e de onde vêm os grupos.
> Consulte a documentação atual de OIDC de cada provedor citado; não confie na memória. Divida em ciclos:
> (1) OIDC e sessão, (2) capacidades e política por base, (3) tokens para CLI, (4) auditoria e cotas.
