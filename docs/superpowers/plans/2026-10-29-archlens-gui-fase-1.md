# archlens GUI — fase 1 (navegação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma GUI web (`archlens serve <base>`) para navegar pelas visões C4 e ArchiMate de uma ou mais bases de
arquivo (json, markdown, gbrain modo git), com menu no botão direito, trilha, explorador e painel de detalhes, sem LLM.

**Architecture:** Servidor Node (sem framework, `node:http`) em `apps/gui/server/`, que importa `scripts/lib` direto,
guarda o modelo de cada base em memória e responde specs → visão. Para cada visão, o núcleo gera a página de hoje em
**modo embutido** (sem a barra, sem o cartão flutuante, com uma ponte `postMessage`). O front React a mostra num iframe e
desenha por cima a barra, o menu, a seleção e as laterais. Cada ação de navegação é uma view spec. A busca em texto
com LLM fica para a fase 2 e o MCP e o Docker para a fase 3, com planos próprios.

**Tech Stack:** Node ≥ 18 (ESM), `node:test`; React 18 + TypeScript + Vite; Vitest; playwright-core (e2e).

**Spec:** `docs/superpowers/specs/2026-10-28-archlens-gui-design.md` (inclusive *Aprendizados do protótipo*).
Protótipo de referência, descartável e fora do repositório: `gui-spike/` (`server.mjs`, `public/index.html`), na pasta
temporária da sessão que o escreveu. Consulte se existir, mas não copie: ele usa UMD e não tem testes.

## Global Constraints

- Node `>=18` (o `engines` da raiz); ESM em todo o servidor.
- **A raiz não ganha dependências.** `apps/gui/` tem `package.json` e `package-lock.json` próprios. **Sem `workspaces`
  na raiz**, para que um `npm install` na raiz não traga React nem Vite *(decisão do agente, desvio do "workspace npm" do
  desenho pelo mesmo motivo que o desenho dá)*.
- `apps/gui/dist/` fora do git. O `npm test` da raiz continua testando só o archlens.
- **Sentido único:** mudanças em `scripts/lib` só se também valem para a CLI e não mudam o resultado de nenhuma visão.
  A página de `archlens render/deliver` sai **idêntica** (byte a byte) quando `embed` é falso.
- **Sem biblioteca de diagramas** (React Flow, Cytoscape…). O diagrama é sempre o SVG do `render.mjs`.
- A GUI só lê a base. Nenhum endpoint grava.
- Textos da interface em português do Brasil, como o resto do archlens.
- Lateral esquerda: abas **"Conversa e histórico"** e **"Explorador"**. Lateral direita: **"Detalhes"**, com as partes
  **"Nesta visão"** e **"Na base"**. As duas recolhem; cada uma tem a faixa de ícones do seu lado; atalhos Ctrl+B
  (esquerda) e Ctrl+Alt+B (direita); abaixo de 1100 px de largura começam recolhidas; estado salvo no navegador.
- Só o diagrama se move. A página nunca rola (moldura fixa, como o VS Code).
- Hover igual ao de hoje (vem do `render.mjs`). Ações no **botão direito**. Clique simples seleciona e duplo clique faz a
  expansão natural.
- Tema da aplicação inteira, sincronizado com o diagrama nos dois sentidos (chave `archlens-theme` no `localStorage`,
  a mesma do `render.mjs`).
- Meta de navegação: **abaixo de 1 s por passo** nas bases de exemplo.
- `AGENTS.md`: o PR diz "archlens-ask: sem impacto" (o modo embutido não toca nada que o ask copia) e roda `npm run check-ask`.

## Review Focus

1. **Cliques rápidos com respostas fora de ordem:** abrir A e logo depois B. A tela fica em B e a trilha não ganha A
   depois de B. → Task 8 (`history.test.ts`, "resposta atrasada é descartada").
2. **A base muda no disco com o servidor no ar:** a visão seguinte reflete a mudança (versão nova, cache invalidado). →
   Task 3 e Task 4.
3. **Ação do menu que dá visão vazia ou erro do `resolveView`:** a GUI mostra a mensagem, e a trilha e o diagrama ficam
   como estavam. Nunca um diagrama em branco. → Task 4 (400 com `error`) e Task 9 (e2e).
