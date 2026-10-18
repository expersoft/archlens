# A base de conhecimento: `architecture/` e o `ARCHITECTURE.md`

A base é uma **pasta** (padrão `architecture/`, ao lado do `ARCHITECTURE.md`):

| Arquivo | Conteúdo | Quem escreve |
|---|---|---|
| `archlens.json` | manifesto: `archlens` (`"2.0"`), `name`, `description`, `assumptions`, `layout`, `properties` (catálogo, opcional) | merge |
| `model.json` (ou `model/*.json`) | `{ elements, relationships }` no formato 2.0 | merge |
| `views.json` | visões salvas | merge (delta com `views`) |
| `changelog.json` | rodadas de merge | merge |
| `notes/overview.md` | visão geral: propósito, decisões, riscos | pessoas / agente |
| `notes/notes.md` | decisões, riscos, pendências | pessoas / agente |
| `notes/assumptions.md` | prosa de premissas (opcional; sem ele, a lista de `assumptions`) | pessoas / agente |
| `diagrams/` | HTML e screenshots do `build` | build |

O **`ARCHITECTURE.md` é 100% gerado** (por `apply`, `doc` e `build`): resumo, contexto, modelo C4, camadas
ArchiMate, relacionamentos, rastreabilidade, ciclo de vida, premissas, fontes, visões, histórico e notas. O
frontmatter traz `source:` (a pasta), e a CLI aceita o `.md` como atalho para ela. Não edite o `.md`.

## Formato 2.0

A base guarda tipos ArchiMate sem prefixo, o perfil C4 em `c4.kind`, uma lista plana com `parent` (pai antes de filho)
e só as 11 relações ArchiMate. Exemplo:

```json
{ "id": "loja.pedidos", "type": "application-component", "name": "API de Pedidos", "parent": "loja",
  "c4": { "kind": "container" }, "technology": "Java / Spring Boot",
  "properties": { "squad": "Checkout", "canais": ["web", "app"] } }
```

```json
{ "from": "loja.db", "to": "loja.pedidos", "type": "serving", "description": "lê e grava pedidos", "technology": "JDBC" }
```

Banco de dados é `application-component` com `c4.kind: container` e tag `database`. `properties` aceita texto, número,
booleano ou lista de textos. O vocabulário livre (`c4:*`, `uses`, `children`) só é aceito na entrada (delta, `scan`).

### Catálogo de propriedades

Opcional, em `properties` do `archlens.json`; sem ele, qualquer chave vale. Com ele, `validate` avisa `W_PROPERTY`
para chave desconhecida, tipo errado, valor fora de `values` ou tipo de elemento fora de `appliesTo`:

```json
"properties": {
  "squad":  { "label": "Squad", "type": "string", "appliesTo": ["application-component"] },
  "unidade": { "label": "Unidade", "type": "string", "values": ["Varejo", "Atacado"] },
  "canais": { "label": "Canais", "type": "string[]" }
}
```

`type`: `string` (padrão), `number`, `boolean` ou `string[]`. `appliesTo`: tipos ArchiMate, ou `relationship`.

## Dividir por domínio

Com a base grande, troque `model.json` por uma pasta: no manifesto, `"layout": { "model": "model/" }` e mova os
elementos para `model/<domínio>.json` (cada um com `{ elements, relationships }`). O merge grava cada elemento no
arquivo de onde veio; elementos novos vão para o arquivo do pai ou, sem pai, para `layout.defaultFile` (padrão
`model/geral.json`); relações ficam no arquivo do elemento de origem. Ids repetidos entre arquivos são erro.

## Manter em dia

- `archlens check` valida o modelo e confere se o `ARCHITECTURE.md` corresponde à pasta (código 1 se não). Use no CI
  ou no pre-commit.
- `archlens doc architecture/` regenera o documento depois de editar as notas.

## Conectores

