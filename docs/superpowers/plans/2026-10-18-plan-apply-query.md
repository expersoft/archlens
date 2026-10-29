# Três skills (plan, apply, query) sobre uma biblioteca comum — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma biblioteca comum (`scripts/lib/api.mjs`) com plan, apply, show, preview e query; o plano com estado
`open`/`final`, em que o final carrega as operações do store e a versão em que se baseou; comandos `plan`, `apply`,
`show` e `query`; e três skills (`archlens-plan`, `archlens-apply`, `archlens-query`) num plugin, no lugar do
`SKILL.md` da raiz.

**Architecture:** `api.mjs` compõe os módulos existentes (`merge.mjs`, `preview.mjs`, `query.mjs`, `store/ops.mjs`) e
recebe o conector já aberto; não faz I/O de terminal. O plano final nasce de `planMerge` + `applyPlan` + `diffRaw`; o
`apply` só valida o resultado de `applyOps` e chama `store.apply(ops, { baseVersion })`. Relatório e consulta em
markdown ficam em módulos próprios (`plan-report.mjs`, `query-md.mjs`). O CLI vira casca: lê arquivos, chama a api,
imprime e sai.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test` + `node:assert/strict`. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-18-plan-apply-query-design.md`

## Global Constraints

- Node ≥ 18; sem dependências novas.
- Mensagens ao usuário em português; comentários de código em inglês, densidade como no código ao redor.
- Plano: `"archlens-plan": "1.0"` (sem mudar a versão); campos novos `state` (`"open"` | `"final"`), e só no final
  `entry` e `ops`. Plano sem `state` é aberto. `appendHistory` é sempre a última op.
- `state: "final"` ⇔ plano não bloqueado e toda pergunta aplicável (respeitando `when`) com resposta válida
  (`validResolution`).
- Códigos novos: `E_PLAN_OPEN`. Reutilizados: `E_PLAN_SCHEMA`, `E_PLAN_PENDING`, `E_PLAN_RESOLUTION`,
  `E_STORE_CONFLICT`, `E_MERGE_INVALID`, `E_UNKNOWN_REF`.
- Mensagem de `E_STORE_CONFLICT` no `apply`: `a base mudou depois do plano (<v1> → <v2>); nada foi gravado. Refaça o plano
  reaproveitando as respostas: archlens plan <base> --answers <plano> --out <novo>`.
- Mensagem de `E_PLAN_OPEN`: `o plano tem N pergunta(s) sem resposta: item(ns) …; responda e rode archlens plan <base>
  --answers <plano> --out <novo>`.
- Saída do CLI: código 2 para plano bloqueado, aberto no `apply`, conflito de versão e pendência (como hoje).
- `merge --plan` e `merge --apply <plano>` mantêm o comportamento e a saída atuais (os testes de `tests/cli.test.mjs`
  continuam passando sem mudança; o arquivo de plano ganha só `state`, e `ops`/`entry` quando final).
- Só a skill apply grava a pasta da base; `plan`, `show`, `query` e as prévias nunca chamam `store.apply`.
- Nomes das skills: `archlens-plan`, `archlens-apply`, `archlens-query`; CLI citado como
  `node $SKILL_DIR/../../scripts/archlens.mjs`.

## Review Focus

- **Plano de outra base** (o usuário passa ao `apply` um plano feito para `examples/loja-online` numa outra pasta): a
  versão difere → `E_STORE_CONFLICT`, nada gravado. Teste na Task 2.
- **Plano final sem mudanças** (`ops: []`, `entry: null`): `apply` imprime "nada mudou", não grava nem regenera o
  documento, sai com 0. Teste na Task 3.
- **Base que ainda não existe** (primeiro delta): `storeVersion: null`; o `apply` cria a base e o documento. Testes nas
  Tasks 2 e 3.
- **Plano aberto ou delta passado ao `apply`** (hábito do `merge --apply`, que aceitava aberto todo respondido):
  `E_PLAN_OPEN` / `E_PLAN_SCHEMA` com a orientação, nada gravado. Testes nas Tasks 2 e 3.
- **`--answers` com respostas que não casam mais** (item sumiu do plano novo, resposta inválida para a pergunta nova):
  ignoradas sem erro, o plano fica aberto com essas perguntas. Teste na Task 1.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `scripts/lib/api.mjs` (novo) | `plan`, `apply`, `show`, `preview`, `query`, `answersOf`, `isFinal` |
