# Contrato de conector (store v2) e conectores `json` e `markdown` — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um contrato de conector (`read`, `readSubgraph`, `version`, `apply(ops, { baseVersion })`, `history`) com
gravação por operações atômicas e versão otimista; o conector `json` atual reescrito sobre ele; um conector `markdown`
novo (uma pasta por tipo ArchiMate, um arquivo por elemento, aberto no Obsidian e importável no gbrain com um schema
pack gerado); e `archlens store convert` entre os dois.

**Architecture:** `scripts/lib/store/ops.mjs` define as nove operações, `diffRaw` (duas bases → ops), `applyOps`
(referência pura) e `contentVersion` (hash do conteúdo, independente de layout). `store/contract.mjs` define o contrato,
o `subgraphOf` padrão e `fileConnector`, que monta um conector a partir de "como ler a pasta" e "quais arquivos a base
deve ter", com escrita atômica (`store/atomic.mjs`). `json` (folder.mjs) e `markdown` (markdown.mjs + markdown-page.mjs +
gbrain-pack.mjs) são instâncias disso; `legacy` só lê. O CLI passa a usar só o contrato; o plano de merge grava
`storeVersion`.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test` + `node:assert/strict`, YAML vendorizado em `scripts/vendor/yaml`
(já usado pelo scan). Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-17-store-connectors-design.md`

## Global Constraints

- Node ≥ 18; sem dependências novas.
- Mensagens ao usuário em português; comentários de código em inglês; densidade de comentários como no código ao redor.
- Operações (lista fechada): `setManifest`, `upsertElement`, `removeElement`, `upsertRelationship`, `removeRelationship`,
  `putView`, `removeView`, `putNote`, `appendHistory`. Op desconhecida ou malformada: `E_STORE_OP`, nada gravado.
- `apply(ops, { baseVersion })`: `version()` ≠ `baseVersion` → `E_STORE_CONFLICT`, nada gravado. `baseVersion: null` =
  base ainda não existe.
- Versão: `sha256:` + hex de `canonicalJson` do conteúdo (manifesto, elementos por id, relações por id com ids gerados
  preenchidos, visões por key, changelog, notas); listas, mapas e textos vazios contam como ausentes. Mesma base em `json`
  e em `markdown` → mesma versão.
- `store.kind` no manifesto: ausente ou `json` → conector `json`; `markdown` → conector `markdown`; outro →
  `E_STORE_UNSUPPORTED`. `store` e `layout` são configuração do conector: não entram no raw nem na versão.
- Página markdown: `<tipo>/<id>.md`; wikilinks sempre `[[<tipo>/<id>|<nome>]]`; marcadores `<!-- archlens:begin -->` e
  `<!-- archlens:end -->`; texto depois do `end` é das pessoas e é preservado; tags derivadas `archlens/<tipo>`,
  `archlens/c4/<kind>`, `archlens/tag/<tag>`.
- Erros novos: `E_STORE_OP`, `E_STORE_CONFLICT`, `E_STORE_HISTORY`, `E_STORE_PARTIAL`, `E_STORE_MD`,
  `E_STORE_MD_PATH`, `E_STORE_MD_ID`, `E_STORE_MD_REL`, `E_STORE_CONVERT` (e `E_STORE_DUP_ID`, `E_STORE_UNSUPPORTED`,
  `E_UNKNOWN_REF` reaproveitados).
- Schema pack: arquivo `gbrain-pack.yaml` na raiz da base markdown, `api_version: gbrain-schema-pack-v1`, `name: archlens`.
- Branch `feat/store-connectors`. Commits terminam com:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM`
- Não commitar `graphify-out/`; depois de mudar código, `graphify update .` (se o comando existir).

## Decisões de detalhe (não estavam no spec; revisar)

1. **`store` e `layout` ficam fora do raw** (como hoje no `loadFolder`): são configuração do conector, o `setManifest`
   não os carrega e a versão não depende deles. O spec os listava entre os campos do `setManifest`.
2. **As notas entram na versão.** O spec listava manifesto, elementos, relações, visões e changelog; sem as notas, um
   `apply` que só muda uma nota não mudaria a versão.
3. **Igualdade de bases = mesma `contentVersion`.** Ordem de elementos, id explícito × gerado e campos vazios × ausentes
   não diferenciam bases. Os testes de ida e volta comparam versões.
4. **YAML escrito com o `stringify` do yaml vendorizado** (determinístico com a ordem de chaves que o archlens monta), em
   vez de um serializador próprio: o mesmo módulo já lê, e aspas em `[[…]]` são automáticas.
5. **O plano guarda `baseHash` e `storeVersion`.** `applyPlan` só confere o hash em planos sem `storeVersion` (antigos);
   nos novos, o conector confere a versão no `apply`.
6. **`migrate` no lugar continua escrevendo abaixo do contrato** (cópia da pasta + `saveFolder` com origens), porque
   converte de formato; o ramo legado → pasta passa a gravar por `apply`. O critério "o CLI só usa o contrato" vale para
   todo o resto.
7. **Um `.md` dentro de uma pasta de tipo é sempre uma página.** Um `README.md` sem frontmatter ali dá `E_STORE_MD`;
   anexos (não `.md`) ali sobrevivem.
8. **Inversos do schema pack:** `composed_into`, `aggregated_into`, `assigned_from`, `realized_by`, `served_by`,
   `accessed_by`, `influenced_by`, `triggered_by`, `flows_from`, `generalization_of`, `association` (simétrica).
9. **`store convert` regenera o `ARCHITECTURE.md`.** A base e a versão não mudam, mas o vault lê os elementos em outra
   ordem (por id, pais antes dos filhos), e o documento gerado segue a ordem do raw.

## Review Focus

1. **Texto escrito à mão numa página** sobrevive a qualquer `apply`, inclusive quando o elemento muda de tipo e o arquivo
   muda de pasta. Teste na Task 4.
2. **Renomear um elemento** (só o nome) atualiza os wikilinks nas páginas que apontam para ele e não move arquivo
   nenhum. Teste na Task 4.
3. **`.md` sem frontmatter numa pasta de tipo** → `E_STORE_MD` com o caminho do arquivo e nada é gravado; um `.md` fora
   das pastas de tipo é ignorado. Teste na Task 4.
4. **Outro processo grava a base entre o `merge --plan` e o `--apply`** → `E_STORE_CONFLICT`, base e `ARCHITECTURE.md`
   intactos. Teste na Task 3.
5. **`store convert` com arquivos desconhecidos** (`model/README.md` no json dividido; um `.png` numa pasta de tipo no
   markdown; `.obsidian/`; `diagrams/`) → todos sobrevivem à conversão de ida e volta. Teste na Task 5.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/store/ops.mjs` (novo) | `OPS`, `manifestOf`, `diffRaw`, `applyOps`, `contentVersion` |
| `scripts/lib/store/atomic.mjs` (novo) | `writeFilesAtomically(dir, changes, { check })` |
| `scripts/lib/store/contract.mjs` (novo) | `CONNECTOR_METHODS`, `checkConnector`, `subgraphOf`, `fileConnector`, `conflictError` |
| `scripts/lib/store/folder.mjs` | `loadFolder` (com `store`), `folderContents`, `saveFolder`, `readJson`, `readNotes`, `noteFiles`, `jsonConnector` |
| `scripts/lib/store/legacy.mjs` | `legacyConnector` (só leitura) |
| `scripts/lib/store/markdown-page.mjs` (novo) | `renderPage`, `parsePage`, `pagePath`, marcadores |
| `scripts/lib/store/markdown.mjs` (novo) | `readVault`, `vaultContents`, `markdownConnector` |
| `scripts/lib/store/gbrain-pack.mjs` (novo) | `PACK_FILE`, `gbrainPack(raw)` |
| `scripts/lib/store/convert.mjs` (novo) | `convertFolder(locator, to)` |
| `scripts/lib/store/index.mjs` | `openStore` por `store.kind`, `assertWritable` |
| `scripts/lib/merge.mjs` | `storeVersion` no plano; hash só para planos antigos |
| `scripts/archlens.mjs` | CLI sobre o contrato; `store convert` |
| `scripts/gen-schemas.mjs`, `schemas/plan.schema.json` | `storeVersion` |
| `tests/ops.test.mjs`, `tests/store-contract.test.mjs`, `tests/markdown-store.test.mjs` (novos) | testes |
| `examples/loja-online-vault/` (novo), docs | exemplo e documentação |

---

### Task 1: operações, versão e diff (`ops.mjs`)

**Files:**
- Create: `scripts/lib/store/ops.mjs`
- Test: `tests/ops.test.mjs`

**Interfaces:**
- Consumes: `canonicalJson(v)`, `relationshipIds(raw) → Map<relObject, id>` (`scripts/lib/merge.mjs`);
  `sortParentsFirst(elements)` (`scripts/lib/canonical.mjs`); `NOTE_NAMES` (`scripts/lib/doc.mjs`);
  `storeError(code, message, extra)` (`scripts/lib/store/errors.mjs`).
- Produces:
  - `OPS: string[]`
  - `manifestOf(raw) → object` (campos de topo sem `model`, `views`, `changelog`)
  - `diffRaw(before: {raw, notes} | null, after: {raw, notes}) → op[]`
  - `applyOps(base: {raw, notes} | null, ops) → { raw, notes }`
  - `contentVersion(base: {raw, notes} | null) → string | null`

