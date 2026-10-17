# Formato canônico unificado (ArchiMate + perfil C4, formato 2.0)

- **Data:** 2026-10-17
- **Branch:** `feat/canonical-format` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito
- **Depende de:** [modelo canônico fora do ARCHITECTURE.md](2026-10-01-kb-store-design.md) (a.3) e
  [leitura de repositórios](2026-10-03-repo-reading-design.md) (b), já em `develop-v2`
- **Roadmap:** subprojeto 1 de 4 da reorganização em conectores e três skills (ver "Decomposição" abaixo)

## Contexto e objetivo

O metamodelo interno do archlens já é o ArchiMate 3.2 com um perfil C4 por cima (`scripts/lib/registry.mjs`):
ao carregar, todo elemento ganha um tipo ArchiMate, e as visões C4 são projeções desse modelo (`c4KindOf`,
`c4Orientation` em `scripts/lib/model.mjs`). A tese "guardar em ArchiMate e gerar o C4 a partir dele" está
correta e já é a direção do código. O ArchiMate é mais abrangente (negócio, estratégia, motivação,
implementação, serviços, comportamento); o C4 acrescenta o que o ArchiMate não tem — nível de abstração
(sistema / container / componente), `external`, `technology` — e isso cabe num perfil.

O que falta é que a unificação aconteça **no armazenamento**, não só em memória:

1. **O disco mistura dialetos.** Os `model.json` têm `c4:container`, `archimate:node`, `node` sem prefixo,
   `children` aninhados e `uses` (orientado ao C4), e só o `normalizeModel` traduz. Um conector (neo4j,
   relacional, S3, pasta de markdowns, gbrain) teria de reimplementar essa tradução.
2. **Banco de dados vira `data-object`.** Um elemento passivo não pode servir nem ser servido; o scan descarta
   relações por isso (`scripts/lib/scan/to-delta.mjs:211`) e liga motores de banco por `realization`, e os
   demais por `serving` (linha 196). Isso bloqueia o deployment (item c) e empobrece o grafo.
3. **O C4 não atravessa serviços.** Um modelo ArchiMate "puro" (B realiza o serviço S, S serve A) não gera
   nenhuma seta no C4: `realization` não tem orientação C4 e o serviço não tem pai visível.
4. **`data-object` sem perfil C4 nunca aparece no C4**, nem mesmo sob o container que o guarda.

**Objetivo:** um formato canônico 2.0 — tipos ArchiMate, perfil C4 explícito, hierarquia plana por `parent`,
relações só no vocabulário ArchiMate, propriedades do usuário com catálogo opcional — que é o único formato que
o store lê e grava; a tradução do vocabulário livre (C4, prefixos, `uses`, `children`) num único ponto de
entrada; migração das bases existentes; e a geração do C4 a partir de modelos ArchiMate.

### Decomposição (registrada aqui, cada item com o próprio ciclo)

A direção do usuário: o archlens vira **três skills** sobre um **repositório de arquitetura** (o modelo canônico)
acessado por **conectores**, que é a fonte da verdade em todo momento.

| # | Subprojeto | Depende de |
|---|---|---|
| **1** | **Formato canônico unificado** (este spec) | — |
| 2 | Contrato de conector (store v2): leitura do modelo inteiro e de subgrafos, gravação por operações atômicas, versão otimista do store, histórico no próprio store; conectores locais `model.json` (padrão) e pasta com um markdown por nó (estilo gbrain) | 1 |
| 3 | Divisão em três skills sobre uma biblioteca comum: **comparar** (pedido ou repositório × canônico → delta resolvido, renderizável em diagramas ou markdown), **merge** (aplica o delta resolvido) e **consulta** (perguntas ao canônico → diagramas ou markdown) | 1, contrato do 2 |
| 4 | Conectores remotos: neo4j, gbrain (MCP), bucket S3, banco relacional | 2 |

Decisão de fronteira entre as skills, já tomada: a skill de comparação entrega um delta **resolvido contra o
canônico** (ids casados, conflitos e perguntas respondidos, versão do store em que se baseou), e é ele que é
revisado; a skill de merge só o aplica, de forma mecânica e atômica, e recusa se o store mudou desde a
comparação. Neste subprojeto, isso implica: o vocabulário livre é traduzido na entrada da comparação (hoje o
`merge --plan`), e o plano já sai em 2.0.

### Decisões do usuário

