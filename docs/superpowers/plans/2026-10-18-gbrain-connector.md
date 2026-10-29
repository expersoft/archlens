# Base compartilhada no gbrain (e.4.1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** versão por objeto (escrita + leitura + duplicata criada em paralelo), `archlens init`, layout da base no gbrain e o
conector `gbrain` nos modos git (CLI faz commit/push) e MCP (o agente chama as ferramentas; o CLI prepara e confere).

**Architecture:** o merge passa a registrar o que leu (`ctx.read`); o plano final grava `objects` (ref → versão) e
`knownCandidates`. Cada conector declara `versioning` e implementa `objectVersions`; `apply(ops, { expect })` confere antes de
gravar. O leitor/gerador do vault (`markdown`) passa a operar sobre um mapa de arquivos, e `gbrain-layout.mjs` traduz o vault
para o layout do gbrain (prefixo, páginas de manifesto/visões/notas/histórico, tag `archlens`). O modo git usa uma worktree
destacada do clone do usuário; o modo MCP usa um espelho local e arquivos de pedido/resposta trocados com o agente.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test` + `node:assert/strict`, `git` do ambiente (via `child_process`). Nenhuma
dependência nova. Testes de integração: gbrain a partir do código-fonte com Bun (já instalado no ambiente de desenvolvimento).

**Spec:** `docs/superpowers/specs/2026-10-18-gbrain-connector-design.md`

## Global Constraints

- Node ≥ 18; sem dependências novas; mensagens em português; comentários em inglês, densidade como no código ao redor.
- Refs de objeto: `element:<id>`, `relationship:<id>`, `view:<key>`, `note:<nome>`, `manifest`. O histórico não é objeto de conflito.
- `versioning`: `json` = `base`; `markdown` local = `object`; `gbrain` (git e MCP) = `object`.
- A versão de uma relação é a da página do elemento de origem (`element:<from>`) nos conectores `markdown`/`gbrain`.
- Conflito: `E_STORE_CONFLICT` com `conflicts: [{ ref, planned, current }]` ou `{ ref, reason: "possible-duplicate", candidate }`; nada gravado; a mensagem lista os objetos por nome e `archlens plan <base> --answers <plano> --out <novo>`.
- Id da rodada (`<data>-<seq>`) atribuído na hora de gravar; o do plano é provisório.
- `archlens.json` nunca guarda credenciais. `store` do gbrain: `{ kind: "gbrain", mode: "git", repo, remote: "origin", branch: "main", prefix: "archlens" }` ou `{ kind: "gbrain", mode: "mcp", server, sourceId, prefix: "archlens" }` (padrões indicados).
- Layout gbrain sob `<prefix>/`: `<tipo>/<id>.md`, `manifest.md`, `views/<key>.md`, `notes/<nome>.md`, `changelog.md`; toda página com a tag `archlens`; manifesto/visões/histórico com o conteúdo num bloco ```archlens-json + resumo legível.
- Nomes reservados do gbrain (`README.md`, `index.md`, `schema.md`, `log.md`, `RESOLVER.md`): `E_STORE_GBRAIN_RESERVED`. Id que não é o próprio slug do gbrain (minúsculas, sem acento; mantém letras, números, `.`, `_`, `-`): `E_STORE_GBRAIN_SLUG`.
- Modo git: nunca altera o diretório de trabalho nem a branch atual do clone; um apply = um commit `docs(arquitetura): <resumo>`; push recusado → refaz a conferência até 3 vezes. Erros do git: `E_STORE_GIT` com a saída do git.
- Modo MCP: gravar exige o conjunto completo de ferramentas (`E_STORE_GBRAIN_SURFACE`); lotes `put_pages` ≤ 50 páginas e ≤ 8 MB; resposta que não corresponde ao pedido: `E_REMOTE_RESPONSE`; histórico com até 5 releituras (`E_STORE_HISTORY_RETRY`).
- Testes com gbrain real: nunca `bun install -g`, nunca tocar `~/.gbrain`; `GBRAIN_HOME` numa pasta temporária; fora do `npm test` (`npm run test:gbrain`, `GBRAIN_TEST=1`).

## Review Focus