- [ ] **Step 1: Write the failing tests** — `tests/ops.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffRaw, applyOps, contentVersion, manifestOf, OPS } from '../scripts/lib/store/ops.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const TODAY = { today: '2026-10-17' };
const delta = (model = {}, extra = {}) => ({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
  model: { elements: [], relationships: [], ...model }, ...extra });
const answerAll = plan => { for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'op' ? 'yes' : 'take'; return plan; };
const merged = (base, d) => applyPlan(base, answerAll(planMerge(base, d, TODAY)), TODAY).raw;
const roundTrip = (before, after) => applyOps(before, diffRaw(before, after));

// Pairs of bases the merge produces: new, removed, renamed, moved and retyped elements, parallel relationships, views, notes.
const pairs = () => {
  const base = shop();
  const withNotes = { raw: base, notes: { overview: 'Visão.' } };
  return [
    ['novo elemento e relação', withNotes, { raw: merged(base, delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }],
      relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses', description: 'grava' }] })), notes: { overview: 'Visão.' } }],
    ['remoção em cascata', withNotes, { raw: merged(base, delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] })), notes: { overview: 'Visão.' } }],
    ['rename e status', withNotes, { raw: merged(base, delta({}, { ops: [{ op: 'rename', id: 'loja.web', name: 'Vitrine' }, { op: 'status', id: 'k8s', status: 'deprecated' }] })), notes: { overview: 'Visão.' } }],
    ['mudança de pai', withNotes, { raw: merged(base, delta({ elements: [{ id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }, { id: 'loja.web', type: 'c4:container', parent: 'novo' }] })), notes: { overview: 'Visão.' } }],
    ['relações paralelas', withNotes, { raw: merged(base, delta({ relationships: [{ from: 'cliente', to: 'pagamentos', type: 'uses', description: 'lê' }, { from: 'cliente', to: 'pagamentos', type: 'uses', description: 'grava' }] })), notes: { overview: 'Visão.' } }],
    ['visão nova e nota mudada', withNotes, { raw: merged(base, delta({}, { views: [{ key: 'nova', notation: 'c4', level: 'landscape' }] })), notes: { overview: 'Visão nova.', notes: 'Riscos.' } }],
    ['base nova', null, { raw: base, notes: {} }],
  ];
};

for (const [name, before, after] of pairs()) {
  test(`applyOps(before, diffRaw(before, after)) reproduces after: ${name}`, () => {
    assert.equal(contentVersion(roundTrip(before, after)), contentVersion(after));
  });
}

test('diffRaw of a base with itself is empty, and contentVersion ignores order, explicit ids and empty fields', () => {
  const b = { raw: shop(), notes: { notes: 'N.' } };
  assert.deepEqual(diffRaw(b, structuredClone(b)), []);
  const shuffled = structuredClone(b);
  shuffled.raw.model.elements.reverse();
  shuffled.raw.model.relationships.forEach(r => { r.id ??= `${r.from}-${r.type}-${r.to}`; });
  shuffled.raw.model.elements[0].aliases = [];
  assert.equal(contentVersion(shuffled), contentVersion(b));
  assert.notEqual(contentVersion({ ...b, notes: { notes: 'Outra.' } }), contentVersion(b));
  assert.equal(contentVersion(null), null);
  assert.match(contentVersion(b), /^sha256:[0-9a-f]{64}$/);
});

test('diffRaw orders ops: manifest, relationship and element removals, element upserts parents first, relationships, views, notes, history', () => {
  const before = { raw: shop(), notes: {} };
  const after = { raw: merged(before.raw, delta({ elements: [{ id: 'novo.c', type: 'c4:container', name: 'C', parent: 'novo' }, { id: 'novo', type: 'c4:softwareSystem', name: 'Novo' }],
    relationships: [{ from: 'novo.c', to: 'loja.api', type: 'uses' }] }, { ops: [{ op: 'remove', id: 'pg' }], name: 'Outro nome' })), notes: { overview: 'O.' } };
  after.raw.name = 'Outro nome';
  const kinds = diffRaw(before, after).map(o => o.op);
  const firstOf = k => kinds.indexOf(k), lastOf = k => kinds.lastIndexOf(k);
  assert.equal(kinds[0], 'setManifest');
  assert.ok(lastOf('removeRelationship') < firstOf('removeElement'));
  assert.ok(lastOf('removeElement') < firstOf('upsertElement'));
  assert.ok(lastOf('upsertElement') < firstOf('upsertRelationship'));
  assert.ok(lastOf('upsertRelationship') < firstOf('putNote'));
  assert.equal(kinds.at(-1), 'appendHistory');
  const ups = diffRaw(before, after).filter(o => o.op === 'upsertElement').map(o => o.element.id);
  assert.ok(ups.indexOf('novo') < ups.indexOf('novo.c'), 'parents first');
  assert.ok(diffRaw(before, after).filter(o => o.op === 'upsertRelationship').every(o => typeof o.relationship.id === 'string'));
});

test('history only grows; bad ops are refused before anything changes', () => {
  const b = { raw: { ...shop(), changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'a' }] }, notes: {} };
  const rewritten = structuredClone(b);
  rewritten.raw.changelog[0].summary = 'outro';
  assert.throws(() => diffRaw(b, rewritten), e => e.code === 'E_STORE_HISTORY');
  for (const bad of [[{ op: 'apagarTudo' }], [{ op: 'upsertElement', element: { name: 'sem id' } }], [{ op: 'putNote', name: 'diario', text: 'x' }], 'nao-lista']) {
    assert.throws(() => applyOps(b, bad), e => e.code === 'E_STORE_OP', JSON.stringify(bad));
  }
  assert.deepEqual(OPS, ['setManifest', 'upsertElement', 'removeElement', 'upsertRelationship', 'removeRelationship', 'putView', 'removeView', 'putNote', 'appendHistory']);
  assert.ok(!('model' in manifestOf(b.raw)) && !('changelog' in manifestOf(b.raw)) && manifestOf(b.raw).name === 'Loja Mini');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/ops.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/store/ops.mjs'`.

- [ ] **Step 3: Implement** — `scripts/lib/store/ops.mjs`

```js
// Store operations: the closed list of writes every connector understands, the diff that produces them from two bases,
// the reference implementation that applies them, and the content version. Pure.
import { createHash } from 'node:crypto';
import { canonicalJson, relationshipIds } from '../merge.mjs';
import { sortParentsFirst } from '../canonical.mjs';
import { NOTE_NAMES } from '../doc.mjs';
import { storeError } from './errors.mjs';

export const OPS = ['setManifest', 'upsertElement', 'removeElement', 'upsertRelationship', 'removeRelationship', 'putView', 'removeView', 'putNote', 'appendHistory'];
const BODY = ['model', 'views', 'changelog'];

/** The manifest of a raw base: its top-level fields except the model, views and changelog. */
export const manifestOf = raw => Object.fromEntries(Object.entries(raw ?? {}).filter(([k]) => !BODY.includes(k)));

const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const elementsById = raw => new Map((raw?.model?.elements ?? []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
const viewsByKey = raw => new Map((raw?.views ?? []).filter(v => v && v.key != null).map(v => [v.key, v]));

/** id → relationship, generated ids filled in (as normalizeModel names them). */
function relationshipsById(raw) {
  const ids = relationshipIds(raw ?? {});
  const out = new Map();
  for (const r of raw?.model?.relationships ?? []) {
    if (!r || typeof r !== 'object') continue;
    const id = r.id ?? ids.get(r);
    out.set(id, { ...r, id });
  }
  return out;
}

/** Ops that turn `before` ({ raw, notes }, or null for a new base) into `after`. The history only grows. */
export function diffRaw(before, after) {
  const a = before?.raw ?? null;
  const b = after.raw;
  const ops = [];
  if (!a || !same(manifestOf(a), manifestOf(b))) ops.push({ op: 'setManifest', manifest: manifestOf(b) });
  const ra = relationshipsById(a), rb = relationshipsById(b);
  for (const id of ra.keys()) if (!rb.has(id)) ops.push({ op: 'removeRelationship', id });
  const ea = elementsById(a), eb = elementsById(b);
  for (const id of ea.keys()) if (!eb.has(id)) ops.push({ op: 'removeElement', id });
  for (const el of sortParentsFirst([...eb.values()])) if (!ea.has(el.id) || !same(ea.get(el.id), el)) ops.push({ op: 'upsertElement', element: el });
  for (const [id, r] of rb) if (!ra.has(id) || !same(ra.get(id), r)) ops.push({ op: 'upsertRelationship', relationship: r });
  const va = viewsByKey(a), vb = viewsByKey(b);
  for (const key of va.keys()) if (!vb.has(key)) ops.push({ op: 'removeView', key });
  for (const [key, v] of vb) if (!va.has(key) || !same(va.get(key), v)) ops.push({ op: 'putView', view: v });
  for (const name of NOTE_NAMES) {
    const text = after.notes?.[name];
    if (text != null && text !== before?.notes?.[name]) ops.push({ op: 'putNote', name, text });
  }
  const ha = a?.changelog ?? [], hb = b.changelog ?? [];
  if (hb.length < ha.length || !same(hb.slice(0, ha.length), ha)) {
    throw storeError('E_STORE_HISTORY', 'o histórico só cresce: uma rodada já registrada mudou ou sumiu');
  }
  for (const entry of hb.slice(ha.length)) ops.push({ op: 'appendHistory', entry });
  return ops;
}

/** Reference implementation: `base` ({ raw, notes } or null) with `ops` applied, in order. E_STORE_OP on a bad op. */
export function applyOps(base, ops) {
  if (!Array.isArray(ops)) throw storeError('E_STORE_OP', 'as operações precisam ser uma lista');
  const src = base?.raw ? structuredClone(base.raw) : { model: { elements: [], relationships: [] } };
  let manifest = manifestOf(src);
  const elements = [...(src.model?.elements ?? [])];
  const generated = relationshipIds(src);
  const relId = r => r?.id ?? generated.get(r);
  let relationships = [...(src.model?.relationships ?? [])];
  let views = src.views ? [...src.views] : undefined;
  let changelog = src.changelog ? [...src.changelog] : undefined;
  const notes = { ...(base?.notes ?? {}) };
  const bad = (i, why) => storeError('E_STORE_OP', `operação ${i + 1} (${ops[i]?.op ?? '?'}): ${why}`);
  const put = (list, item, keyOf) => {
    const at = list.findIndex(x => keyOf(x) === keyOf(item));
    if (at >= 0) list[at] = item; else list.push(item);
  };
  ops.forEach((op, i) => {
    switch (op?.op) {
      case 'setManifest':
        if (!op.manifest || typeof op.manifest !== 'object' || BODY.some(k => k in op.manifest)) throw bad(i, '"manifest" precisa ser um objeto sem model, views ou changelog');
        manifest = structuredClone(op.manifest);
        break;
      case 'upsertElement':
        if (typeof op.element?.id !== 'string') throw bad(i, '"element" precisa de "id"');
        put(elements, structuredClone(op.element), e => e?.id);
        break;
      case 'removeElement': {
        const at = elements.findIndex(e => e?.id === op.id);
        if (at >= 0) elements.splice(at, 1);
        break;
      }
      case 'upsertRelationship':
        if (typeof op.relationship?.id !== 'string') throw bad(i, '"relationship" precisa de "id"');
        put(relationships, structuredClone(op.relationship), relId);
        break;
      case 'removeRelationship':
        relationships = relationships.filter(r => relId(r) !== op.id);
        break;
      case 'putView':
        if (op.view?.key == null) throw bad(i, '"view" precisa de "key"');
        views ??= [];
        put(views, structuredClone(op.view), v => v?.key);
        break;
      case 'removeView':
        if (views) views = views.filter(v => v?.key !== op.key);
        break;
      case 'putNote':
        if (!NOTE_NAMES.includes(op.name) || typeof op.text !== 'string') throw bad(i, `uma nota precisa de "name" (${NOTE_NAMES.join(' | ')}) e "text"`);
        notes[op.name] = op.text;
        break;
      case 'appendHistory':
        if (!op.entry || typeof op.entry !== 'object') throw bad(i, '"entry" precisa ser uma rodada do changelog');
        changelog = [...(changelog ?? []), structuredClone(op.entry)];
        break;
      default:
        throw bad(i, `operação desconhecida; use ${OPS.join(' | ')}`);
    }
  });
  const raw = { ...manifest, model: { ...src.model, elements: sortParentsFirst(elements), relationships } };
  if (views !== undefined) raw.views = views;
  if (changelog !== undefined) raw.changelog = changelog;
  return { raw, notes };
}

/** Fields that say something: empty lists, maps and texts count as absent. */
const meaningful = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ''
  && !(Array.isArray(v) && !v.length) && !(v !== null && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
const byKey = key => (p, q) => (String(p[key]) < String(q[key]) ? -1 : String(p[key]) > String(q[key]) ? 1 : 0);

/** Version of a base ({ raw, notes }): a hash of its content that ignores order, layout and generated ids. */
export function contentVersion(base) {
  if (!base?.raw) return null;
  const { raw } = base;
  const content = {
    manifest: manifestOf(raw),
    elements: [...elementsById(raw).values()].map(meaningful).sort(byKey('id')),
    relationships: [...relationshipsById(raw).values()].map(meaningful).sort(byKey('id')),
    views: [...viewsByKey(raw).values()].sort(byKey('key')),
    changelog: raw.changelog ?? [],
    notes: Object.fromEntries(NOTE_NAMES.filter(n => base.notes?.[n] != null).map(n => [n, base.notes[n]])),
  };
  return `sha256:${createHash('sha256').update(canonicalJson(content)).digest('hex')}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ops.test.mjs && npm test`
Expected: PASS (nada ligado ainda; a suíte inteira continua verde).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/store/ops.mjs tests/ops.test.mjs
git commit -m "feat(store): operações, diff e versão de conteúdo da base

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 2: contrato, escrita atômica e conectores `json` e `legacy`

**Files:**
- Create: `scripts/lib/store/atomic.mjs`, `scripts/lib/store/contract.mjs`
- Modify: `scripts/lib/store/folder.mjs`, `scripts/lib/store/legacy.mjs`, `scripts/lib/store/index.mjs`
- Test: `tests/store-contract.test.mjs` (novo)

**Interfaces:**
- Consumes (Task 1): `applyOps`, `contentVersion`, `manifestOf`, `diffRaw`.
- Produces:
  - `writeFilesAtomically(dir, changes: Map<relPath, string | null>, { check }?)` — `null` apaga.
  - `CONNECTOR_METHODS`, `checkConnector(c) → c`, `subgraphOf(raw, { seeds, depth = 1, via }) → { raw }`,
    `conflictError(baseVersion, now)`, `fileConnector({ kind, dir, locator, describe, load, contents, after }) → connector`.
    `load(opts) → { raw, notes, ctx } | null`; `contents(next: {raw, notes}, cur) → Map<relPath, string | null>`.
  - `folder.mjs`: `readJson(path)`, `readNotes(dir) → notes`, `noteFiles(dir, notes) → Map`, `folderContents(dir, raw,
    { notes, origins, layout, store }) → Map`, `saveFolder(...)` (mesma assinatura de hoje, agora sobre `folderContents`),
    `loadFolder(dir, { anyFormat }) → { raw, notes, origins, layout, store }`, `jsonConnector(locator)`.
  - `legacy.mjs`: `legacyConnector(locator, { describe, error })`.
  - `index.mjs`: `openStore(locator)` devolve o conector; `assertWritable(store)` lança o erro de gravação do conector.
  - Conectores mantêm, só nesta task, `load(opts)` (= o que `loadFolder`/`loadLegacy` devolviam) e `save(raw, opts)`
    para o CLI atual; a Task 3 os remove.

- [ ] **Step 1: Write the failing tests** — `tests/store-contract.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { checkConnector, CONNECTOR_METHODS } from '../scripts/lib/store/contract.mjs';
import { diffRaw, contentVersion } from '../scripts/lib/store/ops.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const sample = () => ({ raw: { ...shop(), changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }] },
  notes: { overview: 'Propósito.', notes: 'Riscos.' } });

