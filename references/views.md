# View specs

Uma visão é uma **consulta** sobre o modelo. O mesmo modelo (`architecture/`) responde a qualquer número
de visões novas sem remodelar. Campos comuns:

| Campo | Descrição |
|---|---|
| `key` | identificador único (vira `#key` na URL do HTML) |
| `notation` | `"c4"` ou `"archimate"` |
| `title`, `description` | textos da visão |
| `include` | ids forçados na visão |
| `exclude` | padrões: `"<id>"`, `"tag:<tag>"`, `"type:<tipo ArchiMate ou kind C4>"`, `"layer:<camada>"`, `"external"` |
| `status` | status mostrados (padrão: todos menos `retired`). Esconder um elemento esconde o que está aninhado nele. As-is: `["active","deprecated"]`; to-be: `["draft","planned","active"]`. `draft` aparece em esboço. |
| `layout` | `{ "direction": "RIGHT" \| "DOWN" \| "auto", "aspectRatio": 1.78, "style": "auto" \| "flow" \| "bands" \| "bands-flow" }` (`style` só vale para ArchiMate) |
| `animation` | `trace` (padrão C4), `story` (dinâmica), `impact` (ArchiMate com âncora), `layers` |
| `edgeLabels` | mostra rótulos das relações sempre (padrão: C4 sim, ArchiMate só ao destacar/tecla R) |

## C4

| Campo | Descrição |
|---|---|
| `level` | `landscape`, `context`, `container`, `component`, `dynamic` |
| `scope` | softwareSystem (context/container/dynamic) ou container (component/dynamic) |
| `focus` | ids em destaque; a visão é cortada à vizinhança deles |
| `depth` | saltos a partir do foco (padrão 1) |
| `expand` | `container`/`dynamic` com scope num sistema: outros software systems a abrir também, cada um no seu boundary (ex.: mostrar o tópico do produtor num fluxo do consumidor) |
| `steps` | só `dynamic`: `[{ "from", "to", "description"?, "technology"? }]` ou `[{ "rel": "<id>" }]` |
| `derive` | `false` desliga as setas derivadas através de `application-service`, `application-interface`, `application-function` e `application-process` (padrão ligado; veja `c4.md`) |

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
| `traverse.hierarchy` | considera a hierarquia (`parent`) como composição (padrão true) |
| `granularity` | `component` (tudo), `container` (esconde componentes C4 e o sistema-pai quando seus containers aparecem), `system`. Padrão: `container` em `product-support`/`impact`, `component` nos demais |
| `collapse` | tipos a esconder, com derivação através deles (ex.: `["application-service"]`) |
| `derive` | cria relações derivadas através do que ficou oculto (padrão true) |
| `nesting` | `"edges"` (padrão: pai e filho ligados pelo losango de composição), `"nested"` (filhos dentro da caixa do pai) ou `{ "mode": "edges" \| "nested", "depth": <inteiro ≥ 1>, "except": ["id", …] }` (`depth` aninha só até esse nível; abaixo dele, o elemento fica na caixa do ancestral aninhado mais próximo, ligado pelo losango. `except` lista os elementos que **fazem o contrário** do `mode`: em `nested`, não guardam os filhos, que ficam ao lado dele, ligados pelo losango; em `edges`, são os únicos que guardam os filhos dentro. Id inexistente: `E_UNKNOWN_REF`; id fora da visão é ignorado). Valor inválido: `E_VIEW_NESTING` |
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

Camada de aplicação com os containers dentro do sistema e os componentes ao lado, ligados pelo losango:

```json
{ "key": "aplicacao-aninhada", "notation": "archimate", "viewpoint": "application", "include": ["loja"],
  "nesting": { "mode": "nested", "depth": 1 } }
```

Tudo aninhado, menos dentro de `loja.api` (os filhos dele ficam ao lado, ligados pelo losango):

```json
{ "key": "aplicacao-quase-aninhada", "notation": "archimate", "viewpoint": "application", "include": ["loja"],
  "nesting": { "mode": "nested", "except": ["loja.api"] } }
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

## Agrupamentos e molduras

`groups` recorta e desenha por agrupamento (`grouping`, veja `notation.md`):

```json
{ "key": "aut-x-cred", "notation": "c4", "level": "landscape",
  "groups": { "only": ["plat-autorizacao", "plat-credito"], "crossOnly": false, "frames": true } }
