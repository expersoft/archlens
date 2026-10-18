# Contrato de conector (store v2) e conectores locais `json` e `markdown`

- **Data:** 2026-10-17
- **Branch:** `feat/store-connectors` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito
- **Depende de:** [formato canônico 2.0](2026-10-17-canonical-format-design.md) (e.1, PR #13)
- **Roadmap:** item e.2 de [`docs/superpowers/roadmap.md`](../roadmap.md)

## Contexto e objetivo

O archlens vai virar três skills (e.3) sobre um repositório de arquitetura que é a fonte da verdade, acessado por
conectores (os remotos — neo4j, gbrain via MCP, S3, relacional — no e.4). Hoje o store tem um contrato de arquivo
inteiro: `load()` devolve a base, `save(raw)` regrava tudo, e a versão é implícita (o plano guarda `hashRaw` da base e o
`apply` recusa com `E_PLAN_STALE`). Isso não serve a um conector de grafo ou de banco, onde "regravar tudo" é apagar e
recriar, nem à skill de merge do e.3, que precisa aplicar um delta resolvido de forma atômica e recusar se o store mudou
desde a comparação.

**Objetivo:** um contrato de conector com leitura (inteira e de subgrafo), gravação por operações atômicas com versão
otimista e histórico no próprio store; o conector `json` atual reescrito sobre ele; e um conector `markdown` novo — uma
pasta com um arquivo por elemento, organizada por tipo, que abre direto no Obsidian, importa no gbrain e prepara a
migração para um gbrain (por git sync ou MCP).

### Decisões do usuário

| Tema | Decisão |
|---|---|
| Papel da pasta de markdowns | Fonte de verdade escrita pelo archlens num layout legível para gbrain e Obsidian (opção B), que também serve de ponte para migrar para um gbrain (opção C) |
| Layout | Uma pasta por tipo de nó (`application-component/`, `business-actor/`, …) |
| Nome do arquivo | O id do elemento (`application-component/loja.pedidos.md`); o nome de exibição em `title`, `aliases` e no título do corpo |
| Contrato | Abordagem B: operações (`read`, `readSubgraph`, `version`, `apply(ops, { baseVersion })`, `history`) |

### Descoberta: gbrain e Obsidian

Lido no código do gbrain (`github.com/garrytan/gbrain`, commit `a723db6`, 2026-10-18) e no formato documentado do Obsidian:

- **gbrain:** markdown num repositório git é a fonte de verdade; índice em Postgres/pgvector (ou PGLite). O tipo de uma
  página vem do prefixo da pasta declarado no *schema pack* ativo (`page_types[].path_prefixes`); packs próprios são
  suportados (`gbrain schema use <pack>`). A identidade da página é o slug do caminho (`slugifySegment`: minúsculas, sem
  acento, espaço → hífen, **pontos mantidos**), então ids como `loja.pedidos` são slugs válidos. Ligações: wikilinks no
  estilo Obsidian no corpo (`[[pasta/slug]]`, `[[pasta/slug|Nome]]`) e campos do frontmatter declarados no pack como
  ligações tipadas (`frontmatter_links: { page_type, fields, link_type }`; sem contraparte declarada, a direção é
  página → alvo). `aliases` no frontmatter alimenta a deduplicação. O frontmatter é metadado de filtro; a busca indexa o
  corpo.
- **Obsidian:** pasta = vault; frontmatter YAML = propriedades; `aliases` e `tags` são reconhecidos; wikilinks no corpo e
  em propriedades (entre aspas) contam para o grafo e os backlinks.

Conclusão: uma pasta por tipo ArchiMate, um arquivo por elemento nomeado pelo id, wikilinks com caminho completo e campos
de ligação tipada no frontmatter funcionam nos dois, e um schema pack gerado pelo archlens faz o gbrain reconstruir o mesmo
grafo.

### Critérios de sucesso

1. O CLI usa só o contrato novo (`read`, `version`, `apply`, `history`); `load`/`save` deixam de existir fora dos
   adaptadores.
2. `json`, `json` com `model/` e `markdown` passam na mesma bateria de testes de contrato.
3. `applyOps(before, diffRaw(before, after))` reproduz `after` para todo par de bases dos testes de merge.
4. `archlens store convert` json → markdown → json devolve a mesma base, e os três exemplos convertidos passam no `check`.
5. Um `apply` com versão velha não grava nada (`E_STORE_CONFLICT`).
6. Gravar a mesma base duas vezes no conector `markdown` produz os mesmos bytes, e o texto livre escrito à mão nas páginas
   sobrevive a qualquer gravação.

### Fora do escopo

Conectores remotos (e.4); divisão em skills (e.3); trava entre processos (a versão otimista detecta a corrida, não a
impede); edição à mão do frontmatter como caminho suportado (é lida, mas o caminho suportado é o archlens); uso de
`readSubgraph` pelo CLI (a skill de consulta do e.3 o usará); instalação automática do pack no gbrain.

## 1. O contrato

Cada conector é um objeto (`scripts/lib/store/contract.mjs` documenta a interface e exporta `checkConnector(c)`, usado
pelos testes):

```js
{
  kind: 'json' | 'markdown' | 'legacy',
  writable: boolean,
  describe(): string,                                // "architecture/ (markdown)"
  read(): { raw, notes } | null,                     // base inteira em 2.0; null se não existe
  readSubgraph({ seeds, depth = 1, via }): { raw },  // padrão: read() + recorte
  version(): string | null,                          // token opaco; null se a base não existe
  apply(ops, { baseVersion }): { version },          // atômico; E_STORE_CONFLICT se version() ≠ baseVersion
  history(): object[],                               // as rodadas do changelog, em ordem
}
```

### Operações (`scripts/lib/store/ops.mjs`)

| op | campos | efeito |
|---|---|---|
| `setManifest` | `{ manifest }` (campos de topo: `archlens`, `name`, `description`, `assumptions`, `properties`, `meta`, `store`, `layout`…) | substitui o manifesto |
| `upsertElement` | `{ element }` (elemento 2.0 inteiro) | cria ou substitui pelo `id` |
| `removeElement` | `{ id }` | remove (não remove relações; o `diffRaw` emite as remoções delas) |
| `upsertRelationship` | `{ relationship }` (com `id` sempre preenchido) | cria ou substitui pelo `id` |
| `removeRelationship` | `{ id }` | remove |
| `putView` / `removeView` | `{ view }` / `{ key }` | cria/substitui / remove pela `key` |
| `putNote` | `{ name, text }` (`overview`, `notes`, `assumptions`) | grava a nota |
| `appendHistory` | `{ entry }` | acrescenta uma rodada ao changelog |

Cada op é idempotente. Um `apply` recebe uma lista; a ordem é a da lista, e `appendHistory`, quando presente, é a última.

- `diffRaw(before, after) → ops`: função pura. Elementos e relações comparados por id (`canonicalJson`); relações sem `id`
  no raw recebem o id gerado (`relationshipIds`) antes da comparação, e o `upsertRelationship` sempre leva o `id`. Ordem
  das ops: manifesto, remoções de relações, remoções de elementos, upserts de elementos (pais antes de filhos), upserts de
  relações, visões, notas, histórico. A ordem dos elementos no raw é preservada pelos conectores que têm ordem (`json`).
- `applyOps(raw, ops) → raw`: implementação de referência, pura; serve de oráculo nos testes e de base para o conector
  `json`.
- Op desconhecida ou malformada: `E_STORE_OP` (nada é gravado).

### Versão

- Nos conectores locais, `version()` é `sha256` do conteúdo canônico da base: `canonicalJson` de
  `{ manifest, elements (por id), relationships (por id), views (por key), changelog }`. Não depende de ordem de chaves nem
  do layout em arquivos (a mesma base em `json` e em `markdown` tem a mesma versão).
- O plano (`merge --plan`) passa a gravar `storeVersion`. O `merge --apply` chama `apply(diffRaw(base, resultado), {
  baseVersion: plan.storeVersion })`. Plano antigo (só `baseHash`): o CLI compara `hashRaw` como hoje antes de aplicar.
- `E_STORE_CONFLICT` substitui `E_PLAN_STALE` para planos novos ("a base mudou depois que o plano foi gerado; rode
  `archlens merge --plan` de novo").

### Atomicidade (conectores locais)

1. Monta os arquivos tocados numa área temporária ao lado da base.
2. Relê `version()` imediatamente antes de trocar; se mudou, `E_STORE_CONFLICT` e descarta a área temporária.
3. Troca cada arquivo por rename; arquivos removidos são apagados por último.

Falha em qualquer passo antes da troca: nada muda. Falha durante a troca: o erro diz quais arquivos já foram trocados.
Sem trava entre processos neste ciclo.

### Histórico

`changelog.json` continua sendo o histórico; `history()` o lê; `appendHistory` acrescenta. O formato da rodada não muda.

### Subgrafo

`readSubgraph({ seeds, depth, via })`: `seeds` são ids; `depth` conta saltos por relações (filtradas por `via`, lista de
tipos de relação; padrão todas) ou por `parent` (sempre incluído). Resultado: raw 2.0 válido com o manifesto, os elementos
alcançados, os seus ancestrais (para a hierarquia validar) e as relações entre elementos do resultado; sem visões nem
changelog. Implementação padrão em `contract.mjs` (`read()` + recorte); `seeds` inexistentes → `E_UNKNOWN_REF`.

### Adaptador `legacy`

O `.md` antigo com bloco `archlens-json` (e o `.json` solto) implementa só `read` e `version`; `writable: false`;
`apply` → `E_STORE_LEGACY`. Continua servindo ao `migrate`.

## 2. Escolha do conector e conversão

O campo `store` do manifesto escolhe o conector:

```json
{ "archlens": "2.0", "name": "Loja Online", "store": { "kind": "markdown" } }
```

- Ausente ou `"kind": "json"`: conector `json` (o atual: `model.json` ou `model/*.json` via `layout.model`).
- `"kind": "markdown"`: conector `markdown`.
- Outro valor: `E_STORE_UNSUPPORTED` (reservado para o e.4).

`archlens store convert <base> --to markdown|json`:

- Lê pelo conector atual, grava a mesma base no layout do conector de destino na mesma pasta (cópia da pasta para uma área
  temporária, gravação, releitura, troca — como o `migrate`), atualiza `store.kind` no manifesto e preserva `notes/`,
  `diagrams/` e arquivos desconhecidos.
- Confere que o raw relido é igual ao de antes (`canonicalJson`); se não, `E_STORE_CONVERT` e nada é trocado.
- Não muda a versão da base (a versão não depende do layout), então planos gerados antes continuam aplicáveis.
- Base 1.x: `E_STORE_FORMAT` (migre antes).

## 3. Conector `markdown`

### Layout

A pasta da base é o vault:

```
architecture/
  archlens.json              ← manifesto (store.kind = markdown)
  views.json
  changelog.json
  gbrain-pack.yaml           ← schema pack gerado (seção 3.4)
  notes/…                    ← notas, como hoje
  diagrams/…                 ← HTML gerado, como hoje
  <tipo-archimate>/<id>.md   ← um arquivo por elemento
```

- Uma pasta por tipo ArchiMate, criada quando há elemento desse tipo e removida quando fica vazia (só se o archlens a
  criou: uma pasta de tipo com arquivos desconhecidos fica).
- Hierarquia plana: o pai fica no frontmatter.
- Relações ficam na página do elemento de origem (`from`).
- Mudar o tipo de um elemento move o arquivo de pasta; os wikilinks das outras páginas que apontam para ele são
  regravados no mesmo `apply`.
- Ignorados na leitura e nunca apagados: `.md` fora das pastas de tipo, `.obsidian/`, anexos, qualquer arquivo
  desconhecido.
- O `ARCHITECTURE.md` gerado continua fora da pasta.

### Página

```markdown
---
id: loja.pedidos
type: application-component
title: API de Pedidos
aliases: [API de Pedidos, orders-service]
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
group: "[[grouping/plataforma-vendas|Plataforma de Vendas]]"
technology: Java / Spring Boot
status: active
tags: [archlens/application-component, archlens/c4/container]
properties:
  squad: Checkout
sources:
  - { kind: repo, ref: "github.com/x/pedidos@a1b2c3d", path: compose.yml, line: 12 }
relationships:
  - id: loja.pedidos-serving-loja.web
    type: serving
    to: loja.web
    description: carrinho e checkout
    technology: REST
  - id: loja.pedidos-access-pedidos
    type: access
    to: pedidos
    accessType: write
serving: ["[[application-component/loja.web|Web Storefront]]"]
access: ["[[data-object/pedidos|Pedidos]]"]
---
# API de Pedidos

Carrinho, checkout e ciclo de vida do pedido

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.web|Web Storefront]] — carrinho e checkout [REST]
- **access** (write) → [[data-object/pedidos|Pedidos]]

## Contém
- [[application-component/loja.pedidos.checkout|Checkout Controller]]
<!-- archlens:end -->

Texto livre escrito por pessoas fica aqui e é preservado.
```

| Parte | Dono | Na leitura |
|---|---|---|
| `id`, `type`, `title` (= `name`), `aliases`, `c4` (= `c4.kind`), `parent`, `group`, `technology`, `description`, `owner`, `url`, `external`, `status`, `statusReason`, `inferred`, `confidence`, `properties`, `sources` | archlens | são o elemento 2.0; `parent`/`group` aceitam wikilink ou id |
| `relationships` | archlens | fonte das relações que saem do elemento (`from` = `id` da página) |
| campos de ligação por tipo (`serving`, `access`, `flow`, …) e `tags` | archlens, derivados | ignorados; regenerados a cada gravação |
| `# Título` e o primeiro parágrafo | archlens | o parágrafo é a `description` quando o frontmatter não a tem; ao gravar, a `description` vai só no corpo |
| bloco `<!-- archlens:begin -->` … `<!-- archlens:end -->` | archlens | ignorado; regenerado |
| resto do corpo | pessoas | preservado ao regravar; não entra no modelo |

- Wikilinks sempre com caminho completo e nome: `[[<tipo>/<id>|<nome>]]`.
- `tags` derivadas: `archlens/<tipo>`, `archlens/c4/<kind>` e as `tags` do elemento como `archlens/tag/<tag>`; na leitura, as
  tags do elemento vêm de `archlens/tag/*`.
- Ordem das chaves no frontmatter fixa (a da tabela), relações na ordem do raw: mesma base, mesmos bytes.
- YAML: leitura com o parser vendorizado (`scripts/vendor/yaml`); escrita por um serializador próprio e determinístico de
  um subconjunto (escalares, listas, mapas; aspas quando o valor contém `[[`, `:`, `#` ou começa com caractere especial).
- Edição à mão do frontmatter é lida como está (o arquivo é a fonte de verdade); campos derivados divergentes são
  corrigidos na próxima gravação.

### Validação na leitura

| Código | Quando |
|---|---|
| `E_STORE_MD` | YAML inválido, frontmatter ausente, falta `id` ou `type` (com arquivo e linha) |
| `E_STORE_MD_PATH` | arquivo na pasta de um tipo com `type` diferente, ou nome do arquivo ≠ `id` |
| `E_STORE_DUP_ID` | o mesmo `id` em dois arquivos |

O resto segue para o `normalizeModel`.

### Schema pack do gbrain (`gbrain-pack.yaml`)

Gerado pelo conector a cada `apply` que muda o conjunto de tipos ou de tipos de relação em uso:

```yaml
api_version: gbrain-schema-pack-v1
name: archlens
version: 2.0.0
description: Arquitetura (ArchiMate 3.2 + perfil C4) mantida pelo archlens
page_types:
  - { name: application-component, primitive: entity, path_prefixes: [application-component/], aliases: [], extractable: false, expert_routing: false }
link_types:
  - { name: serving, inverse: served_by }
  - { name: part_of, inverse: composed_of }
frontmatter_links:
  - { page_type: application-component, fields: [serving], link_type: serving }
  - { page_type: application-component, fields: [parent], link_type: part_of }
```

- `page_types`: um por tipo ArchiMate em uso. `link_types`: os tipos de relação em uso, com o inverso em voz passiva, mais
  `part_of`/`composed_of` (hierarquia) e `member_of`/`has_member` (`group`). `frontmatter_links`: um por (tipo de página,
  campo de ligação) em uso.
- A geração é testada contra as páginas (todo campo de ligação usado tem entrada). A verificação contra um gbrain instalado
  (`gbrain schema validate`, `gbrain import`) é um passo manual do plano; se o gbrain não puder ser instalado no ambiente,
  fica registrada como pendente para o e.4.

## 4. Conector `json`

O adaptador atual (`store/folder.mjs`) passa a implementar o contrato:

- `read()` = o `loadFolder` atual (com `anyFormat` para o `migrate`).
- `apply(ops)` = `applyOps(read().raw, ops)` + `saveFolder` com as origens dos itens (os arquivos de `model/` só mudam se
  um item deles mudou), dentro do protocolo de atomicidade.
- `version()` e `history()` conforme a seção 1.

## 5. CLI

- `openBase`/`loadBase`/`requireRaw` passam a `read()`; `merge --apply`, `doc`, `build`, `check`, `migrate` e
  `store convert` gravam por `apply`.
- `merge --plan` grava `storeVersion`; `merge --apply` usa `diffRaw` + `apply` com `baseVersion`.
- `migrate` grava a base nova com `apply(…, { baseVersion: null })` no conector de destino.
- Comando novo: `store convert`; `HELP` atualizado.

## 6. Testes (TDD, `node:test`)

- **Contrato** (`tests/store-contract.test.mjs`): a mesma bateria para `json`, `json` com `model/` e `markdown` — `read`
  depois de `apply` devolve a base gravada (vazia, com todos os campos 2.0, e pares de bases do merge); `version` muda a
  cada `apply` com efeito e não num `apply` vazio; versão velha → `E_STORE_CONFLICT` com a árvore de arquivos intacta;
  op inválida e erro de escrita simulado não deixam nada pela metade; `history` em ordem; `readSubgraph` com `seeds`,
  `depth`, `via` e ancestrais, resultado válido; `notes/`, `diagrams/`, `.obsidian/` e um `.md` solto sobrevivem.
- **`ops.mjs`:** `applyOps(before, diffRaw(before, after))` = `after` para pares cobrindo elementos novos, removidos,
  renomeados, com mudança de pai e de tipo, relações paralelas, visões e notas; `diffRaw(x, x)` = `[]`; ordem das ops.
- **`markdown`:** snapshot de `loja.pedidos.md`; determinismo de bytes; texto livre preservado; mudança de tipo move o
  arquivo e regrava os wikilinks; `E_STORE_MD`, `E_STORE_MD_PATH`, `E_STORE_DUP_ID`; `gbrain-pack.yaml` coerente com as
  páginas.
- **CLI:** `merge --apply` por ops; plano com `storeVersion` velho recusado; plano antigo com `baseHash` aceito;
  `store convert` ida e volta; exemplos convertidos passam no `check`.

## 7. Exemplos e documentação

- Exemplo novo `examples/loja-online-vault/`, gerado de `examples/loja-online` com `store convert --to markdown`, com o
  `ARCHITECTURE.md` e os diagramas gerados.
- `references/knowledge-doc.md`: seção "Conectores" (contrato, operações, versão, formato da página, pack do gbrain).
- `SKILL.md` e `docs/GUIA.md`: `store convert`, abrir no Obsidian, importar no gbrain.
- `CHANGELOG.md` (`[Não lançado]`) e roadmap (e.2).
