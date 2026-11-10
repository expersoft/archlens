# Painel do nó e edição no Planejar: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar o painel do nó da GUI (cartões recolhíveis, cabeçalho na cor da camada) e, no Planejar, editar
`properties` e documentação pela tela, com as edições no Delta, origem marcada e conflito com o chat confirmado pelo
usuário.

**Architecture:** O núcleo ganha "remover propriedade" (`null` no delta). O rascunho do servidor ganha uma camada própria
de edições da tela (`edits`) e as respostas a conflitos (`kept`); o servidor compõe delta do agente + edições antes de
planejar, responde `take` sozinho às perguntas que a edição já responde e bloqueia o opsHash enquanto houver conflito
chat × tela. A web troca as abas do `Details` por cartões, ganha a aba Nó no Planejar e os editores, e todas as
mudanças passam por uma rota `/plan/edit` (o navegador nunca compõe o delta).

**Tech Stack:** Node.js ESM (`node:test`), React + TypeScript (Vitest + Testing Library), `markdown-it` (já na GUI).

**Spec:** `docs/superpowers/specs/2026-11-09-painel-do-no-e-edicao-no-planejar-design.md`

**Ponto de partida:** branch `feat/documentacao-do-no`. Crie a branch de trabalho a partir dela
(`git switch -c feat/painel-do-no feat/documentacao-do-no`), num worktree isolado.

## Global Constraints

- Cores da GUI: só `--bg --panel --ink --muted --line --accent` (`apps/gui/web/src/styles.css`, claro e escuro) e as de
  camada `--biz --app --tech --mot --str --impl --oth` com variantes `-s`, copiadas **iguais** de `scripts/lib/render.mjs`
  (bloco claro e bloco escuro).
- Cabeçalho do nó: fundo `var(--<camada>)`, borda inferior `3px solid var(--<camada>-s)`.
- Ordem dos cartões: Propriedades, Documentação, Nesta visão, Relações na visão (ou Relações), Na base, Filhos, Fontes e
  rodadas.
- Listas mostram 5 itens e "Mostrar mais N"; documentação com altura limitada, "Expandir" e "Tela cheia".
- Botões do editor de cartão: **Cancelar** e **Confirmar**. Nunca "Pôr no delta". "Aplicar" segue sendo só o da barra.
- Aba Delta mostra o número de mudanças; abas do painel direito do Planejar: **Delta** e **Nó**.
- Selos de origem no Delta: **chat**, **tela**, e os dois quando se misturam.
- Documentação: só em base markdown ou gbrain (`docs` do `ElementDetail`); texto com `<!-- archlens:begin -->` ou
  `<!-- archlens:end -->` é recusado com a mensagem atual do núcleo.
- Markdown sempre pelo componente `Markdown` existente (HTML desligado).
- `AGENTS.md`: `npm run gui:test`; prompt mudou → `npm --prefix apps/gui run prompt`; avaliar archlens-ask, `npm run ask`
  se tocar, `npm run check-ask` sempre.
- Textos de interface em português, sem jargão de processo.

## Review Focus

1. **Edição em nó que o chat depois remove:** a edição fica órfã. Esperado: o plano não bloqueia por isso; a edição é
   descartada ao compor e o Delta não a mostra. Teste na Task 2.
2. **Rascunho antigo, sem `edits`/`kept`:** Abrir um `.json` salvo antes desta versão. Esperado: abre normalmente, como
   `edits: {}` e `kept: []`. Teste na Task 2.
3. **Chave de propriedade com ponto, espaço ou só espaços:** `"a.b"`, `" "`. Esperado: só espaços é recusado; ponto é
   aceito e o Delta mostra `properties.a.b` sem quebrar. Teste na Task 2 (validação) e Task 3 (deltaList).
4. **Trocar de nó com o editor aberto e texto não confirmado:** Esperado: pede confirmação antes de descartar o texto.
   Teste na Task 6.
