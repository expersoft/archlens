# archlens-ask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um pacote de texto puro (`portable/archlens-ask/`) que M365 Copilot e Claude Desktop usam como instruções para
consultar uma base archlens no gbrain via MCP, respondendo em markdown e/ou Mermaid com a semântica da `archlens-query`.

**Architecture:** A parte que vem do código (vocabulário, cores, inversos, formato das páginas) é gerada por
`scripts/gen-ask.mjs` a partir de `registry.mjs`, `render.mjs`, `explain.mjs` e `gbrain-pack.mjs`, sem alterar nenhum
deles. A parte de comportamento (fluxo, travessia, formatos, Mermaid) é escrita à mão. Um gabarito gerado pela CLI
sobre `examples/loja-online` serve à validação manual. `npm run check-ask` avisa quando o pacote está desatualizado,
fora do `npm test`.

**Tech Stack:** Node ≥ 18 (ESM, `node:test`), markdown, Mermaid (`flowchart` para ArchiMate, C4 nativo para C4), MCP do
gbrain (`get_page`, `list_pages`, `get_backlinks`, `traverse_graph`, `resolve_slugs`, `search`).

**Spec:** `docs/superpowers/specs/2026-10-25-archlens-ask-design.md`

## Global Constraints

- Branch `feat/archlens-ask`, PR para `develop-v2`. Não mexer em `main` (memória do projeto: main só no v0.4.0 completo).
- **Sentido único:** nenhum arquivo de `skills/`, `scripts/lib/`, `references/` ou `schemas/` é alterado. O gerador só
  *importa* ou *lê* esses arquivos.
- O pacote fica em `portable/archlens-ask/`, **fora de `skills/`** (`tests/skills.test.mjs` exige exatamente três skills).
- Somente leitura: o pacote não cita nenhuma ferramenta de escrita do gbrain (`put_page`, `put_pages`, `edit_page`,
  `delete_page`, `restore_page`).
- `INSTRUCTIONS.md` ≤ **8000 caracteres** (limite de instruções do agente declarativo do M365 Copilot; o construtor
  confere na documentação atual da Microsoft e ajusta a constante se mudou). O que não couber vai para `RULES.md`, que é
  anexado como conhecimento.
- ArchiMate em Mermaid `flowchart`; **C4 na sintaxe C4 nativa do Mermaid** (`C4Context`, `C4Container`, `C4Component`,
  `C4Dynamic`, `C4Deployment`), sem volta automática para `flowchart`.
- Cores do tema claro de `scripts/lib/render.mjs` (`:root` claro, linhas 424–430).
- `npm run check-ask` **não** entra no `npm test` nem bloqueia PR. Os testes do *gerador* (fixtures em pasta temporária)
  entram no `npm test`.
- Formato padrão de resposta sem pedido explícito: markdown com diagramas.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Textos do pacote em português, no tom das skills existentes.

## Review Focus

1. **Nome ambíguo** ("pedidos" casa `loja.pedidos`, `loja.db-pedidos`, `loja.pedidos.*`): o agente lista os candidatos
   e pergunta, sem escolher sozinho. Fixado na pergunta `ambiguo` do eval (Task 2) e na regra de `RULES.md` (Task 3).
2. **Travessia grande demais para o diagrama** (> 24 nós ArchiMate / > 12 C4): o agente entrega o markdown completo e
   propõe um recorte em vez de desenhar tudo. Pergunta `grande` do eval (Task 2).
3. **Direção do impacto invertida** em `access`/`composition`/`aggregation` (a direção de sustentação é destino →
   origem): exemplo resolvido em `EXAMPLES.md` (Task 4) com `access` e pergunta `impacto-container` (Task 2).
4. **Base sem ligações tipadas** (modo degradado): o agente detecta, avisa uma vez e marca hierarquia e grupos como
   possivelmente incompletos. Regra em `RULES.md` (Task 3) e passo no roteiro de validação do README (Task 5).
5. **Mais de uma base no mesmo gbrain, ou manifesto com formato ≠ `2.0`:** o agente pergunta qual base usar ou avisa
   a incompatibilidade. Regras em `INSTRUCTIONS.md` (Task 3) e pergunta `duas-bases` no roteiro manual (Task 2).