4. **Ids com ponto, barra ou espaço** (`tele.api`, `loja/x`, `a b`) na URL, no seletor CSS e no `postMessage`. →
   Task 4 (rota com `encodeURIComponent`) e Task 7 (ponte com `CSS.escape`).
5. **Uma base inválida** (formato 1.x, pasta inexistente) numa lista de várias: as outras continuam funcionando, e a
   inválida aparece com o erro. No `serve` de base única, o comando sai com a mensagem. → Task 3 e Task 6.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/render.mjs` (mod.) | `renderHtml({ embed })`, ponte `postMessage`, `viewData` exportado |
| `scripts/lib/view-build.mjs` (novo) | `buildView(model, spec, opts)` e `viewAlerts`: o caminho spec → html + dados + alertas |
| `scripts/archlens.mjs` (mod.) | `buildHtml` usa `viewAlerts`; comando `serve` |
| `apps/gui/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` | pacote da GUI |
| `apps/gui/server/config.mjs` | configuração (`archlens-gui.json` ou base única) |
| `apps/gui/server/bases.mjs` | registro de bases: contexto por base, versão, recarga |
| `apps/gui/server/views.mjs` | `renderSpec` com cache LRU por versão + spec |
| `apps/gui/server/catalog.mjs` | catálogo, árvore, busca por nome |
| `apps/gui/server/navigation.mjs` | ações do menu, troca de notação, títulos |
| `apps/gui/server/app.mjs` | rotas HTTP e arquivos estáticos |
| `apps/gui/server/index.mjs` | `startServer` |
| `apps/gui/web/src/api.ts` | cliente da API |
| `apps/gui/web/src/history.ts` | estado da trilha e do histórico (reducer puro) |
| `apps/gui/web/src/bridge.ts` | protocolo com o iframe |
| `apps/gui/web/src/Shell.tsx` | moldura, faixas, laterais, tema, atalhos |
| `apps/gui/web/src/Diagram.tsx` | iframe, barra do diagrama, alertas |
| `apps/gui/web/src/ContextMenu.tsx` | menu do botão direito |
| `apps/gui/web/src/Details.tsx` | lateral direita |
| `apps/gui/web/src/Explorer.tsx`, `History.tsx` | abas da esquerda |
| `apps/gui/web/src/App.tsx`, `main.tsx`, `styles.css` | composição |
| `apps/gui/e2e/smoke.test.mjs` | ponta a ponta com Chromium |

---

### Task 1: Modo embutido do render, com ponte `postMessage`

**Files:**
- Modify: `scripts/lib/render.mjs` (`renderHtml` em ~366, `JS` em ~657–1110)
- Test: `tests/render.test.mjs`

**Interfaces:**
- Produces:
  - `renderHtml({ title, subtitle, views, preview, embed = false }) → string`
  - `export function viewData(v)` (hoje interna, mesmo retorno)
  - Protocolo (todas as mensagens são objetos com `source`):
    - iframe → pai, `source: 'archlens'`:
      `{type:'ready'}`, `{type:'select', id: string|null}`, `{type:'context', id, x, y}` (coordenadas do cliente no
      iframe), `{type:'expand', id}`, `{type:'theme', theme:'light'|'dark'}`,
      `{type:'state', flowing, labels, legend, matrix}` (booleanos)
    - pai → iframe, `source: 'archlens-host'`:
      `{type:'act', act}` com `act` ∈ `play|flow|labels|legend|matrix|fit|svg|png|present|glossary`,
      `{type:'theme', theme}`, `{type:'select', id: string|null}` (traça ou limpa)

- [ ] **Step 1: Write the failing tests** em `tests/render.test.mjs`:
  - `test('embed omits the page chrome and keeps the diagram')`: com `embed: true` sobre a visão container de
    `fixtures/shop.json`, o html **não** contém `class="bar"`, `class="drawer"` nem `class="legibility"`, e contém
    `data-node="loja.api"`, `class="hovercard"` e `"embed":true` no JSON de `archlens-data`.
  - `test('embed off is byte-identical to before')`: `renderHtml({ title, views })` é igual a
    `renderHtml({ title, views, embed: false })`, e um snapshot gravado antes da mudança (`tests/fixtures/render-page.html`,
    gerado no Step 2 a partir do código atual) continua igual.
  - `test('viewData is exported')`: `viewData(laid).nodes['loja.api'].name === 'API'` e
    `edges[0].help.sentence` é texto.
- [ ] **Step 2: Gere o snapshot com o código atual** (antes de mexer):
  `node -e` que renderiza a visão container do fixture e grava `tests/fixtures/render-page.html`. Commit junto com os testes.
- [ ] **Step 3: Run** `node --test tests/render.test.mjs`. Expected: FAIL nos testes de embed e `viewData`.
- [ ] **Step 4: Implement.**
  - `embed` vai para o JSON de dados (`DATA.embed`). Com `embed`, o html omite `header.bar`, `aside.drawer` e
    `.legibility`.
  - No `JS`, toda referência a botões da barra (`$('[data-act=…]')`, `#viewSelect`) passa a tolerar ausência.
  - Com `DATA.embed`:
    - `openDrawer` e `openFrame` não abrem nada e enviam `select`;
    - `clearTrace` envia `select` com `id: null`;
    - o `contextmenu` sobre `.node` faz `preventDefault` e envia `context`;
    - o `dblclick` sobre `.node` envia `expand`, em vez de trocar de visão;
    - `toggleTheme` envia `theme`;
    - depois de cada `act` vai um `state`;
    - o `message` do pai executa `actions[act]`, ajusta o tema ou chama `trace(id)`/`clearTrace()`.
  - Fora do embed, o comportamento não muda.