5. **Documentação muito grande (100 KB) no editor e no Delta:** Esperado: o editor abre, o Delta mostra só a contagem de
   linhas até "ver diferença". Teste na Task 7.

---

### Task 1: núcleo — remover propriedade com `null`

**Files:**
- Modify: `schemas/delta.schema.json` (valores de `properties` do elemento, ~linha 360: acrescente `{ "type": "null" }`
  ao `anyOf`)
- Modify: `scripts/lib/merge.mjs` (`fieldsOf`, `reconcile`)
- Modify: `scripts/lib/merge-report.mjs` (texto do conflito)
- Modify: `references/base.md` (parágrafo de `properties`, ~linha 153), `skills/archlens-plan/SKILL.md` (onde fala de
  delta e `properties`)
- Test: `tests/merge.test.mjs` (ou o arquivo de testes de merge existente), `tests/merge-report.test.mjs`

**Interfaces:**
- Produces: no delta, `properties: { chave: null }` remove a chave do elemento. Base sem a chave → nada a fazer (nem
  item). Base com a chave → item `class: 'conflict'`, `key: el:<id>:properties.<chave>`, `delta: null`; `take` remove,
  `keep` mantém, `value:<x>` grava `<x>`.

- [ ] **Step 1: Write the failing tests**

```js
test('properties com null remove a chave quando a resposta é take', () => {
  // base: elemento loja com properties { owner: 'Squad Checkout', criticidade: 'alta' }
  // delta: { model: { elements: [{ id: 'loja', properties: { criticidade: null } }] } }
  // plano: item el:loja:properties.criticidade, class conflict, delta null
  // aplicar com answers { 'el:loja:properties.criticidade': 'take' } → properties === { owner: 'Squad Checkout' }
});
test('null numa chave que a base não tem não gera item nem mudança', …);
test('keep mantém a propriedade', …);
test('o relatório descreve a remoção', () => {
  // describeItem do item acima contém 'remover a propriedade "criticidade"' e '→ keep | take'
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/merge.test.mjs tests/merge-report.test.mjs`
Expected: FAIL (schema recusa `null`; chave não some).

- [ ] **Step 3: Implement**

`fieldsOf`: o `apply` de `properties.<k>` apaga a chave quando `x === null` (e apaga `properties` se ficar vazio).
`reconcile`: `dv === null && bv === undefined` → `continue`. `merge-report.mjs`: conflito com `field` começando por
`properties.` e `delta === null` → `conflito <target>: remover a propriedade "<k>" (base <valor>)  → keep | take`.
Documente em `references/base.md` e na skill que `null` remove a propriedade e passa pela pergunta de conflito.

- [ ] **Step 4: Run to verify they pass, then the suites**

Run: `npm test && npm run check-ask`
Expected: PASS. Se `check-ask` apontar arquivo gerado desatualizado, rode `npm run ask` e confira o diff.

- [ ] **Step 5: Commit**

```bash
git add schemas scripts/lib references skills tests portable
git commit -m "feat(merge): null em properties remove a propriedade, com pergunta de conflito"
```

---

### Task 2: servidor — camada de edições da tela no rascunho

