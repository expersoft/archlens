# Rascunho e prévia de deltas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** status `draft` com notação de esboço, e diagramas gerados a partir de um delta (ou plano) ainda não
mergeado, com marcadores `+ ~ − ?` e removidos como fantasmas — sem gravar nada no `ARCHITECTURE.md`.

**Architecture:** o motor do merge ganha `previewMerge` (mesmo `runMerge` do plano, devolvendo o modelo
simulado) e `relationshipIds`. Um módulo puro novo, `preview.mjs`, compara base × resultado (por id, usando os
ids canônicos do merge), re-insere removidos como fantasmas, associa as perguntas pendentes e anota o IR das
visões. `query.mjs` aceita `keep` (ids que ficam visíveis mesmo filtrados por status); `render.mjs` desenha
esboço, marcadores, banner e painel; a CLI liga tudo com `--delta` / `--plan`.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test` + `node:assert/strict`. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-30-kb-preview-design.md`

## Global Constraints

- Node ≥ 18; sem dependências de runtime novas.
- Mensagens ao usuário em português; comentários de código em inglês.
- `STATUSES = ['draft', 'planned', 'active', 'deprecated', 'retired']`; filtro padrão das visões: todos menos `retired`.
- A prévia **nunca** grava nem altera o `ARCHITECTURE.md` nem os objetos recebidos (base, delta, plano).
- Para o mesmo delta e as mesmas respostas, o modelo da prévia sem fantasmas ≡ o que `merge --apply` grava (sem `changelog`).
- Marcadores: `+` novo, `~` alterado, `−` removido/retired, `?` decisão pendente (amarelo). Removidos: fantasma riscado.
- Esboço: dois filtros SVG `feTurbulence` (`fractalNoise`, `baseFrequency` 0.035 / 0.04, `numOctaves` 2, sementes 7 / 21) + `feDisplacementMap` (`scale` 5); preenchimento com `fill-opacity` .22, contorno duplo, texto na cor `--sketch-ink`.
- Banner da prévia: texto exato `PRÉVIA · não é a base oficial — <rótulo>`.
- Git neste repositório (WSL) exige `git -c safe.directory="$PWD" …` (ou `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$PWD"`); nunca alterar a config global. Branch `feat/kb-preview`.
- Commits terminam com:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q`

## Decisões de detalhe (não estavam no spec; revisar)

1. `previewModel` devolve `changes` (elementos) **e** `relChanges` (relações) em mapas separados — ids de elemento e de relação são espaços diferentes.
2. `keep` inclui elementos **e** relações `removed`/`retired` neste delta; é passado a `resolveView(model, spec, { keep })`.
3. Aresta C4 agregada: `removed` se todas as relações dela saem; `added` se todas são novas; `changed` se alguma muda.
4. Relação `draft` em visão C4 agregada só é desenhada em esboço se **todas** as relações agregadas forem `draft`.
5. Rótulo da prévia: `<arquivo> · +A ~C −R[, N decisão(ões) pendente(s)]`; nome padrão do HTML no `build`: `<arquivo sem .json>-preview.html`.
6. Com `--plan`, se o hash da base mudou desde o plano, a prévia avisa e usa a base atual.
7. Na prévia, visão que não abre (erro ao resolver) é pulada com aviso; fora da prévia o comportamento continua sendo falhar.

## Review Focus

1. **Remover um elemento com filhos e relações** → filhos voltam como fantasmas aninhados no pai certo e as relações aparecem riscadas; o modelo da prévia continua válido. Teste na Task 3.
2. **Duplicata respondida `same`** → aparece como `~` no elemento da base, nunca como `−` + `+`. Teste na Task 3.
3. **Base inexistente** (delta que criaria a base) → tudo `+`, sem erro. Testes nas Tasks 3 e 6.
4. **`--delta` e `--plan` juntos** ou arquivo ausente → erro claro, nada gravado. Teste na Task 6.
5. **Elemento `retired` por este delta numa visão com filtro padrão** → continua visível como fantasma com `−`. Teste na Task 4.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/registry.mjs` | `STATUSES` com `draft` |
| `scripts/lib/query-c4.mjs`, `query-archimate.mjs` | `statusReason` nos nós; `status` nas arestas |
| `scripts/lib/query.mjs` | opção `keep` em `filterByStatus` / `resolveView` |
| `scripts/lib/merge.mjs` | `planContext` interno, `previewMerge`, `relationshipIds` |
| `scripts/lib/merge-report.mjs` | exporta `describeItem` |
| `scripts/lib/preview.mjs` (novo) | `previewModel`, `previewSummary`, `annotateView` |
| `scripts/lib/render.mjs` | filtros de esboço, classes `sketchy`/`ch-*`/`pending`, marcadores, banner, painel, legenda |
| `scripts/archlens.mjs` | `--delta` / `--plan` em `render`, `deliver`, `build`, `resolve`, `views` |
| `scripts/gen-schemas.mjs`, `schemas/*.json` | regenerados (enum de status) |
| `tests/preview.test.mjs` (novo), `tests/*.test.mjs` | testes |
| `examples/telemedicina/delta-02.json` (novo) | delta de demonstração só para prévia |
| `SKILL.md`, `references/*.md`, `docs/GUIA.md`, `README.md` | documentação |

---

### Task 1: status `draft` e notação de esboço

**Files:**
- Modify: `scripts/lib/registry.mjs` (linha de `STATUSES`)
- Modify: `scripts/lib/query-c4.mjs` (`addEdge`, mapeamento final das arestas, objeto do nó)
- Modify: `scripts/lib/query-archimate.mjs` (aresta real, objeto do nó)
- Modify: `scripts/lib/render.mjs` (defs, `c4Node`, `amNode`, `edge`, `viewSvg`, `legend`, `viewData`, CSS, painel)
- Regenerate: `schemas/*.json`
- Test: `tests/model.test.mjs`, `tests/query.test.mjs`, `tests/render.test.mjs`, `tests/merge.test.mjs`, `tests/doc.test.mjs`

**Interfaces:**
- Produces: `STATUSES` com `draft` primeiro; nós do IR com `statusReason`; arestas do IR com `status` (`'draft' | 'active'` no C4; status da relação no ArchiMate);
  em `render.mjs`: `sketchDefs(prefix)`, `sketchy(n)`, `sketchShape(shape, prefix)`; `c4Node(n, i, prefix)` e `amNode(n, i, prefix)` (novo parâmetro `prefix`);
  CSS tokens `--sketch-ink`, `--removed`, `--pending`; filtros `#<prefix>-sk1` e `#<prefix>-sk2` em cada SVG de visão e `#lg-sk1`/`#lg-sk2` na página.

- [ ] **Step 1: Write the failing tests**

Em `tests/model.test.mjs`, ao final:

```js
test('draft is a valid status for elements and relationships', () => {
  const r = shopWith(r => { findRaw(r, 'loja.api').status = 'draft'; r.model.relationships[0].status = 'draft'; });
  assert.deepEqual(validateModel(r).errors, []);
  assert.equal(normalizeModel(r).elements.get('loja.api').status, 'draft');
});
```

Em `tests/query.test.mjs`, ao final:

```js
test('draft items are visible by default and carry their status and reason', () => {
  const m = modelWith(r => {
    Object.assign(findRaw(r, 'loja.web'), { status: 'draft', statusReason: 'em discussão com o time de canais' });
    r.model.relationships.find(x => x.from === 'k8s').status = 'draft';
  });
  const v = resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' });
  const web = v.nodes.find(n => n.id === 'loja.web');
  assert.equal(web.status, 'draft');
  assert.equal(web.statusReason, 'em discussão com o time de canais');
  const s = resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } });
  assert.equal(s.edges.find(e => e.from === 'k8s').status, 'draft');
  const asIs = resolveView(m, { key: 'a', notation: 'c4', level: 'container', scope: 'loja', status: ['active', 'deprecated'] });
  assert.ok(!ids(asIs).includes('loja.web'));
});
```

Em `tests/render.test.mjs`, ao final:

```js
test('draft nodes and relationships are drawn as a sketch with the filters defined in each view', async () => {
  const r = raw();
  r.model.elements.find(e => e.id === 'loja').children.find(c => c.id === 'loja.web').status = 'draft';
  r.model.relationships.find(x => x.from === 'k8s').status = 'draft';
  const m = normalizeModel(r);
  const views = [
    await layoutView(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' })),
    await layoutView(resolveView(m, { key: 's', notation: 'archimate', viewpoint: 'layered', anchor: 'venda', traverse: { mode: 'supporters' } })),
  ];
  const html = renderHtml({ title: 't', views });
  assert.match(html, /<filter id="v0-sk1"[^>]*>[\s\S]*?feDisplacementMap/);
  assert.match(html, /<filter id="v1-sk2"/);
  assert.match(html, /<filter id="lg-sk1"/);
  assert.match(html, /class="node c4 [^"]*st-draft sketchy"/);
  assert.match(html, /class="shape2" filter="url\(#v0-sk2\)"/);
  assert.match(html, /class="edge t-serving[^"]* sketchy"/);
  assert.match(html, /<b>rascunho<\/b>/);
  assert.match(html, /--sketch-ink:/);
});
```

