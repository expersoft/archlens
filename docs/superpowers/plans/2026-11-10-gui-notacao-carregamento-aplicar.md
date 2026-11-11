# Agrupar na barra, notação estável, carregamento e etapas do Aplicar — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a GUI nunca troca de notação sem pedido, mostra e respeita as esperas por uma visão nova, põe o Agrupar na barra do diagrama e mostra as etapas do Aplicar (GUI, CLI e skill).

**Architecture:** as ações do menu passam a receber a spec da visão atual (`actionsFor(ctx, id, current)`). O histórico do Navegar ganha rótulo e cancelamento da espera, e a espera entra no `editLock` que já trava os editores. O núcleo ganha callbacks opcionais de progresso (`onStep` no apply, `onCheck` no build). O servidor roda a gravação num worker e repassa as etapas em NDJSON para uma `ApplyDialog` que vira checklist.

**Tech Stack:** Node ESM (`node:test`, `node:worker_threads`), React + TS (Vitest, Testing Library), Playwright (checagens do build).

**Spec:** `docs/superpowers/specs/2026-11-10-gui-notacao-carregamento-aplicar-design.md`

## Global Constraints

- Uma ação do diagrama abre na notação da visão atual. A notação só muda pelo ArchiMate | C4 da barra ou por ação com a notação no rótulo.
- Clique duplo em ArchiMate num sistema/container com filhos: `{ notation: 'archimate', viewpoint: 'layered', anchor: id, traverse: { mode: 'both', maxDepth: 2 }, granularity: 'container' | 'component', nesting: { mode: 'nested', depth: 1 } }` (sistema → `container`, container → `component`).
- Numa visão ArchiMate, toda ação que abre C4 leva "(C4)" no rótulo e não é primária.
- Aviso visual de espera só depois de **300 ms**; bloqueio desde o primeiro instante.
- Dica de pausa, texto exato: `Disponível quando a visão terminar de carregar`.
- Linha de status, texto exato: `Carregando “<rótulo>”…`, com botão `Cancelar`.
- Etapas do Aplicar, textos exatos: `Conferindo o plano com a base atual`, `Gravando a base`, `Gerando o ARCHITECTURE.md`, `Regerando as visões salvas`. Título: `Aplicando N mudanças na base`. Fim: `A seguir: o chat propõe as notas de interpretação`.
- A saída da CLI não usa animação nem caracteres de controle.
- Textos de interface e nomes de testes em português, no estilo dos testes vizinhos.
- Antes de concluir: `npm test`, `npm run gui:test`, `npm run check-ask`. Se mudar a skill `archlens-apply`, rode `npm --prefix apps/gui run prompt`.

## Review Focus

1. **Resposta atrasada depois de Cancelar.** A visão cancelada que chega depois não pode entrar nem destravar nada. Teste na Task 4.
2. **Editor aberto quando a espera começa.** O texto digitado continua lá depois que a visão chega (foi o caso do usuário). Teste na Task 5.
3. **Falha depois de gravar.** Se o documento ou as visões falham, a base já foi gravada. A janela diz isso e não oferece "tentar de novo" como se nada tivesse sido gravado. Testes nas Tasks 8 e 9.
4. **Recusa 409 em fluxo.** A recusa chega como erro HTTP antes do fluxo, com `extra` (o rascunho novo). A GUI segue o caminho de hoje. Testes nas Tasks 8 e 9.
5. **Nó sem C4 numa visão C4.** "Focar" num ator ou objeto de dados que está na visão C4 atual mantém C4 (foco na mesma visão). Teste na Task 2.

---

### Task 1: Agrupar/Desagrupar na barra do diagrama

**Files:**
- Modify: `apps/gui/web/src/Diagram.tsx` (props e barra `role="toolbar"`)
- Modify: `apps/gui/web/src/Shell.tsx:22-24,135` (remover `nestLabel`/`onNestAll`)
- Modify: `apps/gui/web/src/App.tsx:539-540,619` (passar ao `Diagram`)
- Test: `apps/gui/web/src/Diagram.test.tsx`, `apps/gui/web/src/Shell.test.tsx`, `apps/gui/web/src/App.test.tsx` (ou o teste do App que hoje cobre "Agrupar tudo")

**Interfaces:**
- Produces: `DiagramProps.nest?: { label: string; onToggle: () => void; disabled?: boolean }`. A Task 4 usa `disabled`.

