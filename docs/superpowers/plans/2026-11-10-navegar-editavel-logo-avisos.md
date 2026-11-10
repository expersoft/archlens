# Editar no Navegar, editor ampliado, ícone, logo e avisos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com o Planejar ligado, editar o nó direto do Navegar (levando ao Planejar com o delta), trocar a tela cheia por
um editor ampliado com sumário e lado a lado, dar ícone à aba Nó, pôr o logo do archlens (trocável por `brand`) e trocar
a faixa de avisos por um selo com ações.

**Architecture:** Mudanças quase todas na web da GUI. O servidor ganha `brand` (config, `/api/info`, rotas do logo),
aceita rascunho ausente em `/plan/edit` e `/plan/element`, e devolve avisos estruturados (`alertInfo`) ao lado dos
textos de sempre. O Navegar escreve no rascunho pelo `draftStore` e pelas rotas do Planejar; o `PlanView` relê o
rascunho salvo quando avisado e publica se está ocupado.

**Tech Stack:** React + TypeScript (Vitest, Testing Library), Node ESM (`node:test`), Playwright (e2e existente).

**Spec:** `docs/superpowers/specs/2026-11-09-navegar-editavel-logo-avisos-design.md` (continua
`docs/superpowers/specs/2026-11-09-painel-do-no-e-edicao-no-planejar-design.md`).

**Branch:** `feat/painel-do-no`, no worktree `.claude/worktrees/painel-do-no`.

## Global Constraints

- Cores: só os tokens da GUI (`--bg --panel --ink --muted --line --accent --warn-bg --warn`) e as de camada
  (`--biz --app --tech …` e `-s`) já copiadas do `render.mjs`.
