# P17 — API remota: servidor central, servidor MCP, CLI e GUI como clientes

**Linha:** v1 · **Tamanho:** G · **Depende de:** P02 (fronteira do núcleo), P04 (contrato assíncrono), P06 (identidade) · **Desbloqueia:** P08, P13, P16, P18 · **Requisito:** R4

## Objetivo

O conector principal é acessado num ponto só. CLI, GUI, app desktop e **assistentes de IA (por MCP)** falam com um
servidor archlens pela rede, cada pessoa com a própria identidade, sem que ninguém precise de credencial do banco, do repositório ou do gbrain. O
tempo de resposta não piora de forma perceptível em relação ao uso local.

## Evidência

- **A CLI é só local.** Todo comando de base passa por `openBase` → `openStore(resolveBase(...))` em
  `scripts/archlens.mjs`; o comando `remote` trata apenas do espelho do gbrain em modo MCP.
- **A API HTTP atual é interna da GUI** (`apps/gui/server/app.mjs`, `plan/routes.mjs`): caminhos sem versão
  (`/api/bases/...`), sem identidade, respostas moldadas pelas telas, erros como `{ error, code }`. O rascunho de
  plano viaja inteiro no corpo de cada chamada de `/plan*`.
- O servidor já tem o que uma API de consulta precisa: o modelo normalizado em memória por base, recarregado quando a
  versão muda (`bases.mjs`), e um cache LRU de visões por versão e spec (`views.mjs`).
- As skills chamam a CLI (`"$ARCHLENS/bin/archlens"`); se a CLI falar com o servidor, as skills passam a funcionar
  remotamente sem mudar.
- **Não existe servidor MCP do archlens.** O que há com "MCP" no nome é o contrário: o archlens como *cliente* das
  ferramentas do gbrain (`scripts/lib/store/gbrain-mcp.mjs`). Assistentes sem execução de código são atendidos hoje
  pelo archlens-ask, um pacote de texto que ensina o assistente a ler as páginas da base **no gbrain**
  (`portable/archlens-ask/`); ele depende do layout dessas páginas e só consulta.
- O núcleo já produz as respostas que um servidor MCP devolveria: `query --format md|json`, `viewAnswer` e
  `formatViewAnswer` (`scripts/lib/query-md.mjs`), o cartão do elemento, `findCandidates` (`match.mjs`).
- Custos conhecidos do modo local: cada comando da CLI lê e normaliza a base inteira; `deliver` e `build` precisam de
  Chromium na máquina.
- Medição de outubro: numa consulta pela skill, a CLI responde por ~3,7 s de ~30 s; o resto é o modelo.

## Avaliação: é preciso uma API nova?

**Sim.** Duas camadas, com papéis diferentes:

| Camada | O que expõe | Quem usa | Prós | Contras |
|---|---|---|---|---|
| **API de caso de uso** (`/api/v1`) | buscar, resolver e desenhar visão, cartão e documentação do elemento, planejar, responder itens, aplicar, histórico, propostas | GUI, desktop, consultas da CLI, integrações | usa o modelo em memória e o cache; autorização fina; pouca transferência | cada comando da CLI precisa de um caminho remoto |
| **Conector remoto** (`store.kind: "remote"`) | o contrato do store por HTTP: retrato com versão, subgrafo, versões por objeto, `apply` de operações, histórico | `plan`, `apply`, `build`, `check` da CLI sem reescrita | reaproveita todo o núcleo no cliente | entrega a base inteira a quem pode ler; autorização só por base |

Recomendação: a API de caso de uso é o produto; o conector remoto é o atalho de compatibilidade para a CLI e pode ser
restrito a quem tem capacidade de planejar.

O **servidor MCP** é uma terceira porta de entrada sobre a mesma API de caso de uso, não uma API à parte: cada
ferramenta MCP chama a mesma função que a rota `/api/v1` correspondente, com a mesma autorização e a mesma auditoria.

## Escopo

1. **API v1 versionada e documentada** (OpenAPI gerado dos tipos do P02), com erros `E_*` estáveis, paginação e
   idempotência nas escritas. A GUI migra para ela; a API antiga sai.
2. **Organização no caminho** (`/api/v1/orgs/{org}/bases/{base}/...`), dois níveis e nada entre eles (decisão D4),
   com uma organização padrão no self-hosted. A organização do caminho tem de bater com a do token; divergência é 404.
3. **Um ponto só para `organização → credencial → conector` (D2):** o registro de bases passa a ser por organização,
   e a credencial de cada conector vem do provedor de segredos. Nenhum outro código abre um store. Com a base no
   repositório do cliente, é esse ponto que isola os tenants (a RLS do P12 só cobre o banco do serviço).
4. **Sem estado global (D6):** registro de bases, cache de visões e configuração de LLM são por organização e
   injetados; o cache padrão por módulo de `views.mjs` deixa de existir.
5. **Pontos de extensão públicos (D6):** as interfaces do P06 e do P08 (organização, sessão, segredos, medição,
   autorização) mais o registro de rotas e de ferramentas MCP, para o pacote privado do SaaS acrescentar o que é só
   dele. Um teste garante que o repositório aberto não importa nada do privado.
