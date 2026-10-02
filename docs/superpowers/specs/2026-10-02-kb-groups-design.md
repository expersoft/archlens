# Agrupamentos e molduras (C4 e ArchiMate)

- **Data:** 2026-10-02
- **Branch:** `feat/kb-groups` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito
- **Roadmap:** item (a.2) de [`docs/superpowers/roadmap.md`](../roadmap.md), revisto: deixa de ser "só C4" e passa a valer
  nas duas notações, com recorte por agrupamento e molduras controladas pela visão
- **Protótipo visual aprovado:** artefato "Molduras de agrupamento" (landscape e containers C4, visão em camadas ArchiMate)

## Contexto e objetivo

No teste com o prompt de autorização de cartões, "Camada de Autorização", "Camada Transacional" e "Camada de Fraude"
eram agrupadores usados para organizar o prompt, mas viraram `c4:softwareSystem` no modelo canônico. Os diagramas
mostraram caixas que não existem, e as visões ArchiMate perderam as relações entre as aplicações.

**Objetivo:** representar agrupamentos (ex.: Plataforma de Autorização, Plataforma de Crédito) como conceito próprio
do modelo, desenhá-los como **molduras** dentro das visões existentes (não um nível C4 novo, nem um viewpoint
ArchiMate concorrente), permitir visões recortadas por agrupamento ("interações entre os sistemas de A e de B") e
deixar o prompt decidir se as molduras aparecem.

### Decisões do usuário

| Tema | Decisão |
|---|---|
| Membros | **Qualquer elemento** (sistemas, processos, serviços, nós de tecnologia…); containers e componentes herdam do sistema pai |
| Estrutura | **Um grupo por elemento, sem aninhamento**: molduras nunca se cruzam |
| Recorte "entre A e B" | **Membros + relações entre eles** (internas e cruzadas); opção "só o que cruza"; vizinhos externos só com `depth` |
| Padrão das molduras | **Mostra se a visão recorta por grupo**; o prompt sempre pode forçar com/sem |
| Modelagem | **A — campo `group` no membro apontando para um elemento `grouping`** |
| Notações | C4 (landscape, contexto, container, componente) e ArchiMate (todos os viewpoints) |

### Critérios de sucesso

1. O caso do teste de cartões é modelável sem sistemas falsos: agrupadores viram `grouping`, e as visões ArchiMate
   mostram as relações entre as aplicações.
2. Uma visão "interações entre A e B" mostra só os membros de A e B e as relações entre eles, com molduras.
3. "Sem molduras" mantém o recorte e só tira as bordas.
4. Visões e modelos sem agrupamentos produzem o mesmo IR e o mesmo layout de antes.
5. No ArchiMate, nenhuma moldura atravessa faixas de camada.

### Fora do escopo

Agrupamentos aninhados; elemento em vários grupos; exportar agrupamentos (item d); moldura no estilo `bands`;
relações com um agrupamento como ponta.

## 1. Modelo, validação e merge

### Modelo

```json
{ "id": "plat-autorizacao", "type": "grouping", "name": "Plataforma de Autorização", "description": "…" }
{ "id": "sleipnir", "type": "c4:softwareSystem", "name": "Autorizador", "group": "plat-autorizacao" }
{ "id": "proc-autorizar", "type": "business-process", "name": "Autorizar compra", "group": "plat-autorizacao" }
```

- `grouping` é o tipo ArchiMate já existente no registro (`registry.mjs`). Tem `status`, `sources`, `aliases` como
  qualquer elemento.
- `group` (string, id de um `grouping`) vale para elementos de qualquer tipo e camada.
- **Herança:** elemento sem `group` próprio herda o do ancestral mais próximo (pela hierarquia `parent`/`children`)
  que tenha um. `normalizeModel` grava o grupo efetivo em `el.groupId` (ou `null`).
- `grouping` não aparece como nó em nenhuma visão.

### Validação