- [ ] **Step 5: Run** `node --test tests/render.test.mjs && npm test`. Expected: PASS, a suíte inteira.
- [ ] **Step 6: Commit** `feat(render): modo embutido com ponte postMessage para a GUI`.

### Task 2: `buildView` — spec → html, dados e alertas num lugar só

**Files:**
- Create: `scripts/lib/view-build.mjs`
- Modify: `scripts/archlens.mjs` (`buildHtml`, ~198–222)
- Test: `tests/view-build.test.mjs`

**Interfaces:**
- Consumes: `renderHtml({ embed })`, `viewData` (Task 1).
- Produces:
  - `viewAlerts(view, laid) → string[]`: os mesmos avisos que o `buildHtml` imprime hoje, no mesmo texto: > 40 nós,
    `laid.layoutNote` e `legibility(laid, 1920, 1080 - 56).suggestion`.
  - `async buildView(model, spec, { embed = true, title, subtitle } = {}) → { html, data, alerts, nodes: string[], layoutStyle: string|null, ms: { resolve, layout, render } }`.
    Lança `Error` com `code: 'E_VIEW_EMPTY'` se a visão ficar vazia. Erros do `resolveView` passam como estão.

- [ ] **Step 1: Write the failing tests:**
  - `buildView` da visão container do fixture devolve `nodes` com `'loja.api'`, `html` sem `class="bar"`, `data.nodes['loja.api']`
    e `ms.resolve >= 0`.
  - Uma spec com `scope` sem filhos visíveis rejeita com `code === 'E_VIEW_EMPTY'`.
  - `viewAlerts` sobre uma visão de 41+ nós contém `'41 nós'` (ou o número real) e a sugestão de focus/depth.
  - `tests/cli.test.mjs` continua passando, ou seja, os avisos do `render` saem no mesmo texto.
