# Formato canônico unificado (2.0) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a base passa a ser gravada num formato único (2.0: tipos ArchiMate, perfil C4 em `c4.kind`, lista plana com
`parent`, relações só ArchiMate, propriedades com catálogo), o vocabulário livre (`c4:*`, `uses`, `children`) é
traduzido num único ponto de entrada, `archlens migrate` converte bases 1.x, o C4 passa a ser gerado também de
modelos ArchiMate "puros" (derivação através de serviços e interfaces) e as visões ArchiMate ganham o aninhamento
visual (`nesting`).

**Architecture:** um módulo novo `scripts/lib/canonical.mjs` é o único leitor do vocabulário livre
(`canonicalType`, `canonicalElements`, `canonicalRelationship`, `toCanonical`, `sortParentsFirst`); o leitor 1.x de
hoje é congelado em `scripts/lib/canonical-legacy.mjs` só para o `migrate`. `normalizeModel` passa a ler só 2.0. O
merge traduz o delta antes de casar entidades e grava 2.0. O store recusa base 1.x (`E_STORE_FORMAT`), e
`scripts/lib/migrate.mjs` faz a conversão com checagem de equivalência. O C4 troca intermediários (serviços,
interfaces, funções, processos de aplicação) pelos seus donos antes de subir as pontas. O aninhamento é calculado na
consulta ArchiMate (`nestedIn`) e desenhado com nós compostos do ELK.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test` + `node:assert/strict`, ELK (já vendorizado). Nenhuma
dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-17-canonical-format-design.md`

## Global Constraints

- Node ≥ 18; sem dependências de runtime novas.
- Mensagens ao usuário em português; comentários de código em inglês; densidade de comentários como no código ao redor.
- Formato da base: `"archlens": "2.0"`. Base com outro valor (ou sem) é 1.x: `E_STORE_FORMAT` com a instrução
  `archlens migrate <base>`; nada é gravado.
- Elemento 2.0: `type` ∈ `ELEMENT_TYPES` (sem prefixo); `parent` (sem `children`); `c4: { kind }` opcional, com os
  kinds válidos por tipo de `C4_KIND_TYPES`; `external`, `technology` no primeiro nível; sem o campo `archimate`.
- Relação 2.0: `type` ∈ `RELATIONSHIP_TYPES` (sem `uses`); `accessType` só em `access`; sem `rel.c4`.
- `properties`: valores texto, número, booleano ou lista de textos (`E_SCHEMA` fora disso). Catálogo opcional em
  `properties` do manifesto: `{ <chave>: { label?, type? (string | number | boolean | string[]), values?, appliesTo? } }`;
  avisos `W_PROPERTY`.
- Só `scripts/lib/canonical.mjs` e `scripts/lib/canonical-legacy.mjs` conhecem `c4:*`, `archimate:` (em tipos de
  elemento ou relação do modelo), `uses` como tipo de relação do modelo, `children` e o override `archimate`.
  (Os filtros de visão `types`/`collapse` continuam tolerando o prefixo `archimate:`; são view spec, não modelo.)
- Elementos gravados em ordem de pai antes de filho (`sortParentsFirst`).
- Códigos novos: `E_STORE_FORMAT`, `E_C4_TYPE`, `W_PROPERTY`, `E_MIGRATE_EQUIV`, `E_PARENT_CYCLE` (no modelo),
  `E_VIEW_NESTING`.
- View spec: `"nesting": "edges"` (padrão) | `"nested"` | `{ "mode": "edges" | "nested", "depth": <inteiro ≥ 1> }`;
  `"derive": false` desliga a derivação (C4 e ArchiMate).
- Branch `feat/canonical-format`. Commits terminam com:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM`
- Depois de mudar código: `graphify update .` (CLAUDE.md do usuário).

## Decisões de detalhe (não estavam no spec; revisar)

1. **`plan.delta` guarda o delta como veio** (vocabulário livre), não traduzido. O `apply` repete a tradução sobre a
   mesma base (o hash garante que é a mesma), e o `--answers` continua comparando o delta original. Tudo o que o plano
   simula e o que o `apply` grava é 2.0.
2. **Kind C4 inferido só para elementos novos.** Na entrada do merge, a inferência pela profundidade só vale para
   elementos que a base ainda não tem; e um kind inferido nunca vira conflito com o kind gravado de um elemento casado
   (por alias ou nome). Assim, enriquecer `{ "id": "loja.api", "technology": "Kotlin" }` não pergunta nada sobre C4.
3. **Fixtures de teste continuam no vocabulário livre** (`tests/fixtures/shop.json`, `platforms.json`): são entrada.
   Os testes que precisam de uma base passam por `asBase()` (`tests/helpers.mjs`). O `shop.json` é também a base 1.x
   dos testes do `migrate`. (O spec dizia "fixtures migradas"; assim os testes de entrada e de migração usam o mesmo
   arquivo.)
4. **Exemplos convertidos na Task 2** com o mesmo `toCanonical` que o `migrate` usa (script de uma linha), para a
   suíte ficar verde desde a troca do núcleo; o `migrate` (Task 4) é testado sobre o `shop.json`. Os exemplos não
   ganham a rodada "migração para o formato 2.0" no changelog.
5. **Ciclo de `parent`** passa a ser possível (lista plana): `E_PARENT_CYCLE` no `normalizeModel`, e o pai é
   ignorado.
6. **`access` explícito de 1.x para um banco** (ex.: `archimate:access` para um `c4:container` com tag `database`)
   vira `serving` do banco; `uses` com `accessType` que vira `serving` guarda o `accessType` (≠ `readwrite`) em
   `properties.accessType`. Os dois casos são feitos por `canonicalRelationship`/`toCanonical`.
7. **Coordenadas do ELK:** os estilos `flow` e `bands-flow` já usam `elk.json.edgeCoords: ROOT` e
   `elk.json.shapeCoords: ROOT`, então os pontos das arestas e as posições dos filhos já saem absolutos (o spec citava
   `edge.container`, necessário só no protótipo, que não usava essas opções).
8. **Roteador do `bands-flow`:** só as folhas são obstáculos; a caixa de um pai é atravessável, senão uma aresta que
   sai de um filho nunca deixaria o pai.
9. **Teste de prévia "a relationship whose canonical id flips"** sai: em 2.0 o id de uma relação não depende mais do
   tipo do alvo (não existe `uses` gravado), e mudar o tipo do alvo de uma `serving` para passivo é `E_REL_INVALID`.
10. **O relatório do `merge --plan` não mostra as contagens da tradução** (tipos reescritos, `uses` convertidos): elas
   aparecem só no `migrate`. No plano, cada item novo já mostra o tipo 2.0.

## Review Focus

1. **Delta que só enriquece um elemento aninhado** (`{ "id": "loja.api", "technology": "Kotlin" }`, sem `type`,
   `parent` nem `c4`) → um conflito de `technology`, nenhuma pergunta sobre `c4` e o elemento não muda de pai. Teste na Task 2.
2. **Delta com `application-component` sem `c4` casado por alias** com um container da base → nenhum conflito de
   `c4` (o kind inferido não briga com o gravado). Teste na Task 2.
3. **`scan` sem `--base` que encontra uma base 1.x** → falha com `E_STORE_FORMAT` e orienta o `migrate`, em vez de
   tratar como base nova. Teste na Task 3.
4. **`migrate` de pasta com `layout.model: "model/"`** → cada elemento fica no arquivo de onde veio; um filho que
   estava aninhado vai para o arquivo do pai. Teste na Task 4.
5. **Visão aninhada no `bands-flow` com aresta de um filho para outra faixa** → a aresta sai do filho e chega ao
   destino (pontas nas bordas das caixas certas), sem ser bloqueada pela caixa do pai. Teste na Task 7.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/canonical.mjs` (novo) | tradução do vocabulário livre para 2.0; `FORMAT`, `isCanonicalFormat`, `sortParentsFirst` |
| `scripts/lib/canonical-legacy.mjs` (novo) | leitor 1.x congelado (`normalizeLegacy`, `legacyKindOf`), só para o `migrate` |
| `scripts/lib/migrate.mjs` (novo) | `migrateRaw(raw, { today })`: 1.x → 2.0 com equivalência, ids de relação nas visões, rodada no changelog |
| `scripts/lib/registry.mjs` | catálogo ArchiMate; `C4_KIND_TYPES`; sai `resolveType`/`resolveRelType`/`C4_TO_ARCHIMATE`/`DATA_TAGS` |
| `scripts/lib/model.mjs` | `normalizeModel` só 2.0; `c4KindOf` = `el.c4?.kind`; `c4Orientation` sem `rel.c4` |
| `scripts/lib/validate.mjs` | `W_PROPERTY` (catálogo) |
| `scripts/lib/merge.mjs`, `raw-tree.mjs`, `preview.mjs` | merge sobre 2.0 (tradução na entrada, `attach` plano, ordem pai → filho) |
| `scripts/lib/doc.mjs` | banco pela tag; relação C4 "usa" a partir de `serving` entre elementos C4 |
| `scripts/lib/store/folder.mjs`, `store/index.mjs`, `store/legacy.mjs` | `E_STORE_FORMAT` ao carregar (exceto `anyFormat`) |
| `scripts/archlens.mjs` | `migrate` de pasta 1.x no lugar; `scan` falha em base 1.x |
| `scripts/lib/scan/to-delta.mjs` | motores de banco por `serving`; sem a exceção de `tf-ref` para banco |
| `scripts/lib/query-c4.mjs` | derivação através de intermediários; cilindro só pela tag |
| `scripts/lib/query-archimate.mjs` | `nesting`: `nestedIn`, arestas substituídas, `nestTip` |
| `scripts/lib/layout.mjs` | nós compostos (flow, bands-flow), recuo do `bands`, `layoutQuality` com pais |
| `scripts/lib/render.mjs` | caixa de pai, ordem pai → filho, `nestedIn` nos dados |
| `scripts/gen-schemas.mjs`, `schemas/*.json` | modelo 2.0 estrito, catálogo, delta livre, `nesting`/`derive` na visão |
| `tests/helpers.mjs` (novo) | `asBase(raw)` |
| `tests/canonical.test.mjs` (novo), `tests/migrate.test.mjs` (novo) | testes novos |
| `examples/*/architecture/`, `SKILL.md`, `references/*.md`, `docs/GUIA.md`, `README.md`, `CHANGELOG.md`, roadmap | exemplos 2.0 e documentação |

---

### Task 1: tradutor do vocabulário livre e leitor 1.x congelado

**Files:**
- Create: `scripts/lib/canonical.mjs`
- Create: `scripts/lib/canonical-legacy.mjs` (cópia de `scripts/lib/model.mjs` + trechos de `registry.mjs`)
- Create: `tests/helpers.mjs`
- Test: `tests/canonical.test.mjs`

**Interfaces:**
- Consumes: `ELEMENT_TYPES`, `RELATIONSHIP_TYPES` (`registry.mjs`); `orderDelta(list)` (`raw-tree.mjs`, devolve
  `[{ el, parent }]` sem `children`, pais antes dos filhos).
- Produces:
  - `FORMAT = '2.0'`; `isCanonicalFormat(v) → boolean` (`/^2\.\d+$/`).
  - `DATA_TAGS` (lista).
  - `canonicalType(raw, { archimate }?) → { type, c4Kind } | { error: 'E_UNKNOWN_TYPE' }`.
  - `inferKind(type, parent: { type, kind } | null) → kind | null`.
  - `canonicalElements(list, { lookup }?) → { elements, issues, report: { types, kinds, databases }, inferred: Set<id>, databases: Set<id> }`;
    `lookup(id) → { type, kind } | null` dá elementos fora da lista (a base).
  - `canonicalRelationship(r, typeOf) → objeto 2.0 | null` (null = tipo desconhecido).
  - `sortParentsFirst(elements) → elements`.
  - `toCanonical(raw) → { raw, report: { types, kinds, databases, uses }, issues, databases: Set<id> }`.
  - `normalizeLegacy(raw)` e `legacyKindOf(model, el)` (`canonical-legacy.mjs`): idênticos ao `normalizeModel` e ao
    `c4KindOf` de hoje.
  - `asBase(raw) → raw 2.0` (`tests/helpers.mjs`).

- [ ] **Step 1: Write the failing tests** — `tests/canonical.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonicalType, canonicalElements, canonicalRelationship, sortParentsFirst, toCanonical, FORMAT, isCanonicalFormat,
} from '../scripts/lib/canonical.mjs';
import { normalizeLegacy, legacyKindOf } from '../scripts/lib/canonical-legacy.mjs';
import { asBase } from './helpers.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));

test('canonicalType maps the free vocabulary onto ArchiMate types and C4 kinds', () => {
  assert.deepEqual(canonicalType('c4:person'), { type: 'business-actor', c4Kind: 'person' });
  for (const k of ['softwareSystem', 'container', 'component']) {
    assert.deepEqual(canonicalType(`c4:${k}`), { type: 'application-component', c4Kind: k });
  }
  assert.deepEqual(canonicalType('c4:deploymentNode'), { type: 'node', c4Kind: 'deploymentNode' });
  assert.deepEqual(canonicalType('c4:infrastructureNode'), { type: 'node', c4Kind: 'infrastructureNode' });
  assert.deepEqual(canonicalType('archimate:node'), { type: 'node', c4Kind: null });
  assert.deepEqual(canonicalType('data-object'), { type: 'data-object', c4Kind: null });
  assert.deepEqual(canonicalType('c4:container', { archimate: 'archimate:system-software' }), { type: 'system-software', c4Kind: 'container' });
  assert.equal(canonicalType('c4:banana').error, 'E_UNKNOWN_TYPE');
  assert.equal(canonicalType('c4:container', { archimate: 'banana' }).error, 'E_UNKNOWN_TYPE');
});

test('a database container stays an application-component with its tag', () => {
  const lookup = id => (id === 'sys' ? { type: 'application-component', kind: 'softwareSystem' } : null);
  const { elements, databases } = canonicalElements([{ id: 'db', type: 'c4:container', name: 'DB', tags: ['database'], parent: 'sys' }], { lookup });
  assert.deepEqual(elements, [{ id: 'db', type: 'application-component', name: 'DB', tags: ['database'], parent: 'sys', c4: { kind: 'container' } }]);
  assert.deepEqual([...databases], ['db']);
});

test('children become a flat list with "parent", parents first, and kinds are inferred by depth', () => {
  const { elements, inferred } = canonicalElements([
    { id: 'c', type: 'application-component', name: 'C', parent: 'b' },
    { id: 'a', type: 'application-component', name: 'A', children: [{ id: 'b', type: 'application-component', name: 'B' }] },
    { id: 'p', type: 'business-role', name: 'P' },
  ]);
  assert.deepEqual(elements.map(e => [e.id, e.parent ?? null, e.c4?.kind ?? null]),
    [['a', null, 'softwareSystem'], ['b', 'a', 'container'], ['c', 'b', 'component'], ['p', null, 'person']]);
  assert.deepEqual([...inferred].sort(), ['a', 'b', 'c', 'p']);
  assert.ok(elements.every(e => !('children' in e)));
});

test('kinds are not inferred for elements the base already has, and a grouping parent counts as no parent', () => {
  const lookup = id => ({ 'loja.api': { type: 'application-component', kind: 'container' }, plat: { type: 'grouping', kind: null } })[id] ?? null;
  const { elements, inferred } = canonicalElements([
    { id: 'loja.api', type: 'application-component', technology: 'Kotlin' },
    { id: 'motor', type: 'application-component', name: 'Motor', parent: 'plat' },
  ], { lookup });
  assert.equal(elements[0].c4, undefined);
  assert.equal(elements[1].c4.kind, 'softwareSystem');
  assert.deepEqual([...inferred], ['motor']);
});

test('canonicalRelationship reads uses as reversed serving, or access to a passive target', () => {
  const types = { web: 'application-component', api: 'application-component', dados: 'data-object' };
  const typeOf = id => types[id];
  assert.deepEqual(canonicalRelationship({ from: 'web', to: 'api', type: 'uses', description: 'chama' }, typeOf),
    { from: 'api', to: 'web', type: 'serving', description: 'chama' });
  assert.deepEqual(canonicalRelationship({ from: 'api', to: 'dados' }, typeOf), { from: 'api', to: 'dados', type: 'access', accessType: 'readwrite' });
  assert.deepEqual(canonicalRelationship({ from: 'api', to: 'web', type: 'c4:uses', accessType: 'read' }, typeOf),
    { from: 'web', to: 'api', type: 'serving', properties: { accessType: 'read' } });
  assert.deepEqual(canonicalRelationship({ from: 'a', to: 'b', type: 'archimate:flow' }, typeOf), { from: 'a', to: 'b', type: 'flow' });
  assert.equal(canonicalRelationship({ from: 'a', to: 'b', type: 'banana' }, typeOf), null);
});

test('toCanonical turns a 1.x base into 2.0: flat, ArchiMate types, c4 kinds, no uses; it is idempotent', () => {
  const { raw, report, databases } = toCanonical(shop());
  assert.equal(raw.archlens, FORMAT);
  assert.ok(isCanonicalFormat(raw.archlens) && !isCanonicalFormat('1.0') && !isCanonicalFormat(undefined));
  const el = id => raw.model.elements.find(e => e.id === id);
  assert.deepEqual(el('loja.api.checkout'), { id: 'loja.api.checkout', type: 'application-component', name: 'Checkout', parent: 'loja.api', c4: { kind: 'component' } });
  assert.equal(el('loja.db').type, 'application-component');
  assert.deepEqual([...databases], ['loja.db']);
  assert.equal(el('pagamentos').external, true);
  assert.ok(raw.model.relationships.every(r => r.type !== 'uses' && !String(r.type).includes(':')));
  assert.deepEqual(raw.model.relationships.find(r => r.from === 'loja.db'),
    { from: 'loja.db', to: 'loja.api.checkout', type: 'serving', description: 'Grava pedido', technology: 'JDBC' });
  assert.deepEqual(report, { types: 14, kinds: 0, databases: 1, uses: 5 });
  assert.deepEqual(toCanonical(raw).raw, raw);
  assert.deepEqual(asBase(shop()), raw);
});

test('an explicit access to a 1.x database becomes serving from it, keeping read/write in properties', () => {
  const r = shop();
  r.model.relationships.push({ from: 'loja.web', to: 'loja.db', type: 'archimate:access', accessType: 'read' });
  assert.deepEqual(toCanonical(r).raw.model.relationships.at(-1), { from: 'loja.db', to: 'loja.web', type: 'serving', properties: { accessType: 'read' } });
});

test('sortParentsFirst moves parents ahead of their children and keeps the rest in order', () => {
  const list = [{ id: 'c', parent: 'b' }, { id: 'x' }, { id: 'b', parent: 'a' }, { id: 'a' }];
  assert.deepEqual(sortParentsFirst(list).map(e => e.id), ['a', 'b', 'c', 'x']);
});

test('the frozen 1.x reader still reads a 1.x base as archlens 0.3 did', () => {
  const m = normalizeLegacy(shop());
  assert.equal(m.elements.get('loja.db').type, 'data-object');
  assert.equal(legacyKindOf(m, m.elements.get('loja.api.checkout')), 'component');
  assert.equal(m.relationships.find(r => r.to === 'loja.db').type, 'access');
  assert.deepEqual(m.issues.filter(i => i.level === 'error'), []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/canonical.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/canonical.mjs'`.

