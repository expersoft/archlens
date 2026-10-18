# A base de conhecimento (o que as três skills precisam)

Arquitetura como **modelo**, diagramas como **consultas**. O modelo (metamodelo ArchiMate, com perfil C4
por cima) mora na pasta `architecture/`, a base de conhecimento (manifesto, `model.json`, `views.json`,
`changelog.json`, `notes/`). O `ARCHITECTURE.md` é o documento legível gerado a partir dela: nunca o edite.
A base **evolui por rodadas**: cada informação nova (prompt, texto, documento, repositório) vira um
**delta**, que passa por `plan` → perguntas ao usuário → `plan --answers` → `apply`, com proveniência,
ciclo de vida e histórico. Cada diagrama é uma *view spec* resolvida sobre a base e renderizada em HTML
animado, autocontido e pronto para apresentação.

**Princípio:** nunca desenhe um diagrama "à mão". Modele uma vez e peça visões. Se falta algo na
visão, falta no modelo: corrija o modelo (pela skill archlens-plan).

## As três skills

| Skill | Faz | Grava a base? |
|---|---|---|
| `archlens-plan` | informação nova → delta → plano final (`scan`, `plan`, `plan --answers`, `show`, prévia `deliver --delta/--plan`) | nunca |
| `archlens-apply` | grava o plano final (`apply`), gera documento e diagramas salvos (`build`, `doc`), notas, `migrate`, `store convert`, `check` | sim (só ela) |
| `archlens-query` | visões e perguntas sobre a base (`views`, `query`, `deliver --view/--spec`, `resolve`, `render`) | nunca |

Pedido que muda a base sem plano final ("adicione Y", "X foi substituído", "guarde esta visão") vai sempre para a
skill archlens-plan; só depois do plano final a skill archlens-apply grava.

## CLI

Em cada skill, `SKILL_DIR` é a pasta dela; o repositório do archlens é `$SKILL_DIR/../..`. CLI:
`node $SKILL_DIR/../../scripts/archlens.mjs <comando>` (abaixo, `archlens <comando>`). Os caminhos `references/*.md`,
`docs/` e `examples/` são relativos a `$SKILL_DIR/../..`. Requer Node ≥ 18. A checagem visual (`deliver`/`build`) usa
`playwright-core` + Chromium (`npm install` e `npx playwright install chromium` em `$SKILL_DIR/../..`). Sem eles, a
checagem é pulada com aviso. `archlens help` lista os comandos em três blocos: Planejar, Aplicar e Consultar.

## Localizando a base

Procure `architecture/archlens.json` (a CLI também acha sozinha, subindo a partir do diretório atual).

- **Base no formato 1.x** (pasta com `"archlens"` diferente de `2.x`, ou só um `ARCHITECTURE.md` com bloco
  `archlens-json`): todo comando falha com `E_STORE_FORMAT` e nada é gravado. Proponha `archlens migrate <base>` (ou
  `archlens migrate ARCHITECTURE.md`), feito pela skill archlens-apply, e **pergunte antes**. Planos feitos antes da
  migração deixam de valer: gere-os de novo.
- **Sem base**: o primeiro delta a cria (no `apply`; `name` e `description` do delta viram os da base). Mas, se o
  repositório já tem um `ARCHITECTURE.md` que não foi gerado pelo archlens (sem `source:` no cabeçalho), **pergunte
  antes** ao usuário: movê-lo, ou usar o conteúdo dele como texto livre do primeiro delta. A CLI nunca o sobrescreve
  (`E_STORE_DOC_FOREIGN`).