- **Clone do usuário com mudanças não commitadas ou noutra branch** (modo git): o apply funciona e o diretório de trabalho, o índice e a branch atual ficam intactos. Teste na Task 5.
- **gbrain com outras páginas além das do archlens** (outras pastas, outras tags): leitura, `pull` e `apply` ignoram tudo fora de `<prefix>/` e sem a tag `archlens`; nada fora do prefixo é apagado. Testes nas Tasks 3, 5 e 7.
- **Base MCP sem espelho ou com espelho desatualizado** (ninguém rodou `pull`): `plan`/`query`/`apply` recusam com `E_REMOTE_STALE` ("rode `archlens remote <base> pull`"). Teste na Task 7.
- **Resposta do agente trocada ou de um pedido antigo** (arquivo de outra rodada): `E_REMOTE_RESPONSE`, nada muda no espelho nem no registro. Testes nas Tasks 7 e 8.
- **Id com maiúsculas ou acento** (`Loja.Pedidos`, `pagamento-crédito`), válido nos conectores locais: `store convert --to gbrain` e o `apply` recusam com `E_STORE_GBRAIN_SLUG` antes de gravar qualquer coisa, listando os ids. Teste na Task 3.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `scripts/lib/merge.mjs` | `ctx.read` (conjunto de leitura) e `ctx.candidates` (candidatos a duplicata por elemento novo) |
| `scripts/lib/store/versions.mjs` (novo) | refs, `objectVersionsOf(snapshot, refs)`, `checkExpect`, `writeSetOf(ops)` |
| `scripts/lib/store/contract.mjs` | `versioning`, `objectVersions`, `apply(ops, { expect })` no `fileConnector` |
| `scripts/lib/store/ops.mjs` | `appendHistory` numera a rodada na hora de aplicar |
| `scripts/lib/api.mjs` | `objects`/`knownCandidates` no plano final; `expect` e recheque de duplicatas no `apply` |
| `scripts/lib/store/markdown.mjs`, `markdown-page.mjs` | `readVaultFiles(files)` / `vaultFiles(raw, notes, cur)` sobre mapa de arquivos; `linkPrefix` nos wikilinks |
| `scripts/lib/store/gbrain-layout.mjs` (novo) | vault ↔ layout gbrain; validação de slug e nomes reservados |
| `scripts/lib/store/config.mjs` (novo) | validação de `store` no `archlens.json` e `initBase` |
| `scripts/lib/store/gbrain-git.mjs` (novo) | conector gbrain modo git |
| `scripts/lib/store/gbrain-mcp.mjs` (novo) | espelho, pedidos/respostas, registro do apply, conector gbrain modo MCP |
| `scripts/lib/store/index.mjs` | `openStore` despacha `gbrain` |
| `scripts/lib/store/convert.mjs` | `--to gbrain` (git e MCP) e de volta |
| `scripts/archlens.mjs` | `init`, `remote <base> pull`/`check`, `apply` MCP (`--read-check`, `--receipts`, `--resume`, `--undo`), `store convert --to gbrain`, mensagens de conflito |
| `scripts/test-env/gbrain-env.mjs` (novo) | sobe/derruba gbrain + repositório git de teste |
| `tests/read-set.test.mjs`, `tests/versions.test.mjs`, `tests/gbrain-layout.test.mjs`, `tests/init.test.mjs`, `tests/gbrain-git.test.mjs`, `tests/gbrain-mcp.test.mjs`, `tests/helpers/fake-gbrain.mjs` (novos); `tests/gbrain-integration.test.mjs` (novo, só com `GBRAIN_TEST=1`) | testes |
| `skills/*/SKILL.md`, `references/{base,merge,knowledge-doc}.md`, `README.md`, `docs/GUIA.md`, `CHANGELOG.md`, `docs/superpowers/roadmap.md`, `package.json` (`test:gbrain`) | documentação |

---

### Task 1: conjunto de leitura no merge e versões por objeto no plano final

**Files:**
- Create: `scripts/lib/store/versions.mjs`, `tests/read-set.test.mjs`
- Modify: `scripts/lib/merge.mjs`, `scripts/lib/api.mjs` (`plan`/`finalize` gravam `objects` e `knownCandidates`), `scripts/gen-schemas.mjs` (+ `schemas/plan.schema.json`)