- [ ] **Step 3: Create `scripts/lib/canonical.mjs`**

```js
// The only reader of the free vocabulary: c4:* types, archimate:* prefixes, "uses", nested "children" and the
// "archimate" override. Prompts, deltas and 1.x bases go through here; everything else reads the 2.0 format
// (ArchiMate types, c4.kind, flat "parent", ArchiMate relationships). Pure.
import { ELEMENT_TYPES, RELATIONSHIP_TYPES } from './registry.mjs';
import { orderDelta } from './raw-tree.mjs';

export const FORMAT = '2.0';
export const isCanonicalFormat = v => typeof v === 'string' && /^2\.\d+$/.test(v);

const C4_TO_ARCHIMATE = {
  person: 'business-actor', softwareSystem: 'application-component', container: 'application-component',
  component: 'application-component', deploymentNode: 'node', infrastructureNode: 'node',
};
// Tags that made a 1.x c4:container a data-object; in 2.0 such a container is an application-component.
export const DATA_TAGS = ['database', 'datastore', 'data-store', 'bucket', 'storage'];
const NEXT_KIND = { softwareSystem: 'container', container: 'component' };
const isPassiveType = t => ELEMENT_TYPES[t]?.aspect === 'passive';

/** Free element type ("c4:container", "archimate:node", "node") → ArchiMate type + C4 kind. */
export function canonicalType(raw, { archimate } = {}) {
  if (typeof raw !== 'string') return { error: 'E_UNKNOWN_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : ['archimate', raw];
  if (ns === 'c4') {
    if (!C4_TO_ARCHIMATE[name]) return { error: 'E_UNKNOWN_TYPE' };
    if (archimate == null) return { type: C4_TO_ARCHIMATE[name], c4Kind: name };
    const override = String(archimate).replace(/^archimate:/, '');
    return ELEMENT_TYPES[override] ? { type: override, c4Kind: name } : { error: 'E_UNKNOWN_TYPE' };
  }
  return ns === 'archimate' && ELEMENT_TYPES[name] ? { type: name, c4Kind: null } : { error: 'E_UNKNOWN_TYPE' };
}

/** C4 kind of an element written without one, from its type and parent (as 1.x read it); parent null = top level. */
export function inferKind(type, parent) {
  if (type === 'application-component') return parent ? NEXT_KIND[parent.kind] ?? null : 'softwareSystem';
  if (type === 'business-actor' || type === 'business-role') return parent ? null : 'person';
  return null;
}

/**
 * Free-vocabulary elements (nested "children" or "parent") → flat 2.0 elements, parents first. `lookup(id)` gives
 * { type, kind } of elements outside the list (the base); kinds are inferred only for elements it does not know.
 * Unknown types are kept as written, so validation reports them.
 */
export function canonicalElements(list = [], { lookup = () => null } = {}) {
  const elements = [];
  const issues = [];
  const inferred = new Set();
  const databases = new Set();
  const report = { types: 0, kinds: 0, databases: 0 };
  const seen = new Map();
  const info = id => seen.get(id) ?? lookup(id);
  for (const { el, parent } of orderDelta(list)) {
    const { archimate, ...node } = el;
    if (parent != null) node.parent = parent; else delete node.parent;
    let kind = el.c4?.kind ?? null;
    if (el.type !== undefined) {
      const r = canonicalType(el.type, { archimate });
      if (r.error) issues.push({ code: 'E_UNKNOWN_TYPE', id: el.id, type: el.type });
      else {
        if (r.type !== el.type || archimate !== undefined) report.types++;
        if (r.c4Kind === 'container' && archimate === undefined && (el.tags || []).some(t => DATA_TAGS.includes(String(t).toLowerCase()))) {
          databases.add(el.id);
          report.databases++;
        }
        node.type = r.type;
        kind = r.c4Kind ?? kind;
      }
    }
    if (!kind && ELEMENT_TYPES[node.type] && !lookup(el.id)) {
      const p = parent != null ? info(parent) : null;
      kind = inferKind(node.type, p && p.type !== 'grouping' ? p : null);
      if (kind) { inferred.add(el.id); report.kinds++; }
    }
    if (kind) node.c4 = { kind }; else delete node.c4;
    seen.set(el.id, { type: node.type ?? lookup(el.id)?.type, kind: kind ?? lookup(el.id)?.kind ?? null });
    elements.push(node);
  }
  return { elements, issues, report, inferred, databases };
}

/**
 * A free relationship in 2.0 form, or null when its type is unknown. "uses" is reversed serving, or access when the
 * target is passive; an accessType that serving cannot carry is kept in properties.accessType.
 */
export function canonicalRelationship(r, typeOf = () => null) {
  const s = String(r.type ?? 'uses');
  const [ns, name] = s.includes(':') ? s.split(':', 2) : [null, s];
  const { accessType, ...rest } = r;
  if ((ns === 'c4' || ns === null) && name === 'uses') {
    if (isPassiveType(typeOf(r.to))) return { ...rest, type: 'access', accessType: accessType ?? 'readwrite' };
    return toServing({ ...rest, type: 'serving', accessType }, true);
  }
  if ((ns === 'archimate' || ns === null) && RELATIONSHIP_TYPES[name]) {
    return { ...rest, type: name, ...(name === 'access' && accessType ? { accessType } : {}) };
  }
  return null;
}

/** serving with the ends of `r` (swapped when `swap`), keeping a read/write-only access in properties. */
function toServing({ accessType, ...r }, swap) {
  const out = { ...r, type: 'serving', ...(swap ? { from: r.to, to: r.from } : {}) };
  if (accessType && accessType !== 'readwrite') out.properties = { ...r.properties, accessType };
  return out;
}

/** Elements reordered so every parent comes before its children; the rest keeps its order. */
export function sortParentsFirst(elements) {
  const byId = new Map(elements.filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  const out = [];
  const done = new Set();
  const visiting = new Set();
  const visit = e => {
    if (done.has(e) || visiting.has(e)) return;
    visiting.add(e);
    const p = e.parent != null ? byId.get(e.parent) : null;
    if (p) visit(p);
    visiting.delete(e);
    done.add(e);
    out.push(e);
  };
  for (const e of elements) if (e && typeof e === 'object') visit(e); else out.push(e);
  return out;
}

/** A whole base (1.x or free vocabulary) in 2.0. An access to a 1.x database becomes serving from it. */
export function toCanonical(raw) {
  const els = canonicalElements(raw?.model?.elements ?? []);
  const types = new Map(els.elements.map(e => [e.id, e.type]));
  const report = { ...els.report, uses: 0 };
  const relationships = (raw?.model?.relationships ?? []).map(r => {
    if (!r || typeof r !== 'object') return r;
    const c = canonicalRelationship(r, id => types.get(id));
    if (!c) return r;
    if (/^(c4:)?uses$/.test(String(r.type ?? 'uses'))) report.uses++;
    return c.type === 'access' && els.databases.has(c.to) ? toServing(c, true) : c;
  });
  const { model, archlens, ...top } = raw ?? {};
  return {
    raw: { archlens: FORMAT, ...top, model: { ...model, elements: sortParentsFirst(els.elements), relationships } },
    report, issues: els.issues, databases: els.databases,
  };
}
```

- [ ] **Step 4: Create `scripts/lib/canonical-legacy.mjs` from today's `model.mjs`**

Run: `cp scripts/lib/model.mjs scripts/lib/canonical-legacy.mjs`

Then edit the copy:

1. Replace the first 6 lines (header comment and imports) with:

```js
// Frozen 1.x reader (normalizeModel of archlens 0.3), kept only so "migrate" can validate a 1.x base and check
// that the 2.0 translation means the same thing. Never use it for anything else.
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, checkRelationship, isPassive, STATUSES } from './registry.mjs';
import { readSources, sourceProblem } from './sources.mjs';
import { aliasKey } from './match.mjs';
```

2. Rename `export function normalizeModel(raw)` → `export function normalizeLegacy(raw)`;
   `export function canonicalRel(r, typeOf)` → `function legacyRel(r, typeOf)` and its one call
   `const c = canonicalRel(r, id => elements.get(id)?.type);` → `const c = legacyRel(r, id => elements.get(id)?.type);`;
   `export function c4KindOf(model, el)` → `export function legacyKindOf(model, el)`.
3. Delete `childrenOf`, `ancestors` and `c4Orientation` (and their doc comments).
4. Append the 1.x type resolution (copied from today's `registry.mjs`):

```js
const C4_TO_ARCHIMATE = {
  person: 'business-actor', softwareSystem: 'application-component', container: 'application-component',
  component: 'application-component', deploymentNode: 'node', infrastructureNode: 'node',
};
const DATA_TAGS = ['database', 'datastore', 'data-store', 'bucket', 'storage'];

function resolveType(raw, hints = {}) {
  if (typeof raw !== 'string') return { error: 'E_UNKNOWN_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : ['archimate', raw];
  if (ns === 'c4') {
    if (!C4_TO_ARCHIMATE[name]) return { error: 'E_UNKNOWN_TYPE' };
    let type = C4_TO_ARCHIMATE[name];
    if (name === 'container' && (hints.tags || []).some(t => DATA_TAGS.includes(String(t).toLowerCase()))) type = 'data-object';
    if (hints.archimate) {
      const override = hints.archimate.replace(/^archimate:/, '');
      if (!ELEMENT_TYPES[override]) return { error: 'E_UNKNOWN_TYPE' };
      type = override;
    }
    return { type, c4Kind: name };
  }
  if (ns === 'archimate' && ELEMENT_TYPES[name]) return { type: name, c4Kind: null };
  return { error: 'E_UNKNOWN_TYPE' };
}

function resolveRelType(raw) {
  if (typeof raw !== 'string') return { error: 'E_REL_TYPE' };
  const [ns, name] = raw.includes(':') ? raw.split(':', 2) : [null, raw];
  if ((ns === 'c4' || ns === null) && name === 'uses') return { type: 'uses' };
  if ((ns === 'archimate' || ns === null) && RELATIONSHIP_TYPES[name]) return { type: name };
  return { error: 'E_REL_TYPE' };
}
```

- [ ] **Step 5: Create `tests/helpers.mjs`**

```js
import { toCanonical } from '../scripts/lib/canonical.mjs';

/** A free-vocabulary fixture (c4:*, uses, children) as a 2.0 base, the way migrate writes it. */
export const asBase = raw => toCanonical(raw).raw;
```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/canonical.test.mjs && npm test`
Expected: PASS (nada foi ligado ainda; a suíte inteira continua verde).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/canonical.mjs scripts/lib/canonical-legacy.mjs tests/helpers.mjs tests/canonical.test.mjs
git commit -m "feat(canonical): tradutor do vocabulário livre para o formato 2.0 e leitor 1.x congelado

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
```

---

### Task 2: núcleo em 2.0 (modelo, validação, merge, prévia, documento, exemplos)

**Files:**
- Modify: `scripts/lib/registry.mjs`, `scripts/lib/model.mjs`, `scripts/lib/validate.mjs`, `scripts/lib/merge.mjs`,
  `scripts/lib/raw-tree.mjs`, `scripts/lib/preview.mjs`, `scripts/lib/doc.mjs`, `scripts/lib/query-c4.mjs:191`
- Modify: `examples/{loja-online,telemedicina,repos}/architecture/*`, `examples/*/ARCHITECTURE.md`
- Test: `tests/model.test.mjs`, `tests/merge.test.mjs` e adaptação dos demais testes

**Interfaces:**
- Consumes (Task 1): `FORMAT`, `isCanonicalFormat`, `canonicalElements`, `canonicalRelationship`, `sortParentsFirst`, `asBase`.
- Produces:
  - `C4_KIND_TYPES` (`registry.mjs`): `{ person: [...], softwareSystem: [...], …, infrastructureNode: [...] }`.
  - `normalizeModel(raw)` só 2.0: nó com `c4: { kind, external } | null`; relação sem `c4`.
  - `c4KindOf(model, el) → el.c4?.kind ?? null` (mesma assinatura); `c4Orientation(rel)` sem `rel.c4`.
  - `planMerge`/`applyPlan`/`previewMerge` gravam 2.0; `emptyBase` com `archlens: '2.0'`.
  - `attach(raw, index, el, parentId)` plano (sempre no topo, com `parent`).

- [ ] **Step 1: Write the failing tests**

Em `tests/model.test.mjs`, troque o bloco inicial (imports, `raw`, os testes `resolveType…`, `normalizeModel flattens…`,
`c4 "uses" becomes…`, `validation reports stable codes`) e o teste `canonicalRel reads…` por:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { ELEMENT_TYPES, C4_KIND_TYPES } from '../scripts/lib/registry.mjs';
import { asBase } from './helpers.mjs';

const shopRaw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const raw = () => asBase(shopRaw());

// (keep 'registry covers ArchiMate 3.2 core layers' as it is)

test('normalizeModel reads the 2.0 format: flat parents, c4 kinds, external', () => {
  const m = normalizeModel(raw());
  const checkout = m.elements.get('loja.api.checkout');
  assert.equal(checkout.parent, 'loja.api');
  assert.equal(checkout.c4.kind, 'component');
  assert.equal(m.elements.get('loja.api').parent, 'loja');
  assert.equal(m.elements.get('loja.db').type, 'application-component');
  assert.ok(m.elements.get('loja.db').tags.includes('database'));
  assert.equal(m.elements.get('pagamentos').c4.external, true);
  assert.equal(m.elements.get('venda').layer, 'business');
});

test('relationships are read as stored: no uses, no c4 orientation', () => {
  const m = normalizeModel(raw());
  const web = m.relationships.find(r => r.to === 'cliente');
  assert.deepEqual([web.type, web.from, web.technology, 'c4' in web], ['serving', 'loja.web', 'HTTPS', false]);
  const db = m.relationships.find(r => r.from === 'loja.db');
  assert.deepEqual([db.type, db.to], ['serving', 'loja.api.checkout']);
  assert.ok(m.relationships.every(r => r.id), 'every relationship gets an id');
});

test('a 1.x base is refused with E_STORE_FORMAT pointing to migrate', () => {
  const { errors } = validateModel(shopRaw());
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'E_STORE_FORMAT');
  assert.match(errors[0].hint, /archlens migrate/);
});