---

### Task 1: Gerador do `REFERENCE.md`

**Files:**
- Create: `scripts/gen-ask.mjs`
- Create: `portable/archlens-ask/REFERENCE.md` (gerado)
- Modify: `package.json` (scripts `ask` e `check-ask`)
- Test: `tests/ask.test.mjs`

**Interfaces:**
- Consumes: `ELEMENT_TYPES`, `RELATIONSHIP_TYPES`, `LAYER_ORDER`, `LAYER_LABELS`, `STATUSES`, `STORE_TAGS`, `C4_KINDS`,
  `C4_LABELS`, `C4_KIND_TYPES`, `supportDirection` de `scripts/lib/registry.mjs`; `GLOSSARY` de
  `scripts/lib/explain.mjs`; `ARCHIMATE_VIEWPOINTS` de `scripts/lib/query-archimate.mjs`; `gbrainPack` de
  `scripts/lib/store/gbrain-pack.mjs`; `COMMON_TAG` de `scripts/lib/store/gbrain-layout.mjs`; `parse` de
  `scripts/vendor/yaml/index.js`; o texto de `scripts/lib/render.mjs`; `version` de `package.json`.
- Produces:
  - `export const ASK_DIR` (URL/caminho de `portable/archlens-ask/`)
  - `export function themeColors(renderSource: string): Record<string, string>`: as variáveis CSS do **primeiro** bloco
    `:root` (tema claro), por exemplo `{ biz: '#fff5a8', 'biz-s': '#a89a2c', 'c4-system': '#1168bd', focus: '#f2b705', … }`
  - `export function relationshipInverses(): Record<string, string>`: inverso de cada tipo de relação, lido do YAML que
    `gbrainPack` gera para um modelo sintético com um elemento e uma relação de cada tipo (`link_types[].inverse`)
  - `export function buildReference(): string`: o conteúdo de `REFERENCE.md`
  - `export function askFiles(): Map<string, string>`: caminho relativo ao repositório → conteúdo gerado (nesta task, só
    `portable/archlens-ask/REFERENCE.md`; a Task 2 acrescenta o gabarito)
  - CLI: `node scripts/gen-ask.mjs` grava `askFiles()`; `--check` lista os arquivos desatualizados no stderr e sai com 1
    (a Task 3 acrescenta a checagem de cobertura ao `--check`)

`REFERENCE.md` tem, nesta ordem:
1. cabeçalho: "Gerado por `scripts/gen-ask.mjs` a partir do archlens <versão>; não edite", e o formato de base `2.0`;
2. **Tipos de elemento:** tabela `tipo · rótulo · camada · aspecto`, agrupada por camada na ordem `LAYER_ORDER`, com o
   rótulo da camada de `LAYER_LABELS`;
3. **Tipos de relação:** tabela `tipo · rótulo do glossário · força · inverso · quem sustenta quem · significado ·
   leitura`. "Quem sustenta quem" vem de `supportDirection({ type, from: 'origem', to: 'destino' })`: `origem → destino`,
   `destino → origem` ou `—` (null). Para `triggering`/`flow`, acrescente "só quando pedido";
4. **Perfil C4:** tabela `kind · rótulo · tipos ArchiMate aceitos`, e `STORE_TAGS` (vira `SystemDb`/`ContainerDb`);
5. **Status:** a lista `STATUSES`;
6. **Viewpoints ArchiMate:** a lista `ARCHIMATE_VIEWPOINTS`;
7. **Cores:** tabela por camada (`biz`, `app`, `tech`, `mot`, `str`, `impl`, `oth`: preenchimento e borda `-s`) e C4
   (`c4-person`, `c4-system`, `c4-container`, `c4-component`, `c4-external`, `c4-ink`, `c4-component-ink`), `focus`;
   depois um bloco ```` ```text ```` com os `classDef` Mermaid prontos (`classDef business fill:#fff5a8,stroke:#a89a2c,color:#18202c`
   etc., um por camada, mais `classDef anchor stroke:#f2b705,stroke-width:4px` e `classDef draft stroke-dasharray:5 3`)
   e um com os `UpdateElementStyle` C4 de exemplo (`UpdateElementStyle(id, $bgColor="#1168bd", $fontColor="#ffffff", $borderColor="#0b3d78")`);