Em `tests/merge.test.mjs`, ao final:

```js
test('status draft needs no confirmation', () => {
  const plan = planMerge(shop(), delta({}, { ops: [{ op: 'status', id: 'loja.web', status: 'draft', reason: 'em discussão' }] }), TODAY);
  assert.equal(plan.items[0].resolution, undefined);
  assert.equal(find(applyPlan(shop(), plan, TODAY).raw, 'loja.web').status, 'draft');
});
```

Em `tests/doc.test.mjs`, no teste `schemas describe the new fields`, troque
`['planned', 'active', 'deprecated', 'retired']` por `['draft', 'planned', 'active', 'deprecated', 'retired']`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `E_STATUS` para `draft`; `statusReason`/`status` ausentes no IR; filtros `sk1` ausentes; enum do schema.

- [ ] **Step 3: Add `draft` to the registry**

Em `scripts/lib/registry.mjs`, troque a linha de `STATUSES` por:

```js
export const STATUSES = ['draft', 'planned', 'active', 'deprecated', 'retired'];
```

- [ ] **Step 4: Carry status into the IR**

Em `scripts/lib/query-c4.mjs` e `scripts/lib/query-archimate.mjs`, troque (uma ocorrência em cada) `status: el.status ?? 'active',`
por `status: el.status ?? 'active', statusReason: el.statusReason,`.

Em `scripts/lib/query-archimate.mjs`, no objeto empurrado para relações reais (o único com `relIds: [r.id],`), troque
`relIds: [r.id],` por `relIds: [r.id], status: r.status ?? 'active',`.

Em `scripts/lib/query-c4.mjs`, dentro de `addEdge`, logo após `e.relIds.push(rel.id);`, acrescente:

```js
      (e.statuses ??= []).push(rel.status ?? 'active');
```

e no mapeamento final das arestas (o `.map(e => ({ id: e.id, from: e.from, to: e.to, type: 'uses', … count: e.count, …`), antes de `count: e.count,`, acrescente:

```js
    status: e.statuses?.length && e.statuses.every(s => s === 'draft') ? 'draft' : 'active',
```

- [ ] **Step 5: Sketch notation in `scripts/lib/render.mjs`**

Logo após a função `markerDefs`, acrescente:

```js
/** Hand-drawn look for drafts and preview changes: two displacement filters, applied to a doubled outline. */
function sketchDefs(prefix) {
  const flt = (id, freq, seed) => `<filter id="${prefix}-${id}" x="-5%" y="-5%" width="110%" height="110%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" result="n"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>`;
  return `<defs>${flt('sk1', 0.035, 7)}${flt('sk2', 0.04, 21)}</defs>`;
}
```

Substitua a linha `const statusClass = n => …` por:

```js
const statusClass = n => (n.status && n.status !== 'active' ? ` st-${n.status}` : '');
const sketchy = n => n.status === 'draft' || n.change === 'added';
/** The shape drawn twice through the sketch filters (the second copy is the thinner, offset stroke). */
function sketchShape(shape, prefix) {
  const via = (cls, id) => shape.replace(/<(path|rect|circle) class="shape"/g, `<$1 class="${cls}" filter="url(#${prefix}-${id})"`);
  return via('shape', 'sk1') + via('shape2', 'sk2');
}
```

Em `c4Node`: mude a assinatura para `function c4Node(n, i, prefix) {`; na linha `const cls = …`, troque o final
`${statusClass(n)}\`;` por `${statusClass(n)}${sketchy(n) ? ' sketchy' : ''}\`;`; e, logo antes de `const L = n.lines;`, acrescente:

```js
  if (sketchy(n)) shape = sketchShape(shape, prefix);
```

Em `amNode`: mude a assinatura para `function amNode(n, i, prefix) {`; na linha `const cls = …`, troque o final
`${statusClass(n)}\`;` por `${statusClass(n)}${sketchy(n) ? ' sketchy' : ''}\`;`; logo antes de `return \`<g class="${cls}"`, acrescente:

```js
  let shape = `<rect class="shape" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}"/>`;
  if (sketchy(n)) shape = sketchShape(shape, prefix);
```

e no `return`, troque a linha `+ \`<rect class="shape" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}"/>\``
por `+ shape`.

Em `edge(e, prefix, showLabel)`: na abertura do `<g class="edge t-${e.type}…`, troque `${e.implicit ? ' implicit' : ''}"`
por `${e.implicit ? ' implicit' : ''}${e.status === 'draft' || e.change === 'added' ? ' sketchy' : ''}"`; e na linha
`+ \`<path class="line" d="${d}"${dash ? …` acrescente, logo após `d="${d}"`, o trecho
`${e.status === 'draft' || e.change === 'added' ? \` filter="url(#${prefix}-sk1)"\` : ''}`.

Em `viewSvg`: troque `const nodes = v.nodes.map((n, i) => v.notation === 'c4' ? c4Node(n, i) : amNode(n, i)).join('');`
por `const nodes = v.nodes.map((n, i) => v.notation === 'c4' ? c4Node(n, i, prefix) : amNode(n, i, prefix)).join('');`
e troque `+ markerDefs(prefix)` por `+ markerDefs(prefix) + sketchDefs(prefix)`.

Em `renderHtml`, troque `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">${markerDefs('lg')}</svg>`
por `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">${markerDefs('lg')}${sketchDefs('lg')}</svg>`.

Em `legend(v)`, logo antes de `return \`<ul>${items.join('')}</ul>…`, acrescente:

```js
  if (v.nodes.some(n => n.status === 'draft') || v.edges.some(e => e.status === 'draft')) {
    items.push(`<li><svg class="sample" viewBox="0 0 64 20" width="64" height="20" aria-hidden="true"><rect x="4" y="3" width="56" height="14" rx="3" fill="var(--c4-container)" fill-opacity=".22" stroke="var(--sketch-ink)" stroke-width="1.8" filter="url(#lg-sk1)"/></svg><span><b>rascunho</b> — em discussão (draft)</span></li>`);
  }
```

Em `viewData`, troque `status: n.status ?? 'active',` por `status: n.status ?? 'active', statusReason: n.statusReason ?? '',`.

No CSS, no bloco `:root{`, logo após a linha que começa com `--am-ink:#18202c;`, acrescente
`--sketch-ink:#0b3d78;--removed:#b3261e;--pending:#f2a900;`; no bloco `:root[data-theme="dark"]{`, logo após a linha que começa com
`--am-ink:#eef2f7;`, acrescente `--sketch-ink:#9cc8f5;--removed:#ff6b5e;--pending:#ffd24a;`. Depois da regra `.node.st-planned .shape{…}`, acrescente:

```css
.node.sketchy .shape{fill-opacity:.22;stroke:var(--sketch-ink);stroke-width:2.2;stroke-dasharray:none}
.node.sketchy .shape2{fill:none;stroke:var(--sketch-ink);stroke-width:1.3}
.node.sketchy .rim{stroke:var(--sketch-ink)}
.node.c4.sketchy text,.node.am.sketchy text{fill:var(--sketch-ink)}
.edge.sketchy .line{stroke:var(--sketch-ink)}
```

No painel (`openDrawer`), troque o objeto `{ planned: 'Planejado: ainda não existe.', deprecated: 'Em desativação.', retired: 'Desativado.' }`
por `{ draft: 'Rascunho: em discussão.', planned: 'Planejado: ainda não existe.', deprecated: 'Em desativação.', retired: 'Desativado.' }`,
e logo após essa linha acrescente:

```js
    if (n.statusReason) h += '<p style="color:var(--muted)">Motivo: ' + escH(n.statusReason) + '</p>';
```

- [ ] **Step 6: Regenerate schemas and run tests**

Run: `npm run schemas && npm test`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/registry.mjs scripts/lib/query-c4.mjs scripts/lib/query-archimate.mjs scripts/lib/render.mjs schemas/ tests/
git -c safe.directory="$PWD" commit -m "feat(draft): status draft desenhado como esboço à mão (C4 e ArchiMate)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 2: `previewMerge` e `relationshipIds` no motor do merge

**Files:**
- Modify: `scripts/lib/merge.mjs` (`planMerge` → `planContext`; novos exports)
- Test: `tests/merge.test.mjs`