- [ ] **Step 1: Testes que falham**
  - `Diagram.test.tsx`, `'mostra Agrupar tudo na barra do diagrama e chama onToggle'`: render com `nest={{ label: 'Agrupar tudo', onToggle }}`. Espera `within(getByRole('toolbar', { name: 'Ferramentas do diagrama' })).getByRole('button', { name: 'Agrupar tudo' })`; o clique chama `onToggle` uma vez.
  - `Diagram.test.tsx`, `'sem nest, sem botão de agrupar'`: `queryByRole('button', { name: /grupar tudo/ })` é null.
  - `Shell.test.tsx`: remova os testes de `nestLabel`. Acrescente `'a barra de cima não tem Agrupar tudo'`.
  - Ajuste o teste do App que clica "Agrupar tudo" para procurar o botão dentro da barra do diagrama.
- [ ] **Step 2: Rode e veja falhar.** `npm --prefix apps/gui run test:web -- Diagram Shell App`. Esperado: FAIL nos testes novos. Se o script tiver outro nome, use o de `apps/gui/package.json`.
- [ ] **Step 3: Implemente.** O botão vai depois dos `BUTTONS` e antes do `AlertBadge`, com `className="nest"`. No App, passe `nest={nest && !planning ? { label: allLabel(nest), onToggle: onNestAll } : undefined}`. Tire as props do `Shell`.
- [ ] **Step 4: Rode e veja passar.** O mesmo comando. Rode também `npm --prefix apps/gui run typecheck`.
- [ ] **Step 5: Commit.** `feat(gui): Agrupar/Desagrupar na barra do diagrama`

### Task 2: Ações que respeitam a notação atual (`navigation.mjs`)

**Files:**
- Modify: `apps/gui/server/navigation.mjs` (`actionsFor`)
- Test: `apps/gui/server/navigation.test.mjs`

**Interfaces:**
- Produces: `actionsFor(ctx, id, current?: { spec: object, nodes?: string[] }) → Action[]`.
  - `current.spec.notation === 'c4'` ou `current` ausente: comportamento de hoje, exceto a regra do "Focar" em C4.
  - `current.nodes`: ids dos nós da visão atual, para saber se o nó está nela.
  - O retorno mantém a forma `{ label, spec?, primary?, matrix?, sub? }`.

- [ ] **Step 1: Testes que falham** (base `loja` do exemplo; `const AM = { spec: { notation: 'archimate', viewpoint: 'layered', anchor: 'loja' } }`, `const C4 = { spec: { notation: 'c4', level: 'container', scope: 'loja' }, nodes: ['cliente', 'loja.pedidos', 'loja.bff'] }`):
  - `'sem visão atual: igual a hoje'`: os testes existentes continuam passando sem mudança.
  - `'ArchiMate: clique duplo no sistema abre camadas aninhadas'`: `actionsFor(loja, 'loja', AM)`. A primária tem `label: 'Abrir em camadas (aninhado)'` e `spec` igual a `{ notation: 'archimate', viewpoint: 'layered', anchor: 'loja', traverse: { mode: 'both', maxDepth: 2 }, granularity: 'container', nesting: { mode: 'nested', depth: 1 } }`.
  - `'ArchiMate: clique duplo no container usa granularidade component'`: `actionsFor(loja, 'loja.pedidos', AM)`. A primária tem `spec.granularity === 'component'`.
  - `'ArchiMate: ações C4 levam (C4) e não são primárias'`: em `actionsFor(loja, 'loja', AM)` existem `'Abrir containers (C4)'` com `primary` falso e `'Contexto (C4)'`. Toda ação com `spec.notation === 'c4'` tem `/\(C4\)/` no rótulo.
  - `'ArchiMate: Focar fica em ArchiMate mesmo num container'`: em `actionsFor(loja, 'loja.pedidos', AM)`, "Focar (só vizinhos)" tem `spec` igual a `{ notation: 'archimate', viewpoint: 'layered', anchor: 'loja.pedidos', traverse: { mode: 'both', maxDepth: 1 }, granularity: 'component' }`.
  - `'C4: Focar num container segue em C4'`: `actionsFor(loja, 'loja.pedidos', C4)` dá o `spec` C4 de hoje.
  - `'C4: Focar num sistema abre o contexto dele'`: `actionsFor(loja, 'erp', C4)`. Focar tem `{ notation: 'c4', level: 'context', scope: 'erp' }`.
  - `'C4: Focar num ator presente na visão foca nela'`: `actionsFor(loja, 'cliente', C4)`. Focar tem `{ ...C4.spec, focus: ['cliente'], depth: 1 }`.
  - `'C4: Focar num nó fora da visão e sem C4 cai em ArchiMate'`: escolha um `data-object` ou `business-process` do exemplo, fora de `C4.nodes`. Focar tem `spec.notation === 'archimate'`.
  - `'ArchiMate: clique duplo num grupo mostra os membros aninhados'`: use um `grouping` do exemplo `telemedicina` (ou da loja, se houver). A primária tem `spec.notation === 'archimate'` e `nesting.mode === 'nested'`. Antes, confira com `bin/archlens query --spec` qual forma mostra os membros dentro do grupo (a spec sugere `viewpoint: 'application', include: [id]`) e fixe no teste a forma que funciona.