test('the free vocabulary is an error inside a 2.0 base', () => {
  const r = raw();
  r.model.elements.push({ id: 'x', type: 'c4:container', name: 'X' });
  r.model.elements.push({ id: 'y', type: 'application-component', name: 'Y', children: [] });
  r.model.relationships.push({ from: 'loja.web', to: 'loja.api', type: 'uses' });
  const codes = validateModel(r).errors.map(e => e.code);
  for (const c of ['E_UNKNOWN_TYPE', 'E_SCHEMA', 'E_REL_TYPE']) assert.ok(codes.includes(c), `expected ${c} in ${codes}`);
});

test('c4.kind must fit the ArchiMate type', () => {
  for (const [kind, types] of Object.entries(C4_KIND_TYPES)) {
    const ok = raw();
    ok.model.elements.push({ id: 'k', type: types[0], name: 'K', c4: { kind } });
    assert.ok(!validateModel(ok).errors.some(e => e.code === 'E_C4_TYPE'), kind);
    const bad = raw();
    bad.model.elements.push({ id: 'k', type: 'data-object', name: 'K', c4: { kind } });
    assert.ok(validateModel(bad).errors.some(e => e.code === 'E_C4_TYPE' && /data-object/.test(e.message)), kind);
  }
});

test('validation reports stable codes', () => {
  const r = raw();
  r.model.elements.push({ id: 'cliente', type: 'business-actor', name: 'dup' });
  r.model.elements.push({ id: 'sys2', type: 'application-component', name: 's', c4: { kind: 'softwareSystem' } });
  r.model.elements.push({ id: 'bad', type: 'application-component', name: 'b', c4: { kind: 'component' }, parent: 'sys2' });
  r.model.relationships.push({ from: 'loja.api', to: 'nope', type: 'serving' });
  r.model.relationships.push({ from: 'loja.api', to: 'k8s', type: 'access' });
  r.model.relationships.push({ from: 'proc-checkout', to: 'k8s', type: 'serving' });
  const { errors, warnings } = validateModel(r);
  const codes = errors.map(e => e.code);
  for (const c of ['E_DUPLICATE_ID', 'E_C4_HIERARCHY', 'E_UNKNOWN_REF', 'E_REL_INVALID']) {
    assert.ok(codes.includes(c), `expected ${c} in ${codes}`);
  }
  assert.ok(warnings.some(w => w.code === 'W_REL_DIRECTION'));
  assert.ok(errors.every(e => e.message && e.hint), 'errors carry message + hint');
});

test('a data-object may sit inside a container; a parent cycle is reported', () => {
  const r = raw();
  r.model.elements.push({ id: 'pedidos', type: 'data-object', name: 'Pedidos', parent: 'loja.db' });
  assert.deepEqual(validateModel(r).errors, []);
  const c = raw();
  c.model.elements.find(e => e.id === 'loja').parent = 'loja.api';
  assert.ok(validateModel(c).errors.some(e => e.code === 'E_PARENT_CYCLE'));
});

test('properties take scalars and lists of text; a catalog turns mistakes into W_PROPERTY', () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'loja.api').properties = { squad: 'Checkout', tiers: ['web', 'mobile'], businessUnit: 'Atacadão' };
  r.model.elements.find(e => e.id === 'venda').properties = { squad: 'Vendas' };
  assert.deepEqual(validateModel(r).errors, []);
  assert.ok(!validateModel(r).warnings.some(w => w.code === 'W_PROPERTY'), 'no catalog, no warning');
  r.properties = {
    squad: { label: 'Squad', appliesTo: ['application-component'] },
    tiers: { type: 'string[]' },
    businessUnit: { values: ['Varejo', 'Atacado'] },
  };
  r.model.elements.find(e => e.id === 'loja.web').properties = { time: 'Front' };
  const w = validateModel(r).warnings.filter(x => x.code === 'W_PROPERTY').map(x => x.message);
  assert.equal(w.length, 3, w.join('\n'));
  assert.ok(w.some(m => /"time"/.test(m)) && w.some(m => /Atacadão/.test(m)) && w.some(m => /venda/.test(m)));
  const bad = raw();
  bad.model.elements[0].properties = { x: { nested: true } };
  assert.ok(validateModel(bad).errors.some(e => e.code === 'E_SCHEMA' && /properties\.x/.test(e.path)));
});
```

Em `tests/merge.test.mjs`, acrescente ao fim:

```js
test('a delta in the free vocabulary is planned and applied in 2.0', () => {
  const base = asBase(shop());
  const d = delta({
    elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }],
    relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses', description: 'grava' }],
  });
  const plan = planMerge(base, d, TODAY);
  assert.equal(plan.blocked, false, JSON.stringify(plan.errors));
  assert.equal(plan.delta.model.elements[0].type, 'c4:container', 'the plan keeps the delta as written');
  const { raw } = applyPlan(base, plan, TODAY);
  assert.equal(raw.archlens, '2.0');
  assert.deepEqual(find(raw, 'loja.worker'), { id: 'loja.worker', type: 'application-component', name: 'Worker', parent: 'loja', c4: { kind: 'container' }, sources: [SRC] });
  const rel = raw.model.relationships.at(-1);
  assert.deepEqual([rel.from, rel.type, rel.to], ['loja.db', 'serving', 'loja.worker']);
  assert.ok(raw.model.elements.findIndex(e => e.id === 'loja') < raw.model.elements.findIndex(e => e.id === 'loja.worker'));
});

test('enriching a nested element without type, parent or c4 asks only about the changed field', () => {
  const base = asBase(shop());
  const plan = planMerge(base, delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }] }), TODAY);
  assert.deepEqual(plan.items.filter(i => i.class === 'conflict').map(i => i.field), ['technology']);
  answer(plan, { 'el:loja.api:technology': 'take' });
  const { raw } = applyPlan(base, plan, TODAY);
  assert.equal(find(raw, 'loja.api').parent, 'loja');
  assert.deepEqual(find(raw, 'loja.api').c4, { kind: 'container' });
});

test('a kind inferred for an element matched by alias never conflicts with the stored kind', () => {
  const base = asBase(shop());
  find(base, 'loja.api').aliases = ['orders-service'];
  const plan = planMerge(base, delta({ elements: [{ id: 'orders-service', type: 'application-component', description: 'Pedidos' }] }), TODAY);
  assert.ok(!plan.items.some(i => i.field === 'c4'), JSON.stringify(plan.items));
});

test('moving an element under a parent listed after it keeps parents first', () => {
  const base = asBase(shop());
  const d = delta({ elements: [{ id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }, { id: 'loja.web', type: 'c4:container', parent: 'novo' }] });
  const plan = planMerge(base, d, TODAY);
  answer(plan, { 'el:loja.web:parent': 'take' });
  const { raw } = applyPlan(base, plan, TODAY);
  const at = id => raw.model.elements.findIndex(e => e.id === id);
  assert.equal(find(raw, 'loja.web').parent, 'novo');
  assert.ok(at('novo') < at('loja.web'));
});
```

(e acrescente `import { asBase } from './helpers.mjs';` aos imports de `tests/merge.test.mjs`.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/model.test.mjs tests/merge.test.mjs`
Expected: FAIL — `C4_KIND_TYPES` não existe; `normalizeModel` ainda traduz `c4:*` e não conhece `E_STORE_FORMAT`.

- [ ] **Step 3: `registry.mjs`** — apague `C4_TO_ARCHIMATE`, `DATA_TAGS`, `resolveType` e `resolveRelType` (com seus
  comentários) e acrescente depois de `C4_LABELS`:

```js
/** The C4 profile: which ArchiMate types each C4 kind may sit on. */
export const C4_KIND_TYPES = {
  person: ['business-actor', 'business-role'],
  softwareSystem: ['application-component'],
  container: ['application-component'],
  component: ['application-component'],
  deploymentNode: ['node', 'device', 'system-software', 'technology-service', 'communication-network'],
  infrastructureNode: ['node', 'device', 'system-software', 'technology-service', 'communication-network'],
};
```

Troque também o comentário da linha 1 por
`// Metamodel registry: ArchiMate 3.2 element/relationship catalogue plus the C4 profile on top of it (C4_KIND_TYPES).`

- [ ] **Step 4: `model.mjs`** — substitua o arquivo por:

```js
// Load + normalize a 2.0 base into a flat, ArchiMate-typed in-memory model. The free vocabulary (c4:*, "uses",
// "children") is read only by canonical.mjs, at the entrance.
import { ELEMENT_TYPES, RELATIONSHIP_TYPES, C4_KIND_TYPES, checkRelationship, STATUSES } from './registry.mjs';
import { readSources, sourceProblem } from './sources.mjs';
import { aliasKey } from './match.mjs';
import { FORMAT, isCanonicalFormat } from './canonical.mjs';

const ELEMENT_FIELDS = ['description', 'technology', 'owner', 'url', 'inferred', 'confidence', 'statusReason'];
const isPropertyValue = v => ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'));

/**
 * @returns {{ name, description, meta, elements: Map<string, object>, relationships: object[],
 *             views: object[], issues: object[] }}
 */
export function normalizeModel(raw) {
  const issues = [];
  const issue = (level, code, message, path, hint) => issues.push({ level, code, message, path, hint });
  const checkStatus = (status, where, p) => {
    if (status !== undefined && !STATUSES.includes(status)) issue('error', 'E_STATUS', `status "${status}" inválido em ${where}`, `${p}.status`, `use ${STATUSES.join(' | ')}`);
  };
  const checkSources = (list, p) => list.forEach((s, j) => {
    const why = sourceProblem(s);
    if (why) issue('error', 'E_SOURCE', 'fonte inválida', `${p}.sources[${j}]`, why);
  });
  const checkProperties = (props, owner, p) => {
    for (const [k, v] of Object.entries(props || {})) {
      if (!isPropertyValue(v)) {
        issue('error', 'E_SCHEMA', `propriedade "${k}" de "${owner}" não é texto, número, booleano nem lista de textos`, `${p}.properties.${k}`,
          'use um valor simples ou uma lista de textos, ex.: ["web","mobile"]');
      }
    }
  };
  const elements = new Map();
  const relationships = [];
  const empty = () => ({ name: raw?.name ?? 'sem nome', description: raw?.description ?? '', meta: {}, assumptions: [], elements, relationships, views: [], issues });

  if (!raw || typeof raw !== 'object' || !raw.model) {
    issue('error', 'E_SCHEMA', 'documento sem a chave "model"', '$', `use { "archlens": "${FORMAT}", "name": "...", "model": { "elements": [], "relationships": [] } }`);
    return empty();
  }
  if (!isCanonicalFormat(raw.archlens)) {
    issue('error', 'E_STORE_FORMAT', `base no formato ${raw.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}`, 'archlens',
      'rode "archlens migrate <base>" para converter (a skill pergunta antes de gravar)');
    return empty();
  }

  (raw.model.elements || []).forEach((e, i) => {
    const p = `model.elements[${i}]`;
    if (!e || typeof e.id !== 'string' || !e.id) {
      issue('error', 'E_MISSING_ID', 'elemento sem "id"', p, 'todo elemento precisa de um id único (ex.: "loja.api")');
      return;
    }
    if (elements.has(e.id)) {
      issue('error', 'E_DUPLICATE_ID', `id duplicado "${e.id}"`, p, 'renomeie um dos elementos; ids são globais');
      return;
    }
    if (e.children !== undefined) {
      issue('error', 'E_SCHEMA', `"${e.id}" tem "children", que não existe no formato ${FORMAT}`, `${p}.children`, 'liste cada filho no topo com "parent": "<id do pai>"');
    }
    const spec = ELEMENT_TYPES[e.type];
    if (!spec) {
      issue('error', 'E_UNKNOWN_TYPE', `tipo desconhecido "${e.type}" em "${e.id}"`, `${p}.type`,
        'use um tipo ArchiMate sem prefixo (veja references/archimate.md); c4:* só vale na entrada (prompt, delta, scan), que o traduz');
      return;
    }
    let c4 = null;
    if (e.c4 != null) {
      const kind = e.c4?.kind;
      if (!C4_KIND_TYPES[kind]?.includes(e.type)) {
        issue('error', 'E_C4_TYPE', `c4.kind "${kind}" não combina com o tipo "${e.type}" em "${e.id}"`, `${p}.c4`,
          C4_KIND_TYPES[kind] ? `um ${kind} é ${C4_KIND_TYPES[kind].join(' ou ')}` : `use ${Object.keys(C4_KIND_TYPES).join(' | ')}`);
      } else c4 = { kind, external: !!e.external };
    }
    const node = {
      id: e.id,
      name: e.name ?? e.id,
      type: e.type,
      layer: spec.layer,
      aspect: spec.aspect,
      c4,
      parent: e.parent ?? null,
      group: e.group ?? null,
      tags: (e.tags || []).map(String),
      properties: { ...(e.properties || {}) },
      status: e.status ?? 'active',
      aliases: Array.isArray(e.aliases) ? e.aliases.map(String) : [],
      sources: readSources(e),
      path: p,
    };
    for (const f of ELEMENT_FIELDS) if (e[f] !== undefined) node[f] = e[f];
    checkStatus(e.status, `"${e.id}"`, p);
    if (e.aliases !== undefined && !Array.isArray(e.aliases)) {
      issue('error', 'E_SCHEMA', `"aliases" de "${e.id}" não é uma lista`, `${p}.aliases`, 'use uma lista de nomes, ex.: "aliases": ["orders-service"]');
    }
    checkProperties(e.properties, e.id, p);
    checkSources(node.sources, p);
    elements.set(e.id, node);
    if (e.group != null && typeof e.group !== 'string') { // null: explicitly no group
      issue('error', 'E_SCHEMA', `"group" de "${e.id}" não é um id`, `${p}.group`, 'use o id de um elemento do tipo "grouping"');
      node.group = null;
    }
  });

  for (const n of elements.values()) {
    if (n.parent != null && !elements.has(n.parent)) {
      issue('error', 'E_UNKNOWN_REF', `parent "${n.parent}" de "${n.id}" não existe`, `${n.path}.parent`, 'corrija o id do pai');
      n.parent = null;
    }
  }
  for (const n of elements.values()) {
    const seen = new Set([n.id]);
    for (let cur = n.parent; cur != null; cur = elements.get(cur)?.parent) {
      if (!seen.has(cur)) { seen.add(cur); continue; }
      issue('error', 'E_PARENT_CYCLE', `"${n.id}" está dentro de si mesmo pela cadeia de "parent"`, `${n.path}.parent`, 'corrija o "parent" de um dos elementos do ciclo');
      n.parent = null;
      break;
    }
  }
```

…e daqui em diante copie **sem mudança** os blocos do `model.mjs` atual: "An element nested in (or "parent" of) a
grouping…", "Groupings: …", `effectiveGroup`, "Aliases identify one element only…" e "C4 hierarchy rules". Depois
deles, o laço de relações fica:

```js
  const seen = new Map();
  (raw.model.relationships || []).forEach((r, i) => {
    const p = `model.relationships[${i}]`;
    if (!r || !r.from || !r.to) {
      issue('error', 'E_SCHEMA', 'relacionamento sem "from"/"to"', p, 'informe from e to com ids de elementos');
      return;
    }
    let bad = false;
    for (const end of ['from', 'to']) {
      if (!elements.has(r[end])) {
        issue('error', 'E_UNKNOWN_REF', `${end} "${r[end]}" não existe`, `${p}.${end}`, 'use o id de um elemento declarado');
        bad = true;
      }
    }
    if (bad) return;
    const grp = ['from', 'to'].find(end => elements.get(r[end]).type === 'grouping');
    if (grp) {
      issue('error', 'E_GROUP_REL', `relação com o agrupamento "${r[grp]}"`, `${p}.${grp}`,
        'agrupamentos não são nós: indique os membros com "group" em vez de relacioná-los ao agrupamento');
      return;
    }
    if (!RELATIONSHIP_TYPES[r.type]) {
      issue('error', 'E_REL_TYPE', `tipo de relacionamento desconhecido "${r.type}"`, `${p}.type`,
        `use ${Object.keys(RELATIONSHIP_TYPES).join('|')}; "uses" só vale na entrada, que o traduz para serving ou access`);
      return;
    }
    const rel = {
      from: r.from, to: r.to, type: r.type,
      description: r.description, technology: r.technology,
      tags: (r.tags || []).map(String), properties: { ...(r.properties || {}) },
      path: p, status: r.status ?? 'active', sources: readSources(r),
    };
    if (r.inferred !== undefined) rel.inferred = r.inferred;
    if (r.type === 'access' && r.accessType) rel.accessType = r.accessType;
    if (r.statusReason) rel.statusReason = r.statusReason;
    checkStatus(r.status, p, p);
    checkProperties(r.properties, `${r.from} → ${r.to}`, p);
    checkSources(rel.sources, p);
    const check = checkRelationship(rel.type, elements.get(rel.from).type, elements.get(rel.to).type);
    if (check) issue(check.level, check.code, `${rel.type} "${rel.from}" → "${rel.to}"`, p, check.hint);
    let id = r.id ?? `${rel.from}-${rel.type}-${rel.to}`;
    if (seen.has(id)) { seen.set(id, seen.get(id) + 1); id = `${id}#${seen.get(id)}`; } else seen.set(id, 1);
    rel.id = id;
    relationships.push(rel);
  });

  return {
    name: raw.name ?? 'Arquitetura',
    description: raw.description ?? '',
    meta: { ...(raw.meta || {}) },
    assumptions: raw.assumptions || [],
    elements, relationships,
    views: raw.views || [],
    issues,
  };
}

export function childrenOf(model, id) {
  const out = [];
  for (const e of model.elements.values()) if (e.parent === id) out.push(e);
  return out;
}

export function ancestors(model, id) {
  const out = [];
  let cur = model.elements.get(id)?.parent;
  while (cur) { out.push(cur); cur = model.elements.get(cur)?.parent; }
  return out;
}

/** C4 kind of an element: the stored c4.kind (2.0 never infers it on read). */
export function c4KindOf(model, el) {
  return el?.c4?.kind ?? null;
}

/** Orientation of a relationship as a C4 "uses" arrow (consumer → provider), or null if structural. */
export function c4Orientation(rel) {
  switch (rel.type) {
    case 'serving': return { from: rel.to, to: rel.from };
    case 'access': case 'flow': case 'triggering': case 'association': return { from: rel.from, to: rel.to };
    default: return null;
  }
}
```

Note: o bloco "C4 hierarchy rules" copiado já usa `n.c4`/`parent.c4?.kind`; um `data-object` filho de container não
tem `c4` e fica fora da regra.

- [ ] **Step 5: `validate.mjs`** — acrescente antes de `const seenViews = new Set();`:

```js
  warnings.push(...propertyWarnings(raw, model));
```

e, no fim do arquivo:

```js
const PROPERTY_TYPES = {
  string: v => typeof v === 'string', number: v => typeof v === 'number', boolean: v => typeof v === 'boolean',
  'string[]': v => Array.isArray(v) && v.every(x => typeof x === 'string'),
};

/** With a property catalog ("properties" in archlens.json): unknown keys, wrong types, values off the list, wrong element type. */
function propertyWarnings(raw, model) {
  const catalog = raw?.properties;
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return [];
  const out = [];
  const check = (owner, kind, props, path) => {
    for (const [k, v] of Object.entries(props || {})) {
      const warn = (message, hint) => out.push({ code: 'W_PROPERTY', message, path: `${path}.properties.${k}`, hint });
      const def = catalog[k];
      if (!def) {
        warn(`propriedade "${k}" de "${owner}" não está no catálogo`, `declare "${k}" em "properties" do archlens.json, ou use uma das chaves: ${Object.keys(catalog).join(', ')}`);
        continue;
      }
      const type = def.type ?? 'string';
      if (PROPERTY_TYPES[type] && !PROPERTY_TYPES[type](v)) warn(`propriedade "${k}" de "${owner}" deveria ser ${type}`, `ajuste o valor ${JSON.stringify(v)}`);
      else if (Array.isArray(def.values)) {
        const off = (Array.isArray(v) ? v : [v]).filter(x => !def.values.includes(x));
        if (off.length) warn(`valor ${off.map(x => JSON.stringify(x)).join(', ')} de "${k}" em "${owner}" fora da lista`, `use ${def.values.join(' | ')}`);
      }
      if (Array.isArray(def.appliesTo) && !def.appliesTo.includes(kind)) warn(`propriedade "${k}" não se aplica a ${kind} ("${owner}")`, `"${k}" vale para ${def.appliesTo.join(', ')}`);
    }
  };
  for (const e of model.elements.values()) check(e.id, e.type, e.properties, e.path);
  for (const r of model.relationships) check(r.id, 'relationship', r.properties, r.path);
  return out;
}
```

- [ ] **Step 6: `raw-tree.mjs`** — troque `attach` por:

```js
/** Puts `el` in the flat element list with its "parent" (2.0 never nests elements). */
export function attach(raw, index, el, parentId) {
  if (parentId != null) el.parent = parentId; else delete el.parent;
  raw.model.elements.push(el);
  index.set(el.id, { el, list: raw.model.elements, parent: parentId ?? null });
}
```

e o comentário do topo por `// Index over the raw model, so the merge edits it in place (also reads 1.x "children").`

- [ ] **Step 7: `merge.mjs`**

1. Imports: `import { STATUSES, RELATIONSHIP_TYPES } from './registry.mjs';` (sai `resolveType`);
   sai `import { canonicalRel } from './model.mjs';`; entra
   `import { FORMAT, canonicalElements, canonicalRelationship, sortParentsFirst } from './canonical.mjs';`.
2. `ELEMENT_FIELDS`: troque `'archimate'` por `'c4'`.
3. `emptyBase`: `archlens: FORMAT`.
4. Em `runMerge`, troque o bloco de `ctx.typeOf = …` até `runOps(ctx);` por:

```js
  ctx.typeOf = id => ctx.tree.get(id)?.el.type ?? null;
  // The delta in the 2.0 vocabulary: elements here (kinds inferred only for elements new to the base),
  // relationships once their ends resolve (mergeRelationships). The caller's delta is kept as written.
  const lookup = id => {
    const el = ctx.tree.get(resolveRef(ctx, id))?.el;
    return el ? { type: el.type, kind: el.c4?.kind ?? null } : null;
  };
  const canon = canonicalElements(delta.model?.elements, { lookup });
  ctx.inferredKinds = canon.inferred;
  if (delta.model) delta.model.elements = canon.elements;
  mergeElements(ctx);
  mergeRelationships(ctx);
  mergeViews(ctx);
  mergeAssumptions(ctx);
  runOps(ctx);
  raw.model.elements = sortParentsFirst(raw.model.elements);
```

5. `describe`: `type: el.type ?? null,` (sai `resolveType`).
6. `mergeElements`: `const isGrouping = el => el.type === 'grouping';`.
7. Apague `const normType = …` e a linha `if (field === 'type') return normType(a) === normType(b);` de `sameValue`.
8. `mergeElementInto`: troque a linha `const fields = fieldsOf(…)…` por:

```js
  // A kind the entrance inferred (the delta did not say it) never contradicts the stored one.
  const inferredKind = ctx.inferredKinds?.has(el.id) && target.c4 != null;
  const fields = fieldsOf(target, el, ELEMENT_FIELDS).filter(([f]) => !(f === 'name' && knownName) && !(f === 'c4' && inferredKind));
```

9. `relKey`, `relId`, `relIds`, `relContext`:

```js
function relKey(ctx, r) {
  return RELATIONSHIP_TYPES[r.type] ? `${r.from}|${r.type}|${r.to}` : null;
}

/** Generated id of a raw relationship (before de-duplication): explicit id, or from-type-to. */
export function relId(ctx, r) {
  return r.id ?? `${r.from}-${r.type}-${r.to}`;
}
```

em `relIds`, `const valid = r.from && r.to && ctx.tree.has(r.from) && ctx.tree.has(r.to) && !!RELATIONSHIP_TYPES[r.type];`;
em `relContext`, `const typeOf = id => tree.get(id)?.el.type ?? null;`.
10. `mergeRelationships`: troque `const r = { ...dr, from: resolveRef(ctx, dr.from), to: resolveRef(ctx, dr.to) };` por:

```js
    const ends = { ...dr, from: resolveRef(ctx, dr.from), to: resolveRef(ctx, dr.to) };
    const r = canonicalRelationship(ends, ctx.typeOf) ?? ends; // an unknown type stays, so validation reports it
```

e, no `note` de relação nova, `type: r.type`.

- [ ] **Step 8: `preview.mjs`** — em `ELEMENT_COMPARED` troque `'archimate'` por `'c4'`; no laço dos fantasmas troque
  `const { children, ...el } = structuredClone(b.el);` por `const el = structuredClone(b.el);`; em `removedGroups` troque
  `String(b.el.type).replace(/^archimate:/, '') === 'grouping'` por `b.el.type === 'grouping'`.

- [ ] **Step 9: `doc.mjs` e `query-c4.mjs`**

`doc.mjs:120` — o ícone de banco vem da tag:

```js
        out.push(table(['Container', 'Tecnologia', 'Descrição', ...extraHead, 'id'], containers.map(c => [c.name + (c.tags.some(t => ['database', 'datastore'].includes(t.toLowerCase())) ? ' 🛢' : ''), c.technology, c.description, ...extra(c), `\`${c.id}\``])), '');
```

`doc.mjs:143-146` — "usa" para `serving` entre elementos C4:

```js
  out.push(table(['Origem', 'Relação', 'Destino', 'Descrição', 'Tecnologia'], model.relationships.map(r => {
    const c4 = r.type === 'serving' && model.elements.get(r.from)?.c4 && model.elements.get(r.to)?.c4;
    if (c4) return [name(r.to), 'usa', name(r.from), r.description, r.technology];
    return [name(r.from), r.type, name(r.to), r.description, r.technology];
  })), '');
```

`query-c4.mjs:191`:

```js
      database: !el.tags.some(t => QUEUE_TAGS.includes(t.toLowerCase())) && el.tags.some(t => ['database', 'datastore'].includes(t.toLowerCase())),
```

- [ ] **Step 10: Adapt the existing tests**

Regra: toda **base** montada a partir de fixture ou literal no vocabulário livre passa por `asBase(…)` (import de
`./helpers.mjs`) antes de chegar a `normalizeModel`, `validateModel`, `resolveView`, `layoutView`, `renderHtml`,
`generateDoc`, `saveFolder`, `planMerge`/`applyPlan`/`previewMerge`/`previewModel` (como base) ou `toDelta(…, { base })`.
Mutações feitas no fixture antes da conversão (ex.: `findRaw(r, 'loja.db').status = 'draft'`) continuam valendo:
aplique `asBase` depois da mutação. **Deltas** (`delta(…)`, `toDelta` saída, `--delta`) ficam como estão.

Arquivos: `tests/model.test.mjs` (resto), `query.test.mjs`, `layout.test.mjs`, `render.test.mjs`, `doc.test.mjs`,
`explain.test.mjs`, `preview.test.mjs`, `merge.test.mjs`, `store.test.mjs`, `cli.test.mjs`, `scan-base.test.mjs`,
`scan-delta.test.mjs`. Para cada um, defina o carregador como `const shop = () => asBase(JSON.parse(readFileSync(…)))`
quando o arquivo só usa o fixture como base; quando também muta a estrutura aninhada antes, mantenha um
`shopRaw()` livre e aplique `asBase` no ponto de uso.

Asserções que mudam por causa da semântica 2.0 (substitua exatamente):

| Onde | Antes | Depois |
|---|---|---|
| `merge.test.mjs` "a new element is inserted under its parent…" | `const worker = find(raw, 'loja').children.find(c => c.id === 'loja.worker');` … `assert.equal(worker.parent, undefined);` | `const worker = find(raw, 'loja.worker');` … `assert.equal(worker.parent, 'loja');` (renomeie o teste para "…with its parent") |
| `merge.test.mjs` "elements match by alias…" | `assert.ok(find(raw, 'loja.api').children.some(c => c.id === 'orders-worker'));` | `assert.equal(find(raw, 'orders-worker').parent, 'loja.api');` |
| `merge.test.mjs` (~l. 392) | `assert.ok(find(raw, 'sys.agenda').children.some(c => c.id === 'api-agenda.slots'));` | `assert.equal(find(raw, 'api-agenda.slots').parent, 'sys.agenda');` |
| `merge.test.mjs` (~l. 204, 347, 660) bases com `children` | literal com `children` empurrado numa base 2.0 | monte o literal no vocabulário livre e converta: `base.model.elements.push(...asBase({ archlens: '1.0', model: { elements: [<o literal>], relationships: [] } }).model.elements)` |
| `preview.test.mjs` "removed elements come back as ghosts…" | as duas asserções com `.children.some(…)` | `assert.equal(find(p.raw, 'loja.api').parent, 'loja', 'ghost under its old parent');` e `assert.equal(find(p.raw, 'loja.api.checkout').parent, 'loja.api', 'descendants come back too');` |
| `preview.test.mjs` "a relationship whose canonical id flips…" | o teste inteiro | apague (Decisão de detalhe 9) |
| `preview.test.mjs` "ghosts keep a top-level parent…" | `base = { archlens: '1.0', … }` | `base = asBase({ archlens: '1.0', … })`; a asserção vira `assert.equal(c.parent, 'a');` |
| `preview.test.mjs` "without ghosts…" | `const strip = list => …children…` | `const strip = list => list.filter(e => !ghost(p.changes, e.id));` |
| `store.test.mjs` `splitBase` | arquivos com `c4:*`, `children`, `uses` | `archlens: '2.0'`; `b-pag.json`: `[{ id: 'pag', type: 'application-component', name: 'Pagamentos', c4: { kind: 'softwareSystem' } }, { id: 'pag.api', type: 'application-component', name: 'API Pag', parent: 'pag', c4: { kind: 'container' } }]`; `a-loja.json`: elemento `loja` 2.0 e relação `{ from: 'pag', to: 'loja', type: 'serving' }` |
| `store.test.mjs` "model/*.json files are joined…" | `['loja', 'pag']` | `['loja', 'pag', 'pag.api']` |
| `store.test.mjs` "saving a split model…" | push de `c4:container`, `.children[0].children = …`, relação `uses` | push 2.0: `{ id: 'pag.worker', type: 'application-component', name: 'Worker', parent: 'pag', c4: { kind: 'container' } }`, `{ id: 'pag.api.auth', type: 'application-component', name: 'Auth', parent: 'pag.api', c4: { kind: 'component' } }`, `{ id: 'erp', … softwareSystem }` e relação `{ from: 'erp', to: 'pag.api', type: 'serving' }`; filtro de relações `r => r.to !== 'loja' && r.from !== 'loja'`; asserções: `b-pag.json` elementos `['pag', 'pag.api', 'pag.worker', 'pag.api.auth']`, relações `[{ from: 'erp', to: 'pag.api', type: 'serving' }]` |
| `store.test.mjs` "the same element id in two model files…" | `{ id: 'pag.api', type: 'c4:container' }` | `{ id: 'pag.api', type: 'application-component' }` |
| `model.test.mjs` platforms | `.children[1].group = 'plat-cred'` | `r.model.elements.find(e => e.id === 'autorizador.regras').group = 'plat-cred'` (com `platforms = () => asBase(platformsRaw())`) |
| `model.test.mjs` `nestedInGrouping` e "a grouping nested in another grouping" | montam `children` em `platforms()` | montam em `platformsRaw()` e devolvem `asBase(r)` |
| `model.test.mjs` "aliases that are not a list…" | `r.model.elements[0]` | igual (o primeiro elemento 2.0 de `shop` continua sendo `cliente`) |
| `cli.test.mjs` `setup` e demais `saveFolder(…, shop(), …)` | `shop()` | `asBase(shop())` |
| `cli.test.mjs` testes do contêiner legado (`legacyMd(shop())`, `JSON.stringify(shop())` em `m.json`), inclusive os de `migrate` atuais | base 1.x dentro do `.md`/`.json` | `legacyMd(asBase(shop()))` / `JSON.stringify(asBase(shop()))`, e `shop()` nas asserções deles vira `asBase(shop())`; um `bad` montado para falhar vira `asBase(shop())` + `{ from: 'loja.api', to: 'nada', type: 'serving' }`. Continuam testando o contêiner (ler sim, gravar `E_STORE_LEGACY`); os de `migrate` são reescritos na Task 4 |

Os testes `canonicalRel reads…` e `resolveType maps…` saíram no Step 1 (o comportamento está em `canonical.test.mjs`).

- [ ] **Step 11: Convert the examples (Decisão de detalhe 4)**

```bash
for ex in loja-online telemedicina repos; do
  node --input-type=module -e "
    import { loadFolder, saveFolder } from './scripts/lib/store/folder.mjs';
    import { toCanonical } from './scripts/lib/canonical.mjs';
    const dir = 'examples/$ex/architecture';
    const { raw, notes, origins, layout } = loadFolder(dir);
    saveFolder(dir, toCanonical(raw).raw, { notes, origins, layout });"
  node scripts/archlens.mjs validate examples/$ex/architecture
  node scripts/archlens.mjs doc examples/$ex/architecture