// Connector factories: an empty folder ready to become a base of that kind. Task 4 adds markdown.
export const KINDS = [
  ['json', dir => dir],
  ['json com model/', dir => { writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', layout: { model: 'model/' } })); return dir; }],
];
const fresh = prepare => { const dir = mkdtempSync(join(tmpdir(), 'archlens-contract-')); prepare(dir); return dir; };
const connectorAt = dir => checkConnector(openStore(resolveBase(dir, { create: true })));
const create = (dir, base = sample()) => {
  const c = connectorAt(dir);
  const cur = c.read();
  c.apply(diffRaw(cur, base), { baseVersion: c.version() });
  return connectorAt(dir);
};
const snapshot = dir => {
  const out = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push([p, readFileSync(p, 'utf8')]); } };
  walk(dir);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};
const TODAY = { today: '2026-10-17' };
const mergedWith = (base, delta) => {
  const plan = planMerge(base.raw, delta, TODAY);
  for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'op' ? 'yes' : 'take';
  return { raw: applyPlan(base.raw, plan, TODAY).raw, notes: base.notes };
};

for (const [kind, prepare] of KINDS) {
  test(`[${kind}] the connector offers the contract`, () => {
    const c = connectorAt(fresh(prepare));
    for (const m of CONNECTOR_METHODS) assert.equal(typeof c[m], 'function', m);
  });

  test(`[${kind}] read after apply returns the base, for a new base and for a merge`, () => {
    const dir = fresh(prepare);
    const c = create(dir);
    assert.equal(contentVersion(c.read()), contentVersion(sample()));
    const next = mergedWith(c.read(), { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' }, summary: 's',
      model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }], relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses' }] },
      ops: [{ op: 'remove', id: 'pagamentos' }] });
    c.apply(diffRaw(c.read(), next), { baseVersion: c.version() });
    assert.equal(contentVersion(connectorAt(dir).read()), contentVersion(next));
    assert.deepEqual(validateModel(connectorAt(dir).read().raw).errors, []);
  });

  test(`[${kind}] version changes with an effective apply and not with an empty one`, () => {
    const c = create(fresh(prepare));
    const v0 = c.version();
    assert.equal(c.apply([], { baseVersion: v0 }).version, v0);
    assert.equal(c.version(), v0);
    const v1 = c.apply([{ op: 'putNote', name: 'notes', text: 'Outro risco.' }], { baseVersion: v0 }).version;
    assert.notEqual(v1, v0);
    assert.equal(c.version(), v1);
  });

  test(`[${kind}] a stale version, a bad op or a failing write leave every file as it was`, () => {
    const dir = fresh(prepare);
    const c = create(dir);
    const before = snapshot(dir);
    assert.throws(() => c.apply([{ op: 'putNote', name: 'notes', text: 'x' }], { baseVersion: 'sha256:velha' }), e => e.code === 'E_STORE_CONFLICT');
    assert.throws(() => c.apply([{ op: 'putNote', name: 'notes', text: 'x' }, { op: 'apagar' }], { baseVersion: c.version() }), e => e.code === 'E_STORE_OP');
    assert.deepEqual(snapshot(dir), before);
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      // Read-only folders (the base and notes/, where the note lives): the first temp file already fails.
      const dirs = [dir, join(dir, 'notes')];
      for (const d of dirs) chmodSync(d, 0o555);
      try { assert.throws(() => c.apply([{ op: 'putNote', name: 'notes', text: 'x' }], { baseVersion: c.version() })); } finally { for (const d of dirs) chmodSync(d, 0o755); }
      assert.deepEqual(snapshot(dir), before);
    }
  });

  test(`[${kind}] history returns the rounds in order`, () => {
    const c = create(fresh(prepare));
    const entry = n => ({ id: `2026-10-17-0${n}`, date: '2026-10-17', summary: `r${n}`, added: [], changed: [], status: {}, removed: [], decisions: [] });
    c.apply([{ op: 'appendHistory', entry: entry(1) }], { baseVersion: c.version() });
    c.apply([{ op: 'appendHistory', entry: entry(2) }], { baseVersion: c.version() });
    assert.deepEqual(c.history().map(e => e.summary), ['início', 'r1', 'r2']);
  });

  test(`[${kind}] readSubgraph follows seeds, depth, via and parents, and the result validates`, () => {
    const c = create(fresh(prepare));
    const ids = q => c.readSubgraph(q).raw.model.elements.map(e => e.id).sort();
    assert.deepEqual(ids({ seeds: ['loja.api.checkout'], depth: 0 }), ['loja', 'loja.api', 'loja.api.checkout']);
    const one = ids({ seeds: ['loja.api.checkout'], depth: 1 });
    for (const id of ['loja.db', 'pagamentos', 'app-svc-checkout', 'loja.api']) assert.ok(one.includes(id), id);
    assert.ok(!ids({ seeds: ['loja.api.checkout'], depth: 1, via: ['realization'] }).includes('pagamentos'));
    assert.deepEqual(validateModel(c.readSubgraph({ seeds: ['loja.api.checkout'], depth: 1 }).raw).errors, []);
    assert.throws(() => c.readSubgraph({ seeds: ['nada'] }), e => e.code === 'E_UNKNOWN_REF');
  });

  test(`[${kind}] files the base does not own survive any apply`, () => {
    const dir = fresh(prepare);
    const c = create(dir);
    mkdirSync(join(dir, 'diagrams')); writeFileSync(join(dir, 'diagrams', 'a.html'), '<html></html>');
    mkdirSync(join(dir, '.obsidian')); writeFileSync(join(dir, '.obsidian', 'app.json'), '{}');
    writeFileSync(join(dir, 'solto.md'), '# Solto\n');
    const empty = { raw: { ...c.read().raw, model: { elements: [], relationships: [] }, views: [] }, notes: c.read().notes };
    c.apply(diffRaw(c.read(), empty), { baseVersion: c.version() });
    for (const f of ['diagrams/a.html', '.obsidian/app.json', 'solto.md']) assert.ok(existsSync(join(dir, f)), f);
  });
}

test('a manifest with an unknown store kind is refused', () => {
  const dir = fresh(d => writeFileSync(join(d, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'neo4j' } })));
  assert.throws(() => openStore(resolveBase(dir)), e => e.code === 'E_STORE_UNSUPPORTED');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/store-contract.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/store/contract.mjs'`.

- [ ] **Step 3: `scripts/lib/store/atomic.mjs`**

```js
// All-or-nothing writes of a set of files inside a base folder: new contents go to temp files first, the caller's check
// runs right before the swap (a concurrent writer changes the version), then the renames and deletions happen.
import { writeFileSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { storeError } from './errors.mjs';

/** `changes`: relative path → new text, or null to delete. Throws before touching any file if a write or the check fails. */
export function writeFilesAtomically(dir, changes, { check } = {}) {
  const temps = [];
  try {
    for (const [rel, text] of changes) {
      if (text == null) continue;
      const path = join(dir, rel);
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${process.pid}`;
      writeFileSync(tmp, text);
      temps.push([tmp, path]);
    }
    check?.();
  } catch (e) {
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    throw e;
  }
  const done = [];
  try {
    for (const [tmp, path] of temps) { renameSync(tmp, path); done.push(path); }
    for (const [rel, text] of changes) if (text == null) { rmSync(join(dir, rel), { force: true }); done.push(join(dir, rel)); }
  } catch (e) {
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    throw storeError('E_STORE_PARTIAL', `gravação interrompida depois de trocar ${done.length} arquivo(s) (${done.map(p => relative(dir, p)).join(', ') || 'nenhum'}): ${e.message}`);
  }
}
```

- [ ] **Step 4: `scripts/lib/store/contract.mjs`**

```js
// The connector contract (store v2): what every store adapter offers, the default subgraph reader, and fileConnector,
// which builds a connector from "how to read the base folder" and "which files the base should have".
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyOps, contentVersion, manifestOf } from './ops.mjs';
import { writeFilesAtomically } from './atomic.mjs';
import { storeError } from './errors.mjs';