8. **Páginas no gbrain:** tabela fixa do spec (seção *O que a base no gbrain oferece*), o tag comum `COMMON_TAG`, os
   tags por tipo `archlens/<tipo>` e `archlens/c4/<kind>`, e os tipos de ligação extras `part_of`/`composed_of` e
   `member_of`/`has_member`.

- [ ] **Step 1: Write the failing tests** em `tests/ask.test.mjs`

```js
import { themeColors, relationshipInverses, buildReference } from '../scripts/gen-ask.mjs';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from '../scripts/lib/registry.mjs';

test('themeColors reads the light theme only', () => {
  const css = ':root{--biz:#fff5a8;--biz-s:#a89a2c;}\n@media (prefers-color-scheme: dark){:root{--biz:#5a5220;}}';
  assert.deepEqual(themeColors(css), { biz: '#fff5a8', 'biz-s': '#a89a2c' });
});
test('relationshipInverses covers every relationship type', () => {
  const inv = relationshipInverses();
  assert.deepEqual(Object.keys(inv).sort(), Object.keys(RELATIONSHIP_TYPES).sort());
  assert.equal(inv.serving, 'served_by');
  assert.equal(inv.triggering, 'triggered_by');
});
test('REFERENCE lists every element and relationship type, colors and support direction', () => {
  const md = buildReference();
  for (const t of Object.keys(ELEMENT_TYPES)) assert.match(md, new RegExp(`\\| \`${t}\` \\|`));
  for (const t of Object.keys(RELATIONSHIP_TYPES)) assert.match(md, new RegExp(`\\| \`${t}\` \\|`));
  for (const c of ['#fff5a8', '#a89a2c', '#b6eef6', '#cbe8b9', '#1168bd', '#3f86d0', '#8cc0f2', '#8791a1', '#f2b705']) assert.ok(md.includes(c), c);
  assert.match(md, /\| `access` \|[^\n]*destino → origem/);
  assert.match(md, /\| `serving` \|[^\n]*origem → destino/);
  assert.match(md, /classDef business fill:#fff5a8,stroke:#a89a2c/);
  assert.match(md, /UpdateElementStyle\(/);
});
```

(Os imports de `test`/`assert` seguem o padrão dos outros arquivos de `tests/`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ask.test.mjs`
Expected: FAIL (`Cannot find module '../scripts/gen-ask.mjs'`)

- [ ] **Step 3: Implement `scripts/gen-ask.mjs`** com as funções de *Produces*, no estilo de `scripts/gen-schemas.mjs`
  (comentário de uma linha no topo, `if (import.meta.url === \`file://${process.argv[1]}\`)` para a CLI, `✓ <arquivo>`
  ao gravar). `themeColors` lê do primeiro `:root{` até o `}` que o fecha, com a regex `--([\w-]+):\s*(#[0-9a-fA-F]{3,8})`.
  `--check` compara `askFiles()` com o disco e imprime `archlens: <arquivo> desatualizado; rode "npm run ask"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ask.test.mjs`
Expected: PASS

- [ ] **Step 5: Add scripts to `package.json`**: `"ask": "node scripts/gen-ask.mjs"`, `"check-ask": "node scripts/gen-ask.mjs --check"`.
  Gere o arquivo: `npm run ask`, depois `npm run check-ask`.
  Expected: `✓ portable/archlens-ask/REFERENCE.md`, depois saída 0 sem mensagens.

- [ ] **Step 6: Run the full suite** — `npm test` → PASS (inclusive `tests/skills.test.mjs`, que continua vendo três skills).

- [ ] **Step 7: Commit**

```bash
git add scripts/gen-ask.mjs tests/ask.test.mjs package.json portable/archlens-ask/REFERENCE.md
git commit -m "feat(ask): gerador do REFERENCE.md do archlens-ask"
```

---

### Task 2: Conjunto de perguntas e gabarito