**Interfaces:**
- Produces:
  - `versions.mjs`: `refOf(kind, id) → string`; `writeSetOf(ops) → Set<ref>` (alvos de `upsertElement`, `removeElement`, `upsertRelationship`/`removeRelationship` (→ `element:<from>` e `relationship:<id>`), `putView`/`removeView`, `putNote`, `setManifest`); `objectVersionsOf(snapshot, refs) → Map<ref, string|null>` (sha256 de `canonicalJson`: elemento + relações que saem dele; relação → a do elemento de origem; visão; texto da nota; `manifestOf`).
  - `merge.mjs`: o contexto do merge acumula `ctx.read: Set<ref>` e `ctx.candidates: Map<idNovo, string[]>`; `applyPlan(baseRaw, plan, opts)` passa a devolver `{ raw, entry, read: Set<ref>, candidates: Record<idNovo, string[]> }` (o `api.finalize`, que já chama `applyPlan`, usa os dois campos novos).
  - Plano final ganha `objects: Record<ref, string|null>` (versões de `read ∪ writeSetOf(ops)` lidas do **mesmo** snapshot do plano, via `store.objectVersions(refs, snapshot)`; conectores sem esse método: `objectVersionsOf`) e `knownCandidates: Record<idNovo, string[]>`.

- [ ] **Step 1: testes** em `tests/read-set.test.mjs` sobre `asBase(shop())` — cada um afirma o conjunto `read` exato:
  - `matching by id or alias reads the matched element`;
  - `a possible duplicate answered same or different reads the candidate` (os dois casos);
  - `a new element reads its parent and its group`; `moving an element reads old and new parent`;
  - `a new relationship reads both ends` (incluindo pontas resolvidas por alias);
  - `rename, alias and status read their target; remove reads the whole cascade` (filhos, relações, visões afetadas);
  - `rewritten views are read`;
  - `knownCandidates lists, per new element, the candidates found at plan time` (vazio quando não há);
  - `the final plan carries objects for read ∪ write set, from the plan's own snapshot`.
- [ ] **Step 2:** `node --test tests/read-set.test.mjs` — FAIL.
- [ ] **Step 3:** implementar com um único ponto de acesso à base no contexto (por exemplo `ctx.base(id)` que registra `element:<id>` em `ctx.read`), usado por `resolveRef`, `findMatch`, `mergeElementInto`, `insertElement`, `moveElement`, `mergeRelationships`, `runOps`/`removalCascade` e `rewriteView`. Schema: `objects` (objeto de strings ou null), `knownCandidates` (objeto de listas).
- [ ] **Step 4:** `npm test` — PASS (testes antigos inalterados).
- [ ] **Step 5:** commit `feat(merge): conjunto de leitura e versões por objeto no plano final`.

### Task 2: conferência por objeto no apply, duplicata em paralelo e histórico numerado