- [ ] **Step 2: Run** `node --test tests/view-build.test.mjs`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `view-build.mjs` e troque os avisos de `buildHtml` por `viewAlerts`, sem mudar o texto impresso.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lib): buildView e viewAlerts, o caminho spec → visão`.

### Task 3: Pacote da GUI, configuração e registro de bases

**Files:**
- Create: `apps/gui/package.json` (`"type": "module"`, scripts `test`, `test:server`, `test:web`, `build`, `dev`),
  `apps/gui/server/config.mjs`, `apps/gui/server/bases.mjs`
- Modify: `package.json` da raiz (scripts `gui:build`: `npm --prefix apps/gui ci && npm --prefix apps/gui run build`;
  `gui:test`: `npm --prefix apps/gui test`), `.gitignore` (`apps/gui/dist/`)
- Test: `apps/gui/server/bases.test.mjs`

**Interfaces:**
- Produces:
  - `loadConfig({ file, base, port }) → { port: number, bases: { id, name, path }[] }`.
    - Com `file`: lê o JSON `{ "port"?, "bases": [{ "id", "name"?, "path" }] }`, com `path` relativo ao arquivo.
    - Com `base`: uma base só, com `id` = nome da pasta.
    - `port` padrão `5180`.
  - `createBaseRegistry(config, { pollMs = 5000 }) → { list(): BaseInfo[], get(id): BaseContext, close() }`
    - `BaseInfo = { id, name, ok: boolean, error?: string }`
    - `BaseContext = { id, name, store, raw, model, version, kind(el), systemOf(id): string|null }`
    - `get(id)` lança `code: 'E_GUI_BASE'` para id desconhecido ou base com erro.
    - O registro confere `store.version()` a cada `pollMs`. Se ela mudou, relê a base e troca o contexto.

- [ ] **Step 1: Write the failing tests:**
  - Config com `loja-online` e `telemedicina` (os `examples/`): `list()` dá dois `ok: true`.
    `get('telemedicina').model.elements.has('tele.api')`.
  - Config com uma terceira base apontando para uma pasta 1.x (criada em temp com `{"name":"x","elements":[]}`):
    `list()` mostra essa com `ok: false` e `error` contendo `E_STORE_FORMAT` ou `formato`; as outras duas seguem `ok`.
  - Base copiada para temp. Altere o nome de um elemento no `model.json` e chame o método de recarga
    (`registry.refresh()` exposto para teste, o mesmo do timer). Depois, `get(id).version` mudou e
    `model.elements.get(x).name` é o novo.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 3: Implement**, com `openStore(resolveBase(path))`, `normalizeModel`, `c4KindOf`.
  `systemOf` sobe por `parent` até `softwareSystem`, como no protótipo.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): pacote, configuração e registro de bases`.

### Task 4: Servidor — catálogo, visão, elemento, busca por nome

**Files:**
- Create: `apps/gui/server/views.mjs`, `catalog.mjs`, `app.mjs`, `index.mjs`
- Test: `apps/gui/server/app.test.mjs`

**Interfaces:**
- Consumes: `buildView` (Task 2), `createBaseRegistry` (Task 3), `query` de `scripts/lib/api.mjs`, `similarity` de
  `scripts/lib/match.mjs`, `suggestViews`.
- Produces:
  - `renderSpec(ctx, spec) → Promise<ViewResult>`, com `ViewResult` = retorno de `buildView` + `{ spec, title, cached: boolean }`.
    Cache LRU de 200 entradas, com chave `ctx.version + JSON` canônico da spec (chaves ordenadas).
  - `catalog(ctx) → { id, name, views: {key, title, spec, saved}[], elements: {id, name, type, layer, kind, parent, group}[] }`.
  - `findElements(ctx, text, limit = 8) → {id, name, type, kind, score}[]`: casa por inclusão ou por `similarity` ≥ 0,5,
    em ordem de `score`.
  - `startServer({ config, staticDir? }) → Promise<{ url, close() }>`.
  - Rotas, todas JSON, com erro `{ error, code? }` e status 400 (404 para rota desconhecida):
    - `GET /api/bases` → `BaseInfo[]`
    - `GET /api/bases/:base/catalog`
    - `GET /api/bases/:base/find?q=`
    - `POST /api/bases/:base/view` `{spec}` → `ViewResult`
    - `GET /api/bases/:base/elements/:id` → `{ card, actions }` (`card` = `query(store,{element,format:'json'})`;
      `actions` vem da Task 5. Até lá, `[]`)
    - `POST /api/bases/:base/flip` `{spec}` → `{spec}` (Task 5)
    - fora de `/api`: arquivos de `staticDir`, com `index.html` como fallback.