| Código | Quando | Severidade |
|---|---|---|
| `E_GROUP_REF` | `group` aponta para id inexistente ou para elemento que não é `grouping` | erro |
| `E_GROUP_NESTED` | um `grouping` tem `group` | erro |
| `E_GROUP_REL` | relação com um `grouping` em uma das pontas | erro |
| `W_GROUP_EMPTY` | `grouping` sem nenhum membro (direto ou herdado) | aviso |

Schemas (`model`, `delta`) aceitam `group` nos elementos.

### Merge e prévia

- `group` entra em `ELEMENT_FIELDS` do merge: mudar o grupo de um elemento que já tem outro vira **conflito**
  (`keep`/`take`); preencher onde não havia é enriquecimento; tudo vai para o `changelog`.
- Agrupamentos com nomes parecidos caem na detecção de possível duplicata existente.
- Quando o merge casa um `grouping` do delta com um da base (duplicata `same` ou alias), o `group` dos membros no
  delta é remapeado para o id da base, como já acontece com `parent` e com as pontas das relações.
- A prévia compara `group` (`ELEMENT_COMPARED`): mudança de grupo aparece como `~` no elemento.

### Documento gerado

Nova seção **"Agrupamentos"** (depois de "Contexto e atores", só quando há `grouping`): uma subseção por grupo com a
descrição e os membros diretos por camada (membros herdados — containers, componentes — não são repetidos).

## 2. View spec e recorte

```json
{ "key": "aut-x-cred", "notation": "c4", "level": "landscape",
  "groups": { "only": ["plat-autorizacao", "plat-credito"], "crossOnly": false, "frames": true } }
```

- **`only`** (lista de ids de `grouping`): restringe a visão aos membros (efetivos) desses grupos e às relações entre
  eles (internas e cruzadas). Compõe com o resto da spec: notação e nível (C4) ou viewpoint/camadas (ArchiMate)
  continuam decidindo o que é desenhável; `status` filtra como hoje; `depth` (com `only`) acrescenta vizinhos
  externos aos grupos até a distância pedida.
- **`crossOnly`** (`false` padrão): só elementos com relação de um grupo listado para **outro** grupo listado, e só
  essas relações. Exige `only` com 2+ grupos.
- **`frames`**: `true`/`false` explícito vem do prompt; omitido → `true` se há `only`, senão `false`. Com `frames`
  e sem `only`, cada membro visível fica na moldura do seu grupo.
- **C4 e elevação:** quando relações entre containers são elevadas a sistemas, o recorte e o `crossOnly` olham o
  grupo das pontas **já elevadas**.
- **Erros:** id em `only` que não é `grouping` → `E_VIEW_GROUP`; `crossOnly` com menos de 2 grupos →
  `E_VIEW_GROUP` com dica. Recorte vazio → o aviso existente de visão vazia.
- **IR:** a visão resolvida ganha `groups: [{ id, name, status, layer? }]` (só grupos com membros visíveis e só se
  `frames` resolveu `true`) e cada nó ganha `group` (id ou `null`). Visões sem molduras não têm `groups` no IR.

### Pedido → view spec (SKILL.md)

| O usuário pede | View spec |
|---|---|
| panorama com as plataformas | `{notation:"c4", level:"landscape", groups:{frames:true}}` |
| interações entre A e B | acrescente `groups:{only:[A,B]}` |
| só o que cruza entre A e B | `groups:{only:[A,B], crossOnly:true}` |
| sem molduras | `groups:{frames:false}` |

### Sugestões (`archlens views`)

Com 2+ agrupamentos no modelo: sugere `landscape-plataformas` (C4 landscape com molduras) e
`aplicacao-plataformas` (ArchiMate application com molduras).

## 3. Desenho

### C4

- Moldura = nó composto do ELK (mesmo mecanismo da fronteira de sistema).
- Landscape e contexto: uma moldura por grupo com os sistemas e pessoas membros; elementos sem grupo ficam fora.
- Container e componente: sistemas externos à fronteira ganham a moldura do grupo deles; a fronteira do sistema
  aberto fica **dentro** da moldura do grupo do sistema (moldura → fronteira → containers).