6. **Conector remoto** no núcleo, passando no teste de contrato do P04.
7. **CLI com destino remoto:** `archlens login <url>`, perfis de servidor, e os comandos de base aceitando uma base
   remota. Consultas (`views`, `resolve`, `query`, `find`) pela API de caso de uso; `plan`/`apply` pelo conector
   remoto ou por rotas próprias.
8. **Identidade para clientes que não são navegador** (com P06): fluxo de código de dispositivo ou PKCE com retorno
   em `localhost`, e tokens pessoais com escopo e validade para automação e CI.
9. **Onde os diagramas são gerados:** o servidor desenha e confere (ele tem o Chromium); o cliente recebe HTML, SVG
   ou PNG. `build` remoto roda no servidor.
10. **Performance** (ver seção abaixo).
11. **Compatibilidade de versões:** o cliente informa sua versão; o servidor recusa com mensagem clara o que não
   suporta.
12. **Modo local intacto:** sem servidor configurado, tudo funciona como hoje.
13. **Servidor MCP do archlens** (seção própria abaixo).

## Servidor MCP

Decisão do dono (2026-11-14): o servidor MCP faz parte da API planejada.

**Para quê.** Qualquer assistente com suporte a MCP (Claude, Claude Code, Copilot, IDEs) consulta e evolui a base de
arquitetura direto no servidor central, com a identidade do usuário, sem instalar a CLI, sem acesso ao conector e sem
depender de a base morar no gbrain.

**Escopo.**

1. **Transporte remoto** no servidor central (HTTP, no endereço `/mcp`), e **transporte local por stdio**
   (`archlens mcp <base>`) para quem usa uma base local sem servidor. Os dois expõem as mesmas ferramentas.
2. **Autorização** conforme a especificação de autorização do MCP para servidores remotos: o servidor archlens é o
   recurso protegido e o IdP do P06 emite os tokens. Cada chamada carrega o usuário; capacidades e política de
   aprovação por base valem igual à API.
3. **Ferramentas de leitura** (capacidade `ver`): listar bases; buscar elementos por nome ou alias; listar visões
   salvas e sugeridas; resolver uma visão a partir de uma spec e devolver a resposta em markdown (com Mermaid quando
   o P11 existir) e em JSON; cartão e documentação de um elemento; suporte e impacto de um elemento; histórico.
4. **Ferramentas de escrita** (capacidades `planejar` e `aplicar`): criar um plano a partir de um delta; listar e
   responder os itens em aberto; submeter para revisão; aplicar. Sempre pelo fluxo de plano, nunca gravação direta.
   Desligadas por padrão; o administrador liga por base.
5. **Recursos e prompts MCP:** a referência de visões e de notação como recursos, para o assistente montar specs
   válidas sem carregar um pacote de texto; prompts prontos para as consultas comuns.
6. **Saídas pensadas para modelo:** curtas por padrão, com paginação e um parâmetro de detalhe (a medição de outubro
   mostrou que saída verbosa vira tempo de modelo). Erros `E_*` com a orientação do que fazer.
7. **Conteúdo da base é dado, não instrução:** nomes, descrições e documentação voltam marcados como conteúdo
   externo; casos adversariais de injeção de prompt entram na avaliação (com o P07).
8. **Descrição das ferramentas gerada dos mesmos tipos** da API v1 (P02), com um check de frescor como o `check-ask`.
9. **Guia de conexão** para os clientes mais usados e um teste de conformidade com o inspetor oficial do MCP no CI.

**Relação com o archlens-ask.** Os dois convivem enquanto houver assistente que não fala MCP ou time sem servidor
central. Regra do `AGENTS.md` mantida: o archlens-ask acompanha o núcleo. O servidor MCP tem duas vantagens sobre ele:
consulta qualquer conector (não só gbrain) e usa o código do núcleo em vez de regras em texto que o assistente
executa, o que elimina a divergência que o `check-ask` existe para vigiar. As perguntas de
`portable/archlens-ask/eval/perguntas.json` servem de teste para as ferramentas de leitura do MCP.

**Relação com as skills.** As três skills continuam chamando a CLI. O servidor MCP é o caminho para quem não tem a
CLI; não substitui as skills neste plano.

**Performance.** Mesmo servidor, mesmo modelo em memória, mesmo cache de visões: o custo por chamada é o da API de
caso de uso. O ganho esperado é no número de turnos do modelo (uma ferramenta de busca e uma de visão no lugar de
vários comandos e leituras de arquivo), a confirmar repetindo a medição do débito de latência.

**Segurança.** Amplia a superfície de escrita para agentes. Mitigações: escrita desligada por padrão; aplicar exige
capacidade e respeita a aprovação obrigatória; toda chamada auditada com usuário e cliente; limite de requisições e
cota por usuário; nenhuma ferramenta de rede, de arquivo ou de execução.

## Performance

Requisito do dono: sem impacto significativo no tempo de resposta. Nada abaixo foi medido; são hipóteses e metas a
confirmar com os benchmarks do P05.

