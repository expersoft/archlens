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
(um recorte), `version`, `objectVersions(refs)` (a versão de cada objeto; veja *Versão por objeto* em
`references/merge.md`), `apply(ops, { expect | baseVersion })` e `history`. Cada conector declara `versioning`: `base`
(`json`: a versão da base inteira vale para todo objeto) ou `object` (`markdown`, `gbrain`). A gravação é por operações, todas ou nenhuma. São
nove: `setManifest`, `upsertElement`, `removeElement`, `upsertRelationship`, `removeRelationship`, `putView`,
`removeView`, `putNote` e `appendHistory`. Operação desconhecida ou malformada dá `E_STORE_OP` e nada é gravado. Não
existe operação para remover uma nota.

**Versão.** É `sha256:` mais o hash do conteúdo (manifesto, elementos, relações, visões, changelog e notas), igual entre
conectores: a mesma base em `json` e em `markdown` tem a mesma versão. Ordem dos elementos, listas e textos vazios não
contam, e `store`/`layout` (configuração do conector) ficam de fora. Se uma versão em `expect` (ou a `baseVersion`) não é
a do store, o resultado é `E_STORE_CONFLICT` e nada é gravado; o plano guarda as versões em que foi gerado.

**`store`** no `archlens.json` escolhe o conector (gravado por `archlens init` ou `store convert`): `kind` ausente ou `json` é
o padrão (`model.json`); `markdown` é o vault abaixo; `gbrain` (com `mode` `git` ou `mcp`) é a seção *Conector gbrain*.
Campo desconhecido, obrigatório ausente ou com cara de credencial dá `E_STORE_CONFIG`. A base antiga (`.md` com bloco `archlens-json`) só é lida
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

**Verificado no gbrain** 0.60.304 (commit `ac1ba4c`) pelo `npm run test:gbrain`: com o pack ativo, o sync do modo git lê as
ligações tipadas e `traverse_graph` devolve os tipos de relação ArchiMate.

### `store convert`

`archlens store convert <base> --to markdown|json` grava a base com outro conector, na mesma pasta. A pasta é copiada, os
arquivos do conector de origem saem da cópia, o conector novo grava a base, a cópia é relida e a versão conferida
(`E_STORE_CONVERT` se diferir) e só então a cópia substitui a pasta. A versão não muda e os arquivos que a base não
possui (`notes/`, `diagrams/`, `.obsidian/`, anexos, `model/README.md`) ficam. O `ARCHITECTURE.md` é regenerado, porque o
vault lê os elementos em outra ordem. Converter para o conector que a base já usa dá `E_STORE_CONVERT`. Converter `markdown` → `json` com texto das pessoas depois do bloco do archlens em alguma página também dá `E_STORE_CONVERT` (lista as primeiras 10 páginas e o total) e nada é gravado; `--force` converte mesmo assim, descartando esse texto, e avisa quais páginas o perderam. Exemplo gerado:
`examples/loja-online-vault/`.

## Conector gbrain

