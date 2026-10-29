# archlens GUI — fase 2 (busca em texto com LLM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A busca em texto da GUI: o usuário escreve uma pergunta, um LLM a traduz em view spec (ou cartão de elemento,
ou pergunta de esclarecimento) com ferramentas que o servidor executa em milissegundos, e o diagrama aparece na tela;
com avaliação de acerto e velocidade sobre o eval do archlens-ask e telemetria em uso real. Junto, o aninhamento
(`nesting`) passa a ser ligado e desligado na GUI, no diagrama todo ou por elemento.

**Architecture:** Um módulo `apps/gui/server/ask/` com quatro partes: o prompt de sistema **gerado** de
`references/views.md` e das tabelas da skill `archlens-query`, o contexto (catálogo compacto da base e a mensagem do
usuário), as ferramentas (`find_elements`, `element_card`, `relations`, `try_view` e as finais `show_view`,
`show_element` e `clarify`) e o agente, que conversa com um provedor plugável (Anthropic pelo SDK oficial ou API
compatível com OpenAI por `fetch`) até chegar numa resposta final validada, dentro de tetos de rodadas e de tempo. A
rota `POST /api/bases/:b/ask` responde em NDJSON com as etapas e o resultado. No front, a aba "Conversa e histórico"
ganha a caixa de pergunta e as respostas, e a busca do topo passa a aceitar pergunta.

**Tech Stack:** Node ≥ 18 (ESM), `node:test`; `@anthropic-ai/sdk` 0.133.0 (só em `apps/gui`); React 18 + TypeScript +
Vite; Vitest; playwright-core (e2e).