| `scripts/lib/plan-report.mjs` (novo) | relatório md/json de um plano (aberto ou final) |
| `scripts/lib/query-md.mjs` (novo) | visão e cartão de elemento em md/json |
| `scripts/lib/preview.mjs` | extrai `diffModels(baseRaw, raw)` de `previewModel`; `previewModel` passa a usá-lo |
| `scripts/archlens.mjs` | comandos `plan`, `apply`, `show`, `query`; `--plan` final nas prévias; atalhos `merge` sobre a api; `HELP` |
| `scripts/gen-schemas.mjs`, `schemas/plan.schema.json` | `state`, `entry`, `ops` |
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (novos) | plugin |
| `skills/archlens-{plan,apply,query}/SKILL.md` (novos), `SKILL.md` (removido) | as três skills |
| `references/base.md` (novo), `references/merge.md`, `references/views.md` | texto comum, fluxo plan/apply, consulta md |
| `tests/api.test.mjs`, `tests/plan-report.test.mjs`, `tests/query-md.test.mjs`, `tests/skills.test.mjs` (novos); `tests/cli.test.mjs`, `tests/preview.test.mjs`, `tests/doc.test.mjs`, `tests/examples.test.mjs` | testes |
| `examples/telemedicina/plano-02.json`, `plano-02-final.json`, `plano-02-final.md` (novos) | exemplo |
| `README.md`, `docs/GUIA.md`, `CHANGELOG.md`, `docs/superpowers/roadmap.md` | documentação |

---

### Task 1: `api.plan` (aberto e final) e `answersOf`

**Files:**
- Create: `scripts/lib/api.mjs`, `tests/api.test.mjs`
- Modify: `scripts/gen-schemas.mjs`, `schemas/plan.schema.json` (gerado), `tests/doc.test.mjs` (se ele confere a lista de propriedades do schema do plano)

**Interfaces:**
- Consumes: `planMerge`, `applyPlan`, `validResolution`, `PLAN_VERSION`, `canonicalJson`, `mergeError` (`merge.mjs`);
  `diffRaw`, `contentVersion` (`store/ops.mjs`).
- Produces:
  - `plan(store, delta, { answers?: Map<string,string>, today?: string }) → { plan }` — `base: basename(store.locator.path)`,
    `storeVersion`, `state`, e no final `entry` + `ops`.
  - `answersOf(doc, delta?) → { answers: Map<string,string>, delta: object, otherDelta: boolean }` — lê os itens
    respondidos de um plano (aberto ou final); `delta` é o argumento ou, sem ele, `doc.delta`; `E_PLAN_SCHEMA` se `doc`
    não é plano.
  - `isFinal(doc) → boolean` (`doc?.['archlens-plan'] === PLAN_VERSION && doc.state === 'final'`).

- [ ] **Step 1: Write the failing tests** em `tests/api.test.mjs`, com um conector em memória `memStore(base)` (helper
  do arquivo: `read()`, `version()` = `contentVersion(read())`, `apply(ops, { baseVersion })` = `applyOps` com checagem
  de versão por `conflictError`, `history()`, `readSubgraph` = `subgraphOf`, `locator: { path: '/x/architecture' }`, e
  `calls: string[]` com o nome de cada método chamado), sobre `asBase(shop())`:
  - `an unanswered plan is open and equals merge --plan`: `plan(store, delta).plan` deep-equal a
    `{ ...planMerge(raw, delta, { base: 'architecture', storeVersion, today }), state: 'open' }`.
  - `a plan with every question answered is final, with store ops ending in appendHistory`: `state === 'final'`,
    `ops.at(-1).op === 'appendHistory'`, `ops.at(-1).entry` deep-equal a `entry`, `entry` deep-equal à de
    `applyPlan(raw, plano)`.
  - `a delta without questions is final on the first plan`.
  - `a blocked plan stays open`: delta com relação para id inexistente → `blocked: true`, `state: 'open'`, sem `ops`.
  - `a duplicate answered same can reopen the plan with follow-up questions`: cenário da linha 359 de
    `tests/merge.test.mjs` com só a duplicata respondida → `state: 'open'` e a pergunta condicional pendente.
  - `a plan that changes nothing is final with no ops and no entry`.
  - `a plan on a missing base has storeVersion null and starts with setManifest`.
  - `answersOf reads open and final plans alike; without a delta it uses the plan's`: o mesmo `Map` dos dois; `delta`
    deep-equal a `doc.delta`; `otherDelta: true` com outro delta.
  - `answers that no longer match are ignored and leave the plan open` (Review Focus): chave inexistente + `'talvez'`
    numa duplicata → não lança, a duplicata fica `resolution: null`, `state: 'open'`.
  - `answersOf refuses what is not a plan`: delta → `E_PLAN_SCHEMA`.
