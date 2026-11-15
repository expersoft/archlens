# Roadmap de produto do archlens: análise e planos

- **Data:** 2026-11-14
- **Base analisada:** `develop-v2` em `9b2ac01` (versão 0.6.0 mais os PRs #34 a #37, ainda não lançados). A primeira
  versão deste documento foi escrita sobre `823da71`; os números e as evidências foram reconferidos em `9b2ac01`
- **Alvo decidido:** servidor de time **self-hosted** (a GUI num servidor interno, vários usuários), sem deixar de
  funcionar como plugin/CLI local
- **Decisões da entrevista:** CI no GitHub Actions; migrar o núcleo para TypeScript; todas as lacunas funcionais do
  roadmap entram (visões, exportações, edição e governança na GUI, conectores) e mais um app desktop (Electron)
- **Terceira rodada (2026-11-14):** oito decisões de fundação para o SaaS multi-tenant (seção 2.6, R5)
- **Revisão de 2026-11-14 (segunda rodada):** cinco requisitos novos avaliados em `79d14f2` (seção 2.6) e a decisão
  de abrir uma **linha v1.0.0** numa branch paralela, com `develop-v2` mantendo as versões 0.x (seção 3)

Este documento traz a análise e a ordem. Cada plano (`P00`…`P18`) é um arquivo próprio nesta pasta, escrito para ser
entregue a outro modelo como **entrada de um ciclo de SDD separado** (brainstorm → spec → plano → execução). Eles são
briefs, não planos de implementação: dizem o problema, a evidência, o escopo, os critérios de aceite e as decisões que
o ciclo precisa fechar.

## 1. Retrato do projeto

| Parte | Onde | Tamanho | Observação |
|---|---|---|---|
| Núcleo + CLI | `scripts/archlens.mjs`, `scripts/lib/` | ~12,2 mil linhas, 64 módulos `.mjs` | JS puro, sem tipos, sem build; 1 dependência de desenvolvimento (elkjs, vendorizada) e 1 opcional (playwright-core) |
| Store (conectores) | `scripts/lib/store/` | 16 módulos | contrato explícito (`contract.mjs`), json, markdown, gbrain git e MCP, legado |
| GUI | `apps/gui/` (server Node sem framework + React 18/Vite) | ~20 mil linhas (com testes) | navegar, perguntar, planejar, editar o nó e aplicar, com LLM (Anthropic ou compatível com OpenAI) |
| Skills | `skills/archlens-{plan,apply,query}` | 3 | plugin do Claude Code |
| Pacote portátil | `portable/archlens-ask/` | gerado + manual | derivado do núcleo, com `check-ask` |
| Testes | `tests/` (node:test), `apps/gui/server/*.test.mjs`, vitest, e2e | 858 na raiz, 351 no servidor da GUI, 386 no vitest | todos passam numa árvore limpa |

## 2. Análise

### 2.1 Contexto de negócio

**Coberto.** O objetivo declarado em `docs/superpowers/roadmap.md` (base perene de arquitetura, evoluída por prompts e
leitura de repositórios, com visões C4 e ArchiMate sob demanda) está entregue nos itens a, a.1–a.3, b, e.1–e.3 e
e.4.1. Além do roadmap, já existem a GUI (explorar, perguntar, planejar, editar o nó e sua documentação, aplicar), os
lançadores, o filtro `where` por propriedade e o archlens-ask.

**Lacunas.**

1. **O roadmap está desatualizado.** `roadmap.md` não cita a GUI, os lançadores, a documentação do nó nem a edição pela GUI
   (seis specs de outubro e novembro sem linha na tabela), e marca o archlens-ask como "em andamento". Não há uma visão única do que falta.
2. **Itens "depois" nunca detalhados:** c (deployment do C4, mapa de capacidades, foco de negócio no C4, fluxos de
   eventos), d (Structurizr, PlantUML/Mermaid, ArchiMate Open Exchange), e.4.2–e.4.4 (neo4j, relacional, S3).
3. **Sem interoperabilidade de saída.** Quem já usa Archi, Structurizr ou uma wiki com Mermaid não consegue levar nada
   do archlens além de SVG/PNG. É a maior barreira de adoção num time que já tem ferramentas.
4. **Uso em time é só pela base compartilhada.** A GUI já edita a base (pelo Planejar e pelo painel do nó), mas não tem
   usuários, papéis nem trilha de quem aplicou o quê; os rascunhos de plano vivem no navegador (`apps/gui/web/src/plan/draftStore.ts`); não há revisão nem aprovação.
5. **Planejar pela GUI não funciona em base gbrain no modo MCP** (`E_GUI_PLAN_MCP` em `apps/gui/server/plan/routes.mjs`).
6. **Defeito conhecido sem dono:** com `granularity: "system"`, a realização de um serviço por um container não sobe
   para o sistema-pai (achado lateral em `specs/2026-10-28-diagram-latency-tech-debt.md`).
7. **Pendências registradas e abertas** no fim do `roadmap.md` (tracejados de `planned`/`inferred`, `?` na relação
   errada, marca visual de pendências de visão, entre outras).
8. **Só português.** Mensagens, documentação e prompts estão em pt-BR, sem camada de tradução.

### 2.2 Arquitetura e código

**Pontos fortes** (vale preservar):

- Núcleo funcional e quase puro: `api.mjs` declara "puro, fora ler o store"; erros com código (`E_*`) em vez de texto.
- Contrato de conector explícito e testado (`store/contract.mjs`, `tests/store-contract.test.mjs`), com versão
  otimista por objeto e escrita atômica (`store/atomic.mjs`).
- Derivados com checagem de frescor: `check-ask`, `check-plugin`, `prompt:check`, schemas gerados.
- Disciplina de SDD: 15 specs e 16 planos versionados; `AGENTS.md` obriga a avaliar impacto no archlens-ask e na GUI.
- Pouquíssimas dependências, versões fixas, `npm audit` sem vulnerabilidades (raiz e GUI).

**Problemas.**

| # | Achado | Evidência | Efeito |
|---|---|---|---|
| A1 | Sem tipos no núcleo | 62 módulos `.mjs`; só a web da GUI passa por `tsc` | contratos (`raw`, `model`, `plan`, `spec`, `ctx`) vivem em comentários; refatorar é arriscado |
| A2 | Sem fronteira pública do núcleo | o servidor da GUI importa **29 módulos internos** por caminho relativo (`../../../scripts/lib/...`) em 16 arquivos | qualquer mudança interna pode quebrar a GUI; por isso existe a regra manual no `AGENTS.md` |
| A3 | `render.mjs` com 1182 linhas | SVG, CSS e o cliente inteiro do navegador (≈ 500 linhas de JS dentro de uma string) no mesmo arquivo | o cliente não tem teste unitário, lint nem tipos; só é exercido pelo Playwright |
| A4 | CLI como um `switch` de 891 linhas | `scripts/archlens.mjs`: 20 comandos em `main()`, o `migrate` sozinho com ~90 linhas | regra de negócio misturada com E/S e `process.exit`; difícil de testar por comando |
| A5 | Store síncrono | `store.read()` síncrono, 54 chamadas `readFileSync`/`writeFileSync`, `spawnSync` no git | a GUI recusa conector assíncrono ("conector assíncrono ainda não suportado") e usa worker thread para contornar (leitura, clone e, agora, o `apply` rodam em workers); bloqueia neo4j, SQL e S3 |
| A6 | Módulos grandes de responsabilidade múltipla | `gbrain-mcp.mjs` (939), `layout.mjs` (863), `merge.mjs` (763) | custo de leitura alto para humanos e para agentes |
| A7 | `scripts/` como nome do núcleo | o produto mora numa pasta chamada "scripts", com vendor dentro | estrutura não comunica as camadas (núcleo, CLI, apps) |

### 2.3 Manutenibilidade

| # | Achado | Evidência |
|---|---|---|
| M1 | **Não existe CI.** | sem `.github/workflows`; `check-ask`, `check-plugin`, `gui:test` dependem de alguém lembrar |
| M2 | A suíte passa, mas só quando alguém roda | num checkout limpo de `9b2ac01`: raiz 858 testes (856 passam, 2 pulados), servidor da GUI 351, vitest 386, `typecheck`, `check-ask`, `check-plugin` e `prompt:check` sem erro. Nada disso roda sozinho |
| M3 | Testes acoplados a exemplos mutáveis | `tests/query-md.test.mjs` usa `examples/loja-online/` (documentação viva) como fixture. Na primeira medição, sobre `823da71` e com esses exemplos modificados localmente, 3 testes de snapshot falharam; a relação é provável, não foi isolada |
| M4 | Sem lint nem formatador | nenhum eslint/prettier/biome na raiz nem na GUI |
| M5 | Suíte lenta | `npm test` leva ~134 s; a do servidor da GUI, ~62 s |
| M6 | Sem medida de cobertura | nenhum relatório; o cliente do `render.mjs` é um ponto cego |
| M7 | Regras de processo só em texto | `AGENTS.md` pede passos manuais que um CI faria |
| M8 | Release manual | `README.md` descreve ~8 passos à mão, com um ajuste manual do `package.json` |

### 2.4 Segurança

O servidor da GUI foi escrito com cuidado para **uso local**: guarda de DNS rebinding, checagem de origem e
`content-type` em todo POST, limites de corpo, token do git só por `GIT_ASKPASS` e só para hosts listados, ambiente
filtrado para o git, lista de arquivos secretos, credenciais removidas antes de chegar ao LLM, `markdown-it` com
`html: false`. Para o alvo **servidor de time**, faltam:

| # | Achado | Evidência | Gravidade no alvo |
|---|---|---|---|
| S1 | **Sem autenticação nem autorização.** Em `--host 0.0.0.0` qualquer um na rede lê as bases, gasta a cota do LLM e, com `plan` ligado, **grava a base** e dispara clones com o token do servidor | `apps/gui/server/app.mjs`: nenhuma rota confere identidade; `hostAllowed` aceita qualquer Host quando ligado em todas as interfaces. O risco é conhecido: `archlens serve` já imprime "qualquer um que alcance a porta pode aplicar" | crítica |
| S2 | O diagrama roda na **origem do host** | `apps/gui/web/src/Diagram.tsx`: `<iframe srcDoc sandbox="allow-scripts allow-same-origin …">`; essa combinação não isola nada. O HTML vem do conteúdo da base; qualquer falha de escape em `render.mjs` vira XSS com acesso às rotas de gravação | alta |
| S3 | `postMessage` com alvo `'*'` e sem CSP de conteúdo | `bridge.ts:42`, `render.mjs:689`; só `frame-ancestors` é enviado | média |
| S4 | SSRF pelo clone | `plan/repo.mjs` aceita qualquer host https/ssh; num servidor, isso alcança a rede interna | média |
| S5 | Sem trilha de auditoria por usuário | o changelog da base não registra quem aplicou | média |
| S6 | Sem limite de uso por usuário | há teto por mensagem (`maxTokens`), não por pessoa nem por período | média |
| S7 | Texto de repositórios e da base vai ao LLM | já tratado como "conteúdo externo" nos prompts, mas sem teste adversarial de injeção de prompt nas ferramentas de escrita | média |
| S8 | Sem modelo de ameaças nem `SECURITY.md` | — | baixa |

### 2.5 Performance

- **Medido (débito de 2026-10-28):** numa consulta pela skill, ~88% do tempo é do modelo; a CLI responde por ~3,7 s
  de ~30 s. As propostas M1–M4 e C1–C5 daquele documento seguem abertas (ainda há `waitForTimeout(120)` e viewports em
  série em `scripts/lib/deliver.mjs`).
- **Não medido:** comportamento com bases grandes. Os exemplos têm 13–32 KB; não há base sintética de milhares de
  elementos nem orçamento de tempo. Tudo abaixo é risco inferido da leitura do código, não medição:
  - a GUI relê e calcula o hash da base inteira a cada 5 s por base (`bases.mjs`, `pollMs`);
  - o layout (ELK) roda na thread principal do servidor; um layout grande trava as outras requisições;
  - `auto` calcula três estilos de layout por visão;
  - cada chamada da CLI lê e normaliza a base inteira.
- O cache de visões da GUI (LRU de 200, por versão da base e spec canônica) é adequado.

### 2.6 Requisitos adicionais (segunda rodada)

Cinco requisitos avaliados contra o código de `origin/develop-v2` (`79d14f2`).

| # | Requisito | O que existe hoje | Veredito | Onde entra |
|---|---|---|---|---|
| R1 | Edição gráfica: criar, alterar e excluir nós e conexões pela tela | A camada de edições da tela (`apps/gui/server/plan/edits.mjs`) aceita **só** `properties` e `doc` de nós que já existem; qualquer outro campo é recusado. Criar ou remover elementos e relações só pelo chat, pela CLI ou por leitura de repositório | não coberto (o P09 citava como "levantar lacunas") | **P15**, novo |
| R2 | Autenticação e autorização por IdPs de mercado, com permissões de planejar, aplicar e aprovar | Nenhuma identidade no servidor | coberto em parte pelo P06, que deixava o mecanismo em aberto | **P06**, reescrito |
| R3 | Conector primário com sincronismo para conectores complementares | `store convert` **move** a base de um conector para outro, uma vez; não existe espelho nem sincronismo. O manifesto aceita um único `store` | não coberto | **P16**, novo (depende de P04 e P12) |
| R4 | CLI, GUI e desktop acessando um archlens central, sem acesso direto ao conector | A CLI abre o store local em todo comando. A API HTTP é interna da GUI: sem versão, sem identidade, desenhada pelas telas, com o rascunho inteiro viajando no corpo | não coberto; não existe servidor MCP do archlens (só o cliente do gbrain) | **P17**, novo, com servidor MCP; ajustes em P06, P08, P13 |
| R5 | SaaS multi-tenant depois de tudo estável | Nada; o processo guarda estado global (um cache de visões por processo, configuração única) | não coberto, por decisão anterior | **P18**, novo e último |

**R1 — edição gráfica.** *Negócio:* é o que falta para a GUI servir a quem não quer escrever prompt, e para corrigir
à mão o que o chat ou a leitura de repositório propôs. *Arquitetura:* o caminho já está preparado. As edições da tela
são uma camada separada do delta do agente (`composeDelta`), o formato de delta já tem `rename` e `remove`, e o
núcleo já sabe validar uma relação entre dois tipos (`checkRelationship` em `scripts/lib/registry.mjs`). Falta
estender essa camada para elementos e relações e dar à ponte do iframe mensagens de edição (hoje só `select`,
`context`, `expand`). O diagrama é desenhado no servidor com layout automático (ELK): editar graficamente aqui
significa **comandos sobre o modelo** (paleta, ligar dois nós, excluir, renomear, mover de pai), não posicionamento
livre de caixas. *Segurança:* mais mensagens na ponte e mais campos de texto do usuário no diagrama, o que reforça o
P07. *Performance:* cada edição refaz o plano e redesenha a prévia no servidor; precisa de orçamento de resposta
(P05). *Manutenibilidade:* depende do cliente do diagrama ser modular e testável (P03).

**R2 — identidade.** *Negócio:* requisito de entrada para qualquer empresa. *Arquitetura:* um único protocolo cobre
os provedores citados: **OpenID Connect** (Entra ID, AWS Cognito, Google, Keycloak, Okta). O Facebook oferece OAuth 2.0
com um perfil de OIDC limitado; se for exigido, a via simples é federá-lo por um agregador (Cognito, Keycloak, Entra
External ID) em vez de tratá-lo no archlens. As permissões pedidas viram **capacidades por base** (ver, perguntar,
planejar, aplicar, aprovar, administrar) e uma **política por base** (aprovação obrigatória ou não), em vez de três
papéis fixos. Clientes que não são navegador (CLI, desktop) precisam de fluxo próprio: código de dispositivo ou
PKCE com retorno em `localhost`, e tokens de acesso pessoais para automação. *Segurança:* é o achado S1.

**R3 — primário e réplicas.** *Negócio:* resolve a tensão entre "base confiável e transacional" e "base legível por
outras ferramentas e assistentes" (o archlens-ask lê o gbrain). *Arquitetura:* recomenda-se **sentido único**:
primário → réplicas somente leitura, disparado depois de cada `apply` e conferido por uma reconciliação periódica.
Sincronismo nos dois sentidos traz conflito de escrita e deve ficar fora. Uma mudança feita direto na réplica é
detectada e relatada (ou vira um delta que passa pelo plano), nunca mesclada em silêncio. **Ponto de atenção:** no
modo MCP do gbrain quem grava é um agente chamando ferramentas, com recibos; um servidor não consegue replicar para
lá sozinho, a menos que passe a ser cliente MCP. A réplica gbrain em modo git não tem esse problema. *Performance:* a
replicação roda fora do caminho do `apply` (fila), para não somar latência à gravação. *Segurança:* o servidor passa
a guardar credenciais de vários destinos.

**R4 — acesso remoto.** *É preciso criar uma API?* **Sim.** A API de hoje serve às telas e não tem contrato estável.
Há duas formas, e a recomendação é ter as duas em camadas:

- **API de caso de uso** (`/api/v1`: buscar, resolver visão, cartão do elemento, planejar, aplicar, histórico). O
  servidor responde com o modelo que já mantém em memória e com o cache de visões. É a que GUI, desktop e as
  consultas da CLI usam, e a única que permite autorização fina.
- **Conector remoto** (`store.kind: "remote"`): expõe o contrato do store por HTTP (retrato da base com versão,
  subgrafo, `apply` com versões esperadas). Permite que `plan`, `apply` e `build` da CLI continuem rodando no
  cliente sem reescrita. Entrega a base inteira a quem tem acesso de leitura.

*Performance (hipóteses a medir no P05, nada medido ainda):* para consultas, o caminho remoto tende a ser **mais
rápido** que o local, porque hoje cada comando da CLI lê e normaliza a base inteira e o servidor já tem isso pronto.
O custo novo é a rede. Mitigações previstas: GET condicional por versão (`ETag`) com cópia local do retrato em
`.archlens/`, compressão, conexão persistente, leitura por subgrafo e respostas em fluxo. Meta proposta: sobrecarga
p95 de até 100 ms por comando em rede local para a base de referência, e nenhuma etapa interativa mais lenta que o
modo local. Lembrete da medição de outubro: ~88% do tempo de uma consulta pela skill é do modelo, não da CLI.
*Segurança:* é o ganho principal. As credenciais do conector ficam num ponto só; cada pessoa usa a própria
identidade; toda escrita passa pela autorização e pela auditoria. *Servidor MCP (decidido):* a API inclui um servidor **MCP** do
archlens, uma terceira porta sobre as mesmas funções da API de caso de uso, com a mesma autorização. Atende
assistentes de IA em qualquer conector, sem depender do layout do gbrain como o archlens-ask depende; leitura
primeiro, escrita desligada por padrão. Detalhe no P17.

**R5 — SaaS multi-tenant.** A construção fica para depois da 1.0 estável, como pedido. As **fundações** foram
decididas agora, numa terceira rodada de entrevista (2026-11-14), para os planos da v1 já nascerem prontos:

| # | Decisão do dono | Consequência | Planos |
|---|---|---|---|
| D1 | Isolamento por **linha com `org_id` e Row-Level Security** no PostgreSQL | toda tabela tem `org_id`; RLS forçada; a conexão declara a organização a cada transação; suíte de testes que tenta cruzar organizações. É o modelo mais barato e o que menos perdoa erro: o isolamento depende de política e de teste, não de separação física | P12, P17, P18 |
| D2 | As bases moram **no banco do serviço ou no repositório do cliente**, à escolha de cada tenant | todo recurso funciona com qualquer conector como primário; credenciais de conector guardadas por organização e por base; o contrato do store (P04) é a única abstração permitida | P04, P08, P12, P16, P17 |
| D3 | LLM: **chave do serviço com cota e chave do cliente (BYOK)** | configuração de provedor, chave e cota por organização, não mais um bloco `llm` global; segredo cifrado em repouso | P06, P08, P17 |
| D4 | Hierarquia **organização → bases** | caminhos `/api/v1/orgs/{org}/bases/{base}`; permissão por base ou padrão da organização; sem nível intermediário | P06, P17 |
| D5 | IdP corporativo **só por agregador** | o archlens fala OIDC com **um emissor**; Keycloak, Cognito ou Entra External ID federam os IdPs dos clientes, o login social, SAML e provisionamento. A organização do usuário e seus grupos chegam como claims do token | P06, P08, P18 |
| D6 | **Núcleo aberto (MIT) e SaaS fechado** | o que é só do SaaS vive em pacote privado, ligado por pontos de extensão públicos; o repositório aberto nunca importa o privado | P02, P17, P18 |
| D7 | Modelo de cobrança **ainda indefinido** | medição genérica desde a fundação: eventos `{organização, usuário, base, tipo, quantidade}` para usuários ativos, tokens de LLM e tamanho, entregues a um coletor substituível | P06, P08 |
| D8 | Hospedagem **agnóstica, em Kubernetes** | só contêiner, PostgreSQL e armazenamento compatível com S3; nenhum serviço específico de nuvem; servidor sem estado local, pronto para várias réplicas | P08, P12 |

Além delas, continuam valendo como critérios de aceite: nenhum estado global no processo (hoje `views.mjs` tem um
cache padrão por módulo e a configuração é única) e autorização sempre a partir de `{organização, base, capacidade}`.

**Pontos de atenção que as decisões criam.**

- **D1 + D2 juntas:** RLS só protege o que está no PostgreSQL do serviço. Quando a base mora no repositório do
  cliente, o isolamento passa a depender de o servidor nunca usar a credencial de uma organização para outra. A
  resolução `organização → credencial → conector` precisa de um único ponto no código, com teste próprio.
- **D2 e o gbrain em modo MCP:** como primário num servidor central ele não funciona hoje (quem grava é um agente; a
  GUI recusa com `E_GUI_PLAN_MCP`). Ou o servidor vira cliente MCP, ou esse modo fica fora do "repositório do
  cliente" no SaaS. Decisão do P16/P17.
- **D5:** simplifica o P06 (um emissor só) e move a complexidade para a operação do agregador, que entra no exemplo
  de implantação do P08. Uma empresa que usa só Entra ID pode apontar direto para ele, sem agregador.
- **D6:** os pontos de extensão têm de existir antes de haver código privado, senão o SaaS acaba exigindo mudanças no
  núcleo. São eles: resolução de organização, armazenamento de sessão e de propostas, provedor de segredos, coletor
  de medição, política de autorização.

## 3. Duas linhas: v0 em manutenção e v1 em construção

**Decisão do dono:** a versão **1.0.0** nasce numa branch nova, paralela a `develop-v2`. `develop-v2` segue como
linha de manutenção das versões **0.x**. Tudo que entra em `develop-v2` tem de chegar à linha v1.

**Impacto nos planos.**

- **O custo do forward-merge cresce com mudanças estruturais na v1.** P02 troca a extensão de 64 arquivos, P03 parte
  `render.mjs` e a CLI em vários, P04 espalha `await` pelo núcleo. Uma correção feita em `render.mjs` na v0 não
  encontra o mesmo arquivo na v1 depois do P03 e precisa ser portada à mão.
- **Conflitos certos a cada merge:** `package.json` (versão), `CHANGELOG.md`, `.claude-plugin/*.json` e
  `portable/archlens-ask/REFERENCE.md` (que cita a versão) divergem por definição.
- **Formato da base.** Se a v1 mudar o formato 2.0 de modo incompatível (por exemplo, autor no changelog), uma base
  compartilhada entre pessoas em v0 e v1 quebra.
- **Distribuição.** O marketplace do plugin lê a branch padrão (`main`); a v1 não pode ir para lá antes de ser estável.

**Recomendações** (detalhadas no [P00](P00-linhas-v0-e-v1.md)):

1. **Antes de criar a branch v1, entregar em `develop-v2` o que serve às duas linhas:** P01 (CI) e P07 (correção de
   segurança que protege quem já usa a 0.x). A v1 herda os dois na criação.
2. **v0 só recebe correção e segurança.** Funcionalidade nova entra só na v1. Menos divergência, menos conflito.
3. **Merge, não cherry-pick,** de `develop-v2` para a v1, automatizado: a cada push em `develop-v2`, um PR de
   forward-merge é aberto; ele não pode ficar parado.
4. **Renomear sem alterar.** No P02, o commit que troca `.mjs` por `.ts` não muda conteúdo, para o git reconhecer a
   renomeação e levar as correções da v0 ao arquivo novo. A reorganização de pastas fica para depois do fim da v0.
5. **P03 por último na fundação**, e só depois de combinar com o dono o custo de portar correções à mão.
6. **Formato 2.0 compatível** nas duas linhas enquanto a v0 existir: a v1 só acrescenta campos opcionais que a v0
   ignora. Mudança incompatível exige nova versão de formato e `migrate`.
7. **Fim da v0 com data ou critério** (por exemplo, 90 dias depois da 1.0.0).

## 4. Roadmap

**Linha:** `v0` = entra em `develop-v2` e chega à v1 pelo forward-merge; `v1` = só na branch nova.

| Plano | Linha | Entrega | Depende de | Tamanho |
|---|---|---|---|---|
| [P00](P00-linhas-v0-e-v1.md) | v0 e v1 | Branch v1, forward-merge automático, política da v0, pré-lançamentos | P01 | P |
| [P01](P01-ci-e-suite-verde.md) | v0 | CI no GitHub Actions, lint, fixtures congeladas | — | P |
| [P02](P02-nucleo-typescript-e-fronteira.md) | v1 | Núcleo em TypeScript com fronteira pública | P00 | G |
| [P03](P03-decompor-render-e-cli.md) | v1 | `render` e CLI decompostos; cliente do diagrama testável | P02 | M |
| [P04](P04-store-assincrono.md) | v1 | Contrato de conector assíncrono | P02 | G |
| [P05](P05-performance-e-escala.md) | v0 (medição) e v1 (remoto) | Benchmarks, orçamentos de tempo, latência local e remota | P01 | M |
| [P06](P06-autenticacao-e-autorizacao.md) | v1 | OIDC com um emissor, organização e capacidades por base, aprovação, auditoria, cotas | P00 | G |
| [P07](P07-hardening-da-gui.md) | v0 | Isolamento do diagrama, CSP, SSRF, modelo de ameaças | P01 | M |
| [P08](P08-empacotamento-e-operacao.md) | v1 | Contêiner pronto para Kubernetes, saúde, logs, métricas, medição, guia de implantação | P06, P07, P17 | M |
| [P09](P09-edicao-e-governanca-na-gui.md) | v1 | Propostas no servidor, revisão e aprovação, histórico e diff visual | P06 | G |
| [P10](P10-visoes-que-faltam.md) | v0 (defeitos) e v1 (visões) | Deployment, capacidades, negócio no C4, fluxos de eventos | P01 | G |
| [P11](P11-exportacoes.md) | v1 | Mermaid, PlantUML, Structurizr DSL, ArchiMate Open Exchange | P00 | M |
| [P12](P12-conectores-remotos.md) | v1 | PostgreSQL, S3, neo4j (um ciclo por conector) | P04 | G |
| [P13](P13-app-desktop-electron.md) | v1 | App desktop, local ou ligado a um servidor | P02, P07, P17 | M |
| [P14](P14-distribuicao-release-e-docs.md) | v0 e v1 | Release automatizado das duas linhas, roadmap vivo, documentação | P01 | P |
| [P15](P15-edicao-grafica-do-modelo.md) | v1 | Criar, alterar e excluir nós e conexões pela tela | P03, P07 | G |
| [P16](P16-primario-e-replicas.md) | v1 | Conector primário com réplicas sincronizadas | P04, P12, P17 | G |
| [P17](P17-api-remota-e-clientes.md) | v1 | API v1, conector remoto, servidor MCP, CLI e GUI como clientes | P02, P04, P06 | G |
| [P18](P18-saas-multi-tenant.md) | depois da 1.0 | Tenants, SSO corporativo, isolamento, cobrança | todos | G |

**Ordem sugerida.**

1. **Fase 0, em `develop-v2`:** P01, depois P07 e a parte de medição do P05, com o release automatizado do P14.
2. **Abertura da v1:** P00 (branch, forward-merge, política).
3. **Fase 1, fundação da v1:** P02 → P04 → P03.
4. **Fase 2, servidor central:** P06 → P17 → P08, com P09 em seguida.
5. **Fase 3, funcional:** P10 (visões), P11, P15, P12 → P16, P13.
6. **1.0.0** quando as fases 1 a 3 estiverem estáveis (critério no P00).
7. **Fase 4:** P18.

**Conflitos a evitar:** P02 ao mesmo tempo que P03, P10 ou P11 nos mesmos arquivos; P09 e P15 antes de P06 fechar o
modelo de capacidades; P16 antes de existir um primário real (P12); P13 antes de a API v1 (P17) estar estável.

## 5. Como usar os planos

Cada arquivo `Pnn-*.md` tem as mesmas seções: objetivo, evidência, escopo, fora do escopo, critérios de aceite,
decisões a fechar no brainstorm, obrigações do repositório e um prompt de partida. Para rodar um:

1. Abra uma sessão nova numa worktree própria, criada a partir da branch da **linha** do plano (coluna Linha).
2. Cole o **prompt de partida** do plano. Ele manda ler o brief e este README.
3. Com superpowers: `brainstorming` (fecha as decisões listadas) → spec em `docs/superpowers/specs/` →
   `writing-plans` → `subagent-driven-development` ou `executing-plans` → `requesting-code-review`.
   Com outro conjunto de skills, o brief serve como PRD de entrada do mesmo jeito.
4. Todo PR segue o `AGENTS.md`: avaliar impacto no archlens-ask e na GUI, rodar `npm run check-ask` e
   `npm run gui:test`.

Planos de tamanho **G** devem ser divididos em mais de um ciclo no brainstorm; cada brief sugere os cortes.