**Spec:** `docs/superpowers/specs/2026-10-28-archlens-gui-design.md` (seções *Busca em texto (agente)*, *Provedor de
LLM*, *Avaliação*, *Anti-metas*). Medição que orienta o desenho: `docs/superpowers/specs/2026-10-28-diagram-latency-tech-debt.md`.
Fase 1, já integrada (PR #24): `docs/superpowers/plans/2026-10-29-archlens-gui-fase-1.md`.

## Global Constraints

- Branch `feat/gui-fase-2` a partir de `develop-v2`; PR de volta para `develop-v2`.
- Node `>=18`; ESM em todo o servidor. **A raiz não ganha dependências**: o SDK da Anthropic entra só em
  `apps/gui/package.json`, com versão exata (`"@anthropic-ai/sdk": "0.133.0"`).
- **Anti-meta: regras de consulta só da GUI.** O que o modelo sabe sobre pergunta → spec vem do prompt gerado de
  `references/views.md` e da skill. O texto escrito à mão (`prompt-head.md`, `prompt-json.md`) só descreve o
  **protocolo** (ferramentas, formato da resposta, quando perguntar), nunca uma regra de visão.
- **Sentido único:** fora a Task 7, nada muda em `scripts/lib`, `references/`, `skills/` nem nos formatos. As outras
  mudanças fora de `apps/gui` são o comando `serve` em `scripts/archlens.mjs` (opções de LLM) e a documentação. A
  Task 7 é uma evolução do archlens completo (`nesting.except` na view spec), pedida pelo usuário em 2026-10-29, e
  segue o `AGENTS.md` como qualquer mudança de spec de visão.
- **Base da fase:** `develop-v2` já com o PR #25 (menu de contexto imediato, base remota lida numa worker thread). O
  `BaseContext` ganhou `snapshot`: o cartão do elemento sai de `query(ctx.snapshot, …)`, **nunca** de `ctx.store`
  (que, num conector remoto, faria `git fetch` a cada chamada). As ações do menu vêm de
  `GET /api/bases/:b/elements/:id/actions`.
- **A chave do LLM nunca chega ao navegador** nem aparece em mensagem de erro, log ou telemetria. Vem do ambiente ou
  de um arquivo `.env` (`apiKeyEnv`, `envFile`), nunca do `archlens-gui.json`. O mesmo vale para os cabeçalhos
  secretos (`headersEnv`).
- **O gateway ainda não foi escolhido** *(usuário, 2026-10-29)*: a configuração cobre Anthropic, OpenAI, OpenRouter e
  gateways compatíveis com uma ou outra API (URL, forma de autenticação, cabeçalhos e parâmetros de URL
  configuráveis), sem código específico de nenhum gateway.
- **A busca em texto é opt-in:** sem `llm` na configuração (ou `--llm` no `serve`), nada vai para fora da máquina e a
  caixa de pergunta mostra como ligar.
- Modelo padrão: `claude-haiku-5-5` (o "rápido da família Claude atual" do desenho), `effort: "low"`, configurável.
- Tetos padrão: **4 rodadas** de modelo e **45 s** por pergunta. Ao bater o teto, a GUI mostra o melhor resultado
  obtido, com aviso.
- Metas de medição: P50 ≤ 15 s e P90 ≤ 60 s (teto), alvo de trabalho ~5 s no P50. **O acerto vem antes da
  velocidade.**
- Telemetria sem o texto da pergunta por padrão (`telemetry.questions: false`).
- Textos da interface e mensagens de erro em português do Brasil.
- `AGENTS.md`: a busca em texto não toca o archlens-ask; o `nesting.except` (Task 7) toca (spec de visão): `npm run
  ask`, `RULES.md` atualizado à mão e `npm run check-ask` limpo. O PR descreve as duas coisas e roda `npm run
  gui:test`.

## Review Focus

1. **Pergunta nova (ou clique de navegação, ou troca de base) com outra ainda em andamento:** a anterior é cancelada
   (o servidor para de chamar o modelo), a tela termina no pedido mais recente e a conversa marca a anterior como
   "cancelada". → Task 6 (`App.test.tsx`, "segunda pergunta cancela a primeira") e Task 5 (`ask.test.mjs`,
   "conexão fechada aborta o agente").
2. **O modelo inventa um id ou manda uma spec que o `resolveView` recusa ou que fica vazia:** o erro volta ao modelo
   como resultado de ferramenta, sem diagrama em branco; esgotados os tetos, vale o melhor resultado ou uma mensagem.
   → Task 4 (`agent.test.mjs`, "spec inválida volta como erro e a correção vence").
3. **Provedor fora do ar, 401, 429 ou lento:** o stream termina com `error` em português, a navegação continua e a
   chave não aparece em lugar nenhum. → Task 3 (`providers.test.mjs`, "erro HTTP sem a chave") e Task 4 ("teto de
   tempo").
4. **O modelo responde só com texto, sem chamar ferramenta** (comum com `tool_choice: auto`): conta como rodada,
   recebe um lembrete do protocolo e, no teto, cai no melhor resultado. → Task 4 ("texto sem ferramenta recebe
   lembrete").
5. **Base grande, com o catálogo acima do limite:** vai o catálogo resumido, e `find_elements` ainda acha um
   componente que não está nele. → Task 2 (`context.test.mjs`, "catálogo resumido acima do limite").

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/gui/scripts/gen-prompt.mjs` (novo) | gera `system-prompt.md`; `--check` avisa quando ficou para trás |
| `apps/gui/server/ask/prompt-head.md` (novo, à mão) | protocolo do agente no modo com ferramentas |
| `apps/gui/server/ask/prompt-json.md` (novo, à mão) | protocolo no modo sem ferramentas (resposta em JSON) |
| `apps/gui/server/ask/system-prompt.md` (gerado, no git) | cabeça + `references/views.md` + tabelas da skill |
| `apps/gui/server/ask/context.mjs` (novo) | catálogo compacto, resumo de relações, mensagem do usuário |
| `apps/gui/server/ask/tools.mjs` (novo) | definições das ferramentas, execução e validação das respostas finais |
| `apps/gui/server/ask/providers.mjs` (novo) | `createProvider`: Anthropic (SDK) e compatível com OpenAI (`fetch`) |
| `apps/gui/server/ask/scripted.mjs` (novo) | provedor roteirizado para testes, e2e e ensaio do eval sem chave |
| `apps/gui/server/ask/agent.mjs` (novo) | `runAsk`: laço, tetos, melhor resultado, modo JSON |
| `apps/gui/server/ask/telemetry.mjs` (novo) | registro por pergunta (memória e JSONL opcional) e `summarize` |
| `apps/gui/server/envfile.mjs` (novo) | leitura do `.env` (sem dependência) e aviso quando ele não está no `.gitignore` |
| `apps/gui/server/config.mjs`, `app.mjs` (mod.) | bloco `llm`/`envFile`/`telemetry`; rotas `ask`, `info`, `telemetry` |
| `.gitignore` (raiz, mod.) | `.env` |
| `scripts/archlens.mjs` (mod.) | `serve --llm anthropic|openai [--model M] [--endpoint URL]` |
| `apps/gui/web/src/api.ts`, `question.ts`, `Conversation.tsx`, `App.tsx`, `Shell.tsx`, `history.ts` | cliente do stream, roteamento da busca, conversa |
| `apps/gui/eval/compare.mjs`, `run.mjs`, `results/` (novos) | acerto contra o gabarito, P50/P90, relatório |
| `apps/gui/e2e/ask.test.mjs` (novo) | pergunta ponta a ponta com o provedor roteirizado |
| `scripts/lib/query-archimate.mjs`, `scripts/gen-schemas.mjs`, `schemas/view.schema.json`, `references/views.md`, `skills/archlens-query/SKILL.md` (mod.) | `nesting.except` (Task 7) |
| `portable/archlens-ask/RULES.md`, `REFERENCE.md`, `eval/gabarito/` (mod./gerados) | acompanham o `nesting.except` |
| `apps/gui/server/nesting.mjs` (novo), `views.mjs` (mod.) | estado do aninhamento de uma visão (`nest` no `ViewResult`) |
| `apps/gui/web/src/nesting.ts` (novo), `Shell.tsx`, `ContextMenu.tsx`, `App.tsx` (mod.) | alternar o aninhamento no diagrama e por elemento |

---

### Task 1: Prompt de sistema gerado

**Files:**
- Create: `apps/gui/scripts/gen-prompt.mjs`, `apps/gui/server/ask/prompt-head.md`, `apps/gui/server/ask/prompt-json.md`,
  `apps/gui/server/ask/system-prompt.md` (gerado)
- Modify: `apps/gui/package.json` (scripts `prompt` e `prompt:check`)
- Test: `apps/gui/server/prompt.test.mjs`

**Interfaces:**
- Produces:
  - `skillSections(skillMd: string) → string`: o trecho de `skills/archlens-query/SKILL.md` que vai de `## Pedido → view spec`
    até antes de `## Erros comuns` (traz a tabela de pedidos, a de estilo de layout e a de alertas).
  - `buildPrompt() → string`: `prompt-head.md` + `\n\n# Referência: view specs (references/views.md)\n\n` + o
    `views.md` inteiro + `\n\n# Referência: pedido → spec e alertas (skill archlens-query)\n\n` + `skillSections(...)`.
    Começa com o comentário `<!-- gerado por apps/gui/scripts/gen-prompt.mjs; não edite -->`.
  - `checkPrompt() → string[]`: problemas (vazio: em dia).

- [ ] **Step 1: Write the failing tests** em `apps/gui/server/prompt.test.mjs`:
  - `test('prompt carries views.md and the skill tables')`: `buildPrompt()` contém o texto inteiro de
    `references/views.md`, contém `| O usuário pede | View spec |`, `| Alerta | Ação |` e `layout.style`, e **não**
    contém `## Erros comuns`.
  - `test('committed prompt is current')`: `checkPrompt()` devolve `[]`. Mensagem do assert:
    `'rode "npm --prefix apps/gui run prompt"'`.
  - `test('head describes only the protocol')`: `prompt-head.md` cita `show_view`, `show_element`, `clarify`,
    `try_view`, `find_elements`, `relations`, `element_card`, e não contém nenhum `viewpoint:` nem `level:` (regras
    de visão ficam na referência).
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Write `prompt-head.md`** (português, ≤ 3500 caracteres). Conteúdo obrigatório, nesta ordem:
  1. Papel: traduzir a pergunta sobre a base de arquitetura em **uma** resposta final, sem inventar elementos.
  2. Respostas finais (chame exatamente uma): `show_view` (spec ou `view` salva; `answer: true` quando a pergunta
     pede análise ou lista, como "o que é afetado se…", "o que sustenta…", "liste…"), `show_element` (a pergunta é
     sobre um elemento: "me fale de X"), `clarify` (o nome casa com vários elementos e o contexto não decide; liste os
     candidatos e não escolha sozinho).
  3. Ferramentas de consulta e quando usar: `find_elements` quando o nome não está no catálogo ou ele veio resumido;
     `element_card` para ler um elemento; `relations` para montar os `steps` de uma visão dinâmica ou conferir
     ligações; `try_view` quando não tiver certeza do tamanho ou do resultado.
  4. Ids só do catálogo ou de `find_elements`. Prefira uma visão salva que responda à pergunta. Visão com mais de 40
     nós: aplique o recorte da tabela de alertas da referência antes de mostrar (ou `confirmLarge: true` se o
     usuário pediu tudo explicitamente).
  5. Meta de uma rodada: se o catálogo e a referência bastam, chame a resposta final direto.
  6. Contexto: a visão atual e a seleção vêm na mensagem; "isso", "aqui" e "dele" se referem a elas. `title` em
     português.
- [ ] **Step 4: Write `prompt-json.md`**: no modo sem ferramentas, a resposta é **só** um objeto JSON, sem texto em
  volta, com uma das chaves `show_view`, `show_element` ou `clarify` e os mesmos campos das ferramentas; o catálogo
  e as relações estão na mensagem; um erro devolvido pede a resposta corrigida.
- [ ] **Step 5: Implement** `gen-prompt.mjs` no molde de `scripts/gen-ask.mjs` (`buildPrompt`, `checkPrompt`, CLI que
  grava ou, com `--check`, imprime os problemas e sai com 1). Scripts: `"prompt": "node scripts/gen-prompt.mjs"`,
  `"prompt:check": "node scripts/gen-prompt.mjs --check"`. Rode `npm --prefix apps/gui run prompt`.
- [ ] **Step 6: Run** `npm --prefix apps/gui run test:server`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(gui): prompt de sistema gerado de references/views.md e da skill de consulta`.

### Task 2: Contexto e ferramentas do agente

**Files:**
- Create: `apps/gui/server/ask/context.mjs`, `apps/gui/server/ask/tools.mjs`
- Test: `apps/gui/server/context.test.mjs`, `apps/gui/server/tools.test.mjs`

**Interfaces:**
- Consumes: `findElements(ctx, text, limit)`, `labelsOf(ctx, e)` (`catalog.mjs`); `resolveView` (`scripts/lib/query.mjs`);
  `layoutView` (`scripts/lib/layout.mjs`); `viewAlerts` (`scripts/lib/view-build.mjs`); `query` (`scripts/lib/api.mjs`);
  `explainEdge(edge, nodesById, notation)` (`scripts/lib/explain.mjs`); `suggestViews` (`scripts/lib/suggest.mjs`).
  `ctx` é o `BaseContext` da fase 1 (`{ id, name, store, model, version, kind, systemOf }`).
- Produces (`context.mjs`):
  - `CATALOG_LIMIT = 40_000` (caracteres).
  - `compactCatalog(ctx, { limit = CATALOG_LIMIT }) → { text: string, summarized: boolean }`. Uma linha por
    elemento: `id | nome | tipo | c4 | pai | apelidos` (campo vazio como `-`; `|` e quebras de linha dentro dos
    valores viram espaço), depois `## Visões salvas` com `key | título`. Acima do limite: só pessoas, sistemas,
    containers, `grouping` e as visões, com a primeira linha `catálogo resumido: use find_elements para o resto`.
    Memoizado por `ctx.version`.
  - `relationsDigest(ctx, { limit = CATALOG_LIMIT }) → string`: `origem -tipo-> destino` por relação, cortado no
    limite com `… N relações omitidas` (modo JSON).
  - `userMessage(req: AskRequest, ctx) → string`: a pergunta; depois, se houver, `Visão atual:` + JSON da spec,
    `Nós visíveis:` (até 60 ids), `Selecionado:`, `Escolha do usuário: <id> (<nome>)` e `Conversa recente:` (até 4
    itens `pergunta → título`).
  - `AskRequest = { question: string, context?: { spec?: object, nodes?: string[], selected?: string | null },
    history?: { question: string, title?: string }[], chosen?: string }`.
  - `loadPrompt({ mode: 'tools' | 'json' }) → string`: lê `system-prompt.md` (Task 1); no modo `json`, acrescenta
    `prompt-json.md` no fim. Lido uma vez por processo.
- Produces (`tools.mjs`):
  - `QUERY_TOOLS`, `FINAL_TOOLS`: `ToolDef[]`, `ToolDef = { name, description, input_schema }` (JSON Schema, sem
    `strict`: `spec` é objeto livre). `ALL_TOOLS = [...QUERY_TOOLS, ...FINAL_TOOLS]`, sempre nesta ordem (o cache de
    prompt depende disso).
    - `find_elements { text: string }`, `element_card { id: string }`, `relations { ids: string[], via?: string[] }`,
      `try_view { spec: object }`;
    - `show_view { spec?: object, view?: string, title?: string, answer?: boolean, confirmLarge?: boolean }`,
      `show_element { id: string }`, `clarify { question: string, options: string[] }`.
  - `runTool(ctx, name, input) → Promise<{ ok: boolean, content: string, best?: { spec: object, nodes: number } }>`
    para as quatro de consulta:
    - `find_elements`: até 10 linhas `id | nome | tipo | c4`; nada → `ok: true`, `nenhum elemento para "<texto>"`;
    - `element_card`: o markdown de `query(ctx.snapshot, { element: id })`; id desconhecido → `ok: false` com a mensagem
      do núcleo (que já traz "quis dizer");
    - `relations`: relações que tocam algum dos `ids` (filtradas por `via`, se vier), uma linha
      `origem (nome) -tipo-> destino (nome): frase`, no máximo 80 e `… N mais`;
    - `try_view`: `resolveView` + `layoutView`, devolve `nós: N`, contagem por camada (ArchiMate) ou por tipo C4,
      até 40 nomes e `alertas:` (de `viewAlerts`); erro do núcleo ou visão vazia → `ok: false`. Com sucesso, `best`.
      Spec sem `key` recebe `key: 'ask'`.
  - `finalize(ctx, name, input) → { ok: true, result: AskResult } | { ok: false, content: string }`:
    - `show_view`: `view` resolve para a spec salva ou sugerida; senão `spec` (com `key: 'ask'` se faltar); erro do
      `resolveView` ou vazia → `ok: false`; **mais de 40 nós sem `confirmLarge`** → `ok: false` com a contagem e os
      alertas, pedindo o recorte;
    - `show_element`: id existe → `{ kind: 'element', id }`; senão `ok: false` com sugestões;
    - `clarify`: ids desconhecidos saem da lista; nenhum válido → `ok: false`.
  - `AskResult = { kind: 'view', spec, title?, answer?: boolean } | { kind: 'element', id } |
    { kind: 'clarify', question, options: { id, name, typeLabel, c4Label }[] } | { kind: 'none' }`, mais
    `warning?: string` em qualquer um.

- [ ] **Step 1: Write the failing tests** (`context.test.mjs`, sobre `examples/loja-online/architecture` aberto com
  `createBaseRegistry`):
  - `test('compact catalog lists every element and the saved views')`: `summarized === false`; tem a linha de
    `loja.pedidos` com `API de Pedidos` e `container`; tem `## Visões salvas` e `suporte-checkout`.
  - `test('catálogo resumido acima do limite')`: com `limit: 2000`, `summarized === true`, nenhuma linha de
    componente (`loja.pedidos.` seguido de mais texto no id), e `runTool(ctx, 'find_elements', { text: <nome de um
    componente> })` ainda o devolve.
  - `test('user message carries view, selection, choice and history')`: com contexto e `chosen: 'loja.pedidos'`, o
    texto contém `Visão atual:`, `Selecionado:`, `Escolha do usuário: loja.pedidos (API de Pedidos)` e no máximo 4
    itens de conversa quando vêm 6.
- [ ] **Step 2: Write the failing tests** (`tools.test.mjs`):
  - `test('try_view summarises without JSON')`: para a spec de `suporte-processo` do eval, `ok`, `content` contém
    `nós:` e `Aplicação`, não contém `{"`; `best.nodes` igual a `resolveView(...).nodes.length`.
  - `test('try_view reports core errors')`: `anchor: 'nao-existe'` → `ok: false` e a mensagem do núcleo.
  - `test('show_view accepts a saved view key')`: `{ view: 'suporte-checkout' }` → `kind: 'view'` com a spec salva.
  - `test('show_view asks for a cut above 40 nodes')`: `{ spec: { notation: 'archimate', viewpoint: 'application' } }`
    → `ok: false`, `content` cita o número de nós; com `confirmLarge: true` → `ok: true`.
  - `test('clarify drops unknown ids')`: `options: ['loja.pedidos', 'x']` → uma opção, com `name` e `typeLabel`.
  - `test('relations caps the list')`: `ids` com o sistema `loja` e todos os filhos devolve no máximo 80 linhas de
    relação.
- [ ] **Step 3: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 4: Implement** `context.mjs` e `tools.mjs`. Descrições das ferramentas curtas e em português.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(gui): catálogo compacto e ferramentas do agente de busca`.

### Task 3: Provedores de LLM

**Files:**
- Create: `apps/gui/server/ask/providers.mjs`, `apps/gui/server/ask/scripted.mjs`
- Modify: `apps/gui/package.json` (dependência `@anthropic-ai/sdk` 0.133.0, `npm install` atualiza o lock)
- Test: `apps/gui/server/providers.test.mjs`

**Interfaces:**
- Produces:
  - `LlmConfig = { provider: 'anthropic' | 'openai', model?: string, effort?: 'low'|'medium'|'high', endpoint?: string,
    auth?: 'x-api-key' | 'bearer' | 'none' | { header: string }, apiKeyEnv?: string, headers?: Record<string,string>,
    headersEnv?: Record<string,string>, query?: Record<string,string>, tools?: boolean, maxRounds?: number,
    timeoutMs?: number }`. Padrões: `model` `claude-haiku-5-5` (anthropic) ou obrigatório (openai); `effort` `low`;
    `auth` `x-api-key` (anthropic) ou `bearer` (openai); `apiKeyEnv` `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`;
    `tools` `true`; `maxRounds` 4; `timeoutMs` 45000.
    - `endpoint`: no `anthropic`, a raiz do serviço sem `/v1` (padrão `https://api.anthropic.com`); no `openai`, a
      base terminada em `/v1` (padrão `https://api.openai.com/v1`; OpenRouter: `https://openrouter.ai/api/v1`).
    - `auth`: onde vai a chave. `x-api-key` e `bearer` são os cabeçalhos usuais; `{ header: 'api-key' }` põe a chave
      crua num cabeçalho com outro nome (Azure); `none` não manda chave e não a exige (gateway interno).
    - `headers`: cabeçalhos fixos, sem segredo. `headersEnv`: cabeçalho → nome da variável com o valor (segredos).
    - `query`: parâmetros acrescentados à URL de cada chamada (ex.: `api-version`).
  - `createProvider(cfg: LlmConfig, { env, fetch = globalThis.fetch } = {}) → Provider`. `env` é o ambiente já
    combinado com o `.env` (Task 5). Chave ausente com `auth ≠ 'none'`, ou variável de `headersEnv` ausente → erro
    `E_GUI_CONFIG` `defina <VAR> (ambiente ou .env) para a busca em texto`.
  - No `anthropic` com o SDK: `auth: 'x-api-key'` → `apiKey`; `bearer` → `authToken` (e `apiKey: null`); `{ header }`
    e `none` → sem `apiKey`/`authToken`, com o cabeçalho em `defaultHeaders`; `query` → `defaultQuery`.
  - `Provider = { name: string, model: string, tools: boolean, open({ system: string[], tools: ToolDef[] | null })
    → Conversation }`.
  - `Conversation = { send(input: { text: string } | { results: { id: string, content: string, isError?: boolean }[] },
    { signal }) → Promise<Reply> }`. A conversa guarda as mensagens no formato nativo do provedor.
  - `Reply = { text: string, calls: { id: string, name: string, input: object }[], ms: number,
    usage: { input: number, output: number, cacheRead: number } }`.
  - Erros: `E_LLM_HTTP` (status e até 300 caracteres do corpo, **sem** cabeçalhos nem chave), `E_LLM_REFUSAL`,
    `E_LLM_ABORT` (sinal abortado).
  - `scripted(turns: (Reply | ((input) => Reply) | Error)[], { tools = true } = {}) → Provider`: devolve as respostas
    em ordem, guarda em `provider.seen` cada `{ system, tools, input }` recebido; turno a mais lança
    `Error('scripted: sem resposta')`.

- [ ] **Step 1: Write the failing tests** (servidor HTTP falso em porta livre, um por família):
  - `test('anthropic: system blocks cached, tools in order, auto tool choice')`: o corpo recebido em
    `/v1/messages` tem `model: 'claude-haiku-5-5'`, `system` com dois blocos de texto, cada um com
    `cache_control: { type: 'ephemeral' }`, `tools` na ordem dada, `tool_choice: { type: 'auto' }` e
    `output_config.effort: 'low'`; a resposta com um `tool_use` vira `calls[0]` com `input` já objeto.
  - `test('anthropic: assistant content replayed verbatim')`: a resposta 1 traz um bloco `thinking` e um
    `tool_use`; no segundo `send({ results })` o corpo tem a mensagem do assistente **igual** ao `content` recebido
    (com o `thinking`) e um `tool_result` com o mesmo `tool_use_id`.
  - `test('anthropic: refusal is an error')`: `stop_reason: 'refusal'` → `E_LLM_REFUSAL`.
  - `test('openai-compatible: tool calls round trip')`: `POST <endpoint>/chat/completions` com `Authorization:
    Bearer`, os cabeçalhos extras, `tools` no formato `function` e `tool_choice: 'auto'`; `arguments` (texto JSON) vira
    `input`; o segundo envio tem `role: 'tool'` com `tool_call_id`.
  - `test('erro HTTP sem a chave')`: 401 com corpo `{"error":"bad key sk-test-123 tok-9"}`, chave `sk-test-123` e
    `headersEnv` com valor `tok-9` → a mensagem do erro tem o status e não contém `sk-test-123` nem `tok-9`.
  - `test('auth forms')`, nas duas famílias: `bearer` → `Authorization: Bearer <chave>` e sem `x-api-key`;
    `{ header: 'api-key' }` → `api-key: <chave>` e sem `Authorization`; `none` com `env: {}` → nenhum dos três
    cabeçalhos e sem erro de configuração.
  - `test('headersEnv and query')`: `headersEnv: { 'X-Tenant': 'TENANT' }` com `TENANT=t1` → cabeçalho `X-Tenant: t1`;
    `query: { 'api-version': '2026-06-01' }` → a URL recebida termina com `?api-version=2026-06-01`.
  - `test('abort stops the request')`: sinal abortado antes da resposta → `E_LLM_ABORT`.
  - `test('missing key is a config error')`: `env: {}` → `E_GUI_CONFIG` citando `ANTHROPIC_API_KEY`.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Anthropic com o SDK: `new Anthropic({ apiKey, baseURL: cfg.endpoint, defaultHeaders: cfg.headers, maxRetries: 1,
    timeout: cfg.timeoutMs })`, `client.messages.create({ model, max_tokens: 8000, system, tools, tool_choice:
    { type: 'auto' }, output_config: { effort }, messages }, { signal })`. Sem `thinking` explícito e sem
    `tool_choice` forçado (`any`/`tool` dão 400 nos modelos atuais). Anexe `response.content` inteiro à conversa.
    Erros do SDK: use as classes tipadas (`Anthropic.APIError` e subclasses, `APIUserAbortError`), não texto.
  - OpenAI compatível com `fetch`: `endpoint` padrão `https://api.openai.com/v1`; sem `tools` no modo JSON.
  - Uma mensagem de erro é montada só de status e corpo truncado, e passa por `redact(text, secrets)`, que troca a
    chave e cada valor de `headersEnv` por `***`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): provedores de LLM (Anthropic pelo SDK e compatível com OpenAI)`.

### Task 4: Agente de busca

**Files:**
- Create: `apps/gui/server/ask/agent.mjs`
- Test: `apps/gui/server/agent.test.mjs`

**Interfaces:**
- Consumes: Task 2 (`compactCatalog`, `relationsDigest`, `userMessage`, `loadPrompt`, `ALL_TOOLS`, `runTool`,
  `finalize`), Task 3 (`Provider`, `scripted`).
- Produces:
  - `runAsk(ctx, req: AskRequest, { provider, maxRounds = 4, timeoutMs = 45000, signal, emit = () => {} })
    → Promise<{ result: AskResult, metrics: AskMetrics }>`.
  - Eventos de `emit`: `{ type: 'stage', stage: 'interpretando' | 'consultando a base' | 'montando a visão' }`,
    `{ type: 'tool', name, ok, ms }`.
  - `AskMetrics = { total: number, llm: number, tools: number, rounds: number, calls: number,
    mode: 'tools' | 'json', usage: { input, output, cacheRead } }` (ms).
- Comportamento:
  - Modo com ferramentas (`provider.tools`): `system = [loadPrompt({ mode: 'tools' }), compactCatalog(ctx).text]`,
    `tools = ALL_TOOLS`. Cada `send` é uma rodada. Numa resposta, as ferramentas de consulta rodam e voltam juntas
    num único `send({ results })`. Uma ferramenta final chama `finalize`: `ok` encerra; senão o erro volta como
    resultado com `isError`. Resposta só com texto: volta `Responda chamando show_view, show_element ou clarify.`.
  - Modo JSON (`!provider.tools`): `system = [loadPrompt({ mode: 'json' }), catálogo + '\n\n## Relações\n' +
    relationsDigest(ctx)]`. O primeiro objeto JSON do texto vai para `finalize` com o nome da chave; erro de parse ou
    de `finalize` → **uma** nova tentativa com o erro no texto.
  - Melhor resultado: o último `best` de `try_view` ou a última spec de `show_view` recusada só pelo tamanho.
  - Teto de rodadas ou de tempo (`AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])`; Node 18 sem
    `AbortSignal.any`: combine à mão): com melhor resultado → `{ kind: 'view', spec, warning: 'teto de N rodadas'
    ou 'teto de N s' + ': melhor resultado obtido' }`; sem → `{ kind: 'none', warning }`. Abort do chamador →
    lança `E_LLM_ABORT`.

- [ ] **Step 1: Write the failing tests** (`scripted` sobre loja-online):
  - `test('one round: show_view straight away')`: um turno com `show_view` válido → `kind: 'view'`,
    `metrics.rounds === 1`; `provider.seen[0].system[1]` é o catálogo; eventos `stage` incluem `interpretando`.
  - `test('query tools run and return together')`: turno 1 com `find_elements` e `element_card` (dois `calls`), turno
    2 com `show_element` → os dois resultados chegam no mesmo `send`, `metrics.calls === 3`, `rounds === 2`.
  - `test('spec inválida volta como erro e a correção vence')`: turno 1 `show_view` com `anchor: 'inventado'`, turno 2
    válido → o segundo `send` tem `isError: true`; o resultado final é a spec do turno 2.
  - `test('texto sem ferramenta recebe lembrete')`: turno 1 só texto, turno 2 `clarify` → o segundo envio contém
    `show_view, show_element ou clarify`; `kind: 'clarify'`.
  - `test('round ceiling returns the best view with a warning')`: 4 turnos de `try_view` válidos → `kind: 'view'`
    com a spec do último `try_view` e `warning` contendo `teto de 4 rodadas`; nenhum quinto `send`.
  - `test('teto de tempo')`: provedor cujo `send` espera o sinal; `timeoutMs: 50` → resolve em menos de 1 s com
    `kind: 'none'` e `warning` contendo `teto`.
  - `test('caller abort rejects')`: sinal abortado no meio → rejeita com `E_LLM_ABORT`.
  - `test('json mode: one retry on bad JSON')`: `scripted([...], { tools: false })`, turno 1 `texto solto`, turno 2
    `{"show_element":{"id":"loja.pedidos"}}` → `kind: 'element'`, `metrics.mode === 'json'`; `seen[0].tools` é `null`
    e `seen[0].system[1]` contém `## Relações`.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 3: Implement** `agent.mjs`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): agente de busca com tetos, melhor resultado e modo sem ferramentas`.