- Setas ligam elementos, nunca a moldura.

### ArchiMate

- **Uma moldura por (grupo × camada)**: em viewpoints de uma camada, uma por grupo; em visões em camadas, cada faixa
  tem a moldura do grupo com os membros daquela camada, mesmo rótulo e mesma cor. Nenhuma moldura atravessa faixas.
- `flow` (ELK por partições): a moldura é nó composto na partição da camada; dentro, o ELK ordena os membros.
- `bands-flow` (ELK por faixa): molduras compostas dentro de cada faixa.
- `bands` (grade própria) não agrupa: com molduras ativas, `auto` escolhe entre `flow` e `bands-flow`; `bands`
  pedido explicitamente → aviso no build e uso de `bands-flow`.

### Aparência (as duas notações)

- Contorno contínuo fino, fundo levemente tingido (opacidade ~7% no claro, ~11% no escuro), cor de uma paleta de
  agrupamentos escolhida de forma estável pelo id (hash) — distinta das cores de nível C4 e de camada ArchiMate.
- Rótulo no canto superior esquerdo: chip com ponto colorido, nome do grupo e "AGRUPAMENTO" (C4); no ArchiMate, chip
  de uma linha com o nome.
- Clique no rótulo abre o painel lateral (descrição, membros visíveis, status).
- Legenda: entrada "agrupamento", ao lado da fronteira de sistema (tracejada, sem fundo).
- `grouping` com `status: draft` → moldura em esboço (rough.js, como os demais rascunhos); na prévia, grupo
  novo/alterado/removido ganha `+ ~ −` no chip.
- Modo apresentação e animação: molduras entram antes dos nós que contêm.

## 4. Skill, exemplos e documentação

- `SKILL.md`: linhas da tabela acima; erro comum "agrupador virando sistema" (ex.: "Camada de Autorização" é
  `grouping`, não `c4:softwareSystem`).
- `references/free-text.md`: "a plataforma X tem os sistemas A, B" / "camada de fraude: …" → `grouping` + `group`
  nos membros; na dúvida entre camada técnica e agrupamento, perguntar.
- `references/notation.md`: `grouping`, `group`, herança, erros. `references/views.md`: `groups` e as regras de
  desenho. `docs/GUIA.md`: um parágrafo com exemplo.
- Exemplo `loja-online`: dois agrupamentos (Plataforma de Vendas: loja e checkout; Plataforma de Back-office: ERP,
  estoque) e duas visões salvas (panorama com molduras; aplicação vendas × back-office com `crossOnly`), aplicados
  por delta e merge; `check` passa.
- Roadmap: a.2 atualizado (escopo revisto, link do spec e do plano).

## 5. Testes (TDD, `node:test`)

- Modelo/validação: herança; `E_GROUP_REF`, `E_GROUP_NESTED`, `E_GROUP_REL`, `W_GROUP_EMPTY`; schemas.
- Query: `only` com 2 grupos (internas + cruzadas); `crossOnly`; `depth:1` com vizinhos; elevação C4 respeitando o
  grupo da ponta elevada; `frames` padrão com e sem `only`; `E_VIEW_GROUP`; IR com `groups` e `node.group`.
- Layout: C4 — nós dentro do retângulo da moldura; fronteira do sistema dentro da moldura do grupo; ArchiMate `flow` e
  `bands-flow` — uma moldura por (grupo × camada), contida na faixa; `bands` + molduras → `bands-flow` com aviso.
- Render: classes da moldura, cor estável por id, sem molduras com `frames:false`, esboço para `draft`, marcadores
  da prévia no chip.
- Merge/prévia/doc: mudança de grupo vira conflito; `group` nos campos alterados da prévia; remapeamento do `group`
  numa duplicata `same`; seção "Agrupamentos" no documento.
- Regressão: visões dos exemplos sem grupos com o mesmo IR e o mesmo layout.