**Files:**
- Create: `portable/archlens-ask/eval/perguntas.json` (escrito à mão)
- Create: `portable/archlens-ask/eval/gabarito/<id>.json` (gerados)
- Modify: `scripts/gen-ask.mjs` (`askFiles()` passa a incluir o gabarito)
- Test: `tests/ask.test.mjs`

**Interfaces:**
- Consumes: `askFiles()` (Task 1); a CLI `node scripts/archlens.mjs query <base> (--spec J | --view k | --element id) --format json`.
- Produces:
  - `export const EVAL_BASE = 'examples/loja-online/architecture'` (mesmo conteúdo que a demonstração
    `loja-online-gbrain` carrega no gbrain)
  - `export function buildGabarito(perguntas: Pergunta[]): Map<string, string>`: `portable/archlens-ask/eval/gabarito/<id>.json`
    → a saída JSON da CLI, para cada pergunta com `spec`, `view` ou `element`
  - Formato de `perguntas.json`: `[{ id, pergunta, spec?, view?, element?, depth?, esperado? }]`. `esperado` é o critério
    em texto para as perguntas de comportamento sem gabarito da CLI.

Perguntas (ids fixos):

| id | pergunta | consulta |
|---|---|---|
| `suporte-processo` | "Que aplicações e infraestrutura sustentam o processo de checkout?" | `spec {"notation":"archimate","viewpoint":"layered","anchor":"bp-checkout","traverse":{"mode":"supporters"},"granularity":"container"}` |
| `suporte-produto` | "O que sustenta o produto Venda Online?" | `spec {"notation":"archimate","viewpoint":"product-support","anchor":"prod-venda"}` |
| `impacto-container` | "O que é impactado se a API de Pedidos cair?" | `spec {"notation":"archimate","viewpoint":"impact","anchor":"loja.pedidos"}` |
| `consumidores-evento` | "Quem publica e quem consome o barramento de eventos da loja?" | `spec {"notation":"c4","level":"container","scope":"loja","focus":["loja.eventos"],"depth":1}` |
| `contexto` | "Qual o contexto da Plataforma de E-commerce?" | `view contexto` |
| `containers` | "Quais os containers da loja?" | `view containers` |
| `cartao` | "Me fale da API de Pedidos." | `element loja.pedidos` |
| `as-is` | "Como está hoje a camada de aplicação?" | `spec {"notation":"archimate","viewpoint":"application","granularity":"container","status":["active","deprecated"]}` |
| `grupos` | "Como Vendas e Back-office se integram?" | `view vendas-x-backoffice` |
| `visao-salva` | "Mostre o suporte ao checkout." | `view suporte-checkout` |
| `ambiguo` | "Me fale de pedidos." | `esperado`: lista os candidatos (`loja.pedidos`, `loja.db-pedidos` e os componentes `loja.pedidos.*`) e pergunta qual |
| `grande` | "Mostre toda a camada de aplicação com componentes." | `spec {"notation":"archimate","viewpoint":"application"}` + `esperado`: markdown completo e proposta de recorte em vez de um diagrama com todos os nós |
| `duas-bases` | (roteiro manual) | `esperado`: com dois prefixos `archlens` no gbrain, pergunta qual base |

- [ ] **Step 1: Write the failing test**

```js
import { buildGabarito, EVAL_BASE } from '../scripts/gen-ask.mjs';
test('buildGabarito runs the CLI query for each question with a query', () => {
  const g = buildGabarito([
    { id: 'a', pergunta: 'x', element: 'loja.pedidos' },
    { id: 'b', pergunta: 'y', esperado: 'pergunta qual' },
  ]);
  assert.deepEqual([...g.keys()], ['portable/archlens-ask/eval/gabarito/a.json']);
  const a = JSON.parse(g.get('portable/archlens-ask/eval/gabarito/a.json'));
  assert.equal(a.element.id, 'loja.pedidos');
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/ask.test.mjs` → FAIL (`buildGabarito` não exportado)

- [ ] **Step 3: Implement `buildGabarito`** com `spawnSync(process.execPath, [CLI, 'query', EVAL_BASE, …, '--format', 'json'])`;
  erro da CLI vira exceção com o stderr. `askFiles()` passa a ler `eval/perguntas.json` e incluir `buildGabarito(...)`.
  Escreva `eval/perguntas.json` com a tabela acima.

