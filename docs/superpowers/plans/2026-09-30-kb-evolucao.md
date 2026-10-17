# Evolução incremental da base de conhecimento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir que o `ARCHITECTURE.md` evolua por rodadas de enriquecimento (delta → plano → apply) com
casamento de entidades, conflitos resolvidos pelo usuário, proveniência, ciclo de vida e histórico.

**Architecture:** dois módulos puros novos (`match.mjs` para nomes, `merge.mjs` para o motor) mais
utilitários (`sources.mjs`, `raw-tree.mjs`). O mesmo motor `runMerge` roda em modo `plan` (simula com
respostas padrão e registra as perguntas) e em modo `apply` (usa as respostas do plano), o que garante
que o apply faz exatamente o que o plano mostrou. O modelo ganha `status`, `sources`, `aliases` e
`changelog`; as consultas filtram por status; o `doc` mostra fontes, ciclo de vida e histórico; a CLI
ganha `merge --plan/--apply`.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test` + `node:assert/strict`, `node:crypto`. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-30-kb-evolucao-design.md`

## Global Constraints

- Node ≥ 18; sem dependências de runtime novas (só módulos `node:*`).
- Mensagens ao usuário em português; comentários de código em inglês (padrão do repo).
- Códigos de erro/aviso estáveis `E_*` / `W_*`; todo erro lançado é `Error` com `.code`.
- `status` ∈ `planned`, `active` (padrão), `deprecated`, `retired`.
- `sources[].kind` ∈ `prompt`, `repo`, `doc`, `manual`; chave de deduplicação `kind+ref+path`.
- Limiar fuzzy: `FUZZY_THRESHOLD = 0.75` em `scripts/lib/match.mjs`.
- Delta: `"archlens-delta": "1.0"`. Plano: `"archlens-plan": "1.0"`.
- Seção "Histórico" do `.md`: últimas 10 entradas.
- Fonte de verdade: o bloco `archlens-json` do `ARCHITECTURE.md`.
- Git neste repositório (WSL) exige `git -c safe.directory="$PWD" …`; todos os commits vão na branch `feat/kb-evolucao`
  e terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Decisões de detalhe (não estavam no spec; revisar)

1. **"Mesmo pai e mesma tecnologia" exige nome minimamente parecido** (similaridade ≥ 0,4). Sem isso,
   todo container Node.js novo num sistema com outro Node.js viraria "possível duplicata" (ex.: `tele.api` e
   `tele.notificador` no exemplo telemedicina), o que enche o usuário de perguntas.
2. **Casamento por `name`** só olha **aliases** da base (não ids), para "Loja" não casar com o sistema `loja`.
3. **Comparação de `name`** ignora acento/caixa/pontuação (`aliasKey`); de `type`, ignora o prefixo `archimate:`.
4. **`rename` guarda o nome antigo como alias**, para deltas futuros que usem o nome antigo ainda casarem.
5. **`dup: same` grava o id do delta como alias** do elemento da base (não o nome).
6. **`inferred: false` no delta confirma** um item inferido (remove `inferred` e `confidence`).
7. **`remove` também ajusta visões:** remove as que têm `scope`/`anchor` removido e tira os ids removidos de
   `focus`/`expand`/`include`/`steps` (listado no plano em `cascade.views`).
8. Códigos extras: `E_DELTA_SCHEMA`, `E_PLAN_SCHEMA`, `E_PLAN_RESOLUTION`, `E_MERGE_INVALID`, `E_OP`, `E_VIEW_STATUS`.
9. Os exemplos passam a ser construídos a partir do `ARCHITECTURE.md` (`model.json` removido), com `--name model`
   para manter `model.html` e `model.shots/`.

## Review Focus

1. **Filho listado antes do pai no delta, com o pai referenciado por alias** → o filho deve ficar aninhado no
   elemento canônico da base. Teste na Task 4 (`elements match by alias in both directions…`).