- [ ] **Step 2: Run** `node --test tests/api.test.mjs` — Expected: FAIL (`Cannot find module '../scripts/lib/api.mjs'`).
- [ ] **Step 3: Implement** em `scripts/lib/api.mjs`. Uma leitura `store.read()`, versão dessa leitura por `contentVersion`
  (como o `case 'merge'` faz hoje). Final: aplicar a regra de `state` das Global Constraints sobre os itens do plano;
  então `applyPlan(raw, plano, { today })`; `entry === null` → `ops: []`; senão `diffRaw(base ? loaded : null, { raw:
  res.raw, notes })`. Em `gen-schemas.mjs`: `state: { enum: ['open', 'final'] }`, `entry: { type: ['object', 'null'] }`,
  `ops: { type: 'array', items: { type: 'object', required: ['op'], properties: { op: { enum: OPS } } } }`.
- [ ] **Step 4: Run** `node --test tests/api.test.mjs && npm run schemas && npm test` — Expected: PASS; só
  `schemas/plan.schema.json` muda entre os schemas.
- [ ] **Step 5: Commit** `feat(api): plan aberto e final (final com as operações do store e a versão)`

### Task 2: `api.apply` mecânico e equivalência com o `merge --apply`

**Files:**
- Modify: `scripts/lib/api.mjs`, `tests/api.test.mjs`

**Interfaces:**
- Consumes: `plan`, `isFinal` (Task 1); `applyOps` (`store/ops.mjs`); `validateModel`.
- Produces: `apply(store, plan) → { version: string|null, entry: object|null, preserved: string[] }` (`ops` vazio →
  `{ version: null, entry: null, preserved: [] }` sem chamar `store.apply`).

- [ ] **Step 1: Write the failing tests**:
  - `apply writes only through the connector and never replays the merge`: plano final com `delta` trocado por `{}` e
    `items: []` → aplica igual; `calls` contém só `read`, `version` e `apply`.
  - `apply reproduces merge --apply for every merge-test scenario`: tabela (base, delta, respostas) com os cenários dos
    testes de `tests/merge.test.mjs` das linhas 23, 37, 51, 62, 96, 214, 222, 259, 286, 294, 308, 330, 359, 415, 454
    (copiar base/delta/respostas de cada um); `canonicalJson(store.read().raw)` depois de `apply(plan(…, { answers }))`
    === `canonicalJson(applyPlan(base, planoRespondido).raw)`. Cenários com duplicata `same` passam por dois `plan`
    (o segundo com as respostas do primeiro), como no fluxo real.
  - `apply reproduces merge --apply for telemedicina delta-02`: base de `examples/telemedicina/architecture` lida com
    `openStore(resolveBase(…))`, carregada num `memStore`; respostas por `n`: `3: take`, `5: same`, `6: keep`, `12: yes`
    (re-planejando depois do `same`); mesma igualdade. A pasta do exemplo não é gravada.
  - `apply refuses a stale plan and writes nothing`: base muda depois do `plan` → `E_STORE_CONFLICT`; `contentVersion`
    igual à de depois da mudança.
  - `apply refuses a plan made for another base` (Review Focus) → `E_STORE_CONFLICT`.
  - `apply creates a missing base` (Review Focus): `memStore(null)` → `read().raw.name` = o `name` do delta.
  - `apply refuses an open plan` (Review Focus) → `E_PLAN_OPEN`, mensagem com os números dos itens pendentes.
  - `apply refuses what is not a plan` → delta e `{}` dão `E_PLAN_SCHEMA`.
  - `apply refuses a hand-edited plan that breaks the model`: `upsertRelationship` para id inexistente acrescentado às
    `ops` → `E_MERGE_INVALID` com `errors`, nada gravado.