export const CONNECTOR_METHODS = ['describe', 'read', 'readSubgraph', 'version', 'apply', 'history'];
export const CONNECTOR_KINDS = ['json', 'markdown', 'legacy'];

export function checkConnector(c) {
  if (!CONNECTOR_KINDS.includes(c?.kind)) throw new Error(`conector de tipo desconhecido: ${c?.kind}`);
  for (const m of CONNECTOR_METHODS) if (typeof c[m] !== 'function') throw new Error(`o conector ${c.kind} não tem ${m}()`);
  return c;
}

const short = v => (v ? String(v).replace(/^sha256:/, '').slice(0, 12) : 'base inexistente');
export const conflictError = (baseVersion, now) => storeError('E_STORE_CONFLICT',
  `a base mudou depois que as mudanças foram calculadas (${short(baseVersion)} → ${short(now)}); nada foi gravado. `
  + 'Gere o plano de novo com "archlens merge --plan"');

/**
 * The part of `raw` reachable from `seeds` in `depth` hops over relationships (of the types in `via`, all when absent)
 * and parent links, plus the ancestors and groupings of what was reached, so the result validates.
 */
export function subgraphOf(raw, { seeds = [], depth = 1, via } = {}) {
  const els = new Map((raw.model?.elements ?? []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  for (const s of seeds) if (!els.has(s)) throw storeError('E_UNKNOWN_REF', `"${s}" não existe na base`);
  const allowed = via ? new Set(via) : null;
  const next = new Map();
  const link = (a, b) => { if (!next.has(a)) next.set(a, new Set()); next.get(a).add(b); };
  for (const r of raw.model?.relationships ?? []) {
    if (r && els.has(r.from) && els.has(r.to) && (!allowed || allowed.has(r.type))) { link(r.from, r.to); link(r.to, r.from); }
  }
  for (const e of els.values()) if (e.parent != null && els.has(e.parent)) { link(e.id, e.parent); link(e.parent, e.id); }
  const keep = new Set(seeds);
  let frontier = [...seeds];
  for (let d = 0; d < depth; d++) {
    const found = [];
    for (const id of frontier) for (const x of next.get(id) ?? []) if (!keep.has(x)) { keep.add(x); found.push(x); }
    frontier = found;
  }
  for (const id of [...keep]) {
    for (let p = els.get(id)?.parent; p != null && els.has(p) && !keep.has(p); p = els.get(p).parent) keep.add(p);
  }
  for (const id of [...keep]) { const g = els.get(id)?.group; if (g != null && els.has(g)) keep.add(g); }
  return { raw: { ...manifestOf(raw), model: {
    elements: (raw.model?.elements ?? []).filter(e => keep.has(e?.id)),
    relationships: (raw.model?.relationships ?? []).filter(r => keep.has(r?.from) && keep.has(r?.to)),
  } } };
}

/**
 * A connector over a base folder. `load(opts)` reads it ({ raw, notes, ctx } or null when there is no base);
 * `contents(next, cur)` lists every file the base should have (relative path → text, null to delete); `after(next)`
 * runs once the files are in place. apply writes only the files whose text changes, all or nothing.
 */
export function fileConnector({ kind, dir, locator, describe, load, contents, after }) {
  const c = {
    kind, writable: true, locator,
    describe: () => describe,
    read(opts) { const r = load(opts); return r && { raw: r.raw, notes: r.notes }; },
    readSubgraph(query) {
      const r = c.read();
      if (!r) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${describe}`);
      return subgraphOf(r.raw, query);
    },
    version() { return contentVersion(c.read()); },
    history() { return c.read()?.raw.changelog ?? []; },
    apply(ops, { baseVersion = null } = {}) {
      const cur = load();
      const now = contentVersion(cur);
      if (now !== baseVersion) throw conflictError(baseVersion, now);
      const next = applyOps(cur, ops);
      const changes = new Map();
      for (const [rel, text] of contents(next, cur)) {
        const path = join(dir, rel);
        const exists = existsSync(path);
        if (text === null ? exists : !(exists && readFileSync(path, 'utf8') === text)) changes.set(rel, text);
      }
      writeFilesAtomically(dir, changes, { check: () => { const v = contentVersion(load()); if (v !== now) throw conflictError(baseVersion, v); } });
      after?.(next);
      return { version: contentVersion(next) };
    },
  };
  return c;
}
```

- [ ] **Step 5: `folder.mjs` — conteúdo como mapa de arquivos e o conector `json`**

1. Exporte `readJson` (troque `function readJson` por `export function readJson`).
2. `loadFolder`: troque o teste de `store` por

```js
  if (store !== undefined && store?.kind !== 'json') {
    throw storeError('E_STORE_UNSUPPORTED', `"store" em ${MANIFEST} indica o conector "${store?.kind}"; esta pasta não é uma base json`);
  }
```

   troque o bloco de leitura de notas por `const notes = readNotes(dir);` e devolva `{ raw, notes, origins, layout, store }`.
3. Acrescente, antes de `saveFolder`:

```js
/** The notes of a base folder (notes/<name>.md), without the trailing newline. */
export function readNotes(dir) {
  const notes = {};
  for (const name of NOTE_NAMES) {
    const p = join(dir, 'notes', `${name}.md`);
    if (existsSync(p)) notes[name] = readFileSync(p, 'utf8').replace(/\n$/, '');
  }
  return notes;
}

/** Note files for `notes`; a note file without its trailing newline that already holds the note stays as written. */
export function noteFiles(dir, notes = {}) {
  const files = new Map();
  for (const name of NOTE_NAMES) {
    if (notes[name] == null) continue;
    const rel = `notes/${name}.md`;
    const p = join(dir, rel);
    files.set(rel, existsSync(p) && readFileSync(p, 'utf8') === notes[name] ? notes[name] : `${notes[name]}\n`);
  }
  return files;
}
```

4. Troque `saveFolder` por `folderContents` + `saveFolder`: o corpo atual de `saveFolder` até o `for` das relações vira o
   corpo de `folderContents(dir, raw, { notes = {}, origins, layout, store } = {})`, que **não escreve**: termina com

```js
  const files = new Map();
  files.set(MANIFEST, json({ ...top, ...(store ? { store } : {}), ...(layout ? { layout } : {}) }));
  for (const [rel, content] of parts) files.set(rel, json(content));
  if (views !== undefined) files.set('views.json', json(views));
  if (changelog !== undefined) files.set('changelog.json', json(changelog));
  for (const [rel, text] of noteFiles(dir, notes)) files.set(rel, text);
  return files;
}

export function saveFolder(dir, raw, opts = {}) {
  for (const [rel, text] of folderContents(dir, raw, opts)) writeIfChanged(join(dir, rel), text);
}
```

5. No fim do arquivo:

```js
/** The json connector: model.json (or model/*.json) next to the manifest, views, changelog and notes. */
export function jsonConnector(locator, describe) {
  const dir = locator.path;
  const load = opts => (existsSync(join(dir, MANIFEST)) ? toBase(loadFolder(dir, opts)) : null);
  const c = fileConnector({
    kind: 'json', dir, locator, describe, load,
    contents: (next, cur) => folderContents(dir, next.raw, { notes: next.notes, ...cur?.ctx }),
  });
  // Until the CLI moves to the contract (next task): the old load/save.
  c.load = opts => (existsSync(join(dir, MANIFEST)) ? loadFolder(dir, opts) : { raw: null, notes: {}, origins: null, layout: undefined });
  c.save = (raw, { notes, origins, layout } = {}) => {
    const cur = existsSync(join(dir, MANIFEST)) ? loadFolder(dir, { anyFormat: true }) : null;
    saveFolder(dir, raw, { notes, origins: origins ?? cur?.origins, layout: layout ?? cur?.layout, store: cur?.store });
  };
  return c;
}

const toBase = ({ raw, notes, origins, layout, store }) => ({ raw, notes, ctx: { origins, layout, store } });
```

   (import `fileConnector` de `./contract.mjs`.)

- [ ] **Step 6: `legacy.mjs` — `legacyConnector`**

```js
/** The old single-file base, read only: apply refuses with `error()`. */
export function legacyConnector(locator, { describe, error }) {
  const read = opts => { const { raw, keeps } = loadLegacy(locator.path, opts); return { raw, notes: legacyNotes(raw, keeps) }; };
  return {
    kind: 'legacy', writable: false, locator,
    describe: () => describe,
    read,
    readSubgraph: query => subgraphOf(read().raw, query),
    version: () => contentVersion(read()),
    history: () => read().raw.changelog ?? [],
    apply() { throw error(); },
    // Until the CLI moves to the contract (next task).
    load: opts => ({ ...read(opts), origins: null, layout: undefined }),
    save() { throw error(); },
  };
}
```

   (imports: `subgraphOf` de `./contract.mjs`, `contentVersion` de `./ops.mjs`.)

- [ ] **Step 7: `index.mjs` — escolha do conector**

Troque `openStore` por:

```js
const legacyError = locator => () => storeError('E_STORE_LEGACY',
  `esta base está no formato antigo (bloco archlens-json no .md); rode "archlens migrate ${rel(locator.path)}" para convertê-la para a pasta architecture/`);

/** The connector `store.kind` names in the manifest (json when there is no manifest or no store). */
function folderKind(dir) {
  const p = join(dir, MANIFEST);
  const kind = existsSync(p) ? readJson(p).store?.kind ?? 'json' : 'json';
  if (kind !== 'json') {
    throw storeError('E_STORE_UNSUPPORTED', `"store.kind" "${kind}" em ${rel(p)} ainda não é suportado; use "json"`);
  }
  return kind;
}

export function openStore(locator) {
  if (locator.kind !== 'folder') return legacyConnector(locator, { describe: `${rel(locator.path)} (formato antigo)`, error: legacyError(locator) });
  folderKind(locator.path);
  return jsonConnector(locator, `${rel(locator.path)}/`);
}

/** Throws the connector's own refusal when it cannot write (the old .md base). */
export function assertWritable(store) {
  if (!store.writable) store.apply([]);
}
```

(imports: `jsonConnector`, `readJson` de `./folder.mjs`; `legacyConnector` de `./legacy.mjs`; remova o import de
`loadFolder`/`saveFolder`/`loadLegacy`/`legacyNotes` que não for mais usado. A Task 4 acrescenta `markdown` a
`folderKind`.)

- [ ] **Step 8: Run the tests**

Run: `node --test tests/store-contract.test.mjs && npm test`
Expected: PASS (o CLI ainda usa `load`/`save`, mantidos nesta task).

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/store tests/store-contract.test.mjs
git commit -m "feat(store): contrato de conector com escrita atômica; conectores json e legacy sobre ele

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 3: CLI sobre o contrato e `storeVersion` no plano

**Files:**
- Modify: `scripts/archlens.mjs`, `scripts/lib/merge.mjs:61-78`, `scripts/gen-schemas.mjs:131-133`, `schemas/plan.schema.json`
- Modify: `scripts/lib/store/folder.mjs`, `scripts/lib/store/legacy.mjs` (remover `load`/`save` temporários)
- Test: `tests/cli.test.mjs`, `tests/merge.test.mjs`, `tests/store.test.mjs`, `tests/examples.test.mjs`

**Interfaces:**
- Consumes (Tasks 1–2): conector (`read`, `version`, `apply`, `history`, `writable`), `assertWritable(store)`,
  `diffRaw`, `contentVersion`, `loadFolder`/`saveFolder` (só no `migrate` no lugar).
- Produces: `planMerge(baseRaw, delta, { base, answers, storeVersion })` grava `plan.storeVersion` quando a opção vem
  (inclusive `null`); `applyPlan` confere `baseHash` só quando o plano não tem `storeVersion`.

- [ ] **Step 1: Write the failing tests**

`tests/merge.test.mjs`:

```js
test('a plan records the store version it was made against; only plans without it check the hash', () => {
  const base = shop();
  const plan = planMerge(base, delta({ elements: [{ id: 'loja.x', type: 'c4:container', name: 'X', parent: 'loja' }] }), { ...TODAY, storeVersion: 'sha256:abc' });
  assert.equal(plan.storeVersion, 'sha256:abc');
  const changed = structuredClone(base);
  changed.name = 'Outra';
  assert.doesNotThrow(() => applyPlan(changed, plan, TODAY), 'the connector checks the version, not applyPlan');
  const old = planMerge(base, delta({ elements: [{ id: 'loja.y', type: 'c4:container', name: 'Y', parent: 'loja' }] }), TODAY);
  assert.equal('storeVersion' in old, false);
  assert.throws(() => applyPlan(changed, old, TODAY), e => e.code === 'E_PLAN_STALE');
});
```

`tests/cli.test.mjs`:

```js
test('merge --apply refuses a plan made before another change to the base, and writes nothing', () => {
  const dir = setup();
  writeFileSync(join(dir, 'a.json'), JSON.stringify({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'a' }, model: { elements: [{ id: 'loja.a', type: 'c4:container', name: 'A', parent: 'loja' }] } }));
  writeFileSync(join(dir, 'b.json'), JSON.stringify({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'b' }, model: { elements: [{ id: 'loja.b', type: 'c4:container', name: 'B', parent: 'loja' }] } }));
  assert.equal(run(['merge', 'architecture', 'a.json', '--plan', 'pa.json'], dir).status, 0);
  assert.equal(run(['merge', 'architecture', 'b.json', '--plan', 'pb.json'], dir).status, 0);
  assert.match(readFileSync(join(dir, 'pa.json'), 'utf8'), /"storeVersion": "sha256:/);
  assert.equal(run(['merge', 'architecture', '--apply', 'pa.json'], dir).status, 0);
  const before = snapshot(dir), doc = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  const r = run(['merge', 'architecture', '--apply', 'pb.json'], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E_STORE_CONFLICT[\s\S]*merge --plan/);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), doc);
});

test('a plan made by an older archlens (baseHash only) still applies', () => {
  const dir = setup();
  writeFileSync(join(dir, 'a.json'), JSON.stringify({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'a' }, model: { elements: [{ id: 'loja.a', type: 'c4:container', name: 'A', parent: 'loja' }] } }));
  assert.equal(run(['merge', 'architecture', 'a.json', '--plan', 'p.json'], dir).status, 0);
  const plan = JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8'));
  delete plan.storeVersion;
  writeFileSync(join(dir, 'p.json'), JSON.stringify(plan));
  const r = run(['merge', 'architecture', '--apply', 'p.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(model(dir).elements.some(e => e.id === 'loja.a'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/merge.test.mjs tests/cli.test.mjs`
Expected: FAIL — `plan.storeVersion` é `undefined`; o segundo `--apply` passa com `E_PLAN_STALE` em vez de `E_STORE_CONFLICT`
ou regrava a base.

- [ ] **Step 3: `merge.mjs`** — em `planContext`, receba `storeVersion` nas opções
(`function planContext(baseRaw, delta, { base = 'ARCHITECTURE.md', today, answers, storeVersion } = {})`) e monte o plano
com `...(storeVersion !== undefined ? { storeVersion } : {})` logo depois de `baseHash`. Em `applyPlan`, troque a linha do
`E_PLAN_STALE` por:

```js
  // Plans made against a connector carry its version, which the connector checks when it applies the ops.
  if (!('storeVersion' in plan) && hashRaw(baseRaw) !== plan.baseHash) throw mergeError('E_PLAN_STALE', 'a base mudou depois que o plano foi gerado; rode "archlens merge --plan" de novo');
```

`gen-schemas.mjs`: no `plan`, acrescente `storeVersion: { type: ['string', 'null'] }` às `properties`. Rode `npm run schemas`.

- [ ] **Step 4: CLI** — em `scripts/archlens.mjs`:

1. Imports: `import { resolveBase, openStore, frontmatterSource, MANIFEST, assertWritable as storeWritable } from './lib/store/index.mjs';`,
   `import { diffRaw } from './lib/store/ops.mjs';`, mantenha `saveFolder`, `loadFolder` (para o `migrate` no lugar).
2. Helpers:

```js
function loadBase(store, opts) {
  try { return store.read(opts) ?? { raw: null, notes: {} }; } catch (e) { fail(e.message); }
}

function assertWritable(store) {
  try { storeWritable(store); } catch (e) { fail(e.message); }
}

/** Writes `next` over what the store holds at `baseVersion`, by ops; exits with the connector's refusal. */
function writeBase(store, before, next, baseVersion) {
  try { return store.apply(diffRaw(before, next), { baseVersion }); } catch (e) { fail(e.message, e.code === 'E_STORE_CONFLICT' ? 2 : 1); }
}
```

3. `loadPreview`: troque o aviso do `baseHash` por

```js
  const stale = 'storeVersion' in doc ? doc.storeVersion !== store.version() : doc.baseHash && doc.baseHash !== hashRaw(baseRaw);
  if (args.plan && stale) console.warn('  aviso: a base mudou depois deste plano; a prévia usa a base atual');
```

4. `merge`: no começo do `case`, `const loaded = loadBase(store); const { raw: baseRaw, notes } = loaded; const startVersion = store.version();`.
   `--plan`: `planMerge(baseRaw, delta, { base: basename(store.locator.path), answers, storeVersion: startVersion })`.
   `--apply`: troque o bloco a partir de `assertWritable(store);` por

```js
        assertWritable(store);
        const plan = readJson(args.apply);
        if ('storeVersion' in plan && plan.storeVersion !== startVersion) {
          fail(`E_STORE_CONFLICT: a base mudou depois que o plano foi gerado; nada foi gravado. Gere o plano de novo com "archlens merge --plan"`, 2);
        }
        let res;
        try { res = applyPlan(baseRaw, plan); } catch (e) {
          if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
          fail(e.message, 2);
        }
        if (!res.entry) { console.log('= nada mudou; a base não foi regravada'); break; }
        assertDocOwned(store);
        writeBase(store, baseRaw ? loaded : null, { raw: res.raw, notes }, startVersion);
        const saved = loadBase(store); // the document follows what is on disk
```

   (o resto do ramo — `writeDoc`, mensagens — fica igual.)
5. `migrate`, ramo legado → pasta: troque `dest.save(res.raw, { notes });` por
   `writeBase(dest, null, { raw: res.raw, notes }, null);` e `dest.load().raw` por `dest.read().raw`. Ramo no lugar: troque
   `loaded = src.load({ anyFormat: true })` por
   `loaded = loc.kind === 'folder' ? loadFolder(loc.path, { anyFormat: true }) : src.read({ anyFormat: true })` (o ramo no
   lugar continua usando `loaded.origins`/`loaded.layout` e `saveFolder` na cópia, Decisão de detalhe 6), e
   `const back = dest.load();` por `const back = dest.read();`.
6. `scan`: `const loaded = st.load();` → `const loaded = st.read() ?? { raw: null };`.
7. Remova `c.load`/`c.save` de `jsonConnector` e `load`/`save` de `legacyConnector` (Task 2 os marcou como temporários).

- [ ] **Step 5: Adapt the tests that used `load`/`save`**

`tests/examples.test.mjs` e `tests/store.test.mjs`: `store.load()` → `store.read()`; `store.save(raw, { notes })` →
`store.apply(diffRaw(store.read(), { raw, notes }), { baseVersion: store.version() })` (import `diffRaw`). Onde um teste
lia `origins`/`layout` do `load()`, use `loadFolder(dir)` diretamente (função do adaptador).

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

Run: `grep -nE "\.load\(|\.save\(" scripts/archlens.mjs scripts/lib/*.mjs scripts/lib/scan/*.mjs`
Expected: nenhuma ocorrência (critério de sucesso 1; `loadFolder`/`saveFolder` só no `migrate` no lugar).

- [ ] **Step 7: Commit**

```bash
git add scripts schemas tests
git commit -m "feat(cli): base lida e gravada pelo contrato; plano guarda a versão do store (E_STORE_CONFLICT)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 4: conector `markdown` e schema pack do gbrain

**Files:**
- Create: `scripts/lib/store/markdown-page.mjs`, `scripts/lib/store/markdown.mjs`, `scripts/lib/store/gbrain-pack.mjs`
- Modify: `scripts/lib/store/index.mjs` (`folderKind` aceita `markdown`)
- Test: `tests/markdown-store.test.mjs` (novo), `tests/store-contract.test.mjs` (`KINDS` ganha `markdown`)

**Interfaces:**
- Consumes: `fileConnector`, `subgraphOf` (Task 2); `readJson`, `readNotes`, `noteFiles`, `MANIFEST` (folder.mjs);
  `ELEMENT_TYPES`, `RELATIONSHIP_TYPES` (registry); `sortParentsFirst`, `isCanonicalFormat`, `FORMAT` (canonical);
  `parse`, `stringify` de `scripts/vendor/yaml/index.js`.
- Produces:
  - `markdown-page.mjs`: `BEGIN`, `END`, `pagePath(el) → "<type>/<id>.md"`,
    `renderPage(el, { outgoing, children, info, userText }) → string`,
    `parsePage(text, rel) → { element, relationships, userText }`. `info(id) → { type, name } | undefined`.
  - `markdown.mjs`: `readVault(dir, { anyFormat }) → { raw, notes, ctx: { pages: Map<id, { rel, userText }> } }`,
    `vaultContents(dir, next, cur) → Map`, `markdownConnector(locator, describe)`.
  - `gbrain-pack.mjs`: `PACK_FILE = 'gbrain-pack.yaml'`, `gbrainPack(raw) → string`.

- [ ] **Step 1: Write the failing tests**

`tests/store-contract.test.mjs` — acrescente a `KINDS`:

```js
  ['markdown', dir => { writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'markdown' } })); return dir; }],
```

`tests/markdown-store.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { diffRaw, contentVersion } from '../scripts/lib/store/ops.mjs';
import { parse as parseYaml } from '../scripts/vendor/yaml/index.js';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const vault = (base = { raw: shop(), notes: {} }) => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-vault-'));
  writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'markdown' } }));
  const c = openStore(resolveBase(dir));
  c.apply(diffRaw(c.read(), base), { baseVersion: c.version() });
  return { dir, c: () => openStore(resolveBase(dir)) };
};
const page = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const change = (c, mutate) => { const cur = c.read(); const next = structuredClone(cur); mutate(next.raw); c.apply(diffRaw(cur, next), { baseVersion: c.version() }); };