2. **Reaplicar o mesmo arquivo de plano depois do apply** → recusa `E_PLAN_STALE`, sem gravar duas vezes. Teste na Task 4.
3. **Base antiga com `source: "<trecho>"`** tocada pelo merge → vira `sources` sem perder o trecho. Teste na Task 4.
4. **Referência com erro de digitação** numa relação ou op → plano bloqueado, apply não grava nada. Testes nas Tasks 5 e 7.
5. **Visão com `scope` num elemento oculto pelo status** → `E_VIEW_STATUS` com dica, não "não existe". Teste na Task 3.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/match.mjs` (novo) | `aliasKey`, `similarity`, `findCandidates`, `FUZZY_THRESHOLD` |
| `scripts/lib/sources.mjs` (novo) | `SOURCE_KINDS`, `readSources`, `deltaSources`, `addSources`, `sourceKey`, `sourceProblem` |
| `scripts/lib/raw-tree.mjs` (novo) | índice da árvore crua: `indexTree`, `orderDelta`, `attach`, `detach`, `descendantsOf` |
| `scripts/lib/merge.mjs` (novo) | `planMerge`, `applyPlan`, `hashRaw`, `canonicalJson`, `mergeError` |
| `scripts/lib/merge-report.mjs` (novo) | `formatPlanReport(plan)` |
| `scripts/lib/registry.mjs` | `STATUSES` |
| `scripts/lib/model.mjs` | campos novos, `canonicalRel`, `E_STATUS`, `E_SOURCE`, `E_ALIAS_CONFLICT` |
| `scripts/lib/validate.mjs` | `W_RETIRED_DEPENDENCY` |
| `scripts/lib/query.mjs` | `filterByStatus`, `E_VIEW_STATUS` |
| `scripts/lib/query-c4.mjs`, `query-archimate.mjs` | `status` nos nós do IR |
| `scripts/lib/render.mjs` | classes `st-deprecated` / `st-planned`, painel |
| `scripts/lib/doc.mjs` | frontmatter, colunas Status/Fontes, seções Ciclo de vida, Fontes, Histórico |
| `scripts/archlens.mjs` | comando `merge`; `doc`/`build` no próprio `.md` |
| `scripts/gen-schemas.mjs`, `schemas/*.json` | campos novos; `delta.schema.json`, `plan.schema.json` |
| `tests/match.test.mjs`, `tests/merge.test.mjs`, `tests/cli.test.mjs` (novos) | testes |
| `SKILL.md`, `references/*.md`, `docs/GUIA.md`, `README.md`, `examples/` | documentação e exemplos |

---

### Task 1: `match.mjs` — normalização e similaridade de nomes

**Files:**
- Create: `scripts/lib/match.mjs`
- Test: `tests/match.test.mjs`

**Interfaces:**
- Produces:
  - `FUZZY_THRESHOLD: number` (0.75)
  - `aliasKey(s: string): string` — sem acento, minúsculas, pontuação → espaço único
  - `nameTokens(s: string): string[]` — tokens de `aliasKey` sem palavras genéricas
  - `similarity(a: string, b: string): number` em [0, 1], 2 casas
  - `findCandidates(target, pool): Array<{ id, score, why }>`; `target`/itens do `pool`: `{ id, names: string[], type: string|null, parent: string|null, technology?: string }`

- [ ] **Step 0: Capture a linha de base das visões (antes de qualquer mudança)**

```bash
mkdir -p /tmp/archlens-baseline
for ex in loja-online telemedicina; do node scripts/archlens.mjs resolve examples/$ex/model.json > /tmp/archlens-baseline/$ex.json; done
ls -la /tmp/archlens-baseline
```
Expected: dois arquivos JSON não vazios (usados na Task 11 para provar que as visões não mudaram).

- [ ] **Step 1: Write the failing test** — `tests/match.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliasKey, similarity, findCandidates, FUZZY_THRESHOLD } from '../scripts/lib/match.mjs';

test('aliasKey ignores accents, case and punctuation', () => {
  assert.equal(aliasKey('API de Notificações'), 'api de notificacoes');
  assert.equal(aliasKey('orders-service'), aliasKey('Orders Service'));
  assert.equal(aliasKey('loja.api'), 'loja api');
});

test('similarity ignores generic words and tolerates small spelling changes', () => {
  assert.equal(FUZZY_THRESHOLD, 0.75);
  assert.equal(similarity('API de Agendamento', 'Agendamento API'), 1);
  assert.equal(similarity('Worker de Notificações', 'worker-notificacoes'), 1);
  assert.ok(similarity('Gateway de Pagamento', 'Gateway Pagamentos') >= FUZZY_THRESHOLD);
  assert.ok(similarity('Portal Médico', 'Portal do Paciente') < FUZZY_THRESHOLD);
  assert.equal(similarity('API', 'App'), 0);
});

test('findCandidates: same type only; same parent and technology still need some name overlap', () => {
  const pool = [
    { id: 'tele.api', names: ['API de Agendamento'], type: 'application-component', parent: 'tele', technology: 'Node.js' },
    { id: 'tele.notificador', names: ['Worker de Notificações'], type: 'application-component', parent: 'tele', technology: 'Node.js' },
    { id: 'bp-agendar', names: ['Agendamento'], type: 'business-process', parent: null },
  ];
  const c = findCandidates({ id: 'api-agenda', names: ['API Agendamento'], type: 'application-component', parent: 'tele', technology: 'node.js' }, pool);
  assert.deepEqual(c.map(x => x.id), ['tele.api']);
  assert.match(c[0].why, /nome parecido/);
  assert.deepEqual(findCandidates({ id: 'x', names: ['Gateway Fiscal'], type: 'application-component', parent: 'tele', technology: 'Node.js' }, pool), []);
  const slot = findCandidates({ id: 'y', names: ['Agendamento Online'], type: 'application-component', parent: 'tele', technology: 'Node.js' }, pool);
  assert.deepEqual(slot.map(x => x.id), ['tele.api']);
  assert.match(slot[0].why, /mesmo pai e mesma tecnologia/);
  assert.deepEqual(findCandidates({ id: 'z', names: ['API Agendamento'], type: null, parent: null }, pool), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/match.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/match.mjs'`

- [ ] **Step 3: Write minimal implementation** — `scripts/lib/match.mjs`

```js
// Name matching for the merge: normalized alias keys and fuzzy similarity between element names.
export const FUZZY_THRESHOLD = 0.75;
// Below this, "same parent and same technology" is not enough to suspect a duplicate.
const SLOT_MIN_SIMILARITY = 0.4;

const GENERIC = new Set(['api', 'apis', 'service', 'servico', 'servicos', 'svc', 'app', 'aplicacao', 'sistema', 'system',
  'de', 'do', 'da', 'dos', 'das', 'e', 'the', 'of', 'and']);

/** Key for exact alias matching: no accents, lower case, punctuation collapsed to single spaces. */
export function aliasKey(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function nameTokens(s) {
  return aliasKey(s).split(' ').filter(t => t && !GENERIC.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity in [0, 1]: the better of token overlap (Jaccard) and edit distance over the significant tokens. */
export function similarity(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return aliasKey(a) && aliasKey(a) === aliasKey(b) ? 1 : 0;
  const sa = new Set(ta), sb = new Set(tb);
  const shared = [...sa].filter(t => sb.has(t)).length;
  const jaccard = shared / new Set([...sa, ...sb]).size;
  const ja = ta.join(' '), jb = tb.join(' ');
  const edit = 1 - levenshtein(ja, jb) / Math.max(ja.length, jb.length);
  return Math.round(Math.max(jaccard, edit) * 100) / 100;
}

/** Possible duplicates of `target` in `pool` (same ArchiMate type only), best first. */
export function findCandidates(target, pool) {
  if (!target.type) return [];
  const out = [];
  for (const c of pool) {
    if (c.id === target.id || c.type !== target.type) continue;
    const score = Math.max(0, ...target.names.flatMap(a => c.names.map(b => similarity(a, b))));
    const sameSlot = !!target.parent && target.parent === c.parent && !!target.technology && !!c.technology
      && aliasKey(target.technology) === aliasKey(c.technology) && score >= SLOT_MIN_SIMILARITY;
    if (score < FUZZY_THRESHOLD && !sameSlot) continue;
    const why = ['mesmo tipo', score >= FUZZY_THRESHOLD && 'nome parecido', sameSlot && 'mesmo pai e mesma tecnologia'].filter(Boolean).join('; ');
    out.push({ id: c.id, score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/match.test.mjs`
Expected: PASS (3 testes). Se `Agendamento Online` ficar abaixo de 0,4 ou `Gateway Fiscal` acima, imprima `similarity(...)` e troque o **nome do teste** por outro na mesma faixa — não mude os limiares.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/match.mjs tests/match.test.mjs
git -c safe.directory="$PWD" commit -m "feat(match): normalização de aliases e similaridade de nomes para o merge

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Proveniência, status e aliases no modelo

**Files:**
- Create: `scripts/lib/sources.mjs`
- Modify: `scripts/lib/registry.mjs` (acrescentar `STATUSES`)
- Modify: `scripts/lib/model.mjs` (imports, `ELEMENT_FIELDS`, nó do elemento, alias conflicts, relações, `canonicalRel`)
- Modify: `scripts/lib/validate.mjs` (`W_RETIRED_DEPENDENCY`)
- Modify: `scripts/lib/doc.mjs:141` (coluna "Origem no texto")
- Test: `tests/model.test.mjs`

**Interfaces:**
- Consumes: `aliasKey` (Task 1)
- Produces:
  - `STATUSES = ['planned', 'active', 'deprecated', 'retired']` em `registry.mjs`
  - `sources.mjs`: `SOURCE_KINDS`, `sourceKey(s)`, `readSources(item): Source[]`, `deltaSources(item, deltaSource): Source[]`,
    `addSources(target, list): number`, `sourceProblem(s): string|null`
  - `model.mjs`: `canonicalRel(r, typeOf: id => archimateType|undefined): { type, from, to, accessType? } | { error }`
  - elementos normalizados: `status` (padrão `'active'`), `statusReason?`, `aliases: string[]`, `sources: Source[]`
  - relações normalizadas: `status` (padrão `'active'`), `statusReason?`, `sources: Source[]`

- [ ] **Step 1: Write the failing tests** — acrescente ao fim de `tests/model.test.mjs`

```js
import { canonicalRel } from '../scripts/lib/model.mjs';
import { addSources } from '../scripts/lib/sources.mjs';

const findRaw = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const shopWith = mut => { const r = raw(); mut(r); return r; };

test('normalizeModel reads status, aliases and sources, accepting the legacy source string', () => {
  const m = normalizeModel(shopWith(r => {
    Object.assign(findRaw(r, 'loja.api'), { status: 'deprecated', statusReason: 'migração', aliases: ['orders-service'],
      sources: [{ kind: 'repo', ref: 'github.com/x/orders@a1b2c3d', path: 'compose.yml' }] });
    findRaw(r, 'loja.web').source = 'a vitrine é em Next.js';
  }));
  const api = m.elements.get('loja.api');
  assert.equal(api.status, 'deprecated');
  assert.equal(api.statusReason, 'migração');
  assert.deepEqual(api.aliases, ['orders-service']);
  assert.equal(api.sources[0].kind, 'repo');
  assert.deepEqual(m.elements.get('loja.web').sources, [{ kind: 'prompt', excerpt: 'a vitrine é em Next.js' }]);
  assert.equal(m.elements.get('cliente').status, 'active');
  assert.deepEqual(m.elements.get('cliente').sources, []);
  assert.equal(m.relationships[0].status, 'active');
});

test('validate flags invalid status, sources and alias conflicts', () => {
  const codes = validateModel(shopWith(r => {
    findRaw(r, 'loja.api').status = 'morto';
    findRaw(r, 'loja.web').sources = [{ kind: 'git', ref: 'x' }, { kind: 'repo' }];
    findRaw(r, 'loja.db').aliases = ['Loja API']; // aliasKey("Loja API") === aliasKey("loja.api")
    r.model.relationships[0].status = 'zumbi';
  })).errors.map(e => e.code);
  assert.equal(codes.filter(c => c === 'E_STATUS').length, 2);
  assert.equal(codes.filter(c => c === 'E_SOURCE').length, 2);
  assert.ok(codes.includes('E_ALIAS_CONFLICT'));
});

test('validate warns when something active depends on a retired element', () => {
  const w = validateModel(shopWith(r => { findRaw(r, 'k8s').status = 'retired'; })).warnings.filter(x => x.code === 'W_RETIRED_DEPENDENCY');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /loja\.api/);
});

test('canonicalRel reads uses as inverted serving, or access to passive targets', () => {
  const types = { web: 'application-component', api: 'application-component', db: 'data-object' };
  const typeOf = id => types[id];
  assert.deepEqual(canonicalRel({ from: 'web', to: 'api', type: 'uses' }, typeOf), { type: 'serving', from: 'api', to: 'web' });
  assert.deepEqual(canonicalRel({ from: 'api', to: 'db' }, typeOf), { type: 'access', from: 'api', to: 'db', accessType: 'readwrite' });
  assert.deepEqual(canonicalRel({ from: 'api', to: 'web', type: 'archimate:serving' }, typeOf), { type: 'serving', from: 'api', to: 'web' });
  assert.equal(canonicalRel({ from: 'a', to: 'b', type: 'banana' }, () => undefined).error, 'E_REL_TYPE');
});

test('addSources deduplicates by kind+ref+path and migrates a legacy source string', () => {
  const el = { id: 'x', source: 'trecho antigo' };
  assert.equal(addSources(el, [{ kind: 'repo', ref: 'r@1', path: 'a.yml' }, { kind: 'repo', ref: 'r@1', path: 'a.yml', date: '2026-10-01' }]), 1);
  assert.equal(el.source, undefined);
  assert.deepEqual(el.sources, [{ kind: 'prompt', excerpt: 'trecho antigo' }, { kind: 'repo', ref: 'r@1', path: 'a.yml' }]);
  assert.equal(addSources(el, []), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/model.test.mjs`
Expected: FAIL — `does not provide an export named 'canonicalRel'` (ou módulo `sources.mjs` inexistente).

- [ ] **Step 3: Create `scripts/lib/sources.mjs`**

```js
// Provenance: where each fact of the knowledge base came from (prompt round, repository, document, manual edit).
export const SOURCE_KINDS = ['prompt', 'repo', 'doc', 'manual'];

/** Identity of a source inside one item's list; the excerpt only distinguishes sources without ref/path. */
export function sourceKey(s) {
  return s.ref || s.path ? `${s.kind}|${s.ref ?? ''}|${s.path ?? ''}` : `${s.kind}|~${s.excerpt ?? ''}`;
}

/** Sources declared on a raw element/relationship, accepting the legacy `source: "<excerpt>"`. */
export function readSources(item) {
  if (Array.isArray(item.sources)) return item.sources;
  if (typeof item.source === 'string' && item.source) return [{ kind: 'prompt', excerpt: item.source }];
  return [];
}

/** Sources a delta item brings: its own, or the delta's source (keeping a legacy excerpt as `excerpt`). */
export function deltaSources(item, deltaSource) {
  if (Array.isArray(item.sources)) return item.sources.map(s => ({ ...s }));
  if (typeof item.source === 'string' && item.source) return [{ ...(deltaSource ?? { kind: 'prompt' }), excerpt: item.source }];
  return deltaSource ? [{ ...deltaSource }] : [];
}

/** Appends the sources not yet present; migrates a legacy `source` string first. Returns how many were added. */
export function addSources(target, list) {
  if (!list.length) return 0;
  if (!Array.isArray(target.sources)) {
    const legacy = readSources(target);
    delete target.source;
    target.sources = [...legacy];
  }
  const seen = new Set(target.sources.map(sourceKey));
  let added = 0;
  for (const s of list) {
    const k = sourceKey(s);
    if (seen.has(k)) continue;
    target.sources.push({ ...s });
    seen.add(k);
    added++;
  }
  return added;
}

/** null when the source is well-formed, otherwise a hint for E_SOURCE. */
export function sourceProblem(s) {
  if (!s || typeof s !== 'object') return 'cada fonte é um objeto { kind, ref?, path?, excerpt?, date? }';
  if (!SOURCE_KINDS.includes(s.kind)) return `kind deve ser ${SOURCE_KINDS.join(' | ')}`;
  if (!s.ref && !s.excerpt) return 'informe ref (repo, documento, rodada) ou excerpt (trecho que justifica o item)';
  return null;
}
```

- [ ] **Step 4: Add `STATUSES` to `scripts/lib/registry.mjs`** — logo abaixo da linha `export const CORE_LAYERS = ['business', 'application', 'technology'];`

```js
/** Lifecycle of elements and relationships; views hide `retired` unless asked. */
export const STATUSES = ['planned', 'active', 'deprecated', 'retired'];
```

- [ ] **Step 5: Update `scripts/lib/model.mjs`**

Troque o cabeçalho de imports e `ELEMENT_FIELDS`:

```js
// Load + normalize the archlens DSL into a flat, ArchiMate-typed in-memory model.
import {
  ELEMENT_TYPES, resolveType, resolveRelType, checkRelationship, isPassive, STATUSES,
} from './registry.mjs';
import { readSources, sourceProblem } from './sources.mjs';
import { aliasKey } from './match.mjs';

const ELEMENT_FIELDS = ['description', 'technology', 'owner', 'url', 'inferred', 'confidence', 'statusReason'];
```

Logo depois de `const issue = (level, code, message, path, hint) => issues.push(...)`, acrescente:

```js
  const checkStatus = (status, where, p) => {
    if (status !== undefined && !STATUSES.includes(status)) issue('error', 'E_STATUS', `status "${status}" inválido em ${where}`, `${p}.status`, `use ${STATUSES.join(' | ')}`);
  };
  const checkSources = (list, p) => list.forEach((s, j) => {
    const why = sourceProblem(s);
    if (why) issue('error', 'E_SOURCE', 'fonte inválida', `${p}.sources[${j}]`, why);
  });
```

No objeto `node` do `walk`, depois de `properties: { ...(e.properties || {}) },`, acrescente:

```js
        status: e.status ?? 'active',
        aliases: (e.aliases || []).map(String),
        sources: readSources(e),
```

e, logo após `for (const f of ELEMENT_FIELDS) if (e[f] !== undefined) node[f] = e[f];`:

```js
      checkStatus(e.status, `"${e.id}"`, p);
      checkSources(node.sources, p);
```

Depois do laço `for (const n of pending) { … }`, acrescente a checagem de aliases:

```js
  // Aliases identify one element only (compared like the merge compares them).
  const aliasOwner = new Map();
  for (const n of elements.values()) aliasOwner.set(aliasKey(n.id), n.id);
  for (const n of elements.values()) {
    for (const a of n.aliases) {
      const k = aliasKey(a);
      const owner = aliasOwner.get(k);
      if (owner && owner !== n.id) {
        issue('error', 'E_ALIAS_CONFLICT', `alias "${a}" de "${n.id}" já identifica "${owner}"`, `${n.path}.aliases`, 'um alias aponta para um único elemento; remova-o de um dos dois');
      } else aliasOwner.set(k, n.id);
    }
  }
```

No laço das relações, substitua o trecho que vai de `const t = resolveRelType(r.type ?? 'uses');` até o fim do bloco `if (t.type === 'uses') { … }` por:

```js
    const c = canonicalRel(r, id => elements.get(id)?.type);
    if (c.error) {
      issue('error', 'E_REL_TYPE', `tipo de relacionamento desconhecido "${r.type}"`, `${p}.type`,
        'use "uses" (C4) ou archimate:composition|aggregation|assignment|realization|serving|access|influence|triggering|flow|specialization|association');
      return;
    }
    const rel = {
      from: c.from, to: c.to, type: c.type,
      description: r.description, technology: r.technology,
      tags: (r.tags || []).map(String), properties: { ...(r.properties || {}) },
      c4: resolveRelType(r.type ?? 'uses').type === 'uses' ? { from: r.from, to: r.to } : null, path: p,
      status: r.status ?? 'active', sources: readSources(r),
    };
    if (r.inferred !== undefined) rel.inferred = r.inferred;
    if (c.accessType) rel.accessType = c.accessType;
    if (r.statusReason) rel.statusReason = r.statusReason;
    checkStatus(r.status, p, p);
    checkSources(rel.sources, p);
```

Acrescente, depois de `normalizeModel` (antes de `childrenOf`):

```js
/** ArchiMate reading of a raw relationship: `uses` becomes access (passive target) or inverted serving. */
export function canonicalRel(r, typeOf) {
  const t = resolveRelType(r.type ?? 'uses');
  if (t.error) return { error: t.error };
  if (t.type !== 'uses') return { type: t.type, from: r.from, to: r.to, ...(r.accessType ? { accessType: r.accessType } : {}) };
  const target = typeOf(r.to);
  if (target && isPassive(target)) return { type: 'access', from: r.from, to: r.to, accessType: r.accessType ?? 'readwrite' };
  return { type: 'serving', from: r.to, to: r.from };
}
```

- [ ] **Step 6: Add `W_RETIRED_DEPENDENCY` to `scripts/lib/validate.mjs`**

Troque o import do topo por:

```js
import { normalizeModel } from './model.mjs';
import { supportDirection } from './registry.mjs';
```

E antes de `const inferred = [...]`, acrescente:

```js
  for (const r of model.relationships) {
    if (r.status === 'retired') continue;
    const dir = supportDirection(r);
    if (!dir) continue;
    const [sup, dep] = dir.map(id => model.elements.get(id));
    if (sup?.status === 'retired' && dep && dep.status !== 'retired') {
      warnings.push({ code: 'W_RETIRED_DEPENDENCY', message: `"${dep.id}" (${dep.status}) depende de "${sup.id}", que está retired`, path: r.path,
        hint: 'aponte a dependência para o substituto ou mude o status do dependente' });
    }
  }
```

- [ ] **Step 7: Keep the "Premissas" table working** — em `scripts/lib/doc.mjs`, na linha

```js
      ...inferred.map(e => [e.name, ELEMENT_TYPES[e.type].label, e.confidence, e.source]),
```
troque `e.source` por `e.sources.map(s => s.excerpt).filter(Boolean).join(' · ')`.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS (todos, inclusive os 45 antigos + 5 novos + 3 da Task 1).

- [ ] **Step 9: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/sources.mjs scripts/lib/registry.mjs scripts/lib/model.mjs scripts/lib/validate.mjs scripts/lib/doc.mjs tests/model.test.mjs
git -c safe.directory="$PWD" commit -m "feat(model): status, aliases e sources (proveniência) com validação

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Filtro de status nas visões e estilo no HTML

**Files:**
- Modify: `scripts/lib/query.mjs`
- Modify: `scripts/lib/query-c4.mjs:177`, `scripts/lib/query-archimate.mjs:140`
- Modify: `scripts/lib/render.mjs` (classes, CSS, `viewData`, painel)
- Test: `tests/query.test.mjs`, `tests/render.test.mjs`

**Interfaces:**
- Consumes: `STATUSES` (Task 2); elementos/relações normalizados com `status`
- Produces: `filterByStatus(model, allowed?: string[])` exportado de `query.mjs`; view spec aceita `status: string[]`;
  nós do IR têm `status`; erro `E_VIEW_STATUS`

- [ ] **Step 1: Write the failing tests** — acrescente a `tests/query.test.mjs`

```js
const findRaw = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const modelWith = mut => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
  mut(r);
  return normalizeModel(r);
};

test('views hide retired elements by default and show them on request', () => {
  const m = modelWith(r => { findRaw(r, 'loja.db').status = 'retired'; findRaw(r, 'pagamentos').status = 'deprecated'; });
  const v = resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' });
  assert.ok(!ids(v).includes('loja.db'));
  assert.equal(v.nodes.find(n => n.id === 'pagamentos').status, 'deprecated');
  assert.equal(v.nodes.find(n => n.id === 'loja.web').status, 'active');
  const all = resolveView(m, { key: 'c2', notation: 'c4', level: 'container', scope: 'loja', status: ['planned', 'active', 'deprecated', 'retired'] });
  assert.ok(ids(all).includes('loja.db'));
});

test('children of a hidden element are hidden too (C4 and ArchiMate)', () => {
  const m = modelWith(r => { findRaw(r, 'loja').status = 'retired'; });
  assert.deepEqual(ids(resolveView(m, { key: 'l', notation: 'c4', level: 'landscape' })), ['cliente', 'pagamentos']);
  const s = resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } });
  assert.ok(!ids(s).some(id => id.startsWith('loja')));
});

test('a view scoped on a hidden element explains the status filter', () => {
  const m = modelWith(r => { findRaw(r, 'loja').status = 'retired'; });
  assert.throws(() => resolveView(m, { key: 'c', notation: 'c4', level: 'context', scope: 'loja' }), /E_VIEW_STATUS.*oculto/);
  assert.throws(() => resolveView(m, { key: 'x', notation: 'c4', level: 'landscape', status: ['vivo'] }), /E_VIEW_STATUS/);
});
```

E a `tests/render.test.mjs`:

```js
test('render marks deprecated and planned nodes', async () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'pagamentos').status = 'deprecated';
  r.model.elements.find(e => e.id === 'k8s').status = 'planned';
  const m = normalizeModel(r);
  const views = [
    await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'context', scope: 'loja' })),
    await layoutView(resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } })),
  ];
  const html = renderHtml({ title: 't', views });
  assert.match(html, /class="node c4 k-external[^"]* st-deprecated"/);
  assert.match(html, /class="node am l-[^"]* st-planned"/);
  assert.match(html, /\.node\.st-deprecated\{/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/query.test.mjs tests/render.test.mjs`
Expected: FAIL — `loja.db` ainda aparece; `status` indefinido nos nós; classes `st-*` ausentes.

- [ ] **Step 3: Implement the filter** — substitua `scripts/lib/query.mjs` inteiro por:

```js
import { resolveC4 } from './query-c4.mjs';
import { resolveArchimate } from './query-archimate.mjs';
import { viewError } from './query-util.mjs';
import { STATUSES } from './registry.mjs';

const DEFAULT_STATUS = STATUSES.filter(s => s !== 'retired');

/** The model as a view sees it: elements (and everything nested in them) and relationships whose status is allowed. */
export function filterByStatus(model, allowed = DEFAULT_STATUS) {
  const ok = new Set(allowed);
  const shown = id => {
    const seen = new Set();
    for (let cur = id; cur != null && !seen.has(cur); cur = model.elements.get(cur)?.parent) {
      seen.add(cur);
      const e = model.elements.get(cur);
      if (e && !ok.has(e.status ?? 'active')) return false;
    }
    return true;
  };
  const elements = new Map([...model.elements].filter(([id]) => shown(id)));
  const relationships = model.relationships.filter(r => elements.has(r.from) && elements.has(r.to) && ok.has(r.status ?? 'active'));
  if (elements.size === model.elements.size && relationships.length === model.relationships.length) return model;
  return { ...model, elements, relationships };
}

/** Resolve a view spec against a normalized model into a view IR (nodes, edges, boundaries/layers). */
export function resolveView(model, spec) {
  if (!spec || typeof spec !== 'object') throw viewError('E_VIEW_SPEC', 'visão inválida', 'passe um objeto com "key" e "notation"');
  const withKey = { key: spec.key ?? 'view', ...spec };
  const status = withKey.status ?? DEFAULT_STATUS;
  const unknown = status.find(s => !STATUSES.includes(s));
  if (unknown) throw viewError('E_VIEW_STATUS', `status desconhecido "${unknown}" na visão "${withKey.key}"`, `use ${STATUSES.join(' | ')}`);
  const visible = filterByStatus(model, status);
  for (const ref of [withKey.scope, withKey.anchor, ...(withKey.focus || [])]) {
    if (ref && model.elements.has(ref) && !visible.elements.has(ref)) {
      throw viewError('E_VIEW_STATUS', `"${ref}" está oculto pelo filtro de status da visão "${withKey.key}" (${status.join(', ')})`,
        'acrescente o status dele em "status" da visão, ex.: ["active","deprecated","retired"]');
    }
  }
  if (withKey.notation === 'c4') return resolveC4(visible, withKey);
  if (withKey.notation === 'archimate') return resolveArchimate(visible, withKey);
  throw viewError('E_VIEW_NOTATION', `notação "${spec.notation}" desconhecida`, 'use "c4" ou "archimate"');
}
```

- [ ] **Step 4: Carry `status` into the IR** — em `scripts/lib/query-c4.mjs` e em `scripts/lib/query-archimate.mjs`,
troque (uma ocorrência em cada arquivo) `inferred: !!el.inferred,` por `inferred: !!el.inferred, status: el.status ?? 'active',`.

- [ ] **Step 5: Style it in `scripts/lib/render.mjs`**

Acima de `function c4Node(n, i) {`, acrescente:

```js
const statusClass = n => (n.status && n.status !== 'active' ? ` st-${n.status}` : '');
```

Nas duas linhas `const cls = …` (em `c4Node` e no nó ArchiMate), troque o final `${n.inferred ? ' inferred' : ''}\`;`
por `${n.inferred ? ' inferred' : ''}${statusClass(n)}\`;`.

Logo após a regra CSS `.node.inferred .shape{stroke-dasharray:8 5}`, acrescente:

```css
.node.st-deprecated{opacity:.55}
.node.st-deprecated .shape{stroke-dasharray:3 4}
.node.st-planned .shape{stroke-dasharray:14 5;stroke-width:3}
```

Em `viewData`, troque `isAnchor: !!n.isAnchor, inferred: !!n.inferred,` por
`isAnchor: !!n.isAnchor, inferred: !!n.inferred, status: n.status ?? 'active',`.

No painel (`openDrawer`), logo após a linha `if (n.inferred) h += '<p class="warn">⚠︎ Inferido a partir de texto livre: confirme.</p>';`:

```js
    if (n.status && n.status !== 'active') h += '<p class="warn">' + escH({ planned: 'Planejado: ainda não existe.', deprecated: 'Em desativação.', retired: 'Desativado.' }[n.status] || n.status) + '</p>';
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/query.mjs scripts/lib/query-c4.mjs scripts/lib/query-archimate.mjs scripts/lib/render.mjs tests/query.test.mjs tests/render.test.mjs
git -c safe.directory="$PWD" commit -m "feat(views): filtro de status (padrão sem retired) e estilo planned/deprecated

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Motor do merge — elementos, plano, apply e changelog

**Files:**
- Create: `scripts/lib/raw-tree.mjs`
- Create: `scripts/lib/merge.mjs`
- Test: `tests/merge.test.mjs`

**Interfaces:**
- Consumes: `aliasKey`, `findCandidates` (Task 1); `addSources`, `deltaSources` (Task 2); `resolveType` (registry); `validateModel`
- Produces:
  - `raw-tree.mjs`: `indexTree(raw): Map<id, { el, list, parent }>`, `orderDelta(elements): Array<{ el, parent }>`,
    `attach(raw, index, el, parentId)`, `detach(index, id)`, `descendantsOf(index, id): string[]`
  - `merge.mjs`: `PLAN_VERSION`, `mergeError(code, message, extra?)`, `hashRaw(raw|null): string`, `canonicalJson(v): string`,
    `planMerge(baseRaw|null, delta, { base?, today? }): Plan`, `applyPlan(baseRaw|null, plan, { today? }): { raw, entry|null }`
  - `Plan = { 'archlens-plan', base, baseHash, created, delta, items: Item[], summary: Record<class, n>, blocked, errors }`
  - `Item = { n, key, class, kind?, target, …, resolution?: null|string, when?: 'dup:<id>=same' }` — só itens que
    exigem resposta têm a chave `resolution`
  - chaves: `el:<deltaId>` (nota), `el:<deltaId>:<campo>` (conflito), `dup:<deltaId>`; as Tasks 5–7 acrescentam `rel:<i>…`, `view:<key>`, `op:<i>`
  - funções internas usadas pelas Tasks 5–7: `decide`, `note`, `resolveRef`, `reconcile`, `fieldsOf`, `addList`, `addAliases`

- [ ] **Step 1: Write the failing tests** — `tests/merge.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const SRC = { kind: 'prompt', ref: 'rodada 1', date: '2026-10-01' };
const delta = (model = {}, extra = {}) => ({ 'archlens-delta': '1.0', source: SRC, summary: 'teste',
  model: { elements: [], relationships: [], ...model }, ...extra });
const find = (r, id) => {
  let hit;
  const walk = list => list.forEach(e => { if (e.id === id) hit = e; walk(e.children || []); });
  walk(r.model.elements);
  return hit;
};
const answer = (plan, map) => { for (const it of plan.items) if (it.key in map) it.resolution = map[it.key]; return plan; };
const TODAY = { today: '2026-10-01' };

test('element matched by id: fills empty fields and adds the source without asking', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.api', type: 'c4:container', description: 'Pedidos e checkout', tags: ['core'] }] }), TODAY);
  assert.deepEqual(plan.summary, { enrich: 1 });
  assert.equal(plan.blocked, false);
  const { raw, entry } = applyPlan(shop(), plan, TODAY);
  const api = find(raw, 'loja.api');
  assert.equal(api.description, 'Pedidos e checkout');
  assert.deepEqual(api.tags, ['core']);
  assert.deepEqual(api.sources, [SRC]);
  assert.deepEqual(entry.changed, ['loja.api']);
  assert.equal(entry.id, '2026-10-01-01');
  assert.equal(raw.changelog.length, 1);
});

test('a different filled value is a conflict answered with keep, take or value', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }] }), TODAY);
  const c = plan.items.find(i => i.class === 'conflict');
  assert.deepEqual([c.key, c.field, c.base, c.delta, c.resolution], ['el:loja.api:technology', 'technology', 'Spring', 'Kotlin', null]);
  assert.throws(() => applyPlan(shop(), plan, TODAY), /E_PLAN_PENDING/);
  const run = res => find(applyPlan(shop(), answer(structuredClone(plan), { 'el:loja.api:technology': res }), TODAY).raw, 'loja.api').technology;
  assert.equal(run('keep'), 'Spring');
  assert.equal(run('take'), 'Kotlin');
  assert.equal(run('value:Kotlin / Spring Boot'), 'Kotlin / Spring Boot');
  const taken = applyPlan(shop(), answer(structuredClone(plan), { 'el:loja.api:technology': 'take' }), TODAY);
  assert.match(taken.entry.decisions[0], /conflito loja\.api\.technology: take "Kotlin"/);
  assert.throws(() => applyPlan(shop(), answer(structuredClone(plan), { 'el:loja.api:technology': 'talvez' }), TODAY), /E_PLAN_RESOLUTION/);
});