- [ ] **Step 1: Write the failing tests** (servidor numa porta livre, com `fetch`):
  - `GET /api/bases` lista as duas bases de exemplo.
  - `POST view` com `{notation:'c4',level:'landscape'}` na loja dá 200, `nodes` inclui `'loja'`, `html` sem `class="bar"`.
    Repetir a mesma spec dá `cached: true`.
  - `POST view` com `{notation:'c4',level:'container',scope:'nao-existe'}` dá 400 com `error` (texto do `resolveView`).
  - `GET elements/tele.api` (`encodeURIComponent`) na telemedicina dá `card.element.name === 'API de Agendamento'`.
  - `GET find?q=agendamento` na telemedicina traz `tele.api` entre os três primeiros.
  - Depois de mudar a base em temp e chamar `registry.refresh()`, a mesma spec dá `cached: false`.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 3: Implement** com `node:http` e um roteador por regex. Corpo limitado a 1 MB.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): servidor com catálogo, visão, elemento e busca por nome`.

### Task 5: Navegação — ações do menu, troca de notação, títulos

**Files:**
- Create: `apps/gui/server/navigation.mjs`
- Modify: `apps/gui/server/app.mjs` (liga `actions` e `flip`), `apps/gui/server/views.mjs` (usa `titleFor` quando a spec
  não tem `title`)
- Test: `apps/gui/server/navigation.test.mjs`

**Interfaces:**
- Produces:
  - `type Action = { label: string, spec?: object, sub?: Action[], primary?: boolean, matrix?: boolean }`
  - `actionsFor(ctx, id) → Action[]`, nesta ordem:
    - **softwareSystem:** "Abrir containers" (`primary`, se tem containers) e "Contexto (C4)".
    - **container:** "Abrir componentes" (`primary`, se tem componentes) e "Containers do sistema, foco aqui (C4)".
    - **component:** "Componentes do container (C4)".
    - **grouping:** "Abrir grupo" (`primary`, `groups.only`).
    - **Depois, para todo não-grupo:**
      - "Ver em ArchiMate (camadas)";
      - "Quem depende (n)" e "Do que depende (n)", com `sub` = "Todos (n)" + um item por tipo encontrado na
        travessia, com contagem, **sem os tipos da camada de motivação** *(decisão do agente, aprendizado do
        protótipo)*. Os itens somem quando n = 0;
      - "Matriz de dependência" (`viewpoint:'impact'`, `matrix: true`);
      - "Focar (só vizinhos)": no C4, `focus:[id], depth:1`; no ArchiMate, âncora com
        `traverse:{mode:'both', maxDepth:1}`.

    As specs são as do protótipo (`gui-spike/server.mjs`, `actions`).
  - `flipSpec(ctx, spec) → spec`:
    - C4 com `scope`/`focus` → ArchiMate camadas ancorado.
    - ArchiMate com `anchor`:
      - sistema → contexto C4;
      - container → container C4 com foco;
      - componente → component C4 com foco;
      - só-ArchiMate → contexto do primeiro sistema na travessia `both`, ou paisagem.
    - Sem âncora: C4 → `application`/`container` e ArchiMate → paisagem.
  - `titleFor(ctx, spec) → string`, em português, como no protótipo (`titleOf`).

- [ ] **Step 1: Write the failing tests:**
  - `actionsFor(loja, 'loja')[0]` é `{label:'Abrir containers', primary:true}` com `spec.level === 'container'`.
  - `actionsFor(tele, 'tele.api')` contém "Quem depende" com `sub[0].label` começando por `'Todos ('`, e nenhum item de
    `sub` é do tipo `goal` ou `requirement`.
  - **Varredura:** para cada elemento das duas bases de exemplo, toda spec de `actionsFor` (inclusive `sub`) passa por
    `renderSpec` sem lançar. Registre o p95 do tempo e confira que é < 1000 ms *(o protótipo deu 0 falhas em 1.338
    visões; os casos > 1 s eram ArchiMate grandes no `layout.style: auto`)*.
  - `flipSpec(loja, {notation:'archimate', anchor:'loja.pedidos', …})` dá `{notation:'c4', level:'container', scope:'loja', focus:['loja.pedidos'], depth:1}`.
  - `titleFor(loja, {notation:'c4', level:'container', scope:'loja'})` dá `'Containers de Plataforma de E-commerce'`.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:server`. Expected: FAIL.