**Files:**
- Modify: `scripts/lib/store/contract.mjs`, `scripts/lib/store/ops.mjs`, `scripts/lib/store/markdown.mjs` (declara `versioning: 'object'`), `scripts/lib/store/folder.mjs` (`json` declara `'base'`), `scripts/lib/api.mjs` (`apply`), `scripts/archlens.mjs` (mensagem de conflito com nomes), `tests/store-contract.test.mjs`
- Create: `tests/versions.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`objects`, `knownCandidates`, `objectVersionsOf`, `writeSetOf`).
- Produces:
  - connector: `versioning: 'object'|'base'`; `objectVersions(refs, snapshot?) → Map`; `apply(ops, { expect, baseVersion })` — `expect` = `plan.objects` (conectores `object`) ou ausente (usa `baseVersion`, como hoje). Conflito: `storeError('E_STORE_CONFLICT', msg, { conflicts })`.
  - `versions.mjs`: `checkExpect(current: Map, expect: Record) → conflict[]`.
  - `ops.mjs` `applyOps`: `appendHistory` grava `entry` com `id = <entry.date>-<NN>` recalculado sobre o histórico atual (NN = rodadas do dia já presentes + 1, dois dígitos).
  - `api.apply`: devolve `entry` com o id definitivo; antes de gravar, refaz `findCandidates` para cada elemento criado (`entry.added`) contra a base atual e acusa `{ ref, reason: 'possible-duplicate', candidate }` para candidatos fora de `knownCandidates[id]`. Plano sem `objects` (antigo) num conector `object`: usa `baseVersion` (regra antiga).

- [ ] **Step 1: testes** em `tests/versions.test.mjs` (conector `markdown` numa pasta temporária, dois planos A e B feitos sobre a mesma versão):
  - `parallel plans on disjoint domains both apply` (A cria elemento em `vendas`, B em `rh`) — critério 1;
  - `a plan that writes what another wrote is refused, listing the object` (`conflicts[0].ref`, `planned`, `current`);
  - `a plan whose duplicate answer relied on an element another renamed is refused` — critério 2;
  - `a new relationship to an element another removed is refused` — critério 2;
  - `two plans creating the same concept with different ids: the second is refused as possible-duplicate`;
  - `two applies on the same day get -01 and -02`; `the apply returns the final entry id`;
  - `the json connector keeps whole-base versioning` (A e B disjuntos: o segundo é recusado como hoje) — critério 7;
  - CLI: a mensagem de conflito traz os nomes dos objetos e `--answers`.
  - Em `tests/store-contract.test.mjs`: `checkConnector` exige `versioning` e `objectVersions`.
- [ ] **Step 2:** `node --test tests/versions.test.mjs tests/store-contract.test.mjs` — FAIL.
- [ ] **Step 3:** implementar; no `fileConnector`, a conferência (`expect` ou `baseVersion`) roda sobre o `load()` do apply e de novo no `check` antes da troca de arquivos (como hoje).
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(store): versão por objeto no apply, duplicata criada em paralelo e rodada numerada ao gravar`.

### Task 3: vault sobre mapa de arquivos e layout gbrain

**Files:**
- Create: `scripts/lib/store/gbrain-layout.mjs`, `tests/gbrain-layout.test.mjs`, `tests/fixtures/gbrain-layout/*.md` (snapshots)
- Modify: `scripts/lib/store/markdown.mjs`, `scripts/lib/store/markdown-page.mjs`

**Interfaces:**
- Produces:
  - `markdown.mjs`: `readVaultFiles(files: Map<rel,string>, { anyFormat }) → { raw, notes, ctx }` e `vaultFiles({ raw, notes }, cur, { exists }) → Map<rel, string|null>`; `readVault(dir)`/`vaultContents(dir, …)` passam a delegar a elas (comportamento e bytes inalterados).
  - `markdown-page.mjs`: `renderPage(el, { …, linkPrefix = '' })`; `unlink` aceita caminhos com várias pastas (`[[archlens/application-component/x|…]]`); `parsePage` inalterado fora disso.
  - `gbrain-layout.mjs`: `toGbrainFiles(vault: Map, { prefix }) → Map` (elementos com wikilinks prefixados e tag `archlens`; `archlens.json` → `manifest.md`; `views.json` → `views/<key>.md`; `changelog.json` → `changelog.md`; `notes/*.md` → `notes/*.md` com frontmatter `type: archlens-note`, tag `archlens`; `gbrain-pack.yaml` com `path_prefixes` prefixados e os tipos `archlens-manifest`, `archlens-view`, `archlens-note`, `archlens-changelog`; sem `.markdownlint.json`); `fromGbrainFiles(files, { prefix }) → Map` (inverso, ignora tudo fora de `<prefix>/`); `assertGbrainIds(raw)` (lança `E_STORE_GBRAIN_SLUG` com a lista de ids e `E_STORE_GBRAIN_RESERVED`); `gbrainSlug(segment)` (porta de `slugifySegment` do gbrain `src/core/sync.ts`: NFD, sem acentos, minúsculas, mantém `[a-z0-9._ -]` e CJK, espaços → `-`, colapsa e apara `-`).

- [ ] **Step 1: testes:**
  - `readVaultFiles reads what readVault reads` (os três exemplos convertidos para markdown: `canonicalJson` igual);
  - `toGbrainFiles then fromGbrainFiles is the identity` (os três exemplos);
  - snapshots: um elemento com prefixo, `manifest.md`, uma visão, uma nota, `changelog.md` com duas rodadas;
  - `every page carries the archlens tag`; `files outside the prefix are ignored`;
  - `ids that are not gbrain slugs are refused` (`Loja.Pedidos`, `pagamento-crédito` → `E_STORE_GBRAIN_SLUG` listando os dois);
  - `reserved names are refused` (um elemento com id `index` → `E_STORE_GBRAIN_RESERVED`).