test('a new element is inserted under its parent, keeping the nesting', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja', technology: 'Node.js' }] }), TODAY);
  assert.deepEqual(plan.summary, { new: 1 });
  const { raw, entry } = applyPlan(shop(), plan, TODAY);
  const worker = find(raw, 'loja').children.find(c => c.id === 'loja.worker');
  assert.ok(worker);
  assert.equal(worker.parent, undefined);
  assert.deepEqual(worker.sources, [SRC]);
  assert.deepEqual(entry.added, ['loja.worker']);
});

test('elements match by alias in both directions and references are rewritten to the canonical id', () => {
  const base = shop();
  find(base, 'loja.api').aliases = ['orders-service'];
  const d = delta({ elements: [
    { id: 'orders-worker', type: 'c4:component', name: 'Consumidor', parent: 'orders-service' }, // child listed before its parent
    { id: 'orders-service', type: 'c4:container', description: 'Pedidos' },                    // delta id = base alias
    { id: 'gw', type: 'c4:softwareSystem', aliases: ['pagamentos'] },                          // delta alias = base id
  ] });
  const plan = planMerge(base, d, TODAY);
  assert.equal(plan.blocked, false, JSON.stringify(plan.errors));
  const { raw } = applyPlan(base, plan, TODAY);
  assert.ok(find(raw, 'loja.api').children.some(c => c.id === 'orders-worker'));
  assert.equal(find(raw, 'loja.api').description, 'Pedidos');
  assert.equal(find(raw, 'orders-service'), undefined);
  assert.equal(find(raw, 'gw'), undefined);
});

test('a similar name of the same type is only a possible duplicate', () => {
  const d = delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', description: 'Adquirente', external: true }] });
  const plan = planMerge(shop(), d, TODAY);
  const dup = plan.items.find(i => i.class === 'possible-duplicate');
  assert.equal(dup.key, 'dup:gateway-pag');
  assert.equal(dup.candidate, 'pagamentos');
  assert.ok(dup.score >= 0.75);
  assert.equal(plan.summary.new, 1, 'simulated as different');
  const same = applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'same', 'el:gateway-pag:name': 'keep' }), TODAY);
  const pag = find(same.raw, 'pagamentos');
  assert.deepEqual(pag.aliases, ['gateway-pag']);
  assert.equal(pag.description, 'Adquirente');
  assert.equal(find(same.raw, 'gateway-pag'), undefined);
  const diff = applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'different' }), TODAY);
  assert.ok(find(diff.raw, 'gateway-pag'));
});

test('fields that differ from a possible duplicate become conditional conflicts', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', external: false }] }), TODAY);
  const cond = plan.items.find(i => i.class === 'conflict' && i.field === 'external');
  assert.deepEqual([cond.key, cond.when, cond.resolution], ['el:gateway-pag:external', 'dup:gateway-pag=same', null]);
  assert.equal(plan.summary.conflict, undefined, 'conditional items are not counted');
  assert.doesNotThrow(() => applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'different' }), TODAY));
  assert.throws(() => applyPlan(shop(), answer(structuredClone(plan), { 'dup:gateway-pag': 'same' }), TODAY), /E_PLAN_PENDING/);
});

test('touching an element migrates its legacy source string into sources', () => {
  const base = shop();
  find(base, 'loja.web').source = 'a vitrine é em Next.js';
  const { raw } = applyPlan(base, planMerge(base, delta({ elements: [{ id: 'loja.web', type: 'c4:container' }] }), TODAY), TODAY);
  const web = find(raw, 'loja.web');
  assert.equal(web.source, undefined);
  assert.deepEqual(web.sources, [{ kind: 'prompt', excerpt: 'a vitrine é em Next.js' }, SRC]);
});

test('applying the same delta twice changes nothing the second time', () => {
  const d = delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] });
  const first = applyPlan(shop(), planMerge(shop(), d, TODAY), TODAY);
  const plan2 = planMerge(first.raw, d, TODAY);
  assert.deepEqual(plan2.summary, { unchanged: 1 });
  const second = applyPlan(first.raw, plan2, TODAY);
  assert.equal(second.entry, null);
  assert.equal(second.raw.changelog.length, 1);
});

test('a plan is refused when the base changed after it was made, including re-applying it', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }), TODAY);
  const { raw } = applyPlan(shop(), plan, TODAY);
  assert.throws(() => applyPlan(raw, plan, TODAY), /E_PLAN_STALE/);
});

test('changelog ids are sequential within a day', () => {
  const a = applyPlan(shop(), planMerge(shop(), delta({ elements: [{ id: 'loja.a', type: 'c4:container', name: 'Alfa', parent: 'loja' }] }), TODAY), TODAY);
  const b = applyPlan(a.raw, planMerge(a.raw, delta({ elements: [{ id: 'loja.b', type: 'c4:container', name: 'Beta', parent: 'loja' }] }), TODAY), TODAY);
  assert.deepEqual(b.raw.changelog.map(e => e.id), ['2026-10-01-01', '2026-10-01-02']);
});

test('a missing base is created from the first delta', () => {
  const d = delta({ elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }] }, { name: 'Nova base', description: 'Criada do zero' });
  const plan = planMerge(null, d, TODAY);
  assert.equal(plan.baseHash, 'none');
  const { raw, entry } = applyPlan(null, plan, TODAY);
  assert.equal(raw.name, 'Nova base');
  assert.equal(raw.description, 'Criada do zero');
  assert.deepEqual(entry.added, ['sis']);
});

test('a delta that breaks validation blocks the plan, and apply writes nothing', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'x', type: 'c4:banana' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_UNKNOWN_TYPE'));
  assert.throws(() => applyPlan(shop(), plan, TODAY), /E_MERGE_INVALID/);
});

