# Documentação do nó: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada nó passa a ter `properties` filtráveis e visíveis, e documentação em markdown legível em todas as saídas e escrita pela GUI, pela skill ou direto no vault.

**Architecture:** O texto segue depois de `<!-- archlens:end -->`. Os conectores markdown e gbrain passam a expô-lo em `read().docs` (fora de `raw`), e uma operação nova `putDoc` o grava. O delta ganha `docs`, e trocar texto existente vira pergunta cuja chave leva o hash do texto visto, o que reabre a pergunta se ele mudar.

**Tech Stack:** Node ≥ 18 ESM, `node:test`, React 18 + Vitest na GUI, playwright-core no e2e, markdown-it (já na GUI; vendorizado no núcleo por este plano).

**Spec:** `docs/superpowers/specs/2026-11-04-documentacao-do-no-design.md`

## Global Constraints

- O formato da página não muda: o texto continua depois de `<!-- archlens:end -->`.
- Só vault e gbrain: base JSON recusa com erro claro (`E_STORE_DOC`), citando `store convert`.
- A documentação nunca entra em `raw`, em `viewData`, na rota do cartão nem na de visão.
- Nada do texto da pessoa vira HTML ativo: `markdown-it` sempre com `html: false`.
- Trabalhe num worktree a partir de `develop-v2`: a árvore principal tem mudanças não commitadas em `examples/loja-online/` e arquivos soltos em `examples/loja-online-vault/` (`.obsidian/`, `*.canvas`), que nenhum commit pode levar. Use `git add` com caminhos explícitos.
- Sentido único: não mude CLI, skills ou `references/` para acomodar o `archlens-ask`.
- Textos para o usuário em português. Comentários de código em inglês, como no núcleo.
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Depois de cada task com código: `graphify update .`.

## Review Focus

1. Duas pessoas no mesmo nó: texto editado no Obsidian enquanto o plano está em revisão, na GUI e na skill, inclusive quando o nó estava vazio ao planejar. Espera-se recusa, sem perda. Testes nas Tasks 4 e 8.
2. Texto com título `#`, cerca de código ou `<script>` no `ARCHITECTURE.md` e no HTML: não pode quebrar a hierarquia nem o `<script>` de dados do HTML. Testes nas Tasks 5 e 6.
3. Trocar de nó rápido com a aba aberta: a resposta atrasada do nó anterior não pode aparecer no nó atual. Teste na Task 7.
4. Valor de filtro com caixa ou espaços diferentes (`checkout`, `Checkout `) e propriedade em lista: deve casar. Teste na Task 2.
5. `diffRaw` chamado por quem não conhece `docs` (conversão, `writeNotes`, testes): não pode apagar textos. Teste na Task 3.

---

### Task 1: `properties` no painel Detalhes e no `ARCHITECTURE.md`

**Files:**
- Modify: `apps/gui/web/src/Details.tsx`, `apps/gui/web/src/Details.test.tsx`
- Modify: `scripts/lib/doc.mjs`, `tests/doc.test.mjs`
- Regenerate: `ARCHITECTURE.md` dos exemplos com `properties`

**Interfaces:**
- Produces: seção `## Propriedades` em `generateDoc`, antes de `## Fontes`.

- [ ] **Step 1: Write the failing tests**

`Details.test.tsx`, "mostra as propriedades do cartão": cartão com `properties: { squad: 'Checkout', canais: ['web', 'app'] }` exibe `squad`, `Checkout` e `web, app`. Sem `properties`, não há rótulo "Propriedades".