| Tema | Decisão |
|---|---|
| Notação de armazenamento | ArchiMate como tipo canônico, perfil C4 por cima |
| Fronteira das skills | (a) comparação entrega delta resolvido; merge só aplica |
| Banco de dados | `application-component` com `c4.kind: container` e tag `database`; o conteúdo, quando conhecido, como `data-object` separado |
| Perfil C4 | `c4.kind` sempre gravado; inferência pela profundidade só na entrada |
| `external`, `technology` | campos de primeiro nível do elemento |
| Relações | só os 11 tipos ArchiMate; `uses` e `rel.c4` saem do store |
| Hierarquia | lista plana com `parent`; cada conector a representa no seu meio |
| Informações do usuário | `properties` (escalares e listas de texto) com catálogo opcional no manifesto |
| Bases existentes | **abordagem A**: store estrito em 2.0; base 1.x recusada com orientação; `archlens migrate` converte |
| Escopo extra | derivação do C4 através de serviços/interfaces; `data-object` com pai num container sobe até ele |

### Critérios de sucesso

1. `migrate` de `loja-online`, `telemedicina` e `repos` produz bases 2.0 que passam no `validate` sem erros, e a
   checagem de equivalência (seção 2) passa.
2. Nenhum módulo além de `scripts/lib/canonical.mjs` conhece `c4:*`, `archimate:*`, `uses`, `children` ou o override
   `archimate` (verificável por busca no código).
3. Um modelo escrito só com tipos ArchiMate (componentes, serviços, interfaces, sem nenhum `uses`) gera visões C4
   com as setas esperadas.
4. O scan não descarta mais relações com bancos de dados, e todo motor de banco liga-se ao banco por `serving`.
5. Abrir uma base 1.x com qualquer comando produz `E_STORE_FORMAT` com a instrução de `migrate`; nada é gravado.

### Fora do escopo

Contrato novo do store e conectores (subprojetos 2 e 4); divisão em skills (3); nível deployment do C4 (item c,
este spec só deixa os kinds `deploymentNode`/`infrastructureNode` válidos nos tipos de tecnologia); promoção
automática de propriedade a elemento (só sugerida pela skill); ArchiMate rigoroso de deployment (container =
componente + artifact + node).

## 1. Formato 2.0

### Manifesto (`archlens.json`)

```json
{
  "archlens": "2.0",
  "name": "Loja Online",
  "description": "…",
  "properties": {
    "squad":        { "label": "Squad", "type": "string", "appliesTo": ["application-component"] },
    "businessUnit": { "label": "Business Unit", "type": "string", "values": ["Varejo", "Atacado"] },
    "tiers":        { "label": "Canais", "type": "string[]" }
  }
}
```

- `archlens` passa a `"2.0"`. Os demais campos do a.3 (`layout`, `store` reservado, `assumptions`) não mudam.
- `properties` (opcional) é o **catálogo de propriedades** do usuário. Cada chave: `label` (opcional), `type`
  (`string` | `number` | `boolean` | `string[]`, padrão `string`), `values` (opcional, lista fechada) e `appliesTo`
  (opcional, lista de tipos ArchiMate, ou `"relationship"`).

### Elemento

```json
{
  "id": "loja.pedidos",
  "type": "application-component",
  "name": "API de Pedidos",
  "parent": "loja",
  "c4": { "kind": "container" },
  "external": false,
  "technology": "Java / Spring Boot",
  "description": "Carrinho, checkout e ciclo de vida do pedido",
  "tags": [],
  "group": null,
  "status": "active",
  "aliases": [],
  "sources": [],
  "properties": { "squad": "Checkout", "businessUnit": "Varejo" }
}
```

- `type`: nome ArchiMate sem prefixo; enum de `ELEMENT_TYPES`.
- `parent`: id do pai, ou ausente. Não há `children`. Em `model.json` e em cada arquivo de `model/*.json`, os
  elementos ficam em ordem de pai antes de filho (ordem estável para diffs); um elemento pode ter o pai em outro
  arquivo do `model/`.
- `c4`: `{ "kind": … }`, presente quando o elemento participa do C4. Kinds válidos por tipo:

  | `c4.kind` | tipos ArchiMate aceitos |
  |---|---|
  | `person` | `business-actor`, `business-role` |
  | `softwareSystem`, `container`, `component` | `application-component` |
  | `deploymentNode`, `infrastructureNode` | `node`, `device`, `system-software`, `technology-service`, `communication-network` |

- `external`, `technology`, `description`, `owner`, `url`, `inferred`, `confidence`, `statusReason`, `tags`, `group`,
  `status`, `aliases`, `sources`: como hoje.