**Interfaces:**
- Consumes: `runMerge`, `relIds`, `indexTree`, `resolveType` (já existentes).
- Produces:
  - `previewMerge(baseRaw|null, delta, { base?, today?, answers? }) → { plan, raw, idMap: Map<deltaId, finalId> }` — nunca lança por plano bloqueado; lança `E_DELTA_SCHEMA` como `planMerge`.
  - `relationshipIds(raw) → Map<rawRelationship, id>` com os mesmos ids do `normalizeModel`.

- [ ] **Step 1: Write the failing tests** — em `tests/merge.test.mjs`, troque o import de `merge.mjs` por
`import { planMerge, applyPlan, previewMerge, relationshipIds, canonicalJson } from '../scripts/lib/merge.mjs';`,
acrescente `import { normalizeModel } from '../scripts/lib/model.mjs';` (se ainda não houver) e, ao final:

```js
test('previewMerge returns the simulated result; with every answer it equals what apply writes', () => {
  const d = delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }, { id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] });
  const base = shop();
  const { plan, raw, idMap } = previewMerge(base, d, TODAY);
  assert.deepEqual(base, shop(), 'the base is not mutated');
  assert.equal(find(raw, 'loja.api').technology, 'Kotlin', 'an open conflict is simulated as take');
  assert.equal(idMap.get('loja.worker'), 'loja.worker');
  const answered = answer(structuredClone(plan), { 'el:loja.api:technology': 'keep' });
  const answers = new Map(answered.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution]));
  const preview = previewMerge(base, d, { ...TODAY, answers }).raw;
  const { changelog, ...applied } = applyPlan(base, answered, TODAY).raw;
  assert.equal(canonicalJson(preview), canonicalJson(applied));
});

test('previewMerge does not throw on a blocked plan (the caller decides)', () => {
  const { plan } = previewMerge(shop(), delta({ relationships: [{ from: 'loja.api', to: 'pagamentoz' }] }), TODAY);
  assert.equal(plan.blocked, true);
});

test('relationshipIds names relationships exactly like normalizeModel, parallels included', () => {
  const base = shop();
  base.model.relationships.push({ from: 'cliente', to: 'loja.web', description: 'Volta a comprar' });
  assert.deepEqual([...relationshipIds(base).values()], normalizeModel(base).relationships.map(r => r.id));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/merge.test.mjs`
Expected: FAIL — `does not provide an export named 'previewMerge'`.

- [ ] **Step 3: Implement** — em `scripts/lib/merge.mjs`, substitua a função `planMerge` inteira (do comentário `/** \`answers\` …` até o `}` final dela) por:

```js
/**
 * `answers` (Map or object, key → resolution) pre-fills questions answered in an earlier plan, so that
 * a possible duplicate answered "same" is planned (and its follow-up questions asked) as apply will see it.
 */
export function planMerge(baseRaw, delta, opts = {}) {
  return planContext(baseRaw, delta, opts).plan;
}

/**
 * What a plan simulates, for previews: the merged model (open questions at their plan default, answered
 * ones as answered), the plan itself and delta id → final id. Pure; never throws on a blocked plan.
 */
export function previewMerge(baseRaw, delta, opts = {}) {
  const { ctx, plan } = planContext(baseRaw, delta, opts);
  return { plan, raw: ctx.raw, idMap: ctx.idMap };
}

function planContext(baseRaw, delta, { base = 'ARCHITECTURE.md', today, answers } = {}) {
  checkDelta(delta);
  const earlier = answers instanceof Map ? answers : new Map(Object.entries(answers ?? {}));
  const ctx = runMerge(baseRaw, delta, { mode: 'plan', resolutions: earlier });
  const errors = [...ctx.errors, ...validateModel(ctx.raw).errors];
  const summary = {};
  for (const it of ctx.items) if (!it.when) summary[it.class] = (summary[it.class] ?? 0) + 1;
  const plan = {
    'archlens-plan': PLAN_VERSION, base, baseHash: hashRaw(baseRaw), created: today ?? isoToday(), delta,
    items: ctx.items.map((it, i) => ({ n: i + 1, ...it })), summary, blocked: errors.length > 0, errors,
  };
  return { ctx, plan };
}
```

E, logo após a função `relIds`, acrescente:

```js
/** raw relationship → id as normalizeModel names it, for any raw model (the preview diffs relationships by it). */
export function relationshipIds(raw) {
  const model = { elements: raw?.model?.elements ?? [], relationships: raw?.model?.relationships ?? [] };
  const tree = indexTree({ model });
  const typeOf = id => {
    const el = tree.get(id)?.el;
    return el ? resolveType(el.type, { tags: el.tags || [], archimate: el.archimate }).type ?? null : null;
  };
  return relIds({ raw: { model }, tree, typeOf });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/merge.mjs tests/merge.test.mjs
git -c safe.directory="$PWD" commit -m "feat(merge): previewMerge e relationshipIds para a prévia de deltas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 3: `preview.mjs` — mudanças, fantasmas e pendências

**Files:**
- Create: `scripts/lib/preview.mjs`
- Modify: `scripts/lib/merge-report.mjs` (exportar `describeItem`)
- Test: `tests/preview.test.mjs`

**Interfaces:**
- Consumes: `previewMerge`, `relationshipIds`, `canonicalJson`, `mergeError` (Task 2); `indexTree`, `attach` (`raw-tree.mjs`); `describeItem` (`merge-report.mjs`).
- Produces:
  - `previewModel(baseRaw|null, { delta } | { plan }) → { raw, changes, relChanges, pending, keep, plan }`
    - `changes: Map<elementId, { kind: 'added'|'changed'|'removed'|'retired', fields?: Array<{ field, before, after }> }>`
    - `relChanges: Map<relationshipId, { kind, fields? }>` (mesmos `kind`)
    - `pending: Map<elementId | relationshipId | 'view:<key>', Array<{ n, key, question, assumed }>>`
    - `keep: Set<id>` — elementos e relações `removed`/`retired` neste delta
  - erros: `E_PREVIEW_INPUT` (nenhum ou os dois insumos), `E_PREVIEW_BLOCKED` (com `.errors` e `.plan`)
  - `previewSummary(p) → string` no formato `+A ~C −R[, N decisão(ões) pendente(s)]`

- [ ] **Step 1: Write the failing tests** — `tests/preview.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewModel, previewSummary } from '../scripts/lib/preview.mjs';
import { planMerge, applyPlan, canonicalJson } from '../scripts/lib/merge.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';

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
const TODAY = { today: '2026-10-01' };

test('added, changed, removed and retired elements are told apart', () => {
  const d = delta(
    { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }, { id: 'loja.web', type: 'c4:container', technology: 'Next.js 15' }] },
    { ops: [{ op: 'remove', id: 'loja.db' }, { op: 'status', id: 'k8s', status: 'retired', reason: 'ECS' }] },
  );
  const p = previewModel(shop(), { delta: d });
  assert.equal(p.changes.get('loja.worker').kind, 'added');
  assert.deepEqual(p.changes.get('loja.web'), { kind: 'changed', fields: [{ field: 'technology', before: 'Next.js', after: 'Next.js 15' }] });
  assert.equal(p.changes.get('loja.db').kind, 'removed');
  assert.equal(p.changes.get('k8s').kind, 'retired');
  assert.equal(p.changes.has('cliente'), false);
  assert.equal(previewSummary(p), '+1 ~1 −2, 3 decisão(ões) pendente(s)');
});

test('removed elements come back as ghosts under their parent, with the relationships that fall with them', () => {
  const p = previewModel(shop(), { delta: delta({}, { ops: [{ op: 'remove', id: 'loja.api' }] }) });
  assert.ok(find(p.raw, 'loja').children.some(c => c.id === 'loja.api'), 'ghost nested in its old parent');
  assert.ok(find(p.raw, 'loja.api').children.some(c => c.id === 'loja.api.checkout'), 'descendants come back nested too');
  assert.equal(p.changes.get('loja.api.checkout').kind, 'removed');
  assert.equal([...p.relChanges.values()].filter(c => c.kind === 'removed').length, 7);
  assert.deepEqual(validateModel(p.raw).errors, [], 'the preview model is valid');
  assert.ok(p.keep.has('loja.api') && p.keep.has('loja.api.checkout'));
});

test('a duplicate answered "same" is a change of the base element, never removed + added', () => {
  const d = delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', description: 'Adquirente', external: true }] });
  const plan = planMerge(shop(), d, TODAY);
  plan.items.find(i => i.key === 'dup:gateway-pag').resolution = 'same';
  const p = previewModel(shop(), { plan });
  assert.equal(p.changes.has('gateway-pag'), false);
  assert.equal(p.changes.get('pagamentos').kind, 'changed');
  assert.ok([...p.changes.values()].every(c => c.kind !== 'removed'));
});