`doc.test.mjs`, "propriedades numa seção própria": modelo com `properties: { squad: 'Checkout' }` gera `## Propriedades` antes de `## Fontes`, com a linha `| Checkout API | squad | Checkout |` (nome do elemento do fixture); sem nenhuma propriedade, a seção não existe.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/doc.test.mjs` e `npm --prefix apps/gui run test:web -- Details`
Expected: FAIL nos dois testes novos.

- [ ] **Step 3: Implement**

`Details.tsx`: `<h3>Propriedades</h3>` com `<dl>` depois do `<dl>` de identidade; lista vira `join(', ')`, outros valores `String(v)`. `doc.mjs`: tabela `['Elemento', 'Propriedade', 'Valor']`, uma linha por par, ordenada por nome do elemento e chave.

- [ ] **Step 4: Run to verify they pass, regenerate and commit**

Run: `npm run examples && npm test && npm run gui:test`
Expected: PASS.

```bash
git add apps/gui/web/src/Details.tsx apps/gui/web/src/Details.test.tsx scripts/lib/doc.mjs tests/doc.test.mjs examples/
git commit -m "feat: properties no painel Detalhes e no ARCHITECTURE.md"
```

---

### Task 2: filtro de visão por propriedade (`where`)

**Files:**
- Create: `scripts/lib/query-where.mjs`, `tests/query-where.test.mjs`
- Modify: `scripts/lib/query-c4.mjs:176-179`, `scripts/lib/query-archimate.mjs:82-86`, `scripts/lib/query-md.mjs:21-37`, `scripts/lib/build.mjs:36`, `scripts/gen-schemas.mjs`, `apps/gui/server/ask/tools.mjs:81`
- Regenerate: `schemas/view.schema.json` (`npm run schemas`)
- Docs: `references/views.md`, `portable/archlens-ask/` (`npm run ask`, `RULES.md`, `EXAMPLES.md`), prompts da GUI (`npm --prefix apps/gui run prompt`)

**Interfaces:**
- Produces, em `query-where.mjs`:
  - `whereSpec(spec) -> Record<string, string[]> | null`: normaliza; lança `viewError('E_VIEW_WHERE', …)` se `where` não for objeto não vazio de texto, número, booleano ou lista desses.
  - `matchesWhere(el, where) -> boolean`: todas as chaves casam (E); dentro de uma chave, qualquer valor (OU). Compara `String(v).trim().toLowerCase()`. Propriedade em lista casa se algum item casar. Sem herança.
  - `cutByWhere(model, where, nodeIds, { include = [] }) -> { kept: Set<string>, results: Set<string> }`: `results` são os nós de `nodeIds` que casam mais `include` presentes; `kept` soma os ancestrais (`parent`) de `results` que estão em `nodeIds`.
- Produces na visão resolvida: `view.whereResults: string[]` (só com `where`) e `view.whereIgnored: true` (dinâmica).
- Spec de visão: `"where": { "squad": "Checkout", "canais": ["web", "app"] }`.

- [ ] **Step 1: Write the failing tests**

`tests/query-where.test.mjs`, com o fixture `shop.json` acrescido de `properties`:

```js
test('filtra sem herança: o valor do sistema não vale para os containers', () => { /* container view: scope sem squad, container com squad */
  assert.deepEqual([...view.whereResults].sort(), ['loja.api']);
});
test('o ancestral entra como moldura e não conta como resultado', …);
test('depth não traz vizinhos sem o valor', …);
test('include vence o filtro', …);
test('caixa, espaços e lista casam', () => {
  assert.equal(matchesWhere({ properties: { squad: ' Checkout ' } }, { squad: ['checkout'] }), true);
  assert.equal(matchesWhere({ properties: { canais: ['web', 'app'] } }, { canais: ['APP'] }), true);
});
test('escopo e âncora sem o valor saem, sem quebrar a visão', …); // C4 context e archimate com anchor
test('visão dinâmica ignora e avisa', …); // whereIgnored; nota em viewAnswer
test('resultado vazio não é erro', () => { assert.match(formatViewAnswer(viewAnswer(model, spec)), /Nenhum nó tem/); });
test('where inválido recusa com E_VIEW_WHERE', …);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/query-where.test.mjs`
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implement `query-where.mjs` e ligue nas projeções**

C4: logo depois de `cutByGroups`, fora de `dynamic`. A fronteira do escopo só fica se restar nó interno. ArchiMate: depois do bloco de `gs.only`; com a âncora fora de `kept`, `role` e `distance` seguem calculados a partir dela, sem desenhá-la. `viewAnswer`: nota `Nenhum nó tem esse valor em "where".` para `whereResults` vazio, `A visão dinâmica ignora "where".` para `whereIgnored`, e `sections` marca as linhas fora de `whereResults` com `(moldura)`. `tryViewTool`: com `spec.where` e visão vazia, devolve `ok` e `nenhum nó tem esse valor`. `renderViews`: já avisa e pula visão vazia; nada a mudar além de conferir.

- [ ] **Step 4: Documente, regenere e rode tudo**

`references/views.md`: seção `where` com a semântica da spec. Run: `npm run schemas && npm run ask && npm --prefix apps/gui run prompt && npm test && npm run gui:test && npm run check-ask`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib schemas references portable apps/gui/server tests/query-where.test.mjs
git commit -m "feat: filtro de visão por valor de propriedade (where)"
```

