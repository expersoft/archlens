# archlens-ask — referência

> Gerado por `scripts/gen-ask.mjs` a partir do archlens 0.5.0; não edite. Formato de base: `2.0`.

## Tipos de elemento (ArchiMate 3.2)

### Motivação (`motivation`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `stakeholder` | Stakeholder | motivation | motivation |
| `driver` | Driver | motivation | motivation |
| `assessment` | Assessment | motivation | motivation |
| `goal` | Goal | motivation | motivation |
| `outcome` | Outcome | motivation | motivation |
| `principle` | Principle | motivation | motivation |
| `requirement` | Requirement | motivation | motivation |
| `constraint` | Constraint | motivation | motivation |
| `meaning` | Meaning | motivation | motivation |
| `value` | Value | motivation | motivation |

### Estratégia (`strategy`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `resource` | Resource | strategy | passive |
| `capability` | Capability | strategy | behavior |
| `value-stream` | Value Stream | strategy | behavior |
| `course-of-action` | Course of Action | strategy | behavior |

### Negócio (`business`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `business-actor` | Business Actor | business | active |
| `business-role` | Business Role | business | active |
| `business-collaboration` | Business Collaboration | business | active |
| `business-interface` | Business Interface | business | active |
| `business-process` | Business Process | business | behavior |
| `business-function` | Business Function | business | behavior |
| `business-interaction` | Business Interaction | business | behavior |
| `business-event` | Business Event | business | behavior |
| `business-service` | Business Service | business | behavior |
| `business-object` | Business Object | business | passive |
| `contract` | Contract | business | passive |
| `representation` | Representation | business | passive |
| `product` | Product | business | composite |

### Aplicação (`application`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `application-component` | Application Component | application | active |
| `application-collaboration` | Application Collaboration | application | active |
| `application-interface` | Application Interface | application | active |
| `application-function` | Application Function | application | behavior |
| `application-interaction` | Application Interaction | application | behavior |
| `application-process` | Application Process | application | behavior |
| `application-event` | Application Event | application | behavior |
| `application-service` | Application Service | application | behavior |
| `data-object` | Data Object | application | passive |

### Tecnologia (`technology`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `node` | Node | technology | active |
| `device` | Device | technology | active |
| `system-software` | System Software | technology | active |
| `technology-collaboration` | Technology Collaboration | technology | active |
| `technology-interface` | Technology Interface | technology | active |
| `path` | Path | technology | active |
| `communication-network` | Communication Network | technology | active |
| `technology-function` | Technology Function | technology | behavior |
| `technology-process` | Technology Process | technology | behavior |
| `technology-interaction` | Technology Interaction | technology | behavior |
| `technology-event` | Technology Event | technology | behavior |
| `technology-service` | Technology Service | technology | behavior |
| `artifact` | Artifact | technology | passive |

### Física (`physical`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `equipment` | Equipment | physical | active |
| `facility` | Facility | physical | active |
| `distribution-network` | Distribution Network | physical | active |
| `material` | Material | physical | passive |

### Implementação e Migração (`implementation`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `work-package` | Work Package | implementation | behavior |
| `deliverable` | Deliverable | implementation | passive |
| `implementation-event` | Implementation Event | implementation | behavior |
| `plateau` | Plateau | implementation | composite |
| `gap` | Gap | implementation | passive |

### Outros (`other`)

| tipo | rótulo | camada | aspecto |
|---|---|---|---|
| `grouping` | Grouping | other | composite |
| `location` | Location | other | composite |

## Tipos de relação

"Quem sustenta quem" é a direção de suporte usada nas travessias (`supporters`/`dependents`). Força: usada na derivação (o tipo mais fraco da cadeia vence).