- [ ] **Step 3: Implement.** Se o p95 da varredura passar de 1 s, ponha nas specs ArchiMate grandes (> 30 nós
  resolvidos) `layout.style` fixo em `bands-flow`, em vez de `auto`, e registre no teste a contagem dos casos afetados.
  É o ajuste mais barato que o desenho permite sem mexer no núcleo.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): ações de navegação e troca de notação`.

### Task 6: Comando `archlens serve`

**Files:**
- Modify: `scripts/archlens.mjs` (novo `case 'serve'` e o texto de uso)
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `startServer`, `loadConfig` (Tasks 3–4), por `import()` dinâmico de `apps/gui/server/index.mjs`.
- Produces: `archlens serve <base> [--port N] [--open]` e `archlens serve --config archlens-gui.json [--port N]`.
  - Imprime `archlens GUI: http://localhost:N`.
  - Sem `apps/gui/dist/index.html`, sai com código 1 e a mensagem
    `a GUI não está construída; rode "npm run gui:build" na raiz do archlens`.
  - Base de base única inválida: sai com código 1 e a mensagem do conector.

- [ ] **Step 1: Write the failing tests:**
  - Com `ARCHLENS_GUI_DIST` apontando para uma pasta vazia (variável só para teste), `serve examples/loja-online/architecture`
    sai com 1 e a mensagem acima.
  - Com uma pasta dist falsa contendo `index.html`, `serve … --port 0` imprime a URL. `GET /api/bases` responde, e o
    processo encerra no `SIGTERM`.
- [ ] **Step 2: Run** `node --test tests/cli.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.** `--open` usa o `openFile` que já existe.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cli): archlens serve`.

### Task 7: Front — moldura, laterais, tema e ponte com o iframe

**Files:**
- Create: `apps/gui/vite.config.ts` (proxy `/api` → `localhost:5180` no `dev`), `tsconfig.json`, `index.html`,
  `web/src/main.tsx`, `App.tsx`, `Shell.tsx`, `Diagram.tsx`, `bridge.ts`, `api.ts`, `styles.css`
- Test: `apps/gui/web/src/bridge.test.ts`, `Shell.test.tsx` (Vitest + jsdom + Testing Library)

**Interfaces:**
- Consumes: as rotas da Task 4 e o protocolo da Task 1.
- Produces:
  - `api.ts`: `getBases()`, `getCatalog(base)`, `find(base, q)`, `getView(base, spec)`, `getElement(base, id)`,
    `flip(base, spec)`. Todos `Promise`, e todos lançam `ApiError {message, code}` em resposta ≠ 2xx.
  - `bridge.ts`:
    - `parseMessage(ev: MessageEvent): BridgeEvent | null`, que aceita só `source === 'archlens'` vindo do iframe
      atual;
    - `send(frame: HTMLIFrameElement, msg: HostMessage)`;
    - os tipos `BridgeEvent` e `HostMessage` espelham a Task 1.
  - `<Shell left={'chat'|'tree'|null} right={boolean} …>`: faixas, laterais e atalhos. Usa `useStoredState(key, initial)`
    para `left`, `right` e `theme`. Enquanto o diagrama está em "Apresentar", as duas laterais e a barra do topo ficam
    escondidas e voltam ao sair.
  - `<Diagram view={ViewResult} theme onEvent={(e: BridgeEvent) => void} ref>`: o iframe com `srcDoc`, a barra de
    ferramentas da GUI e o aviso de `view.alerts`. A barra tem Animar, Fluxo, Rótulos, Legenda, Matriz, Ajustar,
    Exportar SVG/PNG e Apresentar, e manda `act` pela ponte. O estado on/off vem de `state`.

- [ ] **Step 1: Write the failing tests:**
  - `parseMessage` recusa `source` diferente ou `ev.source` que não seja o iframe, e aceita
    `{source:'archlens', type:'select', id:'tele.api'}`.
  - `Shell`: Ctrl+B fecha e abre a esquerda. Ctrl+Alt+B faz o mesmo com a direita. Com `innerWidth = 1000` na
    montagem, as duas começam fechadas. Com `presenting` verdadeiro, nenhuma lateral é renderizada. O botão de tema troca `document.documentElement.dataset.theme` e grava
    `archlens-theme`.
  - CSS (asserção no `Shell.test.tsx` sobre `getComputedStyle`): `html` e `body` com `overflow: hidden`, e a moldura com
    `position: fixed`.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:web`. Expected: FAIL.
- [ ] **Step 3: Implement.** Layout: `position: fixed; inset: 0`, grid `48px minmax(0,1fr)`, laterais `flex: 0 0 <largura>`
  com `min-width: 0`, centro `flex: 1 1 0; min-width: 0; overflow: hidden`. Tokens de cor em `:root` e
  `:root[data-theme=dark]`. O tema que chega do iframe (`theme`) atualiza o estado, e o estado manda `theme` ao iframe.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): moldura, laterais, tema e ponte com o diagrama`.