---

### Task 3: conectores leem e gravam a documentação (`putDoc`)

**Files:**
- Create: `scripts/lib/node-doc.mjs`, `tests/node-doc.test.mjs`
- Modify: `scripts/lib/store/ops.mjs`, `store/versions.mjs`, `store/contract.mjs`, `store/markdown.mjs`, `store/markdown-page.mjs`, `store/gbrain-git.mjs`, `store/gbrain-mcp.mjs`
- Test: `tests/markdown-store.test.mjs`, `tests/ops.test.mjs`, `tests/versions.test.mjs`, `tests/gbrain-git.test.mjs`, `tests/gbrain-mcp.test.mjs`, `tests/store-contract.test.mjs`
- Regenerate: `schemas/plan.schema.json` (`npm run schemas`; o enum vem de `OPS`)

**Interfaces:**
- Produces, em `node-doc.mjs`:
  - `docHash(text: string) -> string`: `sha256:` do texto com `trim()`.
  - `checkDocText(text, id) -> void`: lança `E_DELTA_DOC` se contiver `BEGIN` ou `END`.
  - `docOfUserText(userText) -> string`: `trim()`. `userTextOfDoc(text) -> string`: `'\n'` se vazio, senão `\n\n${text.trim()}\n`.
- Produces no conector: `supportsDocs: boolean`; `read() -> { raw, notes, docs? }`, com `docs: Record<id, text>` só de textos não vazios; `readDoc(id) -> string | null`. `fileConnector` recebe `docs: true` e expõe os dois.
- Produces em `ops.mjs`:
  - op `{ op: 'putDoc', id: string, text: string }`; `applyOps` devolve também `docs` (estado final) e `docChanges` (id → texto, só desta aplicação).
  - `diffRaw(before, after)` emite `putDoc` **apenas** se `after.docs !== undefined`, para cada id cujo texto difere de `before.docs` (ausente = `''`).
- Produces em `versions.mjs`: ref `doc:<id>`; `writeSetOf` a acrescenta para `putDoc`; `objectVersionsOf` devolve `docHash` do texto, ou `null` sem texto. `doc:` **não** entra para `upsertElement`.
- `contentVersion` não muda: a documentação fica fora da versão da base.

- [ ] **Step 1: Write the failing tests**

`markdown-store.test.mjs`:

```js
test('read expõe a documentação fora de raw', () => { /* página com texto depois do bloco */
  assert.equal(c.read().docs['loja.api.checkout'], 'Texto');
  assert.ok(!JSON.stringify(c.read().raw).includes('Texto'));
  assert.equal(c.readDoc('loja.api.checkout'), 'Texto');
});
test('putDoc grava só o trecho liberado', () => { /* frontmatter e bloco idênticos byte a byte */ });
test('putDoc com texto vazio limpa o trecho', …);
test('editar um campo preserva o texto', …);
test('putDoc com marcador recusa', …);
```