test('open questions are attached to what they are about; a possible duplicate shows on both sides', () => {
  const p = previewModel(shop(), { delta: delta({ elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos' }] }) });
  const [q] = p.pending.get('pagamentos');
  assert.equal(q.key, 'dup:gateway-pag');
  assert.equal(q.assumed, 'different');
  assert.match(q.question, /possível duplicata/);
  assert.equal(p.pending.get('gateway-pag')[0].key, 'dup:gateway-pag');
});

test('a plan uses its answers; open ones take the plan default', () => {
  const plan = planMerge(shop(), delta({ elements: [{ id: 'loja.api', technology: 'Kotlin' }, { id: 'loja.web', technology: 'Remix' }] }), TODAY);
  plan.items.find(i => i.key === 'el:loja.api:technology').resolution = 'keep';
  const p = previewModel(shop(), { plan });
  assert.equal(find(p.raw, 'loja.api').technology, 'Spring');
  assert.equal(find(p.raw, 'loja.web').technology, 'Remix');
  assert.equal(p.pending.has('loja.api'), false);
  assert.equal(p.pending.get('loja.web')[0].assumed, 'take');
});

test('without ghosts, the preview of a fully answered plan is exactly what apply writes', () => {
  const d = delta({
    elements: [{ id: 'loja.api', technology: 'Kotlin' }, { id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }],
    relationships: [{ from: 'loja.worker', to: 'loja.db' }],
  });
  const plan = planMerge(shop(), d, TODAY);
  for (const it of plan.items) if ('resolution' in it) it.resolution = 'take';
  const p = previewModel(shop(), { plan });
  const { changelog, ...applied } = applyPlan(shop(), plan, TODAY).raw;
  assert.equal(canonicalJson(p.raw), canonicalJson(applied));
});

test('a blocked plan cannot be previewed; inputs are never mutated; exactly one input is required', () => {
  const base = shop();
  assert.throws(() => previewModel(base, { delta: delta({ relationships: [{ from: 'loja.api', to: 'pagamentoz' }] }) }), /E_PREVIEW_BLOCKED/);
  const d = delta({ elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }, { ops: [{ op: 'remove', id: 'loja.db' }] });
  const copy = structuredClone(d);
  previewModel(base, { delta: d });
  assert.deepEqual(base, shop());
  assert.deepEqual(d, copy);
  assert.throws(() => previewModel(base, {}), /E_PREVIEW_INPUT/);
  assert.throws(() => previewModel(base, { delta: d, plan: planMerge(base, d, TODAY) }), /E_PREVIEW_INPUT/);
});

test('a delta on a missing base previews everything as added', () => {
  const p = previewModel(null, { delta: delta({ elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }] }, { name: 'Nova' }) });
  assert.deepEqual([...p.changes], [['sis', { kind: 'added' }]]);
  assert.equal(previewSummary(p), '+1 ~0 −0');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/preview.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/preview.mjs'`.

- [ ] **Step 3: Export `describeItem`** — em `scripts/lib/merge-report.mjs`, troque `function describeItem(it) {` por `export function describeItem(it) {`.

- [ ] **Step 4: Create `scripts/lib/preview.mjs`**

```js
// Preview of an unmerged delta (or a partly answered plan): the model the merge would produce, what changed
// against the base, the questions still open, and removed items kept as "ghosts" so views can show what goes
// away. Pure: never writes, never mutates its inputs.
import { previewMerge, relationshipIds, canonicalJson, mergeError } from './merge.mjs';
import { indexTree, attach } from './raw-tree.mjs';
import { describeItem } from './merge-report.mjs';

const ELEMENT_COMPARED = ['name', 'type', 'description', 'technology', 'external', 'archimate', 'parent', 'status', 'statusReason', 'tags', 'aliases', 'properties', 'owner', 'url'];
const REL_COMPARED = ['description', 'technology', 'accessType', 'status', 'statusReason', 'tags', 'properties'];
const ASSUMED = { conflict: 'take', 'possible-duplicate': 'different', op: 'yes' };

const elementValue = (entry, f) => (f === 'parent' ? entry.parent ?? undefined : f === 'status' ? entry.el.status ?? 'active' : entry.el[f]);
const relValue = (r, f) => (f === 'status' ? r.status ?? 'active' : r[f]);
const diff = (names, a, b, get) => names
  .filter(f => canonicalJson(get(a, f)) !== canonicalJson(get(b, f)))
  .map(f => ({ field: f, before: get(a, f), after: get(b, f) }));
const turnedRetired = (before, after) => after.status === 'retired' && (before.status ?? 'active') !== 'retired';
const byId = ids => new Map([...ids].map(([r, id]) => [id, r]));

export function previewModel(baseRaw, { delta, plan } = {}) {
  if (!delta === !plan) throw mergeError('E_PREVIEW_INPUT', 'informe um delta ou um plano (e não os dois)');
  const answers = plan ? new Map(plan.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution])) : undefined;
  const merged = previewMerge(baseRaw, plan ? plan.delta : delta, { answers, ...(plan?.base ? { base: plan.base } : {}) });
  if (merged.plan.blocked) {
    throw mergeError('E_PREVIEW_BLOCKED', `o plano está bloqueado (${merged.plan.errors.length} erro(s)); corrija o delta antes de pré-visualizar`,
      { errors: merged.plan.errors, plan: merged.plan });
  }
  const raw = merged.raw; // a private clone: runMerge never shares objects with the base or the delta

  const before = baseRaw ? indexTree(baseRaw) : new Map();
  const after = indexTree(raw);
  const changes = new Map();
  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) { changes.set(id, { kind: 'added' }); continue; }
    const fields = diff(ELEMENT_COMPARED, b, a, elementValue);
    if (fields.length) changes.set(id, { kind: turnedRetired(b.el, a.el) ? 'retired' : 'changed', fields });
  }
  // Ghosts: removed elements go back under their old parent (indexTree walks top-down, so parents come first).
  for (const [id, b] of before) {
    if (after.has(id)) continue;
    const { children, ...el } = structuredClone(b.el);
    attach(raw, after, el, b.parent != null && after.has(b.parent) ? b.parent : null);
    changes.set(id, { kind: 'removed' });
  }

  const beforeRels = byId(baseRaw ? relationshipIds(baseRaw) : new Map());
  const afterRels = byId(relationshipIds(raw));
  const relChanges = new Map();
  for (const [id, r] of afterRels) {
    const b = beforeRels.get(id);
    if (!b) { relChanges.set(id, { kind: 'added' }); continue; }
    const fields = diff(REL_COMPARED, b, r, relValue);
    if (fields.length) relChanges.set(id, { kind: turnedRetired(b, r) ? 'retired' : 'changed', fields });
  }
  for (const [id, r] of beforeRels) {
    if (afterRels.has(id)) continue;
    raw.model.relationships.push({ ...structuredClone(r), id });
    relChanges.set(id, { kind: 'removed' });
  }

  const gone = ([, c]) => c.kind === 'removed' || c.kind === 'retired';
  const keep = new Set([...[...changes].filter(gone), ...[...relChanges].filter(gone)].map(([id]) => id));
  return { raw, changes, relChanges, pending: pendingByTarget(merged.plan, merged.idMap), keep, plan: merged.plan };
}

/** Open questions of the plan (applicable `when` only), keyed by the element / relationship / view they are about. */
function pendingByTarget(plan, idMap) {
  const answered = new Map(plan.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution]));
  const applies = it => {
    if (!it.when) return true;
    const at = it.when.lastIndexOf('=');
    return answered.get(it.when.slice(0, at)) === it.when.slice(at + 1);
  };
  const out = new Map();
  const add = (id, entry) => {
    if (id == null) return;
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(entry);
  };
  for (const it of plan.items) {
    if (!('resolution' in it) || it.resolution != null || !applies(it)) continue;
    const entry = { n: it.n, key: it.key, question: describeItem(it), assumed: ASSUMED[it.class] ?? null };
    if (it.class === 'possible-duplicate') {
      add(idMap.get(it.target) ?? it.target, entry);
      add(it.candidate, entry);
    } else if (it.kind === 'view') add(`view:${it.target}`, entry);
    else add(it.target, entry);
  }
  return out;
}

export function previewSummary(p) {
  const count = kinds => [...p.changes.values()].filter(c => kinds.includes(c.kind)).length;
  const questions = new Set([...p.pending.values()].flat().map(e => e.key)).size;
  return `+${count(['added'])} ~${count(['changed'])} −${count(['removed', 'retired'])}${questions ? `, ${questions} decisão(ões) pendente(s)` : ''}`;
}
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/preview.test.mjs && npm test`
Expected: PASS. Se `'+1 ~1 −2, 3 decisão(ões) pendente(s)'` falhar, liste `p.pending` e confira: conflito de `technology` em
`loja.web`, `remove` de `loja.db` e `retired` de `k8s` — três perguntas. Não mude a asserção sem entender a diferença.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/preview.mjs scripts/lib/merge-report.mjs tests/preview.test.mjs
git -c safe.directory="$PWD" commit -m "feat(preview): modelo da prévia com mudanças, fantasmas e decisões pendentes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 4: visões na prévia — `keep` e `annotateView`

**Files:**
- Modify: `scripts/lib/query.mjs`
- Modify: `scripts/lib/preview.mjs` (acrescentar `annotateView`)
- Test: `tests/query.test.mjs`, `tests/preview.test.mjs`

**Interfaces:**
- Consumes: `previewModel` (Task 3).
- Produces: `filterByStatus(model, allowed?, keep?: Set<id>)`; `resolveView(model, spec, { keep }?)`;
  `annotateView(view, preview) → view` — nós ganham `change`, `changeFields`, `pending`; arestas ganham `change`, `pending`.

- [ ] **Step 1: Write the failing tests**

Em `tests/query.test.mjs`, ao final:

```js
test('resolveView can keep ids visible that the status filter would hide (preview ghosts)', () => {
  const m = modelWith(r => { findRaw(r, 'loja.db').status = 'retired'; });
  assert.ok(!ids(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' })).includes('loja.db'));
  assert.ok(ids(resolveView(m, { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: new Set(['loja.db']) })).includes('loja.db'));
});
```

Em `tests/preview.test.mjs`, troque o import de `preview.mjs` por
`import { previewModel, previewSummary, annotateView } from '../scripts/lib/preview.mjs';`, acrescente
`import { normalizeModel } from '../scripts/lib/model.mjs';` e `import { resolveView } from '../scripts/lib/query.mjs';`, e ao final:

```js
test('views keep ghosts and retired-in-this-delta items visible, and are annotated', () => {
  const d = delta(
    { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] },
    { ops: [{ op: 'remove', id: 'loja.db' }, { op: 'status', id: 'pagamentos', status: 'retired' }] },
  );
  const p = previewModel(shop(), { delta: d });
  const v = annotateView(resolveView(normalizeModel(p.raw), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: p.keep }), p);
  const node = id => v.nodes.find(n => n.id === id);
  assert.equal(node('loja.worker').change, 'added');
  assert.equal(node('loja.db').change, 'removed');
  assert.equal(node('pagamentos').change, 'retired');
  assert.equal(node('loja.db').pending[0].key, 'op:0');
  assert.equal(node('loja.web').change, undefined);
  const toDb = v.edges.find(e => e.to === 'loja.db');
  assert.equal(toDb.change, 'removed');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/query.test.mjs tests/preview.test.mjs`
Expected: FAIL — `loja.db` ausente com `keep`; `annotateView` não exportado.

- [ ] **Step 3: `keep` in `scripts/lib/query.mjs`**

Troque a assinatura e o corpo inicial de `filterByStatus` por:

```js
/**
 * The model as a view sees it: elements (and everything nested in them) and relationships whose status is
 * allowed, plus the ids in `keep` (a preview keeps what the delta removes or retires visible as ghosts).
 */
export function filterByStatus(model, allowed = DEFAULT_STATUS, keep = new Set()) {
  const ok = new Set(allowed);
  const shown = id => {
    if (keep.has(id)) return true;
```

(o restante de `shown` fica igual), e troque a linha de `relationships` por:

```js
  const relationships = model.relationships.filter(r => elements.has(r.from) && elements.has(r.to) && (ok.has(r.status ?? 'active') || keep.has(r.id)));
```

Em `resolveView`, troque a assinatura `export function resolveView(model, spec) {` por
`export function resolveView(model, spec, { keep } = {}) {` e a linha `const visible = filterByStatus(model, status);` por
`const visible = filterByStatus(model, status, keep);`.

- [ ] **Step 4: `annotateView` in `scripts/lib/preview.mjs`** — ao final do arquivo:

```js
/** Marks a resolved view (IR) with the preview: node.change / changeFields / pending, edge.change / pending. */
export function annotateView(view, p) {
  for (const n of view.nodes) {
    const c = p.changes.get(n.id);
    if (c) {
      n.change = c.kind;
      if (c.fields) n.changeFields = c.fields;
    }
    const q = p.pending.get(n.id);
    if (q) n.pending = q;
  }
  for (const e of view.edges) {
    const kinds = (e.relIds || []).map(id => p.relChanges.get(id)?.kind ?? 'same');
    if (kinds.length && kinds.every(k => k === 'removed' || k === 'retired')) e.change = 'removed';
    else if (kinds.length && kinds.every(k => k === 'added')) e.change = 'added';
    else if (kinds.some(k => k !== 'same')) e.change = 'changed';
    const q = (e.relIds || []).flatMap(id => p.pending.get(id) ?? []);
    if (q.length) e.pending = q;
  }
  return view;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/query.mjs scripts/lib/preview.mjs tests/query.test.mjs tests/preview.test.mjs
git -c safe.directory="$PWD" commit -m "feat(preview): visões mantêm fantasmas visíveis e recebem as marcas da prévia

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 5: renderização da prévia — marcadores, banner, painel e legenda

**Files:**
- Modify: `scripts/lib/render.mjs`
- Test: `tests/render.test.mjs`

**Interfaces:**
- Consumes: IR anotado por `annotateView` (Task 4); `sketchy`, `sketchShape`, `sketchDefs`, tokens `--sketch-ink`/`--removed`/`--pending` (Task 1).
- Produces: `renderHtml({ title, subtitle?, views, preview?: { label: string } })`; classes `ch-added|ch-changed|ch-removed|ch-retired`, `pending`;
  `<g class="mark m-<kind>">` e `<g class="mark m-pending">`; `<div class="preview-banner">`; `<body class="preview">`;
  `viewData` com `change`, `changeFields`, `pending` nos nós e `change`, `pending` nas arestas.

- [ ] **Step 1: Write the failing test** — em `tests/render.test.mjs`, acrescente os imports
`import { previewModel, annotateView } from '../scripts/lib/preview.mjs';` e ao final:

```js
test('preview marks, banner and drawer data are rendered; a normal render has none of them', async () => {
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
    model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }, { id: 'loja.web', type: 'c4:container', technology: 'Remix' }] },
    ops: [{ op: 'remove', id: 'loja.db' }] };
  const p = previewModel(raw(), { delta: d });
  const v = annotateView(resolveView(normalizeModel(p.raw), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }, { keep: p.keep }), p);
  const html = renderHtml({ title: 't', views: [await layoutView(v)], preview: { label: 'delta de teste' } });
  assert.match(html, /<div class="preview-banner" role="status">PRÉVIA · não é a base oficial — delta de teste<\/div>/);
  assert.match(html, /<body class="preview">/);
  assert.match(html, /class="node c4 [^"]*sketchy ch-added"/);
  assert.match(html, /class="node c4 [^"]*ch-changed pending"/);
  assert.match(html, /class="node c4 [^"]*ch-removed pending"/);
  assert.match(html, /<g class="mark m-pending">/);
  assert.match(html, /<g class="strike">/);
  assert.match(html, /class="edge [^"]*ch-removed"/);
  assert.match(html, /mudanças da prévia/);
  const data = JSON.parse(html.match(/<script id="archlens-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.views[0].nodes['loja.web'].changeFields, [{ field: 'technology', before: 'Next.js', after: 'Remix' }]);
  assert.equal(data.views[0].nodes['loja.db'].pending[0].assumed, 'yes');
  const plain = renderHtml({ title: 't', views: [await layoutView(resolveView(normalizeModel(raw()), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' }))] });
  assert.doesNotMatch(plain, /preview-banner|class="mark /);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/render.test.mjs`
Expected: FAIL — banner e marcadores ausentes.

- [ ] **Step 3: Implement in `scripts/lib/render.mjs`**

Logo após `sketchShape`, acrescente:

```js
const MARK = { added: '+', changed: '~', removed: '−', retired: '−' };
const changeClass = n => `${n.change ? ` ch-${n.change}` : ''}${n.pending?.length ? ' pending' : ''}`;

/** Preview decorations over a node: sketch outline (changed), sketch strike (removed/retired), corner markers. */
function decorations(n, prefix) {
  const { x, y, w, h } = n;
  let out = '';
  if (n.change === 'changed') {
    out += `<rect class="ch-outline" x="${f(x - 7)}" y="${f(y - 7)}" width="${f(w + 14)}" height="${f(h + 14)}" rx="16" filter="url(#${prefix}-sk1)"/>`;
  }
  if (n.change === 'removed' || n.change === 'retired') {
    out += `<g class="strike"><line x1="${f(x + 4)}" y1="${f(y + 4)}" x2="${f(x + w - 4)}" y2="${f(y + h - 4)}" filter="url(#${prefix}-sk1)"/>`
      + `<line x1="${f(x + 4)}" y1="${f(y + h - 4)}" x2="${f(x + w - 4)}" y2="${f(y + 4)}" filter="url(#${prefix}-sk2)"/></g>`;
  }
  const mark = (cls, cx, glyph) => `<g class="mark ${cls}"><circle cx="${f(cx)}" cy="${f(y + 2)}" r="14"/>`
    + `<text x="${f(cx)}" y="${f(y + 3)}" font-size="19" font-weight="700" text-anchor="middle" dominant-baseline="middle">${glyph}</text></g>`;
  if (n.change) out += mark(`m-${n.change}`, x + w - 2, MARK[n.change]);
  if (n.pending?.length) out += mark('m-pending', x + w - (n.change ? 34 : 2), '?');
  return out;
}
```

Em `c4Node`: na linha `const cls = …`, troque o final `${sketchy(n) ? ' sketchy' : ''}\`;` por `${sketchy(n) ? ' sketchy' : ''}${changeClass(n)}\`;`
e no `return`, troque `>${shape}${t}</g>\`;` por `>${shape}${t}${decorations(n, prefix)}</g>\`;`.

Em `amNode`: na linha `const cls = …`, troque o final `${sketchy(n) ? ' sketchy' : ''}\`;` por `${sketchy(n) ? ' sketchy' : ''}${changeClass(n)}\`;`
e no `return`, troque a última linha `+ '</g>';` por `+ decorations(n, prefix) + '</g>';`.

Em `edge`: na abertura do `<g class="edge …`, troque `${e.status === 'draft' || e.change === 'added' ? ' sketchy' : ''}"` por
`${e.status === 'draft' || e.change === 'added' ? ' sketchy' : ''}${e.change ? \` ch-${e.change}\` : ''}"`.

Em `legend(v)`, logo antes de `return \`<ul>…`, acrescente:

```js
  if (v.nodes.some(n => n.change || n.pending?.length)) {
    const markSample = (cls, glyph) => `<svg class="sample" viewBox="0 0 64 20" width="64" height="20" aria-hidden="true"><g class="mark ${cls}"><circle cx="32" cy="10" r="9"/><text x="32" y="11" font-size="13" font-weight="700" text-anchor="middle" dominant-baseline="middle">${glyph}</text></g></svg>`;
    items.push('<li><b>mudanças da prévia</b></li>',
      `<li>${markSample('m-added', '+')}<span>novo neste delta (em esboço)</span></li>`,
      `<li>${markSample('m-changed', '~')}<span>alterado (contorno em esboço)</span></li>`,
      `<li>${markSample('m-removed', '−')}<span>removido ou desativado (riscado)</span></li>`,
      `<li>${markSample('m-pending', '?')}<span>decisão pendente no plano</span></li>`);
  }
```

Em `viewData`, nos nós, troque `statusReason: n.statusReason ?? '',` por
`statusReason: n.statusReason ?? '', change: n.change ?? null, changeFields: n.changeFields ?? [], pending: n.pending ?? [],`;
nas arestas, troque `step: e.step ?? null,` por `step: e.step ?? null, change: e.change ?? null, pending: e.pending ?? [],`.

Em `renderHtml`: troque a assinatura por `export function renderHtml({ title, subtitle = '', views, preview }) {`;
troque `<body>` por `<body${preview ? ' class="preview"' : ''}>`; e logo após `</header>` acrescente
`${preview ? \`<div class="preview-banner" role="status">PRÉVIA · não é a base oficial — ${esc(preview.label)}</div>\` : ''}`.

No CSS, depois das regras `.node.sketchy …` / `.edge.sketchy …` da Task 1, acrescente:

```css
.node.ch-removed,.node.ch-retired,.edge.ch-removed{opacity:.5}
.node .strike line{stroke:var(--removed);stroke-width:3}
.node .ch-outline{fill:none;stroke:var(--sketch-ink);stroke-width:2.2}
.mark circle{fill:var(--panel);stroke:var(--sketch-ink);stroke-width:1.8}
.mark text{fill:var(--sketch-ink)}
.mark.m-removed circle,.mark.m-retired circle{stroke:var(--removed)}
.mark.m-removed text,.mark.m-retired text{fill:var(--removed)}
.mark.m-pending circle{fill:var(--pending);stroke:var(--pending)}
.mark.m-pending text{fill:#1a1a1a}
.preview-banner{position:fixed;inset:var(--bar-h) 0 auto 0;height:32px;display:flex;align-items:center;justify-content:center;padding:0 16px;background:var(--pending);color:#1a1a1a;font-weight:600;font-size:14px;z-index:19;text-align:center}
body.preview .stage{inset:calc(var(--bar-h) + 32px) 0 0 0}
body.presenting .preview-banner{top:0}
body.presenting.preview .stage{inset:32px 0 0 0}
```

No painel (`openDrawer`), logo antes de `const rels = …`, acrescente
`const fmt = x => (x === undefined || x === null ? '—' : typeof x === 'string' ? x : JSON.stringify(x));`; e logo após a linha do `statusReason`
(Task 1), acrescente:

```js
    if (n.change) h += '<p class="warn">' + escH({ added: 'Novo neste delta.', changed: 'Alterado por este delta.', removed: 'Removido por este delta: sai da base junto com o que o plano lista.', retired: 'Desativado por este delta.' }[n.change]) + '</p>';
    if (n.changeFields && n.changeFields.length) h += '<h3>Mudanças</h3><ul>' + n.changeFields.map(c => '<li><b>' + escH(c.field) + '</b>: ' + escH(fmt(c.before)) + ' → ' + escH(fmt(c.after)) + '</li>').join('') + '</ul>';
    if (n.pending && n.pending.length) h += '<h3>Decisões pendentes</h3><ul>' + n.pending.map(q => '<li>[' + q.n + '] ' + escH(q.question) + (q.assumed ? ' <span class="chip">a prévia assume: ' + escH(q.assumed) + '</span>' : '') + '</li>').join('') + '</ul>';
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/lib/render.mjs tests/render.test.mjs
git -c safe.directory="$PWD" commit -m "feat(render): marcadores da prévia, fantasmas riscados, banner e painel de mudanças

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 6: CLI — `--delta` / `--plan` em `render`, `deliver`, `build`, `resolve`, `views`

**Files:**
- Modify: `scripts/archlens.mjs`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `previewModel`, `previewSummary`, `annotateView` (Tasks 3–4); `hashRaw` (merge); `renderHtml({ …, preview })` (Task 5).
- Produces: `loadPreview(file, args) → preview & { label, name }`; `buildHtml(raw, specs, title, preview?)`; `deliver(raw, specs, out, args, preview?)`.

- [ ] **Step 1: Write the failing tests** — em `tests/cli.test.mjs`, ao final:

```js
const previewDelta = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
  model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }, ops: [{ op: 'remove', id: 'loja.db' }] };

test('render --delta draws the preview and leaves ARCHITECTURE.md untouched', () => {
  const dir = setup();
  const before = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--out', 'p.html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prévia de d\.json · \+1 ~0 −1, 1 decisão\(ões\) pendente\(s\)/);
  assert.match(readFileSync(join(dir, 'p.html'), 'utf8'), /PRÉVIA · não é a base oficial — d\.json/);
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), before);
});

test('build --delta writes <delta>-preview.html and never the knowledge base', () => {
  const dir = setup();
  const before = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['build', 'ARCHITECTURE.md', '--delta', 'd.json'], dir);
  assert.ok([0, 3].includes(r.status), r.stderr);
  assert.ok(existsSync(join(dir, 'd-preview.html')));
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), before);
});

test('render --plan uses the plan answers; --delta with --plan is refused', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  assert.equal(run(['merge', 'ARCHITECTURE.md', 'd.json', '--plan', 'p.json'], dir).status, 0);
  const viaPlan = run(['render', 'ARCHITECTURE.md', '--plan', 'p.json', '--out', 'q.html'], dir);
  assert.equal(viaPlan.status, 0, viaPlan.stderr);
  const both = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--plan', 'p.json', '--out', 'x.html'], dir);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /--delta ou --plan/);
  assert.ok(!existsSync(join(dir, 'x.html')));
});