test('one page per element under its type folder, with frontmatter, title, description, archlens block and wikilinks', () => {
  const { dir } = vault();
  const text = page(dir, 'application-component/loja.api.checkout.md');
  const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)[1]);
  assert.equal(fm.id, 'loja.api.checkout');
  assert.equal(fm.type, 'application-component');
  assert.equal(fm.title, 'Checkout');
  assert.equal(fm.c4, 'component');
  assert.equal(fm.parent, '[[application-component/loja.api|API]]');
  assert.ok(fm.relationships.some(r => r.type === 'realization' && r.to === 'app-svc-checkout' && typeof r.id === 'string'));
  assert.deepEqual(fm.realization, ['[[application-service/app-svc-checkout|Servico de checkout]]']);
  assert.ok(fm.tags.includes('archlens/application-component') && fm.tags.includes('archlens/c4/component'));
  assert.match(text, /\n# Checkout\n/);
  assert.match(text, /<!-- archlens:begin -->[\s\S]*\*\*realization\*\* → \[\[application-service\/app-svc-checkout\|Servico de checkout\]\][\s\S]*<!-- archlens:end -->/);
  assert.ok(existsSync(join(dir, 'business-actor', 'cliente.md')));
  assert.ok(existsSync(join(dir, 'gbrain-pack.yaml')));
});