- [ ] **Step 2:** `node --test tests/gbrain-layout.test.mjs tests/markdown-store.test.mjs` — FAIL nos novos.
- [ ] **Step 3:** implementar; o resumo legível das páginas JSON é do builder (título, descrição; visão: notação e escopo; histórico: uma linha por rodada com data, resumo e `[[wikilinks]]`).
- [ ] **Step 4:** `npm test` — PASS (bytes do conector `markdown` inalterados: `tests/markdown-store.test.mjs` passa sem mudança de snapshot).
- [ ] **Step 5:** commit `feat(store): layout da base no gbrain sobre o vault em memória`.

### Task 4: `archlens init` e configuração do `store`

**Files:**
- Create: `scripts/lib/store/config.mjs`, `tests/init.test.mjs`
- Modify: `scripts/lib/store/folder.mjs` (`storeKind` aceita `gbrain`), `scripts/lib/store/index.mjs`, `scripts/archlens.mjs` (`case 'init'`, `HELP` em "Aplicar")

**Interfaces:**
- Produces: `initBase` também grava `<pasta>/.gitignore` com `.archlens/` (sem sobrescrever um existente: acrescenta a linha se faltar). `validateStore(store) → store` normalizado com padrões, ou `E_STORE_CONFIG` (campos faltando/estranhos; `credentials`/`token`/`password` em qualquer chave → recusa); `initBase(dir, { name, store }) → path` (`E_STORE_EXISTS` se já há `archlens.json`); `openStore` chama `gbrainGitConnector`/`gbrainMcpConnector` (stubs que lançam `E_STORE_UNSUPPORTED` até as Tasks 5 e 7).
- CLI: `archlens init <pasta> --store json|markdown|gbrain [--name N] [--mode git|mcp] [--repo R] [--remote origin] [--branch main] [--server S] [--source-id ID] [--prefix archlens]`. No modo git confere que `repo` é um clone com o `remote` e a `branch` (`git -C repo rev-parse`, `git -C repo remote get-url`, `git -C repo ls-remote --heads` — sem rede o `ls-remote` vira aviso, não erro).

- [ ] **Step 1: testes:** `init json/markdown` gravam o `archlens.json` mínimo; `init gbrain git` grava `{kind, mode, repo, remote, branch, prefix}` com padrões; `init gbrain mcp` exige `--server`; `init` recusa pasta com base (`E_STORE_EXISTS`); `repo` que não é clone git → `E_STORE_GIT`; chave de credencial no `store` → `E_STORE_CONFIG`.
- [ ] **Step 2:** `node --test tests/init.test.mjs` — FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(cli): archlens init com o repositório da base`.

### Task 5: conector gbrain, modo git

**Files:**
- Create: `scripts/lib/store/gbrain-git.mjs`, `tests/gbrain-git.test.mjs`
- Modify: `scripts/lib/store/index.mjs`

**Interfaces:**
- Consumes: Tasks 2 (contrato com `expect`), 3 (`toGbrainFiles`/`fromGbrainFiles`, `readVaultFiles`/`vaultFiles`, `assertGbrainIds`), 4 (`store` validado).
- Produces: `gbrainGitConnector(locator, store) → connector` com `kind: 'gbrain'`, `versioning: 'object'`. Ponta remota materializada numa **worktree destacada** `<pasta>/.archlens/tip/` (`git -C repo worktree add --detach <tip> FETCH_HEAD` na primeira vez; depois `fetch` + `checkout --detach FETCH_HEAD`), com `.archlens/` no `.gitignore` local gerado pelo `init`. `read()` = `fromGbrainFiles` dos arquivos de `<tip>/<prefix>/` → `readVaultFiles`. `apply` = `fetch` → conferência → arquivos de `toGbrainFiles(vaultFiles(next))` escritos em `<tip>/<prefix>/` → `git add -A <prefix>` → `commit -m "docs(arquitetura): <resumo>"` → `push <remote> HEAD:<branch>`; push recusado → `fetch`, reconferir e reaplicar as ops sobre a ponta nova (até 3 vezes). `history()` lê `changelog.md`.

- [ ] **Step 1: testes** (sem gbrain: um repositório bare numa pasta temporária como remoto e um clone dele como `repo`):
  - `read of an empty remote is null; the first apply creates the base in one commit`;
  - critério 1 e os dois casos do critério 2 (mesmos cenários da Task 2) contra o remoto;
  - `a rejected push is retried over the new tip when the objects did not cross` (simular outro push entre o fetch e o push);
  - `a failure before the push leaves the remote unchanged` (critério 3; remoto sem permissão de escrita simulado);
  - `the user's clone keeps its branch, working tree and index` (clone com arquivo modificado não commitado e noutra branch) — Review Focus;
  - `pages outside the prefix are never touched` — Review Focus;
  - `git errors become E_STORE_GIT with git's output`.