**Files:**
- Create: `apps/gui/server/plan/edits.mjs`
- Modify: `apps/gui/server/plan/draft.mjs` (`FIELDS`, `newDraft`, `checkDraft`, `replanDraft`, novo `draftOpsHash`)
- Test: `apps/gui/server/edits.test.mjs`, `apps/gui/server/draft.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`null` em `properties`).
- Produces (em `edits.mjs`):
  - Tipos: `Edits = { [id: string]: { properties?: { [k: string]: string | number | boolean | string[] | null }, doc?: string } }`;
    `Kept = { id: string, field: string, value: unknown }[]`; `field` é `properties.<k>` ou `doc`.
  - `checkEdits(edits, kept): { edits, kept }`: valida a forma; lança `E_GUI_DRAFT` com mensagem em português. Chave
    vazia ou só espaços é recusada.
  - `composeDelta(delta, edits, removedIds: Set<string>): object | null`: delta do agente com as edições por cima.
    Propriedade editada sobrescreve a do agente no mesmo elemento (`el.id === id`); elemento ausente entra como
    `{ id, properties }`; `doc` substitui/acrescenta em `docs`. Ids em `removedIds` são ignorados. `delta` nulo com
    edições → `{ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'gui' }, summary: 'Edições feitas na tela' }`
    mais as edições. Sem edições → o próprio `delta`.
  - `screenConflicts(delta, edits, kept): { id, field, mine, theirs }[]`: o agente propõe para o mesmo nó e campo um
    valor diferente do editado, e esse valor não está em `kept` para aquele nó e campo.
  - `screenAnswers(plan, edits): Record<string, 'take'>`: chaves de perguntas abertas que uma edição já responde:
    `el:<id>:properties.<k>` e `doc:<id>:<hash>`.
  - `applyEdit(draft, edit): draft` com `edit` sendo um de:
    `{ op: 'properties', id, properties }` (substitui as propriedades editadas do nó; valor igual ao da base sai da
    camada), `{ op: 'doc', id, text }`, `{ op: 'undo', id }` (apaga `edits[id]` e os `kept` do nó),
    `{ op: 'resolve', id, field, choice: 'mine' | 'theirs' }` (`mine` acrescenta `{ id, field, value: theirs }` a `kept`;
    `theirs` tira o campo de `edits[id]`).
  - `originOf(edits, id, field?): 'tela' | 'chat'`.
- Produces (em `draft.mjs`): rascunho com `edits: {}` e `kept: []` (opcionais ao ler); `replanDraft` planeja
  `composeDelta(...)`, depois replaneja com `screenAnswers` somadas às respostas; `draftOpsHash(draft): string | null`
  (`null` se `screenConflicts` não for vazio, senão `opsHashOf(draft.plan)`).

- [ ] **Step 1: Write the failing tests**

`edits.test.mjs`:

```js
test('composeDelta sobrepõe a propriedade editada à do agente', () => {
  const delta = { 'archlens-delta': '1.0', model: { elements: [{ id: 'loja', properties: { criticidade: 'alta', x: '1' } }] } };
  const out = composeDelta(delta, { loja: { properties: { criticidade: 'média' } } }, new Set());
  assert.deepEqual(out.model.elements[0].properties, { criticidade: 'média', x: '1' });
});
test('composeDelta sem delta cria um com source gui', …);           // summary 'Edições feitas na tela'
test('composeDelta ignora nó removido pelo delta', …);              // Review Focus 1
test('screenConflicts acusa valor diferente do agente e respeita kept', …);
test('applyEdit resolve mine grava kept; theirs tira o campo', …);
test('applyEdit undo apaga edits e kept do nó', …);
test('checkEdits recusa chave só com espaços e aceita "a.b"', …);  // Review Focus 3
```

`draft.test.mjs` (sobre `examples/loja-online`, nó `loja` com `criticidade: 'alta'`):

```js
test('edição da tela em propriedade com valor na base não abre pergunta', () => withBase(ctx => {
  const d = { ...newDraft(ctx), edits: { loja: { properties: { criticidade: 'média' } } } };
  const { draft } = replanDraft(ctx, d);
  assert.equal(openQuestions(draft.plan).length, 0);
  assert.ok(draftOpsHash(draft));
}));
test('remover propriedade pela tela vira take', …);
test('conflito chat × tela deixa draftOpsHash nulo até resolver', …);
test('rascunho sem edits e kept abre normalmente', …);              // Review Focus 2
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test apps/gui/server/edits.test.mjs apps/gui/server/draft.test.mjs`
Expected: FAIL (`edits.mjs` não existe).

- [ ] **Step 3: Implement `edits.mjs` and wire `draft.mjs`**

`removedIds`: os ids que o delta do agente remove (`ops` de remoção) — calcule no `replanDraft` a partir do primeiro
plano. `screenAnswers` olha `openQuestions(plan)`: `key === \`el:${id}:properties.${k}\`` para cada `k` editado, e
`key.startsWith(\`doc:${id}:\`)` quando há `doc` editado. `checkDraft` aceita `edits`/`kept` ausentes e valida com
`checkEdits`. O tamanho do rascunho (`draftBytes`) conta as edições.

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix apps/gui run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui/server
git commit -m "feat(gui): edições da tela como camada própria do rascunho"
```

---

### Task 3: servidor — rotas, prévia com origem e o agente vendo as edições

**Files:**
- Modify: `apps/gui/server/plan/routes.mjs`, `apps/gui/server/plan/preview.mjs`, `apps/gui/server/plan/agent.mjs`,
  `apps/gui/server/plan/system-prompt.md`
- Modify: `apps/gui/web/src/api.ts` (tipos e chamadas)
- Test: `apps/gui/server/plan-routes.test.mjs`, `apps/gui/server/plan-apply.test.mjs`, `apps/gui/server/plan-agent.test.mjs`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `POST /api/bases/:b/plan/edit` `{ draft, edit }` → `{ draft, opsHash, screenConflicts }`. Erro de validação: 400
    com a mensagem de `checkEdits`/núcleo (marcadores na doc, nó inexistente).
  - `POST /api/bases/:b/plan/element` `{ draft, id }` → `{ card, doc: string | null, docs: boolean, removed: boolean }`:
    o cartão do nó sobre o modelo da prévia (`query(..., { element: id, format: 'json' })` sobre `p.raw`, com
    `labelsOf`), `doc` = texto do delta composto para o nó, senão `ctx.readDoc(id)` (com `plainWikilinks`).
  - `/plan`, `/plan/open`, `/plan/preview` e o 409 do `/plan/apply` passam a usar `draftOpsHash` e a devolver
    `screenConflicts`.
  - `deltaList`: a mudança `properties` vira um campo por chave (`properties.<k>`, `before`/`after`, `'—'` quando
    ausente); `PreviewField.origin: 'tela' | 'chat'`; `PreviewChange.origin: 'tela' | 'chat' | 'ambos'`;
    item `kind: 'doc'` ganha `origin` e `lines: { added: number, removed: number }`.
  - `draftState` (agent.mjs) acrescenta `edições feitas na tela (não refaça nem contradiga sem perguntar): <id>:
    properties.<k> = <v>; <id>: documentação (<n> linhas)`; `system-prompt.md` explica que essas edições são do
    usuário e que propor outro valor abre um aviso para ele.
  - `api.ts`: `planEdit(base, draft, edit)`, `planElement(base, draft, id)`, tipos `ScreenEdit`, `ScreenConflict`,
    `PlanElement`; `screenConflicts` em `PlanPreviewResult` e nas respostas de `planOpen`/`planTurn`.

- [ ] **Step 1: Write the failing tests**

```js
test('/plan/edit grava propriedade e devolve opsHash', …);
test('/plan/edit recusa documentação com marcador do archlens', …);   // 400, mensagem do núcleo
test('/plan/element mostra nó proposto pelo chat e removed para nó removido', …);
test('/plan/apply responde 409 enquanto houver screenConflicts', …);
test('deltaList separa properties por chave e marca a origem', …);   // inclui chave "a.b" (Review Focus 3)
test('draftState lista as edições da tela', …);
test('set_delta do agente que não cita o nó editado mantém draft.edits', …); // critério 5 da spec
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix apps/gui run test:server`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

`/plan/edit`: `checkDraft` → `applyEdit` → `replan` → resposta. O agente não ganha campo de motivo neste trabalho; o aviso
mostra só os valores (spec: motivo opcional).

- [ ] **Step 4: Regenerate prompt and run**

Run: `npm --prefix apps/gui run prompt && npm --prefix apps/gui run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui
git commit -m "feat(gui): rotas de edição e do nó no Planejar, origem no delta e edições no contexto do agente"
```

---

### Task 4: web — painel do nó redesenhado (leitura)

**Files:**
- Create: `apps/gui/web/src/NodeCard.tsx` (cartão recolhível), `apps/gui/web/src/layer-colors.test.ts`
- Modify: `apps/gui/web/src/Details.tsx`, `apps/gui/web/src/DocTab.tsx`, `apps/gui/web/src/styles.css`, `apps/gui/server/app.mjs` (só se faltar `layer`)
- Test: `apps/gui/web/src/Details.test.tsx`, `apps/gui/web/src/NodeCard.test.tsx`, `apps/gui/web/src/DocTab.test.tsx`

**Interfaces:**
- Produces:
  - `NodeCard({ id: string, title: string, count?: number, actions?: ReactNode, badge?: ReactNode, defaultOpen?: boolean, children })`:
    estado aberto/fechado em `useStoredState<Record<string, boolean>>('archlens-node-cards', {})`, por `id` do cartão.
  - `Details` ganha `layer?: string` (para a cor; do `viewNode.layer` ou do cartão) e `slots?: { properties?: ReactNode; doc?: ReactNode }`
    para o Planejar trocar o conteúdo pelos editores. Sem slots, mostra leitura.
  - `DocTab` passa a aceitar `text?: string | null` (quando dado, não busca) e `max?: boolean` (corta e mostra
    "Expandir" e "Tela cheia").
  - CSS: classes `.np-head`, `.np-card`, variáveis de camada em `:root` e `:root[data-theme="dark"]`.

- [ ] **Step 1: Write the failing tests**

```ts
it('cabeçalho usa a cor da camada', …);              // style/var --app no .np-head para layer 'application'
it('cartões na ordem da spec', …);                  // títulos: Propriedades, Documentação, Nesta visão, Relações na visão, Na base, Filhos, Fontes e rodadas
it('lista com 14 relações mostra 5 e "Mostrar mais 9"', …);
it('cartão recolhido continua recolhido ao trocar de nó', …);
it('base JSON: sem cartão Documentação', …);        // docsEnabled false
it('documentação só é buscada com o cartão aberto', …);
```

`layer-colors.test.ts`: lê `scripts/lib/render.mjs` e `styles.css`, e compara `--biz … --oth-s` nos dois temas.

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix apps/gui run test:web -- Details NodeCard DocTab layer-colors`
Expected: FAIL.