- [ ] **Step 4: Run tests and generate** — `node --test tests/ask.test.mjs` → PASS; `npm run ask` → um `✓` por gabarito
  (10 arquivos); `npm run check-ask` → saída 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-ask.mjs tests/ask.test.mjs portable/archlens-ask/eval
git commit -m "feat(ask): perguntas de validação e gabarito gerado pela CLI"
```

---

### Task 3: `INSTRUCTIONS.md`, `RULES.md` e a checagem de cobertura

**Files:**
- Create: `portable/archlens-ask/INSTRUCTIONS.md` (≤ 8000 caracteres)
- Create: `portable/archlens-ask/RULES.md`
- Modify: `scripts/gen-ask.mjs` (`checkCoverage`, e o `--check` passa a chamá-la)
- Test: `tests/ask.test.mjs`

**Interfaces:**
- Consumes: `ARCHIMATE_VIEWPOINTS`; o texto de `references/views.md`; `ASK_DIR` (Task 1).
- Produces:
  - `export const INSTRUCTIONS_LIMIT = 8000`
  - `export function coverageTerms(viewsMd: string): string[]`: `ARCHIMATE_VIEWPOINTS` ∪ os valores com crase da linha
    `| \`level\` |` ∪ o primeiro campo com crase de cada linha das tabelas de `views.md` (os campos de spec: `key`,
    `notation`, `include`, `exclude`, `status`, `scope`, `focus`, `depth`, `expand`, `steps`, `derive`, `viewpoint`,
    `layers`, `types`, `anchor`, `traverse.mode`, `granularity`, `collapse`, `nesting`, `output`…), sem os valores de
    `style` da tabela de layout
  - `export function checkCoverage({ instructions: string, rules: string, viewsMd: string }): string[]`: problemas
    encontrados (vazio = ok): `INSTRUCTIONS.md tem N caracteres (limite 8000)` e `termo "<t>" não aparece em
    INSTRUCTIONS.md nem em RULES.md`, este último para cada termo de `coverageTerms` ausente, procurado como `` `t` ``
  - `--check` agora imprime também esses problemas e sai com 1 se houver algum

**Conteúdo de `INSTRUCTIONS.md`** (o "prompt de sistema"; abre com "archlens-ask <versão> · base archlens 2.0"):
1. Papel e escopo: responde perguntas sobre a arquitetura da empresa a partir da base archlens no gbrain; **somente
   leitura**; mudanças vão para o archlens completo (Claude Code ou harness compatível, skill `archlens-plan`). Nunca
   inventa elemento ou relação; diz o que não verificou.
2. Ferramentas: só `get_page`, `list_pages`, `get_backlinks`, `traverse_graph`, `resolve_slugs`, `search`. Tipo e
   direção de uma relação **só** pelo `relationships` do frontmatter da página de origem.
3. Fluxo: achar a base (`manifest.md` com tag `archlens`; várias → perguntar; formato ≠ `2.0` → avisar) → detectar o
   modo de ligações (uma vez) → classificar o pedido (tabela em `RULES.md`) → resolver ids (ambíguo → listar e
   perguntar) → ler o subgrafo → montar → entregar.
4. Formatos: markdown, só diagrama, ou markdown com diagramas (padrão); sempre a linha "Recorte: <spec em JSON>" e o que
   ficou de fora.
5. Ponteiros: "Regras de travessia, tabela pedido → recorte e modelos Mermaid: `RULES.md`. Vocabulário, cores e
   formato das páginas: `REFERENCE.md`. Exemplos: `EXAMPLES.md`."

**Conteúdo de `RULES.md`** (seções, nesta ordem; tudo do spec, seção *Comportamento da skill*):
1. Pedido → recorte: a tabela de `skills/archlens-query/SKILL.md` (*Pedido → view spec*), com "view spec" virando
   "recorte"; visões salvas (`views/<key>.md`, bloco `archlens-json`) têm precedência quando batem com o pedido. Campos
   de apresentação (`layout`, `layout.style`, `animation`, `edgeLabels`) são ignorados.