test('files that are not deltas or plans are refused', () => {
  assert.throws(() => planMerge(shop(), { model: {} }, TODAY), /E_DELTA_SCHEMA/);
  assert.throws(() => applyPlan(shop(), { items: [] }, TODAY), /E_PLAN_SCHEMA/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/merge.mjs'`

- [ ] **Step 3: Create `scripts/lib/raw-tree.mjs`**

```js
// Index over the raw (un-normalized) model tree, so the merge edits it in place and keeps the nesting.

/** id → { el, list, parent }: the raw element, the array holding it and its parent id. */
export function indexTree(raw) {
  const index = new Map();
  const walk = (list, parent) => {
    for (const el of list) {
      if (!el || typeof el.id !== 'string') continue;
      index.set(el.id, { el, list, parent: el.parent ?? parent });
      if (Array.isArray(el.children)) walk(el.children, el.id);
    }
  };
  walk(raw.model.elements, null);
  return index;
}

/**
 * Delta elements flattened (children → parent id) and ordered so that a parent declared in the delta
 * always comes before its children, even when a child is listed first with "parent".
 */
export function orderDelta(elements = []) {
  const flat = [];
  const walk = (list, parent) => {
    for (const e of list || []) {
      if (!e || typeof e !== 'object') continue;
      const { children, ...el } = e;
      flat.push({ el, parent: e.parent ?? parent ?? null });
      walk(children, e.id);
    }
  };
  walk(elements, null);
  const byId = new Map(flat.map(x => [x.el.id, x]));
  const out = [];
  const done = new Set();
  const visit = (x, stack) => {
    if (done.has(x) || stack.has(x)) return;
    stack.add(x);
    const p = byId.get(x.parent);
    if (p) visit(p, stack);
    done.add(x);
    out.push(x);
  };
  for (const x of flat) visit(x, new Set());
  return out;
}

/** Puts `el` inside the children of `parentId` when it is in the tree, else at the top level (with "parent" if given). */
export function attach(raw, index, el, parentId) {
  const p = parentId != null ? index.get(parentId) : null;
  let list;
  if (p) {
    list = (p.el.children ??= []);
    delete el.parent;
  } else {
    list = raw.model.elements;
    if (parentId != null) el.parent = parentId; else delete el.parent;
  }
  list.push(el);
  index.set(el.id, { el, list, parent: parentId ?? null });
}

/** Takes `id` out of the array that holds it (nested children go with it). */
export function detach(index, id) {
  const entry = index.get(id);
  const i = entry.list.indexOf(entry.el);
  if (i >= 0) entry.list.splice(i, 1);
}

/** ids nested under `id`, at any depth. */
export function descendantsOf(index, id) {
  const out = [];
  for (const [x, { parent }] of index) {
    const seen = new Set();
    for (let cur = parent; cur != null && !seen.has(cur); cur = index.get(cur)?.parent) {
      seen.add(cur);
      if (cur === id) { out.push(x); break; }
    }
  }
  return out;
}
```

- [ ] **Step 4: Create `scripts/lib/merge.mjs`**

```js
// Incremental merge of a delta into the knowledge base. planMerge classifies and never decides;
// applyPlan replays the same merge with the user's answers. Pure: no file I/O.
import { createHash } from 'node:crypto';
import { resolveType } from './registry.mjs';
import { validateModel } from './validate.mjs';
import { aliasKey, findCandidates } from './match.mjs';
import { addSources, deltaSources } from './sources.mjs';
import { indexTree, orderDelta, attach, detach } from './raw-tree.mjs';

export const PLAN_VERSION = '1.0';
const ELEMENT_FIELDS = ['type', 'name', 'description', 'technology', 'external', 'archimate', 'owner', 'url', 'status', 'statusReason'];
const RESOLUTION = {
  conflict: /^(keep|take|value:[\s\S]*)$/,
  'view-conflict': /^(keep|take)$/,
  'possible-duplicate': /^(same|different)$/,
  op: /^(yes|no)$/,
};

export function mergeError(code, message, extra = {}) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return Object.assign(err, extra);
}

export function hashRaw(raw) {
  return raw ? `sha256:${createHash('sha256').update(JSON.stringify(raw)).digest('hex')}` : 'none';
}

/** JSON with sorted keys (undefined dropped), so equality ignores key order. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export function planMerge(baseRaw, delta, { base = 'ARCHITECTURE.md', today } = {}) {
  checkDelta(delta);
  const ctx = runMerge(baseRaw, delta, { mode: 'plan' });
  const errors = [...ctx.errors, ...validateModel(ctx.raw).errors];
  const summary = {};
  for (const it of ctx.items) if (!it.when) summary[it.class] = (summary[it.class] ?? 0) + 1;
  return {
    'archlens-plan': PLAN_VERSION, base, baseHash: hashRaw(baseRaw), created: today ?? isoToday(), delta,
    items: ctx.items.map((it, i) => ({ n: i + 1, ...it })), summary, blocked: errors.length > 0, errors,
  };
}

export function applyPlan(baseRaw, plan, { today } = {}) {
  if (plan?.['archlens-plan'] !== PLAN_VERSION) throw mergeError('E_PLAN_SCHEMA', 'o arquivo não é um plano do archlens (gere com "archlens merge --plan")');
  if (hashRaw(baseRaw) !== plan.baseHash) throw mergeError('E_PLAN_STALE', 'a base mudou depois que o plano foi gerado; rode "archlens merge --plan" de novo');
  const resolutions = new Map(plan.items.filter(i => 'resolution' in i).map(i => [i.key, i.resolution]));
  const applies = it => {
    if (!it.when) return true;
    const at = it.when.lastIndexOf('=');
    return resolutions.get(it.when.slice(0, at)) === it.when.slice(at + 1);
  };
  const open = plan.items.filter(i => 'resolution' in i && applies(i));
  const pending = open.filter(i => i.resolution == null);
  if (pending.length) throw mergeError('E_PLAN_PENDING', `${pending.length} decisão(ões) sem resposta: item(ns) ${pending.map(i => i.n).join(', ')}`, { pending });
  const bad = open.filter(i => !RESOLUTION[resolutionKind(i)].test(String(i.resolution)));
  if (bad.length) throw mergeError('E_PLAN_RESOLUTION', `resposta inválida no(s) item(ns) ${bad.map(i => `${i.n} ("${i.resolution}")`).join(', ')}`);
  const date = today ?? isoToday();
  const ctx = runMerge(baseRaw, plan.delta, { mode: 'apply', resolutions });
  const errors = [...ctx.errors, ...validateModel(ctx.raw).errors];
  if (errors.length) throw mergeError('E_MERGE_INVALID', `o resultado do merge é inválido (${errors.length} erro(s)); nada foi gravado`, { errors });
  if (baseRaw && canonicalJson(ctx.raw) === canonicalJson(baseRaw)) return { raw: baseRaw, entry: null };
  const entry = changelogEntry(ctx, date);
  ctx.raw.changelog = [...(ctx.raw.changelog || []), entry];
  return { raw: ctx.raw, entry };
}

const resolutionKind = it => (it.class === 'conflict' && it.kind === 'view' ? 'view-conflict' : it.class);

function checkDelta(delta) {
  if (!delta || typeof delta !== 'object' || delta['archlens-delta'] !== '1.0') {
    throw mergeError('E_DELTA_SCHEMA', 'o delta precisa de "archlens-delta": "1.0" (veja references/merge.md)');
  }
  for (const [i, op] of (delta.ops || []).entries()) {
    if (!op || !op.op || !op.id) throw mergeError('E_DELTA_SCHEMA', `ops[${i}] precisa de "op" e "id"`);
  }
}

function emptyBase(delta) {
  return {
    archlens: '1.0', name: delta.name ?? 'Arquitetura', ...(delta.description ? { description: delta.description } : {}),
    model: { elements: [], relationships: [] }, views: [],
  };
}

function runMerge(baseRaw, delta, { mode, resolutions = new Map() }) {
  const raw = baseRaw ? structuredClone(baseRaw) : emptyBase(delta);
  raw.model.elements ??= [];
  raw.model.relationships ??= [];
  const ctx = {
    raw, delta, mode, resolutions, items: [], errors: [],
    tree: indexTree(raw), aliases: new Map(), idMap: new Map(), fresh: new Set(),
    log: { added: [], changed: new Set(), status: {}, removed: [], decisions: [] },
  };
  for (const [id, { el }] of ctx.tree) for (const a of el.aliases || []) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), id);
  ctx.typeOf = id => {
    const el = ctx.tree.get(id)?.el;
    return el ? resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null : null;
  };
  mergeElements(ctx);
  return ctx;
}

/** Records a question. Plan mode answers with the simulated default; apply mode with the user's answer. */
function decide(ctx, item, simulated) {
  ctx.items.push({ ...item, resolution: null });
  if (ctx.mode === 'plan') return simulated;
  const r = ctx.resolutions.get(item.key);
  if (r == null) throw mergeError('E_PLAN_STALE', `a decisão "${item.key}" não está no plano; rode "archlens merge --plan" de novo`);
  return r;
}

function note(ctx, item) {
  ctx.items.push(item);
}

/** Delta reference → canonical base id (delta id already merged, base id, or base alias). */
function resolveRef(ctx, ref) {
  if (ref == null) return ref;
  if (ctx.idMap.has(ref)) return ctx.idMap.get(ref);
  if (ctx.tree.has(ref)) return ref;
  return ctx.aliases.get(aliasKey(ref)) ?? ref;
}

const describe = (el, parent) => ({
  id: el.id, names: [el.name ?? el.id, ...(el.aliases || [])], parent: parent ?? null, technology: el.technology,
  type: resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null,
});

function findMatch(ctx, el, parentId) {
  if (ctx.tree.has(el.id)) return { id: el.id };
  for (const k of [el.id, el.name, ...(el.aliases || [])]) {
    const id = k == null ? null : ctx.aliases.get(aliasKey(k));
    if (id) return { id };
  }
  for (const a of el.aliases || []) if (ctx.tree.has(a)) return { id: a };
  const pool = [...ctx.tree].filter(([id]) => !ctx.fresh.has(id)).map(([, { el: b, parent }]) => describe(b, parent));
  const [best] = findCandidates(describe(el, parentId), pool);
  return best ? { candidate: best } : {};
}

function mergeElements(ctx) {
  for (const { el, parent } of orderDelta(ctx.delta.model?.elements)) {
    const parentId = parent == null ? null : resolveRef(ctx, parent);
    const match = findMatch(ctx, el, parentId);
    if (match.id) {
      ctx.idMap.set(el.id, match.id);
      mergeElementInto(ctx, match.id, el, parentId);
      continue;
    }
    if (match.candidate) {
      const c = match.candidate;
      const key = `dup:${el.id}`;
      const res = decide(ctx, { key, class: 'possible-duplicate', kind: 'element', target: el.id, candidate: c.id, score: c.score, why: c.why }, 'different');
      if (ctx.mode === 'plan') mergeElementInto(ctx, c.id, el, parentId, { dry: true, when: `${key}=same` });
      if (res === 'same') {
        ctx.idMap.set(el.id, c.id);
        addAliases(ctx, c.id, [el.id]);
        ctx.log.decisions.push(`duplicata: ${el.id} = ${c.id}`);
        mergeElementInto(ctx, c.id, el, parentId);
        continue;
      }
      if (ctx.mode === 'apply') ctx.log.decisions.push(`duplicata descartada: ${el.id} ≠ ${c.id}`);
    }
    insertElement(ctx, el, parentId);
  }
}

const normType = t => String(t).replace(/^archimate:/, '');

function sameValue(field, a, b) {
  if (field === 'name') return aliasKey(a) === aliasKey(b);
  if (field === 'type') return normType(a) === normType(b);
  return canonicalJson(a) === canonicalJson(b);
}

function parseValue(text, like) {
  if (typeof like === 'boolean') return text === 'true';
  if (typeof like === 'number') return Number(text);
  return text;
}

/** [field, baseValue, deltaValue, apply] for the named fields plus every property the delta sets. */
function fieldsOf(target, incoming, names) {
  return [
    ...names.map(f => [f, target[f] ?? (f === 'status' ? 'active' : undefined), incoming[f], v => { target[f] = v; }]),
    ...Object.entries(incoming.properties || {}).map(([k, v]) => [`properties.${k}`, target.properties?.[k], v, x => { (target.properties ??= {})[k] = x; }]),
  ];
}

/** Field by field: empty in the base → fill; different → conflict question. Returns { filled, changed }. */
function reconcile(ctx, { fields, keyPrefix, kind, target, dry = false, when }) {
  let filled = false;
  let changed = false;
  for (const [field, bv, dv, apply] of fields) {
    if (dv === undefined || sameValue(field, bv, dv)) continue;
    if (bv === undefined || bv === '') {
      if (!dry) { apply(dv); filled = true; }
      continue;
    }
    const item = { key: `${keyPrefix}:${field}`, class: 'conflict', kind, target, field, base: bv, delta: dv, ...(when ? { when } : {}) };
    if (dry) { ctx.items.push({ ...item, resolution: null }); continue; }
    const res = decide(ctx, item, 'take');
    if (res === 'keep') continue;
    apply(res === 'take' ? dv : parseValue(res.slice('value:'.length), dv));
    changed = true;
    ctx.log.decisions.push(`conflito ${target}.${field}: ${res === 'take' ? `take ${JSON.stringify(dv)}` : res}`);
  }
  return { filled, changed };
}

function addList(target, key, list = []) {
  const cur = target[key] ?? [];
  const extra = list.filter(x => !cur.includes(x));
  if (!extra.length) return false;
  target[key] = [...cur, ...extra];
  return true;
}

function addAliases(ctx, id, list) {
  const target = ctx.tree.get(id).el;
  const known = new Set([aliasKey(id), ...(target.aliases || []).map(aliasKey)]);
  const extra = [];
  for (const a of list) {
    if (a == null || known.has(aliasKey(a))) continue;
    known.add(aliasKey(a));
    extra.push(a);
  }
  if (!extra.length) return false;
  target.aliases = [...(target.aliases || []), ...extra];
  for (const a of extra) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), id);
  return true;
}

function mergeElementInto(ctx, baseId, el, parentId, { dry = false, when } = {}) {
  const entry = ctx.tree.get(baseId);
  const target = entry.el;
  const fields = fieldsOf(target, el, ELEMENT_FIELDS);
  if (parentId != null && parentId !== entry.parent) {
    fields.push(['parent', entry.parent ?? undefined, parentId, v => { detach(ctx.tree, baseId); attach(ctx.raw, ctx.tree, target, v); }]);
  }
  const { filled, changed } = reconcile(ctx, { fields, keyPrefix: `el:${el.id}`, kind: 'element', target: baseId, dry, when });
  if (dry) return;
  let more = addList(target, 'tags', el.tags);
  more = addAliases(ctx, baseId, el.aliases || []) || more;
  if (el.inferred === false && target.inferred) {
    delete target.inferred;
    delete target.confidence;
    more = true;
  }
  addSources(target, deltaSources(el, ctx.delta.source));
  if (filled || changed || more) ctx.log.changed.add(baseId);
  note(ctx, { key: `el:${el.id}`, class: filled || more ? 'enrich' : 'unchanged', kind: 'element', target: baseId, ...(el.id !== baseId ? { from: el.id } : {}) });
}

function insertElement(ctx, el, parentId) {
  const { source, sources, parent, ...rest } = el;
  const node = { ...rest };
  const srcs = deltaSources(el, ctx.delta.source);
  if (srcs.length) node.sources = srcs;
  attach(ctx.raw, ctx.tree, node, parentId);
  ctx.fresh.add(node.id);
  ctx.idMap.set(el.id, node.id);
  for (const a of node.aliases || []) if (!ctx.aliases.has(aliasKey(a))) ctx.aliases.set(aliasKey(a), node.id);
  ctx.log.added.push(node.id);
  note(ctx, { key: `el:${el.id}`, class: 'new', kind: 'element', target: node.id, type: el.type, name: el.name ?? el.id, parent: parentId });
}

function changelogEntry(ctx, date) {
  const seq = (ctx.raw.changelog || []).filter(e => e.date === date).length + 1;
  const { added, changed, status, removed, decisions } = ctx.log;
  return {
    id: `${date}-${String(seq).padStart(2, '0')}`, date,
    ...(ctx.delta.source ? { source: ctx.delta.source } : {}),
    summary: ctx.delta.summary ?? `+${added.length} ~${changed.size} −${removed.length}`,
    added, changed: [...changed].filter(id => !added.includes(id)), status, removed, decisions,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/merge.test.mjs && npm test`
Expected: PASS. Se `a similar name…` falhar porque também surgiu conflito condicional em `description` ou `external`,
confira: a base `pagamentos` não tem `description` (fill) e tem `external: true` (igual) — não mude o teste, ache o bug.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/raw-tree.mjs scripts/lib/merge.mjs tests/merge.test.mjs
git -c safe.directory="$PWD" commit -m "feat(merge): plano e apply de deltas para elementos (casamento, conflitos, duplicatas, changelog)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Merge de relações

**Files:**
- Modify: `scripts/lib/merge.mjs`
- Test: `tests/merge.test.mjs`

**Interfaces:**
- Consumes: `canonicalRel` (Task 2); internas da Task 4 (`resolveRef`, `reconcile`, `fieldsOf`, `addList`, `note`, `ctx.typeOf`)
- Produces: `relId(ctx, r)` (id canônico de uma relação crua; usado pela Task 7); chaves `rel:<i>` e `rel:<i>:<campo>`

- [ ] **Step 1: Write the failing tests** — acrescente a `tests/merge.test.mjs`

```js
test('uses in the delta matches the equivalent serving already in the base', () => {
  const plan = planMerge(shop(), delta({ relationships: [{ from: 'loja.api', to: 'k8s', type: 'uses', technology: 'containerd' }] }), TODAY);
  assert.deepEqual(plan.summary, { enrich: 1 });
  const { raw } = applyPlan(shop(), plan, TODAY);
  assert.equal(raw.model.relationships.length, shop().model.relationships.length);
  assert.equal(raw.model.relationships.find(r => r.from === 'k8s' && r.to === 'loja.api').technology, 'containerd');
});

test('relationship fields that differ are conflicts; new ones get a stable id and the source', () => {
  const plan = planMerge(shop(), delta({ relationships: [
    { from: 'cliente', to: 'loja.web', description: 'Navega e compra' },
    { from: 'loja.api.checkout', to: 'loja.api.catalogo', description: 'Consulta preço' },
  ] }), TODAY);
  const c = plan.items.find(i => i.class === 'conflict');
  assert.deepEqual([c.key, c.base, c.delta], ['rel:0:description', 'Compra', 'Navega e compra']);
  const { raw } = applyPlan(shop(), answer(plan, { 'rel:0:description': 'keep' }), TODAY);
  const added = raw.model.relationships.at(-1);
  assert.equal(added.id, 'loja.api.catalogo-serving-loja.api.checkout');
  assert.deepEqual(added.sources, [SRC]);
});

test('relationships may point at elements by alias', () => {
  const base = shop();
  find(base, 'loja.api').aliases = ['orders-service'];
  const { raw } = applyPlan(base, planMerge(base, delta({ relationships: [{ from: 'orders-service', to: 'pagamentos', description: 'Estorna' }] }), TODAY), TODAY);
  assert.equal(raw.model.relationships.at(-1).from, 'loja.api');
});

test('a relationship to an unknown element blocks the plan (typo protection)', () => {
  const plan = planMerge(shop(), delta({ relationships: [{ from: 'loja.api', to: 'pagamentoz' }] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.ok(plan.errors.some(e => e.code === 'E_UNKNOWN_REF'));
  assert.throws(() => applyPlan(shop(), plan, TODAY), /E_MERGE_INVALID/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL — relações do delta ignoradas (`summary` vazio).

- [ ] **Step 3: Implement** — em `scripts/lib/merge.mjs`

Acrescente ao topo: `import { canonicalRel } from './model.mjs';`

Acrescente abaixo de `ELEMENT_FIELDS`:

```js
const REL_FIELDS = ['description', 'technology', 'accessType', 'status', 'statusReason'];
```

Em `runMerge`, logo após `mergeElements(ctx);`, acrescente `mergeRelationships(ctx);`.

Acrescente as funções (depois de `insertElement`):

```js
function relKey(ctx, r) {
  const c = canonicalRel(r, ctx.typeOf);
  return c.error ? null : `${c.from}|${c.type}|${c.to}`;
}

/** Id of a raw relationship as normalizeModel names it: explicit id, or from-type-to after reading `uses`. */
function relId(ctx, r) {
  if (r.id) return r.id;
  const c = canonicalRel(r, ctx.typeOf);
  return c.error ? `${r.from}-${r.type}-${r.to}` : `${c.from}-${c.type}-${c.to}`;
}

function mergeRelationships(ctx) {
  const byKey = new Map();
  const byId = new Map();
  for (const r of ctx.raw.model.relationships) {
    const k = relKey(ctx, r);
    if (k && !byKey.has(k)) byKey.set(k, r);
    byId.set(relId(ctx, r), r);
  }
  (ctx.delta.model?.relationships || []).forEach((dr, i) => {
    const r = { ...dr, from: resolveRef(ctx, dr.from), to: resolveRef(ctx, dr.to) };
    const k = relKey(ctx, r);
    const base = (r.id && byId.get(r.id)) || (k && byKey.get(k));
    if (base) { mergeRelInto(ctx, base, r, i); return; }
    const { source, sources, ...rest } = r;
    const generated = relId(ctx, { ...r, id: undefined });
    let id = r.id ?? generated;
    for (let n = 2; byId.has(id); n++) id = `${generated}#${n}`;
    const node = { id, ...rest };
    node.id = id;
    const srcs = deltaSources(dr, ctx.delta.source);
    if (srcs.length) node.sources = srcs;
    ctx.raw.model.relationships.push(node);
    byId.set(id, node);
    if (k) byKey.set(k, node);
    ctx.log.added.push(id);
    note(ctx, { key: `rel:${i}`, class: 'new', kind: 'relationship', target: id, from: r.from, to: r.to, type: r.type ?? 'uses' });
  });
}

function mergeRelInto(ctx, base, r, i) {
  const id = relId(ctx, base);
  const { filled, changed } = reconcile(ctx, { fields: fieldsOf(base, r, REL_FIELDS), keyPrefix: `rel:${i}`, kind: 'relationship', target: id });
  let more = addList(base, 'tags', r.tags);
  if (r.inferred === false && base.inferred) { delete base.inferred; more = true; }
  addSources(base, deltaSources(r, ctx.delta.source));
  if (filled || changed || more) ctx.log.changed.add(id);
  note(ctx, { key: `rel:${i}`, class: filled || more ? 'enrich' : 'unchanged', kind: 'relationship', target: id });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/merge.mjs tests/merge.test.mjs
git -c safe.directory="$PWD" commit -m "feat(merge): relações casadas pela leitura ArchiMate (uses ≡ serving invertido), ids estáveis

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Merge de visões e premissas

**Files:**
- Modify: `scripts/lib/merge.mjs`
- Test: `tests/merge.test.mjs`

**Interfaces:**
- Consumes: internas da Task 4
- Produces: `VIEW_REFS = ['scope', 'anchor']`, `VIEW_LISTS = ['focus', 'expand', 'include']` (usadas pela Task 7); chave `view:<key>`

- [ ] **Step 1: Write the failing test** — acrescente a `tests/merge.test.mjs`

```js
test('views: new keys are added with references rewritten; a changed spec is a keep/take conflict', () => {
  const base = shop();
  find(base, 'loja.api').aliases = ['orders-service'];
  const d = delta({}, {
    views: [
      { key: 'comp', notation: 'c4', level: 'component', scope: 'orders-service' },
      { key: 'ctx', notation: 'c4', level: 'context', scope: 'loja', title: 'Contexto' },
    ],
    assumptions: ['O ERP é SaaS'],
  });
  const plan = planMerge(base, d, TODAY);
  const c = plan.items.find(i => i.kind === 'view' && i.class === 'conflict');
  assert.equal(c.key, 'view:ctx');
  assert.throws(() => applyPlan(base, answer(structuredClone(plan), { 'view:ctx': 'value:x' }), TODAY), /E_PLAN_RESOLUTION/);
  const { raw } = applyPlan(base, answer(plan, { 'view:ctx': 'take' }), TODAY);
  assert.equal(raw.views.find(v => v.key === 'comp').scope, 'loja.api');
  assert.equal(raw.views.find(v => v.key === 'ctx').title, 'Contexto');
  assert.deepEqual(raw.assumptions, ['O ERP é SaaS']);
  const again = planMerge(raw, d, TODAY);
  assert.deepEqual(again.summary, { unchanged: 2 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL — `c` indefinido (visões ignoradas).

- [ ] **Step 3: Implement** — em `scripts/lib/merge.mjs`

Acrescente abaixo de `REL_FIELDS`:

```js
const VIEW_REFS = ['scope', 'anchor'];
const VIEW_LISTS = ['focus', 'expand', 'include'];
```

Em `runMerge`, depois de `mergeRelationships(ctx);`: `mergeViews(ctx);` e `mergeAssumptions(ctx);`.

Acrescente as funções:

```js
function rewriteView(ctx, view) {
  const v = structuredClone(view);
  for (const f of VIEW_REFS) if (v[f]) v[f] = resolveRef(ctx, v[f]);
  for (const f of VIEW_LISTS) if (Array.isArray(v[f])) v[f] = v[f].map(x => resolveRef(ctx, x));
  if (Array.isArray(v.steps)) {
    v.steps = v.steps.map(s => ({ ...s, ...(s.from ? { from: resolveRef(ctx, s.from) } : {}), ...(s.to ? { to: resolveRef(ctx, s.to) } : {}) }));
  }
  return v;
}

function mergeViews(ctx) {
  if (!ctx.delta.views?.length) return;
  ctx.raw.views ??= [];
  for (const dv of ctx.delta.views) {
    const v = rewriteView(ctx, dv);
    const key = `view:${v.key}`;
    const i = ctx.raw.views.findIndex(x => x.key === v.key);
    if (i < 0) {
      ctx.raw.views.push(v);
      ctx.log.added.push(key);
      note(ctx, { key, class: 'new', kind: 'view', target: v.key });
      continue;
    }
    if (canonicalJson(ctx.raw.views[i]) === canonicalJson(v)) {
      note(ctx, { key, class: 'unchanged', kind: 'view', target: v.key });
      continue;
    }
    const res = decide(ctx, { key, class: 'conflict', kind: 'view', target: v.key, base: ctx.raw.views[i], delta: v }, 'take');
    if (res !== 'take') continue;
    ctx.raw.views[i] = v;
    ctx.log.changed.add(key);
    ctx.log.decisions.push(`visão ${v.key}: take`);
  }
}

function mergeAssumptions(ctx) {
  const current = ctx.raw.assumptions || [];
  const extra = (ctx.delta.assumptions || []).filter(a => !current.includes(a));
  if (!extra.length) return;
  ctx.raw.assumptions = [...current, ...extra];
  note(ctx, { key: 'assumptions', class: 'new', kind: 'assumption', target: `${extra.length} premissa(s)`, added: extra });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/merge.mjs tests/merge.test.mjs
git -c safe.directory="$PWD" commit -m "feat(merge): visões (conflito keep/take) e premissas no delta

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Operações explícitas (`rename`, `alias`, `status`, `remove`)

**Files:**
- Modify: `scripts/lib/merge.mjs`
- Test: `tests/merge.test.mjs`

**Interfaces:**
- Consumes: `STATUSES` (Task 2); `descendantsOf` (Task 4); `relId`, `VIEW_REFS`, `VIEW_LISTS` (Tasks 5–6)
- Produces: chaves `op:<i>`; item de `remove` com `cascade: { elements: string[], relationships: string[], views: Array<{ key, action: 'remove'|'trim' }> }`;
  item de `status` com `from`, `status`, `reason?`; erros `E_UNKNOWN_REF`, `E_STATUS`, `E_OP` em `plan.errors`

- [ ] **Step 1: Write the failing tests** — acrescente a `tests/merge.test.mjs`

```js
test('rename keeps the old name as an alias; alias op adds names', () => {
  const d = delta({}, { ops: [{ op: 'rename', id: 'loja.api', name: 'Orders API' }, { op: 'alias', id: 'loja.api', add: ['orders-service'] }] });
  const { raw } = applyPlan(shop(), planMerge(shop(), d, TODAY), TODAY);
  const api = find(raw, 'loja.api');
  assert.equal(api.name, 'Orders API');
  assert.deepEqual(api.aliases, ['API', 'orders-service']);
});

test('status changes are applied; retiring needs confirmation', () => {
  const plan = planMerge(shop(), delta({}, { ops: [
    { op: 'status', id: 'pagamentos', status: 'deprecated', reason: 'troca de adquirente' },
    { op: 'status', id: 'k8s', status: 'retired', reason: 'migrado para ECS' },
  ] }), TODAY);
  assert.equal(plan.items.find(i => i.key === 'op:0').resolution, undefined);
  assert.equal(plan.items.find(i => i.key === 'op:1').resolution, null);
  const { raw, entry } = applyPlan(shop(), answer(plan, { 'op:1': 'no' }), TODAY);
  assert.equal(find(raw, 'pagamentos').status, 'deprecated');
  assert.equal(find(raw, 'pagamentos').statusReason, 'troca de adquirente');
  assert.equal(find(raw, 'k8s').status, undefined);
  assert.deepEqual(entry.status, { pagamentos: 'deprecated' });
});

test('remove cascades to children and relationships, and needs confirmation', () => {
  const plan = planMerge(shop(), delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] }), TODAY);
  const it = plan.items.find(i => i.key === 'op:0');
  assert.deepEqual([...it.cascade.elements].sort(), ['loja.api', 'loja.api.catalogo', 'loja.api.checkout']);
  assert.equal(it.cascade.relationships.length, 7);
  const { raw, entry } = applyPlan(shop(), answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.equal(find(raw, 'loja.api'), undefined);
  assert.ok(!raw.model.relationships.some(r => [r.from, r.to].some(x => x.startsWith('loja.api'))));
  assert.deepEqual([...entry.removed].sort(), ['loja.api', 'loja.api.catalogo', 'loja.api.checkout']);
});

test('remove trims view lists and drops views scoped on what is removed', () => {
  const base = shop();
  base.views.push({ key: 'f', notation: 'c4', level: 'container', scope: 'loja', focus: ['loja.db', 'loja.web'] });
  const plan = planMerge(base, delta({}, { ops: [{ op: 'remove', id: 'loja.db' }] }), TODAY);
  assert.deepEqual(plan.items[0].cascade.views, [{ key: 'f', action: 'trim' }]);
  const { raw } = applyPlan(base, answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.deepEqual(raw.views.find(v => v.key === 'f').focus, ['loja.web']);
  const gone = planMerge(shop(), delta({}, { ops: [{ op: 'remove', id: 'loja' }] }), TODAY);
  assert.deepEqual(gone.items[0].cascade.views, [{ key: 'ctx', action: 'remove' }]);
});

test('remove also works on a relationship id', () => {
  const plan = planMerge(shop(), delta({}, { ops: [{ op: 'remove', id: 'k8s-serving-loja.api' }] }), TODAY);
  const { raw } = applyPlan(shop(), answer(plan, { 'op:0': 'yes' }), TODAY);
  assert.ok(!raw.model.relationships.some(r => r.from === 'k8s'));
});

test('an op on an unknown id or with an invalid status blocks the plan', () => {
  const plan = planMerge(shop(), delta({}, { ops: [
    { op: 'status', id: 'nada', status: 'deprecated' },
    { op: 'status', id: 'k8s', status: 'morto' },
    { op: 'explode', id: 'k8s' },
  ] }), TODAY);
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.errors.map(e => e.code), ['E_UNKNOWN_REF', 'E_STATUS', 'E_OP']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL — ops ignoradas.

- [ ] **Step 3: Implement** — em `scripts/lib/merge.mjs`

Troque os imports de `registry.mjs` e `raw-tree.mjs` por:

```js
import { resolveType, STATUSES } from './registry.mjs';
import { indexTree, orderDelta, attach, detach, descendantsOf } from './raw-tree.mjs';
```

Em `runMerge`, depois de `mergeAssumptions(ctx);`: `runOps(ctx);`.

Acrescente as funções:

```js
function findRelationship(ctx, id) {
  return ctx.raw.model.relationships.find(r => relId(ctx, r) === id) ?? null;
}

function runOps(ctx) {
  (ctx.delta.ops || []).forEach((op, i) => {
    const key = `op:${i}`;
    const opError = (code, message, hint) => {
      ctx.errors.push({ code, message: `ops[${i}] (${op.op}): ${message}`, path: `ops[${i}]`, hint });
      note(ctx, { key, class: 'op', op: op.op, target: op.id, error: code });
    };
    const elId = resolveRef(ctx, op.id);
    const el = ctx.tree.get(elId)?.el ?? null;
    const rel = el ? null : findRelationship(ctx, op.id);
    if (!el && !rel) return opError('E_UNKNOWN_REF', `"${op.id}" não existe`, 'use o id (ou alias) de um elemento, ou o id de uma relação');
    const id = el ? elId : relId(ctx, rel);
    const target = el ?? rel;
    switch (op.op) {
      case 'rename': {
        if (!el) return opError('E_OP', 'rename só vale para elementos', 'para relações, mude "description" pelo delta');
        if (!op.name || op.name === target.name) return note(ctx, { key, class: 'op', op: 'rename', target: id, noop: true });
        const old = target.name;
        target.name = op.name;
        if (old) addAliases(ctx, id, [old]);
        ctx.log.changed.add(id);
        return note(ctx, { key, class: 'op', op: 'rename', target: id, from: old ?? id, to: op.name });
      }
      case 'alias': {
        if (!el) return opError('E_OP', 'alias só vale para elementos', 'relações são casadas por origem, tipo e destino');
        if (addAliases(ctx, id, op.add || [])) ctx.log.changed.add(id);
        return note(ctx, { key, class: 'op', op: 'alias', target: id, add: op.add || [] });
      }
      case 'status': {
        if (!STATUSES.includes(op.status)) return opError('E_STATUS', `status "${op.status}" inválido`, `use ${STATUSES.join(' | ')}`);
        const from = target.status ?? 'active';
        if (from === op.status) return note(ctx, { key, class: 'op', op: 'status', target: id, status: op.status, noop: true });
        const item = { key, class: 'op', op: 'status', target: id, from, status: op.status, ...(op.reason ? { reason: op.reason } : {}) };
        if (op.status === 'retired') {
          if (decide(ctx, item, 'yes') !== 'yes') { ctx.log.decisions.push(`status ${id} → retired: recusado`); return undefined; }
        } else note(ctx, item);
        target.status = op.status;
        if (op.reason) target.statusReason = op.reason;
        addSources(target, ctx.delta.source ? [ctx.delta.source] : []);
        ctx.log.status[id] = op.status;
        return undefined;
      }
      case 'remove': {
        const cascade = el ? removalCascade(ctx, id) : { elements: [], relationships: [id], views: [] };
        if (decide(ctx, { key, class: 'op', op: 'remove', target: id, cascade }, 'yes') !== 'yes') {
          ctx.log.decisions.push(`remover ${id}: recusado`);
          return undefined;
        }
        applyRemoval(ctx, cascade);
        ctx.log.removed.push(...(el ? cascade.elements : [id]));
        return undefined;
      }
      default:
        return opError('E_OP', `operação desconhecida "${op.op}"`, 'use rename | alias | status | remove');
    }
  });
}

function removalCascade(ctx, id) {
  const gone = new Set([id, ...descendantsOf(ctx.tree, id)]);
  const relationships = ctx.raw.model.relationships.filter(r => gone.has(r.from) || gone.has(r.to)).map(r => relId(ctx, r));
  const views = [];
  for (const v of ctx.raw.views || []) {
    if (VIEW_REFS.some(f => gone.has(v[f]))) views.push({ key: v.key, action: 'remove' });
    else if (VIEW_LISTS.some(f => (v[f] || []).some(x => gone.has(x))) || (v.steps || []).some(s => gone.has(s.from) || gone.has(s.to))) {
      views.push({ key: v.key, action: 'trim' });
    }
  }
  return { elements: [...gone], relationships, views };
}

function applyRemoval(ctx, cascade) {
  const gone = new Set(cascade.elements);
  // Relationship ids depend on element types, so drop relationships before the elements leave the tree.
  const rels = new Set(cascade.relationships);
  ctx.raw.model.relationships = ctx.raw.model.relationships.filter(r => !rels.has(relId(ctx, r)));
  for (const id of cascade.elements) if (ctx.tree.has(id)) detach(ctx.tree, id);
  for (const id of cascade.elements) ctx.tree.delete(id);
  for (const [k, id] of ctx.aliases) if (gone.has(id)) ctx.aliases.delete(k);
  const action = new Map(cascade.views.map(v => [v.key, v.action]));
  if (!action.size) return;
  ctx.raw.views = ctx.raw.views.filter(v => action.get(v.key) !== 'remove').map(v => {
    if (action.get(v.key) !== 'trim') return v;
    const t = { ...v };
    for (const f of VIEW_LISTS) if (Array.isArray(t[f])) t[f] = t[f].filter(x => !gone.has(x));
    if (Array.isArray(t.steps)) t.steps = t.steps.filter(s => !gone.has(s.from) && !gone.has(s.to));
    return t;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS. (Se `cascade.relationships.length` não for 7, conte à mão as relações de `tests/fixtures/shop.json`
que tocam `loja.api*` — web→checkout, web→catalogo, checkout→db, checkout→pagamentos, checkout→app-svc, k8s→api, pg→api — e ache o bug.)

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/merge.mjs tests/merge.test.mjs
git -c safe.directory="$PWD" commit -m "feat(merge): operações rename, alias, status e remove (com cascata e confirmação)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Documento — fontes, ciclo de vida e histórico

**Files:**
- Modify: `scripts/lib/doc.mjs`
- Test: `tests/doc.test.mjs`

**Interfaces:**
- Consumes: elementos/relações normalizados com `status`, `statusReason`, `sources` (Task 2); `raw.changelog` (Task 4)
- Produces: frontmatter com `revision` e `updated`; seções `## Ciclo de vida`, `## Fontes`, `## Histórico`;
  colunas `Status`/`Fontes` quando houver dados

- [ ] **Step 1: Write the failing tests** — acrescente a `tests/doc.test.mjs`

```js
test('generateDoc shows lifecycle, sources and history', () => {
  const r = raw();
  const api = r.model.elements.find(e => e.id === 'loja').children.find(c => c.id === 'loja.api');
  Object.assign(api, { status: 'deprecated', statusReason: 'migração para Kotlin', sources: [{ kind: 'repo', ref: 'github.com/x/orders@a1b2c3d', date: '2026-10-02' }] });
  r.changelog = [{ id: '2026-10-02-01', date: '2026-10-02', source: { kind: 'repo', ref: 'github.com/x/orders@a1b2c3d' }, summary: 'Leitura do repo orders',
    added: ['loja.worker'], changed: ['loja.api'], status: { 'loja.api': 'deprecated' }, removed: [], decisions: ['conflito loja.api.technology: take "Kotlin"'] }];
  const md = generateDoc(r, { date: '2026-10-03' });
  assert.match(md, /^revision: 1$/m);
  assert.match(md, /^updated: 2026-10-02$/m);
  assert.match(md, /archlens merge/);
  assert.match(md, /## Ciclo de vida[\s\S]*API[\s\S]*deprecated[\s\S]*migração para Kotlin/);
  assert.match(md, /## Fontes[\s\S]*\| repo \| github\.com\/x\/orders@a1b2c3d \| 2026-10-02 \| 1 \|/);
  assert.match(md, /## Histórico[\s\S]*2026-10-02[\s\S]*Leitura do repo orders/);
  assert.match(md, /\| Status \|/);
  assert.match(md, /\| Fontes \|/);
  assert.deepEqual(extractModel(md), r);
});

test('generateDoc without lifecycle data keeps the old tables', () => {
  const md = generateDoc(raw(), { date: '2026-10-03' });
  assert.doesNotMatch(md, /\| Status \|/);
  assert.doesNotMatch(md, /\| Fontes \|/);
  assert.match(md, /^revision: 0$/m);
  assert.match(md, /^updated: 2026-10-03$/m);
  assert.match(md, /_Todos os elementos e relações estão ativos\._/);
  assert.match(md, /_Nenhuma rodada de merge registrada\._/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/doc.test.mjs`
Expected: FAIL — `revision` ausente.

- [ ] **Step 3: Implement** — em `scripts/lib/doc.mjs`

Substitua a linha `out.push(\`generated: ${date ?? new Date().toISOString().slice(0, 10)}\`);` por:

```js
  const changelog = raw.changelog || [];
  const today = date ?? new Date().toISOString().slice(0, 10);
  out.push(`generated: ${today}`);
  out.push(`revision: ${changelog.length}`);
  out.push(`updated: ${changelog.at(-1)?.date ?? today}`);
```

Substitua o bloco da nota do topo (as três linhas que começam em `'> Base de conhecimento gerada pela skill **archlens**...`) por:

```js
  out.push('> Base de conhecimento gerada pela skill **archlens**. As tabelas são derivadas do bloco',
    '> `archlens-json` no fim do documento, que é a fonte de verdade. Evolua a base com `archlens merge`',
    '> (delta → plano → apply); editar o bloco à mão e regenerar com `archlens doc` continua possível.',
    '> Texto entre marcadores `<!-- keep:... -->` é preservado ao regenerar.', '');
```

Logo depois de `const hasArchimate = els.some(e => !e.c4);`, acrescente:

```js
  const hasStatus = els.some(e => e.status !== 'active') || model.relationships.some(r => r.status !== 'active');
  const hasSources = els.some(e => e.sources.length);
  const KIND_ABBR = { prompt: 'P', repo: 'R', doc: 'D', manual: 'M' };
  const extraHead = [...(hasStatus ? ['Status'] : []), ...(hasSources ? ['Fontes'] : [])];
  const extra = e => [
    ...(hasStatus ? [e.status] : []),
    ...(hasSources ? [[...new Set(e.sources.map(s => KIND_ABBR[s.kind] ?? s.kind))].join(' ')] : []),
  ];
```

Insira as colunas extras antes de `id` nas três tabelas de elementos:

```js
        out.push(table(['Container', 'Tecnologia', 'Descrição', ...extraHead, 'id'], containers.map(c => [c.name + (c.type === 'data-object' ? ' 🛢' : ''), c.technology, c.description, ...extra(c), `\`${c.id}\``])), '');
```
```js
          out.push(table(['Componente', 'Tecnologia', 'Descrição', ...extraHead, 'id'], comps.map(x => [x.name, x.technology, x.description, ...extra(x), `\`${x.id}\``])), '');
```
```js
    out.push(table(['Elemento', 'Tipo ArchiMate', 'Descrição', ...extraHead, 'id'], list.map(e => [
      e.name + (e.inferred ? ' ⚠︎' : ''), ELEMENT_TYPES[e.type].label + (e.c4 ? ` (C4 ${C4_LABELS[e.c4.kind]})` : ''), e.description, ...extra(e), `\`${e.id}\``,
    ])), '');
```

Imediatamente antes de `// Assumptions`, acrescente:

```js
  // Lifecycle
  out.push('## Ciclo de vida', '');
  const lifecycle = [
    ...els.filter(e => e.status !== 'active').map(e => [e.name, ELEMENT_TYPES[e.type].label, e.status, e.statusReason, `\`${e.id}\``]),
    ...model.relationships.filter(r => r.status !== 'active').map(r => {
      const o = c4Orientation(r) ?? r;
      return [`${name(o.from)} → ${name(o.to)}`, r.c4 ? 'usa' : r.type, r.status, r.statusReason, `\`${r.id}\``];
    }),
  ];
  out.push(lifecycle.length ? table(['Item', 'Tipo', 'Status', 'Motivo', 'id'], lifecycle) : '_Todos os elementos e relações estão ativos._', '');
```

Imediatamente antes de `// Views catalogue`, acrescente:

```js
  // Sources
  out.push('## Fontes', '');
  const bySource = new Map();
  for (const item of [...els, ...model.relationships]) {
    for (const s of item.sources) {
      const k = `${s.kind}|${s.ref ?? ''}|${s.path ?? ''}`;
      const row = bySource.get(k) ?? { kind: s.kind, ref: s.ref ?? (s.path ? '' : '(trechos de texto livre)'), path: s.path, date: s.date, items: new Set() };
      row.items.add(item.id);
      if (s.date && (!row.date || s.date > row.date)) row.date = s.date;
      bySource.set(k, row);
    }
  }
  out.push(bySource.size
    ? table(['Tipo', 'Referência', 'Data', 'Itens'], [...bySource.values()].map(r => [r.kind, r.path ? `${r.ref} · ${r.path}` : r.ref, r.date, r.items.size]))
    : '_Nenhuma fonte registrada._', '');
```

Imediatamente antes de `out.push('## Notas', '');`, acrescente:

```js
  // History
  out.push('## Histórico', '');
  if (!changelog.length) out.push('_Nenhuma rodada de merge registrada._', '');
  else {
    out.push(table(['Data', 'Fonte', 'Resumo', 'Mudanças', 'Decisões'], changelog.slice(-10).reverse().map(e => [
      e.date, e.source ? `${e.source.kind}${e.source.ref ? ` ${e.source.ref}` : ''}` : '—', e.summary,
      [`+${e.added?.length ?? 0}`, `~${e.changed?.length ?? 0}`, `−${e.removed?.length ?? 0}`,
        Object.keys(e.status ?? {}).length ? `status ${Object.keys(e.status).length}` : ''].filter(Boolean).join(' '),
      (e.decisions ?? []).join('; '),
    ])), '');
    if (changelog.length > 10) out.push(`_Mostrando as 10 rodadas mais recentes de ${changelog.length}; o histórico completo está em \`changelog\` no bloco \`archlens-json\`._`, '');
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/doc.mjs tests/doc.test.mjs
git -c safe.directory="$PWD" commit -m "feat(doc): seções de ciclo de vida, fontes e histórico; colunas Status/Fontes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: CLI — `merge --plan/--apply`, relatório e `doc`/`build` no próprio `.md`