| tipo | rótulo | força | inverso (gbrain) | quem sustenta quem | significado | leitura |
|---|---|---|---|---|---|---|
| `composition` | composição | 8 | `composed_into` | destino → origem | Todo–parte forte: a parte não existe sem o todo. | A ◆— B: "A contém B". O losango fica no todo. |
| `aggregation` | agregação | 7 | `aggregated_into` | destino → origem | Todo–parte fraco: a parte pode existir sozinha ou em outros todos. | A ◇— B: "A agrega B". O losango fica no todo. |
| `assignment` | atribuição | 6 | `assigned_from` | origem → destino | Quem executa o quê: ator → papel, ativo → comportamento, nó → artefato implantado. | A ●→ B: "A executa / desempenha / hospeda B". |
| `realization` | realização | 5 | `realized_by` | origem → destino | O concreto implementa o abstrato: processo realiza serviço, componente realiza app service, artefato realiza componente. | A ┄▷ B: "A realiza B". O triângulo fica no lado abstrato. |
| `serving` | serving (serve) | 4 | `served_by` | origem → destino | O provedor oferece funcionalidade para quem a usa. | A —> B: "A serve B" = "B usa A". A seta aponta para quem consome, no sentido oposto ao "usa" do C4. |
| `access` | acesso | 3 | `accessed_by` | destino → origem | Comportamento ou componente que lê e/ou grava um dado (objeto passivo). | A ··> B: escrita aponta para o dado; leitura aponta para quem lê; leitura+escrita tem setas nas duas pontas. |
| `influence` | influência | 2 | `influenced_by` | origem → destino | Um elemento de motivação afeta outro (positiva ou negativamente). | A ┄> B: "A influencia B". |
| `triggering` | disparo | 1 | `triggered_by` | origem → destino (só quando pedido) | Ordem temporal ou causal entre comportamentos. | A —▶ B: "A dispara B"; B começa depois de A. |
| `flow` | fluxo | 1 | `flows_from` | origem → destino (só quando pedido) | Transferência de informação, valor ou material entre comportamentos. | A ┄▶ B: "A passa algo para B". |
| `specialization` | especialização | 0 | `generalization_of` | — | A é um tipo mais específico de B (mesmo tipo de elemento). | A —▷ B: "A é um tipo de B". |
| `association` | associação | 0 | `association` | — | Relação genérica, sem semântica específica. | A — B: "A está relacionado a B". |

## Perfil C4

| kind | rótulo | tipos ArchiMate aceitos |
|---|---|---|
| `person` | Person | `business-actor`, `business-role` |
| `softwareSystem` | Software System | `application-component` |
| `container` | Container | `application-component`, `application-event` |
| `component` | Component | `application-component` |
| `deploymentNode` | Deployment Node | `node`, `device`, `system-software`, `technology-service`, `communication-network` |
| `infrastructureNode` | Infrastructure Node | `node`, `device`, `system-software`, `technology-service`, `communication-network` |

Tags de armazenamento (viram `SystemDb`/`ContainerDb`): `database`, `datastore`, `data-store`, `bucket`, `storage`. Tags de mensageria (viram `SystemQueue`/`ContainerQueue`): `topic`, `queue`, `messaging`.

## Status

`draft`, `planned`, `active`, `deprecated`, `retired`. Padrão das visões: todos menos `retired`.

## Viewpoints ArchiMate

`business`, `application`, `technology`, `strategy`, `motivation`, `implementation-migration`, `application-cooperation`, `implementation-deployment`, `layered`, `impact`, `product-support`, `custom`

## Cores

| uso | preenchimento | borda |
|---|---|---|
| Negócio (`business`) | `#fff5a8` | `#a89a2c` |
| Aplicação (`application`) | `#b6eef6` | `#338fa0` |
| Tecnologia (`technology`) | `#cbe8b9` | `#558f42` |
| Motivação (`motivation`) | `#dcd6ff` | `#6f62c9` |
| Estratégia (`strategy`) | `#f6dcaa` | `#ae8330` |
| Implementação e Migração (`implementation`) | `#ffdfe3` | `#b85f6c` |
| Outros (`other`) | `#ffffff` | `#8f8f8f` |
| C4 person | `#0b3d78` | texto `#ffffff` |
| C4 softwareSystem | `#1168bd` | texto `#ffffff` |
| C4 container | `#3f86d0` | texto `#ffffff` |
| C4 component | `#8cc0f2` | texto `#0b2540` |
| C4 external | `#8791a1` | texto `#ffffff` |
| foco / âncora | — | `#f2b705` |

`classDef` para os diagramas ArchiMate (`flowchart`):