2. Leitura no gbrain: modo com ligações tipadas × degradado; detecção (pai conhecido → `get_backlinks` do pai devolve o
   filho como `part_of`?); no degradado, `list_pages` por tag `archlens/<tipo>` + `get_page`, aviso de custo antes de
   ler mais de ~30 páginas, e a ressalva "hierarquia e grupos podem estar incompletos".
3. Travessia: `supporters`/`dependents`/`both`, a tabela de direção (aponta para `REFERENCE.md`), `via` padrão,
   `maxDepth` 12, hierarquia (sobe ao pai, não desce depois de subir).
4. Granularidade, `collapse` e derivação (tipo mais fraco, caminho mais curto até a âncora, um por elemento; empate:
   qualquer um, dizendo "derivada").
5. C4: níveis, elevação, setas via intermediários (`application-service`, `-interface`, `-function`, `-process`),
   `expand`, `steps`.
6. Status (padrão sem `retired`; as-is; to-be), grupos (`only`, `crossOnly`, `frames`, `depth`), `nesting`.
7. Saída markdown: o layout de `views.md` *Consulta em markdown* e o cartão do elemento.
8. Mermaid ArchiMate: modelo completo comentado (`flowchart TB`, `subgraph` por camada em `LAYER_ORDER`, nó
   `id["«tipo»<br/>Nome"]`, `class` por camada, âncora com `anchor`, `draft` tracejado, derivadas `-.->|"serving (derivada)"|`,
   `nesting: nested` como `subgraph` interno). Ids Mermaid: o id do elemento com `.` e `-` trocados por `_`.
9. Mermaid C4: um modelo por nível (`C4Context`, `C4Container` com `System_Boundary`, `C4Component` com
   `Container_Boundary`, `C4Dynamic` com `RelIndex`, `C4Deployment`), `_Ext` para `external: true`, `SystemDb`/
   `ContainerDb` para `STORE_TAGS` e `SystemQueue`/`ContainerQueue` para `topic`/`queue`/`messaging`, molduras de grupo
   com `Boundary`, cores com `UpdateElementStyle`, offsets de rótulo com `UpdateRelStyle`.
10. Legibilidade: > 12 nós C4 ou > 24 ArchiMate → markdown completo + proposta de recorte (granularidade, foco +
    profundidade, grupos), ou diagrama recortado dizendo o que saiu.

- [ ] **Step 1: Write the failing tests**