- [ ] **Step 2:** `node --test tests/gbrain-git.test.mjs` — FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(store): conector gbrain no modo git (worktree destacada, um commit por apply)`.

### Task 6: `store convert` para o gbrain (git) e de volta

**Files:**
- Modify: `scripts/lib/store/convert.mjs`, `scripts/archlens.mjs` (`store convert … --to gbrain --mode git --repo R [...]`), `tests/gbrain-git.test.mjs`

**Interfaces:**
- Consumes: Task 5.
- Produces: `convertToGbrain(locator, store) → { pages, commit }` (expect: nenhuma página do archlens em `<prefix>/`, senão `E_STORE_EXISTS`); `convertFromGbrain(locator, to)`; o `archlens.json` local vira o de configuração e `notes/`, `diagrams/` e arquivos desconhecidos ficam.

- [ ] **Step 1: testes:** `loja-online, telemedicina e repos go to gbrain and back unchanged` (`canonicalJson`) — critério 5; `converting onto a prefix that already holds a base is refused`; `ids that are not gbrain slugs are refused before writing` (Review Focus, via `assertGbrainIds`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(store): store convert para o gbrain (modo git) e de volta`.

### Task 7: modo MCP — espelho e `remote pull`

**Files:**
- Create: `scripts/lib/store/gbrain-mcp.mjs`, `tests/helpers/fake-gbrain.mjs`, `tests/gbrain-mcp.test.mjs`
- Modify: `scripts/lib/store/index.mjs`, `scripts/archlens.mjs` (`case 'remote'`)

**Interfaces:**
- Consumes: Tasks 2, 3, 4.
- Produces:
  - Espelho em `<pasta>/.archlens/mirror/` (arquivos no layout gbrain) + `.archlens/mirror/revisions.json` (`{ slug: revision }`) + `.archlens/mirror/sync.json` (`{ cursor: { since, slug }, pulledAt }`).
  - Pedido/resposta: arquivo de pedido `{ "archlens-remote": "1.0", id: "<uuid>", step: "list"|"get"|"read-check"|"apply"|"tools", calls: [{ tool, arguments }] }`; resposta `{ "archlens-remote": "1.0", request: "<id do pedido>", results: [<resultado bruto de cada chamada, na ordem>] }`; resposta com `request` diferente, número de resultados diferente ou resultado sem os campos esperados → `E_REMOTE_RESPONSE`.
  - CLI: `archlens remote <base> pull [--out pedido.json]` (passo `list`: `list_pages` com `tag: "archlens"`, `include_deleted: true`, `sort: updated_asc`, `limit: 100`, cursor `updated_after` + `updated_after_slug` desde `sync.json`); `archlens remote <base> pull --ingest <resp…>` (de `list` gera o pedido `get` com `get_page` `include_content: true, content_only: true` das páginas novas ou com revisão diferente, e remove do espelho as com `deleted_at`; de `get` grava as páginas e revisões). `archlens remote <base> check` / `check --ingest` (passo `tools`: `whoami` + `request_tools { surface: "full" }`; grava em `.archlens/session.json` se gravar está liberado).
  - `gbrainMcpConnector(locator, store)`: `kind: 'gbrain'`, `versioning: 'object'`; `read()` lê o espelho (sem espelho → `E_REMOTE_STALE`); `objectVersions` devolve as `revision` do `revisions.json`.
  - `tests/helpers/fake-gbrain.mjs`: `fakeGbrain()` com `call(tool, args)` para `list_pages`, `get_page`, `put_pages`, `delete_page`, `restore_page`, `whoami`, `request_tools`; revisões, `expected_revision`, `request_id` idempotente, soft-delete, `surface: 'starter'|'full'` e `failAfter(n)` para lote `partial`; `run(request) → response` (faz o papel do agente).