- [ ] **Step 2: Rode e veja falhar.** `node --test apps/gui/server/navigation.test.mjs`.
- [ ] **Step 3: Implemente `actionsFor(ctx, id, current)`.**
  - `am = current?.spec?.notation === 'archimate'`.
  - Em `am`: prefixe a ação primária ArchiMate (sistema/container com filhos, grupo), ponha " (C4)" nas ações C4 sem sufixo (`Abrir containers`, `Abrir componentes`, `Abrir grupo`) e tire o `primary` delas.
  - Focar segue as tabelas da spec.
- [ ] **Step 4: Rode e veja passar.**
- [ ] **Step 5: Commit.** `feat(gui): ações do menu respeitam a notação da visão atual`

### Task 3: Rotas e cliente enviam a visão atual

**Files:**
- Modify: `apps/gui/server/app.mjs:252-257` (rota de ações)
- Modify: `apps/gui/server/plan/routes.mjs:305-310`
- Modify: `apps/gui/server/plan/preview.mjs:89-92` (`previewActions`)
- Modify: `apps/gui/web/src/api.ts:90,265`
- Modify: `apps/gui/web/src/App.tsx` (as 3 chamadas de `getActions`), `apps/gui/web/src/plan/PlanPreview.tsx:159,165`
- Test: `apps/gui/server/app.test.mjs`, `apps/gui/server/plan-routes.test.mjs`, os testes do App e da PlanPreview que mockam `getActions`/`planActions`

**Interfaces:**
- Consumes: `actionsFor(ctx, id, current)` (Task 2).
- Produces:
  - `POST /api/bases/:b/elements/:id/actions` com corpo `{ spec?: ViewSpec }`. O servidor tira os `nodes` da visão resolvendo a spec (`resolveView` sobre `ctx.model`; se falhar, sem `nodes`). O `GET` atual fica igual.
  - `POST /plan/actions` aceita `spec` opcional no corpo.
  - `previewActions(ctx, draft, id, spec?)`.
  - Cliente: `getActions(base: string, id: string, spec?: ViewSpec)` e `planActions(base: string, draft: Draft, id: string, spec?: ViewSpec)`.
  - O cartão (`GET /elements/:id`) não muda: a web não usa as `actions` dele.

- [ ] **Step 1: Testes que falham**
  - `app.test.mjs`, `'ações com a visão atual ArchiMate: clique duplo em camadas'`: POST em `/api/bases/loja/elements/loja/actions` com `{ spec: { notation: 'archimate', viewpoint: 'layered', anchor: 'loja' } }`. A primária tem `spec.notation === 'archimate'`.
  - `app.test.mjs`, `'spec que não é objeto: 400'`: `{ spec: 'x' }` dá 400.
  - `plan-routes.test.mjs`, `'plan/actions com spec ArchiMate'`: o mesmo, pela prévia.
  - Web: `getActions` passa a ser chamado com a spec da visão atual como 3º argumento (assert no mock), no menu, no clique duplo e no `pickElement`. Em `pickElement`, a visão atual é a mostrada.
- [ ] **Step 2: Rode e veja falhar.** `node --test apps/gui/server/app.test.mjs apps/gui/server/plan-routes.test.mjs` e os testes web.
- [ ] **Step 3: Implemente.** O cliente usa `POST` quando há spec e `GET` quando não há. O `pickElement` mantém a regex de preferência de hoje, que casa com os rótulos com "(C4)".
- [ ] **Step 4: Rode e veja passar.** Rode também o typecheck.
- [ ] **Step 5: Commit.** `feat(gui): menu e clique duplo enviam a visão atual`