test('in a preview, a view that does not open is skipped with a warning', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--view', 'ctx', '--spec', '{"key":"x","notation":"c4","level":"context","scope":"nada"}', '--out', 'p.html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /visão "x" não abre na prévia/);
});

test('resolve --delta prints the annotated IR; a preview of a missing base shows everything as new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'd.json'), JSON.stringify({ 'archlens-delta': '1.0', model: { elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }, { id: 'u', type: 'c4:person', name: 'Usuário' }], relationships: [{ from: 'u', to: 'sis' }] } }));
  const r = run(['resolve', 'ARCHITECTURE.md', '--delta', 'd.json', '--spec', '{"key":"l","notation":"c4","level":"landscape"}'], dir);
  assert.equal(r.status, 0, r.stderr);
  const ir = JSON.parse(r.stdout);
  assert.deepEqual(ir.nodes.map(n => n.change).sort(), ['added', 'added']);
  assert.ok(!existsSync(join(dir, 'ARCHITECTURE.md')));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — `--delta` ignorado (sem banner, sem `prévia de`).

- [ ] **Step 3: Implement in `scripts/archlens.mjs`**

Acrescente aos imports:

```js
import { previewModel, previewSummary, annotateView } from './lib/preview.mjs';
```

e troque o import de `merge.mjs` por
`import { planMerge, applyPlan, mergeError, canonicalJson, hashRaw, PLAN_VERSION } from './lib/merge.mjs';`.

No `HELP`, logo antes da linha `Opções`, acrescente:

```
Prévia de um delta ainda não mergeado (render/deliver/build/resolve/views; nunca grava o ARCHITECTURE.md)
  --delta D           a base com o delta D aplicado (decisões pendentes no padrão do plano)
  --plan P            idem, a partir de um plano (usa as respostas já dadas)

```

Depois de `answersFrom`, acrescente:

```js
/** Preview mode (--delta / --plan): the model with the delta applied, never written; exits on bad input. */
function loadPreview(file, args) {
  if (args.delta && args.plan) fail('use --delta ou --plan, não os dois');
  const input = args.delta ?? args.plan;
  if (input === true) fail('informe o arquivo: --delta <delta.json> ou --plan <plano.json>');
  const baseRaw = file && existsSync(file) ? loadRaw(file) : null;
  const doc = readJson(input);
  if (args.plan && doc.baseHash && doc.baseHash !== hashRaw(baseRaw)) {
    console.warn('  aviso: a base mudou depois deste plano; a prévia usa a base atual');
  }
  let p;
  try { p = previewModel(baseRaw, args.delta ? { delta: doc } : { plan: doc }); } catch (e) {
    if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
    fail(e.message, 2);
  }
  p.label = `${basename(input)} · ${previewSummary(p)}`;
  p.name = `${basename(input).replace(/\.json$/i, '')}-preview`;
  return p;
}
```

Substitua `buildHtml` por:

```js
async function buildHtml(raw, specs, title, preview) {
  const { errors } = validateModel(raw);
  if (errors.length) { printIssues(errors, 'ERRO'); fail(`${errors.length} erro(s) no modelo; corrija antes de renderizar`, 2); }
  const model = normalizeModel(raw);
  const laid = [];
  for (const spec of specs) {
    let view;
    try { view = resolveView(model, spec, preview ? { keep: preview.keep } : {}); } catch (e) {
      if (preview) { console.warn(`  aviso: visão "${spec.key}" não abre na prévia: ${e.message}`); continue; }
      fail(`visão "${spec.key}": ${e.message}`, 2);
    }
    if (preview) annotateView(view, preview);
    if (!view.nodes.length) { console.warn(`  aviso: visão "${spec.key}" ficou vazia — revise scope/anchor/filtros`); continue; }
    if (view.nodes.length > 40) console.warn(`  aviso: visão "${spec.key}" tem ${view.nodes.length} nós; considere focus/depth, collapse ou layers`);
    const l = await layoutView(view);
    if (l.layoutStyle) console.log(`  layout "${spec.key}": ${l.layoutStyle}${l.layoutAuto ? ` (auto; ${Object.entries(l.layoutScores).map(([k, q]) => `${k} ${q.score}`).join(', ')})` : ' (pedido na visão)'}`);
    const leg = legibility(l, 1920, 1080 - 56);
    if (!leg.ok) console.warn(`  aviso: "${spec.key}": ${leg.suggestion}`);
    laid.push(l);
  }
  if (!laid.length) fail('nenhuma visão com conteúdo', 2);
  const subtitle = `${laid.length} visão(ões) · archlens${preview ? ' · prévia' : ''}`;
  return { html: renderHtml({ title: title ?? model.name, subtitle, views: laid, ...(preview ? { preview: { label: preview.label } } : {}) }), laid };
}
```

Em `deliver`, troque a assinatura por `async function deliver(raw, specs, out, args, preview) {` e a primeira linha por
`const { html } = await buildHtml(raw, specs, args.title, preview);`.

No `main`, logo após `if (!cmd || args.help || cmd === 'help') { console.log(HELP); return; }`, acrescente:

```js
  const previewing = ['render', 'deliver', 'build', 'resolve', 'views'].includes(cmd) && (args.delta || args.plan);
  const preview = previewing ? loadPreview(file, args) : null;
  if (preview && cmd !== 'resolve') console.log(`prévia de ${preview.label}`);
  const load = () => (preview ? preview.raw : loadRaw(file));
```

e, nos casos `views`, `resolve`, `render`, `deliver`, `build`, troque `loadRaw(file)` por `load()`. Além disso:

- `resolve`: troque `const out = specs.map(s => resolveView(model, s));` por
  `const out = specs.map(s => { const v = resolveView(model, s, preview ? { keep: preview.keep } : {}); return preview ? annotateView(v, preview) : v; });`
- `render`: troque `await buildHtml(raw, selectSpecs(model, args), args.title)` por `await buildHtml(raw, selectSpecs(model, args), args.title, preview)`.
- `deliver`: troque `await deliver(raw, selectSpecs(model, args), args.out, args)` por `await deliver(raw, selectSpecs(model, args), args.out, args, preview)`.
- `build`: substitua o corpo do caso por:

```js
    case 'build': {
      const raw = load();
      const model = normalizeModel(raw);
      const dir = args['out-dir'] && args['out-dir'] !== true ? args['out-dir'] : dirname(file);
      mkdirSync(dir, { recursive: true });
      if (!preview) {
        const docPath = join(dir, 'ARCHITECTURE.md');
        const { errors } = validateModel(raw);
        if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros do modelo', 2); }
        const existing = existsSync(docPath) ? readFileSync(docPath, 'utf8') : extname(file).toLowerCase() === '.md' ? readFileSync(file, 'utf8') : undefined;
        atomicWrite(docPath, generateDoc(raw, { existing }));
        console.log(`✓ ${docPath}`);
      }
      const base = args.name && args.name !== true ? args.name
        : preview ? preview.name
          : basename(file).replace(/\.(json|md)$/i, '').replace(/^ARCHITECTURE$/i, 'architecture').replace(/\.model$/, '');
      const problems = await deliver(raw, selectSpecs(model, args), join(dir, `${base}.html`), args, preview);
      process.exitCode = problems ? 3 : 0;
      break;
    }
```

Obs.: no teste de `resolve` com base inexistente, `dirname(file)` não é usado; `loadPreview` aceita base ausente (`baseRaw = null`).

- [ ] **Step 4: Run tests**

Run: `node --test tests/cli.test.mjs && npm test`
Expected: PASS. (O teste de `build` aceita saída 0 ou 3: 3 são alertas de legibilidade; sem Chromium a checagem visual é pulada.)

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="$PWD" add scripts/archlens.mjs tests/cli.test.mjs
git -c safe.directory="$PWD" commit -m "feat(cli): prévia com --delta/--plan em render, deliver, build, resolve e views

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 7: exemplo de prévia no telemedicina

**Files:**
- Create: `examples/telemedicina/delta-02.json`
- Generate: `examples/telemedicina/delta-02-preview.html` (screenshots em `delta-02-preview.shots/`, ignorados pelo git)

**Interfaces:**
- Consumes: CLI da Task 6; base `examples/telemedicina/ARCHITECTURE.md` (revisão 1: `tele.api` tem alias `api-agendamento`).

- [ ] **Step 1: Create `examples/telemedicina/delta-02.json`**

```json
{
  "archlens-delta": "1.0",
  "source": { "kind": "prompt", "ref": "rodada 2026-10-05: lembretes por SMS (em avaliação)", "date": "2026-10-05" },
  "summary": "Proposta: lembretes por SMS via fila, chatbot de triagem em discussão",
  "model": {
    "elements": [
      { "id": "tele.fila", "type": "c4:container", "name": "Fila de Lembretes", "parent": "tele", "technology": "Amazon SQS", "tags": ["queue"], "description": "Lembretes a enviar" },
      { "id": "sms", "type": "c4:softwareSystem", "name": "Gateway SMS", "external": true, "description": "Envio de SMS" },
      { "id": "tele.notificador", "type": "c4:container", "technology": "Node.js 22" },
      { "id": "agendamento-api", "type": "c4:container", "name": "Agendamento API", "parent": "tele", "technology": "Node.js" },
      { "id": "tele.chatbot", "type": "c4:container", "name": "Chatbot de Triagem", "parent": "tele", "technology": "Python", "status": "draft", "statusReason": "em discussão com a equipe médica" }
    ],
    "relationships": [
      { "from": "tele.api", "to": "tele.fila", "type": "uses", "description": "Agenda lembrete", "technology": "SQS" },
      { "from": "tele.notificador", "to": "tele.fila", "type": "uses", "description": "Consome lembretes", "technology": "SQS" },
      { "from": "tele.notificador", "to": "sms", "type": "uses", "description": "Envia lembrete", "technology": "HTTPS" }
    ]
  },
  "ops": [
    { "op": "remove", "id": "whatsapp" }
  ]
}
```

- [ ] **Step 2: Preview it (never merged)**

```bash
cp examples/telemedicina/ARCHITECTURE.md /tmp/tele-before.md
node scripts/archlens.mjs build examples/telemedicina/ARCHITECTURE.md --delta examples/telemedicina/delta-02.json
cmp examples/telemedicina/ARCHITECTURE.md /tmp/tele-before.md && echo "base intacta"
```
Expected: linha `prévia de delta-02.json · +4 ~1 −1, N decisão(ões) pendente(s)` (N ≥ 3: conflito de tecnologia do notificador, possível duplicata
`agendamento-api` ~ `tele.api`, remoção do `whatsapp`); `✓ examples/telemedicina/delta-02-preview.html`; `base intacta`.
Se o resumo diferir, rode `node scripts/archlens.mjs merge examples/telemedicina/ARCHITECTURE.md examples/telemedicina/delta-02.json --plan /tmp/p2.json`
e explique a diferença no relatório antes de seguir.

- [ ] **Step 3: Inspect** — abra `examples/telemedicina/delta-02-preview.shots/containers@1920x1080.png` e confira: banner amarelo
"PRÉVIA · não é a base oficial"; `Fila de Lembretes` em esboço com `+`; `Chatbot de Triagem` em esboço sem marcador (draft); `Worker de
Notificações` com contorno de esboço, `~` e `?`; `WhatsApp Business API` esmaecido, riscado, com `−` e `?`. Descreva o que viu no relatório.

- [ ] **Step 4: Commit**

```bash
git -c safe.directory="$PWD" add examples/telemedicina/delta-02.json examples/telemedicina/delta-02-preview.html
git -c safe.directory="$PWD" commit -m "feat(examples): delta-02 do telemedicina só para prévia (SMS via fila, chatbot em rascunho)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

### Task 8: skill, referências e guia

**Files:**
- Modify: `SKILL.md`, `references/merge.md`, `references/views.md`, `references/notation.md`, `docs/GUIA.md`, `README.md`

- [ ] **Step 1: `SKILL.md`**

No passo 4 do fluxo (começa com `4. **Planeje**:`), acrescente ao final do parágrafo:

```markdown
   **Mostre a prévia** antes das perguntas: `archlens deliver ARCHITECTURE.md --delta delta.json --out prévia.html`
   (ou `--plan plano.json` depois de algumas respostas). Novo aparece em esboço com `+`, alterado com `~`,
   removido riscado com `−`, decisão pendente com `?`. A prévia nunca grava a base.
```

Na tabela `## Pedido → view spec`, troque a linha `| como fica depois das mudanças (to-be) | acrescente \`status:["planned","active"]\` |` por:

```markdown
| como fica depois das mudanças (to-be) | acrescente `status:["draft","planned","active"]` (sem `draft` para só o decidido) |
| como fica se aplicarmos este delta? | `deliver ARCHITECTURE.md --delta delta.json` (prévia, nada é gravado) |
| e se eu responder X nesta pergunta? | responda no plano e rode `deliver ARCHITECTURE.md --plan plano.json` |
```

Em `## Erros comuns`, acrescente:

```markdown
- **Aplicar para "ver como fica"**: use a prévia (`--delta` / `--plan`). O apply grava a base e entra no histórico.
- **`draft` × `planned`**: `draft` é "em discussão"; `planned` é "decidido, ainda não existe".
```

- [ ] **Step 2: `references/merge.md`** — antes de `## Proveniência, ciclo de vida e histórico`, acrescente:

````markdown
## Pré-visualizando (antes do apply)

```bash
node scripts/archlens.mjs deliver ARCHITECTURE.md --delta delta.json --out prévia.html   # pendências no padrão do plano
node scripts/archlens.mjs deliver ARCHITECTURE.md --plan plano.json --out prévia.html    # usa as respostas já dadas
node scripts/archlens.mjs build ARCHITECTURE.md --delta delta.json                        # <delta>-preview.html; nunca o .md
```

A prévia roda o mesmo merge do plano e desenha a base com o delta aplicado:

| Marcador | Significado | No painel |
|---|---|---|
| esboço + `+` | novo neste delta | fonte do delta |
| contorno em esboço + `~` | alterado | antes → depois de cada campo |
| esmaecido, riscado, `−` | removido ou `retired` (fantasma: continua visível com as relações que caem) | o que sai junto |
| `?` amarelo | decisão pendente | a pergunta, o que a prévia assumiu e as alternativas |

Pendências assumem o padrão do plano: `take` em conflitos, `different` em duplicatas, `yes` em remoções. Plano
bloqueado não tem prévia. Com as mesmas respostas, a prévia mostra exatamente o que o apply gravaria.
````

E, na mesma página, troque `- \`status\`: \`planned\`, \`active\` (padrão), \`deprecated\`, \`retired\`.` por
`- \`status\`: \`draft\` (em discussão), \`planned\`, \`active\` (padrão), \`deprecated\`, \`retired\`. \`draft\` é desenhado em esboço.`

- [ ] **Step 3: `references/views.md` e `references/notation.md`**

Em `views.md`, na linha do campo `status`, troque `to-be: \`["planned","active"]\`` por `to-be: \`["draft","planned","active"]\``
e acrescente ao fim da célula: ` \`draft\` aparece em esboço.`

Em `notation.md`, troque `| \`status\` | não | \`planned\`, \`active\` (padrão), \`deprecated\`, \`retired\` |` por
`| \`status\` | não | \`draft\` (em discussão), \`planned\`, \`active\` (padrão), \`deprecated\`, \`retired\` |`
e `| \`E_STATUS\` | erro | \`status\` fora de planned/active/deprecated/retired |` por
`| \`E_STATUS\` | erro | \`status\` fora de draft/planned/active/deprecated/retired |`.

- [ ] **Step 4: `docs/GUIA.md` e `README.md`**

Em `docs/GUIA.md`, no fim da seção `## Evoluindo a base` (antes de `## Usando pela linha de comando`), acrescente:

```markdown
### Vendo antes de aplicar

Peça "mostre como fica" e o Claude gera a **prévia** do delta: a base oficial desenhada normalmente e, por
cima, o que muda — novo em esboço com `+`, alterado com `~`, removido riscado com `−`, decisão pendente com `?`.
Nada é gravado; responda as perguntas, veja a prévia de novo com `--plan` e só então aplique. Exemplo:
`examples/telemedicina/delta-02.json` e `delta-02-preview.html`.

Itens ainda em discussão podem entrar na base com `status: "draft"`: aparecem em esboço, sem marcador.
```

Em `README.md`, logo após o item `- **Base que evolui:** …`, acrescente:

```markdown
- **Prévia de mudanças:** `--delta` / `--plan` desenham a base com um delta ainda não aplicado (esboço à mão, `+ ~ − ?`,
  removidos riscados); o status `draft` marca o que ainda está em discussão.
```

- [ ] **Step 5: Check and commit**

```bash
npm test
grep -n '"planned","active"\]' SKILL.md references/*.md docs/GUIA.md
```
Expected: testes PASS; o `grep` só encontra a receita as-is/to-be já atualizada (com `draft`) ou nada.

```bash
git -c safe.directory="$PWD" add SKILL.md references/ docs/GUIA.md README.md
git -c safe.directory="$PWD" commit -m "docs: prévia de deltas e status draft na skill, referências e guia

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q"
```

---

## Verificação final

- [ ] `npm test` — tudo verde.
- [ ] `npm run examples` — sem erros além dos alertas de legibilidade já conhecidos; `git status` sem mudança inesperada no `ARCHITECTURE.md` além da data `generated:`.
- [ ] Regressão: `node scripts/archlens.mjs resolve examples/loja-online/ARCHITECTURE.md` antes e depois da branch (em `develop-v2` e aqui) difere apenas pelos campos novos `statusReason`/`status` em nós e arestas.
- [ ] Critérios do spec: (1) teste "without ghosts … exactly what apply writes" (Task 3); (2) testes de CLI que comparam o `ARCHITECTURE.md` antes/depois (Task 6); (3) screenshot da Task 7; (4) regressão acima.