- Textos de interface em português. Botões do editor: **Cancelar** e **Confirmar**.
- Dicas de bloqueio, iguais às atuais: `Aguarde o chat terminar para editar` e `Aguarde a gravação terminar`.
- Confirmação de descarte, igual à atual: `Descartar a edição não confirmada?`.
- `alerts` (lista de textos) não muda: a CLI, o `embed`, os testes e o archlens-ask continuam iguais.
- Rota do logo nunca recebe caminho do navegador; SVG exibido por `<img>` e servido com
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`.
- `brand.logo`/`logoDark`: relativos à pasta do `archlens-gui.json`; extensões `.svg .png .webp`; até 1 MB.
- `AGENTS.md`: `npm run gui:test`; `view-build.mjs` mudou → avaliar GUI; `npm run check-ask` antes de concluir.

## Review Focus

1. **Navegar com rascunho salvo de outra versão ou corrompido no localStorage:** editar não quebra; o servidor valida e,
   se recusar, o Navegar mostra o erro e não troca de modo. Teste na Task 6.
2. **Base trocada com o editor do Navegar aberto:** o editor fecha (com a confirmação de descarte se sujo) e nada é
   gravado no rascunho da outra base. Teste na Task 6.
3. **`brand.logo` apontando para fora da pasta (`../../etc/passwd.svg`) ou para um arquivo de 5 MB:** a configuração
   falha ao subir com mensagem clara. Teste na Task 2.
4. **Documento de 2.000 linhas com 300 títulos no editor ampliado:** o sumário continua responsivo (atualiza ao digitar
   sem travar). Teste na Task 4.
5. **Visão com aviso de nota de layout e nenhum nó selecionado:** o selo mostra o item sem ação e não oferece "Focar no
   selecionado". Teste na Task 3.

---

### Task 1: ícone da aba Nó, logo do archlens e favicon

**Files:**
- Create: `apps/gui/web/src/icons.tsx`
- Modify: `apps/gui/web/src/plan/PlanView.tsx` (aba e trilho), `apps/gui/web/src/Shell.tsx` (barra do topo),
  `apps/gui/web/index.html` (favicon), `apps/gui/web/public/favicon.svg` (novo), `apps/gui/web/src/styles.css`
- Test: `apps/gui/web/src/icons.test.tsx`, `apps/gui/web/src/Shell.test.tsx`, `apps/gui/web/src/App.plan.test.tsx`

**Interfaces:**
- Produces: `InfoIcon({ size?: number })` e `ArchlensMark({ size?: number })` em `icons.tsx` (SVG em linha,
  `aria-hidden`, cores por `currentColor`/tokens: aro `var(--accent)`, faixas `var(--biz-s)`, `var(--app-s)`,
  `var(--tech-s)`), desenho da opção A do mockup `logo-icone-modal.html`.

- [ ] **Step 1: Testes que falham**

```ts
it('trilho mostra o ícone de informações com a dica', () => { /* botão com title "Nó (detalhes do item selecionado)" e svg; sem o texto "Nó" no trilho */ });
it('aba do painel mostra ícone e "Nó"', …);
it('barra do topo mostra a marca do archlens antes do nome', …); // svg[data-mark="archlens"] seguido de "archlens"
```

- [ ] **Step 2: Rodar e ver falhar** — `npm --prefix apps/gui run test:web -- icons Shell App.plan`

- [ ] **Step 3: Implementar** os dois componentes, trocar a palavra do trilho por `InfoIcon` (com `aria-label="Nó"` e a
  dica acima), pôr `InfoIcon` + "Nó" na aba, `ArchlensMark` antes de "archlens" no `Shell`, e o favicon SVG com o mesmo
  desenho (cores fixas do tema claro) em `index.html`.

- [ ] **Step 4: Rodar** — `npm --prefix apps/gui test` e typecheck: PASS.

- [ ] **Step 5: Commit** — `feat(gui): ícone de informações na aba Nó e logo do archlens`

---

### Task 2: `brand` — logo da empresa pela configuração

**Files:**
- Modify: `apps/gui/server/config.mjs` (`checkBrand`), `apps/gui/server/app.mjs` (`/api/info`, rotas do logo),
  `apps/gui/web/src/api.ts` (`Info.brand`), `apps/gui/web/src/Shell.tsx`, `apps/gui/web/src/App.tsx` (título da aba),
  `apps/gui/web/src/styles.css`, `README.md` (seção GUI, exemplo do `brand`)
- Test: `apps/gui/server/config.test.mjs`, `apps/gui/server/app.test.mjs`, `apps/gui/web/src/Shell.test.tsx`

**Interfaces:**
- Produces:
  - `checkBrand(brand: unknown, dir: string): { logo: string; logoDark?: string; name?: string }` (caminhos absolutos)
    em `config.mjs`; `loadConfig` devolve `brand` quando presente. Erros `configError` em português:
    `brand.logo é obrigatório`, `brand.logo: arquivo não encontrado: <caminho>`, `brand.logo: use .svg, .png ou .webp`,
    `brand.logo passa de 1 MB`, `brand.logo precisa ficar dentro da pasta do archlens-gui.json` (idem `logoDark`).
  - `/api/info` ganha `brand?: { name?: string; logo: '/api/brand/logo'; logoDark?: '/api/brand/logo-dark' }`.
  - `GET /api/brand/logo` e `GET /api/brand/logo-dark`: o arquivo configurado, `Content-Type` pela extensão
    (`image/svg+xml`, `image/png`, `image/webp`) e a CSP das Global Constraints; 404 sem marca.
  - `Shell` recebe `brand?: Info['brand']` e `theme: 'light' | 'dark'` (o tema da interface): com marca, `<img>` do
    `logoDark` no escuro (se houver, senão `logo`), `alt={brand.name ?? 'Logo'}`, traço vertical e "archlens" pequeno
    (`.brand-product`); sem marca, `ArchlensMark` + "archlens".
  - Título da aba: `${brand.name} · archlens` com nome; `archlens` sem.

- [ ] **Step 1: Testes que falham**

```js
test('brand válido devolve caminhos absolutos', …);
test('brand.logo fora da pasta do arquivo é recusado', …);      // Review Focus 3
test('brand.logo de 5 MB é recusado', …);                        // Review Focus 3
test('brand.logo com extensão .gif é recusado', …);
test('/api/info traz brand e /api/brand/logo serve o arquivo com CSP', …);
test('/api/brand/logo-dark sem logoDark responde 404', …);
```
```ts
it('com brand mostra o logo da empresa, o traço e archlens discreto', …);
it('no tema escuro usa logoDark', …);
it('sem brand mostra a marca do archlens', …);
```

- [ ] **Step 2: Rodar e ver falhar** — `npm --prefix apps/gui run test:server` e `… run test:web -- Shell`

- [ ] **Step 3: Implementar.** Caminho dentro da pasta: `resolve(dir, p)` deve começar com `resolve(dir) + sep`.

- [ ] **Step 4: Rodar** — `npm --prefix apps/gui test` e typecheck: PASS.

- [ ] **Step 5: Commit** — `feat(gui): logo da empresa pela configuração (brand)`

---

### Task 3: avisos da visão em selo com ações

**Files:**
- Modify: `scripts/lib/view-build.mjs` (`viewAlertInfo`, `buildView` devolve `alertInfo`), `apps/gui/server/views.mjs`
  (se repassa o resultado campo a campo), `apps/gui/server/plan/preview.mjs` (`drawView` devolve `alertInfo`),
  `apps/gui/web/src/api.ts`, `apps/gui/web/src/Diagram.tsx` (sai a faixa `.alerts`), `apps/gui/web/src/App.tsx`,
  `apps/gui/web/src/plan/PlanPreview.tsx`, `apps/gui/web/src/styles.css`
- Create: `apps/gui/web/src/AlertBadge.tsx`
- Test: `tests/view-build.test.mjs` (ou o teste existente de `buildView`), `apps/gui/web/src/AlertBadge.test.tsx`,
  `apps/gui/web/src/Diagram.test.tsx`, `apps/gui/server/plan-routes.test.mjs`

**Interfaces:**
- Produces:
  - `viewAlertInfo(view, laid): AlertInfo[]` em `view-build.mjs`, com
    `AlertInfo = { kind: 'size' | 'layout' | 'legibility'; text: string; nodes?: number; minFontPx?: number }`;
    `text` é exatamente o texto que `viewAlerts` produz para o mesmo aviso (e `viewAlerts` passa a ser
    `viewAlertInfo(...).map(a => a.text)`). `buildView` devolve `alertInfo` além de `alerts`.
  - Na web: `ViewResult.alertInfo?: AlertInfo[]`; `PreviewView.alertInfo?: AlertInfo[]`.
  - `AlertBadge({ alerts: AlertInfo[], actions: AlertAction[] })`, com
    `AlertAction = { id: 'nest' | 'focus' | 'layer' | 'present'; label: string; run: () => void; options?: { label: string; run: () => void }[] }`;
    não renderiza nada sem avisos; botão `⚠ N` (`aria-label="Avisos da visão (N)"`) abre painel (`role="dialog"`,
    fecha com Esc e clique fora). Títulos: `legibility`/`size` → "Visão grande para uma tela", explicação
    `Com N elementos, o texto fica com cerca de Xpx quando a visão inteira cabe na tela.` (sem X quando não houver
    `minFontPx`); `layout` → "Nota do layout" com o `text`. As ações aparecem só sob `legibility`/`size`.
  - Navegar (`App.tsx`) monta as ações: `nest` = o mesmo do botão Agrupar tudo (`onNestAll`, rótulo `allLabel(nest)`,
    só se a visão tiver `nest`); `focus` = "Focar no selecionado" → `{ ...view.spec, focus: [selected], depth: 1 }`
    (só com nó selecionado); `layer` = "Mostrar só uma camada" com uma opção por camada presente em `viewData.nodes`
    (rótulo `layerLabel`), spec `{ ...view.spec, layers: [layer] }` (só em visão ArchiMate com 2+ camadas);
    `present` = "Apresentar com zoom" → o act `present` do diagrama. A prévia do Planejar passa só `present` (e `nest`
    se a barra da prévia tiver).
  - O selo fica na barra do diagrama (Navegar) e na barra da prévia (Planejar).

- [ ] **Step 1: Testes que falham**

```js
test('viewAlertInfo marca legibility com minFontPx e o mesmo texto de viewAlerts', …);
test('a CLI continua imprimindo os mesmos alerts', …); // compara viewAlerts antes/depois numa visão grande
test('a prévia do Planejar devolve alertInfo', …);
```
```ts
it('sem avisos não mostra o selo', …);
it('selo mostra a contagem e abre o painel com título e explicação', …);
it('ações só nas que se aplicam: sem nó selecionado não há Focar', …);       // Review Focus 5
it('aviso de layout aparece sem ações', …);                                   // Review Focus 5
it('Mostrar só uma camada lista as camadas e roda a visão da camada', …);
it('o diagrama não mostra mais a faixa de avisos', …);
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` (núcleo), `npm --prefix apps/gui test`

- [ ] **Step 3: Implementar.** Confirme o nome do campo de camadas da spec de visão em `references/views.md` antes de
  usar `layers`.

- [ ] **Step 4: Rodar** — `npm test`, `npm --prefix apps/gui test`, `npm run check-ask`: PASS.

- [ ] **Step 5: Commit** — `feat(gui): avisos da visão num selo com ações`

---

### Task 4: editor ampliado da documentação

**Files:**
- Create: `apps/gui/web/src/DocWindow.tsx`, `apps/gui/web/src/markdown-toc.ts`
- Modify: `apps/gui/web/src/plan/DocEditor.tsx` (troca o diálogo de tela cheia), `apps/gui/web/src/DocTab.tsx` (troca o
  "Tela cheia" de leitura), `apps/gui/web/src/styles.css`
- Test: `apps/gui/web/src/DocWindow.test.tsx`, `apps/gui/web/src/markdown-toc.test.ts`,
  `apps/gui/web/src/plan/DocEditor.test.tsx`, `apps/gui/web/src/DocTab.test.tsx`

**Interfaces:**
- Produces:
  - `tocOf(text: string): { level: 1 | 2 | 3; title: string; line: number }[]` (ignora `#` dentro de blocos de código
    cercados por ```).
  - `applyFormat(text: string, sel: { start: number; end: number }, kind: 'h' | 'b' | 'i' | 'ul' | 'ol' | 'quote' | 'code' | 'link' | 'table'): { text: string; sel: { start: number; end: number } }`
    (exportada de `DocWindow.tsx` ou de `markdown-toc.ts`): `b` → `**sel**`, `i` → `*sel*`, `h` → prefixa a linha com
    `## `, `ul` → `- `, `ol` → `1. `, `quote` → `> `, `code` → `` `sel` `` (bloco cercado se a seleção tiver várias
    linhas), `link` → `[sel](url)` com `url` selecionado, `table` → tabela 2×2 de exemplo.
  - `DocWindow({ title: string; layer?: string; labels?: string[]; text: string; editable: boolean; onConfirm?: (t: string) => void; onClose: (t: string) => void })`:
    `role="dialog"`, `aria-modal="true"`, foco preso, Esc chama `onClose(textoAtual)`, Ctrl+Enter chama `onConfirm`
    (só editável); seletor `Escrever` / `Lado a lado` / `Prévia` com padrão `Lado a lado`; botão ☰
    (`aria-label="Sumário"`) mostra/oculta o sumário; clicar num título rola editor e prévia até a seção; título da
    seção do cursor com `aria-current="true"`; rodapé `markdown · N linhas` (+ ` · alterado` quando difere do texto
    inicial) e `Esc fecha · Ctrl+Enter confirma`; editável tem barra de formatação e **Cancelar**/**Confirmar**;
    leitura só tem sumário, prévia e fechar. Visual do mockup `modal-combinado.html` (~90% × 88%, fundo escurecido com
    `backdrop-filter: blur`).
  - `DocEditor` abre `DocWindow` editável no lugar do diálogo atual (o texto volta ao cartão ao fechar, como hoje);
    `DocTab` abre `DocWindow` de leitura. A pergunta de descarte ao fechar com texto alterado continua a do Global
    Constraints.

- [ ] **Step 1: Testes que falham**

```ts
it('tocOf lê #, ## e ### e ignora títulos dentro de código', …);
it('applyFormat b envolve a seleção em ** e mantém a seleção no texto', …);
it('abre em Lado a lado, com sumário; ☰ oculta o sumário', …);
it('clicar num título do sumário marca a seção atual', …);
it('Ctrl+Enter confirma e Esc fecha devolvendo o texto', …);
it('foco preso: Tab no último elemento volta ao primeiro', …);
it('leitura não tem formatação nem Confirmar', …);
it('2.000 linhas e 300 títulos: digitar atualiza o sumário em menos de 100 ms', …); // Review Focus 4
```

- [ ] **Step 2: Rodar e ver falhar** — `npm --prefix apps/gui run test:web -- DocWindow markdown-toc DocEditor DocTab`

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar** — `npm --prefix apps/gui test` e typecheck: PASS.

- [ ] **Step 5: Commit** — `feat(gui): editor ampliado da documentação com sumário e lado a lado`

---

### Task 5: rascunho ausente nas rotas e o `PlanView` falando com o `App`

**Files:**
- Modify: `apps/gui/server/plan/routes.mjs` (`/plan/edit`, `/plan/element`), `apps/gui/web/src/api.ts`,
  `apps/gui/web/src/plan/PlanView.tsx`, `apps/gui/web/src/App.tsx`
- Test: `apps/gui/server/plan-routes.test.mjs`, `apps/gui/web/src/plan/PlanViewEdit.test.tsx`

**Interfaces:**
- Produces:
  - `/plan/edit` e `/plan/element` aceitam corpo sem `draft` (ou `draft: null`): usam `newDraft(ctx)`.
    `planEdit(base, draft: Draft | null, edit)` e `planElement(base, draft: Draft | null, id)` na web.
  - `PlanView` ganha `onBusy?: (lock: Lock) => void` (chamado sempre que `roundRunning`/`writing` mudam; `Lock` de
    `plan/lock.ts`) e `reload?: number` (quando muda, relê `draftStore.load(base)` e adota o rascunho e a conversa
    salvos, replanejando como na restauração do montar).
  - `PlanView` também ganha `focusNode?: { id: string; n: number }`: quando muda, seleciona o nó, abre o painel na aba
    Nó.

- [ ] **Step 1: Testes que falham**

```js
test('/plan/edit sem draft cria o rascunho com a edição', …);
test('/plan/element sem draft mostra o nó da base', …);
```
```ts
it('onBusy informa chat e gravação', …);
it('reload adota o rascunho salvo por fora', …);
it('focusNode abre a aba Nó no nó', …);
```

- [ ] **Step 2: Rodar e ver falhar** — `npm --prefix apps/gui test`

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar** — `npm --prefix apps/gui test` e typecheck: PASS.

- [ ] **Step 5: Commit** — `feat(gui): rascunho novo pelas rotas de edição e PlanView que relê e avisa ocupado`

---

### Task 6: editar o nó no Navegar

**Files:**
- Create: `apps/gui/web/src/browseEdit.ts`
- Modify: `apps/gui/web/src/App.tsx`, `apps/gui/web/src/Details.tsx` (se precisar de prop para o aviso de removido)
- Test: `apps/gui/web/src/browseEdit.test.ts`, `apps/gui/web/src/App.browseEdit.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`planEdit`/`planElement` com `null`, `onBusy`, `reload`, `focusNode`), `PropsEditor`, `DocEditor`
  (com `DocWindow`, Task 4), `draftStore` (`load`, `save`), `lockText`.
- Produces:
  - `useBrowseNode(base: string | null, id: string | null, enabled: boolean): { el: PlanElement | null; error: string | null }`
    em `browseEdit.ts`: com `enabled` e um rascunho salvo, chama `planElement(base, draft, id)`; sem rascunho, `null`
    (o Navegar usa o cartão da base).
  - `confirmBrowseEdit(base: string, edit: ScreenEdit): Promise<{ ok: true } | { ok: false; error: string }>`: lê
    `draftStore.load(base)?.draft ?? null`, chama `planEdit`, grava com `draftStore.save(base, draft, chatSalvo)` e
    devolve; erro do servidor volta como `{ ok: false, error }` sem gravar (Review Focus 1).
  - No `App` (Navegar, `planEnabled`): o `Details` do Navegar recebe `actions`/`slots` com os mesmos editores do
    `NodePanel` (✎ Editar em Propriedades e Documentação; "Escrever" na doc vazia), partindo de `useBrowseNode(...).el`
    quando houver, senão do cartão da base; nó com `removed` mostra "removido pelo rascunho" e não edita; bloqueado com
    `lockText(lock)` enquanto o `PlanView` informa ocupado (via `onBusy`). Depois de `confirmBrowseEdit` ok: monta o
    `PlanView` se preciso (`planOpened`), incrementa `reload`, define `focusNode` e troca para `mode: 'plan'`. Em erro:
    mostra a mensagem no cartão e não troca.
  - Trocar de nó, de base ou de modo com editor sujo pede a confirmação de descarte; trocar de base fecha o editor sem
    gravar (Review Focus 2).

- [ ] **Step 1: Testes que falham**

```ts
it('com Planejar desligado o Navegar não mostra Editar', …);
it('editar propriedade no Navegar e Confirmar leva ao Planejar na aba Nó com a mudança', …);
it('com rascunho existente a edição se soma a ele', …);
it('documentação editada no Navegar pelo editor ampliado vai para o rascunho', …);
it('durante rodada do chat ou gravação o Editar do Navegar fica desabilitado com a dica', …);
it('nó removido pelo rascunho mostra o aviso e não edita', …);
it('rascunho salvo inválido: erro no cartão, sem trocar de modo', …);   // Review Focus 1
it('trocar de base com editor sujo pergunta e não grava na outra base', …); // Review Focus 2
```

- [ ] **Step 2: Rodar e ver falhar** — `npm --prefix apps/gui run test:web -- browseEdit App.browseEdit`

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar** — `npm --prefix apps/gui test` e typecheck: PASS.

- [ ] **Step 5: Commit** — `feat(gui): editar o nó no Navegar leva ao Planejar com o delta`

---

### Task 7: documentação, e2e e verificação na GUI real

**Files:**
- Modify: `README.md` (Navegar editável, editor ampliado, `brand`, selo de avisos), `CHANGELOG.md`, e2e afetados em
  `apps/gui/e2e/` (faixa de avisos, tela cheia)

- [ ] **Step 1:** README e CHANGELOG.
- [ ] **Step 2:** `npm test && npm run gui:test && npm run check-ask` e `npm --prefix apps/gui run test:e2e`: PASS
  (ajuste os e2e que esperavam a faixa ou a tela cheia antigas).
- [ ] **Step 3:** Na GUI real (cópia do vault, fora do repositório), nos dois temas, com e sem `brand` (um SVG qualquer
  de teste): critérios 1–7 da spec; capturas de tela em `.superpowers/sdd/…/shots/`. Registre o que não bater.
- [ ] **Step 4: Commit** — `docs: Navegar editável, editor ampliado, logo e avisos`