A base é lida e gravada por um **conector**; o CLI só usa o contrato dele: `read` (a base inteira), `readSubgraph`
(um recorte), `version`, `apply(ops, { baseVersion })` e `history`. A gravação é por operações, todas ou nenhuma. São
nove: `setManifest`, `upsertElement`, `removeElement`, `upsertRelationship`, `removeRelationship`, `putView`,
`removeView`, `putNote` e `appendHistory`. Operação desconhecida ou malformada dá `E_STORE_OP` e nada é gravado. Não
existe operação para remover uma nota.

**Versão.** É `sha256:` mais o hash do conteúdo (manifesto, elementos, relações, visões, changelog e notas), igual entre
conectores: a mesma base em `json` e em `markdown` tem a mesma versão. Ordem dos elementos, listas e textos vazios não
contam, e `store`/`layout` (configuração do conector) ficam de fora. Se a versão do store não é a `baseVersion` do
`apply`, o resultado é `E_STORE_CONFLICT` e nada é gravado; o plano do `merge` guarda a versão em que foi gerado.

**`store.kind`** no `archlens.json` escolhe o conector: ausente ou `json` é o padrão (`model.json`); `markdown` é o vault
abaixo; qualquer outro valor dá `E_STORE_UNSUPPORTED`. A base antiga (`.md` com bloco `archlens-json`) só é lida
(`E_STORE_FORMAT`; use `migrate`).

### Conector `markdown` (Obsidian, gbrain)

A pasta da base é o vault: `archlens.json`, `views.json`, `changelog.json`, `notes/`, `diagrams/`, `gbrain-pack.yaml` e
uma pasta por tipo ArchiMate com um arquivo por elemento, `<tipo>/<id>.md`. O `ARCHITECTURE.md` continua fora da pasta.
Relações ficam na página do elemento de origem; a hierarquia é o campo `parent`. Um `.md` dentro de uma pasta de tipo é
sempre uma página (sem frontmatter válido, `E_STORE_MD`); `.md` fora delas, `.obsidian/` e anexos são ignorados e nunca
apagados. Só se remove uma pasta de tipo que o próprio `apply` esvaziou. Ids com `[`, `]`, `|`, `#` ou `^` são recusados
(`E_STORE_MD_ID`), como também dois ids do mesmo tipo que só diferem em maiúsculas e minúsculas (seriam um arquivo só em
sistemas que não as distinguem), e descrições que contêm os marcadores do archlens (`E_STORE_MD`).

```markdown
---
id: loja.pedidos
type: application-component
title: API de Pedidos
aliases:
  - API de Pedidos
c4: container
parent: "[[application-component/loja|Plataforma de E-commerce]]"
technology: Java / Spring Boot
relationships:
  - id: loja.pedidos-serving-loja.web
    type: serving
    to: loja.web
    description: carrinho e checkout
serving:
  - "[[application-component/loja.web|Web Storefront]]"
tags:
  - archlens/application-component
  - archlens/c4/container
---
# API de Pedidos

Carrinho, checkout e ciclo de vida do pedido

<!-- archlens:begin -->
## Relações
- **serving** → [[application-component/loja.web|Web Storefront]] — carrinho e checkout
<!-- archlens:end -->

Texto das pessoas fica aqui e é preservado.
```

- O frontmatter (`id`, `type`, `title`, `c4`, `parent`, `group`, `relationships`, `properties`, `sources`, …) é o elemento
  e é lido como está; `aliases` começa pelo nome do elemento (o Obsidian e o gbrain acham a página por ele), que a
  leitura tira de volta, e segue com os aliases do modelo. Os campos de ligação por tipo de relação (`serving`, `access`, …) e as `tags` são derivados e
  regravados a cada escrita: tags que não sejam `archlens/tag/*` são reescritas na próxima gravação.
- Tudo entre o título da página e o bloco do archlens é a **descrição**. O bloco `archlens:begin` … `archlens:end` é
  regenerado. Só o texto **depois** do bloco é das pessoas: é preservado por toda gravação do conector markdown, inclusive se o elemento mudar de tipo (e de pasta). Se o elemento é removido, a página sai e esse texto vai, na mesma gravação, para `notes/removidos/<tipo>/<id>.md` (uma linha de cabeçalho com o nome e o id, depois o texto; uma nova remoção do mesmo id acrescenta ao fim); o `apply` diz o caminho. Essa pasta não faz parte da base e o archlens nunca a apaga. Só se perde ao converter para `json`, que não tem onde guardá-lo (veja `store convert`).