### Task 5: Rota de pergunta, configuração, telemetria e `serve --llm`

**Files:**
- Create: `apps/gui/server/ask/telemetry.mjs`, `apps/gui/server/envfile.mjs`
- Modify: `apps/gui/server/config.mjs`, `apps/gui/server/app.mjs`, `scripts/archlens.mjs` (caso `serve` e uso, ~75 e
  ~437), `.gitignore` (raiz: `.env`)
- Test: `apps/gui/server/ask.test.mjs`, `apps/gui/server/telemetry.test.mjs`, `apps/gui/server/config.test.mjs`,
  `apps/gui/server/envfile.test.mjs`, `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `runAsk` (Task 4), `createProvider` (Task 3), `renderSpec` (`views.mjs`), `viewAnswer` e `formatViewAnswer`
  (`scripts/lib/query-md.mjs`).
- Produces:
  - `loadConfig({ file, base, port, host, llm, envFile })`: aceita `llm` (objeto `LlmConfig`), `envFile` e
    `telemetry` (`{ file?: string, questions?: boolean }`) no arquivo; o `llm` e o `envFile` dos argumentos vencem os
    do arquivo. Valida `provider ∈ {anthropic, openai}`, `openai` exige `model`, `auth` numa das formas da Task 3,
    `headers`/`headersEnv`/`query` como objetos de texto, `maxRounds` inteiro de 1 a 10, `timeoutMs` de 1000 a 300000
    (`E_GUI_CONFIG`). `telemetry.file` e `envFile` relativos ao arquivo de configuração. Devolve também
    `env: Record<string,string>`, o ambiente que `createProvider` recebe.
  - `envfile.mjs`:
    - `parseEnv(text: string) → Record<string,string>`: uma variável por linha, `CHAVE=valor`; aceita o prefixo
      `export `, linhas vazias e comentários com `#` (no começo da linha, ou depois de um espaço num valor sem aspas),
      valores entre aspas simples (literais) ou duplas (com `\n`, `\"` e `\\`). Linha inválida → `E_GUI_CONFIG` com o
      número da linha e **sem** o conteúdo dela. Sem dependência (`dotenv`) e sem `process.loadEnvFile`, que não
      existe no Node 18.
    - `loadEnv({ envFile, dir }) → { env: Record<string,string>, file: string | null }`: com `envFile`, lê esse
      arquivo (ausente → `E_GUI_CONFIG`); sem ele, lê `<dir>/.env` se existir, onde `dir` é a pasta do
      `archlens-gui.json` ou, no `serve <base>`, a pasta corrente. **O ambiente do processo vence o arquivo**
      (convenção do dotenv). Não altera `process.env`: o resultado só alimenta `createProvider`.
    - `envFileWarning(file) → string | null`: se o arquivo está num repositório git e não é ignorado
      (`git check-ignore -q`, que falha sem git → `null`), devolve
      `<arquivo> não está no .gitignore; a chave pode ir para o repositório`. O `serve` imprime o aviso e sobe mesmo
      assim.
  - `startServer({ config, staticDir, registry, provider })`: `provider` substitui o criado de `config.llm` (testes,
    e2e).
  - `GET /api/info` → `{ ask: { enabled: boolean, provider?: string, model?: string, mode?: 'tools' | 'json' } }`.
  - `POST /api/bases/:b/ask`, corpo `AskRequest`. Antes do stream: busca desligada → 503 `E_GUI_ASK_OFF`
    (`busca em texto desligada: suba com --llm anthropic`); `question` vazia ou acima de 2000 caracteres → 400.
    Depois: `200`, `content-type: application/x-ndjson; charset=utf-8`, uma linha JSON por evento:
    - os eventos de `emit` do agente;
    - `{ type: 'result', result: AskResult, view?: ViewResult, answer?: object, markdown?: string }`: com
      `kind: 'view'`, `view` vem de `renderSpec` (com `title` do resultado, se houver); com `answer: true`, `answer` é
      `viewAnswer(ctx.model, spec)` e `markdown` é `formatViewAnswer(answer)`;
    - `{ type: 'error', error: string, code?: string }`;
    - por último, `{ type: 'done', metrics: AskMetrics & { render: number } }`.
    Conexão fechada pelo cliente → aborta o `runAsk` (`req.on('close')` com `res.writableEnded` falso).
  - `createTelemetry({ file, questions = false, keep = 500 }) → { record(entry), recent(): Entry[] }`;
    `Entry = { at: string, base: string, provider: string, model: string, mode, outcome: AskResult['kind'] | 'error',
    ms: { total, llm, tools, render }, rounds, calls, cacheRead, question?: string }`. `file` → uma linha JSON por
    entrada (append).
  - `summarize(entries) → { n, p50, p90, oneRound, byOutcome: Record<string, number> }` (p50/p90 de `ms.total`;
    `oneRound`: fração com `rounds === 1`).
  - `GET /api/telemetry` → `summarize(recent())`.
  - CLI: `archlens serve <base> --llm anthropic|openai [--model M] [--endpoint URL] [--env-file PATH]` vira `llm` e
    `envFile` do `loadConfig`. Chave ausente (nem no ambiente nem no `.env`) → o comando sai com a mensagem
    `E_GUI_CONFIG` antes de subir. Com a busca ligada, a linha de subida diz de onde veio a chave:
    `busca em texto: <provider> <model> (chave de ANTHROPIC_API_KEY, <ambiente | caminho do .env>)`, nunca o valor.