done
npm run examples
```

Expected: `✓ modelo válido` nos três; `git diff --stat examples/` mostra `model.json`, `archlens.json`, `ARCHITECTURE.md`
e os HTML de `diagrams/`. Abra `examples/repos/architecture/diagrams/architecture.html` e confira que o banco continua
como cilindro na visão de containers.

- [ ] **Step 12: Run the whole suite**

Run: `npm test`
Expected: PASS. Se algum teste ainda falhar por montar base no vocabulário livre, aplique a regra do Step 10 (não mude
expectativas fora da tabela sem entender a causa).

- [ ] **Step 13: Commit**

```bash
git add scripts/lib tests examples
git commit -m "feat(model)!: o núcleo lê e grava só o formato 2.0 (tipos ArchiMate, c4.kind, parent plano)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 3: store, CLI e scan em 2.0

**Files:**
- Modify: `scripts/lib/store/folder.mjs`, `scripts/lib/store/legacy.mjs`, `scripts/lib/store/index.mjs`
- Modify: `scripts/archlens.mjs` (abertura da base, `scan`)
- Modify: `scripts/lib/scan/to-delta.mjs:196,211`
- Test: `tests/store.test.mjs`, `tests/cli.test.mjs`, `tests/scan-delta.test.mjs`

**Interfaces:**
- Consumes: `isCanonicalFormat`, `FORMAT` (Task 1).
- Produces: `loadFolder(dir, { anyFormat })`, `loadLegacy(path, { anyFormat })`, `store.load({ anyFormat })`;
  `storeError('E_STORE_FORMAT', …)` com `code === 'E_STORE_FORMAT'`.

- [ ] **Step 1: Write the failing tests**

`tests/store.test.mjs`:

```js
test('a 1.x folder is refused with E_STORE_FORMAT unless the caller asks for any format', () => {
  const dir = tmp();
  saveFolder(dir, shopRaw()); // 1.x, free vocabulary
  assert.throws(() => loadFolder(dir), e => e.code === 'E_STORE_FORMAT' && /archlens migrate/.test(e.message));
  assert.equal(loadFolder(dir, { anyFormat: true }).raw.archlens, '1.0');
  const store = openStore(resolveBase(dir));
  assert.throws(() => store.load(), e => e.code === 'E_STORE_FORMAT');
  assert.equal(store.load({ anyFormat: true }).raw.archlens, '1.0');
});
```

(com `const shopRaw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));`.)

`tests/cli.test.mjs`:

```js
test('every command that reads a 1.x folder fails with E_STORE_FORMAT; scan does not take it for a new base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  saveFolder(join(dir, 'architecture'), shop());
  for (const args of [['validate'], ['views'], ['build'], ['merge', 'architecture', 'd.json', '--plan', 'p.json']]) {
    const r = run(args, dir);
    assert.notEqual(r.status, 0, args.join(' '));
    assert.match(r.stderr, /E_STORE_FORMAT[\s\S]*archlens migrate/, args.join(' '));
  }
  const repo = fileURLToPath(new URL('./fixtures/repos/pedidos', import.meta.url));
  const s = run(['scan', repo], dir);
  assert.notEqual(s.status, 0);
  assert.match(s.stderr, /E_STORE_FORMAT/);
});
```

`tests/scan-delta.test.mjs` (usa os helpers `inv` e `at` do topo do arquivo; `tf-ref` vai do recurso que referencia,
`from`, para o referenciado, `to`, e vira "o referenciado serve quem o referencia"):

```js
test('a database engine serves its database, and a database that references a resource is served by it', () => {
  const d = toDelta(inv([
    { kind: 'infra-image', service: 'db', engine: 'postgres', version: '16', category: 'database', at },
    { kind: 'cloud-resource', type: 'aws_db_instance', name: 'orders', category: 'database', attrs: {}, at },
    { kind: 'cloud-resource', type: 'aws_s3_bucket', name: 'bkp', category: 'storage', attrs: {}, at },
    { kind: 'tf-ref', from: 'aws_db_instance.orders', to: 'aws_s3_bucket.bkp', at },
  ]), { role: 'system' });
  const rels = d.model.relationships;
  assert.ok(rels.some(r => r.type === 'archimate:serving' && /postgres/.test(r.from) && /db$/.test(r.to)), JSON.stringify(rels));
  assert.ok(!rels.some(r => r.type === 'archimate:realization'));
  assert.ok(rels.some(r => r.type === 'archimate:serving' && /bkp/.test(r.from) && /orders/.test(r.to)), 'a tf-ref from a database is no longer dropped');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/store.test.mjs tests/cli.test.mjs tests/scan-delta.test.mjs`
Expected: FAIL — `loadFolder` aceita a base 1.x; o `scan` trata a base como nova; há `realization` no delta.

- [ ] **Step 3: Store**

`store/folder.mjs` — import `import { isCanonicalFormat, FORMAT } from '../canonical.mjs';`; `loadFolder(dir, { anyFormat = false } = {})`,
e logo depois do teste de `store`:

```js
  if (!anyFormat && !isCanonicalFormat(top.archlens)) {
    throw storeError('E_STORE_FORMAT', `${dir} está no formato ${top.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}. `
      + `Rode "archlens migrate ${dir}" para converter (a skill pergunta antes de gravar)`);
  }
```

`store/legacy.mjs` — renomeie a função atual `loadLegacy(path)` para `readLegacy(path)` (corpo intacto, sem
`export`) e acrescente, com o import `import { isCanonicalFormat, FORMAT } from '../canonical.mjs';`:

```js
export function loadLegacy(path, { anyFormat = false } = {}) {
  const loaded = readLegacy(path);
  if (!anyFormat && !isCanonicalFormat(loaded.raw?.archlens)) {
    throw storeError('E_STORE_FORMAT', `${path} está no formato ${loaded.raw?.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}. `
      + `Rode "archlens migrate ${path}" para converter (a skill pergunta antes de gravar)`);
  }
  return loaded;
}
```

`store/index.mjs` — `load({ anyFormat } = {})` nos dois adaptadores repassa `{ anyFormat }` a `loadFolder`/`loadLegacy`.

- [ ] **Step 4: CLI** — em `scripts/archlens.mjs`, no `scan`, troque `if (val('base')) fail(e.message);` por
`if (val('base') || e.code === 'E_STORE_FORMAT') fail(e.message);`. (Os demais comandos já falham com a mensagem do
store via `loadBase`/`requireRaw`.)

- [ ] **Step 5: Scan** — `scan/to-delta.mjs:196`:

```js
    link(engine(f.engine, f.version, f.at), iid, 'archimate:serving', f.at);
```

e apague a linha 211 (`if (cloud.get(f.from)?.category === 'database') continue; …`).

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts tests
git commit -m "feat(store): base 1.x recusada com E_STORE_FORMAT; scan liga bancos por serving

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 4: `archlens migrate` 1.x → 2.0

**Files:**
- Create: `scripts/lib/migrate.mjs`
- Modify: `scripts/archlens.mjs` (`case 'migrate'`, `HELP`)
- Test: `tests/migrate.test.mjs` (novo), `tests/cli.test.mjs` (testes de `migrate`)

**Interfaces:**
- Consumes: `toCanonical` (Task 1), `normalizeLegacy`/`legacyKindOf` (Task 1), `normalizeModel`/`validateModel`
  (Task 2), `loadFolder(dir, { anyFormat })`, `store.load({ anyFormat })` (Task 3).
- Produces: `migrateRaw(raw, { today }) → { raw, report, idMap: Map<oldRelId, newRelId>, errors: [], diffs: [] }`.
  `errors` (1.x ou 2.0 inválido) e `diffs` (equivalência) vazios significam sucesso.

- [ ] **Step 1: Write the failing tests** — `tests/migrate.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateRaw } from '../scripts/lib/migrate.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { asBase } from './helpers.mjs';

const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const TODAY = { today: '2026-10-17' };

test('migrateRaw converts a 1.x base, checks equivalence and records the round', () => {
  const res = migrateRaw(shop(), TODAY);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.diffs, []);
  const { changelog, ...rest } = res.raw;
  assert.deepEqual(rest, asBase(shop()));
  assert.equal(changelog.length, 1);
  assert.equal(changelog[0].summary, 'migração para o formato 2.0');
  assert.ok(changelog[0].decisions.some(d => /5 relação\(ões\) "uses"/.test(d)), changelog[0].decisions.join('\n'));
  assert.deepEqual(validateModel(res.raw).errors, []);
});

test('relationship ids that change (accesses to a 1.x database) are rewritten in dynamic steps', () => {
  const r = shop();
  r.model.relationships.push({ id: 'leitura', from: 'loja.web', to: 'loja.db', type: 'archimate:access', accessType: 'read' });
  r.model.relationships.push({ from: 'loja.api.catalogo', to: 'loja.db', type: 'archimate:access' });
  r.views.push({ key: 'din', notation: 'c4', level: 'dynamic', scope: 'loja', steps: [{ rel: 'loja.api.catalogo-access-loja.db' }, { rel: 'leitura' }] });
  const res = migrateRaw(r, TODAY);
  assert.deepEqual(res.diffs, []);
  assert.equal(res.idMap.get('loja.api.catalogo-access-loja.db'), 'loja.db-serving-loja.api.catalogo');
  assert.deepEqual(res.raw.views.find(v => v.key === 'din').steps.map(s => s.rel), ['loja.db-serving-loja.api.catalogo', 'leitura']);
  assert.deepEqual(res.raw.model.relationships.find(x => x.id === 'leitura').properties, { accessType: 'read' });
});

test('an invalid 1.x base is reported with its 1.x errors and nothing is converted', () => {
  const r = shop();
  r.model.relationships.push({ from: 'loja.api', to: 'nada', type: 'uses' });
  const res = migrateRaw(r, TODAY);
  assert.ok(res.errors.some(e => e.code === 'E_UNKNOWN_REF'));
  assert.equal(res.raw, null);
});
```