- **Hipótese:** consultas remotas ficam iguais ou mais rápidas que as locais, porque o servidor não relê nem
  normaliza a base a cada comando e tem cache de visões. O custo novo é rede e autenticação.
- **Mitigações obrigatórias:** GET condicional por versão (`ETag`/`If-None-Match`) e cópia local do retrato em
  `.archlens/` para o conector remoto; compressão; conexão persistente; leitura por subgrafo em vez da base inteira;
  respostas em fluxo para operações longas (plano com LLM, `build`); validação do token sem ida ao IdP a cada
  requisição.
- **Metas propostas:** sobrecarga p95 ≤ 100 ms por comando em rede local e ≤ 300 ms com 50 ms de latência de rede,
  para a base de referência de 2 000 elementos; nenhuma etapa interativa da GUI mais lenta que hoje.
- **Risco a medir:** `plan` pelo conector remoto transfere o retrato inteiro; com base grande isso domina o tempo, e
  é o argumento para rotas de plano no servidor.

## Fora do escopo

Multi-tenant de verdade (P18). Réplicas (P16). GraphQL ou gRPC.

## Critérios de aceite

- Numa máquina sem acesso ao banco nem ao repositório da base, a CLI autenticada consulta, planeja e aplica.
- As três skills funcionam contra uma base remota sem alteração no texto das skills além da instrução de `login`.
- Um usuário sem capacidade de aplicar recebe 403 pela CLI, pela GUI e por chamada direta.
- Os benchmarks do P05 rodam em modo local e remoto e as metas acima são atendidas, ou a diferença está explicada e
  aceita pelo dono.
- A GUI não usa nenhuma rota fora de `/api/v1`.
- Duas organizações no mesmo servidor, uma com a base no PostgreSQL do serviço e outra num repositório git próprio:
  nenhuma rota, ferramenta MCP ou comando da CLI de uma alcança a base, a credencial, o cache ou a configuração de
  LLM da outra.
- O servidor roda com duas réplicas sem afinidade de sessão e responde igual em qualquer uma.
- Um assistente conectado por MCP responde as perguntas de `portable/archlens-ask/eval/perguntas.json` sobre uma
  base que **não** está no gbrain, com o mesmo gabarito.
- Pelo MCP, um usuário sem `aplicar` não aplica, e numa base com aprovação obrigatória nenhum agente aplica sem ela.
- O servidor MCP passa no inspetor oficial, nos transportes remoto e stdio, e a lista de ferramentas não diverge da
  API v1 (check de frescor no CI).
- Sem servidor configurado, `npm test` passa sem mudança de comportamento.

## Decisões a fechar no brainstorm

- Se a CLI remota cobre todos os comandos ou só consulta, plano e aplicação (por exemplo `scan`, `migrate`,
  `store convert` continuam locais ou administrativos).
- Onde roda o LLM do planejamento remoto: no servidor (chave central, cota por usuário) ou no cliente (a skill usa o
  modelo da sessão). Para as skills do Claude Code, o modelo é o da sessão e o servidor só resolve e grava.
- **MCP:** biblioteca oficial do protocolo ou implementação própria (o servidor pode ter dependências; o núcleo
  não). Confirmar na especificação vigente do MCP o transporte remoto e o fluxo de autorização antes de desenhar.
- **MCP:** quais clientes precisam funcionar no primeiro dia, e se algum deles não suporta o fluxo de autorização
  (nesse caso, tokens pessoais do P06 como alternativa).
- **MCP:** as skills passam a preferir o servidor MCP quando ele existir, ou seguem só pela CLI.
- **MCP:** critério para aposentar o archlens-ask, se houver.
- O conector remoto entrega a base inteira: aceitar, ou limitar a quem pode planejar.
- gbrain em modo MCP como primário num servidor central: o servidor vira cliente MCP, ou esse modo fica de fora
  (hoje a GUI recusa com `E_GUI_PLAN_MCP`).
- Onde mora o servidor no repositório, já que deixa de ser "o servidor da GUI".

## Obrigações do repositório

Mudança grande em `store/`, na CLI e no servidor: `npm run gui:test`, e2e, `check-ask`. As skills mudam (instrução de
login e de base remota): `npm --prefix apps/gui run prompt` e avaliar o `INSTRUCTIONS.md` do archlens-ask. O servidor MCP não muda o
archlens-ask; o `README.md` do pacote passa a explicar quando usar um ou outro.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 2.6, R4), `P17-api-remota-e-clientes.md`, os specs
> aprovados de P02, P04 e P06, e as rotas em `apps/gui/server/app.mjs` e `plan/routes.mjs`. Antes do brainstorm, meça
> com os benchmarks do P05 o tempo local de `resolve`, `query` e `plan` na base de referência, para ter a linha de
> base das metas. Divida em ciclos: (1) API v1 e migração da GUI, (2) conector remoto e `login`, (3) comandos remotos
> da CLI e skills, (4) servidor MCP: leitura primeiro, escrita depois. Para o ciclo 4, leia a especificação atual do
> MCP (transportes e autorização) em vez de confiar na memória.