`ops.test.mjs`: "diffRaw sem docs não mexe na documentação" (`after` sem `docs` não gera `putDoc`, Review Focus 5); "putDoc de elemento inexistente recusa". `versions.test.mjs`: `writeSetOf([{ op: 'upsertElement', … }])` não contém `doc:x`; `doc:x` muda com o texto e não muda `element:x`. `gbrain-git.test.mjs` e `gbrain-mcp.test.mjs`: `putDoc` escreve a página e `read().docs` o devolve; no MCP, `doc:<id>` usa a revisão da página do elemento. `store-contract.test.mjs`: conector JSON tem `supportsDocs === false` e `putDoc` recusa com `E_STORE_DOC`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/markdown-store.test.mjs tests/ops.test.mjs tests/versions.test.mjs tests/store-contract.test.mjs tests/gbrain-git.test.mjs tests/gbrain-mcp.test.mjs`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

`readVaultFiles` devolve `docs` a partir de `pages`. `vaultFiles` lê `docChanges` do primeiro argumento: `userText: id in docChanges ? userTextOfDoc(docChanges[id]) : old.get(id)?.userText`. Em `gbrain-git.mjs:155` e `gbrain-mcp.mjs:138`, `read` inclui `docs: base.docs`. `pageOf` do MCP trata `doc:<id>` como `element:<id>`. `applyOps` recusa `putDoc` de id fora de `elements` e, no conector sem `supportsDocs`, `fileConnector.apply` recusa com `storeError('E_STORE_DOC', …)`. `E_STORE_DOC` nasce em `errors.mjs` com a frase: `documentação do nó exige uma base markdown ou gbrain; converta com "archlens store convert"`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run schemas && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib schemas tests
git commit -m "feat(store): documentação do nó em read().docs e operação putDoc"
```

---

### Task 4: delta, plano e revisão da documentação

**Files:**
- Modify: `scripts/lib/merge.mjs`, `scripts/lib/api.mjs`, `scripts/lib/merge-report.mjs`, `scripts/lib/plan-report.mjs`, `scripts/lib/node-doc.mjs`, `scripts/gen-schemas.mjs`
- Regenerate: `schemas/delta.schema.json`, `schemas/plan.schema.json`, `schemas/model.schema.json`
- Test: `tests/merge.test.mjs`, `tests/api.test.mjs`, `tests/plan-report.test.mjs`

**Interfaces:**
- Consumes: `read().docs`, `putDoc`, `doc:<id>`, `docHash`, `checkDocText` (Task 3).
- Produces:
  - Delta: `"docs": [{ "id": "loja.api", "text": "…" }]`, com `text: ""` para limpar.
  - `planMerge`, `previewMerge` e `applyPlan` recebem `docs` (id → texto da base).
  - Itens, `kind: 'doc'`, `field: 'doc'`, `target: <id final>`, `base`, `delta`:
    - texto igual: `class: 'unchanged'`, chave `doc:<id>`;
    - base vazia e texto novo: `class: 'enrich'`, chave `doc:<id>`, sem pergunta;
    - base com texto: `class: 'conflict'`, chave `doc:<id>:<12 primeiros hex de docHash(base)>`, respostas válidas só `keep | take`.
  - `applyPlan` devolve `docs` (estado final); a rodada ganha `docs: string[]`; um plano só de documentação tem `entry`.
  - `lineDiff(before, after) -> { sign: ' ' | '-' | '+', line: string }[]` em `node-doc.mjs` (LCS por linha).

- [ ] **Step 1: Write the failing tests**

`api.test.mjs`, sobre um vault temporário (helper de `markdown-store.test.mjs`):