A base mora num [gbrain](https://github.com/garrytan/gbrain), legível pela IA corporativa sem o archlens. Configurado por
`archlens init` ou `store convert` (veja `references/base.md`):

```json
{ "archlens": "2.0", "name": "Arquitetura Corporativa",
  "store": { "kind": "gbrain", "mode": "git", "repo": "../gbrain-arquitetura", "remote": "origin", "branch": "main", "prefix": "archlens" } }
```

```json
{ "archlens": "2.0", "name": "Arquitetura Corporativa",
  "store": { "kind": "gbrain", "mode": "mcp", "server": "gbrain-corp", "sourceId": "arquitetura", "prefix": "archlens" } }
```

A pasta local (`architecture/`) guarda só o `archlens.json`, o `ARCHITECTURE.md` gerado, `notes/` e `diagrams/`; o estado
de trabalho fica em `.archlens/` (ignorado pelo git). Testado com o gbrain 0.60.304 (commit `ac1ba4c`); o MCP do gbrain
muda rápido.

### Layout

Sob `<prefix>/`, as páginas do conector `markdown`, mais páginas para o resto da base:

```
<prefix>/<tipo-archimate>/<id>.md     ← um elemento por página, com as relações que saem dele
<prefix>/manifest.md                  ← manifesto (JSON num bloco archlens-json, com um resumo legível)
<prefix>/views/<key>.md               ← uma visão por página (a lista do que ela mostra, e o JSON)
<prefix>/notes/<nome>.md              ← overview, notes, assumptions (e notes/removidos/…)
<prefix>/changelog.md                 ← histórico: uma linha por rodada, com os elementos como [[wikilinks]], e o JSON
<prefix>/gbrain-pack.yaml             ← o schema pack, no modo git (ative com gbrain schema use)
```

- Wikilinks prefixados (`[[archlens/application-component/loja.pedidos|API de Pedidos]]`). Toda página leva a tag
  `archlens` (o `list_pages` do gbrain filtra por tag, não por pasta), além das `archlens/<tipo>`, e termina com a marca
  `<!-- timeline -->` do gbrain, para ele não mover seções `## Timeline`/`## History` da descrição ou do texto livre.
- O bloco `archlens-json` é a fonte; o resumo em volta é regenerado. Texto livre depois de `<!-- archlens:end -->` é
  preservado, inclusive quando escrito direto no gbrain; o de um elemento removido vira a página
  `<prefix>/notes/removidos/<tipo>/<id>.md`.
- Valores com cara de data ou de número binário vão entre aspas no cabeçalho (o gbrain lê YAML 1.1). Os campos que o
  gbrain carimba nas páginas (`slug`, `trust_tier`, `source_kind`, `ingested_via`, …) são ignorados na leitura.

### Modo git

- **read**: `git fetch` do `remote`/`branch` e leitura das páginas na ponta remota, numa **worktree destacada** do clone do
  usuário em `<pasta>/.archlens/tip/`. A branch, o índice e os arquivos do clone nunca mudam.
- **versões**: o hash do conteúdo canônico de cada objeto na ponta remota.
- **apply**: confere `expect` contra a ponta remota, monta as páginas novas sobre ela (mesmos bytes do conector
  `markdown`, com o prefixo), faz **um commit** (`docs(arquitetura): <resumo da rodada>`, com a identidade do git do
  usuário) e o push. Push recusado (alguém gravou antes): busca de novo, confere o plano (e as duplicatas criadas em
  paralelo) e refaz, até 3 vezes. Falha antes do push: nada no remoto. Erros do git: `E_STORE_GIT`.
- Depois do push, o gbrain indexa no sync dele. **Limite conhecido:** o sync do gbrain mantém no índice de tags dele as
  tags tiradas de uma página; a base do archlens, lida do git, continua certa.

### Modo MCP

O CLI não fala com o MCP: o agente executa os pedidos que o CLI grava (passos em `references/base.md`).

| Arquivo em `.archlens/` | Conteúdo |
|---|---|
| `mirror/` | o espelho: as páginas sob `<prefix>/` como o archlens as grava, `revisions.json` (slug → `revision` do gbrain) e `sync.json` (o `updated_at` de cada página na última listagem) |
| `remote/<passo>-request.json` | o pedido em andamento (`list`, `get`, `tools`, `read-check`, `apply`, …), sem `--out` |
| `session.json` | a sessão conferida por `remote check` (servidor e se gravar está liberado) |
| `applies/<id>.json` | o **registro do apply**: o plano, as chamadas pedidas com os `request_id`, os recibos, a revisão gravada e o conteúdo anterior de cada página (para o `--undo`) e a rodada |

- `plan`, `show`, `query` e as prévias leem o espelho; a versão de um objeto é a `revision` da página dele.
- O `apply` pede a releitura do conjunto de leitura e só então a gravação: lotes `put_pages` (até 50 páginas / 8 MB;
  página maior: `E_STORE_GBRAIN_SIZE`) e `delete_page`, cada página com `expected_revision` (sem ela: só criar), um
  `request_id` por chamada e o histórico por último. Tags que a rodada tira de uma página saem num pedido de seguimento
  (`remove_tag`/`add_tag`, com a revisão que a gravação devolveu), porque o `put_page` do gbrain mantém as tags que a
  página já tinha.
- `--receipts` marca cada página `committed`, em conflito ou pendente e atualiza o espelho; `--resume` pede o que falta
  (mesmo `request_id` para chamadas sem recibo); `--undo` devolve as páginas gravadas ao que eram (`put_pages` do conteúdo
  anterior, `delete_page` das criadas, `restore_page` das removidas, e as tags de volta), cada uma com `expected_revision` =
  a revisão que o apply gravou; página que mudou de novo no gbrain não é forçada.
- **Limites conhecidos:** a janela residual entre a releitura e o `put_pages` (`references/merge.md`); o custo de passar
  cada página pelo contexto do agente; as ligações tipadas exigem `gbrain sweep` no servidor; o `sourceId` precisa ser a
  fonte em que a sessão do MCP grava; nos testes (PGLite) o gbrain grava na hora, então um lote `pending` real nunca foi
  observado (o caminho é coberto pelo gbrain falso dos testes de unidade).

### `store convert` para o gbrain

- `store convert <base> --to gbrain --mode git --repo <clone> [...]`: grava a base inteira sob `<prefix>/` num commit (só
  se não há página do archlens lá; senão `E_STORE_EXISTS`) e troca o `archlens.json` local pelo de configuração. A pasta
  mantém `notes/`, `diagrams/` e arquivos desconhecidos; o texto das páginas e `notes/removidos/` vão junto.
- `--to gbrain --mode mcp --server S`: rode antes `remote <base> check --server S` (funciona na base local) para conferir
  a sessão. O convert grava o pedido de criação (todas as páginas, sem `expected_revision`: só criar); `apply <base>
  --receipts` o conclui, e só com o último recibo a pasta local muda. Página que já existe no gbrain fica em conflito:
  use outro `--prefix` (e `--undo`).
- `--to json|markdown` a partir do gbrain: lê a ponta remota (git) ou o espelho (MCP: rode `remote pull` antes) e grava a
  base local. A ida e a volta devolvem a mesma base (`E_STORE_CONVERT` se não).

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