- Wikilinks são sempre `[[<tipo>/<id>|<nome>]]`; renomear um elemento atualiza os links nas outras páginas.

### `gbrain-pack.yaml`

Schema pack do gbrain (`api_version: gbrain-schema-pack-v1`, `name: archlens`), gerado pelo conector: um `page_type` por
tipo ArchiMate em uso (prefixo = a pasta), os tipos de relação em uso como `link_types` (com o inverso em voz passiva),
mais `part_of` (`parent`) e `member_of` (`group`), e um `frontmatter_links` por (tipo de página, campo de ligação). Não o
edite; ative-o no gbrain com `gbrain schema use`.

**Verificação no gbrain: pendente para o e.4.** `bun` não estava instalado no ambiente do e.2, então `gbrain schema
validate` e `gbrain import` (commit `a723db6`) não foram executados; o pack foi conferido só contra as páginas geradas
(todo campo de ligação usado tem entrada).

### `store convert`

`archlens store convert <base> --to markdown|json` grava a base com outro conector, na mesma pasta. A pasta é copiada, os
arquivos do conector de origem saem da cópia, o conector novo grava a base, a cópia é relida e a versão conferida
(`E_STORE_CONVERT` se diferir) e só então a cópia substitui a pasta. A versão não muda e os arquivos que a base não
possui (`notes/`, `diagrams/`, `.obsidian/`, anexos, `model/README.md`) ficam. O `ARCHITECTURE.md` é regenerado, porque o
vault lê os elementos em outra ordem. Converter para o conector que a base já usa dá `E_STORE_CONVERT`. Converter `markdown` → `json` com texto das pessoas depois do bloco do archlens em alguma página também dá `E_STORE_CONVERT` (lista as primeiras 10 páginas e o total) e nada é gravado; `--force` converte mesmo assim, descartando esse texto, e avisa quais páginas o perderam. Exemplo gerado:
`examples/loja-online-vault/`.

## Formato antigo (1.x)

Uma base 1.x (manifesto com `archlens` diferente de `2.x`, ou o modelo num bloco `archlens-json` dentro do `.md`) é
recusada por **todos** os comandos com `E_STORE_FORMAT`; nada é gravado. `archlens migrate <base>` converte:

- **pasta 1.x**: no mesmo lugar. Copia a pasta, grava a base 2.0 sobre a cópia (arquivos do usuário ficam; cada
  elemento e relação continua no seu arquivo de `model/*.json`), relê e só então troca. Confere antes a equivalência
  do modelo (`E_MIGRATE_EQUIV` se a tradução mudaria o sentido; nada é trocado) e confere que o `ARCHITECTURE.md` é
  do archlens antes de regenerá-lo;
- **`.md` antigo ou `.json`**: cria a pasta 2.0 (os blocos `keep` viram `notes/*.md`), com `--to <pasta>` para
  escolher o destino.

A migração reescreve tipos para ArchiMate, converte `uses` em `serving`/`access`, transforma os bancos
(`data-object` → `application-component` com a tag `database`; os `access` para eles viram `serving`) e registra uma
rodada no histórico. **Planos gerados antes da migração deixam de valer**: gere-os de novo.

## Uso como base de conhecimento

```bash
node scripts/archlens.mjs views architecture/
node scripts/archlens.mjs deliver architecture/ --spec '{"key":"x","notation":"archimate","viewpoint":"impact","anchor":"erp"}' --out erp-impacto.html
```

Nenhuma remodelagem: a pergunta nova vira uma view spec sobre o mesmo estado. Para guardar a visão na base, mande-a
num delta (`views`). Para acrescentar conhecimento, delta → `plan` → `apply`.