### Task 4: Espera por visão no Navegar: barra, status, Cancelar e pausa

**Files:**
- Modify: `apps/gui/web/src/history.ts` (rótulo e cancelamento)
- Create: `apps/gui/web/src/useDelayed.ts` (`useDelayed(on: boolean, ms = 300): boolean`)
- Modify: `apps/gui/web/src/Shell.tsx` (barra de progresso e status com Cancelar)
- Modify: `apps/gui/web/src/App.tsx` (`dispatch request` com rótulo, `editLock`, `onEvent` ignora durante a espera, `Cancelar`, botões desabilitados)
- Modify: `apps/gui/web/src/Diagram.tsx` e o CSS `.diagram .busy` (`pointer-events:auto` enquanto ocupado)
- Test: `history.test.ts`, `useDelayed.test.ts`, `Shell.test.tsx`, `App.test.tsx` (ou o arquivo de testes do App que cobre o menu)

**Interfaces:**
- Consumes: `DiagramProps.nest.disabled` (Task 1).
- Produces:
  - `HistoryAction` `{ type: 'request'; ticket: number; label?: string }`.
  - `HistoryState.pendingLabel?: string`.
  - Nova ação `{ type: 'cancel'; ticket: number }`: se `ticket === pending`, `pending: null`, sem erro.
  - `ShellProps.progress?: { label: string; onCancel?: () => void } | null`. Mostra a barra `.progress` (role `progressbar`, aria-label `Carregando`) e o status `Carregando “<label>”…` com o botão `Cancelar`.
  - `useDelayed`. A Task 6 também o usa.

- [ ] **Step 1: Testes que falham**
  - `history.test.ts`:
    - `'request guarda o rótulo da espera'`.
    - `'cancel com o ticket da espera limpa sem erro'`.
    - `'loaded de um ticket cancelado é ignorado'`: request t1, cancel t1, loaded t1 → `steps` inalterado.
  - `useDelayed.test.ts` (fake timers):
    - `'só liga depois de 300 ms'`: falso em 299 ms, verdadeiro em 300 ms.
    - `'desliga na hora'`.
  - `Shell.test.tsx`, `'progress mostra a barra, o status e Cancelar'`.
  - App:
    - `'durante a espera, Editar fica desabilitado com a dica'`: com o Planejar ligado e um nó selecionado, peça uma visão (mock de `getView` pendente). O botão `Editar propriedades` fica `disabled`, com `title` `Disponível quando a visão terminar de carregar`.
    - `'durante a espera, botão direito e clique duplo no diagrama não fazem nada'`: emita `context` e `expand` pela ponte; `getActions` não é chamado.
    - `'ArchiMate | C4 e Agrupar desabilitados durante a espera'`.
    - `'aviso visual só depois de 300 ms'` (fake timers): `progressbar` ausente antes e presente depois.
    - `'Cancelar mantém a visão atual e a resposta tardia não entra'`: peça a visão B, clique Cancelar, resolva B. O título continua o de A, e Editar volta a ficar habilitado.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente.**
  - **Rótulos de `request`:** `run` recebe `label` e o põe no `request`. Use o rótulo que já vai no `Step`, como `${a.label}: ${nome}`; para a notação, `Ver em C4`/`Ver em ArchiMate`.
  - **`reserve`:** passa a aceitar o rótulo, ou o `dispatch` é feito em `run`. Escolha um e mantenha o ticket síncrono.
  - **`editLock`:** `loading ? LOADING_VIEW : …`, logo depois de `browseWriting`.
  - **Cancelar:** `ticket.current++`, `cancelAsk()`, `dispatch({ type: 'cancel', ticket: hist.pending })`.
  - **`onEvent`, se `stateRef.current.loading`:** ignore `context`/`expand`. Em `select`, devolva a seleção anterior com `send(frame, { type: 'select', id: prev })`.
  - **Status visível:** só com `useDelayed(loading)`. A barra fica na borda de baixo da barra de cima.
- [ ] **Step 4: Rode e veja passar.** Rode também o typecheck.
- [ ] **Step 5: Commit.** `feat(gui): espera por visão com barra, status, Cancelar e edição em pausa`

### Task 5: O texto do editor sobrevive à chegada da visão