- [ ] **Step 1: Write the failing tests** (`ask.test.mjs`, servidor real numa porta livre, `provider: scripted(...)`,
  lendo o stream linha a linha):
  - `test('ask streams stages, result with view, then done')`: `show_view` válido → as linhas trazem `stage`,
    `result` com `view.html` contendo `data-node`, e a última é `done` com `metrics.rounds === 1`.
  - `test('answer: true brings the markdown')`: `show_view` com `answer: true` → `markdown` começa com `# ` e
    `answer.sections` não é vazio.
  - `test('ask disabled is 503')`: sem `llm` e sem `provider` → 503, `code: 'E_GUI_ASK_OFF'`; `GET /api/info` →
    `ask.enabled === false`.
  - `test('empty or huge question is 400')`.
  - `test('provider error ends the stream with error')`: turno que lança `E_LLM_HTTP` → linha `error` com a mensagem e
    depois `done`.
  - `test('conexão fechada aborta o agente')`: provedor que espera o sinal; o cliente aborta o `fetch` → o sinal do
    provedor fica abortado em até 500 ms.
  - `test('telemetry records without the question by default')`: depois de uma pergunta, `GET /api/telemetry` tem
    `n === 1`; o `recent()[0]` não tem `question`.
- [ ] **Step 2: Write the failing tests** de configuração (`config.test.mjs`): `llm` inválido (`provider: 'x'`,
  `maxRounds: 0`, `openai` sem `model`, `auth: 'basic'`, `headersEnv: { X: 1 }`) dá `E_GUI_CONFIG`; `llm` dos
  argumentos vence o do arquivo; `envFile` relativo resolve pela pasta do arquivo de configuração.
  `envfile.test.mjs`:
  - `parseEnv` com `export A=1`, `B="x\ny"`, `C='$lit'`, `D=v # nota`, comentário e linha vazia →
    `{ A: '1', B: 'x\ny', C: '$lit', D: 'v' }`;
  - linha `sem-igual` → `E_GUI_CONFIG` citando a linha, e a mensagem não contém `sem-igual`;
  - `loadEnv`: `.env` na pasta é lido sem `envFile`; `envFile` inexistente → `E_GUI_CONFIG`; variável presente no
    ambiente e no arquivo → vale a do ambiente; `process.env` não muda;
  - `envFileWarning`: num repositório git temporário, `.env` sem `.gitignore` → aviso; com `.env` no `.gitignore` →
    `null`; fora de repositório → `null`.
  `telemetry.test.mjs`: `summarize` sobre 10 entradas conhecidas dá os p50/p90 esperados (vizinho mais próximo:
  índice `ceil(p·n) − 1` na lista ordenada) e `oneRound` correto; `file` recebe uma linha por `record`.