- [ ] **Step 2: Run** `node --test tests/api.test.mjs` — Expected: FAIL (`apply is not a function`).
- [ ] **Step 3: Implement** `apply`: não é plano → `E_PLAN_SCHEMA`; aberto → `E_PLAN_OPEN`; `ops` vazio → retorna;
  `applyOps(store.read(), ops)` + `validateModel` → `E_MERGE_INVALID`; `store.apply(ops, { baseVersion: plan.storeVersion })`;
  a mensagem de conflito é a das Global Constraints (substituir a mensagem do `conflictError` capturando o código).
- [ ] **Step 4: Run** `node --test tests/api.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): apply aplica o plano final só pelo conector`

### Task 3: CLI `plan` e `apply`; atalhos `merge` sobre a api

**Files:**
- Modify: `scripts/archlens.mjs` (novos `case 'plan'` e `case 'apply'`, `case 'merge'`, `answersFrom` → `answersOf`, `HELP`, `BASE_CMDS`, `create`), `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `plan`, `apply`, `answersOf`, `isFinal` (Tasks 1–2).
- Produces: `plan <base> [<delta>] --out p [--answers f] [--json]`, `apply <base> p`; `merge --plan` = `plan`;
  `merge --apply p` = `plan(store, p.delta, { answers: answersOf(p) })` + exige final (senão `E_PLAN_PENDING`, como hoje) + `apply`.

- [ ] **Step 1: Write the failing tests** em `tests/cli.test.mjs` (usam `setup()`, `run()`, `snapshot()`, `changelog()`):
  - `plan writes the same plan as merge --plan`: os dois arquivos deep-equal.
  - `plan prints the next step`: aberto → stdout contém `archlens plan` e `--answers`; final → contém `archlens apply`.
  - `plan --answers without a delta reuses the plan's delta and comes out final`.
  - `plan then apply writes the base and the document`: `changelog(dir).length` +1, `check` sai 0, stdout contém `commit sugerido`.
  - `apply on a changed base exits 2 and writes nothing`: `snapshot` igual; stderr contém `E_STORE_CONFLICT` e `--answers`.
  - `apply of a final plan with no changes prints nada mudou and leaves the document alone` (Review Focus): `mtimeMs`
    do `ARCHITECTURE.md` igual, saída 0.
  - `apply of an open plan or of a delta is refused` (Review Focus): saída 2 / ≠ 0, stderr com `E_PLAN_OPEN` /
    `E_PLAN_SCHEMA`, `snapshot` intacto.
  - `plan and apply create a missing base` (Review Focus): pasta vazia → `architecture/archlens.json` e `ARCHITECTURE.md` existem.
  - `plan and apply work on a markdown base`: depois de `store convert --to markdown`, o fluxo grava as páginas e `check` sai 0.
  - `the CLI no longer imports planMerge or applyPlan`: nenhuma linha `import` de `scripts/archlens.mjs` cita os dois nomes.
- [ ] **Step 2: Run** `node --test tests/cli.test.mjs` — Expected: FAIL nos testes novos; os antigos passam.
- [ ] **Step 3: Implement**: imprimir revisão, `preserved`, documento e commit numa função `afterApply(store, res)` usada
  por `apply` e `merge --apply` (texto atual do `--apply`). `plan` e `apply` entram em `BASE_CMDS`; `plan` e `apply`
  em `create` (como `merge`). `HELP` em três blocos: "Planejar (nunca grava a base)": `plan`, `show`, `scan`;
  "Aplicar (grava a base)": `apply`, `doc`, `build`, `migrate`, `store convert`; "Consultar (nunca grava a base)":
  `query`, `views`, `resolve`, `render`, `deliver`, `validate`, `check`, `extract`; `merge --plan`/`--apply` em
  "Atalhos".
- [ ] **Step 4: Run** `npm test` — Expected: PASS (inclusive todos os testes antigos de `merge`).
- [ ] **Step 5: Commit** `feat(cli): plan e apply (plano aberto/final), merge como atalho`

### Task 4: prévia de plano final e `api.preview`