- [ ] **Step 1: testes:** `pull fills the mirror and plan reads it`; `a second pull only fetches what changed` (só as páginas alteradas no `get`); `a page deleted in gbrain leaves the mirror`; `pages without the archlens tag are ignored` (Review Focus); `plan, show and query on a base never pulled fail with E_REMOTE_STALE` (Review Focus); `a response to another request is refused with E_REMOTE_RESPONSE and the mirror is unchanged` (Review Focus); `check records whether writing is allowed (starter vs full)`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(store): conector gbrain no modo MCP — espelho e remote pull`.

### Task 8: modo MCP — apply, recibos, resume e undo

**Files:**
- Modify: `scripts/lib/store/gbrain-mcp.mjs`, `scripts/lib/api.mjs` (o `apply` de um conector MCP devolve o pedido em vez de gravar), `scripts/archlens.mjs` (`apply` com `--read-check`, `--receipts`, `--resume`, `--undo`), `tests/gbrain-mcp.test.mjs`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `archlens apply <base> p.json` (MCP): sem `session.json` com gravação liberada → `E_STORE_GBRAIN_SURFACE`; grava o pedido `read-check` (`get_page` das páginas de `read` que não estão em `writeSetOf`). `apply <base> p.json --read-check r.json`: revisão diferente → `E_STORE_CONFLICT`; senão valida, recheca duplicatas e grava o pedido `apply` (lotes `put_pages` ≤ 50 páginas e ≤ 8 MB com `expected_revision` de `plan.objects` (omitido para páginas novas), `delete_page` com `expected_revision`, um `request_id` por chamada, `changelog.md` por último) e abre o registro `.archlens/applies/<id>.json` (`{ plan, calls, before: { slug: { content, revision } }, state: 'requested' }`).
  - `apply <base> --receipts resp.json`: por página `committed` | `revision_conflict` | `pending`; atualiza espelho e registro (`state: 'committed'|'partial'`); `revision_conflict` em `changelog.md` → novo pedido só com o histórico relido e reacrescentado (até 5; depois `E_STORE_HISTORY_RETRY`).
  - `apply <base> --resume [<id>]`: pedido com o que falta (mesmo `request_id` para `pending`, novo para o não enviado). `apply <base> --undo [<id>]`: pedido que devolve o `before` das páginas gravadas (`expected_revision` = a que o apply gravou; páginas criadas → `delete_page`).
- [ ] **Step 1: testes** (com `fakeGbrain`): `a full apply round trip through the fake gbrain`; `a read-set page changed in gbrain after the plan is refused at read-check`; `a partial batch is completed by --resume` e `undone by --undo` — critério 4; `a history revision conflict is retried by rereading`; `writing with the starter surface is refused with E_STORE_GBRAIN_SURFACE`; `batches respect 50 pages and 8 MB`; `receipts for another request are refused` (Review Focus).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(store): apply no modo MCP com releitura, recibos, resume e undo`.

### Task 9: `store convert` no modo MCP

**Files:**
- Modify: `scripts/lib/store/convert.mjs`, `scripts/archlens.mjs`, `tests/gbrain-mcp.test.mjs`

**Interfaces:**
- Consumes: Tasks 6 e 8.
- Produces: `store convert <base local> --to gbrain --mode mcp --server S [...]` grava o pedido `apply` de criação (todas as páginas, sem `expected_revision`) e um registro; `--receipts` conclui e troca o `archlens.json`; `--to json|markdown` a partir de uma base MCP lê o espelho.
- [ ] **Step 1: testes:** `a local base goes to the fake gbrain and back unchanged` (os três exemplos); `pages already present make creation fail per page and the convert reports them`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** commit `feat(store): store convert para o gbrain no modo MCP`.

### Task 10: ambiente de teste com gbrain real e testes de integração

