# View specs

Uma visão é uma **consulta** sobre o modelo. O mesmo `ARCHITECTURE.md` responde a qualquer número
de visões novas sem remodelar. Campos comuns:

| Campo | Descrição |
|---|---|
| `key` | identificador único (vira `#key` na URL do HTML) |
| `notation` | `"c4"` ou `"archimate"` |
| `title`, `description` | textos da visão |
| `include` | ids forçados na visão |
| `exclude` | padrões: `"<id>"`, `"tag:<tag>"`, `"type:<tipo ArchiMate ou kind C4>"`, `"layer:<camada>"`, `"external"` |
| `layout` | `{ "direction": "RIGHT" \| "DOWN" \| "auto", "aspectRatio": 1.78 }` |
| `animation` | `trace` (padrão C4), `story` (dinâmica), `impact` (ArchiMate com âncora), `layers` |
| `edgeLabels` | mostra rótulos das relações sempre (padrão: C4 sim, ArchiMate só ao destacar/tecla R) |

## C4

| Campo | Descrição |
|---|---|
| `level` | `landscape`, `context`, `container`, `component`, `dynamic` |
| `scope` | softwareSystem (context/container/dynamic) ou container (component/dynamic) |
| `focus` | ids em destaque; a visão é cortada à vizinhança deles |
| `depth` | saltos a partir do foco (padrão 1) |
| `steps` | só `dynamic`: `[{ "from", "to", "description"?, "technology"? }]` ou `[{ "rel": "<id>" }]` |

Semântica:

- **Elevação de relações:** se a visão mostra containers, `componenteA → componenteB` vira
  `containerA → containerB`. Relações paralelas são agregadas (`count`, descrições e tecnologias unidas).
- **context:** o sistema no escopo + tudo ligado a ele (pessoas e sistemas).
- **container:** abre o boundary do sistema. Mostra os containers e os elementos externos ligados a eles.
- **component:** abre o container. Mostra os componentes e os containers irmãos e sistemas externos ligados a eles.
- **dynamic:** só os passos, numerados. Com `scope` num sistema, os passos são elevados a containers;
  com `scope` num container, a componentes. A animação **story** toca os passos em ordem.
- Elementos puramente ArchiMate (nós, processos…) não aparecem em visões C4.
  `application-component` e `business-actor` sem perfil C4 são tratados como sistema e pessoa.

Exemplo, containers com foco na API e seus vizinhos imediatos:

```json
{ "key": "api-foco", "notation": "c4", "level": "container", "scope": "loja",
  "focus": ["loja.pedidos"], "depth": 1, "title": "Containers — foco na API de Pedidos" }
```

## ArchiMate

| Campo | Descrição |
|---|---|
| `viewpoint` | `business`, `application`, `technology`, `strategy`, `motivation`, `implementation-migration`, `application-cooperation`, `implementation-deployment`, `layered`, `product-support`, `impact`, `custom` |
| `layers` | sobrescreve as camadas do viewpoint (`["business","technology"]`) |
| `types` | restringe a tipos ArchiMate (`["application-component","application-service"]`) |
| `anchor` | elemento de partida da travessia |
| `traverse.mode` | `supporters` (o que sustenta a âncora), `dependents` (o que depende dela), `both` |
| `traverse.via` | relações percorridas (padrão: composition, aggregation, assignment, realization, serving, access, influence). Acrescente `flow`/`triggering` para seguir processos |
| `traverse.maxDepth` | padrão 12 |
| `traverse.hierarchy` | considera o aninhamento (children) como composição (padrão true) |
| `granularity` | `component` (tudo), `container` (esconde componentes C4 e o sistema-pai quando seus containers aparecem), `system`. Padrão: `container` em `product-support`/`impact`, `component` nos demais |
| `collapse` | tipos a esconder, com derivação através deles (ex.: `["application-service"]`) |
| `derive` | cria relações derivadas através do que ficou oculto (padrão true) |
| `output` | `["diagram","matrix"]` gera a matriz de dependência (sempre ativa em `impact`) |