- `properties`: valores escalares (texto, número, booleano) ou listas de texto.
- Saem: `children`, `archimate` (override), o prefixo em `type`.
- **Banco de dados:** `application-component` + `c4.kind: container` + tag `database`. O C4 desenha o cilindro pela
  tag. O conteúdo (tabelas, entidades), quando conhecido, é `data-object` com `parent` no banco, acessado por quem o
  usa e, se for o caso, realizando um `business-object`.

### Relação

```json
{ "from": "loja.db", "to": "loja.pedidos", "type": "serving", "description": "lê e grava pedidos", "technology": "JDBC" }
```

- `type`: um dos 11 tipos de `RELATIONSHIP_TYPES`. Não há `uses`.
- `accessType` (`read` | `write` | `readwrite`) só em `access`, cujo alvo é passivo.
- `id`, `description`, `technology`, `tags`, `properties`, `status`, `statusReason`, `inferred`, `sources`: como hoje.
- Sai: `rel.c4`. A orientação C4 é derivada do tipo (`c4Orientation`).
- Ids gerados continuam `${from}-${type}-${to}` sobre a forma canônica, como o `normalizeModel` já faz hoje;
  portanto um `uses` convertido mantém o id. Só mudam os ids das relações com bancos (seção 2).

### Validação

| Código | Nível | Quando |
|---|---|---|
| `E_STORE_FORMAT` | erro | um comando abre uma base cujo `archlens` não é `2.x`. Mensagem: "base no formato 1.x; rode `archlens migrate <base>`" |
| `E_UNKNOWN_TYPE` | erro | `type` fora de `ELEMENT_TYPES` (inclui `c4:*` e prefixos no store) |
| `E_REL_TYPE` | erro | relação com tipo fora de `RELATIONSHIP_TYPES` (inclui `uses` no store) |
| `E_C4_TYPE` | erro | `c4.kind` incompatível com o `type` (tabela acima) |
| `E_C4_HIERARCHY` / `W_C4_ORPHAN` | como hoje | componente dentro de container, container dentro de sistema, pessoa e sistema no topo |
| `W_PROPERTY` | aviso | com catálogo: chave desconhecida, tipo errado, valor fora de `values`, tipo de elemento fora de `appliesTo` |
| `E_SCHEMA` | erro | `properties` com valor que não é escalar nem lista de texto |

`E_C4_HIERARCHY` passa a olhar `c4.kind` gravado (não há mais inferência na leitura). Um `data-object` filho de um
container é permitido (não tem `c4.kind`, então não entra na regra).

## 2. Tradução na entrada e migração

### `scripts/lib/canonical.mjs`

`toCanonical(input, { base })` → `{ raw, issues, report }`. `input` é um delta ou um raw de modelo no
vocabulário livre; `base` é o raw 2.0 atual (opcional), consultado para saber o tipo de alvos que não estão no
`input`. É o único módulo que conhece o vocabulário livre. `resolveType` e `C4_TO_ARCHIMATE` saem de
`registry.mjs` e passam a ser internos dele.

| Entrada | Saída 2.0 |
|---|---|
| `c4:person` | `business-actor` + `c4.kind: person` |
| `c4:softwareSystem` / `c4:container` / `c4:component` | `application-component` + o kind correspondente (a tag `database` não muda mais o tipo) |
| `c4:deploymentNode` / `c4:infrastructureNode` | `node` + o kind |
| `archimate:X` ou `X` | `X` |
| override `archimate: Y` em elemento `c4:*` | `type: Y` e o kind C4 mantido; se a combinação não é válida, `E_C4_TYPE` |
| `children` | lista plana com `parent`, em ordem de pai antes de filho |
| `application-component` sem `c4` | kind inferido pela profundidade numa cadeia de `application-component` (0 sistema, 1 container, 2 componente; mais fundo, sem kind) |
| `business-actor` ou `business-role` de topo sem `c4` | `c4.kind: person` |
| `uses` / `c4:uses` com alvo ativo | `serving` com as pontas invertidas |
| `uses` / `c4:uses` com alvo passivo | `access` com `accessType` (padrão `readwrite`) |
| `archimate:R` / `R` | `R` |

`report` conta tipos reescritos, `uses` convertidos e kinds inferidos (usado pelo `migrate` e pelo relatório do
plano). Elementos já em 2.0 passam inalterados (a função é idempotente).

### Onde a tradução roda

