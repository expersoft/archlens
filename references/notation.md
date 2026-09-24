# Notação archlens (DSL JSON)

Um arquivo descreve **um modelo** e **as visões** que se quer extrair dele. Inspirado no workspace do
Structurizr (`model` + `views`), mas o metamodelo interno é o **ArchiMate 3.2**. Os tipos C4 são um
perfil que mapeia para ele. Um mesmo modelo serve às duas notações.

Schemas: `schemas/model.schema.json` (arquivo inteiro) e `schemas/view.schema.json` (uma visão).

```json
{
  "archlens": "1.0",
  "name": "Loja Online",
  "description": "texto livre; vira a 'Visão geral' do ARCHITECTURE.md",
  "assumptions": ["premissas feitas ao interpretar texto livre"],
  "model": {
    "elements": [ /* elementos, com children aninhados */ ],
    "relationships": [ /* relações */ ]
  },
  "views": [ /* view specs: references/views.md */ ]
}
```

## Elementos

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id` | sim | único **no modelo inteiro**. Convenção: `sistema.container.componente` |
| `type` | sim | `c4:<tipo>` ou `archimate:<tipo>` (prefixo opcional para ArchiMate) |
| `name` | não | rótulo (padrão: `id`) |
| `description` | não | frase curta, aparece no nó (C4) e no painel |
| `technology` | não | ex.: `"Java / Spring Boot"` |
| `tags` | não | lista de strings. `database`/`datastore`/`storage`/`bucket` num container C4 o torna data store |
| `external` | não | C4: sistema fora do seu controle (desenhado em cinza) |
| `archimate` | não | C4: força o tipo ArchiMate (ex.: `"system-software"`) em vez do mapeamento padrão |
| `children` | não | elementos aninhados (hierarquia C4 ou composição ArchiMate) |
| `parent` | não | alternativa a `children`: id do pai |
| `properties` | não | mapa livre (`owner`, `criticidade`, `sla`…), mostrado no painel |
| `owner`, `url` | não | metadados |
| `inferred` | não | `true` quando veio de interpretação, não do texto explícito |
| `confidence` | não | `"alta"`, `"média"` ou `"baixa"` (para itens inferidos) |
| `source` | não | trecho do texto livre que originou o elemento (evidência) |

### Tipos C4 → ArchiMate

| `type` | vira (ArchiMate) | observações |
|---|---|---|
| `c4:person` | business-actor | topo da hierarquia |
| `c4:softwareSystem` | application-component | topo da hierarquia |
| `c4:container` | application-component | filho de softwareSystem |
| `c4:container` + tag `database` | data-object | desenhado como cilindro no C4 |
| `c4:component` | application-component | filho de container |
| `c4:deploymentNode`, `c4:infrastructureNode` | node | |

### Tipos ArchiMate (resumo; catálogo completo em `archimate.md`)

- **Estratégia:** resource, capability, value-stream, course-of-action
- **Negócio:** business-actor, business-role, business-collaboration, business-interface,
  business-process, business-function, business-interaction, business-event, business-service,
  business-object, contract, representation, product
- **Aplicação:** application-component, application-collaboration, application-interface,
  application-function, application-interaction, application-process, application-event,
  application-service, data-object
- **Tecnologia:** node, device, system-software, technology-collaboration, technology-interface, path,
  communication-network, technology-function, technology-process, technology-interaction,
  technology-event, technology-service, artifact
- **Física:** equipment, facility, distribution-network, material
- **Motivação:** stakeholder, driver, assessment, goal, outcome, principle, requirement, constraint,
  meaning, value
- **Implementação e Migração:** work-package, deliverable, implementation-event, plateau, gap
- **Outros:** grouping, location

## Relações

| Campo | Descrição |
|---|---|
| `from`, `to` | ids de elementos |
| `type` | `uses` (C4, padrão) ou `archimate:<tipo>` |
| `description` | verbo/frase ("Autoriza pagamento"): rótulo da seta |
| `technology` | protocolo ("HTTPS", "Kafka", "JDBC") |
| `accessType` | só em `access`: `read`, `write`, `readwrite` (padrão) ou `access` |
| `id` | opcional; gerado como `from-tipo-to` |
| `tags`, `properties`, `inferred` | como nos elementos |

### `uses` (C4)

Sempre **consumidor → provedor**: `{"from":"web","to":"api","type":"uses"}`. Na normalização:

- se o alvo é passivo (data store), vira `access` de `from` para `to`;
- senão, vira `serving` **invertido** (`api serving web`), que é a leitura ArchiMate.

A orientação original fica guardada, e as visões C4 desenham a seta como foi escrita.

### Tipos ArchiMate

`composition`, `aggregation`, `assignment`, `realization`, `serving`, `access`, `influence`,
`triggering`, `flow`, `specialization`, `association`. Direções (quem é origem):

| relação | origem → destino | leitura |
|---|---|---|
| composition / aggregation | todo → parte | "produto agrega serviço" |
| assignment | ativo → comportamento/papel | "médico é atribuído ao processo" |
| realization | concreto → abstrato | "processo realiza serviço", "container realiza app service" |
| serving | provedor → consumidor | "app service serve processo", "tecnologia serve aplicação" |
| access | comportamento → dado | "processo grava pedido" |
| triggering / flow | antes → depois | "checkout dispara faturamento" |
| influence | motivação → motivação | "requisito influencia meta" |

## Validação

`archlens validate` devolve códigos estáveis. Cada código traz caminho (`path`) e dica (`hint`).

| Código | Nível | Significado |
|---|---|---|
| `E_SCHEMA` | erro | estrutura inválida (sem `model`, relação sem from/to) |
| `E_MISSING_ID`, `E_DUPLICATE_ID` | erro | id ausente ou repetido |
| `E_UNKNOWN_TYPE`, `E_REL_TYPE` | erro | tipo desconhecido |
| `E_UNKNOWN_REF` | erro | from/to/parent/scope/anchor inexistente |
| `E_C4_HIERARCHY` | erro | component fora de container, container fora de sistema… |
| `E_REL_INVALID` | erro | relação proibida (access para não passivo, serving com dado…) |
| `E_VIEW_KEY` | erro | visão sem key ou key repetida |
| `W_REL_DIRECTION` | aviso | serving/realization parece invertido entre camadas |
| `W_REL_SUSPECT` | aviso | combinação incomum (ex.: influence fora de motivação) |
| `W_C4_ORPHAN`, `W_ORPHAN` | aviso | elemento sem pai C4 / sem relações |
| `W_INFERRED` | aviso | há itens inferidos a revisar |

## Exemplo mínimo com as duas notações

```json
{
  "archlens": "1.0",
  "name": "Loja Mini",
  "model": {
    "elements": [
      { "id": "cliente", "type": "c4:person", "name": "Cliente" },
      { "id": "loja", "type": "c4:softwareSystem", "name": "Loja", "children": [
        { "id": "loja.api", "type": "c4:container", "name": "API", "technology": "Spring" },
        { "id": "loja.db", "type": "c4:container", "name": "DB", "technology": "PostgreSQL", "tags": ["database"] }
      ]},
      { "id": "venda", "type": "archimate:product", "name": "Venda Online" },
      { "id": "checkout", "type": "archimate:business-process", "name": "Checkout" },
      { "id": "svc", "type": "archimate:application-service", "name": "Serviço de checkout" },
      { "id": "k8s", "type": "archimate:node", "name": "Cluster K8s" }
    ],
    "relationships": [
      { "from": "cliente", "to": "loja.api", "type": "uses", "description": "Compra", "technology": "HTTPS" },
      { "from": "loja.api", "to": "loja.db", "type": "uses", "technology": "JDBC" },
      { "from": "venda", "to": "checkout", "type": "archimate:aggregation" },
      { "from": "loja.api", "to": "svc", "type": "archimate:realization" },
      { "from": "svc", "to": "checkout", "type": "archimate:serving" },
      { "from": "k8s", "to": "loja.api", "type": "archimate:serving" }
    ]
  },
  "views": [
    { "key": "containers", "notation": "c4", "level": "container", "scope": "loja" },
    { "key": "suporte", "notation": "archimate", "viewpoint": "product-support", "anchor": "venda" }
  ]
}
```