test('writing the same base twice gives the same bytes, and reading gives the same base', () => {
  const { dir, c } = vault();
  const before = readdirSync(join(dir, 'application-component')).map(f => page(dir, `application-component/${f}`));
  change(c(), () => {});
  assert.deepEqual(readdirSync(join(dir, 'application-component')).map(f => page(dir, `application-component/${f}`)), before);
  assert.equal(contentVersion(c().read()), contentVersion({ raw: shop(), notes: {} }));
});

test('text people write in a page survives, even when the element changes type and the file moves', () => {
  const { dir, c } = vault();
  const rel = 'application-component/loja.web.md';
  writeFileSync(join(dir, rel), `${page(dir, rel)}\nNotas da equipe: migrar para Remix.\n`);
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.web').technology = 'Remix'; });
  assert.match(page(dir, rel), /Notas da equipe: migrar para Remix\./);
  // app-svc-checkout is the only application-service, and the checkout page links to it (realization).
  writeFileSync(join(dir, 'application-service/app-svc-checkout.md'), `${page(dir, 'application-service/app-svc-checkout.md')}\nDono: time de checkout.\n`);
  change(c(), raw => { raw.model.elements.find(e => e.id === 'app-svc-checkout').type = 'application-interface'; });
  assert.ok(!existsSync(join(dir, 'application-service/app-svc-checkout.md')));
  assert.match(page(dir, 'application-interface/app-svc-checkout.md'), /Dono: time de checkout\./, 'the text moves with the page');
  assert.ok(!existsSync(join(dir, 'application-service')), 'an emptied type folder goes away');
  assert.match(page(dir, 'application-component/loja.api.checkout.md'), /\[\[application-interface\/app-svc-checkout\|Servico de checkout\]\]/, 'links to the moved page are rewritten');
});

test('renaming an element rewrites the links to it and moves no file', () => {
  const { dir, c } = vault();
  const files = () => readdirSync(join(dir, 'application-component')).sort();
  const before = files();
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.api').name = 'API de Pedidos'; });
  assert.deepEqual(files(), before);
  assert.match(page(dir, 'application-component/loja.api.checkout.md'), /parent: "\[\[application-component\/loja\.api\|API de Pedidos\]\]"/);
});

test('a page without frontmatter, a page in the wrong folder and a duplicated id are refused; loose .md files are ignored', () => {
  const { dir, c } = vault();
  writeFileSync(join(dir, 'solto.md'), '# Fora das pastas de tipo\n');
  assert.doesNotThrow(() => c().read());
  writeFileSync(join(dir, 'application-component', 'README.md'), '# Componentes\n');
  assert.throws(() => c().read(), e => e.code === 'E_STORE_MD' && /application-component\/README\.md/.test(e.message));
  writeFileSync(join(dir, 'application-component', 'README.md'), page(dir, 'business-actor/cliente.md'));
  assert.throws(() => c().read(), e => e.code === 'E_STORE_MD_PATH');
  writeFileSync(join(dir, 'application-component', 'README.md'), '---\nid: [quebrado\n---\n');
  assert.throws(() => c().read(), e => e.code === 'E_STORE_MD');
});

test('the gbrain pack declares exactly the page types and link fields the pages use', () => {
  const { dir } = vault();
  const pack = parseYaml(page(dir, 'gbrain-pack.yaml'));
  assert.equal(pack.api_version, 'gbrain-schema-pack-v1');
  assert.equal(pack.name, 'archlens');
  const types = new Set(readdirSync(dir).filter(n => existsSync(join(dir, n, '.')) && !n.includes('.') && n !== 'notes'));
  assert.deepEqual(new Set(pack.page_types.map(t => t.name)), types);
  for (const t of pack.page_types) assert.deepEqual(t.path_prefixes, [`${t.name}/`]);
  const used = new Set();
  for (const type of types) for (const f of readdirSync(join(dir, type))) {
    const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(page(dir, `${type}/${f}`))[1]);
    for (const k of Object.keys(fm)) if (['parent', 'group', 'serving', 'realization', 'access', 'aggregation', 'composition', 'assignment', 'flow', 'triggering', 'influence', 'specialization', 'association'].includes(k) && fm[k] != null) used.add(`${type}:${k}`);
  }
  assert.deepEqual(new Set(pack.frontmatter_links.map(l => `${l.page_type}:${l.fields[0]}`)), used);
  for (const l of pack.frontmatter_links) assert.ok(pack.link_types.some(t => t.name === l.link_type), l.link_type);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/markdown-store.test.mjs tests/store-contract.test.mjs`
Expected: FAIL — `E_STORE_UNSUPPORTED` para `store.kind` `markdown`.

- [ ] **Step 3: `scripts/lib/store/markdown-page.mjs`**

```js
// One element as an Obsidian/gbrain page: YAML frontmatter (the element, its outgoing relationships, derived link fields
// and tags), a title, the description, an archlens block (relationships and children as wikilinks) and, after it, the
// text people write, kept as is.
import { parse as parseYaml, stringify as stringifyYaml } from '../../vendor/yaml/index.js';
import { RELATIONSHIP_TYPES } from '../registry.mjs';
import { storeError } from './errors.mjs';

export const BEGIN = '<!-- archlens:begin -->';
export const END = '<!-- archlens:end -->';
const LINK_FIELDS = Object.keys(RELATIONSHIP_TYPES);
const SIMPLE = ['technology', 'owner', 'url', 'external', 'status', 'statusReason', 'inferred', 'confidence'];
const KNOWN = new Set(['id', 'type', 'name', 'description', 'c4', 'tags', 'parent', 'group', 'aliases', ...SIMPLE, 'properties', 'sources']);
const TAG = 'archlens/';
const display = s => String(s).replace(/[[\]|\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

export const pagePath = el => `${el.type}/${el.id}.md`;

/** `[[type/id|name]]` for an element id; the bare id when the element is unknown. */
const wikilink = (id, info) => { const t = info(id); return t ? `[[${t.type}/${id}|${display(t.name ?? id)}]]` : id; };
/** The id inside `[[type/id|name]]` (or the value itself when it is not a wikilink). */
const unlink = v => {
  const m = typeof v === 'string' && /^\[\[(?:[^/|\]]+\/)?([^|\]]+)(?:\|[^\]]*)?\]\]$/.exec(v.trim());
  return m ? m[1] : v;
};

export function renderPage(el, { outgoing = [], children = [], info, userText }) {
  const fm = {};
  const put = (k, v) => { if (v !== undefined) fm[k] = v; };
  put('id', el.id);
  put('type', el.type);
  put('title', el.name);
  put('aliases', el.aliases);
  put('c4', el.c4?.kind);
  put('parent', el.parent == null ? el.parent : wikilink(el.parent, info));
  put('group', el.group == null ? el.group : wikilink(el.group, info));
  for (const k of SIMPLE) put(k, el[k]);
  put('properties', el.properties);
  put('sources', el.sources);
  for (const [k, v] of Object.entries(el)) if (!KNOWN.has(k)) fm[k] = v; // fields this format does not know travel as is
  if (outgoing.length) fm.relationships = outgoing.map(({ from, id, type, to, ...more }) => ({ id, type, to, ...more }));
  for (const t of LINK_FIELDS) {
    const tos = [...new Set(outgoing.filter(r => r.type === t).map(r => wikilink(r.to, info)))];
    if (tos.length) fm[t] = tos;
  }
  fm.tags = [`${TAG}${el.type}`, ...(el.c4?.kind ? [`${TAG}c4/${el.c4.kind}`] : []), ...(el.tags ?? []).map(t => `${TAG}tag/${t}`)];
  const block = [BEGIN];
  if (outgoing.length) {
    block.push('## Relações');
    for (const r of outgoing) {
      block.push(`- **${r.type}**${r.accessType ? ` (${r.accessType})` : ''} → ${wikilink(r.to, info)}${r.description ? ` — ${display(r.description)}` : ''}${r.technology ? ` [${display(r.technology)}]` : ''}`);
    }
  }
  if (children.length) {
    if (outgoing.length) block.push('');
    block.push('## Contém', ...children.map(id => `- ${wikilink(id, info)}`));
  }
  block.push(END);
  const description = el.description != null && el.description !== '' ? `${el.description}\n\n` : '';
  return `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n# ${display(el.name ?? el.id)}\n\n${description}${block.join('\n')}${userText ?? '\n'}`;
}

export function parsePage(text, rel) {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n/.exec(text);
  if (!m) throw storeError('E_STORE_MD', `${rel}: falta o frontmatter (--- … ---) no início do arquivo`, { file: rel });
  let fm;
  try { fm = parseYaml(m[1]); } catch (e) {
    throw storeError('E_STORE_MD', `${rel}: YAML inválido no frontmatter: ${e.message}`, { file: rel });
  }
  if (!fm || typeof fm !== 'object' || typeof fm.id !== 'string' || typeof fm.type !== 'string') {
    throw storeError('E_STORE_MD', `${rel}: o frontmatter precisa de "id" e "type"`, { file: rel });
  }
  const body = text.slice(m[0].length);
  const head = /^# .*\r?\n/.exec(body);
  const start = head ? head[0].length : 0;
  const b = body.indexOf(BEGIN), e = body.indexOf(END);
  let description, userText;
  if (b >= 0 && e > b) {
    const between = body.slice(start, b);
    description = between === '\n' ? undefined : (/^\n([\s\S]*)\n\n$/.exec(between)?.[1] ?? (between.trim() || undefined));
    userText = body.slice(e + END.length);
  } else {
    description = body.slice(start).trim() || undefined;
    userText = '\n';
  }
  const { id, type, title, c4, parent, group, tags, relationships, ...rest } = fm;
  for (const t of LINK_FIELDS) delete rest[t];
  const element = { id, type, ...(title !== undefined ? { name: title } : {}), ...(description !== undefined ? { description } : {}), ...rest };
  if (c4 != null) element.c4 = { kind: c4 };
  if (parent !== undefined) element.parent = parent === null ? null : unlink(parent);
  if (group !== undefined) element.group = group === null ? null : unlink(group);
  const own = (Array.isArray(tags) ? tags : []).filter(t => typeof t === 'string' && t.startsWith(`${TAG}tag/`)).map(t => t.slice(`${TAG}tag/`.length));
  if (own.length) element.tags = own;
  const rels = (Array.isArray(relationships) ? relationships : []).map((r, i) => {
    if (!r || typeof r.id !== 'string' || typeof r.type !== 'string' || typeof r.to !== 'string') {
      throw storeError('E_STORE_MD', `${rel}: a relação ${i + 1} precisa de "id", "type" e "to"`, { file: rel });
    }
    return { from: id, ...r };
  });
  return { element, relationships: rels, userText };
}
```

- [ ] **Step 4: `scripts/lib/store/gbrain-pack.mjs`**

```js
// The gbrain schema pack of a vault: one page type per ArchiMate type in use (its folder is the path prefix), the
// relationship types in use as link types, and the frontmatter fields that carry them.
import { stringify } from '../../vendor/yaml/index.js';
import { RELATIONSHIP_TYPES } from '../registry.mjs';