**Files:**
- Create: `scripts/test-env/gbrain-env.mjs`, `tests/gbrain-integration.test.mjs`
- Modify: `package.json` (`"test:gbrain": "GBRAIN_TEST=1 node --test tests/gbrain-integration.test.mjs"`), `.gitignore` (`.archlens/`)

**Interfaces:**
- Consumes: Tasks 5–9.
- Produces: `gbrainEnv.up({ ref }) → { home, repoBare, clone, gbrain(args) }` (clona `github.com/garrytan/gbrain` no `ref` fixado — o commit lido no spec, `ac1ba4c` — numa pasta temporária, `bun install` local, `GBRAIN_HOME` temporário, `gbrain init --pglite --no-embedding`, repositório bare + clone registrado como fonte do gbrain); `gbrainEnv.down()` apaga tudo. `gbrain(args)` roda `bun run <src>/src/cli.ts …` com o `GBRAIN_HOME` do ambiente. Sem Bun no PATH: o teste se declara `skip` com o motivo.

- [ ] **Step 1: testes** (`tests/gbrain-integration.test.mjs`, todos com `skip` quando `GBRAIN_TEST !== '1'`):
  - modo git: critérios 1, 2, 3 e 5 contra o gbrain real (`gbrain sync` entre os passos);
  - critério 6: depois do sync, `traverse_graph` (pelo comando do gbrain que expõe a operação) a partir de um container devolve vizinhos com tipos ArchiMate, e `list_pages` com `tag: archlens` lista manifesto, visões, notas e histórico;
  - modo MCP: o teste faz o papel do agente executando cada pedido pelo CLI do gbrain (a operação de mesmo nome), com o critério 4 (lote interrompido parando a execução no meio).
- [ ] **Step 2:** `npm run test:gbrain` — FAIL. **Step 3:** implementar o ambiente. **Step 4:** `npm run test:gbrain` — PASS; `npm test` — PASS (integração pulada). Anotar no PR o tempo de execução e a versão do gbrain.
- [ ] **Step 5:** commit `test(gbrain): ambiente local e integração com gbrain real`.

### Task 11: skills, referências, documentação e roadmap

**Files:**
- Modify: `skills/archlens-plan/SKILL.md`, `skills/archlens-apply/SKILL.md`, `skills/archlens-query/SKILL.md`, `references/base.md`, `references/merge.md`, `references/knowledge-doc.md`, `README.md`, `docs/GUIA.md`, `CHANGELOG.md`, `docs/superpowers/roadmap.md`, `tests/skills.test.mjs`

**Interfaces:**
- Consumes: os comandos das Tasks 4–9.
- [ ] **Step 1: testes** em `tests/skills.test.mjs`: `archlens init` só na skill archlens-apply (as outras encaminham); as três skills citam `archlens remote <base> pull` antes de ler uma base MCP e `archlens remote <base> check` uma vez por sessão; archlens-apply cita `--read-check`, `--receipts`, `--resume`, `--undo`; todo comando citado está no `HELP` (teste existente).
- [ ] **Step 2:** FAIL. **Step 3:** escrever:
  - `references/base.md`: repositórios suportados e `init`; um caminho de gravação por base; autenticação e ambiente fora do archlens; custo do modo MCP (bases grandes → git); `gbrain sweep` para as ligações tipadas no modo MCP; edição direta só no texto livre; ids precisam ser slugs do gbrain;
  - `references/merge.md`: versão por objeto, conjunto de leitura, duplicata em paralelo, janela residual do modo MCP, como refazer;
  - `references/knowledge-doc.md`: seção "Conector gbrain" (layout, modos, worktree destacada, espelho, registro do apply);
  - skills: na falta de base, perguntar o tipo e os parâmetros e encaminhar ao `init` (archlens-apply); os passos MCP;
  - README/GUIA; CHANGELOG `[Não lançado]` (Adicionado: versão por objeto, `init`, conector gbrain git/MCP; Mudado: rodada numerada ao gravar); roadmap: e.4 dividido em e.4.1 (feito, este), e.4.2 neo4j, e.4.3 relacional, e.4.4 S3.
- [ ] **Step 4:** `npm test` — PASS; `claude plugin validate .` sem avisos.
- [ ] **Step 5:** `graphify update .` e commit `docs: base compartilhada no gbrain (e.4.1)`.