### Task 8: Front — trilha e histórico, menu do botão direito, seleção, expansão

**Files:**
- Create: `apps/gui/web/src/history.ts`, `ContextMenu.tsx`, `History.tsx`
- Modify: `App.tsx`
- Test: `apps/gui/web/src/history.test.ts`, `ContextMenu.test.tsx`

**Interfaces:**
- Consumes: `actionsFor` pela rota de elemento, `flip`, `getView`, `BridgeEvent`.
- Produces:
  - `type Step = { kind: 'Visão'|'Menu'|'Clique duplo'|'Notação'|'Explorador'|'Busca', label: string, view: ViewResult, ms: number, matrix?: boolean }`
  - `history.ts`: `reducer(state, action)` com `state = { steps: Step[], cur: number, pending: number|null }` e as ações:
    - `{type:'request', ticket}`;
    - `{type:'loaded', ticket, step}`: só aplica se `ticket === pending`, e o passo novo descarta o que estava depois
      de `cur`;
    - `{type:'failed', ticket, error}`;
    - `{type:'go', index}`;
    - `{type:'reset'}`.
  - `<ContextMenu at={{x,y}} title items={Action[]} onPick={(a: Action) => void} onClose>`, com submenu no hover e
    Esc/clique fora fechando. Fica preso à janela (não sai da tela).
  - Em `App`:
    - `context` → busca `actions` e abre o menu na posição `iframeRect + (x, y)`;
    - `expand` → abre a ação `primary`, se houver;
    - `select` → selecionado = `id`;
    - um passo com `matrix` manda `act:'matrix'` quando chega o `ready`;
    - o seletor ArchiMate | C4 → `flip` e abre o resultado.

- [ ] **Step 1: Write the failing tests:**
  - `history.test.ts`:
    - "resposta atrasada é descartada": `request(1)`, `request(2)`, `loaded(2)`, `loaded(1)`. Resultado: `steps`
      termina no passo 2 e tem um item só.
    - "voltar e abrir corta o futuro": três passos, `go(0)`, `loaded`. Resultado: dois passos.
    - "falha não muda a trilha": `failed` mantém `steps` e `cur`, e põe `error` no estado.
  - `ContextMenu.test.tsx`: renderiza os itens e o submenu de "Quem depende (3)". O clique num item de `sub` chama
    `onPick` com o item. Esc chama `onClose`.