**Files:**
- Investigate/Modify: `apps/gui/web/src/App.tsx`, `apps/gui/web/src/Details.tsx`, `apps/gui/web/src/browseEdit.ts` (`useBrowseNode`), `apps/gui/web/src/plan/DocEditor.tsx`
- Test: `apps/gui/web/src/App.browseEdit.test.tsx`

**Interfaces:**
- Consumes: `editLock` com a espera (Task 4).
- Produces: nada novo. A garantia é que trocar de visão não remonta o `DocEditor`/`PropsEditor` nem zera o texto dele.

- [ ] **Step 1: Testes que falham** (`App.browseEdit.test.tsx`)
  - `'documentação em edição: a visão nova chega e o texto continua'`:
    1. Abra Escrever/Editar documentação no Navegar e digite "rascunho".
    2. Peça outra visão por uma ação (mock de `getView` resolvido depois).
    3. Durante a espera, a área de texto está desabilitada e mantém "rascunho".
    4. Depois que a visão chega, o editor continua aberto, com "rascunho" e editável.
  - `'propriedades em edição: idem'`.
  - `'nó fora da visão nova: o painel continua no nó'`: a visão nova não tem o nó selecionado; o painel mostra o mesmo nó.
- [ ] **Step 2: Rode e veja falhar.** Registre qual asserção falha: é a evidência da causa.
- [ ] **Step 3: Corrija a causa.**
  - Candidatos vistos na análise: a chave de `useBrowseNode` (o 4º argumento muda com `browseRev`/`planReload`) fazendo o nó recarregar e trocar o slot; `viewNode` mudando a árvore de `Details` (a chave do cartão); `DocEditor` re-inicializando o estado com a prop `text` a cada render.
  - Corrija na origem. Não guarde o texto em um estado paralelo.
- [ ] **Step 4: Rode e veja passar.** Rode também a suíte web inteira.
- [ ] **Step 5: Commit.** `fix(gui): a visão nova não apaga o texto em edição`

### Task 6: Espera da prévia no Planejar

**Files:**
- Modify: `apps/gui/web/src/plan/PlanPreview.tsx` (estado de espera, `PreviewNav`)
- Modify: `apps/gui/web/src/plan/PlanView.tsx` (pausa da edição durante a espera)
- Modify: `apps/gui/web/src/App.tsx` (o `progress` do Shell no Planejar)
- Test: `apps/gui/web/src/plan/PlanPreview.test.tsx`, `apps/gui/web/src/plan/PlanView.test.tsx`

**Interfaces:**
- Consumes: `ShellProps.progress` e `useDelayed` (Task 4).
- Produces:
  - `PreviewNav` ganha `loading: { label: string; cancel: () => void } | null`.
  - `PlanPreview` chama `onNav` com ele. Espera: um pedido de prévia em andamento depois de `navigate`, da troca de notação ou de um rascunho novo.
  - `PlanView` recebe da prévia `onLoading(loading: boolean)` e soma isso ao seu `Lock`, com o texto `Disponível quando a visão terminar de carregar`.

- [ ] **Step 1: Testes que falham**
  - `PlanPreview.test.tsx`:
    - `'durante a prévia, onNav informa loading com o rótulo'`.
    - `'cancelar volta à visão anterior e ignora a resposta tardia'`.
    - `'durante a prévia, botão direito e clique duplo não fazem nada'`.
  - `PlanView.test.tsx`, `'durante a prévia, Editar do painel Nó fica em pausa com a dica'`.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente.**
  - Na primeira carga, o "Desenhando a prévia…" atual continua.
  - Nas seguintes, a prévia anterior fica visível e esmaecida (`busy` do `Diagram`) até a nova chegar.
  - Cancelar volta o `pick` e a `changeNotation` ao que eram antes do pedido.
- [ ] **Step 4: Rode e veja passar.** Rode também o typecheck.
- [ ] **Step 5: Commit.** `feat(gui): espera da prévia do Planejar com status e edição em pausa`

### Task 7: Progresso no núcleo (apply e build)

**Files:**
- Modify: `scripts/lib/apply-flow.mjs:54` (`applyAndDocument`)
- Modify: `scripts/lib/store/gbrain-git.mjs:245-256` (devolver `commit`)
- Modify: `scripts/lib/api.mjs` (`apply` repassa `commit` do conector, se vier)
- Modify: `scripts/lib/deliver.mjs:10` (`inspectHtml`), `scripts/lib/build.mjs:63,91` (`deliverHtml`, `buildDiagrams`)
- Test: `tests/apply-flow.test.mjs`, um teste de `inspectHtml`/`buildDiagrams` existente (procure `deliver`/`build` em `tests/`)