- [ ] **Step 3: Write the failing tests** em `tests/cli.test.mjs`:
  - `serve <base> --llm anthropic` com `ANTHROPIC_API_KEY` vazio e sem `.env` sai com código ≠ 0 e a mensagem cita
    `ANTHROPIC_API_KEY` e `.env`;
  - `serve <base> --llm anthropic --env-file <tmp>/chave.env` (com `ANTHROPIC_API_KEY=sk-x`) sobe; a saída cita o
    caminho do arquivo e não contém `sk-x`.
- [ ] **Step 4: Run** `npm --prefix apps/gui run test:server && node --test tests/cli.test.mjs`. Expected: FAIL.
- [ ] **Step 5: Implement.** `send` de `app.mjs` continua para JSON; o stream escreve com `res.write(JSON.stringify(ev)
  + '\n')`. Uso do `serve` no texto de ajuda: `serve <base> [--port N] [--host H] [--open] [--llm anthropic|openai
  [--model M] [--endpoint URL]]`.
- [ ] **Step 6: Run** `npm --prefix apps/gui run test:server && npm test`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(gui): rota de pergunta em stream, telemetria e serve --llm`.

### Task 6: Front — conversa e busca em texto

**Files:**
- Create: `apps/gui/web/src/question.ts`, `apps/gui/web/src/Conversation.tsx`, `apps/gui/e2e/ask.test.mjs`
- Modify: `apps/gui/web/src/api.ts`, `history.ts` (kind `'Pergunta'`), `App.tsx`, `Shell.tsx` (placeholder),
  `styles.css`
- Test: `apps/gui/web/src/question.test.ts`, `apps/gui/web/src/Conversation.test.tsx`, `apps/gui/web/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`/api/info`, `/api/bases/:b/ask` e seus eventos).
- Produces:
  - `api.ts`: `getInfo() → Promise<Info>`; `ask(base, body: AskRequest, onEvent: (e: AskEvent) => void,
    signal: AbortSignal) → Promise<void>` (lê o corpo com `getReader()` e divide por `\n`; HTTP ≠ 200 lança
    `ApiError`); tipos `AskRequest`, `AskEvent`, `AskResult`, `ViewAnswer` espelhando a Task 5.
  - `question.ts`: `looksLikeQuestion(q: string) → boolean`: termina com `?`, ou tem 4 palavras ou mais, ou começa
    (sem diferenciar maiúsculas e acentos) por `o que`, `quem`, `qual`, `quais`, `como`, `onde`, `por que`,
    `mostre`, `me fale`, `liste`.
  - `Turn = { id: number, question: string, stage?: string, status: 'running' | 'done' | 'error' | 'canceled',
    result?: AskResult, answer?: ViewAnswer, markdown?: string, warning?: string, error?: string, ms?: number,
    view?: ViewResult }`.
  - `Conversation({ turns, enabled, model, onAsk(q: string), onChoose(turn: Turn, id: string), onOpen(turn: Turn) })`.