```text
classDef business fill:#fff5a8,stroke:#a89a2c,color:#18202c
classDef application fill:#b6eef6,stroke:#338fa0,color:#18202c
classDef technology fill:#cbe8b9,stroke:#558f42,color:#18202c
classDef motivation fill:#dcd6ff,stroke:#6f62c9,color:#18202c
classDef strategy fill:#f6dcaa,stroke:#ae8330,color:#18202c
classDef implementation fill:#ffdfe3,stroke:#b85f6c,color:#18202c
classDef other fill:#ffffff,stroke:#8f8f8f,color:#18202c
classDef anchor stroke:#f2b705,stroke-width:4px
classDef draft stroke-dasharray:5 3
```

Estilos para os diagramas C4 (sintaxe C4 do Mermaid), um por elemento:

```text
UpdateElementStyle(<id do person>, $bgColor="#0b3d78", $fontColor="#ffffff", $borderColor="#0b3d78")
UpdateElementStyle(<id do softwareSystem>, $bgColor="#1168bd", $fontColor="#ffffff", $borderColor="#0b3d78")
UpdateElementStyle(<id do container>, $bgColor="#3f86d0", $fontColor="#ffffff", $borderColor="#0b3d78")
UpdateElementStyle(<id do component>, $bgColor="#8cc0f2", $fontColor="#0b2540", $borderColor="#0b3d78")
UpdateElementStyle(<id do external>, $bgColor="#8791a1", $fontColor="#ffffff", $borderColor="#0b3d78")
UpdateElementStyle(<id da âncora>, $borderColor="#f2b705")
```

## Páginas da base no gbrain

Todas as páginas da base ficam sob um prefixo (padrão `archlens/`) e levam a tag `archlens`. Elementos levam também `archlens/<tipo>`, `archlens/c4/<kind>` (com perfil C4) e `archlens/tag/<tag>` para cada tag do elemento (ex.: `archlens/tag/database`, `archlens/tag/queue`).

| página (slug) | conteúdo útil |
|---|---|
| `<prefixo>/<tipo>/<id>` | `get_page` devolve `type` (tipo ArchiMate), `title` (nome), `tags` (acima) e `frontmatter`: `id`, `c4` (kind), `parent` e `group` (wikilinks), `aliases`, `technology`, `status` (**ausente = `active`**), `external`, `relationships` e um campo por tipo de relação com os wikilinks dos destinos (`serving: [[<prefixo>/<tipo>/<id>\|Nome]]`); `compiled_truth`: descrição + seção "Relações" em frases |
| `<prefixo>/views/<key>` | visão salva: resumo + spec num bloco ```` ```archlens-json ```` |
| `<prefixo>/manifest` | tipo de página `archlens-manifest` (ache com `list_pages {"type":"archlens-manifest"}`); nome e descrição da base; o formato (`"archlens": "2.0"`) está no bloco `archlens-json` do corpo, não no frontmatter |
| `<prefixo>/notes/<nome>` | notas de interpretação |
| `<prefixo>/changelog` | histórico de rodadas |

Cada item de `relationships` é `{id, type, to, description?, technology?, accessType?, status?}`: só as relações de **saída**; `to` é o **id** do destino (o slug completo está no wikilink do campo do mesmo tipo, ou em `resolve_slugs {"partial": "<id>"}`); `accessType` (só em `access`) é `read`, `write`, `readwrite` ou `access`; `status` ausente = `active`.

`get_backlinks` devolve `{from_slug, link_type, link_source}`. Com ligações tipadas, cada relação de entrada aparece com o tipo dela (`serving`, `realization`…, `link_source: "frontmatter"`), a hierarquia como `part_of` e o grupo como `member_of`; as citações do corpo aparecem como `mentions` (`link_source: "markdown"`). Inversos no schema pack: `part_of` ↔ `composed_of`, `member_of` ↔ `has_member`.

Parâmetros que confundem: `resolve_slugs {"partial": "texto"}` (devolve slugs que contêm o texto); `list_pages {"tag": "...", "limit": 100}`; `get_page {"slug": "..."}`; `get_backlinks {"slug": "..."}`; `search {"query": "..."}` (busca por palavra).