- [ ] **Step 3: Implement**

Tira as abas Detalhes/Documentação; o `DocTab` vira o conteúdo do cartão Documentação. O texto do cabeçalho usa `--ink`
(as cores de camada já são claras no tema claro e escuras no escuro). A camada vem de `viewNode.layer`; sem ele, do
cartão: se `labelsOf` (`apps/gui/server/app.mjs`) ainda não manda `layer`, acrescente-o lá a partir de `ELEMENT_TYPES`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix apps/gui run test:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui/web/src
git commit -m "feat(gui): painel do nó em cartões recolhíveis com a cor da camada"
```

---

### Task 5: web — aba Nó no Planejar

**Files:**
- Create: `apps/gui/web/src/plan/NodePanel.tsx`
- Modify: `apps/gui/web/src/plan/PlanView.tsx`, `apps/gui/web/src/styles.css`
- Test: `apps/gui/web/src/plan/NodePanel.test.tsx`, `apps/gui/web/src/App.plan.test.tsx`

**Interfaces:**
- Consumes: `planElement` (Task 3), `Details` com `slots` (Task 4).
- Produces: `NodePanel({ base, draft, id, onDraft: (draft: Draft, opsHash: string | null, conflicts: ScreenConflict[]) => void })`;
  em `PlanView`, o painel direito tem `role="tablist"` com **Delta (n)** e **Nó**; trilho com botões Δ e Nó; selecionar
  na prévia ou clicar no nome no Delta muda para Nó. Aba guardada em `useStoredState('archlens-plan-tab', 'delta')`.

- [ ] **Step 1: Write the failing tests**

```ts
it('clicar num nó da prévia abre a aba Nó com o cartão do planElement', …);
it('clicar no nome de um item do Delta abre a aba Nó', …);
it('nó removido pelo rascunho aparece sem Editar', …);
it('aba Delta mostra a contagem de mudanças', …);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix apps/gui run test:web -- NodePanel App.plan`
Expected: FAIL.

- [ ] **Step 3: Implement**

`NodePanel` recarrega `planElement` quando `id` ou o rascunho mudam (descarte de resposta atrasada como o `DocTab`).

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix apps/gui run test:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui/web/src
git commit -m "feat(gui): aba Nó ao lado do Delta no Planejar"
```