**Files:**
- Modify: `scripts/lib/preview.mjs`, `scripts/lib/api.mjs`, `scripts/archlens.mjs` (`loadPreview`), `tests/preview.test.mjs`, `tests/api.test.mjs`, `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `applyOps`; `isFinal` (Task 1).
- Produces:
  - `diffModels(baseRaw, raw) → { raw, changes: Map, relChanges: Map, pending: Map, keep: Set }` em `preview.mjs` — a
    parte de `previewModel` que compara duas bases (ghosts de removidos incluídos), com `pending` vazio; `previewModel`
    passa a chamá-la e acrescenta as pendências.
  - `preview(store, { delta?, plan? }) → { raw, preview, warning?: string }` em `api.mjs`; plano final → `applyOps(read(),
    ops)` + `diffModels`; `warning` quando a versão difere (texto de hoje do `loadPreview`).

- [ ] **Step 1: Write the failing tests**:
  - `preview.test.mjs` — `diffModels agrees with previewModel on a fully answered plan`: `changes`/`relChanges` iguais.
  - `api.test.mjs` — `the preview of a final plan has its changes and no pending questions`: `pending.size === 0`; os
    ids de `plan.entry.added` estão em `changes` como `added`.
  - `cli.test.mjs` — `deliver --plan with a final plan writes the preview and never the base`: `snapshot` intacto; HTML existe.
  - `cli.test.mjs` — `the CLI no longer imports previewModel`.
- [ ] **Step 2: Run** `node --test tests/preview.test.mjs tests/api.test.mjs tests/cli.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement**: extrair `diffModels`; `loadPreview` chama `api.preview`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(preview): prévia de plano final`

### Task 5: relatório do plano (`show`)

**Files:**
- Create: `scripts/lib/plan-report.mjs`, `tests/plan-report.test.mjs`, `tests/fixtures/show-telemedicina-final.md`, `tests/fixtures/show-telemedicina-open.md`, `tests/fixtures/show-removal.md`
- Modify: `scripts/lib/api.mjs` (`show`), `scripts/archlens.mjs` (`case 'show'`, `HELP`, `BASE_CMDS`)

**Interfaces:**
- Consumes: `preview` (Task 4); `describeItem` (`merge-report.mjs`); `contentVersion`.
- Produces:
  - `reportData(baseRaw, plan, preview, { currentVersion }) → { title, header, state, totals, pending, decisions, added, changed, removed, relationships, views, stale: boolean }`.
  - `formatReport(data) → string`.
  - `show(store, plan, { format: 'md' | 'json' }) → string | object` em `api.mjs`.

- [ ] **Step 1: Write the failing tests** (snapshots gerados com `UPDATE_SNAPSHOTS=1` na primeira execução, revisados e commitados):
  - `the final telemedicina delta-02 report matches the snapshot` (respostas da Task 2).
  - `the open telemedicina delta-02 report lists pending decisions with their options` (snapshot; contém `## Decisões pendentes` e `→ same | different`).
  - `a report with removals and relationships matches the snapshot`: delta com `remove` de um elemento com filho, uma
    relação nova e uma removida.
  - `header and totals`: primeira linha `# Plano: <summary>`; cabeçalho termina em `**final**` ou `**aberto**`; totais
    no formato `**+N elementos · ~N alterados · −N removido(s) · relações +N −N**`.
  - `changed lines show old → new per field, aliases as + additions`.
  - `empty sections are omitted`.
  - `a changed base is flagged in the first line` (`stale: true`).
  - `json format returns the structured data`.
  - CLI: `show <base> p.json` imprime o markdown; `--out f.md` grava; `--json` dá JSON válido.
- [ ] **Step 2: Run** `node --test tests/plan-report.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** conforme a seção 4 do spec; ordem: Decisões pendentes, Decisões, Novos, Alterados,
  Removidos, Relações, Visões; linhas ordenadas por id; nomes antigos de `baseRaw`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(show): relatório markdown do plano`

### Task 6: consulta de visão em markdown (`query --view/--spec`)

**Files:**
- Create: `scripts/lib/query-md.mjs`, `tests/query-md.test.mjs`, `tests/fixtures/query-*.md`
- Modify: `scripts/lib/api.mjs` (`query`), `scripts/archlens.mjs` (`case 'query'`, `HELP`, `BASE_CMDS`)