export const PACK_FILE = 'gbrain-pack.yaml';
const INVERSE = {
  composition: 'composed_into', aggregation: 'aggregated_into', assignment: 'assigned_from', realization: 'realized_by',
  serving: 'served_by', access: 'accessed_by', influence: 'influenced_by', triggering: 'triggered_by', flow: 'flows_from',
  specialization: 'generalization_of', association: 'association',
};

export function gbrainPack(raw) {
  const els = (raw.model?.elements ?? []).filter(e => e && typeof e.type === 'string');
  const typeOf = new Map(els.map(e => [e.id, e.type]));
  const rels = (raw.model?.relationships ?? []).filter(r => r && typeOf.has(r.from));
  const types = [...new Set(els.map(e => e.type))].sort();
  const relTypes = Object.keys(RELATIONSHIP_TYPES).filter(t => rels.some(r => r.type === t));
  const links = [];
  for (const t of types) {
    for (const r of relTypes) if (rels.some(x => x.type === r && typeOf.get(x.from) === t)) links.push({ page_type: t, fields: [r], link_type: r });
    if (els.some(e => e.type === t && e.parent != null)) links.push({ page_type: t, fields: ['parent'], link_type: 'part_of' });
    if (els.some(e => e.type === t && e.group != null)) links.push({ page_type: t, fields: ['group'], link_type: 'member_of' });
  }
  return stringify({
    api_version: 'gbrain-schema-pack-v1',
    name: 'archlens',
    version: '2.0.0',
    description: 'Arquitetura (ArchiMate 3.2 + perfil C4) mantida pelo archlens. Gerado pelo archlens; não edite.',
    page_types: types.map(t => ({ name: t, primitive: 'entity', path_prefixes: [`${t}/`], aliases: [], extractable: false, expert_routing: false })),
    link_types: [
      ...relTypes.map(r => ({ name: r, inverse: INVERSE[r] })),
      ...(els.some(e => e.parent != null) ? [{ name: 'part_of', inverse: 'composed_of' }] : []),
      ...(els.some(e => e.group != null) ? [{ name: 'member_of', inverse: 'has_member' }] : []),
    ],
    takes_kinds: ['fact', 'take', 'bet', 'hunch'],
    borrow_from: [],
    frontmatter_links: links,
    enrichable_types: [],
    filing_rules: [],
  }, { lineWidth: 0 });
}
```

- [ ] **Step 5: `scripts/lib/store/markdown.mjs`**

```js
// Base as an Obsidian/gbrain vault: manifest, views, changelog and notes as in the json connector, and one page per
// element in a folder named after its ArchiMate type (<type>/<id>.md). Files outside the type folders are never read nor
// removed; the text people write after the archlens block of a page is kept.
import { existsSync, readFileSync, readdirSync, statSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMENT_TYPES } from '../registry.mjs';
import { sortParentsFirst, isCanonicalFormat, FORMAT } from '../canonical.mjs';
import { storeError } from './errors.mjs';
import { MANIFEST, readJson, readNotes, noteFiles } from './folder.mjs';
import { renderPage, parsePage, pagePath } from './markdown-page.mjs';
import { gbrainPack, PACK_FILE } from './gbrain-pack.mjs';
import { fileConnector } from './contract.mjs';