---

### Task 6: web — editores de propriedades e documentação

**Files:**
- Create: `apps/gui/web/src/plan/PropsEditor.tsx`, `apps/gui/web/src/plan/DocEditor.tsx`
- Modify: `apps/gui/web/src/plan/NodePanel.tsx`, `apps/gui/web/src/styles.css`
- Test: `apps/gui/web/src/plan/PropsEditor.test.tsx`, `apps/gui/web/src/plan/DocEditor.test.tsx`, `NodePanel.test.tsx`

**Interfaces:**
- Consumes: `planEdit` (Task 3), slots do `Details` (Task 4).
- Produces:
  - `PropsEditor({ base: Record<string, PropValue>, value: Record<string, PropValue>, onConfirm: (props: Record<string, PropValue | null>) => void, onCancel })`
    — linhas chave/valor, × remove (fica riscada até confirmar), "+ Adicionar propriedade"; destaque alterada
    (`--warn-bg`), nova (verde, `.np-add`), removida (riscada). Confirmar desabilitado com chave vazia ou repetida.
  - `parsePropValue(text: string, original: PropValue | undefined): PropValue` (exportada): lista se a original era
    lista (split por vírgula, trim); número/booleano se a original era desse tipo e o texto converte; senão texto.
  - `DocEditor({ text: string, onConfirm: (text: string) => void, onCancel })` — abas Escrever/Prévia, `textarea` com
    `resize: vertical`, botão **Tela cheia** que abre um diálogo (`role="dialog"`) com Escrever e Prévia lado a lado e
    o mesmo texto; esvaziar e confirmar pede `window.confirm('Apagar a documentação deste nó?')`.
  - Botão **✎ Editar** no título dos cartões Propriedades e Documentação (só no Planejar e em nó não removido); estado
    vazio da documentação no Planejar oferece **Escrever**.
  - Trocar de nó (ou de aba) com editor sujo pede `window.confirm('Descartar a edição não confirmada?')`.