```

- **`only`**: restringe a visão aos membros desses grupos e às relações entre eles. Compõe com notação, nível,
  viewpoint, camadas e `status`.
- **`depth` com `only`**: acrescenta vizinhos externos aos grupos até a distância pedida.
- **`crossOnly`** (padrão `false`): só elementos com relação de um grupo listado para outro, e só essas relações.
  Exige `only` com 2+ grupos.
- **`frames`**: explícito vem do pedido; omitido vale `true` com `only` e `false` sem. Com `frames` e sem `only`,
  cada membro visível fica na moldura do seu grupo.
- **O que fica sempre:** o `scope` da visão de contexto e o interior da fronteira aberta (containers da visão
  container, componentes da visão component) ficam mesmo fora de `only`.
- **Dinâmica** (`level: "dynamic"`): `only`/`crossOnly` não recortam, porque os passos são autorais; as molduras
  valem.
- **ArchiMate:** um agrupamento nunca é nó: como `anchor` dá `E_VIEW_GROUP` (use `only`), e em `include` é ignorado.
- **Matriz de impacto:** lista a travessia inteira a partir da âncora, não só o que o recorte por grupo mostra
  (o que o recorte esconde aparece marcado como "oculto na visão").
- `E_VIEW_GROUP`: id em `only` que não existe, que não é `grouping` ou que está oculto pelo filtro de `status` da
  visão (ex.: agrupamento `retired`: tire-o de `only` ou acrescente `"retired"` em `status`); ou `crossOnly` com
  menos de 2 grupos.

Desenho. **C4:** moldura → fronteira do sistema → containers; a fronteira do sistema aberto fica dentro da moldura
do grupo dele, e as setas ligam elementos, nunca a moldura. **ArchiMate:** uma moldura por grupo × camada (nenhuma
atravessa faixas). `bands` não agrupa: com molduras, `auto` escolhe entre `flow` e `bands-flow`, e `bands` pedido
vira `bands-flow` com aviso no build. Com `nesting` aninhado, `bands` também vira `bands-flow`.

## Layout

- **C4:** ELK *layered* com boundaries aninhados. O padrão é `RIGHT` (paisagem, 16:9). Se `RIGHT` sair alto e
  estreito, testa `DOWN`. Se ainda ficar mais estreito que a proporção-alvo, alarga os vãos entre
  camadas (nunca as caixas). `layout.direction` força a direção; `"auto"` escolhe a melhor.
- **ArchiMate:** três estilos, escolhidos por visão em `layout.style`:

  | `style` | Como fica | Bom para |
  |---|---|---|
  | `flow` | ELK *layered* com cada camada numa partição. As cadeias de dependência definem a ordem e as arestas são ortogonais, como no C4. As camadas viram faixas (`DOWN`) ou colunas (`RIGHT`, o que render maior; `layout.direction` força) | cadeias longas, visões de impacto, camada única |
  | `bands` | Faixas horizontais com linhas pela convenção ArchiMate (serviços em cima, comportamento no meio, estrutura embaixo), nós por baricentro, arestas ortogonais com um trilho próprio no vão, e vãos que crescem com o número de arestas | poucas dependências dentro da camada, leitura "clássica" |
  | `bands-flow` | Faixas horizontais, com o fluxo de dependências da esquerda para a direita *dentro* de cada faixa (ELK por faixa). As faixas são alinhadas entre si, e as arestas entre camadas passam por um roteador ortogonal que desvia das caixas | visões em camadas com dependências dentro e entre camadas |
  | `auto` (padrão) | Gera os três e fica com o de menor custo em `layoutQuality`: cruzamentos, arestas sobre caixas e dobras por aresta, mais uma penalidade leve para texto < 18px no encaixe inicial e um pedágio pequeno para colunas | quando o pedido não diz nada |

  O build mostra o estilo escolhido e as notas (`layout "k": bands-flow (auto; …)`). Se o usuário pedir
  um estilo, grave-o na visão e ele deixa de ser automático.

## Consulta em markdown

`archlens query` responde em texto o que o `deliver` desenha, sem gravar nada (skill archlens-query). Resolve a
mesma view spec que o `resolve` (o mesmo view IR) e escreve markdown (padrão) ou JSON (`--format json`, as mesmas
estruturas sem formatação); `--out f` grava num arquivo (fora da base).

```bash
node scripts/archlens.mjs query architecture/ --view containers                                   # visão salva
node scripts/archlens.mjs query architecture/ --spec '{"notation":"archimate","viewpoint":"impact","anchor":"loja.pedidos"}'
node scripts/archlens.mjs query architecture/ --element loja.pedidos --depth 1                    # cartão do elemento
```

**Visão** (`--view k` ou `--spec J`):

- título e a spec usada (uma linha de JSON);
- elementos agrupados por camada (ArchiMate) ou por nível (C4): tabela `nome · tipo/kind · status · tecnologia`;
- relações: uma linha por aresta, com a frase da ajuda sobre relações (abaixo);
- viewpoint `impact`: a matriz de dependência como tabela markdown;
- visões com mais de 40 nós: nota no fim sugerindo recortar.

**Cartão de elemento** (`--element id [--depth N] [--via t1,t2]`): nome, tipo, perfil C4, status, tecnologia,
descrição, pai e filhos, relações de saída e de entrada agrupadas por tipo, propriedades, fontes (proveniência) e as
rodadas do histórico que citam o id. Lê só o subgrafo em volta do elemento (padrão `depth: 1`); `--depth N` inclui os
vizinhos a N saltos numa seção "Em volta", e `--via` limita a travessia a esses tipos de relação. Id inexistente:
`E_UNKNOWN_REF` com sugestões por nome e alias.

## Ajuda sobre relações

Cada aresta do view IR renderizado ganha `help` (`scripts/lib/explain.mjs`), com os campos sentence, meaning, reading, impact, c4 e derived.
O texto é gerado a partir dos tipos das pontas (atribuição ator→papel vira "desempenha o papel", nó→artefato vira "roda em", realização de requisito vira "atende a"…). O glossário da página vem de `GLOSSARY`, no mesmo arquivo.

## Tamanho e legibilidade

Fontes em unidades do SVG (15–20). A página avisa quando o texto fica abaixo de 14px na tela, e o
`deliver` mede isso em 1920×1080 e 1280×720. Como regra prática, até ~12 nós C4 ou ~24 nós ArchiMate
por visão.