const json = v => JSON.stringify(v, null, 2) + '\n';
const FILE_SAFE = /^[^/\\:*?"<>|\0]+$/;
const typeFolders = dir => readdirSync(dir).filter(n => ELEMENT_TYPES[n] && statSync(join(dir, n)).isDirectory()).sort();

export function readVault(dir, { anyFormat = false } = {}) {
  const { store, layout, ...top } = readJson(join(dir, MANIFEST));
  if (!anyFormat && !isCanonicalFormat(top.archlens)) {
    throw storeError('E_STORE_FORMAT', `${dir} está no formato ${top.archlens ?? '1.x'}; o archlens lê só o formato ${FORMAT}`);
  }
  const pages = new Map();
  const elements = [];
  const outgoing = new Map();
  for (const type of typeFolders(dir)) {
    for (const file of readdirSync(join(dir, type)).filter(f => f.endsWith('.md')).sort()) {
      const rel = `${type}/${file}`;
      const { element, relationships, userText } = parsePage(readFileSync(join(dir, rel), 'utf8'), rel);
      if (element.type !== type || `${element.id}.md` !== file) {
        throw storeError('E_STORE_MD_PATH', `${rel}: o elemento "${element.id}" (${element.type}) deveria estar em ${pagePath(element)}`, { file: rel });
      }
      if (pages.has(element.id)) throw storeError('E_STORE_DUP_ID', `elemento "${element.id}" aparece em ${pages.get(element.id).rel} e em ${rel}`);
      pages.set(element.id, { rel, userText });
      elements.push(element);
      outgoing.set(element.id, relationships);
    }
  }
  const ordered = sortParentsFirst(elements.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  const raw = { ...top, model: { elements: ordered, relationships: ordered.flatMap(e => outgoing.get(e.id)) } };
  if (existsSync(join(dir, 'views.json'))) raw.views = readJson(join(dir, 'views.json'));
  if (existsSync(join(dir, 'changelog.json'))) raw.changelog = readJson(join(dir, 'changelog.json'));
  return { raw, notes: readNotes(dir), ctx: { pages } };
}

export function vaultContents(dir, { raw, notes }, cur) {
  const { model, views, changelog, ...top } = raw;
  const files = new Map([[MANIFEST, json({ ...top, store: { kind: 'markdown' } })]]);
  if (views !== undefined) files.set('views.json', json(views));
  if (changelog !== undefined) files.set('changelog.json', json(changelog));
  for (const [rel, text] of noteFiles(dir, notes)) files.set(rel, text);
  const els = (model?.elements ?? []).filter(e => e && typeof e.id === 'string');
  const byId = new Map(els.map(e => [e.id, e]));
  const info = id => { const e = byId.get(id); return e && { type: e.type, name: e.name }; };
  const outgoing = new Map(els.map(e => [e.id, []]));
  for (const r of model?.relationships ?? []) {
    if (!outgoing.has(r?.from)) throw storeError('E_STORE_MD_REL', `a relação ${r?.id ?? `${r?.from} → ${r?.to}`} sai de "${r?.from}", que não é um elemento da base`);
    outgoing.get(r.from).push(r);
  }
  const children = new Map();
  for (const e of els) if (e.parent != null && byId.has(e.parent)) children.set(e.parent, [...(children.get(e.parent) ?? []), e.id]);
  const old = cur?.ctx.pages ?? new Map();
  for (const el of els) {
    if (!FILE_SAFE.test(el.id) || !ELEMENT_TYPES[el.type]) throw storeError('E_STORE_MD_ID', `"${el.id}" (${el.type}) não pode virar o arquivo ${pagePath(el)}`);
    files.set(pagePath(el), renderPage(el, { outgoing: outgoing.get(el.id), children: children.get(el.id) ?? [], info, userText: old.get(el.id)?.userText }));
  }
  for (const { rel } of old.values()) if (!files.has(rel)) files.set(rel, null);
  files.set(PACK_FILE, gbrainPack(raw));
  return files;
}

/** Type folders left empty by an apply go away (one with files the base does not own stays). */
function removeEmptyTypeFolders(dir) {
  for (const type of typeFolders(dir)) if (!readdirSync(join(dir, type)).length) rmdirSync(join(dir, type));
}

export function markdownConnector(locator, describe) {
  const dir = locator.path;
  return fileConnector({
    kind: 'markdown', dir, locator, describe,
    load: opts => (existsSync(join(dir, MANIFEST)) ? readVault(dir, opts) : null),
    contents: (next, cur) => vaultContents(dir, next, cur),
    after: () => removeEmptyTypeFolders(dir),
  });
}
```

- [ ] **Step 6: `index.mjs`** — `folderKind` aceita `markdown` (a mensagem do erro passa a citar `"json" ou "markdown"`), e
`openStore` escolhe:

```js
  const kind = folderKind(locator.path);
  return kind === 'markdown'
    ? markdownConnector(locator, `${rel(locator.path)}/ (markdown)`)
    : jsonConnector(locator, `${rel(locator.path)}/`);
```

- [ ] **Step 7: Run the tests**

Run: `node --test tests/markdown-store.test.mjs tests/store-contract.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/store tests
git commit -m "feat(store): conector markdown (uma pasta por tipo, uma página por elemento) e schema pack do gbrain

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```

---

### Task 5: `store convert`, exemplo vault, verificação no gbrain e documentação

**Files:**
- Create: `scripts/lib/store/convert.mjs`, `examples/loja-online-vault/` (gerado)
- Modify: `scripts/archlens.mjs` (`case 'store'`, `HELP`), `tests/cli.test.mjs`, `tests/examples.test.mjs`
- Modify: `references/knowledge-doc.md`, `SKILL.md`, `docs/GUIA.md`, `CHANGELOG.md`, `docs/superpowers/roadmap.md`

**Interfaces:**
- Consumes: `openStore`, `jsonConnector`, `markdownConnector`, `readVault`, `loadFolder`, `contentVersion`, `diffRaw`,
  `MANIFEST`, `PACK_FILE`.
- Produces: `convertFolder(locator, to: 'json' | 'markdown') → { from, to, version }`.

- [ ] **Step 1: Write the failing tests** — `tests/cli.test.mjs`

```js
test('store convert json → markdown → json keeps the base, its version and every file it does not own', () => {
  const dir = setup();
  const arch = join(dir, 'architecture');
  mkdirSync(join(arch, 'diagrams'), { recursive: true }); writeFileSync(join(arch, 'diagrams', 'a.html'), '<html></html>');
  mkdirSync(join(arch, '.obsidian')); writeFileSync(join(arch, '.obsidian', 'app.json'), '{}');
  const v0 = run(['extract', 'architecture'], dir).stdout;
  const r1 = run(['store', 'convert', 'architecture', '--to', 'markdown'], dir);
  assert.equal(r1.status, 0, r1.stderr);
  assert.ok(existsSync(join(arch, 'application-component', 'loja.api.md')));
  assert.ok(!existsSync(join(arch, 'model.json')));
  writeFileSync(join(arch, 'application-component', 'diagrama.png'), 'png');
  assert.equal(run(['check', 'architecture'], dir).status, 0, 'convert regenerates ARCHITECTURE.md');
  const r2 = run(['store', 'convert', 'architecture', '--to', 'json'], dir);
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(existsSync(join(arch, 'model.json')));
  assert.ok(!existsSync(join(arch, 'application-component', 'loja.api.md')));
  for (const f of ['diagrams/a.html', '.obsidian/app.json', 'application-component/diagrama.png', 'notes/notes.md']) assert.ok(existsSync(join(arch, f)), f);
  assert.equal(JSON.stringify(JSON.parse(run(['extract', 'architecture'], dir).stdout).model.elements.map(e => e.id).sort()),
    JSON.stringify(JSON.parse(v0).model.elements.map(e => e.id).sort()));
  assert.ok(!readdirSync(dir).some(n => /\.(convert|old)-/.test(n)), 'no temporary folder left behind');
  assert.match(run(['store', 'convert', 'architecture', '--to', 'json'], dir).stderr, /E_STORE_CONVERT[\s\S]*json/);
});

test('store convert of a split json base keeps the files the base does not own in model/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const arch = join(dir, 'architecture');
  saveFolder(arch, asBase(shop()), { layout: { model: 'model/' } });
  writeFileSync(join(arch, 'model', 'README.md'), 'leia-me');
  assert.equal(run(['store', 'convert', 'architecture', '--to', 'markdown'], dir).status, 0);
  assert.ok(existsSync(join(arch, 'model', 'README.md')));
  assert.ok(!readdirSync(join(arch, 'model')).some(f => f.endsWith('.json')));
});
```

`tests/examples.test.mjs`: acrescente `'loja-online-vault'` à lista de exemplos.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — `comando desconhecido "store"`.

- [ ] **Step 3: `scripts/lib/store/convert.mjs`**

```js
// store convert: the same base written by another connector in the same folder. The folder is copied, the source
// connector's files are taken out of the copy, the target connector writes the base into it, the copy is read back and
// checked, then swapped in. Files the base does not own stay.
import { cpSync, renameSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { storeError } from './errors.mjs';
import { contentVersion, diffRaw } from './ops.mjs';
import { MANIFEST, readJson, loadFolder, jsonConnector } from './folder.mjs';
import { readVault, markdownConnector } from './markdown.mjs';
import { PACK_FILE } from './gbrain-pack.mjs';
import { openStore } from './index.mjs';

/** The files of `kind` in `dir` that are the base itself (not notes, views or changelog, which every connector shares). */
function ownFiles(dir, kind) {
  if (kind === 'markdown') return [...readVault(dir).ctx.pages.values()].map(p => p.rel).concat(existsSync(join(dir, PACK_FILE)) ? [PACK_FILE] : []);
  const { origins, layout } = loadFolder(dir);
  const model = layout?.model ?? 'model.json';
  if (!model.endsWith('/')) return [model];
  return [...new Set([...origins.elements.values(), ...origins.relationships.values()])]
    .concat(readdirSync(join(dir, model)).filter(f => f.endsWith('.json')).map(f => model + f));
}

export function convertFolder(locator, to) {
  if (!['json', 'markdown'].includes(to)) throw storeError('E_STORE_CONVERT', `conector de destino desconhecido "${to}"; use json ou markdown`);
  const source = openStore(locator);
  if (!source.writable) source.apply([]);
  if (source.kind === to) throw storeError('E_STORE_CONVERT', `${source.describe()} já usa o conector ${to}`);
  const cur = source.read();
  if (!cur) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${source.describe()}`);
  const before = contentVersion(cur);
  const dir = locator.path, tmp = `${dir}.convert-${process.pid}`, old = `${dir}.old-${process.pid}`;
  try {
    cpSync(dir, tmp, { recursive: true });
    const own = new Set(ownFiles(tmp, source.kind));
    for (const rel of own) rmSync(join(tmp, rel), { force: true });
    // Folders the source connector emptied go away (model/, type folders); one with other files stays.
    for (const d of new Set([...own].map(rel => dirname(rel)).filter(d => d !== '.'))) {
      if (existsSync(join(tmp, d)) && !readdirSync(join(tmp, d)).length) rmSync(join(tmp, d), { recursive: true });
    }
    const { store, layout, ...top } = readJson(join(tmp, MANIFEST));
    writeFileSync(join(tmp, MANIFEST), JSON.stringify({ ...top, ...(to === 'markdown' ? { store: { kind: 'markdown' } } : {}) }, null, 2) + '\n');
    const target = to === 'markdown' ? markdownConnector({ ...locator, path: tmp }, tmp) : jsonConnector({ ...locator, path: tmp }, tmp);
    target.apply(diffRaw(target.read(), cur), { baseVersion: target.version() });
    if (contentVersion(target.read()) !== before) throw storeError('E_STORE_CONVERT', 'a base gravada pelo conector novo não reproduz a original; nada foi trocado');
    renameSync(dir, old);
    renameSync(tmp, dir);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    if (existsSync(old) && !existsSync(dir)) renameSync(old, dir);
    throw e;
  }
  let leftover = null;
  try { rmSync(old, { recursive: true, force: true }); } catch { leftover = old; }
  return { from: source.kind, to, version: before, leftover };
}
```

Nota: só remova pastas vazias que o conector de origem deixou (a pasta `model/` do json dividido; as pastas de tipo do
markdown); `notes/`, `diagrams/` e `.obsidian/` nunca ficam vazias por causa da conversão, e o teste do `model/README.md`
garante que uma pasta com arquivos desconhecidos fica.

- [ ] **Step 4: CLI** — `case 'store'` em `scripts/archlens.mjs`:

```js
    case 'store': {
      const usage = 'uso: archlens store convert <base> --to markdown|json';
      if (file !== 'convert' || !args.to || args.to === true) fail(usage);
      const target = args._[2];
      let loc;
      try { loc = resolveBase(target); } catch (e) { fail(e.message); }
      if (loc.kind !== 'folder' || !loc.exists) fail(`E_STORE_CONVERT: ${target ?? '.'} não é uma pasta de base (migre bases antigas com "archlens migrate")`);
      assertDocOwned(openStore(loc)); // before anything is written
      let res;
      try { res = convertFolder(loc, String(args.to)); } catch (e) { fail(e.message); }
      // The element order of a vault differs from model.json, so the generated document is rewritten.
      const converted = openStore(resolveBase(loc.path));
      const back = loadBase(converted);
      const doc = writeDoc(converted, back.raw, back.notes, loc.docPath);
      console.log(`✓ ${relPath(loc.path)}/ agora usa o conector ${res.to} (era ${res.from}); a versão da base não mudou; ${relPath(doc)} regenerado`);
      if (res.leftover) console.warn(`  aviso: não consegui apagar ${relPath(res.leftover)}; remova-o à mão`);
      if (res.to === 'markdown') console.log(`  abra ${relPath(loc.path)}/ como vault no Obsidian; para o gbrain: gbrain schema use com ${relPath(join(loc.path, 'gbrain-pack.yaml'))}`);
      console.log(`  commit sugerido: git add -A ${relPath(loc.path)} && git commit -m "chore(archlens): base no conector ${res.to}"`);
      break;
    }
```

`HELP`: acrescente `  store convert <base> --to markdown|json   grava a base em outro conector (mesma pasta; versão inalterada)`.
Import `convertFolder` de `./lib/store/convert.mjs`.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/cli.test.mjs && npm test`
Expected: PASS, exceto `examples.test` para `loja-online-vault` (o exemplo ainda não existe).

- [ ] **Step 6: Exemplo vault**

```bash
cp -r examples/loja-online examples/loja-online-vault
node scripts/archlens.mjs store convert examples/loja-online-vault/architecture --to markdown
node scripts/archlens.mjs check examples/loja-online-vault/architecture
node scripts/archlens.mjs build examples/loja-online-vault/architecture
for ex in loja-online telemedicina repos; do
  rm -rf "$TMPDIR/conv-$ex" && cp -r examples/$ex "$TMPDIR/conv-$ex"
  node scripts/archlens.mjs store convert "$TMPDIR/conv-$ex/architecture" --to markdown && node scripts/archlens.mjs check "$TMPDIR/conv-$ex/architecture"
done
npm test
```

Expected: os quatro `check` dizem "em dia"; `npm test` PASS. (Use `/tmp` se `$TMPDIR` não estiver definido.)

- [ ] **Step 7: Verificação no gbrain (manual)**

Se `bun` já estiver instalado (`bun --version`): clone `https://github.com/garrytan/gbrain` (commit `a723db6`) numa pasta
temporária, `bun install`, e rode a CLI dele com uma brain local (PGLite) apontando para uma cópia de
`examples/loja-online-vault/architecture`: `gbrain schema validate` sobre `gbrain-pack.yaml`, ative o pack e
`gbrain import` da pasta; confira que as páginas ganham os tipos das pastas e que `gbrain graph-query` (ou o equivalente
da versão) mostra ligações `serving`/`part_of`. Registre no relatório os comandos e a saída. **Não instale `bun` nem nada
global** se não estiver disponível: registre "verificação no gbrain pendente para o e.4" no relatório e no
`references/knowledge-doc.md`. Se o `validate` apontar um campo do pack que o gbrain não aceita, ajuste
`gbrain-pack.mjs` e o teste do pack na mesma task.

- [ ] **Step 8: Documentação**

- `references/knowledge-doc.md`, seção nova "Conectores":
  - o contrato (`read`, `readSubgraph`, `version`, `apply`, `history`) e as nove operações;
  - a versão: hash do conteúdo, igual entre conectores, `E_STORE_CONFLICT`;
  - `store.kind`;
  - o layout e o formato da página markdown (exemplo da seção 3 do spec);
  - o `gbrain-pack.yaml`;
  - `store convert`;
  - o resultado do Step 7.
- `SKILL.md`, no fluxo:
  - a base pode estar em `json` (padrão) ou `markdown`;
  - `archlens store convert <base> --to markdown` mantém a versão e os arquivos do usuário;
  - para abrir no Obsidian, abra a pasta como vault;
  - para o gbrain, use o `gbrain-pack.yaml`;
  - nunca edite as páginas à mão fora do texto depois do bloco do archlens.
- `docs/GUIA.md`: seção curta "Base em markdown (Obsidian, gbrain)" com o `store convert` e o exemplo
  `examples/loja-online-vault/`.
- `CHANGELOG.md`, em `[Não lançado]` → `### Adicionado`:
  - conector `markdown`;
  - contrato de conector com operações atômicas e versão (`E_STORE_CONFLICT`);
  - `store convert`;
  - schema pack do gbrain.
- `docs/superpowers/roadmap.md`: e.2 → status `feito`, plano linkado e entrega `feat/store-connectors → develop-v2` (o número
  do PR entra quando ele for aberto).

- [ ] **Step 9: Commit**

```bash
git add scripts tests examples references SKILL.md docs CHANGELOG.md
git commit -m "feat(store): store convert entre json e markdown; exemplo vault e documentação dos conectores

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ScEW2P1amkx4PA3DVpgESM"
graphify update .
```