- Comportamento:
  - Caixa no pé da aba "Conversa e histórico": `textarea` com rótulo "Pergunta"; Enter envia, Shift+Enter quebra
    linha. Desligada (`enabled` falso) com o texto `Busca em texto desligada. Suba com archlens serve <base> --llm
    anthropic.` Ligada, mostra `via <model>` discreto.
  - Cada pergunta cria um `Turn` e reserva ticket como as outras navegações. `result` com `view`: dispara `loaded`
    com `Step { kind: 'Pergunta', label: question, view }`, sem novo `getView`; se o ticket já não é o atual, o turno
    fica com o botão **Abrir visão** (`onOpen`). `element`: `pickElement(id)` e abre a lateral direita. `clarify`: a
    pergunta e um botão por opção (`nome · tipo`); o clique reenvia a mesma pergunta com `chosen`. `none`: o aviso.
  - `answer` mostra as seções em tabelas (Nome, Tipo, Status, Tecnologia), as relações como lista de frases e a
    matriz, se houver; botão **Copiar markdown** copia `markdown`. Nada de HTML vindo do servidor: tudo como texto
    React.
  - `warning` aparece no turno e na linha de status. `error` no turno e na linha de status.
  - Pergunta nova, navegação por menu/explorador/trilha ou troca de base abortam o `AbortController` da pergunta em
    andamento; o turno fica `canceled` ("cancelada").
  - Busca do topo: placeholder `Buscar elemento ou perguntar… (Ctrl+K)`. Com a busca em texto ligada e
    `looksLikeQuestion(q)`, a busca vira pergunta (e abre a aba de conversa); senão é a busca por nome de hoje, e
    nenhum resultado por nome com a busca ligada também vira pergunta.
  - `history` (contexto da pergunta) = os últimos 4 turnos `done` com `{ question, title: view?.title }`.