```js
import { coverageTerms, checkCoverage, INSTRUCTIONS_LIMIT } from '../scripts/gen-ask.mjs';
const viewsMd = readFileSync(new URL('../references/views.md', import.meta.url), 'utf8');
test('coverageTerms has viewpoints, C4 levels and spec fields', () => {
  const t = coverageTerms(viewsMd);
  for (const x of ['impact', 'product-support', 'landscape', 'dynamic', 'anchor', 'granularity', 'nesting', 'focus']) assert.ok(t.includes(x), x);
  assert.ok(!t.includes('bands-flow'));
});
test('checkCoverage reports size and missing terms', () => {
  const ok = coverageTerms(viewsMd).map(x => `\`${x}\``).join(' ');
  assert.deepEqual(checkCoverage({ instructions: 'x', rules: ok, viewsMd }), []);
  const problems = checkCoverage({ instructions: 'x'.repeat(INSTRUCTIONS_LIMIT + 1), rules: ok.replace('`anchor`', ''), viewsMd });
  assert.equal(problems.length, 2);
  assert.match(problems.join('\n'), /anchor/);
});
```

- [ ] **Step 2: Run to verify they fail** — `node --test tests/ask.test.mjs` → FAIL (exports ausentes)

- [ ] **Step 3: Implement `coverageTerms` e `checkCoverage`**, e ligue ao `--check` lendo os dois arquivos de `ASK_DIR`.

- [ ] **Step 4: Run tests** — `node --test tests/ask.test.mjs` → PASS

- [ ] **Step 5: Write `INSTRUCTIONS.md` e `RULES.md`** com o conteúdo acima.

- [ ] **Step 6: Verify** — `npm run check-ask` → saída 0. `wc -m portable/archlens-ask/INSTRUCTIONS.md` → ≤ 8000.
  `grep -nE 'put_page|edit_page|delete_page|restore_page' portable/archlens-ask/*.md` → nenhuma linha.

- [ ] **Step 7: Validate the Mermaid templates** — cole cada modelo de `RULES.md` (um ArchiMate e um por nível C4) no
  Mermaid Live Editor ou num preview de markdown do GitHub e confirme que renderiza sem erro. Registre a versão do
  Mermaid usada num comentário no fim de `RULES.md`.

- [ ] **Step 8: Commit**

```bash
git add scripts/gen-ask.mjs tests/ask.test.mjs portable/archlens-ask/INSTRUCTIONS.md portable/archlens-ask/RULES.md
git commit -m "feat(ask): instruções, regras e checagem de cobertura"
```

---

### Task 4: `EXAMPLES.md`

**Files:**
- Create: `portable/archlens-ask/EXAMPLES.md`

**Interfaces:**
- Consumes: os gabaritos `suporte-processo`, `impacto-container`, `containers` e `cartao` (Task 2); os modelos de
  `RULES.md` (Task 3).

Quatro exemplos resolvidos ponta a ponta sobre `loja-online`, cada um com: pergunta → recorte escolhido (JSON) →
chamadas MCP na ordem (com os slugs `archlens/<tipo>/<id>`) → raciocínio da travessia em passos curtos → resposta final.
Os exemplos são:
1. `suporte-processo` (markdown + Mermaid ArchiMate, com uma relação derivada);
2. `impacto-container` (markdown com matriz; mostra explicitamente uma relação `access` lida "dado → quem acessa");
3. `containers` (só diagrama, C4 nativo);
4. `cartao` (só markdown).

- [ ] **Step 1: Write `EXAMPLES.md`.** Os elementos e relações de cada resposta são **exatamente** os do gabarito
  correspondente (derivadas: mesmas pontas). Os diagramas seguem os modelos de `RULES.md`.

- [ ] **Step 2: Verify against the gabarito** — para cada exemplo, compare a lista de ids da resposta com
  `jq '[.. | .id? // empty] | unique' portable/archlens-ask/eval/gabarito/<id>.json`. Expected: mesmos ids.
  Renderize os diagramas como no Step 7 da Task 3.

- [ ] **Step 3: Commit**

```bash
git add portable/archlens-ask/EXAMPLES.md
git commit -m "docs(ask): exemplos resolvidos sobre a loja-online"
```

---

### Task 5: README do pacote, `AGENTS.md`, `CLAUDE.md`, changelog e roadmap

**Files:**
- Create: `portable/archlens-ask/README.md`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Modify: `CHANGELOG.md` (entrada em "não lançado")
- Modify: `docs/superpowers/roadmap.md` (linha do archlens-ask, com links para spec e plano)

**`portable/archlens-ask/README.md`:**
1. O que é, para quem, somente leitura, e os arquivos (`INSTRUCTIONS.md` = instruções; `RULES.md`, `REFERENCE.md`,
   `EXAMPLES.md` = conhecimento anexado).
2. **M365 Copilot:** agente (Copilot Studio ou agente declarativo) com o MCP do gbrain como ferramenta/ação, `INSTRUCTIONS.md`
   como instruções, os outros três como conhecimento. O gbrain precisa ser acessível pela rede.
3. **Claude Desktop:** MCP do gbrain configurado (stdio local, por exemplo o da demonstração
   `node examples/loja-online-gbrain/setup.mjs gbrain serve`, ou o comando equivalente que o `setup.mjs` expõe; confira),
   projeto com `INSTRUCTIONS.md` nas instruções e os outros três como conhecimento do projeto.
4. Nota curta para Gems e outros agentes com MCP.
5. Pré-requisito recomendado: ligações tipadas (modo git ou `gbrain sweep`); o que muda no modo degradado.
6. Limites conhecidos: tamanho das instruções (8000 caracteres no M365), C4 do Mermaid experimental (o que não
   renderizar fica anotado aqui), layout não controlável.
7. **Validação:** como rodar as perguntas de `eval/perguntas.json` e comparar com `eval/gabarito/` (elementos e
   relações diretas iguais; derivadas com as mesmas pontas). Inclui um passo em base sem ligações tipadas e o roteiro
   `duas-bases`. Tabela de resultados por plataforma (M365 Copilot, Claude Desktop), inicialmente vazia.
8. **Manutenção:** o mesmo checklist do `AGENTS.md`.

**`AGENTS.md`** (raiz; curto, só sobre isto; texto do spec, seção *Relação com o archlens completo*):
- O `portable/archlens-ask/` é derivado do archlens completo. **Toda evolução ou correção** do archlens (skills, CLI,
  `references/`, `scripts/lib/`, formatos, conector gbrain) inclui, no mesmo PR:
  1. avaliar se a mudança toca o que o archlens-ask copia: tipos, relações, travessia e derivação, specs de visão, níveis
     C4, viewpoints, páginas no gbrain, formato do `query --format md`, cores;
  2. se tocar: `npm run ask`, atualizar `INSTRUCTIONS.md`/`RULES.md`/`EXAMPLES.md` à mão e, se mudar o resultado de uma
     pergunta, `eval/perguntas.json` (o gabarito é regenerado pelo `npm run ask`);
  3. `npm run check-ask` antes de concluir;
  4. se não tocar: escrever "archlens-ask: sem impacto" na descrição do PR.
- Sentido único: nunca mudar as três skills, a CLI ou os formatos para acomodar o archlens-ask.

**`CLAUDE.md`:** uma linha `@AGENTS.md`.

- [ ] **Step 1: Write the five files** como acima.
- [ ] **Step 2: Verify** — `npm test` → PASS; `npm run check-ask` → saída 0; `npm run check-plugin` → saída 0;
  `git status` não mostra mudança em `skills/`, `scripts/lib/`, `references/`, `schemas/`.
- [ ] **Step 3: Commit**

```bash
git add portable/archlens-ask/README.md AGENTS.md CLAUDE.md CHANGELOG.md docs/superpowers/roadmap.md
git commit -m "docs(ask): README do pacote e instruções de manutenção para agentes de codificação"
```

---

### Task 6: Ensaio pelo gbrain da demonstração

Um teste de fumaça das instruções antes da validação manual do usuário. Um agente faz o papel do Copilot e só pode usar
as ferramentas do gbrain.

**Files:**
- Modify: `portable/archlens-ask/README.md` (resultado do ensaio na tabela de validação, linha "ensaio (Claude Code via
  `gbrain call`)")
- Modify (se o ensaio revelar falhas de instrução): `INSTRUCTIONS.md`, `RULES.md`, `EXAMPLES.md`

- [ ] **Step 1: Montar a demonstração** — `node examples/loja-online-gbrain/setup.mjs` → termina sem erro (requer Bun ≥ 1.4).
- [ ] **Step 2: Rodar o ensaio** — dispare um subagente novo que recebe **somente** o conteúdo de `INSTRUCTIONS.md`,
  `RULES.md`, `REFERENCE.md` e `EXAMPLES.md` e a regra: "suas únicas ferramentas são
  `node examples/loja-online-gbrain/setup.mjs gbrain call <ferramenta> '<json>'` com as ferramentas de leitura listadas
  nas instruções; não leia nenhum outro arquivo do repositório". Peça as perguntas `suporte-processo`,
  `impacto-container`, `consumidores-evento`, `cartao`, `ambiguo` e `grande`.
- [ ] **Step 3: Comparar** cada resposta com o gabarito, pelo critério do spec (elementos e relações diretas iguais;
  derivadas com as mesmas pontas; `ambiguo`/`grande` pelo `esperado`). Renderize os diagramas devolvidos.
- [ ] **Step 4: Corrigir as instruções** onde a falha for de instrução (não de capacidade do modelo), rodar
  `npm run check-ask` e repetir o ensaio só das perguntas que falharam. Registre no README o resultado final e as
  divergências que restarem.
- [ ] **Step 5: Desmontar** a demonstração conforme o README dela, e conferir que `.demo/` não entrou no git.
- [ ] **Step 6: Commit**

```bash
git add portable/archlens-ask
git commit -m "test(ask): ensaio das instruções pelo gbrain da demonstração"
```