### Travessia por suporte

Cada relação define quem **sustenta** quem:

| relação | sustenta → é sustentado |
|---|---|
| serving, realization, assignment, influence | origem → destino |
| composition, aggregation | parte → todo |
| access | dado → quem acessa |
| triggering, flow | antes → depois (só se incluídas em `via`) |

- `supporters(P)`: tudo que sustenta P, transitivamente. Um produto desce por serviços, processos,
  app services, containers e tecnologia.
- `dependents(A)`: tudo que A sustenta, ou seja, o **impacto** se A falhar. Um container sobe por
  app services, processos, serviços e produtos.
- **Hierarquia:** a parte sustenta o todo. Subir ao pai para contexto é permitido (o componente leva
  ao container, e o container à infraestrutura que o hospeda), mas depois de subir não se desce de
  novo, então os irmãos não vazam para a visão.
- `both` roda as duas travessias e marca cada elemento como `supporter`, `dependent` ou `both`.
  Os nós mostram `↓n` (sustenta, distância n) e `↑n` (depende).

### Derivação

Quando um elemento some da visão (por camada, `collapse` ou `granularity`), a cadeia que passava
por ele vira uma **relação derivada** (tracejada, tooltip "via …"). O tipo é o mais fraco da cadeia
(composition > aggregation > assignment > realization > serving > access > influence), como nas
regras de derivação do ArchiMate. Exemplo: `k8s serving container` + `container ⊃ componente` +
`componente realization app-service` + `app-service serving processo` ⇒ `k8s ⇢ serving ⇢ processo`.
É uma derivação simplificada: segue o caminho mais curto até a âncora, um por elemento.

### Receitas

Oferta e tudo que a sustenta, organizado por camada:

```json
{ "key": "suporte-venda", "notation": "archimate", "viewpoint": "product-support",
  "anchor": "prod-venda", "collapse": ["application-service", "technology-service"] }
```

Processo e suas dependências de aplicação e tecnologia:

```json
{ "key": "suporte-checkout", "notation": "archimate", "viewpoint": "layered",
  "anchor": "bp-checkout", "traverse": { "mode": "supporters" }, "granularity": "container" }
```

Matriz de dependência de um application component (negócio impactado + tecnologia necessária):

```json
{ "key": "impacto-api", "notation": "archimate", "viewpoint": "impact", "anchor": "loja.pedidos" }
```

Só negócio × tecnologia (a aplicação vira relações derivadas):

```json
{ "key": "neg-tec", "notation": "archimate", "viewpoint": "custom", "layers": ["business", "technology"],
  "anchor": "prod-venda", "traverse": { "mode": "supporters" }, "derive": true }
```

Camada de aplicação sem ruído de componentes:

```json
{ "key": "aplicacao", "notation": "archimate", "viewpoint": "application", "granularity": "container" }
```

## Layout

- **C4:** ELK *layered* com boundaries aninhados. O padrão é `RIGHT` (paisagem, 16:9). Se `RIGHT` sair alto e
  estreito, testa `DOWN`. Se ainda ficar mais estreito que a proporção-alvo, alarga os vãos entre
  camadas (nunca as caixas). `layout.direction` força a direção; `"auto"` escolhe a melhor.
- **ArchiMate:** faixas horizontais de camada com largura total. Em cada faixa, as linhas seguem a
  convenção ArchiMate (serviços/produtos em cima, comportamento no meio, estrutura ativa/passiva
  embaixo). Os nós são ordenados por baricentro e distribuídos na largura. As colunas são escolhidas
  para chegar a 16:9, e as arestas são curvas entre portas distribuídas nas faces.

## Tamanho e legibilidade

Fontes em unidades do SVG (15–20). A página avisa quando o texto fica abaixo de 14px na tela, e o
`deliver` mede isso em 1920×1080 e 1280×720. Como regra prática, até ~12 nós C4 ou ~24 nós ArchiMate
por visão.
