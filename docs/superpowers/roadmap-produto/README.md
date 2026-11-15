# Roadmap de produto do archlens: análise e planos

- **Data:** 2026-11-14
- **Base analisada:** `develop-v2` em `9b2ac01` (versão 0.6.0 mais os PRs #34 a #37, ainda não lançados). A primeira
  versão deste documento foi escrita sobre `823da71`; os números e as evidências foram reconferidos em `9b2ac01`
- **Alvo decidido:** servidor de time **self-hosted** (a GUI num servidor interno, vários usuários), sem deixar de
  funcionar como plugin/CLI local
- **Decisões da entrevista:** CI no GitHub Actions; migrar o núcleo para TypeScript; todas as lacunas funcionais do
  roadmap entram (visões, exportações, edição e governança na GUI, conectores) e mais um app desktop (Electron)

Este documento traz a análise e a ordem. Cada plano (`P01`…`P14`) é um arquivo próprio nesta pasta, escrito para ser
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

## 3. Roadmap

Três trilhas. A ordem dentro de cada trilha é a recomendada; as dependências entre planos estão na tabela.

| Plano | Trilha | Entrega | Depende de | Tamanho |
|---|---|---|---|---|
| [P01](P01-ci-e-suite-verde.md) | Engenharia | CI no GitHub Actions, lint, fixtures congeladas | — | P |
| [P02](P02-nucleo-typescript-e-fronteira.md) | Engenharia | Núcleo em TypeScript com fronteira pública | P01 | G |
| [P03](P03-decompor-render-e-cli.md) | Engenharia | `render` e CLI decompostos; cliente do diagrama testável | P02 | M |
| [P04](P04-store-assincrono.md) | Engenharia | Contrato de conector assíncrono | P02 | G |
| [P05](P05-performance-e-escala.md) | Engenharia | Benchmarks, orçamento de tempo, latência da CLI e da GUI | P01 | M |
| [P06](P06-autenticacao-e-autorizacao.md) | Servidor de time | Login, papéis por base, auditoria, cotas | P01 | G |
| [P07](P07-hardening-da-gui.md) | Servidor de time | Isolamento do diagrama, CSP, SSRF, modelo de ameaças | P01 | M |
| [P08](P08-empacotamento-e-operacao.md) | Servidor de time | Docker, saúde, logs, métricas, guia de implantação | P06, P07 | M |
| [P09](P09-edicao-e-governanca-na-gui.md) | Servidor de time | Propostas no servidor, revisão e aprovação, histórico e diff visual | P06 | G |
| [P10](P10-visoes-que-faltam.md) | Funcional | Deployment, capacidades, negócio no C4, fluxos de eventos, defeitos de visão | P01 | G |
| [P11](P11-exportacoes.md) | Funcional | Mermaid, PlantUML, Structurizr DSL, ArchiMate Open Exchange | P01 | M |
| [P12](P12-conectores-remotos.md) | Funcional | neo4j, relacional, S3 (um ciclo por conector) | P04 | G |
| [P13](P13-app-desktop-electron.md) | Funcional | App desktop | P02, P07 | M |
| [P14](P14-distribuicao-release-e-docs.md) | Engenharia | Release automatizado, roadmap vivo, documentação de usuário e de administrador | P01 | P |

**Ordem sugerida.**

1. **Agora:** P01. Nada mais deve começar antes de a suíte, que hoje passa, estar vigiada pelo CI.
2. **Em paralelo, logo depois:** P07 (segurança que não depende de login), P05 (medir antes de otimizar), P11 e P10
   (funcionais que só tocam o núcleo de consulta), P14.
3. **Fundação estrutural:** P02, depois P03 e P04. P02 mexe em todos os arquivos do núcleo: combine uma janela sem
   outros PRs grandes no núcleo, ou faça por pastas.
4. **Servidor de time:** P06 → P09 e P08.
5. **Depois da fundação:** P12 (precisa de P04) e P13 (precisa de P02 e P07).

**Conflitos a evitar:** P02 com P03/P10/P11 ao mesmo tempo nos mesmos arquivos; P06 com P09 (P09 parte dos papéis de
P06).

## 4. Como usar os planos

Cada arquivo `Pnn-*.md` tem as mesmas seções: objetivo, evidência, escopo, fora do escopo, critérios de aceite,
decisões a fechar no brainstorm, obrigações do repositório e um prompt de partida. Para rodar um:

1. Abra uma sessão nova numa worktree própria.
2. Cole o **prompt de partida** do plano. Ele manda ler o brief e este README.
3. Com superpowers: `brainstorming` (fecha as decisões listadas) → spec em `docs/superpowers/specs/` →
   `writing-plans` → `subagent-driven-development` ou `executing-plans` → `requesting-code-review`.
   Com outro conjunto de skills, o brief serve como PRD de entrada do mesmo jeito.
4. Todo PR segue o `AGENTS.md`: avaliar impacto no archlens-ask e na GUI, rodar `npm run check-ask` e
   `npm run gui:test`.

Planos de tamanho **G** devem ser divididos em mais de um ciclo no brainstorm; cada brief sugere os cortes.