`tests/cli.test.mjs` — substitua os testes de `migrate` ("migrate turns an old base…", "a plan made before migrate
applies after it", "migrate refuses a destination…") por:

```js
test('migrate turns an old .md base into a 2.0 architecture/ folder with notes and a generated .md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop()));
  const r = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /formato 2\.0/);
  const back = loadFolder(join(dir, 'architecture'));
  const { changelog, ...rest } = back.raw;
  assert.deepEqual(rest, asBase(shop()));
  assert.equal(back.notes.notes, 'Nota antiga.');
  assert.match(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), /^---\n[\s\S]*source: architecture\//);
  const again = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /formato 2\.0/);
});

test('migrate converts a 1.x folder in place, keeping notes and the files that are not the base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  saveFolder(join(dir, 'architecture'), shop(), { notes: { notes: 'Nota.' } });
  mkdirSync(join(dir, 'architecture', 'diagrams'));
  writeFileSync(join(dir, 'architecture', 'diagrams', 'architecture.html'), '<html></html>');
  const r = run(['migrate', 'architecture'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 banco\(s\)/);
  assert.match(r.stdout, /planos gerados antes/);
  assert.equal(loadFolder(join(dir, 'architecture')).raw.archlens, '2.0');
  assert.equal(loadFolder(join(dir, 'architecture')).notes.notes, 'Nota.');
  assert.ok(existsSync(join(dir, 'architecture', 'diagrams', 'architecture.html')), 'diagrams/ survives');
  assert.ok(!readdirSync(dir).some(n => /\.(migrate|old)-/.test(n)), 'no temporary folder left behind');
  assert.equal(run(['validate', 'architecture'], dir).status, 0);
});

test('an old .md that already holds a 2.0 base is moved to a folder without conversion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(asBase(shop())));
  const r = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(loadFolder(join(dir, 'architecture')).raw, asBase(shop()));
});

test('migrate of a split folder keeps every element in its file; a nested child goes with its parent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const base = join(dir, 'architecture');
  mkdirSync(join(base, 'model'), { recursive: true });
  writeFileSync(join(base, 'archlens.json'), JSON.stringify({ archlens: '1.0', name: 'Split', layout: { model: 'model/' } }));
  writeFileSync(join(base, 'model/b-pag.json'), JSON.stringify({ elements: [{ id: 'pag', type: 'c4:softwareSystem', name: 'Pag', children: [{ id: 'pag.api', type: 'c4:container', name: 'API' }] }], relationships: [] }));
  writeFileSync(join(base, 'model/a-loja.json'), JSON.stringify({ elements: [{ id: 'loja', type: 'c4:softwareSystem', name: 'Loja' }], relationships: [{ from: 'loja', to: 'pag.api', type: 'uses' }] }));
  const r = run(['migrate', 'architecture'], dir);
  assert.equal(r.status, 0, r.stderr);
  const file = f => JSON.parse(readFileSync(join(base, f), 'utf8'));
  assert.deepEqual(file('model/b-pag.json').elements.map(e => [e.id, e.parent ?? null]), [['pag', null], ['pag.api', 'pag']]);
  assert.deepEqual(file('model/a-loja.json').elements.map(e => e.id), ['loja']);
  assert.equal(file('archlens.json').archlens, '2.0');
});

test('migrate writes nothing when the 1.x base is invalid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const bad = shop();
  bad.model.relationships.push({ from: 'loja.api', to: 'nada', type: 'uses' });
  saveFolder(join(dir, 'architecture'), bad);
  const before = snapshot(dir);
  const r = run(['migrate', 'architecture'], dir);
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /E_UNKNOWN_REF/);
  assert.deepEqual(snapshot(dir), before);
});
```

(acrescente `import { asBase } from './helpers.mjs';` e `loadFolder`/`mkdirSync` aos imports se faltarem.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/migrate.test.mjs tests/cli.test.mjs`
Expected: FAIL — `scripts/lib/migrate.mjs` não existe; `migrate` recusa pasta.

- [ ] **Step 3: Create `scripts/lib/migrate.mjs`**

```js
// 1.x → 2.0: translate with toCanonical, check that the 2.0 model means what the 1.x reader read (elements, kinds,
// parents, groups, relationships), rewrite relationship ids that changed in saved views and record the round. Pure.
import { toCanonical, FORMAT } from './canonical.mjs';
import { normalizeLegacy, legacyKindOf } from './canonical-legacy.mjs';
import { normalizeModel } from './model.mjs';
import { validateModel } from './validate.mjs';
import { canonicalJson } from './merge.mjs';

export function migrateRaw(raw, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const legacy = normalizeLegacy(raw);
  const legacyErrors = legacy.issues.filter(i => i.level === 'error').map(({ level, ...i }) => i);
  if (legacyErrors.length) return { raw: null, report: null, idMap: new Map(), errors: legacyErrors, diffs: [] };
  const { raw: v2, report, databases } = toCanonical(raw);
  const model = normalizeModel(v2);
  const { diffs, idMap } = equivalence(legacy, model, databases);
  for (const v of v2.views ?? []) {
    if (Array.isArray(v.steps)) v.steps = v.steps.map(s => (s.rel && idMap.get(s.rel) && idMap.get(s.rel) !== s.rel ? { ...s, rel: idMap.get(s.rel) } : s));
  }
  const seq = (v2.changelog ?? []).filter(e => e.date === today).length + 1;
  v2.changelog = [...(v2.changelog ?? []), {
    id: `${today}-${String(seq).padStart(2, '0')}`, date: today, summary: `migração para o formato ${FORMAT}`,
    added: [], changed: [], status: {}, removed: [], decisions: reportLines(report),
  }];
  const errors = validateModel(v2).errors;
  return { raw: errors.length || diffs.length ? null : v2, report, idMap, errors, diffs };
}

export function reportLines(r) {
  return [
    `${r.types} tipo(s) reescrito(s) para ArchiMate`,
    `${r.uses} relação(ões) "uses" convertida(s) para serving/access`,
    `${r.databases} banco(s) de dados: data-object → application-component (container)`,
    `${r.kinds} kind(s) C4 inferido(s) pela hierarquia`,
  ];
}

/** Differences between the 1.x reading and the 2.0 model, and 1.x relationship id → 2.0 id. */
function equivalence(legacy, model, databases) {
  const diffs = [];
  for (const [id, a] of legacy.elements) {
    const b = model.elements.get(id);
    if (!b) { diffs.push(`elemento ${id} sumiu`); continue; }
    const type = databases.has(id) && a.type === 'data-object' ? 'application-component' : a.type;
    const pairs = [['type', type, b.type], ['c4', legacyKindOf(legacy, a), b.c4?.kind ?? null], ['parent', a.parent, b.parent],
      ['group', a.groupId, b.groupId], ['status', a.status, b.status], ['properties', a.properties, b.properties]];
    for (const [f, x, y] of pairs) if (canonicalJson(x ?? null) !== canonicalJson(y ?? null)) diffs.push(`${id}.${f}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
  }
  for (const id of model.elements.keys()) if (!legacy.elements.has(id)) diffs.push(`elemento ${id} apareceu`);
  // 1.x accesses to a database are 2.0 servings from it; everything else keeps from/type/to.
  const key = r => `${r.from}|${r.type}|${r.to}`;
  const expected = legacy.relationships.map(r => (r.type === 'access' && databases.has(r.to) ? { id: r.id, from: r.to, type: 'serving', to: r.from } : r));
  const group = list => { const m = new Map(); for (const r of list) m.set(key(r), [...(m.get(key(r)) ?? []), r.id]); return m; };
  const before = group(expected), after = group(model.relationships);
  const idMap = new Map();
  for (const [k, ids] of before) {
    const now = after.get(k) ?? [];
    if (now.length !== ids.length) diffs.push(`relação ${k}: ${ids.length} antes, ${now.length} depois`);
    ids.forEach((id, i) => { if (now[i]) idMap.set(id, now[i]); });
  }
  for (const [k, ids] of after) if (!before.has(k)) diffs.push(`relação ${k} apareceu (${ids.join(', ')})`);
  return { diffs, idMap };
}
```

Nota: `legacy.relationships` traz `from`/`to` canônicos 1.x (o `uses` já lido como `serving` invertido ou `access`),
então a única diferença esperada é a do banco.

- [ ] **Step 4: CLI `migrate`** — substitua o `case 'migrate'` por:

```js
    case 'migrate': {
      if (!file) fail('uso: archlens migrate <architecture/ | ARCHITECTURE.md | modelo.json> [--to <pasta>]');
      let loc;
      try { loc = resolveBase(file); } catch (e) { fail(e.message); }
      if (loc.kind === 'folder' && !loc.exists) fail(`base não encontrada: ${file}`);
      const src = openStore(loc);
      let loaded;
      try { loaded = src.load({ anyFormat: true }); } catch (e) { fail(e.message); }
      const { raw, notes } = loaded;
      // A 2.0 base still in the old single-file container only changes container.
      const already = isCanonicalFormat(raw?.archlens);
      if (already && loc.kind === 'folder') fail(`${file} já está no formato ${FORMAT}`);
      const res = already ? { raw, report: null, errors: validateModel(raw).errors, diffs: [] } : migrateRaw(raw);
      if (res.errors.length) { printIssues(res.errors, 'ERRO'); fail('corrija os erros do modelo antes de migrar; nada foi gravado', 2); }
      if (res.diffs.length) {
        for (const d of res.diffs) console.log(`  diferença: ${d}`);
        fail(`E_MIGRATE_EQUIV: a tradução para ${FORMAT} não reproduz o modelo (${res.diffs.length} diferença(s)); nada foi gravado`, 2);
      }
      let dest, docPath, replacing;
      if (loc.kind === 'folder') {
        // In place: write a sibling folder, read it back, then swap; the old folder is removed only after the swap.
        const tmp = `${loc.path}.migrate-${process.pid}`;
        const old = `${loc.path}.old-${process.pid}`;
        try {
          saveFolder(tmp, res.raw, { notes, origins: loaded.origins, layout: loaded.layout });
          const back = loadFolder(tmp);
          if (canonicalJson(back.raw) !== canonicalJson(res.raw)) throw new Error('E_STORE_MIGRATE: a pasta gravada não reproduz o modelo convertido; nada foi trocado');
          renameSync(loc.path, old);
          renameSync(tmp, loc.path);
          // What is not the base (diagrams/, files of the user) moves over to the new folder.
          for (const n of readdirSync(old)) if (!existsSync(join(loc.path, n))) renameSync(join(old, n), join(loc.path, n));
          rmSync(old, { recursive: true, force: true });
        } catch (e) {
          rmSync(tmp, { recursive: true, force: true });
          if (existsSync(old) && !existsSync(loc.path)) renameSync(old, loc.path);
          fail(e.message);
        }
        dest = openStore({ ...loc, exists: true });
        docPath = loc.docPath;
      } else {
        const to = resolve(args.to && args.to !== true ? args.to : join(dirname(loc.path), 'architecture'));
        let target;
        try { target = resolveBase(to, { create: true }); } catch (e) {
          fail(e.code === 'E_STORE_NOT_BASE' && !(args.to && args.to !== true) ? `${e.message}; use --to <pasta> para escolher outro destino` : e.message);
        }
        if (target.exists) fail(`E_STORE_EXISTS: ${relPath(to)} já tem uma base (${MANIFEST}); escolha outra pasta com --to`);
        docPath = extname(loc.path).toLowerCase() === '.md' ? loc.path : join(dirname(loc.path), 'ARCHITECTURE.md');
        dest = openStore({ ...target, docPath });
        replacing = docPath === loc.path ? loc.path : undefined;
        assertDocOwned(dest, docPath, { replacing });
        const existed = existsSync(to);
        try {
          dest.save(res.raw, { notes });
          if (canonicalJson(dest.load().raw) !== canonicalJson(res.raw)) throw new Error('E_STORE_MIGRATE: a pasta gravada não reproduz o modelo convertido; nada foi trocado');
        } catch (e) {
          if (existed) for (const n of readdirSync(to)) rmSync(join(to, n), { recursive: true, force: true });
          else rmSync(to, { recursive: true, force: true });
          fail(e.message);
        }
      }
      const back = dest.load();
      const doc = writeDoc(dest, back.raw, back.notes, docPath, { replacing });
      console.log(`✓ ${dest.describe()} no formato ${FORMAT}; ${relPath(doc)} regenerado`);
      if (res.report) {
        for (const l of reportLines(res.report)) console.log(`  ${l}`);
        console.log('  aviso: planos gerados antes da migração não se aplicam mais (a base mudou); gere-os de novo');
      }
      console.log(`  commit sugerido: git add ${relPath(dest.locator.path)} ${relPath(doc)} && git commit -m "chore(archlens): base migrada para o formato ${FORMAT}"`);
      break;
    }
```

Imports novos em `scripts/archlens.mjs`: `import { migrateRaw, reportLines } from './lib/migrate.mjs';`,
`import { FORMAT, isCanonicalFormat } from './lib/canonical.mjs';`,
`import { saveFolder, loadFolder } from './lib/store/folder.mjs';`. Em `HELP`, a linha do `migrate` vira
`  migrate   <base 1.x> [--to DIR]           converte uma base 1.x (pasta, .md ou .json) para o formato 2.0`.
`migrate` continua fora de `BASE_CMDS` (abre a base com `anyFormat`).

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts tests
git commit -m "feat(migrate): converte bases 1.x para o formato 2.0 com checagem de equivalência

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 5: C4 a partir de um modelo ArchiMate (derivação através de intermediários)

**Files:**
- Modify: `scripts/lib/query-c4.mjs`
- Test: `tests/query.test.mjs`

**Interfaces:**
- Consumes: `c4Orientation`, `ancestors` (`model.mjs`).
- Produces: `intermediaryOwners(model) → Map<intermediaryId, ownerId[]>` (exportada de `query-c4.mjs`); arestas C4 com
  `derived: true` e `via: [nomes]` quando só existem por derivação.

- [ ] **Step 1: Write the failing tests** — em `tests/query.test.mjs`:

```js
// A 2.0 base written only with ArchiMate types and relationships: no "uses" at all.
const pure = () => normalizeModel({ archlens: '2.0', name: 'Puro', model: {
  elements: [
    { id: 'loja', type: 'application-component', name: 'Loja', c4: { kind: 'softwareSystem' } },
    { id: 'loja.web', type: 'application-component', name: 'Web', parent: 'loja', c4: { kind: 'container' } },
    { id: 'loja.api', type: 'application-component', name: 'API', parent: 'loja', c4: { kind: 'container' } },
    { id: 'loja.db', type: 'application-component', name: 'Banco', parent: 'loja', c4: { kind: 'container' }, tags: ['database'] },
    { id: 'pedidos', type: 'data-object', name: 'Pedidos', parent: 'loja.db' },
    { id: 'pag', type: 'application-component', name: 'Pagamentos', c4: { kind: 'softwareSystem' }, external: true },
    { id: 'svc-pag', type: 'application-service', name: 'Autorização' },
    { id: 'if-api', type: 'application-interface', name: 'REST' },
    { id: 'fn-preco', type: 'application-function', name: 'Precificar' },
    { id: 'svc-preco', type: 'application-service', name: 'Preço' },
    { id: 'orfao', type: 'application-service', name: 'Sem dono' },
  ],
  relationships: [
    { from: 'pag', to: 'svc-pag', type: 'realization' },
    { from: 'svc-pag', to: 'loja.api', type: 'serving', description: 'autoriza' },
    { from: 'loja.api', to: 'if-api', type: 'composition' },
    { from: 'if-api', to: 'loja.web', type: 'serving' },
    { from: 'loja.api', to: 'fn-preco', type: 'assignment' },
    { from: 'fn-preco', to: 'svc-preco', type: 'realization' },
    { from: 'svc-preco', to: 'loja.web', type: 'serving' },
    { from: 'orfao', to: 'loja.web', type: 'serving' },
    { from: 'loja.api', to: 'pedidos', type: 'access', accessType: 'write' },
  ],
} });
const pureEdge = (v, a, b) => v.edges.find(e => e.from === a && e.to === b);

test('C4 from pure ArchiMate: services, interfaces and assigned functions lead to their owners', () => {
  const v = resolveView(pure(), { key: 'k', notation: 'c4', level: 'container', scope: 'loja' });
  const pagamento = pureEdge(v, 'loja.api', 'pag');
  assert.ok(pagamento, JSON.stringify(v.edges));
  assert.equal(pagamento.derived, true);
  assert.deepEqual(pagamento.via, ['Autorização']);
  assert.equal(pagamento.label, 'autoriza');
  const web = pureEdge(v, 'loja.web', 'loja.api');
  assert.ok(web, 'via the interface and via the function chain');
  assert.equal(web.count, 2);
  assert.match(web.label, /Preço/, 'no description: the intermediary name');
  assert.ok(pureEdge(v, 'loja.api', 'loja.db'), 'a data-object inside a container lifts to it');
  assert.ok(!v.edges.some(e => e.from === 'loja.web' && e.to !== 'loja.api'), 'an intermediary without owner is dropped');
  assert.equal(v.nodes.find(n => n.id === 'loja.db').database, true);
});

test('a derived edge joins a direct one between the same pair, which keeps its plain style', () => {
  const m = pure();
  m.relationships.push({ id: 'direta', from: 'pag', to: 'loja.api', type: 'serving', description: 'webhook', tags: [], properties: {}, status: 'active', sources: [] });
  const e = pureEdge(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja' }), 'loja.api', 'pag');
  assert.equal(e.count, 2);
  assert.equal(e.derived, undefined);
  assert.match(e.label, /webhook/);
  assert.match(e.label, /autoriza/);
});

test('"derive": false turns derivation off', () => {
  const v = resolveView(pure(), { key: 'k', notation: 'c4', level: 'container', scope: 'loja', derive: false });
  assert.equal(pureEdge(v, 'loja.api', 'pag'), undefined);
  assert.ok(pureEdge(v, 'loja.api', 'loja.db'), 'hierarchy lifting is not derivation');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/query.test.mjs`
Expected: FAIL — `pureEdge(v, 'loja.api', 'pag')` é `undefined`.

- [ ] **Step 3: Implement** — em `query-c4.mjs`, acrescente depois de `LEVEL_TITLES`:

```js
// Behaviour and interfaces of an application: a C4 arrow to or from one of them is an arrow to or from its owner.
const INTERMEDIARY = new Set(['application-service', 'application-interface', 'application-function', 'application-process']);
const OWNING = new Set(['realization', 'assignment', 'composition']);

/** intermediary id → the C4 elements that own it (realize, are assigned to or compose it), through chains of intermediaries. */
export function intermediaryOwners(model) {
  const direct = new Map();
  const add = (x, o) => { if (!direct.has(x)) direct.set(x, []); if (!direct.get(x).includes(o)) direct.get(x).push(o); };
  for (const r of model.relationships) if (OWNING.has(r.type) && INTERMEDIARY.has(model.elements.get(r.to)?.type)) add(r.to, r.from);
  for (const e of model.elements.values()) if (INTERMEDIARY.has(e.type) && e.parent) add(e.id, e.parent);
  const resolve = (x, seen) => {
    const out = [];
    for (const o of direct.get(x) ?? []) {
      const el = model.elements.get(o);
      if (el?.c4) { if (!out.includes(o)) out.push(o); continue; }
      if (INTERMEDIARY.has(el?.type) && !seen.has(o)) for (const y of resolve(o, new Set([...seen, o]))) if (!out.includes(y)) out.push(y);
    }
    return out;
  };
  const owners = new Map();
  for (const x of direct.keys()) { const o = resolve(x, new Set([x])); if (o.length) owners.set(x, o); }
  return owners;
}
```

No laço não dinâmico (`} else { for (const r of model.relationships) { … } }`), troque por:

```js
  } else {
    const owners = spec.derive === false ? new Map() : intermediaryOwners(model);
    const ends = id => (INTERMEDIARY.has(model.elements.get(id)?.type) ? owners.get(id) ?? [] : [id]);
    for (const r of model.relationships) {
      const o = c4Orientation(r);
      if (!o) continue;
      const via = [o.from, o.to].filter(id => INTERMEDIARY.has(model.elements.get(id)?.type)).map(id => model.elements.get(id).name);
      for (const f of ends(o.from)) for (const t of ends(o.to)) {
        const a = rep(f), b = rep(t);
        if (!a || !b || a === b) continue;
        const e = addEdge(a, b, r);
        if (!via.length) { e.direct = true; continue; }
        e.via = [...new Set([...(e.via ?? []), ...via])];
        if (!r.description && !e.descriptions.includes(via[0])) e.descriptions.push(via[0]);
      }
    }
  }
```

e, no `map` final das arestas, acrescente ao objeto devolvido
`...(e.via && !e.direct ? { derived: true, via: e.via } : {}),`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. Se um teste de exemplo mudar porque uma visão C4 ganhou seta derivada, abra a visão
(`node scripts/archlens.mjs resolve examples/<ex>/architecture --view <key>`) e confirme que a seta nova vem de um
serviço realizado por um elemento C4 antes de aceitar.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/query-c4.mjs tests/query.test.mjs
git commit -m "feat(c4): setas derivadas através de serviços, interfaces e funções de aplicação

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 6: aninhamento visual no ArchiMate — consulta

**Files:**
- Modify: `scripts/lib/query-archimate.mjs`
- Test: `tests/query.test.mjs`

**Interfaces:**
- Produces: `nestingSpec(value) → { mode: 'edges' | 'nested', depth: number | null }` (lança `E_VIEW_NESTING`);
  `nestElements(kept: Set<id>, edges, model, { depth }) → { nestedIn: Map<id, id>, replaced: Set<edgeId>, tips: Map<id, string>, level: Map<id, number> }`;
  nós do IR com `nestedIn` e `nestTip` opcionais; visão com `nesting: { mode, depth }`.

- [ ] **Step 1: Write the failing tests** — em `tests/query.test.mjs`:

```js
const odin = () => normalizeModel({ archlens: '2.0', name: 'Odin', model: {
  elements: [
    { id: 'odin', type: 'application-component', name: 'Odin', c4: { kind: 'softwareSystem' } },
    { id: 'odin.api', type: 'application-component', name: 'odin-api', parent: 'odin', c4: { kind: 'container' } },
    { id: 'odin.worker', type: 'application-component', name: 'odin-message-worker', parent: 'odin', c4: { kind: 'container' } },
    { id: 'odin.api.rest', type: 'application-component', name: 'REST', parent: 'odin.api', c4: { kind: 'component' } },
    { id: 'crm', type: 'application-component', name: 'CRM', c4: { kind: 'softwareSystem' } },
    { id: 'bus', type: 'application-component', name: 'Barramento' },
    { id: 'bus.adapter', type: 'application-component', name: 'Adapter' },
  ],
  relationships: [
    { from: 'odin.api', to: 'odin.worker', type: 'flow', description: 'mensagem' },
    { from: 'odin.worker', to: 'crm', type: 'serving' },
    { from: 'bus', to: 'bus.adapter', type: 'aggregation', description: 'reúne adaptadores' },
    { from: 'crm', to: 'bus.adapter', type: 'composition' },
  ],
} });
const appView = extra => resolveView(odin(), { key: 'a', notation: 'archimate', viewpoint: 'application', ...extra });
const node = (v, id) => v.nodes.find(n => n.id === id);

test('nesting "edges" (default) keeps today\'s view', () => {
  const v = appView();
  assert.deepEqual(v.nesting, { mode: 'edges', depth: null });
  assert.ok(v.edges.some(e => e.implicit && e.from === 'odin' && e.to === 'odin.api'));
  assert.ok(v.nodes.every(n => n.nestedIn === undefined));
});

test('nesting "nested": parent and composition/aggregation nest, and the edges that made them disappear', () => {
  const v = appView({ nesting: 'nested' });
  assert.equal(node(v, 'odin.api').nestedIn, 'odin');
  assert.equal(node(v, 'odin.api.rest').nestedIn, 'odin.api');
  assert.equal(node(v, 'bus.adapter').nestedIn, 'bus', 'aggregation nests; the later composition from crm stays an edge');
  assert.equal(node(v, 'bus.adapter').nestTip, 'reúne adaptadores');
  assert.ok(!v.edges.some(e => e.type === 'composition' && e.implicit));
  assert.ok(!v.edges.some(e => e.from === 'bus' && e.to === 'bus.adapter'));
  assert.ok(v.edges.some(e => e.from === 'crm' && e.to === 'bus.adapter' && e.type === 'composition'));
  assert.ok(v.edges.some(e => e.from === 'odin.api' && e.to === 'odin.worker'), 'other edges stay');
});

test('nesting depth 1: deeper elements sit in the box of the nearest nested ancestor, linked by the diamond', () => {
  const v = appView({ nesting: { mode: 'nested', depth: 1 } });
  assert.equal(node(v, 'odin.api').nestedIn, 'odin');
  assert.equal(node(v, 'odin.api.rest').nestedIn, 'odin', 'next to odin-api, inside Odin');
  assert.ok(v.edges.some(e => e.implicit && e.from === 'odin.api' && e.to === 'odin.api.rest'));
  assert.deepEqual(v.nesting, { mode: 'nested', depth: 1 });
});

test('an invalid nesting is E_VIEW_NESTING', () => {
  for (const bad of ['dentro', { mode: 'nested', depth: 0 }, { mode: 'x' }]) {
    assert.throws(() => appView({ nesting: bad }), e => e.code === 'E_VIEW_NESTING', JSON.stringify(bad));
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/query.test.mjs`
Expected: FAIL — `v.nesting` é `undefined`.

- [ ] **Step 3: Implement** — em `query-archimate.mjs`, acrescente antes de `function traverse`:

```js
/** The view's nesting ("edges" by default): { mode, depth } with depth null = every level. */
export function nestingSpec(v) {
  if (v === undefined || v === 'edges') return { mode: 'edges', depth: null };
  if (v === 'nested') return { mode: 'nested', depth: null };
  if (v && typeof v === 'object' && ['edges', 'nested'].includes(v.mode) && (v.depth === undefined || (Number.isInteger(v.depth) && v.depth >= 1))) {
    return { mode: v.mode, depth: v.mode === 'nested' ? v.depth ?? null : null };
  }
  throw viewError('E_VIEW_NESTING', `"nesting" inválido: ${JSON.stringify(v)}`, 'use "edges", "nested" ou { "mode": "nested", "depth": 1 }');
}

const NESTING = new Set(['composition', 'aggregation']);

/**
 * Who sits inside whom on the view. The visual parent is the element's parent, else the first composition/aggregation
 * from a shown element (never making a cycle). Up to `depth` an element sits in its visual parent; deeper, in the box
 * of its nearest ancestor that still nests (next to its parent, linked by the diamond). `replaced`: edges the nesting
 * draws instead; `tips`: their descriptions, for the child's tooltip.
 */
export function nestElements(kept, edges, model, { depth }) {
  const vparent = new Map();
  const made = new Map(); // child → edge that the nesting replaces
  const holds = (a, b) => { for (let c = a; c != null; c = vparent.get(c)) if (c === b) return true; return false; };
  for (const id of kept) {
    const p = model.elements.get(id)?.parent;
    if (p && kept.has(p)) vparent.set(id, p);
  }
  for (const e of edges) {
    if (e.derived || !NESTING.has(e.type) || !kept.has(e.from) || !kept.has(e.to)) continue;
    if (vparent.get(e.to) === e.from) { if (!made.has(e.to)) made.set(e.to, e); continue; }
    if (!vparent.has(e.to) && !holds(e.from, e.to)) { vparent.set(e.to, e.from); made.set(e.to, e); }
  }
  const level = new Map();
  const levelOf = id => {
    if (level.has(id)) return level.get(id);
    level.set(id, 0);
    const n = vparent.has(id) ? levelOf(vparent.get(id)) + 1 : 0;
    level.set(id, n);
    return n;
  };
  for (const id of kept) levelOf(id);
  const nestedIn = new Map();
  const replaced = new Set();
  const tips = new Map();
  const boxOf = id => (!vparent.has(id) ? null : depth == null || level.get(id) <= depth ? vparent.get(id) : boxOf(vparent.get(id)));
  for (const id of kept) {
    const box = boxOf(id);
    if (box) nestedIn.set(id, box);
    if (box && box === vparent.get(id) && made.has(id)) {
      const e = made.get(id);
      replaced.add(e.id);
      if (e.label) tips.set(id, e.label);
    }
  }
  return { nestedIn, replaced, tips, level };
}
```

Em `resolveArchimate`, logo depois de `const groups = frameGroups(model, gs, nodes);`:

```js
  const nesting = nestingSpec(spec.nesting);
  let outEdges = shownEdges;
  if (nesting.mode === 'nested') {
    const n = nestElements(new Set(nodes.map(x => x.id)), shownEdges, model, nesting);
    outEdges = shownEdges.filter(e => !n.replaced.has(e.id));
    for (const node of nodes) {
      if (n.nestedIn.has(node.id)) node.nestedIn = n.nestedIn.get(node.id);
      if (n.tips.has(node.id)) node.nestTip = n.tips.get(node.id);
    }
  }
```

e no objeto devolvido troque `edges: shownEdges` por `edges: outEdges` e acrescente `nesting,`. Nas arestas reais,
acrescente `label` já existe (`r.description ?? ''`), então a descrição da relação chega ao `tips`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/query-archimate.mjs tests/query.test.mjs
git commit -m "feat(archimate): nesting nas visões (edges | nested | depth)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 7: aninhamento visual — layout e renderização

**Files:**
- Modify: `scripts/lib/layout.mjs` (`amFrames`, `runAmElk`, `layoutArchimateMix`, `layoutArchimateStyled`, `layoutQuality`)
- Modify: `scripts/lib/render.mjs` (`amNode`, `viewSvg`, `viewData`, CSS)
- Test: `tests/layout.test.mjs`, `tests/render.test.mjs`

**Interfaces:**
- Consumes (Task 6): nós com `nestedIn`, `nestTip`; visão com `nesting`.
- Produces: nós dispostos com `isParent: true` nas caixas que contêm filhos (largura/altura vindas do ELK).

- [ ] **Step 1: Write the failing tests**

`tests/layout.test.mjs`:

```js
const odinNested = () => normalizeModel({ archlens: '2.0', name: 'Odin', model: {
  elements: [
    { id: 'plat', type: 'grouping', name: 'Mensageria' },
    { id: 'odin', type: 'application-component', name: 'Odin', c4: { kind: 'softwareSystem' }, group: 'plat' },
    { id: 'odin.api', type: 'application-component', name: 'odin-api', parent: 'odin', c4: { kind: 'container' } },
    { id: 'odin.worker', type: 'application-component', name: 'odin-message-worker', parent: 'odin', c4: { kind: 'container' } },
    { id: 'odin.api.rest', type: 'application-component', name: 'REST', parent: 'odin.api', c4: { kind: 'component' } },
    { id: 'svc', type: 'application-service', name: 'Envio de Notificações' },
    { id: 'crm', type: 'application-component', name: 'CRM', c4: { kind: 'softwareSystem' } },
    { id: 'kafka', type: 'system-software', name: 'Kafka' },
  ],
  relationships: [
    { from: 'odin.api', to: 'svc', type: 'realization' },
    { from: 'svc', to: 'crm', type: 'serving' },
    { from: 'kafka', to: 'odin.worker', type: 'serving' },
    { from: 'odin.api', to: 'odin.worker', type: 'flow' },
  ],
} });
const box = (laid, id) => laid.nodes.find(n => n.id === id);
const onBorder = (p, b) => Math.abs(p.x - b.x) < 2 || Math.abs(p.x - b.x - b.w) < 2 || Math.abs(p.y - b.y) < 2 || Math.abs(p.y - b.y - b.h) < 2;

for (const style of ['flow', 'bands-flow']) {
  test(`nested ArchiMate (${style}): children inside their parent, parents marked, edges start on the right boxes`, async () => {
    const view = resolveView(odinNested(), { key: 'n', notation: 'archimate', viewpoint: 'implementation-deployment', nesting: 'nested', groups: { frames: true }, layout: { style } });
    const laid = await layoutView(view);
    assert.ok(inside(box(laid, 'odin.api'), box(laid, 'odin')));
    assert.ok(inside(box(laid, 'odin.api.rest'), box(laid, 'odin.api')));
    assert.ok(inside(box(laid, 'odin.worker'), box(laid, 'odin')));
    assert.ok(box(laid, 'odin').isParent && box(laid, 'odin.api').isParent && !box(laid, 'odin.worker').isParent);
    assert.ok(!overlaps(box(laid, 'odin.api'), box(laid, 'odin.worker')));
    const frame = laid.frames.find(f => f.id === 'plat');
    assert.ok(inside(box(laid, 'odin'), frame), 'the parent sits in its grouping frame');
    for (const e of laid.edges) {
      assert.ok(e.points.length >= 2, e.id);
      assert.ok(onBorder(e.points[0], box(laid, e.from)) && onBorder(e.points.at(-1), box(laid, e.to)), `${style} ${e.id}`);
    }
  });
}

test('nested ArchiMate: "bands" falls back to bands-flow with a note; auto never picks bands', async () => {
  const spec = { key: 'n', notation: 'archimate', viewpoint: 'implementation-deployment', nesting: 'nested' };
  const laid = await layoutView(resolveView(odinNested(), { ...spec, layout: { style: 'bands' } }));
  assert.equal(laid.layoutStyle, 'bands-flow');
  assert.match(laid.layoutNote, /aninhamento/);
  const auto = await layoutView(resolveView(odinNested(), spec));
  assert.ok(!('bands' in auto.layoutScores));
});
```

`tests/render.test.mjs`:

```js
test('a nesting parent is drawn before its children, with its name at the top and the tooltip of the child', async () => {
  const m = normalizeModel({ archlens: '2.0', name: 'N', model: {
    elements: [
      { id: 'bus', type: 'application-component', name: 'Barramento' },
      { id: 'bus.a', type: 'application-component', name: 'Adapter' },
    ],
    relationships: [{ from: 'bus', to: 'bus.a', type: 'aggregation', description: 'reúne adaptadores' }],
  } });
  const laid = await layoutView(resolveView(m, { key: 'n', notation: 'archimate', viewpoint: 'application', nesting: 'nested' }));
  const html = renderHtml({ title: 'N', views: [laid] });
  const parentAt = html.indexOf('data-node="bus"'), childAt = html.indexOf('data-node="bus.a"');
  assert.ok(parentAt > 0 && parentAt < childAt, 'parent first');
  assert.match(html, /class="node am parent[^"]*" data-node="bus"/);
  assert.match(html, /aria-label="Adapter[^"]*reúne adaptadores/);
});
```

(Use os imports que `render.test.mjs` já tem para `normalizeModel`, `resolveView`, `layoutView`, `renderHtml`;
acrescente o que faltar.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/layout.test.mjs tests/render.test.mjs`
Expected: FAIL — os filhos não estão dentro dos pais; não há `isParent`.

- [ ] **Step 3: Layout** — em `layout.mjs`:

1. Constante e auxiliares, depois de `AM_FRAME_PAD`:

```js
const AM_NEST_PAD = '[top=46,left=22,bottom=22,right=22]';

/** id → ids nested directly in it (view order). */
function nestedKids(view) {
  const kids = new Map();
  for (const n of view.nodes) if (n.nestedIn) { if (!kids.has(n.nestedIn)) kids.set(n.nestedIn, []); kids.get(n.nestedIn).push(n.id); }
  return kids;
}

/** Layer a node is placed in: its outermost nesting box's (a nested child stays in its parent's band). */
function placeLayers(view) {
  const byId = new Map(view.nodes.map(n => [n.id, n]));
  const top = n => (n.nestedIn && byId.has(n.nestedIn) ? top(byId.get(n.nestedIn)) : n);
  return new Map(view.nodes.map(n => [n.id, top(n).layer]));
}

/** ELK node for `id`: a plain box, or a compound one holding its nested elements (at least a plain box's size). */
function amElkNode(id, boxes, kids, layoutOptions = {}) {
  const b = boxes.get(id);
  if (!kids.has(id)) return { id, width: b.w, height: b.h, layoutOptions };
  return {
    id, children: kids.get(id).map(c => amElkNode(c, boxes, kids)),
    layoutOptions: { 'elk.padding': AM_NEST_PAD, 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${b.w}, ${b.h})`, ...layoutOptions },
  };
}
```

2. `amFrames`: membros só entre os nós de topo — `view.nodes.filter(n => !n.nestedIn && n.layer === layer && n.group === g.id)`.
3. `runAmElk`: depois de `const boxes = …`, `const kids = nestedKids(view);`. Em `layoutOptions`, a linha do
   `hierarchyHandling` vira `...(frames.length || kids.size ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}),`.
   Os filhos da moldura passam a ser `f.members.map(id => amElkNode(id, boxes, kids))`, e os soltos
   `view.nodes.filter(n => !n.nestedIn && !framed.has(n.id)).map(n => amElkNode(n.id, boxes, kids, { 'elk.partitioning.partition': String(part.get(n.id)) }))`.
   No `extent`, use só nós de topo: `view.nodes.filter(n => !n.nestedIn && n.layer === layer)`. Nos `nodes` de saída:

```js
  const nodes = view.nodes.map(n => {
    const p = pos.get(n.id), b = boxes.get(n.id), parent = kids.has(n.id);
    return { ...n, x: p.x, y: p.y, w: parent ? p.width : b.w, h: parent ? p.height : b.h, lines: b.lines, ...(parent ? { isParent: true } : {}) };
  });
```

4. `layoutArchimateMix`: depois de `const boxes = …`, `const kids = nestedKids(view); const place = placeLayers(view);`.
   Troque `layerOf` por `place` (`const layerOf = place;` mantém o resto do código) e
   `const layers = view.layers.filter(l => view.nodes.some(n => place.get(n.id) === l));`. Em cada faixa:
   `const ids = view.nodes.filter(n => !n.nestedIn && place.get(n.id) === layer).map(n => n.id);`,
   `const set = new Set(view.nodes.filter(n => place.get(n.id) === layer).map(n => n.id));`, o `hierarchyHandling` com
   `bandFrames.length || ids.some(id => kids.has(id))`, filhos da moldura `f.members.map(id => amElkNode(id, boxes, kids))`
   e soltos `ids.filter(id => !framed.has(id)).map(id => amElkNode(id, boxes, kids))`. Em todo lugar que usa o tamanho de
   um nó a partir de `boxes.get(x).w`/`.h` depois do ELK (alinhamento e `node(id)`), use `local.get(x).width`/`.height`:

```js
  const node = id => { const i = bandIx.get(place.get(id)), p = local.get(id); return { x: off[i] + p.x, y: top[i] + p.y, w: p.width, h: p.height }; };
```

   Obstáculos do roteador só nas folhas (Decisão de detalhe 8):
   `const router = gridRouter(width, height, view.nodes.filter(n => !kids.has(n.id)).map(n => node(n.id)));`.
   Nos `nodes` de saída: `view.nodes.map(n => ({ ...n, ...node(n.id), lines: boxes.get(n.id).lines, ...(kids.has(n.id) ? { isParent: true } : {}) }))`.
5. `layoutArchimateStyled`: `const framed = (view.groups?.length ?? 0) > 0 || view.nodes.some(n => n.nestedIn);` e a
   nota vira `'o estilo "bands" não desenha molduras de agrupamento nem aninhamento; usei "bands-flow"'`.
6. `layoutQuality`: no laço de `through`, pule também as caixas que contêm uma das pontas:

```js
  const holder = new Map(laid.nodes.filter(n => n.nestedIn).map(n => [n.id, n.nestedIn]));
  const holds = (box, id) => { for (let c = holder.get(id); c; c = holder.get(c)) if (c === box) return true; return false; };
```

   (antes do laço) e `if (n.id === e.from || n.id === e.to || holds(n.id, e.from) || holds(n.id, e.to)) continue;`.

- [ ] **Step 4: Render** — em `render.mjs`:

`amNode`:

1. A classe ganha `parent` logo depois de `am`: na linha `const cls = \`node am l-${lv}…\``, troque o início por
   `` `node am${n.isParent ? ' parent' : ''} l-${lv}`` (o resto da linha fica igual).
2. A `tip` passa a terminar com `${n.nestTip ? `\n${n.nestTip}` : ''}`.
3. Logo depois de `if (sketchy(n)) shape = handDrawn(shape, n.id, { w, h });`, antes do `return` atual:

```js
  if (n.isParent) {
    // A nesting box: the element's own shape (lighter), name at the top left, icon at the top right; children on top.
    const shift = (n.change ? 26 : 0) + (n.pending?.length ? 26 : 0);
    return `<g class="${cls}" data-node="${esc(n.id)}" data-distance="${n.distance ?? ''}" style="--i:${i}" tabindex="0" role="button" aria-label="${esc(tip)}">`
      + shape
      + (icon ? `<g class="icon" transform="translate(${f(x + w - 36)},${f(y + 8)})">${icon}</g>` : '')
      + `<text class="title" x="${f(x + 14 + shift)}" y="${f(y + 28)}" font-size="17" font-weight="650">${esc(n.name)}</text>`
      + decorations(n, prefix, 'left') + '</g>';
  }
```

`viewSvg` — pais antes dos descendentes:

```js
  const depthOf = new Map();
  const byId = new Map(v.nodes.map(n => [n.id, n]));
  const depth = n => (depthOf.has(n.id) ? depthOf.get(n.id) : (depthOf.set(n.id, n.nestedIn && byId.has(n.nestedIn) ? depth(byId.get(n.nestedIn)) + 1 : 0), depthOf.get(n.id)));
  const ordered = [...v.nodes].sort((a, b) => depth(a) - depth(b));
  const nodes = ordered.map((n, i) => v.notation === 'c4' ? c4Node(n, i, prefix) : amNode(n, i, prefix)).join('');
```

`viewData` — nos nós, acrescente `nestedIn: n.nestedIn ?? null,`.

CSS (junto de `.node.am .shape{stroke-width:1.8}`): `.node.am.parent .shape{fill-opacity:.55}`.

- [ ] **Step 5: Run the tests and look at it**

Run: `npm test`
Expected: PASS.

Run (inspeção visual):

```bash
node --input-type=module -e "
  import { writeFileSync } from 'node:fs';
  import { normalizeModel } from './scripts/lib/model.mjs';
  import { resolveView } from './scripts/lib/query.mjs';
  import { layoutView } from './scripts/lib/layout.mjs';
  import { renderHtml } from './scripts/lib/render.mjs';
  import { toCanonical } from './scripts/lib/canonical.mjs';
  import { readFileSync } from 'node:fs';
  const m = normalizeModel(toCanonical(JSON.parse(readFileSync('tests/fixtures/shop.json', 'utf8'))).raw);
  const views = [];
  for (const nesting of ['edges', 'nested', { mode: 'nested', depth: 1 }]) views.push(await layoutView(resolveView(m, { key: JSON.stringify(nesting), notation: 'archimate', viewpoint: 'implementation-deployment', nesting })));
  writeFileSync((process.env.TMPDIR ?? '/tmp') + '/nesting-check.html', renderHtml({ title: 'nesting', views }));"
```

Abra `$TMPDIR/nesting-check.html` (ou `/tmp/nesting-check.html`) e confira: filhos dentro dos pais, nome do pai no topo, setas saindo de dentro das caixas.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/layout.mjs scripts/lib/render.mjs tests/layout.test.mjs tests/render.test.mjs
git commit -m "feat(render): aninhamento visual no ArchiMate (nós compostos no flow e no bands-flow)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 8: schemas, exemplo e documentação

**Files:**
- Modify: `scripts/gen-schemas.mjs`, `schemas/*.schema.json` (gerados)
- Modify: `examples/loja-online/architecture/views.json` (visão aninhada) e artefatos gerados
- Modify: `SKILL.md`, `references/c4.md`, `references/archimate.md`, `references/views.md`, `references/merge.md`,
  `references/knowledge-doc.md`, `references/repo-reading.md`, `docs/GUIA.md`, `README.md`, `CHANGELOG.md`,
  `docs/superpowers/roadmap.md`
- Test: `tests/model.test.mjs` (schemas)

**Interfaces:**
- Consumes: `C4_KIND_TYPES`, `C4_KINDS`, `ELEMENT_TYPES`, `RELATIONSHIP_TYPES` (registry); `FORMAT`.
- Produces: `buildSchemas()` com `model` (2.0 estrito), `delta` (vocabulário livre), `plan`, `view` (com `nesting`).

- [ ] **Step 1: Write the failing test** — em `tests/model.test.mjs`:

```js
test('schemas: the model is strict 2.0, the delta keeps the free vocabulary, views take nesting', async () => {
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  const s = buildSchemas();
  const el = s.model.$defs.element.properties;
  assert.ok(!el.type.enum.some(t => t.includes(':')));
  assert.ok(!('children' in el) && !('archimate' in el));
  assert.deepEqual(Object.keys(el.c4.properties), ['kind']);
  assert.ok(!s.model.$defs.relationship.properties.type.enum.includes('uses'));
  assert.equal(s.model.properties.archlens.pattern, '^2\\.\\d+$');
  assert.ok(s.model.properties.properties, 'property catalog');
  assert.ok(s.delta.$defs.element.properties.type.enum.includes('c4:container'));
  assert.ok(s.delta.$defs.relationship.properties.type.enum.includes('uses'));
  assert.ok(s.view.properties.nesting);
});
```

e ajuste os dois testes existentes de schema (`schemas accept "group"…`, `"group": null…`) — continuam valendo para
`s.model.$defs.element` e `s.delta.$defs.element`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/model.test.mjs`
Expected: FAIL — `el.type.enum` ainda tem `c4:*`.

- [ ] **Step 3: `gen-schemas.mjs`** — separe elemento/relação do modelo (2.0) dos do delta (livre):

```js
  const freeElementTypes = [...C4_KINDS.map(k => `c4:${k}`), ...Object.keys(ELEMENT_TYPES).flatMap(t => [`archimate:${t}`, t])];
  const freeRelTypes = ['uses', 'c4:uses', ...Object.keys(RELATIONSHIP_TYPES).flatMap(t => [`archimate:${t}`, t])];
  const propertyValue = { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }] };
  const element = {
    type: 'object', required: ['id', 'type'], additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 }, type: { enum: Object.keys(ELEMENT_TYPES) }, name: str, description: str, technology: str,
      tags: { type: 'array', items: str }, external: { type: 'boolean' },
      c4: { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { enum: Object.keys(C4_KIND_TYPES) } } },
      parent: str, group: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: propertyValue },
      owner: str, url: str, inferred: { type: 'boolean' }, confidence: { enum: ['alta', 'média', 'baixa', 'high', 'medium', 'low'] }, source: str,
      aliases: { type: 'array', items: str }, status, statusReason: str, sources,
    },
  };
  const relationship = { …(como hoje, com type: { enum: Object.keys(RELATIONSHIP_TYPES) } e properties: { type: 'object', additionalProperties: propertyValue })… };
  const deltaElement = {
    ...element, required: ['id'],
    properties: { ...element.properties, type: { enum: freeElementTypes },
      archimate: { enum: Object.keys(ELEMENT_TYPES).flatMap(t => [t, `archimate:${t}`]) },
      children: { type: 'array', items: { $ref: '#/$defs/element' } } },
  };
  const deltaRelationship = { ...relationship, properties: { ...relationship.properties, type: { enum: freeRelTypes } } };
```

No `model`: `archlens: { type: 'string', pattern: '^2\\.\\d+$' }` e
`properties: { description: 'property catalog (archlens.json)', type: 'object', additionalProperties: { type: 'object', additionalProperties: false, properties: { label: str, type: { enum: ['string', 'number', 'boolean', 'string[]'] }, values: { type: 'array' }, appliesTo: { type: 'array', items: str } } } }`.
No `delta`: `$defs: { element: deltaElement, relationship: deltaRelationship, source }`. Na `view`:
`nesting: { anyOf: [{ enum: ['edges', 'nested'] }, { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { enum: ['edges', 'nested'] }, depth: { type: 'integer', minimum: 1 } } }] }`.
Import `C4_KIND_TYPES` do registry. Rode `npm run schemas`.

- [ ] **Step 4: Exemplo** — acrescente a `examples/loja-online/architecture/views.json`:

```json
{
  "key": "aplicacao-aninhada",
  "notation": "archimate",
  "viewpoint": "application",
  "title": "Plataforma de E-commerce — containers dentro do sistema",
  "description": "A mesma camada de aplicação com os containers dentro do sistema (nesting) e os componentes ao lado, ligados pelo losango (depth 1).",
  "include": ["loja"],
  "nesting": { "mode": "nested", "depth": 1 }
}
```

Rode `node scripts/archlens.mjs doc examples/loja-online/architecture && npm run examples` e abra
`examples/loja-online/architecture/diagrams/architecture.html` na visão nova.

- [ ] **Step 5: Documentação**

- `SKILL.md`: no "Fluxo", passo 1: base 1.x → `E_STORE_FORMAT`; proponha `archlens migrate <base>` e **pergunte antes**.
  Nova seção curta "Formato 2.0": tipos ArchiMate, `c4.kind`, `parent`, relações ArchiMate; o vocabulário livre
  (`c4:*`, `uses`, `children`) continua aceito em deltas, prompts e scan. "Propriedades": `properties` com escalares ou
  listas; catálogo opcional em `archlens.json`; regra "propriedade para filtrar, elemento para atravessar" (sugira
  promover a `business-actor` + `assignment` quando o usuário pedir travessia por um valor). "Aninhamento": "dentro de",
  "aninhado", "caixas dentro de caixas" → `"nesting": "nested"`; "com o losango", "com setas de composição" → `edges`;
  `depth` para diagramas grandes.
- `references/c4.md`: tabela "Relação com ArchiMate" — container `database` = `application-component` com tag
  `database` (o conteúdo, quando conhecido, é `data-object` com `parent` no banco); `uses` → `serving` invertido ou
  `access`; kinds de tecnologia (`deploymentNode`/`infrastructureNode` em `node`, `device`, `system-software`,
  `technology-service`, `communication-network`); seção "C4 a partir de ArchiMate": intermediários e donos, seta
  derivada tracejada com "via", `"derive": false`.
- `references/archimate.md`: "Padrões de modelagem" com intermediários (o componente realiza o serviço, compõe a
  interface, é atribuído à função) e "Aninhamento" (o que aninha, um pai visual, `depth`, recuo do `bands`).
- `references/views.md`: `nesting` e `derive` na tabela de campos da view spec, com exemplo.
- `references/merge.md`: "Tradução na entrada" (tabela do spec, seção 2) e Decisões de detalhe 1–2.
- `references/knowledge-doc.md`: formato 2.0 (elemento e relação de exemplo), catálogo de propriedades, `migrate`.
- `references/repo-reading.md`: motores de banco por `serving`.
- `docs/GUIA.md` e `README.md`: onde mostram JSON do modelo, troque pelo formato 2.0 e cite o `migrate`.
- `CHANGELOG.md`, em `[Não lançado]`:

```markdown
### Mudado (incompatível)

- **Formato canônico 2.0**: a base guarda tipos ArchiMate, o perfil C4 em `c4.kind`, uma lista plana com `parent` e só
  relações ArchiMate. `c4:*`, `uses` e `children` continuam aceitos na entrada (prompt, delta, scan) e são traduzidos.
  Bases 1.x são recusadas com `E_STORE_FORMAT`; `archlens migrate <base>` converte, conferindo que o modelo não muda
  de sentido. Bancos de dados passam a ser `application-component` com a tag `database`.

### Adicionado

- Propriedades do usuário com listas de texto e catálogo opcional no `archlens.json` (`W_PROPERTY`).
- C4 gerado de modelos ArchiMate: setas derivadas através de serviços, interfaces e funções de aplicação.
- Aninhamento visual nas visões ArchiMate (`"nesting": "nested"`, com `depth`).
```

- `docs/superpowers/roadmap.md`: linha e.1 com status `feito` e "Entrega" `PR #<n> → develop-v2` (preencha com o
  número do PR quando abrir).

- [ ] **Step 6: Run everything**

Run: `npm test && node scripts/archlens.mjs check examples/loja-online/architecture && node scripts/archlens.mjs check examples/telemedicina/architecture && node scripts/archlens.mjs check examples/repos/architecture`
Expected: PASS e `✓ … em dia` nos três.

Run: `grep -rnE "c4:|'uses'|\"uses\"|children|archimate:" scripts/lib --include=*.mjs | grep -vE "scripts/lib/(canonical|canonical-legacy)\.mjs|scripts/lib/scan/|query-archimate.mjs:3[67]|layout.mjs|explain.mjs|render.mjs|query-c4.mjs"`
Expected: nada que leia o modelo com o vocabulário livre (critério 2 do spec). O `scan` emite vocabulário livre (é
entrada); `layout`/`render` usam `children` do ELK; `explain`/`render`/`query-c4` usam `uses` como tipo de **seta C4**.

- [ ] **Step 7: Commit**

```bash
git add scripts schemas examples SKILL.md references docs README.md CHANGELOG.md tests
git commit -m "docs: formato 2.0, migrate, propriedades, C4 derivado e aninhamento; schemas e exemplo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```