**Interfaces:**
- Consumes: `normalizeModel`, `resolveView`, `explainEdge`.
- Produces:
  - `viewAnswer(model, spec) → { title, spec, sections: [{ label, rows: [{ id, name, type, kind, status, technology }] }], edges: [{ from, to, type, sentence }], matrix?: { rows, cols, cells }, notes: string[] }`.
  - `formatViewAnswer(answer) → string`.
  - `query(store, { view?, spec?, element?, depth?, via?, format }) → string | object` em `api.mjs` (o ramo `element` vem
    na Task 7; aqui, sem `view`/`spec`/`element`, `E_QUERY_INPUT`).

- [ ] **Step 1: Write the failing tests** (snapshots sobre `examples/loja-online/architecture`):
  - `container view matches the snapshot` (`{notation:"c4", level:"container", scope:<o sistema principal do exemplo>}`).
  - `product-support view matches the snapshot` (uma visão `product-support` definida no exemplo, por key).
  - `impact view renders the matrix as a markdown table`.
  - `sections follow layers for ArchiMate and levels for C4`.
  - `a view with more than 40 nodes ends with a note to cut it`.
  - `an unknown view key fails with the code selectSpecs uses today`.
  - CLI: `query <base> --view <k>` (padrão md) imprime o snapshot; `--format json` dá JSON com `edges`; o `snapshot()`
    da base não muda.
- [ ] **Step 2: Run** `node --test tests/query-md.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** conforme a seção 5 do spec; a matriz vem do IR que o renderer já usa (o campo está em
  `query-archimate.mjs`).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(query): respostas em markdown para visões`

### Task 7: cartão de elemento (`query --element`) por `readSubgraph`

**Files:**
- Modify: `scripts/lib/query-md.mjs`, `scripts/lib/api.mjs`, `scripts/archlens.mjs`, `tests/query-md.test.mjs`, `tests/api.test.mjs`

**Interfaces:**
- Consumes: `store.readSubgraph`, `store.history`, `findCandidates`, `explainEdge`.
- Produces:
  - `elementCard(subRaw, id, { history, depth }) → { element, parent, children, outgoing: Record<type, edge[]>, incoming: Record<type, edge[]>, properties, sources, rounds, around: row[] }`.
  - `formatElementCard(card) → string`.

- [ ] **Step 1: Write the failing tests**:
  - `the card of a container matches the snapshot` (um container do `loja-online` com relações de entrada e saída, `--depth 1`).
  - `the card reads through readSubgraph, not read`: `memStore` → `calls` contém `readSubgraph` e não `read`.
  - `depth 2 adds an Em volta section with the second ring`.
  - `rounds list only changelog entries that cite the id` (em `added`, `changed`, `removed`, `status` ou `decisions`).
  - `an unknown id suggests similar names`: `E_UNKNOWN_REF` com `suggestions` não vazio.
  - CLI: `query <base> --element <id> --via serving,flow` repassa `via` como lista.
- [ ] **Step 2: Run** `node --test tests/query-md.test.mjs tests/api.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement**: id inexistente vem do `E_UNKNOWN_REF` do `readSubgraph`; só então `read()` para as
  sugestões (`findCandidates`); o caminho feliz não chama `read`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(query): cartão de elemento lido por readSubgraph`