**Interfaces:**
- Produces:
  - `applyAndDocument(store, plan, { onStep }?)`. `onStep(e)` recebe `{ step: 'write' | 'doc', state: 'start' | 'done', detail?: string }`. O `done` de `write` traz `detail: 'commit <7 chars>'` quando o conector devolve `commit`, e `store.describe()` nos demais.
  - O resultado de `applyAndDocument` ganha `commit?: string`.
  - O conector gbrain git devolve `commit: pushed.sha` no resultado do apply.
  - `inspectHtml(htmlPath, { …, onCheck })`, `deliverHtml(…, { …, onCheck })`, `buildDiagrams(…, { …, onCheck })`. `onCheck({ done: number, total: number, key: string, viewport: string })` (viewport como `'1920x1080'`) é chamado após cada par visão × viewport; `total = views × viewports`.
  - Sem o callback, tudo fica igual (os testes atuais não mudam).

- [ ] **Step 1: Testes que falham**
  - `apply-flow.test.mjs`:
    - `'onStep: write e doc, início e fim, em ordem'`: base temporária, como nos testes vizinhos. Espera exatamente `[['write','start'],['write','done'],['doc','start'],['doc','done']]`.
    - `'plano sem mudanças: nenhum onStep'`.
    - `'documento falha: write done, doc start, sem doc done, docError presente'`: provoque `E_STORE_DOC_FOREIGN` como o teste vizinho já faz.
  - Teste do gbrain git (procure o arquivo de testes de `gbrain-git`), `'apply devolve o commit gravado'`: `commit` casa com `/^[0-9a-f]{40}$/`.
  - Build, `'onCheck conta visão × viewport até o total'`: com Chromium disponível (pule como os testes vizinhos quando não houver), os `done` vão de 1 a `total`, `total = views × 2`.
- [ ] **Step 2: Rode e veja falhar.** `node --test tests/apply-flow.test.mjs` e os demais.
- [ ] **Step 3: Implemente.** São só pontos de chamada. Nenhuma mudança de ordem ou de comportamento.
- [ ] **Step 4: Rode e veja passar.** Rode também `npm test`.
- [ ] **Step 5: Commit.** `feat(core): progresso opcional no apply (onStep) e no build (onCheck)`

### Task 8: Aplicar no servidor: worker e etapas em fluxo

**Files:**
- Create: `apps/gui/server/plan/apply-worker.mjs`
- Modify: `apps/gui/server/plan/routes.mjs:191-219` (`apply`)
- Modify: `apps/gui/server/plan/routes.mjs:82` (`rebuild` repassa `onCheck`)
- Test: `apps/gui/server/plan-apply.test.mjs`

**Interfaces:**
- Consumes: `applyAndDocument(store, plan, { onStep })` e `buildDiagrams(…, { onCheck })` (Task 7).
- Produces:
  - **Worker:** `apply-worker.mjs` recebe `workerData = { path, plan }`, abre a base com `openStore(resolveBase(path))` e chama `applyAndDocument`. Posta `{ step }` a cada `onStep` e termina com:
    - `{ result: { entry, preserved, doc, commit, docError?: { code, message } } }`, ou
    - `{ error: { message, code } }`.
  - **`POST /plan/apply` com `stream: true` no corpo.**
    - Antes do fluxo: o mesmo `reload`, replanejamento e conferência de hoje. Uma recusa sai como erro HTTP normal: 409 com `extra`, as `REFUSALS` do `guiWrite`, 400.
    - Depois de `writeHead(200, NDJSON_HEADERS)`, os eventos:
      - `{ type: 'step', step: 'check', state: 'done' }`;
      - `{ type: 'step', step: 'write' | 'doc', state, detail? }`;
      - `{ type: 'step', step: 'views', state: 'start' }`;
      - `{ type: 'check', done, total, key }`;
      - `{ type: 'step', step: 'views', state: 'done' }`;
      - `{ type: 'result', ...PlanApplyResult, commit? }`.
    - Falha depois do fluxo aberto: `{ type: 'error', error, code?, written: boolean }`, com `written: true` se `write` já terminou.
    - Sem `stream`: a resposta JSON de hoje.
  - **Turno:** a gravação no worker acontece dentro do `registry.inTurn(b, …)` de hoje, ainda segurando o turno. O `registry.reload(b)` vem depois, como hoje.
  - **Recusas do worker:** o fluxo abre logo depois da conferência. Uma recusa do worker (códigos de `REFUSALS`, com a mensagem de `REFUSALS[code]`) vira o evento `error` com `written: false` e o `code`. A GUI (Task 9) mostra a mensagem na etapa "Gravando a base".