**Files:**
- Create: `scripts/lib/merge-report.mjs`
- Modify: `scripts/archlens.mjs` (imports, `HELP`, `readJson`, casos `doc`, `build`, `merge`)
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `planMerge`, `applyPlan` (Task 4); `generateDoc`, `extractModel`
- Produces: `formatPlanReport(plan): string`; comandos
  `archlens merge <base.md> <delta.json> --plan <plano.json> [--json]` (exit 2 se `blocked`) e
  `archlens merge <base.md> --apply <plano.json>` (exit 2 em erro; não regrava se nada mudou)

- [ ] **Step 1: Write the failing tests** — `tests/cli.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDoc, extractModel } from '../scripts/lib/doc.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const md = generateDoc(shop(), { date: '2026-10-01' })
    .replace('<!-- keep:notes -->\n_Decisões, riscos e pendências._', '<!-- keep:notes -->\nNota à mão.');
  writeFileSync(join(dir, 'ARCHITECTURE.md'), md);
  return dir;
};

test('merge --plan lists pending decisions and --apply refuses until they are answered', () => {
  const dir = setup();
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({
    'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'rodada 1' }, summary: 'API migra para Kotlin',
    model: {
      elements: [
        { id: 'loja.api', type: 'c4:container', technology: 'Kotlin' },
        { id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja', technology: 'Kotlin' },
      ],
      relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses' }],
    },
  }));
  const p = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'plano.json'], dir);
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /conflito loja\.api\.technology/);
  const plan = JSON.parse(readFileSync(join(dir, 'plano.json'), 'utf8'));
  const refused = run(['merge', 'ARCHITECTURE.md', '--apply', 'plano.json'], dir);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /E_PLAN_PENDING/);
  plan.items.find(i => i.class === 'conflict').resolution = 'take';
  writeFileSync(join(dir, 'plano.json'), JSON.stringify(plan));
  const ok = run(['merge', 'ARCHITECTURE.md', '--apply', 'plano.json'], dir);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /commit sugerido/);
  const md = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  assert.equal(extractModel(md).changelog.length, 1);
  assert.match(md, /Nota à mão\./, 'keep blocks survive the merge');
  assert.match(md, /Worker/);
});

test('merge creates a missing base; the same delta again changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({
    'archlens-delta': '1.0', name: 'Nova', source: { kind: 'manual', ref: 'kickoff' },
    model: { elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }, { id: 'u', type: 'c4:person', name: 'Usuário' }], relationships: [{ from: 'u', to: 'sis' }] },
  }));
  assert.equal(run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p.json'], dir).status, 0);
  assert.equal(run(['merge', 'ARCHITECTURE.md', '--apply', 'p.json'], dir).status, 0);
  assert.ok(existsSync(join(dir, 'ARCHITECTURE.md')));
  const again = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p2.json', '--json'], dir);
  assert.deepEqual(Object.keys(JSON.parse(again.stdout).summary), ['unchanged']);
  const r = run(['merge', 'ARCHITECTURE.md', '--apply', 'p2.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nada mudou/);
});

test('a blocked plan exits with 2 and shows the errors', () => {
  const dir = setup();
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({ 'archlens-delta': '1.0', model: { relationships: [{ from: 'loja.api', to: 'pagamentoz' }] } }));
  const p = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p.json'], dir);
  assert.equal(p.status, 2);
  assert.match(p.stdout, /bloqueado[\s\S]*E_UNKNOWN_REF/);
});

test('doc regenerates an ARCHITECTURE.md in place, keeping hand-written blocks', () => {
  const dir = setup();
  const r = run(['doc', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), /Nota à mão\./);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — `comando desconhecido "merge"`.

- [ ] **Step 3: Create `scripts/lib/merge-report.mjs`**

```js
// Human-readable report of a merge plan: what the agent shows the user before asking each question.
const LABELS = { new: 'novos', unchanged: 'sem mudança', enrich: 'enriquecidos', conflict: 'conflitos', 'possible-duplicate': 'possíveis duplicatas', op: 'operações' };
const show = v => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v));