- **Conectores**: a base pode usar o conector `json` (padrão, `model.json`) ou `markdown` (`store.kind` no
  `archlens.json`: uma pasta por tipo, um `.md` por elemento). `archlens store convert <base> --to markdown|json`
  (skill archlens-apply) troca de conector mantendo a versão e os arquivos do usuário. Para abrir no Obsidian, abra a
  pasta da base como vault; para o gbrain, use o `gbrain-pack.yaml` dela. Nunca edite as páginas à mão fora do texto
  depois do bloco do archlens (`archlens:end`): o resto é regravado. Esse texto é preservado por toda gravação markdown
  (se o elemento é removido, vai para `notes/removidos/<tipo>/<id>.md`, e o `apply` diz onde) e só se perde ao
  converter para `json`, que exige `--force` (sem ele, `E_STORE_CONVERT` e nada é gravado).

## Formato 2.0

A base guarda **só** tipos ArchiMate (sem prefixo), o perfil C4 em `c4.kind` (`person`, `softwareSystem`, `container`,
`component`, `deploymentNode`, `infrastructureNode`; cada kind vale para certos tipos, senão `E_C4_TYPE`), uma lista
plana com `parent` (sem `children`) e as 11 relações ArchiMate (sem `uses`). Banco de dados é `application-component`
com `c4.kind: container` e tag `database`. O vocabulário livre (`c4:*`, `uses`, `children`, `archimate:*`, o campo
`archimate`) continua aceito **na entrada** (deltas, prompts, `scan`) e é traduzido antes de qualquer coisa ser
gravada; por isso você pode escrever o delta como sempre (`references/merge.md`, `references/notation.md`).

## Propriedades

`properties` guarda o que o usuário quer anotar (squad, unidade de negócio, canais): valores texto, número, booleano
ou **lista de textos**. Um catálogo opcional em `properties` do `archlens.json` (`label`, `type`, `values`,
`appliesTo`) faz o `validate` avisar `W_PROPERTY` (chave desconhecida, tipo errado, valor fora da lista).
Regra: **propriedade serve para filtrar, elemento serve para atravessar.** Se o usuário pedir uma visão que
atravesse por um valor ("tudo da squad Checkout"), sugira promovê-lo a `business-actor` + `assignment` em vez de
manter a propriedade (a promoção é um delta: skill archlens-plan).

## Erros comuns (todas as skills)

- **Editar o `ARCHITECTURE.md`**: é gerado e será sobrescrito. Texto autoral vai em `architecture/notes/*.md`; o
  modelo muda por delta. Recomende `archlens check` no CI ou no pre-commit.
- **Ids instáveis**: ids são a chave da base de conhecimento. Não os renomeie sem necessidade; use
  `sistema.container.componente`.
- **Base no formato antigo (1.x)**: todos os comandos recusam com `E_STORE_FORMAT`. Rode `archlens migrate <base>`
  (skill archlens-apply, com o ok do usuário). Planos feitos antes da migração deixam de valer: gere-os de novo.
- **Gravar fora do fluxo**: só a skill archlens-apply grava, e só um plano final. Prévias e consultas nunca gravam;
  escreva o HTML e o markdown delas fora da pasta da base.

## Referências

- `references/merge.md`: delta, plano aberto e final, classes, respostas, `show`, erros, proveniência, ciclo de vida e
  histórico
- `references/notation.md`: DSL JSON completa (elementos, relações, campos, exemplos)
- `references/views.md`: view specs, travessia, derivação, granularidade, layout, animação, consulta em markdown
- `references/archimate.md`: catálogo ArchiMate 3.2, regras de relacionamento, direção de suporte
- `references/c4.md`: níveis C4, mapeamento para ArchiMate, elevação de relações
- `references/free-text.md`: como extrair o modelo de texto livre
- `references/repo-reading.md`: `archlens scan`, leitura de repositórios, mapeamento, nova leitura e limites
- `references/knowledge-doc.md`: a pasta `architecture/`, o `ARCHITECTURE.md` gerado, `check` e `migrate`
- `docs/GUIA.md`: guia do usuário (apresentação, atalhos, exemplos)
- `examples/`: `loja-online` (DSL completa, 16 visões) e `telemedicina` (texto livre + `delta-01.json`/`plano-01.json`,
  uma rodada de merge com duplicata, `deprecated`/`planned` e a visão to-be)