### Task 8: as três skills, o plugin e `references/base.md`

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/archlens-plan/SKILL.md`,
  `skills/archlens-apply/SKILL.md`, `skills/archlens-query/SKILL.md`, `references/base.md`, `tests/skills.test.mjs`
- Delete: `SKILL.md`
- Modify: `references/merge.md` (fluxo `plan` → `plan --answers` → `apply`, aberto/final, `show`, conflito, atalhos
  `merge`), `references/views.md` (seção "Consulta em markdown")

**Interfaces:**
- Consumes: os comandos das Tasks 3–7 e o `HELP`.
- Produces: o conteúdo do `SKILL.md` atual redistribuído conforme a tabela da seção 6 do spec.

- [ ] **Step 1: Write the failing tests** em `tests/skills.test.mjs`:
  - `each skill has name and description, and the name matches the folder`.
  - `plugin.json names the plugin archlens and marketplace.json points at the repo root` (`source: "./"`).
  - `every references/*.md and scripts/* path cited by a skill exists` (relativo a `SKILL_DIR/../..`).
  - `every archlens command cited by a skill appears in HELP` (regex `archlens ([a-z]+)`; `HELP` via `run(['help'])`).
  - `no section of the old SKILL.md is lost`: lista fixa no teste com os títulos `##` do `SKILL.md` atual (Fluxo,
    Formato 2.0, Propriedades, Aninhamento (ArchiMate), Pedido → view spec, Alertas do deliver/build, Erros comuns,
    Referências); cada um aparece como título em alguma skill ou em `references/base.md`.
  - `only archlens-apply runs apply, build, doc, migrate or store convert`: nenhum outro `SKILL.md` contém
    `archlens apply`, `archlens build`, `archlens doc`, `archlens migrate` ou `archlens store convert` fora de frases que
    mandam usar a skill archlens-apply.
  - `archlens-apply runs build after apply`: no `SKILL.md` dela, `archlens build` aparece depois de `archlens apply`.
  - `archlens-plan ends with show and a deliver --plan preview`.
  - `the root SKILL.md is gone`.
- [ ] **Step 2: Run** `node --test tests/skills.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Write** as skills: `description` no formato "Use when …" do `SKILL.md` atual, com os gatilhos da tabela
  do spec e sem sobreposição. Cada `SKILL.md` começa com "Leia `references/base.md` antes do primeiro comando".
  `archlens-plan` termina com o plano final + `show` + `deliver --plan … --out` fora da base e "para gravar, use a skill
  archlens-apply"; `archlens-apply` recusa sem plano final e manda para a skill plan; depois do `apply`, roda `build`,
  lê os alertas e atualiza as notas; `archlens-query` gera `deliver --out` fora da base e `query`, e para manter uma
  visão monta o delta com `views` e passa à skill plan. `plugin.json`: `{ "name": "archlens", "version": <package.json>,
  "description": <package.json> }`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS. Rodar `claude plugin validate .` se disponível no ambiente; anotar o
  resultado no PR.
- [ ] **Step 5: Commit** `feat(skills): archlens-plan, archlens-apply e archlens-query num plugin`

### Task 9: exemplo, documentação e roadmap

**Files:**
- Create: `examples/telemedicina/plano-02.json`, `examples/telemedicina/plano-02-final.json`, `examples/telemedicina/plano-02-final.md`
- Modify: `README.md`, `docs/GUIA.md`, `CHANGELOG.md`, `docs/superpowers/roadmap.md`, `tests/examples.test.mjs`

**Interfaces:**
- Consumes: CLI das Tasks 3 e 5.

- [ ] **Step 1: Write the failing test** em `tests/examples.test.mjs`: `telemedicina plano-02-final is current`: numa
  cópia da pasta, `plan architecture --answers plano-02-final.json --out x.json` dá o mesmo `plano-02-final.json`
  (ignorando `created` e a data nas `ops`/`entry`), e `show` dá o mesmo `plano-02-final.md`; a pasta `architecture/` do
  exemplo não muda.
- [ ] **Step 2: Run** `node --test tests/examples.test.mjs` — Expected: FAIL (arquivos não existem).
- [ ] **Step 3: Generate** os arquivos com o CLI (`plan` → respostas `3: take`, `5: same` → `plan --answers` →
  `6: keep`, `12: yes` → `plan --answers` → final → `show`); README e GUIA (as três skills; instalação pelo plugin e por
  `ln -s <repo>/skills/archlens-* ~/.claude/skills/`; o fluxo `plan` → `apply` → `build`); `CHANGELOG.md`
  `[Não lançado]`: "Adicionado" (`plan`/`apply`/`show`, plano final com operações, `query`, prévia de plano final,
  plugin com três skills) e "Mudado (incompatível)" (o `SKILL.md` da raiz saiu; quem tem `~/.claude/skills/archlens →
  <repo>` troca o link); roadmap: e.3 `feito`, com links para spec e plano.
- [ ] **Step 4: Run** `npm test && npm run examples` — Expected: PASS; `git status` sem mudanças nos `architecture/`
  dos exemplos além dos `diagrams/` que o `npm run examples` já regenera hoje.
- [ ] **Step 5: Run** `graphify update .` e **Commit** `docs: plan, apply e query (e.3)`