- [ ] **Step 2: Run** `npm --prefix apps/gui run test:web`. Expected: FAIL.
- [ ] **Step 3: Implement.** Erros de `getView` aparecem na linha de status da barra do topo. A trilha acima do diagrama
  mostra `steps[0..cur]`, e clicar num item faz `go`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(gui): trilha, menu do botão direito e expansão`.

### Task 9: Front — Explorador, Detalhes, base e busca por nome; e2e; documentação

**Files:**
- Create: `apps/gui/web/src/Explorer.tsx`, `Details.tsx`, `apps/gui/e2e/smoke.test.mjs`
- Modify: `App.tsx`, `README.md` (seção "GUI"), `AGENTS.md` (item da GUI), `CHANGELOG.md` (`[Não lançado]`)
- Test: `apps/gui/web/src/Details.test.tsx`, `apps/gui/e2e/smoke.test.mjs`

**Interfaces:**
- Consumes: `catalog`, `find`, `getElement`, `viewData` (vem em `ViewResult.data`), a ponte.
- Produces:
  - `<Explorer catalog selected onOpenView(spec) onPick(id)>`:
    - visões salvas (★) e sugeridas;
    - um filtro;
    - a árvore por camada → `parent`, recolhível.
  - `<Details card viewNode viewEdges onPick(id) onTrace(id)>`:
    - **"Nesta visão"**, quando o nó está na visão: tipo C4 e ArchiMate, descrição, tecnologia, camada, papel e
      distância, e as relações da visão. As relações vêm de `data.edges` filtradas pelo nó, como frase
      (`help.sentence`) com a tecnologia em destaque. Clicar numa relação manda `select` com o outro nó. "Como ler as
      relações?" manda `act:'glossary'`.
    - **"Na base"**: apelidos, pai (clicável), id, filhos, fontes (`kind`, `ref` e o `excerpt` entre aspas) e rodadas
      (data, resumo e `how` como etiquetas).
    - Sem nó na visão, só o cartão completo da base.
  - Escolher na árvore:
    - se o elemento está na visão, manda `select` pela ponte;
    - se não está, abre a primeira ação de contexto (`Contexto`, `Containers do sistema…` ou `Componentes do container…`).
  - Barra do topo:
    - seletor de base (com as inválidas desabilitadas e o erro no `title`);
    - busca: Enter com texto busca por nome (`find`). Com um resultado, seleciona ou abre. Com vários, mostra a
      lista na aba Conversa. A pergunta em linguagem natural é da fase 2: o placeholder diz "Buscar elemento… (Ctrl+K)".
  - `AGENTS.md`: um item que manda avaliar o impacto na GUI e rodar `npm run gui:test` em mudanças de `render.mjs`,
    `query*.mjs`, `view-build.mjs` ou `store/`.

- [ ] **Step 1: Write the failing tests:**
  - `Details.test.tsx`:
    - com `viewNode` e `card` de `tele.api`, aparecem os títulos "Nesta visão" e "Na base", a frase
      "API de Agendamento serve App do Paciente." (ou a do `help.sentence` do fixture) e o chip `REST`;
    - o clique no pai chama `onPick('tele')`;
    - sem `viewNode`, não aparece "Nesta visão".
  - `e2e/smoke.test.mjs` (`node --test`, playwright-core, servidor da Task 4 com `staticDir = dist`, base telemedicina):
    1. a paisagem abre;
    2. o botão direito em `[data-node="tele"]` abre o menu, e "Abrir containers" mostra a trilha
       `Paisagem › Containers de Plataforma de Teleconsulta`;
    3. o clique em `tele.api` preenche "Nesta visão" com "API de Agendamento";
    4. `document.scrollingElement.scrollWidth === innerWidth` em 1600, 1150 e 800 px, depois de 8 `wheel` horizontais
       sobre o diagrama;
    5. o tema da barra do topo muda o `data-theme` do iframe, e T dentro do iframe muda o da aplicação;
    6. uma ação que falha (spec forçada inválida pela rota) mostra o erro, e a trilha não muda;
    7. `.drawer` não existe no iframe.
- [ ] **Step 2: Run** `npm --prefix apps/gui run build && npm --prefix apps/gui test`. Expected: FAIL.
- [ ] **Step 3: Implement**, e escreva a seção "GUI" do README (`npm run gui:build`, `archlens serve <base>`,
  `archlens-gui.json` com várias bases), o item do `AGENTS.md` e a entrada do CHANGELOG.
- [ ] **Step 4: Run** `npm test && npm run gui:build && npm run gui:test && npm run check-ask`. Expected: tudo PASS e
  `check-ask` sem avisos.
- [ ] **Step 5: Commit** `feat(gui): explorador, detalhes, busca por nome e teste ponta a ponta`.

---

## Depois desta fase

- **Fase 2 (plano próprio):**
  - busca em texto com LLM (`/api/ask` em stream, ferramentas `find_elements`, `element_card`, `relations` e
    `try_view`, tetos de 4 rodadas e 45 s);
  - adaptador Anthropic + compatível com OpenAI, com o modo sem ferramentas;
  - prompt gerado a partir de `references/views.md` e da tabela da skill, com o check;
  - avaliação sobre `portable/archlens-ask/eval/` com P50/P90 e acerto;
  - telemetria.
- **Fase 3 (plano próprio):** executor MCP para o conector gbrain (direto e por gateway, mapa de nomes de ferramenta,
  checagem na subida), credencial de serviço e imagem Docker.