function describeItem(it) {
  const cond = it.when ? ` (só se [${it.when.slice(0, it.when.lastIndexOf('='))}] = same)` : '';
  if (it.class === 'conflict' && it.kind === 'view') return `conflito na visão "${it.target}": a definição mudou  → keep | take`;
  if (it.class === 'conflict') return `conflito ${it.target}.${it.field}: base ${show(it.base)} ≠ delta ${show(it.delta)}${cond}  → keep | take | value:<x>`;
  if (it.class === 'possible-duplicate') return `possível duplicata: "${it.target}" parece "${it.candidate}" (${it.score}; ${it.why})  → same | different`;
  if (it.op === 'remove') {
    const c = it.cascade;
    const views = c.views.length ? `; visões: ${c.views.map(v => `${v.key} (${v.action})`).join(', ')}` : '';
    return `remover ${it.target}: ${c.elements.length} elemento(s), ${c.relationships.length} relação(ões)${views}  → yes | no`;
  }
  if (it.op === 'status') return `status ${it.target}: ${it.from} → ${it.status}${it.reason ? ` (${it.reason})` : ''}  → yes | no`;
  return `${it.class} ${it.target}`;
}

export function formatPlanReport(plan) {
  const src = plan.delta.source;
  const out = [`Plano de merge: ${plan.base} ← ${src ? `${src.kind}${src.ref ? ` ${src.ref}` : ''}` : 'delta sem fonte'}`];
  if (plan.delta.summary) out.push(`  ${plan.delta.summary}`);
  out.push(`  ${Object.entries(plan.summary).map(([k, n]) => `${LABELS[k] ?? k}: ${n}`).join(' · ') || 'nada a fazer'}`);
  const questions = plan.items.filter(i => 'resolution' in i);
  if (questions.length) {
    out.push('', 'Decisões pendentes (preencha "resolution" de cada item no plano):');
    for (const it of questions) out.push(`  [${it.n}] ${describeItem(it)}`);
  }
  const fresh = plan.items.filter(i => i.class === 'new');
  if (fresh.length) out.push('', `Novos: ${fresh.map(i => i.target).join(', ')}`);
  if (plan.blocked) {
    out.push('', `✗ Plano bloqueado: o resultado teria ${plan.errors.length} erro(s). Corrija o delta e gere o plano de novo.`);
    for (const e of plan.errors) out.push(`  ${e.code}  ${e.message}`);
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Wire the CLI** — em `scripts/archlens.mjs`

Acrescente aos imports:

```js
import { planMerge, applyPlan } from './lib/merge.mjs';
import { formatPlanReport } from './lib/merge-report.mjs';
```

No `HELP`, depois da linha do `extract`, acrescente:

```
  merge     <base.md> <delta.json> --plan p.json  compara o delta com a base e grava o plano (decisões pendentes)
  merge     <base.md> --apply p.json            aplica o plano respondido, regenera a base e registra o histórico
```

Depois de `function fail(...)`, acrescente:

```js
function readJson(path) {
  if (!existsSync(path)) fail(`arquivo não encontrado: ${path}`);
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { fail(`${path}: JSON inválido: ${e.message}`); }
}
```

Substitua o caso `doc` por:

```js
    case 'doc': {
      const raw = loadRaw(file);
      const { errors } = validateModel(raw);
      if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros antes de gerar o documento', 2); }
      const isMd = extname(file).toLowerCase() === '.md';
      const out = args.out && args.out !== true ? args.out : isMd ? file : join(dirname(file), 'ARCHITECTURE.md');
      const existing = existsSync(out) ? readFileSync(out, 'utf8') : isMd ? readFileSync(file, 'utf8') : undefined;
      atomicWrite(out, generateDoc(raw, { existing }));
      console.log(`✓ ${out}`);
      break;
    }
```

No caso `build`, substitua o bloco `if (extname(file).toLowerCase() !== '.md' || resolve(file) !== resolve(docPath)) { … }` por:

```js
      const { errors } = validateModel(raw);
      if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros do modelo', 2); }
      const existing = existsSync(docPath) ? readFileSync(docPath, 'utf8') : extname(file).toLowerCase() === '.md' ? readFileSync(file, 'utf8') : undefined;
      atomicWrite(docPath, generateDoc(raw, { existing }));
      console.log(`✓ ${docPath}`);
```

Acrescente o caso `merge` antes de `default:`:

```js
    case 'merge': {
      const usage = 'uso: archlens merge <base.md> <delta.json> --plan <plano.json>  |  archlens merge <base.md> --apply <plano.json>';
      if (!file || extname(file).toLowerCase() !== '.md') fail(`a base do merge é o ARCHITECTURE.md (o bloco archlens-json é a fonte de verdade)\n${usage}`);
      const baseRaw = existsSync(file) ? loadRaw(file) : null;
      if (args.plan && args.plan !== true) {
        const deltaPath = args._[2];
        if (!deltaPath) fail(usage);
        let plan;
        try { plan = planMerge(baseRaw, readJson(deltaPath), { base: basename(file) }); } catch (e) { fail(e.message, 2); }
        atomicWrite(args.plan, JSON.stringify(plan, null, 2) + '\n');
        if (args.json) console.log(JSON.stringify(plan, null, 2));
        else console.log(`${formatPlanReport(plan)}\n\n✓ plano em ${args.plan}`);
        process.exitCode = plan.blocked ? 2 : 0;
      } else if (args.apply && args.apply !== true) {
        let res;
        try { res = applyPlan(baseRaw, readJson(args.apply)); } catch (e) {
          if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
          fail(e.message, 2);
        }
        if (!res.entry) { console.log('= nada mudou; a base não foi regravada'); break; }
        atomicWrite(file, generateDoc(res.raw, { existing: existsSync(file) ? readFileSync(file, 'utf8') : undefined }));
        const e = res.entry;
        const st = Object.keys(e.status).length;
        console.log(`✓ ${file} (revisão ${res.raw.changelog.length}): +${e.added.length} ~${e.changed.length} −${e.removed.length}${st ? `, ${st} mudança(s) de status` : ''}`);
        console.log(`  commit sugerido: git add ${file} && git commit -m ${JSON.stringify(`docs(arquitetura): ${e.summary}`)}`);
      } else fail(usage);
      break;
    }
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/merge-report.mjs scripts/archlens.mjs tests/cli.test.mjs
git -c safe.directory="$PWD" commit -m "feat(cli): archlens merge --plan/--apply; doc e build regeneram o próprio ARCHITECTURE.md

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Schemas (modelo, visão, delta e plano)

**Files:**
- Modify: `scripts/gen-schemas.mjs`
- Regenerate: `schemas/model.schema.json`, `schemas/view.schema.json`; Create: `schemas/delta.schema.json`, `schemas/plan.schema.json`
- Test: `tests/doc.test.mjs` (teste `published JSON schemas match the registry`)

**Interfaces:**
- Consumes: `STATUSES` (registry), `SOURCE_KINDS` (sources)
- Produces: `buildSchemas(): { model, view, delta, plan }`

- [ ] **Step 1: Update the parity test** — em `tests/doc.test.mjs`, troque
`for (const name of ['model', 'view']) {` por `for (const name of ['model', 'view', 'delta', 'plan']) {`, e acrescente:

```js
test('schemas describe the new fields', async () => {
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  const s = buildSchemas();
  assert.deepEqual(s.model.$defs.element.properties.status.enum, ['planned', 'active', 'deprecated', 'retired']);
  assert.ok(s.model.$defs.source.properties.kind.enum.includes('repo'));
  assert.ok(s.model.properties.changelog);
  assert.ok(s.view.properties.status);
  assert.deepEqual(s.delta.$defs.element.required, ['id']);
  assert.equal(s.plan.properties['archlens-plan'].const, '1.0');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/doc.test.mjs`
Expected: FAIL — `schemas/delta.schema.json` inexistente / `status` indefinido.

- [ ] **Step 3: Implement** — em `scripts/gen-schemas.mjs`

Troque os imports por:

```js
import { writeFileSync } from 'node:fs';
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, C4_KINDS, LAYER_ORDER, STATUSES } from './lib/registry.mjs';
import { ARCHIMATE_VIEWPOINTS } from './lib/query-archimate.mjs';
import { SOURCE_KINDS } from './lib/sources.mjs';
```

Dentro de `buildSchemas`, logo depois de `const str = { type: 'string' };`:

```js
  const status = { enum: STATUSES };
  const sources = { type: 'array', items: { $ref: '#/$defs/source' } };
  const source = {
    type: 'object', required: ['kind'], additionalProperties: false,
    properties: { kind: { enum: SOURCE_KINDS }, ref: str, path: str, excerpt: str, date: str },
  };
  const changelogEntry = {
    type: 'object', required: ['id', 'date'],
    properties: {
      id: str, date: str, source: { $ref: '#/$defs/source' }, summary: str,
      added: { type: 'array', items: str }, changed: { type: 'array', items: str },
      status: { type: 'object', additionalProperties: status }, removed: { type: 'array', items: str },
      decisions: { type: 'array', items: str },
    },
  };
```

No `element.properties`, acrescente `aliases: { type: 'array', items: str }, status, statusReason: str, sources,`.
No `relationship.properties`, acrescente `status, statusReason: str, sources,`.
No `view.properties`, acrescente `status: { description: 'lifecycle statuses shown (default: all but retired)', type: 'array', items: status },`.
No `model.properties`, acrescente `changelog: { type: 'array', items: { $ref: '#/$defs/changelogEntry' } },` e troque
`$defs: { element, relationship },` por `$defs: { element, relationship, source, changelogEntry },`.

Antes do `return`, acrescente:

```js
  const deltaElement = {
    ...element, required: ['id'],
    properties: { ...element.properties, children: { type: 'array', items: { $ref: '#/$defs/element' } } },
  };
  const op = (name, props, required) => ({
    type: 'object', additionalProperties: false, required: ['op', 'id', ...required],
    properties: { op: { const: name }, id: str, ...props },
  });
  const delta = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/delta.schema.json',
    title: 'archlens delta (one enrichment round)',
    type: 'object', required: ['archlens-delta'],
    properties: {
      'archlens-delta': { const: '1.0' }, source: { $ref: '#/$defs/source' }, summary: str, name: str, description: str,
      assumptions: { type: 'array', items: str },
      model: { type: 'object', properties: {
        elements: { type: 'array', items: { $ref: '#/$defs/element' } },
        relationships: { type: 'array', items: { $ref: '#/$defs/relationship' } } } },
      views: { type: 'array', items: { $ref: 'view.schema.json' } },
      ops: { type: 'array', items: { oneOf: [
        op('rename', { name: str }, ['name']),
        op('alias', { add: { type: 'array', items: str } }, ['add']),
        op('status', { status, reason: str }, ['status']),
        op('remove', {}, []),
      ] } },
    },
    $defs: { element: deltaElement, relationship, source },
  };
  const plan = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://archlens.local/plan.schema.json',
    title: 'archlens merge plan',
    type: 'object', required: ['archlens-plan', 'baseHash', 'delta', 'items'],
    properties: {
      'archlens-plan': { const: '1.0' }, base: str, baseHash: str, created: str, delta: { $ref: 'delta.schema.json' },
      items: { type: 'array', items: { type: 'object', required: ['n', 'key', 'class'], properties: {
        n: { type: 'integer' }, key: str,
        class: { enum: ['new', 'unchanged', 'enrich', 'conflict', 'possible-duplicate', 'op'] },
        kind: { enum: ['element', 'relationship', 'view', 'assumption'] },
        field: str, when: str, resolution: { type: ['string', 'null'] } } } },
      summary: { type: 'object', additionalProperties: { type: 'integer' } },
      blocked: { type: 'boolean' }, errors: { type: 'array' },
    },
  };
```

Troque `return { model, view };` por `return { model, view, delta, plan };` e o bloco `if (import.meta.url === …)` por:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const schemas = buildSchemas();
  for (const [name, schema] of Object.entries(schemas)) {
    writeFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), JSON.stringify(schema, null, 2) + '\n');
  }
  console.log(`✓ ${Object.keys(schemas).map(n => `schemas/${n}.schema.json`).join(', ')}`);
}
```

- [ ] **Step 4: Regenerate and test**

Run: `npm run schemas && npm test`
Expected: `✓ schemas/model.schema.json, schemas/view.schema.json, schemas/delta.schema.json, schemas/plan.schema.json` e testes PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/gen-schemas.mjs schemas/ tests/doc.test.mjs
git -c safe.directory="$PWD" commit -m "feat(schemas): status, sources, aliases e changelog; schemas de delta e plano

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Exemplos — `ARCHITECTURE.md` como fonte única, regressão e delta de demonstração

**Files:**
- Delete: `examples/loja-online/model.json`, `examples/telemedicina/model.json`
- Modify: `package.json` (script `examples`)
- Create: `examples/telemedicina/delta-01.json`, `examples/telemedicina/plano-01.json`
- Regenerate: `examples/*/ARCHITECTURE.md`, `examples/*/model.html`, `examples/*/model.shots/`

**Interfaces:**
- Consumes: tudo das Tasks 1–10; linha de base de `/tmp/archlens-baseline/` (Task 1, Step 0)

- [ ] **Step 1: Prove the views did not change (regression)**

```bash
for ex in loja-online telemedicina; do
  node scripts/archlens.mjs resolve examples/$ex/ARCHITECTURE.md > /tmp/archlens-after-$ex.json
  node -e '
    const fs = require("fs");
    const strip = f => JSON.stringify(JSON.parse(fs.readFileSync(f)), (k, v) => (k === "status" ? undefined : v));
    console.log(process.argv[1], strip(process.argv[2]) === strip(process.argv[3]) ? "IGUAL" : "DIFERENTE");
  ' "$ex" /tmp/archlens-baseline/$ex.json /tmp/archlens-after-$ex.json
done
```
Expected: `loja-online IGUAL` e `telemedicina IGUAL`. Se der `DIFERENTE`, pare e investigue (superpowers:systematic-debugging) antes de seguir.

- [ ] **Step 2: Make `ARCHITECTURE.md` the only source** — confirme que o bloco é idêntico ao `model.json` e remova o JSON:

```bash
for ex in loja-online telemedicina; do
  cmp <(node scripts/archlens.mjs extract examples/$ex/ARCHITECTURE.md) <(node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1])), null, 2))' examples/$ex/model.json) && echo "$ex ok"
done
git -c safe.directory="$PWD" rm -q examples/loja-online/model.json examples/telemedicina/model.json
```
Expected: `loja-online ok`, `telemedicina ok`.

Em `package.json`, troque o script `examples` por:

```json
    "examples": "node scripts/archlens.mjs build examples/loja-online/ARCHITECTURE.md --name model && node scripts/archlens.mjs build examples/telemedicina/ARCHITECTURE.md --name model",
```

- [ ] **Step 3: Create the demonstration delta** — `examples/telemedicina/delta-01.json`

```json
{
  "archlens-delta": "1.0",
  "source": { "kind": "prompt", "ref": "rodada 2026-10-01: substituição do PEP", "date": "2026-10-01" },
  "summary": "PEP Tasy será substituído por um PEP em nuvem; API de agendamento confirmada",
  "assumptions": ["O PEP em nuvem entra em produção antes do desligamento do Tasy."],
  "model": {
    "elements": [
      { "id": "pep-nuvem", "type": "c4:softwareSystem", "name": "PEP em nuvem", "description": "Prontuário eletrônico SaaS que substitui o Tasy", "external": true, "status": "planned", "source": "o PEP Tasy será substituído por um PEP em nuvem" },
      { "id": "api-agendamento", "type": "c4:container", "name": "API Agendamento", "parent": "tele", "technology": "Node.js", "description": "Agenda, cobrança e confirmação de consultas" },
      { "id": "tele.app", "inferred": false }
    ],
    "relationships": [
      { "from": "tele.portal-medico", "to": "pep-nuvem", "type": "uses", "description": "Registra prontuário", "technology": "HTTPS/FHIR", "status": "planned" },
      { "from": "pep-nuvem", "to": "as-registro", "type": "archimate:realization", "status": "planned" }
    ]
  },
  "views": [
    { "key": "containers-to-be", "notation": "c4", "level": "container", "scope": "tele", "status": ["planned", "active"], "title": "Containers — to-be (sem o que está em desativação)" }
  ],
  "ops": [
    { "op": "status", "id": "pep", "status": "deprecated", "reason": "substituição pelo PEP em nuvem" }
  ]
}
```

- [ ] **Step 4: Plan, answer and apply it**

```bash
A="node scripts/archlens.mjs"
$A merge examples/telemedicina/ARCHITECTURE.md examples/telemedicina/delta-01.json --plan examples/telemedicina/plano-01.json
```
Expected: relatório com `possível duplicata: "api-agendamento" parece "tele.api"` e conflitos condicionais de `api-agendamento`
(pelo menos `name`). Nenhum `✗ Plano bloqueado`.

Responda (duplicata = same; nome = keep, mantendo "API de Agendamento"; demais conflitos condicionais = take):

```bash
node -e '
  const fs = require("fs"); const f = "examples/telemedicina/plano-01.json";
  const p = JSON.parse(fs.readFileSync(f));
  for (const it of p.items) if ("resolution" in it)
    it.resolution = it.key === "dup:api-agendamento" ? "same" : it.key === "el:api-agendamento:name" ? "keep" : it.class === "conflict" ? "take" : "yes";
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");'
$A merge examples/telemedicina/ARCHITECTURE.md --apply examples/telemedicina/plano-01.json
grep -n "Ciclo de vida" -A6 examples/telemedicina/ARCHITECTURE.md
grep -n "## Histórico" -A5 examples/telemedicina/ARCHITECTURE.md
```
Expected: `✓ examples/telemedicina/ARCHITECTURE.md (revisão 1)`; "Ciclo de vida" lista `PEP (Tasy)` deprecated e `PEP em nuvem` planned;
"Histórico" mostra a rodada. Confirme que `api-agendamento` virou alias de `tele.api` e não um elemento novo:

```bash
node scripts/archlens.mjs extract examples/telemedicina/ARCHITECTURE.md | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const m = JSON.parse(s); const all = []; const walk = l => l.forEach(e => { all.push(e); walk(e.children || []); }); walk(m.model.elements);
    console.log(all.some(e => e.id === "api-agendamento") ? "ERRO: elemento duplicado" : "ok", all.find(e => e.id === "tele.api").aliases);
  });'
```
Expected: `ok [ 'api-agendamento' ]`.

- [ ] **Step 5: Rebuild all examples and inspect**

Run: `npm run examples`
Expected: sem erros; visão nova `containers-to-be` renderizada. Abra `examples/telemedicina/model.shots/containers-to-be@1920x1080.png`
e confira: `PEP (Tasy)` ausente e `PEP em nuvem` com borda tracejada larga (planned). Abra `containers@1920x1080.png` e
confira `PEP (Tasy)` esmaecido (deprecated).

- [ ] **Step 6: Run the suite and commit**

```bash
npm test
git -c safe.directory="$PWD" add -A examples package.json
git -c safe.directory="$PWD" commit -m "feat(examples): ARCHITECTURE.md como fonte única; delta de demonstração (PEP em nuvem, to-be)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Skill e documentação

**Files:**
- Modify: `SKILL.md`, `references/free-text.md`, `references/knowledge-doc.md`, `references/notation.md`, `references/views.md`, `docs/GUIA.md`, `README.md`
- Create: `references/merge.md`

**Interfaces:**
- Consumes: comportamento das Tasks 1–11 (comandos, códigos, formato do delta)

- [ ] **Step 1: Create `references/merge.md`**

````markdown
# Evoluindo a base: delta → plano → apply

A base de conhecimento (`ARCHITECTURE.md`) muda por **merge**. O agente descreve o que há de novo num
**delta**; a CLI compara com a base, classifica cada item e grava um **plano** com as perguntas; o usuário
responde; o `apply` grava a base, regenera o documento e registra a rodada no **Histórico**.
Nada é decidido em silêncio: conflitos, possíveis duplicatas, remoções e `retired` esperam resposta.

```bash
node scripts/archlens.mjs merge ARCHITECTURE.md delta.json --plan plano.json   # relatório + plano
# … responda cada item com "resolution": null …
node scripts/archlens.mjs merge ARCHITECTURE.md --apply plano.json            # grava e registra
```

Se o `ARCHITECTURE.md` não existe, o primeiro delta o cria (`name` e `description` do delta viram os da base).

## O delta

```json
{
  "archlens-delta": "1.0",
  "source": { "kind": "prompt", "ref": "rodada 2026-10-01", "date": "2026-10-01" },
  "summary": "Uma frase: o que esta rodada trouxe",
  "assumptions": ["premissas novas"],
  "model": { "elements": [ ... ], "relationships": [ ... ] },
  "views": [ ... ],
  "ops": [
    { "op": "rename", "id": "loja.pedidos", "name": "Orders API" },
    { "op": "alias",  "id": "loja.pedidos", "add": ["orders-service"] },
    { "op": "status", "id": "erp", "status": "deprecated", "reason": "migração para SAP" },
    { "op": "remove", "id": "loja.temp" }
  ]
}
```

| Campo | Regra |
|---|---|
| `source` | de onde veio a rodada: `kind` = `prompt` \| `repo` \| `doc` \| `manual`, `ref` (rodada, `repo@commit`, documento), `path`, `date`. Herdado por todo item criado ou alterado |
| elementos | mesmo DSL de `notation.md`. Para **enriquecer** um existente, basta `id` + os campos novos. `parent` e `children` funcionam; `parent` aceita id ou alias |
| relações | `from`/`to` aceitam id ou alias. `A uses B` casa com o `B serving A` que já estiver na base |
| `views` | key nova entra; key existente com definição diferente vira conflito (`keep` \| `take`) |
| `ops` | `rename` (o nome antigo vira alias), `alias`, `status` (+ `reason`), `remove` (cascata: filhos, relações, visões) |
| `source` num item | texto livre: `"source": "<trecho literal>"` vira `excerpt` junto da fonte do delta |

## Como a CLI casa os itens

1. **id igual** ao da base;
2. **alias**: id, nome ou alias do delta igual a um alias da base (ou alias do delta igual a um id da base).
   Comparação sem acento, caixa ou pontuação;
3. **possível duplicata** (nunca automática): mesmo tipo ArchiMate e nome parecido (≥ 0,75), ou mesmo pai e mesma
   tecnologia com nome minimamente parecido.

## Classes no plano

| Classe | Significado | Resposta (`resolution`) |
|---|---|---|
| `new` | não casou: entra como novo | — |
| `unchanged` | casou e nada difere (só ganha a fonte) | — |
| `enrich` | preenche campos vazios, tags, aliases, fontes | — |
| `conflict` | um campo preenchido difere | `keep` \| `take` \| `value:<valor>` (visões: `keep` \| `take`) |
| `possible-duplicate` | parece um elemento da base | `same` (vira alias e o item é mesclado) \| `different` (entra como novo) |
| `op` | operação explícita | `remove` e `status: retired`: `yes` \| `no` |

Itens com `"when": "dup:<id>=same"` só valem se a duplicata correspondente for respondida `same`
(são as diferenças de campo que apareceriam nesse caso).

## Perguntando ao usuário

- Mostre o resumo do relatório (contagens e novos).
- Faça **uma pergunta por item** com `resolution: null`, na ordem de `n`, com a sua recomendação e o motivo.
  Ex.: *"A base diz que a API de Pedidos é Java/Spring; o repo mostra Kotlin. Recomendo `take` (o repo é mais recente). Ok?"*
- Pule os itens com `when` se a duplicata foi respondida `different`.
- Grave as respostas no `plano.json` (campo `resolution` de cada item) e rode o `--apply`.

## Erros

| Código | Quando | O que fazer |
|---|---|---|
| `E_DELTA_SCHEMA` | falta `"archlens-delta": "1.0"` ou op sem `op`/`id` | corrija o delta |
| plano `blocked` | o resultado teria erros de validação (`E_UNKNOWN_REF`, `E_UNKNOWN_TYPE`…) | corrija o delta e planeje de novo |
| `E_PLAN_PENDING` | há `resolution: null` | responda os itens listados |
| `E_PLAN_RESOLUTION` | resposta fora das opções | use as opções da tabela |
| `E_PLAN_STALE` | a base mudou depois do plano (inclusive por já ter aplicado este plano) | gere o plano de novo |
| `E_MERGE_INVALID` | o resultado com as respostas reais é inválido | reveja as respostas (ex.: `value:` com id inexistente) |

## Proveniência, ciclo de vida e histórico

- Todo item tocado ganha a fonte do delta em `sources` (sem duplicar). O `.md` mostra a coluna **Fontes**
  (`P` prompt, `R` repo, `D` doc, `M` manual) e a seção **Fontes**.
- `status`: `planned`, `active` (padrão), `deprecated`, `retired`. Visões escondem `retired` por padrão; use
  `status` na view spec para as-is/to-be. O `validate` avisa `W_RETIRED_DEPENDENCY`.
- Cada apply que muda algo acrescenta uma entrada em `changelog` (seção **Histórico** do `.md`). Aplicar o mesmo
  delta de novo não muda nada e não cria entrada.

## Boas práticas

- Um delta por fonte e por rodada: facilita o histórico e a revisão.
- Reutilize ids da base (`archlens views ARCHITECTURE.md` e as tabelas do `.md` mostram os ids).
- Depois do apply, sugira o commit do `ARCHITECTURE.md` ao usuário.
````

- [ ] **Step 2: Rewrite the flow in `SKILL.md`**

No frontmatter, troque a `description` por:

```yaml
description: Use when the user wants architecture diagrams in C4 (landscape, context, container, component, dynamic) or ArchiMate (business, application, technology layers, cross-layer support or impact views), described in free text or JSON; when they want to create or enrich an ARCHITECTURE.md knowledge base incrementally (new prompts, "X was replaced", "add Y", with provenance, lifecycle status and history); or asks to extract new diagrams from an existing ARCHITECTURE.md — e.g. "what supports this product/process", "dependency/impact matrix of this component", "focus on X", as-is/to-be, animated HTML for presentations.
```

Substitua o parágrafo que começa em `Arquitetura como **modelo**` por:

```markdown
Arquitetura como **modelo**, diagramas como **consultas**. O modelo (metamodelo ArchiMate, com perfil C4
por cima) mora no `ARCHITECTURE.md`, a base de conhecimento: o bloco `archlens-json` é a fonte de verdade.
A base **evolui por rodadas**: cada informação nova (prompt, texto, documento, repositório) vira um
**delta**, que passa por `merge --plan` → perguntas ao usuário → `merge --apply`, com proveniência,
ciclo de vida e histórico. Cada diagrama é uma *view spec* resolvida sobre a base e renderizada em HTML
animado, autocontido e pronto para apresentação.
```

Substitua a seção `## Fluxo` inteira (até antes de `## Pedido → view spec`) por:

```markdown
## Fluxo

1. **Localize a base.** Procure o `ARCHITECTURE.md` do projeto (ou pergunte onde fica). Se não existe, o
   primeiro delta a cria.
2. **Só pedido de visão, nada novo a modelar?** Vá ao passo 7.
3. **Traduza a informação nova em delta** (`references/merge.md`):
   - **texto livre**: siga `references/free-text.md` (`source` com o trecho, `inferred` + `confidence`,
     `assumptions`). Pergunte ao usuário **só** o que bloqueia;
   - **JSON DSL**: embrulhe em `{"archlens-delta":"1.0","source":…,"model":…}`;
   - **"X foi desligado / será substituído / renomeie Y"**: `ops` (`status`, `rename`, `alias`, `remove`).

   Sempre preencha `source` (`kind` + `ref`) e `summary`. Reutilize os ids da base.
4. **Planeje**: `archlens merge ARCHITECTURE.md delta.json --plan plano.json`. Mostre o resumo ao usuário.
   Se o plano vier **bloqueado**, corrija o delta e planeje de novo.
5. **Pergunte, uma decisão por vez**: cada item com `resolution: null` (conflito, possível duplicata, remoção,
   `retired`), com a sua recomendação. Itens com `when` só valem se a duplicata for `same`. **Nunca decida
   sozinho.**
6. **Aplique**: grave as respostas no plano e rode `archlens merge ARCHITECTURE.md --apply plano.json`. Ele
   valida, regenera o documento e registra a rodada. Sugira o commit que ele imprime.
7. **Traduza cada pedido de visão em view spec** (tabela abaixo; detalhes em `references/views.md`). Visões que
   o usuário quer manter entram na base por delta (`views`); consultas avulsas usam `--spec`.
   `archlens views ARCHITECTURE.md` lista as definidas e sugere outras.
8. **Gere**: `archlens build ARCHITECTURE.md --out-dir <pasta>` (documento + HTML com todas as visões +
   screenshots 1920×1080 / 1280×720) ou `archlens deliver ARCHITECTURE.md --spec '<json>' --out x.html`.
9. **Leia o relatório de qualidade** e aja (seção *Alertas*). Olhe ao menos um screenshot por visão nova.
10. **Escreva a interpretação** nos blocos `<!-- keep:overview -->` (propósito, decisões, riscos) e
    `<!-- keep:notes -->`. O resto do documento é regenerado.
11. **Entregue**: caminhos do `.md` e do `.html`, visões, premissas abertas, alertas e o commit sugerido.
```

Na tabela `## Pedido → view spec`, acrescente ao final:

```markdown
| como está hoje (as-is) | acrescente `status:["active","deprecated"]` |
| como fica depois das mudanças (to-be) | acrescente `status:["planned","active"]` |
```

Em `## Erros comuns`, acrescente:

```markdown
- **Editar o bloco à mão**: funciona (rode `archlens doc ARCHITECTURE.md` depois), mas perde proveniência e
  histórico. Prefira um delta, mesmo pequeno.
- **Duplicata aceita sem perguntar**: `possible-duplicate` é sempre pergunta ao usuário. Um `same` errado funde
  dois elementos diferentes.
```

Em `## Referências`, acrescente como primeiro item:

```markdown
- `references/merge.md`: delta, plano, classes, respostas, erros do merge, proveniência, ciclo de vida e histórico
```

e troque o item de exemplos por:

```markdown
- `examples/`: `loja-online` (DSL completa, 13 visões) e `telemedicina` (texto livre + `delta-01.json`/`plano-01.json`,
  uma rodada de merge com duplicata, `deprecated`/`planned` e a visão to-be)
```

- [ ] **Step 3: Update `references/free-text.md`**

Troque a primeira frase de "Objetivo" por:

```markdown
Objetivo: um **delta** (`references/merge.md`) **fiel ao que foi dito**, com as lacunas visíveis. Não invente
arquitetura para deixar o diagrama bonito. Se já existe um `ARCHITECTURE.md`, leia-o antes: reutilize os ids
e acrescente só o que é novo ou diferente — o merge cuida do resto.
```

Troque o passo 3 (`**Registre a evidência:**…`) por:

```markdown
3. **Registre a evidência:** `source` com o trecho literal que justificou o item. O merge o guarda como `excerpt`
   junto da fonte do delta (`sources`).
```

E o parágrafo final por:

```markdown
O exemplo completo está em `examples/telemedicina/`: `entrada.md` (texto original), o `ARCHITECTURE.md` gerado,
com a seção de premissas, e `delta-01.json`/`plano-01.json`, uma rodada seguinte de enriquecimento.
```

- [ ] **Step 4: Update `references/knowledge-doc.md`**

Troque a primeira linha por:

```markdown
`archlens merge` (ou `doc`/`build`) gera e mantém um markdown que serve a duas coisas:
```

Na tabela de seções, depois da linha `| Rastreabilidade | … |`, acrescente:

```markdown
| Ciclo de vida | itens `planned`, `deprecated`, `retired`, com o motivo |
```

e depois da linha de `Premissas e inferências`:

```markdown
| Fontes | cada fonte (prompt, repo, doc, manual) e quantos itens ela sustenta |
```

e depois da linha `| Visões | … |`:

```markdown
| Histórico | últimas 10 rodadas de merge (data, fonte, resumo, mudanças, decisões); o completo fica em `changelog` |
```

Troque a primeira regra de `## Regras de edição` por:

```markdown
- Para mudar a arquitetura, use **`archlens merge`** (`references/merge.md`): proveniência e histórico ficam
  registrados. Editar o bloco `archlens-json` à mão e rodar `archlens doc ARCHITECTURE.md` também funciona.
  As tabelas não são lidas de volta.
```

E, em `## Uso como base de conhecimento`, troque o parágrafo final por:

```markdown
Nenhuma remodelagem: a pergunta nova vira uma view spec nova sobre o mesmo estado. Para guardar a visão na
base, mande-a num delta (`views`) e rode o merge. Para acrescentar conhecimento, delta → `merge --plan` → `--apply`.
```

- [ ] **Step 5: Update `references/notation.md` and `references/views.md`**

Em `notation.md`, na tabela de campos de elementos, troque a linha de `source` por:

```markdown
| `aliases` | não | outros nomes/ids do mesmo elemento (o merge casa por eles). Únicos no modelo (`E_ALIAS_CONFLICT`) |
| `status` | não | `planned`, `active` (padrão), `deprecated`, `retired` |
| `statusReason` | não | motivo do status |
| `sources` | não | proveniência: `[{ "kind": "prompt"\|"repo"\|"doc"\|"manual", "ref", "path", "excerpt", "date" }]` |
| `source` | não | forma antiga: trecho do texto livre; lido como `sources: [{kind:"prompt", excerpt}]` |
```

Na tabela de relações, troque a linha `| `tags`, `properties`, `inferred` | como nos elementos |` por
`| `tags`, `properties`, `inferred`, `status`, `statusReason`, `sources` | como nos elementos |`.

Na tabela de validação, acrescente:

```markdown
| `E_STATUS` | erro | `status` fora de planned/active/deprecated/retired |
| `E_SOURCE` | erro | fonte sem `kind` válido ou sem `ref`/`excerpt` |
| `E_ALIAS_CONFLICT` | erro | alias repetido em dois elementos ou igual ao id de outro |
| `W_RETIRED_DEPENDENCY` | aviso | algo não-retired depende de um elemento retired |
```

Em `views.md`, na tabela de campos comuns, acrescente depois de `exclude`:

```markdown
| `status` | status mostrados (padrão: todos menos `retired`). Esconder um elemento esconde o que está aninhado nele. As-is: `["active","deprecated"]`; to-be: `["planned","active"]` |
```

- [ ] **Step 6: Update `docs/GUIA.md` and `README.md`**

Em `docs/GUIA.md`:
- no índice, depois de `- [Usando com o Claude](#usando-com-o-claude)`, acrescente `- [Evoluindo a base](#evoluindo-a-base)`;
- troque `examples/loja-online/model.json` por `examples/loja-online/ARCHITECTURE.md` nos exemplos de linha de comando,
  e a linha `$A resolve  model.json --view containers --json` por `$A resolve  ARCHITECTURE.md --view containers --json`;
- troque `1. monta o \`model.json\` (marcando o que inferiu e anotando premissas);` por
  `1. monta um delta (marcando o que inferiu e anotando premissas) e roda o merge, perguntando o que for conflito;`;
- antes de `## Usando pela linha de comando`, acrescente:

```markdown
## Evoluindo a base

A base cresce por rodadas. A cada informação nova, diga ao Claude o que mudou:

> O PEP Tasy vai ser substituído por um PEP em nuvem até março. Atualize a base.

> A API de Pedidos agora é Kotlin, e existe um worker novo que consome o tópico de pedidos.

O Claude escreve um **delta**, roda `archlens merge … --plan`, mostra o que é novo e pergunta, **um item por vez**,
só o que exige decisão: conflitos ("a base diz Java, você disse Kotlin"), possíveis duplicatas ("'API Agendamento' é
a mesma 'API de Agendamento'?"), remoções e desativações. Depois aplica, e o `ARCHITECTURE.md` ganha:

- a coluna **Fontes** e a seção **Fontes** (de onde veio cada fato);
- a seção **Ciclo de vida** (`planned`, `deprecated`, `retired`) e visões as-is/to-be;
- a seção **Histórico** com a rodada, e um commit sugerido.

Pela linha de comando:

```bash
$A merge ARCHITECTURE.md delta.json --plan plano.json   # relatório + plano com as perguntas
# edite "resolution" nos itens pendentes: keep | take | value:<x> | same | different | yes | no
$A merge ARCHITECTURE.md --apply plano.json            # grava, regenera e registra
```

Veja `examples/telemedicina/delta-01.json` e `plano-01.json`, e o formato completo em `references/merge.md`.
```

Em `README.md`, troque a linha de build por `node scripts/archlens.mjs build examples/loja-online/ARCHITECTURE.md --out-dir /tmp/loja`
e acrescente à lista de funcionalidades, depois do item do `ARCHITECTURE.md`:

```markdown
- **Base que evolui:** cada informação nova vira um delta; `archlens merge` casa entidades (id, alias, nome parecido),
  pergunta conflitos e duplicatas, e registra proveniência, ciclo de vida (as-is/to-be) e histórico.
```

- [ ] **Step 7: Check references and commit**

```bash
grep -rn "model\.json" SKILL.md README.md docs/GUIA.md references/ | grep -v "formato de entrada"
npm test
```
Expected: nenhuma instrução restante mandando editar/buildar a partir de `model.json` como fonte (menções a JSON DSL como
entrada são ok); testes PASS.

```bash
git -c safe.directory="$PWD" add SKILL.md README.md docs/GUIA.md references/
git -c safe.directory="$PWD" commit -m "docs: fluxo delta → plano → apply na skill, referência do merge e guia

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test` — tudo verde.
- [ ] `npm run examples` — sem erros; screenshots da visão `containers-to-be` e de `containers` inspecionados (Task 11, Step 5).
- [ ] Critérios de sucesso do spec:
  1. idempotência — testes `applying the same delta twice…` (Task 4) e `merge creates a missing base…` (Task 9);
  2. nada decidido em silêncio — `E_PLAN_PENDING` nos testes das Tasks 4, 7 e 9;
  3. fontes e histórico no `.md` — Task 8 e `examples/telemedicina/ARCHITECTURE.md`;
  4. exemplos válidos e visões iguais — Task 11, Step 1.