```js
test('nó sem texto: plano final direto, grava e registra na rodada', () => {
  assert.equal(plan.state, 'final');
  assert.deepEqual(res.entry.docs, ['loja.api']);
});
test('trocar texto existente abre pergunta com a diferença', () => {
  assert.equal(plan.state, 'open');
  assert.equal(openQuestions(plan)[0].key, `doc:loja.api:${docHash('A').slice(7, 19)}`);
});
test('keep não grava; take grava', …);
test('limpar é explícito e conta como troca', …);
test('edição depois do plano final recusa com E_STORE_CONFLICT e preserva o texto', …);
test('nó vazio ao planejar e preenchido depois também recusa', …); // Review Focus 1
test('resposta antiga não vale para texto que mudou: replanejar reabre a pergunta', …);
test('plano que só muda campo do nó aplica depois de edição direta e mantém o texto', …);
test('base JSON recusa delta com docs com E_STORE_DOC', …);
test('id desconhecido, elemento sendo removido e marcador recusam com E_DELTA_DOC', …);
test('documentação de elemento novo do mesmo delta', …);
```

`plan-report.test.mjs`: o relatório da pergunta mostra as linhas `- antigo` e `+ novo`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/api.test.mjs tests/merge.test.mjs tests/plan-report.test.mjs`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

`mergeDocs(ctx)` em `runMerge`, depois das `ops` do delta, com a mesma resolução de id delas. Na decisão, use o `decide` existente; `validResolution` aceita só `keep | take` em `kind: 'doc'`. Em `applyPlan`, o atalho sem mudança (`merge.mjs:90`) só vale se também não houver documentação alterada. `api.plan` e `api.preview`: `delta.docs?.length && !store.supportsDocs` lança `E_STORE_DOC`; passe `loaded.docs` adiante. `finish`: `diffRaw(…, { raw: res.raw, notes: loaded.notes, docs: res.docs })`. `describeItem`: `documentação de <id>: o texto existente será trocado  → keep | take`. `formatPlanReport` e `reportData` trazem `lineDiff`, e `reportData` lista `docs` do plano.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run schemas && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib schemas tests
git commit -m "feat(plan): documentação do nó no delta, com pergunta e diferença ao trocar texto"
```

---

### Task 5: `ARCHITECTURE.md`, `archlens check` e markdown no núcleo

**Files:**
- Create: `scripts/vendor/markdown-it.min.cjs`, `scripts/vendor/MARKDOWN-IT-LICENSE`
- Modify: `package.json` (script `vendor-markdown-it`), `scripts/lib/node-doc.mjs`, `scripts/lib/doc.mjs`, `scripts/lib/apply-flow.mjs`, `scripts/archlens.mjs:136-140,470-476,535-543,685-700`
- Test: `tests/node-doc.test.mjs`, `tests/doc.test.mjs`, `tests/cli.test.mjs`

**Interfaces:**
- Produces, em `node-doc.mjs`:
  - `plainWikilinks(text) -> string`: `[[a/b|Nome]]` vira `Nome`, `[[a/b]]` vira `b`.
  - `demoteHeadings(text, by) -> string`: rebaixa `#` fora de cercas de código, até `######`.
  - `docToHtml(text) -> string`: `markdown-it` 14.3.3 com `html: false`, sobre `plainWikilinks`; links com `target="_blank" rel="noopener noreferrer"`.
- Produces: `generateDoc(raw, { notes, source, docs })`; `writeDocument(store, raw, notes, { docs, out, replacing })`.

- [ ] **Step 1: Write the failing tests**

`node-doc.test.mjs`: "docToHtml não deixa HTML ativo" (`<script>` sai escapado e `[x](javascript:alert(1))` não vira link); "wikilink aparece legível"; "demoteHeadings respeita cerca de código".

`doc.test.mjs`: "seção de documentação depois de Propriedades, só com nós com texto", com `### Nome (`id`)`; um `# Título` no texto vira `#### Título`; sem `docs`, a seção não existe.