- [ ] **Step 1: Write the failing tests**

```ts
it('parsePropValue mantém número, booleano e lista', () => {
  expect(parsePropValue('3', 2)).toBe(3);
  expect(parsePropValue('x', 2)).toBe('x');
  expect(parsePropValue('true', false)).toBe(true);
  expect(parsePropValue('a, b', ['z'])).toEqual(['a', 'b']);
  expect(parsePropValue('7', undefined)).toBe('7');
});
it('alterar, adicionar e remover e Confirmar chama planEdit com { op: "properties" } e null na removida', …);
it('chave repetida desabilita Confirmar', …);
it('DocEditor: tela cheia mantém o texto e Confirmar chama planEdit com { op: "doc" }', …);
it('esvaziar a documentação pede confirmação', …);
it('trocar de nó com texto não confirmado pede confirmação', …);        // Review Focus 4
it('erro 400 do planEdit aparece no cartão e o editor continua aberto', …);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix apps/gui run test:web -- PropsEditor DocEditor NodePanel`
Expected: FAIL.

- [ ] **Step 3: Implement**

Depois do `planEdit`, `NodePanel` chama `onDraft(draft, opsHash, screenConflicts)`; o `PlanView` faz `commit` (que já
salva no `draftStore`).

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix apps/gui run test:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui/web/src
git commit -m "feat(gui): editar propriedades e documentação do nó no Planejar"
```

---

### Task 7: web — Delta com origem e desfazer, e o aviso de conflito

**Files:**
- Create: `apps/gui/web/src/plan/ScreenConflictDialog.tsx`
- Modify: `apps/gui/web/src/plan/DeltaPanel.tsx`, `apps/gui/web/src/plan/PlanView.tsx`, `apps/gui/web/src/styles.css`
- Test: `apps/gui/web/src/plan/DeltaPanel.test.tsx`, `apps/gui/web/src/plan/ScreenConflictDialog.test.tsx`, `App.plan.test.tsx`

**Interfaces:**
- Consumes: `origin`, `lines`, campos por chave (Task 3); `planEdit` com `undo` e `resolve`.
- Produces:
  - `DeltaPanel` ganha `onUndo?: (id: string) => void`: selo **chat**/**tela**/os dois por mudança, origem por campo,
    **↶ desfazer** só em mudança com origem `tela` ou `ambos`; propriedade com `after === '—'` aparece riscada; doc
    aparece como `+<added> −<removed> linhas · ver diferença`, que expande o `diff` atual.
  - `ScreenConflictDialog({ conflict: ScreenConflict, nodeName: string, onChoose: (choice: 'mine' | 'theirs') => void })`:
    título "O chat quer mudar algo que você editou", opções **Manter o seu** (padrão) e **Usar o do chat**, botão
    **Confirmar**.
  - `PlanView`: mostra o diálogo para o primeiro de `screenConflicts`; `reason` do Aplicar fica
    `'O chat quer mudar algo que você editou; responda o aviso antes de aplicar'` enquanto houver conflito.

- [ ] **Step 1: Write the failing tests**

```ts
it('mostra selos de origem e desfazer só nas mudanças da tela', …);
it('desfazer chama planEdit com { op: "undo", id }', …);
it('documentação resumida em linhas até ver diferença', …);   // com texto de 100 KB (Review Focus 5)
it('propriedade removida aparece riscada', …);
it('conflito: Manter o seu chama resolve mine; Usar o do chat chama resolve theirs', …);
it('Aplicar fica desabilitado com conflito pendente', …);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix apps/gui run test:web -- DeltaPanel ScreenConflictDialog App.plan`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix apps/gui run test:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui/web/src
git commit -m "feat(gui): origem e desfazer no Delta e aviso de conflito com o chat"
```

---

### Task 8: fechamento — documentação, archlens-ask e verificação completa

**Files:**
- Modify: `README.md` (seção "Planejar pela GUI": aba Nó, editar propriedades e documentação, origem no Delta),
  `CHANGELOG.md`
- Check: `portable/archlens-ask/` (a Task 1 tocou formato do delta; confira se `INSTRUCTIONS.md`/`RULES.md` falam de
  remover propriedade — o archlens-ask só consulta, então o esperado é "sem impacto" além dos gerados)

- [ ] **Step 1: Atualize README e CHANGELOG**

- [ ] **Step 2: Rode tudo**

Run: `npm test && npm run gui:test && npm run check-ask`
Expected: PASS nos três.

- [ ] **Step 3: Verificação na GUI real**

Abra a GUI com `examples/loja-online-vault` e percorra os critérios 1 a 7 da spec, nos temas claro e escuro.
Registre o que não bater.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md portable
git commit -m "docs: painel do nó e edição no Planejar"
```