- [ ] **Step 1: Write the failing tests:**
  - `question.test.ts`: `'API de Pedidos'` → false; `'o que sustenta o checkout'` → true; `'Quem consome?'` → true;
    `'Me fale de pedidos.'` → true; `'checkout'` → false.
  - `Conversation.test.tsx`: Enter chama `onAsk` com o texto e limpa; Shift+Enter não envia; desligada mostra o texto
    de `--llm`; turno `clarify` mostra os botões e o clique chama `onChoose`; turno com `answer` mostra a tabela e
    o botão de copiar chama `navigator.clipboard.writeText(markdown)`.
  - `App.test.tsx` (com `fetch` falso devolvendo NDJSON):
    - `'pergunta abre a visão do resultado'`: o passo novo do histórico tem kind `Pergunta` e o iframe recebe o
      `html` do evento, sem chamada a `/view`;
    - `'segunda pergunta cancela a primeira'`: a primeira fica pendurada; ao enviar a segunda, o `signal` da primeira
      fica abortado, o turno 1 mostra "cancelada" e a tela termina na visão da segunda;
    - `'busca do topo com pergunta vai para o agente'`: digitar `o que sustenta o checkout` + Enter chama `/ask` e não
      `/find`;
    - `'clarify reenvia com a escolha'`: o segundo corpo de `/ask` tem `chosen: 'loja.pedidos'`;
    - `'erro do agente aparece no status e a navegação segue'`: evento `error` → linha de status com a mensagem; um
      clique no Explorador ainda abre a visão.
  - `e2e/ask.test.mjs` (Chromium, `startServer` com `provider: scripted([...])` sobre loja-online): escrever a pergunta
    na caixa e Enter → aparece um passo `Pergunta` na trilha e o iframe tem `data-node="bp-checkout"`; uma segunda
    pergunta roteirizada com `clarify` mostra os botões, e o clique abre o cartão na lateral direita.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm --prefix apps/gui run test:web && npm --prefix apps/gui run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): conversa, busca em texto e respostas em tabela`.

### Task 7: Aninhamento por elemento no núcleo (`nesting.except`)

Pedido do usuário (2026-10-29): ligar e desligar o aninhamento no diagrama todo ou por objeto, agrupando e
desagrupando à vontade. O diagrama todo já existe (`nesting: "edges" | "nested"`); falta o "por objeto". Vale só para
ArchiMate (em C4 os boundaries seguem o `level`).

**Files:**
- Modify: `scripts/lib/query-archimate.mjs` (`nestingSpec`, `nestElements`, `resolveArchimate`),
  `scripts/gen-schemas.mjs` (e `npm run schemas` para `schemas/view.schema.json`), `references/views.md` (linha do
  `nesting` e um exemplo), `skills/archlens-query/SKILL.md` (linha 47–48: "desagrupe X" / "só X aninhado"),
  `portable/archlens-ask/RULES.md` (linha do `nesting`), gerados por `npm run ask`
- Test: `tests/query.test.mjs` (perto da linha 521)

**Interfaces:**
- Produces:
  - Spec: `nesting: { "mode": "edges" | "nested", "depth"?: int ≥ 1, "except"?: string[] }`. `except` lista os
    elementos que **fazem o contrário** do `mode`: em `nested`, não guardam os filhos (eles saem e ficam ao lado do pai,
    na caixa onde o pai está, ligados pelo losango); em `edges`, são os únicos que guardam os filhos dentro. Id que
    não existe na base → `E_UNKNOWN_REF` (com sugestão, como em `focus`); id da base fora da visão é ignorado. Valor que
    não é lista de strings → `E_VIEW_NESTING`.
  - `nestingSpec(v) → { mode, depth, except? }`: `except` só aparece quando não vazio (as visões de hoje mantêm
    `{ mode: 'edges', depth: null }`).
  - `visualParents(kept: Set<string>, edges, model) → Map<child, parent>`: o trecho de `nestElements` que escolhe o
    pai visual (pai pela hierarquia, senão a primeira composição/agregação sem ciclo), extraído sem mudar o
    comportamento e exportado (a GUI usa na Task 8).
  - `nestElements(kept, edges, model, { depth, mode, except })`: `holds(p) = mode === 'nested' ? !except.has(p) :
    except.has(p)`; `boxOf(id)`: sem pai visual → `null`; com pai `p`, `p` se `holds(p)` e (`depth == null` ou
    `level(id) ≤ depth`), senão `boxOf(p)`. O `resolveArchimate` chama `nestElements` quando `mode === 'nested'` ou
    `except` não está vazio.

- [ ] **Step 1: Write the failing tests** em `tests/query.test.mjs`, com o `appView` que já existe:
  - `test('nesting except in nested mode takes one box apart')`: `appView({ nesting: { mode: 'nested', except: ['odin.api'] } })`
    → `node(v,'odin.api').nestedIn === 'odin'`; `node(v,'odin.api.rest').nestedIn === 'odin'` (ao lado do pai); a
    composição `odin.api → odin.api.rest` continua aresta; `bus.adapter` continua em `bus`.
  - `test('nesting except in edges mode nests only those')`: `appView({ nesting: { mode: 'edges', except: ['bus'] } })`
    → `node(v,'bus.adapter').nestedIn === 'bus'`; nenhum outro nó tem `nestedIn`; a agregação `bus → bus.adapter`
    some das arestas.
  - `test('nesting except with an unknown id or a bad value')`: `except: ['nao-existe']` → `E_UNKNOWN_REF`;
    `except: 'bus'` → `E_VIEW_NESTING`; um id da base fora da visão → sem erro e sem efeito.
  - `test('nestingSpec keeps the old shape without except')`: `nestingSpec('nested')` →
    `{ mode: 'nested', depth: null }`; `nestingSpec({ mode: 'edges', except: [] })` → `{ mode: 'edges', depth: null }`.
  - `test('visualParents matches what nested mode draws')`: para `appView({ nesting: 'nested' })`, todo nó com
    `nestedIn` tem `visualParents(...).get(id) === nestedIn` (sem `depth`).
- [ ] **Step 2: Run** `node --test tests/query.test.mjs`. Expected: FAIL nos testes novos.
- [ ] **Step 3: Implement** em `query-archimate.mjs`; schema (`except: { type: 'array', items: { type: 'string' } }`)
  em `gen-schemas.mjs` e `npm run schemas`; a linha do `nesting` em `references/views.md` ganha o `except` com o
  sentido acima e um exemplo (`{ "mode": "nested", "except": ["loja.api"] }`: "tudo aninhado, menos dentro de
  loja.api"); `SKILL.md` ganha o pedido "desagrupe X" → `except`; `RULES.md` do archlens-ask acompanha.
- [ ] **Step 4: Run** `npm test && npm run ask && npm run check-ask && npm --prefix apps/gui run prompt &&
  npm run gui:test`. Expected: PASS; `check-ask` sem avisos (o `REFERENCE.md` regenerado entra no commit; o gabarito
  não deve mudar, porque nenhuma pergunta usa `except`; se mudar, investigue antes de seguir); o `system-prompt.md` da
  GUI regenerado entra no commit.
- [ ] **Step 5: Commit** `feat(query): nesting.except aninha ou desaninha elementos um a um`.

### Task 8: Alternar o aninhamento na GUI

**Files:**
- Create: `apps/gui/server/nesting.mjs`, `apps/gui/server/nesting.test.mjs`, `apps/gui/web/src/nesting.ts`,
  `apps/gui/web/src/nesting.test.ts`
- Modify: `apps/gui/server/views.mjs` (`renderSpec` põe `nest`), `apps/gui/web/src/api.ts` (`ViewResult.nest`),
  `apps/gui/web/src/Shell.tsx` (botão na barra do diagrama), `apps/gui/web/src/ContextMenu.tsx` e `App.tsx` (itens do
  menu e a troca de visão), testes `App.test.tsx`, `ContextMenu.test.tsx`, `apps/gui/e2e/` (um caso)

**Interfaces:**
- Consumes: `nestingSpec`, `visualParents` (Task 7), `resolveView`; o fluxo de troca de visão da fase 1 (o mesmo dos
  cliques de navegação, que cria um passo na trilha e permite voltar).
- Produces:
  - `nestState(ctx, spec) → NestState | null`, em `server/nesting.mjs`: `null` para C4 ou quando a visão não tem pai
    visual; senão `{ mode: 'edges' | 'nested', except: string[], holders: string[], open: string[] }`. `holders`: ids
    dos nós que são pai visual de outro nó da visão (calculado resolvendo a spec com `nesting: 'edges'` e chamando
    `visualParents` com os nós e arestas dela); `open`: os `holders` que estão guardando filhos na visão de fato
    (algum nó com `nestedIn` igual a ele). `renderSpec` põe `nest` no resultado (entra no cache junto).
  - `ViewResult.nest?: NestState | null` em `api.ts`.
  - Em `web/src/nesting.ts`, puras:
    - `toggleAll(spec, nest) → ViewSpec`: com algum `open`, desliga tudo (`nesting` removido = `edges`); sem nenhum,
      liga tudo (`nesting: 'nested'`, ou `{ mode: 'nested', depth }` mantendo o `depth` que havia). `except` é zerado.
    - `toggleOne(spec, nest, id) → ViewSpec`: inverte `id` no `except` (entra se não está, sai se está) e normaliza:
      `{ mode: 'edges' }` sem `except` vira `nesting` ausente; `{ mode: 'nested' }` sem `except` nem `depth` vira
      `'nested'`. O `title` da spec, se houver, fica.
  - Rótulos (pt-BR): botão da barra `Agrupar tudo` (nenhum `open`) / `Desagrupar tudo` (algum `open`), visível só com
    `nest` não nulo; no menu de contexto de um nó que está em `holders`, `Desagrupar` se ele está em `open`, senão
    `Agrupar aqui dentro`. Cada clique é uma visão nova na trilha, com o mesmo título da anterior.

- [ ] **Step 1: Write the failing tests.**
  - `nesting.test.mjs` (`node:test`, base `examples/loja-online/architecture` aberta como na fase 1):
    `test('nestState is null for C4')`; `test('holders and open follow the spec')`: uma spec ArchiMate `application`
    com `include: ['loja']` → `holders` contém `loja`; com `nesting: 'nested'` → `open` contém `loja`; com
    `{ mode: 'nested', except: ['loja'] }` → `loja` fora de `open` e ainda em `holders`.
  - `nesting.test.ts` (Vitest): `toggleAll` liga e desliga mantendo `depth`; `toggleOne` em `nested` põe e tira do
    `except`; em `edges`, o primeiro `toggleOne` dá `{ mode: 'edges', except: [id] }` e o segundo devolve a spec sem
    `nesting`; o `title` não se perde.
  - `ContextMenu.test.tsx`: com `nest.holders = ['loja']` e `open = []`, o menu de `loja` mostra `Agrupar aqui dentro`;
    com `open = ['loja']`, `Desagrupar`; um nó fora de `holders` não mostra nenhum dos dois.
  - `App.test.tsx`: `test('agrupar tudo troca a visão e o voltar desfaz')`: com `nest` sem `open`, o botão
    `Agrupar tudo` pede a visão com `nesting: 'nested'`, a trilha ganha um passo e o voltar pede a spec anterior; numa
    visão C4 (`nest: null`) o botão não aparece.
  - e2e: na visão ArchiMate da loja, `Agrupar tudo` → o iframe tem uma caixa de aninhamento para `loja` (o nó de um
    filho dentro do retângulo do pai); clique direito em `loja` → `Desagrupar` → o filho volta a ficar fora.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server && npm --prefix apps/gui run test:web`. Expected: FAIL.
