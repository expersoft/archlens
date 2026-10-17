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

O **`ARCHITECTURE.md` é 100% gerado** (por `merge --apply`, `doc` e `build`): resumo, contexto, modelo C4, camadas
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
num delta (`views`). Para acrescentar conhecimento, delta → `merge --plan` → `--apply`.