`cli.test.mjs`: num vault, editar o texto de uma página faz `archlens check` sair com 1 e a saída casar `/rode "archlens build"/`, sem `editado à mão`; depois de `archlens build`, sai com 0.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/node-doc.test.mjs tests/doc.test.mjs tests/cli.test.mjs`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

Copie `apps/gui/node_modules/markdown-it/dist/markdown-it.min.js` para `scripts/vendor/markdown-it.min.cjs` e a licença; o script `vendor-markdown-it` repete a cópia. Carregue com `createRequire(import.meta.url)`, porque o pacote é `type: module`. `doc.mjs`: `## Documentação dos nós` depois de `## Propriedades`, ordenada por nome, com `demoteHeadings(text, 3)` e `plainWikilinks`. `documentStored` e os comandos `doc`, `build` e `check` passam `docs`. Mensagem nova de `check`: `✗ <doc> desatualizado: rode "archlens build" (a base, a documentação de um nó ou as notas mudaram, ou o arquivo foi editado à mão).`

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json tests
git commit -m "feat: documentação dos nós no ARCHITECTURE.md e check indicando archlens build"
```

---

### Task 6: aba Documentação no HTML gerado

**Files:**
- Modify: `scripts/lib/render.mjs:366-368,407,574+,960-985`, `scripts/lib/build.mjs:23,44,52,80`
- Test: `tests/render.test.mjs`

**Interfaces:**
- Consumes: `docToHtml` (Task 5), `store.read().docs`.
- Produces: `renderHtml({ …, docs })`, com `docs: Record<id, safeHtml>` em `DATA.docs`, uma vez por nó, só dos nós presentes em alguma visão. `renderViews(raw, specs, { title, preview, docs })` recebe os textos e chama `docToHtml`. `embed` e `preview` nunca levam `docs`.

- [ ] **Step 1: Write the failing tests**

`render.test.mjs`:

```js
test('a documentação vai uma vez por nó, mesmo em várias visões', () => {
  assert.equal(html.split('marcador-unico').length - 1, 1);
});
test('embed não leva a documentação', …);
test('</script> no texto não fecha o bloco de dados', …); // Review Focus 2
test('nó fora das visões não entra', …);
test('nó sem texto não ganha aba', …); // o script monta abas só com DATA.docs[id]
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/render.test.mjs`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

No painel, com `DATA.docs?.[id]`, o `.drawer-body` ganha abas `Detalhes` e `Documentação`; o HTML do texto só entra no DOM no primeiro clique. Mantenha o primeiro `:root {` como bloco de tema, porque `gen-ask.mjs` lê esse trecho. `buildDiagrams` e `deliverHtml` passam `store.read()?.docs`; `deliverHtml` recebe `docs` como opção.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test && npm run check-ask`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib tests/render.test.mjs
git commit -m "feat(html): aba Documentação no painel do nó"
```

---

### Task 7: leitura na consulta, na busca com LLM e na aba da GUI

**Files:**
- Create: `apps/gui/web/src/DocTab.tsx`, `apps/gui/web/src/DocTab.test.tsx`
- Modify: `scripts/lib/api.mjs` (`elementAnswer`), `scripts/lib/query-md.mjs` (`formatElementCard`), `apps/gui/server/bases.mjs:37`, `apps/gui/server/app.mjs:212-218`, `apps/gui/server/ask/tools.mjs`, `apps/gui/web/src/api.ts`, `apps/gui/web/src/Details.tsx`, `apps/gui/web/src/App.tsx:413`, `apps/gui/web/src/styles.css`
- Test: `tests/query-md.test.mjs`, `apps/gui/server/app.test.mjs`, `apps/gui/server/tools.test.mjs`, `apps/gui/server/context.test.mjs`

**Interfaces:**
- Consumes: `store.readDoc`, `store.supportsDocs` (Task 3), `plainWikilinks` (Task 5).
- Produces:
  - `query(store, { element, format, docMax })`: só com `format: 'md'`, lê `store.readDoc?.(id)` e adiciona `## Documentação`; acima de `docMax`, corta e termina com `[documentação cortada em <docMax> caracteres]`. Com `format: 'json'`, nada muda.
  - `snapshot.readDoc(id)` no contexto da GUI, delegando ao conector, para ler sempre o texto atual.
  - `DOC_LLM_MAX = 8000` em `ask/tools.mjs`, usado por `cardTool`.
  - `GET /api/bases/:b/elements/:id/doc -> { text: string | null }`, com `plainWikilinks`; id desconhecido responde 400 `E_UNKNOWN_REF`.
  - Rota do cartão: `{ card, actions, docs: boolean }`. `ElementDetail.docs?: boolean`; `getDoc(base, id) -> Promise<{ text: string | null }>`.
  - `DocTab({ base, id }: { base: string; id: string })`, com `Details` recebendo `base` e `docsEnabled`.

- [ ] **Step 1: Write the failing tests**

`query-md.test.mjs`: cartão md traz `## Documentação`; json não traz; `docMax` corta com o aviso.

`app.test.mjs`: "o cartão e a visão não transportam a documentação" (marcador ausente nas duas respostas); "edição direta aparece sem reiniciar" (grava a página e a rota devolve o novo texto); "`docs` é false em base JSON".

`tools.test.mjs`: `element_card` traz o texto e respeita `DOC_LLM_MAX`. `context.test.mjs`: o contexto inicial não contém o marcador.

`DocTab.test.tsx`: "busca só ao montar"; "mostra markdown formatado"; "estado vazio diz como escrever"; "resposta atrasada do nó anterior é ignorada" (Review Focus 3); "erro mostra mensagem, sem quebrar o painel". `Details.test.tsx`: aba ausente com `docsEnabled` falso; `getDoc` não é chamado antes do clique.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/query-md.test.mjs && npm --prefix apps/gui test`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

`Details`: abas `Detalhes` e `Documentação` só com `docsEnabled`; `DocTab` só monta com a aba ativa. Estado vazio: `Este nó ainda não tem documentação. Peça no Planejar, use a skill archlens-plan ou escreva no markdown, depois do bloco do archlens.` Reaproveite `plan/Markdown.tsx`. No `DocTab`, ignore respostas de um `id` antigo com uma flag no `useEffect`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test && npm run gui:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib tests apps/gui/server apps/gui/web/src
git commit -m "feat(gui): aba Documentação, cartão da consulta e busca com LLM"
```

---

### Task 8: escrever pelo Planejar

**Files:**
- Modify: `apps/gui/server/plan/tools.mjs`, `apps/gui/server/plan/preview.mjs`, `apps/gui/web/src/plan/DeltaPanel.tsx`, `apps/gui/web/src/api.ts`, `apps/gui/web/src/styles.css`
- Test: `apps/gui/server/plan-tools.test.mjs`, `apps/gui/server/plan-apply.test.mjs`, `apps/gui/web/src/plan/DeltaPanel.test.tsx`

**Interfaces:**
- Consumes: delta `docs`, itens `kind: 'doc'`, `lineDiff` (Task 4).
- Produces:
  - Ferramenta `read_doc` (`{ id }`): devolve o texto atual ou `o nó não tem documentação`, para o agente editar em vez de reescrever às cegas.
  - `deltaList` acrescenta `{ sign: '+' | '~' | '−', kind: 'doc', id, name, diff: { sign, line }[] }`, sem o corte `VALUE_MAX`. `PreviewChange` ganha `kind: 'doc'` e `diff?`.
  - Seção `Documentação (n)` no `DeltaPanel`.

- [ ] **Step 1: Write the failing tests**

`plan-apply.test.mjs`:

```js
test('editar o markdown durante a revisão: 409 E_GUI_PLAN_CHANGED e texto preservado', …);
test('nó vazio ao planejar e preenchido na revisão: 409 e texto preservado', …); // Review Focus 1
test('aplicar grava só o trecho liberado e regenera o documento', …);
```

`plan-tools.test.mjs`: `read_doc` devolve o texto; `set_delta` com `docs` em base JSON falha com a frase de `E_STORE_DOC`. `DeltaPanel.test.tsx`: mostra linhas `-` e `+`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix apps/gui run test:server` e `npm --prefix apps/gui run test:web -- DeltaPanel`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implement**

Não mude `routes.mjs`: nos dois casos de conflito, `replanDraft` encontra uma pergunta sem resposta (a chave leva o hash do texto atual), o plano fica aberto, `opsHashOf` devolve `null` e `routes.apply` já responde 409. Implemente aqui só `read_doc`, `deltaList` e o painel; os testes de 409 protegem esse comportamento.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run gui:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gui/server apps/gui/web/src
git commit -m "feat(gui): documentação do nó no Planejar, com diferença no painel Delta"
```

---

### Task 9: skills, referências, `archlens-ask`, exemplo e desempenho

**Files:**
- Modify: `skills/archlens-plan/SKILL.md`, `skills/archlens-apply/SKILL.md`, `skills/archlens-query/SKILL.md`, `references/merge.md`, `references/knowledge-doc.md`, `references/base.md`, `references/views.md`, `README.md`
- Modify: `portable/archlens-ask/INSTRUCTIONS.md`, `RULES.md`, `EXAMPLES.md`, `eval/perguntas.json` se mudar
- Modify: `examples/loja-online-vault/architecture/**` (só páginas de elementos, `ARCHITECTURE.md` e `diagrams/`)
- Create: `apps/gui/e2e/doc-perf.test.mjs`
- Test: `tests/skills.test.mjs`, `tests/examples.test.mjs`

**Interfaces:**
- Consumes: tudo acima.

- [ ] **Step 1: Atualize skills e referências**

`archlens-plan`: pedido de documentar um nó vira `delta.docs`, lendo antes o texto atual com `archlens query --element <id>`; trocar texto é decisão do usuário, mostrando a diferença. `archlens-apply`: edição direta tem dois passos (editar e `archlens build`). `references/merge.md`: `docs`, chaves e `keep | take`. `references/knowledge-doc.md` e `base.md`: documentação do nó, limites do JSON, `check`. `README.md`: como escrever e ler.

- [ ] **Step 2: Atualize o archlens-ask**

Cartão inclui a documentação, lida da página no gbrain depois de `<!-- archlens:end -->`. Run: `npm run ask && npm --prefix apps/gui run prompt && npm run check-ask`
Expected: PASS; `INSTRUCTIONS.md` abaixo de 8000 caracteres.

- [ ] **Step 3: Enriqueça o exemplo**

Em `loja-online-vault`, escreva documentação ilustrativa em `loja.pedidos`, `loja.pedidos.checkout`, `gateway` e num processo de negócio, e `properties.squad` nesses nós. Run: `node scripts/archlens.mjs build examples/loja-online-vault/architecture && node scripts/archlens.mjs check examples/loja-online-vault/architecture`
Expected: `✓ … em dia`.

- [ ] **Step 4: Escreva a medição de desempenho**

`apps/gui/e2e/doc-perf.test.mjs`: gera uma base de 60 nós e 5 KB de documentação em cada, e a mesma sem texto. Asserções, com a mediana de 5 aberturas em Chromium real:

```js
assert.ok(comDoc <= semDoc * 1.10 + 50); // ms até o svg aparecer, HTML e GUI; 50 ms de folga para ruído
assert.ok(htmlComDoc.length - htmlSemDoc.length <= textoTotal * 1.5); // o texto não se repete por visão
```

Run: `npm --prefix apps/gui run test:e2e`
Expected: PASS. Registre os números na descrição do PR.

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run gui:test && npm run check-ask && npm run check-plugin && graphify update .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills references README.md portable apps/gui/e2e apps/gui/server/plan examples/loja-online-vault/architecture examples/loja-online-vault/ARCHITECTURE.md
git commit -m "docs: documentação do nó nas skills, referências, archlens-ask e exemplo"
```