- [ ] **Step 1: Testes que falham** (`plan-apply.test.mjs`; use o arranjo dos testes vizinhos, com `rebuild` injetado ou sem Chromium)
  - `'stream: etapas em ordem e result no fim'`: a ordem dos `type/step/state` é check done → write start → write done → doc start → doc done → views start → (checks) → views done → result. O `result.entry` não é nulo.
  - `'stream: plano mudado é 409 com extra, sem fluxo'`.
  - `'stream: documento falha depois de gravar: result com doc.error e write done antes'`.
  - `'stream: conflito no worker vira evento error com written false e code E_STORE_CONFLICT'`: provoque uma mudança na base entre a conferência e a gravação, como o teste vizinho de conflito.
  - `'sem stream: resposta JSON de hoje'`: os testes existentes continuam passando.
  - `'a gravação roda fora da thread principal'`: durante o apply com stream, um `GET /api/info` responde antes do `result`. Use um conector lento simulado ou meça a ordem das respostas.
- [ ] **Step 2: Rode e veja falhar.** `node --test apps/gui/server/plan-apply.test.mjs`.
- [ ] **Step 3: Implemente.** Siga o padrão de `readOffThread` em `bases.mjs:57`. Um `exit` com código diferente de zero vira `error`.
- [ ] **Step 4: Rode e veja passar.** Rode também `npm --prefix apps/gui run test:server` (ou o script equivalente).
- [ ] **Step 5: Commit.** `feat(gui): Aplicar grava num worker e informa as etapas em fluxo`

### Task 9: A janela do Aplicar vira checklist

**Files:**
- Modify: `apps/gui/web/src/api.ts` (`stream` repassa `extra`; `planApplyStream`)
- Modify: `apps/gui/web/src/plan/ApplyDialog.tsx`
- Modify: `apps/gui/web/src/plan/PlanView.tsx:326-352` (`apply`)
- Modify: CSS da `apply-dialog`, que passa a ser modal central com fundo
- Test: `apps/gui/web/src/plan/ApplyDialog.test.tsx`, `apps/gui/web/src/plan/PlanView.test.tsx`

**Interfaces:**
- Consumes: os eventos da Task 8.
- Produces:
  - `stream()`: um erro HTTP antes do fluxo vira `new ApiError(data.error, data.code, res.status, rest)`, como `call` já faz.
  - `planApplyStream(base: string, draft: Draft, confirm: string, onEvent: (e: ApplyEvent) => void, signal: AbortSignal): Promise<void>`. `ApplyEvent` é a união dos eventos da Task 8.
  - `ApplyDialogProps` ganha:
    - `phase: 'confirm' | 'running' | 'done' | 'failed'`;
    - `steps: ApplyStepView[]`, com `ApplyStepView = { id: 'check' | 'write' | 'doc' | 'views'; label: string; state: 'pending' | 'running' | 'done' | 'failed'; detail?: string }`;
    - `count: number` (mudanças), `result?: PlanApplyResult`, `failure?: { message: string; written: boolean }`, `onClose: () => void`.