- **`merge --plan` / `previewMerge`:** o delta passa por `toCanonical` antes do casamento de entidades; o plano
  (`plan.schema.json`) e tudo o que `merge --apply` grava já estão em 2.0. Hoje o `merge.mjs` chama `resolveType` e
  `canonicalRel` em vários pontos (`typeOf`, `relKey`, `relId`, `mergeElements`); depois da tradução esses pontos leem
  o `type` direto.
- **`normalizeModel`:** lê só 2.0. Sem `resolveType`, sem inferência de kind, sem `canonicalRel`; `c4KindOf` passa a
  ser `el.c4?.kind ?? null`.
- **Scan:** `to-delta.mjs` continua emitindo vocabulário livre (é entrada). Saem os contornos: a exceção da linha 211
  e o `realization` para motores de banco (todo motor liga-se por `serving`).
- **Leituras da base** (`validate`, `views`, `resolve`, `render`, `build`, `check`, `doc`): sobre 2.0; base 1.x →
  `E_STORE_FORMAT`.

### `archlens migrate <base>`

Hoje só converte o legado (`.md` com bloco `archlens-json`) para pasta. Passa a aceitar também uma pasta 1.x,
convertida **no mesmo lugar**; o legado vai direto para pasta 2.0.

1. Carrega a base 1.x (pelos adaptadores atuais) e a valida com as regras 1.x (o `normalizeModel` 1.x é preservado
   como `normalizeLegacy` dentro de `canonical.mjs`, só para isto). Com erros, nada é gravado.
2. `toCanonical` sobre o raw; conversão dos bancos (abaixo); valida o 2.0. Com erros, nada é gravado.
3. Grava numa pasta temporária ao lado, relê e confere a **equivalência**: o modelo normalizado da 1.x e o da 2.0
   têm os mesmos elementos (id, tipo, camada, kind C4, pai, grupo, status, propriedades) e as mesmas relações (id,
   tipo, pontas), descontadas as conversões dos bancos. Passando, troca a pasta; senão, apaga a temporária e falha
   com a lista das diferenças.
4. **Bancos:** um elemento que na 1.x virava `data-object` por ser `c4:container` com tag de dado (`DATA_TAGS`)
   passa a `application-component` + `c4.kind: container`. Cada `access` cujo alvo é esse banco vira `serving` do
   banco para a origem; um `accessType` diferente de `readwrite` é guardado em `properties.accessType`. Os ids dessas
   relações mudam, e o `migrate` reescreve as referências a eles nas visões (`steps[].rel`, `include`/`exclude` por
   id). O changelog antigo não é reescrito (é histórico).
5. Acrescenta ao changelog uma rodada "migração para o formato 2.0" com o `report`.
6. Imprime o relatório (tipos reescritos, `uses` convertidos, bancos convertidos, kinds inferidos) e o commit
   sugerido. Planos gerados antes da migração deixam de valer (o hash da base muda): aviso, como no a.3.

A skill pergunta antes de migrar (regra existente do `SKILL.md`).

### Erros novos

`E_STORE_FORMAT`, `E_C4_TYPE`, `W_PROPERTY` (seção 1); `E_MIGRATE_EQUIV` (equivalência falhou; nada foi trocado).

## 3. C4 a partir de um modelo ArchiMate (`query-c4.mjs`)

### Dono de um intermediário

Intermediários: `application-service`, `application-interface`, `application-function`, `application-process`.
O **dono** de um intermediário X é todo elemento com `c4.kind` que:

- `realization` → X, ou
- `assignment` → X, ou
- `composition` → X, ou
- é o `parent` de X (já tratado pela subida de hierarquia).

Donos são resolvidos transitivamente através de outros intermediários (um processo atribuído a uma função que um
componente realiza), com proteção contra ciclos.

### Derivação

Antes de subir as pontas de uma relação ao nível visível (`rep`), toda ponta que é intermediário é trocada por cada
um dos seus donos. Exemplo: `S serving A` com B dono de S → seta `A → B`. Dois donos → duas setas. Intermediário sem
dono → relação descartada, como hoje. As relações estruturais usadas para achar o dono (`realization`,
`assignment`, `composition`) não viram setas.

### Apresentação

- A seta derivada tem `derived: true` e `via: [ids dos intermediários]`; o renderizador usa o estilo de relação
  derivada já existente nas visões ArchiMate (tracejado mais claro) e o tooltip "via <nome>".
- Descrição: a da relação original; sem descrição, o nome do intermediário.
- Se o mesmo par já tem uma seta direta, a derivada é agregada a ela (contagem, descrições, tecnologias) e a seta não
  ganha o estilo derivado.
- View spec: `"derive": false` desliga (padrão ligado). Entra em `view.schema.json`.