- [ ] **Step 3: Implement** os módulos e a interface.
- [ ] **Step 4: Run** `npm run gui:build && npm run gui:test && npm --prefix apps/gui run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): agrupar e desagrupar o aninhamento no diagrama e por elemento`.

### Task 9: Avaliação, documentação e verificação final

**Files:**
- Create: `apps/gui/eval/compare.mjs`, `apps/gui/eval/run.mjs`, `apps/gui/eval/results/` (relatórios),
  `apps/gui/eval/compare.test.mjs`
- Modify: `apps/gui/package.json` (scripts `eval`; `test:server` passa a incluir `eval/*.test.mjs`), `README.md` (seção
  GUI), `AGENTS.md` (item da GUI), `CHANGELOG.md` (`[Não lançado]`)

**Interfaces:**
- Consumes: `portable/archlens-ask/eval/perguntas.json` e `eval/gabarito/*.json`; `EVAL_BASE` de `scripts/gen-ask.mjs`;
  `runAsk`, `createProvider`, `scripted`, `renderSpec`, `summarize`.
- Produces:
  - `score(q, result: AskResult, ctx, gabarito) → { ok: boolean, reason: string }`:
    - pergunta com `spec` ou `view` (fora `grande`): `result.kind === 'view'`; o conjunto de ids de
      `resolveView(ctx.model, result.spec).nodes` é igual ao dos `rows` do gabarito; o conjunto de pares
      `from|to` das arestas é igual; nas arestas do gabarito com `derived: false`, o tipo também bate;
    - `element`: `kind === 'element'` e `id === q.element`;
    - `ambiguo`: `kind === 'clarify'` e as opções incluem `loja.pedidos` e `loja.db-pedidos`;
    - `grande`: `kind === 'view'` com no máximo 40 nós, ou `kind === 'clarify'`;
    - `duas-bases`: fora do eval automático (roteiro manual), `ok: null`.
    `reason` diz o que sobrou e o que faltou (até 5 ids de cada).
  - `node apps/gui/eval/run.mjs [--provider anthropic|openai] [--model M] [--mode tools|json] [--repeat N]
    [--only id,id] [--dry]`: abre as bases (`EVAL_BASE` e, para perguntas com `base`, essa pasta), roda cada pergunta
    `N` vezes (padrão 1), mede `runAsk` + `renderSpec` e grava `apps/gui/eval/results/<AAAA-MM-DD>-<modelo>-<modo>.md`
    e `.json`. O `.md` tem a tabela por pergunta (acerto, total, LLM, rodadas, motivo) e o resumo: acerto (fração das
    `ok !== null`), esclarecimentos, P50/P90 do total, fração em uma rodada. `--dry` usa um `scripted` que devolve a
    spec do gabarito (confere o encanamento sem chave). Script `"eval": "node eval/run.mjs"`.
  - `runEval({ provider?, mode?, repeat = 1, only?, dry = false }) → Promise<{ rows: { id, ok, reason, ms, rounds }[],
    summary }>`, exportada por `run.mjs` (a CLI só a chama e grava os relatórios).

- [ ] **Step 1: Write the failing tests** (`compare.test.mjs`):
  - `test('same selection with a different spec passes')`: para `suporte-processo`, uma spec equivalente com `key`
    diferente e `title` próprio → `ok: true`.
  - `test('missing node fails with the reason')`: a spec com `granularity: 'component'` → `ok: false`, `reason` cita
    ids a mais.
  - `test('derived edge may differ in type')`: um gabarito com aresta `derived: true` de tipo diferente do resolvido
    → `ok: true`; a mesma diferença em aresta não derivada → `ok: false`.
  - `test('ambiguous question needs clarify')` e `test('element question needs the element')`.
  - `test('dry run scores every automatic question')`: `run.mjs --dry` (importado como função `runEval({ dry: true })`)
    dá `ok: true` em todas as perguntas com gabarito.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 3: Implement** `compare.mjs` e `run.mjs`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Rode o eval de verdade**, se `ANTHROPIC_API_KEY` estiver definido:
  `npm --prefix apps/gui run eval -- --repeat 3` e `npm --prefix apps/gui run eval -- --repeat 3 --mode json`.
  Grave os relatórios em `apps/gui/eval/results/`. **Sem chave, não invente números:** registre no PR que a medição
  ficou pendente e qual comando roda. Se o acerto ficar abaixo de 100% nas perguntas automáticas, leia os `reason`,
  corrija só o protocolo (`prompt-head.md`, descrições das ferramentas) ou o contexto, nunca as regras de visão, e
  rode de novo. Registre P50/P90 contra as metas (≤ 15 s / ≤ 60 s; alvo ~5 s).
- [ ] **Step 6: Documente.**
  - README, seção GUI: `archlens serve <base> --llm anthropic`, `--model`, `--env-file`; a chave pelo ambiente ou
    por `.env` (o ambiente vence; o `.env` fica fora do git); o bloco `llm` e `telemetry` do `archlens-gui.json`, com
    a tabela de exemplos (Anthropic, OpenAI, OpenRouter, gateway compatível com OpenAI, gateway compatível com
    Anthropic, Azure com `auth: { header: 'api-key' }` e `query`), as regras de `endpoint` (com ou sem `/v1`) e
    `headersEnv` para segredos; o que sai da máquina (catálogo da base e a pergunta, só para o provedor configurado);
    `tools: false` quando o gateway não faz chamada de ferramentas; os tetos e `npm --prefix apps/gui run eval`.
  - `AGENTS.md`, item da GUI: mudanças em `references/views.md` ou na skill `archlens-query` pedem
    `npm --prefix apps/gui run prompt` (o `gui:test` falha com o prompt desatualizado).
  - CHANGELOG: busca em texto (agente com ferramentas e modo sem ferramentas), `serve --llm`, avaliação e telemetria;
    `nesting.except` e o agrupar/desagrupar da GUI.
  - README, seção GUI: os botões `Agrupar tudo`/`Desagrupar tudo` e os itens do menu de contexto.
- [ ] **Step 7: Run** `npm test && npm run gui:build && npm run gui:test && npm --prefix apps/gui run test:e2e &&
  npm run check-ask`. Expected: tudo PASS, `check-ask` sem avisos.
- [ ] **Step 8: Commit** `feat(gui): avaliação da busca em texto e documentação`.

---

## Depois desta fase

- **Fase 3 (plano próprio):** executor MCP para o conector gbrain (direto e por gateway, mapa de nomes de ferramenta,
  checagem na subida), credencial de serviço e imagem Docker. Antes dela, **conferir com o gateway real** se ele
  expõe as ferramentas como endpoint que a aplicação chama (risco em aberto do desenho).
- Se a medição mostrar o `layoutView` do `try_view` repetido no render final como custo relevante, reaproveitar o
  layout entre os dois (mudança no `buildView`, sob a regra de sentido único).
- Miniaturas no histórico e "manter esta visão" (exportar delta para a `archlens-plan`) seguem desejáveis, fora do MVP.