- [ ] **Step 1: Testes que falham**
  - `ApplyDialog.test.tsx`:
    - `'confirm: como hoje'`: os testes atuais continuam passando com `phase="confirm"`.
    - `'running: título, quatro etapas e nada clicável'`: `Aplicando 3 mudanças na base`, as quatro etapas com os textos exatos e nenhum botão habilitado (sem Cancelar, sem Fechar). A etapa em andamento tem `aria-busy`, e a concluída mostra ✓.
    - `'views mostra k de n'`: `detail` "5 de 12" aparece junto de `Regerando as visões salvas`.
    - `'done: resumo, a seguir as notas e Fechar'`: o texto `A seguir: o chat propõe as notas de interpretação` e o botão `Fechar` chamando `onClose`.
    - `'failed depois de gravar diz que a base foi gravada'`: com `failure.written: true`, a etapa está em vermelho com a mensagem e o texto `A base foi gravada`. Não há botão de tentar de novo.
    - `'failed antes de gravar: mensagem na etapa Gravando a base'`.
    - `'aria-modal e foco preso na janela'`, seguindo o `DocWindow`.
  - `PlanView.test.tsx`:
    - `'Confirmar e aplicar abre o checklist e avança com os eventos'`: mock de `planApplyStream` emitindo os eventos.
    - `'409 antes do fluxo: segue o caminho de hoje'`: o rascunho novo é aplicado e a janela fecha com o aviso.
    - `'ao Fechar depois do fim: o chat pede as notas'`: o `turn` com `NOTES_ASK` só acontece quando o usuário clica Fechar (`notesDraftNeeded` verdadeiro), nunca antes.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente.**
  - O `apply` do `PlanView` passa a usar `planApplyStream` e monta `steps` a partir dos eventos.
  - As mensagens de chat de hoje ("Plano aplicado: …", `buildText`) continuam sendo escritas no fim.
  - A janela usa o fundo e o foco do `DocWindow`.
- [ ] **Step 4: Rode e veja passar.** Rode também o typecheck.
- [ ] **Step 5: Commit.** `feat(gui): checklist das etapas na janela do Aplicar`

### Task 10: CLI e skill `archlens-apply` mostram as etapas

**Files:**
- Modify: `scripts/archlens.mjs:315-324` (`applyCommand`), `scripts/archlens.mjs:218-235,539-551` (`deliver`, `build`)
- Modify: `skills/archlens-apply/SKILL.md` (seção Fluxo)
- Modify: `CHANGELOG.md`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `onStep` e `onCheck` (Task 7).
- Produces:
  - **`archlens apply`:** ao terminar cada etapa, imprime uma linha com o mesmo texto da GUI. Exemplo:
    - `✓ Conferindo o plano com a base atual`
    - `✓ Gravando a base (commit a1b2c3d)` ou `✓ Gravando a base (<describe>)`
    - `✓ Gerando o ARCHITECTURE.md`
  - **`archlens build`:** antes das checagens imprime `… Regerando as visões salvas`. A cada `onCheck`, imprime `  visão k de n: <key> <viewport>`, com `k`/`n` = os `done`/`total` do callback (pares visão × viewport). Nada é reescrito na mesma linha.

- [ ] **Step 1: Testes que falham** (`tests/cli.test.mjs`)
  - `'apply imprime as etapas em ordem'`: as três linhas `✓ …` aparecem nessa ordem no stdout, numa base temporária como nos testes vizinhos.
  - `'apply sem mudanças: só = nada mudou'`.
  - `'build imprime visão k de n'`: com Chromium. Pule como os vizinhos quando não houver.
  - `'saída sem caracteres de controle'`: `assert.doesNotMatch(stdout, /\r|\x1b\[/)`.
- [ ] **Step 2: Rode e veja falhar.** `node --test tests/cli.test.mjs`.
- [ ] **Step 3: Implemente na CLI.**
- [ ] **Step 4: Skill.** Em `skills/archlens-apply/SKILL.md`, no topo do Fluxo, acrescente a instrução:
  - mostrar ao usuário um checklist com os passos 1 a 6 (Confira, Aplique, Gere, Leia o relatório, Escreva a interpretação, Entregue);
  - marcar cada um ao concluir;
  - repassar as linhas `✓ …`/`visão k de n` da CLI, em vez de esperar o fim calado;
  - no modo MCP do gbrain, os passos 0 a 3 entram no checklist.
- [ ] **Step 5: Regenere e confira.**
  - `npm --prefix apps/gui run prompt`. A skill alimenta o prompt da GUI; se nada mudar, registre isso.
  - `npm run check-ask`, que deve passar. A avaliação esperada é "archlens-ask: sem impacto", porque ele não reproduz o apply. Se o `check-ask` apontar algo, siga o AGENTS.md.
- [ ] **Step 6: CHANGELOG.** Uma entrada cobrindo as quatro partes: Agrupar na barra do diagrama, notação estável, espera por visão, etapas do Aplicar na GUI/CLI/skill.
- [ ] **Step 7: Verificação final.** `npm test`, `npm run gui:test`, `npm run check-ask`. Tudo verde.
- [ ] **Step 8: Commit.** `feat(cli): apply e build mostram as etapas; skill archlens-apply com checklist`