### `data-object` no C4

Um `data-object` com `parent` num container sobe até ele pela regra de hierarquia existente: `API access pedidos`
(com `pedidos.parent = loja.db`) aparece como `API → Banco de Pedidos`. Um `data-object` sem pai num elemento C4 fica
fora do C4. Ele não ganha `c4.kind`.

### Banco no C4

O cilindro passa a vir só da tag (`database`, `datastore`), não mais de `type === 'data-object'`
(`query-c4.mjs:191`).

## 4. Skill, referências, exemplos e documentação

- `SKILL.md`: formato 2.0, vocabulário livre aceito só na entrada, `migrate` para bases 1.x, propriedades e catálogo,
  a regra "propriedade para filtrar, elemento para atravessar" (sugerir promoção quando o usuário pedir travessia
  por um valor de propriedade).
- `references/c4.md`: tabela C4 ↔ ArchiMate atualizada (banco como `application-component`, kinds de tecnologia,
  derivação via serviços). `references/archimate.md`: padrões de modelagem com intermediários e donos.
  `references/merge.md`: tradução na entrada. `references/knowledge-doc.md`: formato 2.0 e catálogo.
- `schemas/`: `model.schema.json` estrito 2.0 (enums de `ELEMENT_TYPES`, `RELATIONSHIP_TYPES`, `c4.kind`);
  `delta.schema.json` mantém o vocabulário livre; `plan.schema.json` em 2.0; `view.schema.json` com `derive`;
  `gen-schemas.mjs` gera os três a partir do registry.
- `examples/*/architecture/`: migrados com o próprio `migrate`; `ARCHITECTURE.md` e diagramas regenerados. Os
  `delta-*.json` continuam no vocabulário livre; os `plano-*.json` são regenerados.
- Setas novas no C4 dos exemplos (pela derivação) são revisadas uma a uma antes de atualizar o esperado.
- `CHANGELOG.md` em `[Não lançado]` (mudança incompatível de formato, com o `migrate`); `docs/GUIA.md` e `README.md`
  onde mostram o formato; `docs/superpowers/roadmap.md` com os subprojetos 1–4.

## 5. Testes (TDD, `node:test`)

- **`canonical.test.mjs`:** cada linha da tabela de tradução; idempotência sobre 2.0; `uses` com alvo só na base;
  override `archimate` válido e inválido (`E_C4_TYPE`); `children` → `parent` em ordem; inferência de kind por
  profundidade; `report`.
- **`model.test.mjs`:** `E_STORE_FORMAT`, `E_UNKNOWN_TYPE` para `c4:*` no store, `E_REL_TYPE` para `uses` no store,
  `E_C4_TYPE` em cada linha da tabela de kinds, `E_C4_HIERARCHY` sobre `c4.kind` gravado, `data-object` filho de
  container aceito, `properties` com lista, `W_PROPERTY` em cada caso do catálogo, sem catálogo nenhum aviso.
- **`migrate`** (`cli.test.mjs`, fixture nova de base 1.x com banco, `uses`, `children`, dinâmica com `steps[].rel`
  apontando para relação com o banco): conversão no lugar, equivalência, bancos e `accessType`, ids reescritos nas
  visões, rodada no changelog, falha de equivalência não troca nada (`E_MIGRATE_EQUIV`), legado direto para 2.0.
- **`query.test.mjs`:** derivação via serviço, via interface (composição), via função atribuída, cadeia de
  intermediários, ciclo, dois donos, sem dono, agregação com seta direta, `derive: false`, `data-object` com e sem
  pai num container, cilindro só pela tag.
- **`merge.test.mjs` / `preview.test.mjs`:** delta em vocabulário livre gera plano 2.0; `apply` grava 2.0; casamento
  de entidades entre delta `c4:container` e base `application-component` + kind.
- **Scan:** banco ligado por `serving` ao motor e às APIs, sem relações descartadas.
- **`examples.test.mjs`:** os exemplos migrados validam e renderizam.
- Fixtures de modelo (`tests/fixtures/shop.json`, `platforms.json`) migradas para 2.0; a nova fixture 1.x fica só para
  o `migrate`.
- Testes que montam **bases** inline no vocabulário livre (hoje em `model`, `store`, `render`, `cli`, `query`,
  `doc`) passam por um helper `asBase(raw)` (`toCanonical` + `archlens: "2.0"`), para continuarem legíveis; os testes
  do formato estrito usam literais 2.0. **Deltas** inline (`merge`, `preview`, `scan-delta`) continuam no vocabulário
  livre, porque são entrada.
