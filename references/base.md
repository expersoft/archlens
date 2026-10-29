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
| `archlens-apply` | cria a base (`init`), grava o plano final (`apply`; no modo MCP, `--read-check`, `--receipts`, `--resume`, `--undo`), gera documento e diagramas salvos (`build`, `doc`), notas, `migrate`, `store convert`, `check` | sim (só ela) |
| `archlens-query` | visões e perguntas sobre a base (`views`, `query`, `deliver --view/--spec`, `resolve`, `render`) | nunca |

As três rodam `remote pull` (atualiza o espelho local de uma base gbrain no modo MCP) e `remote check` (confere a sessão
do MCP): eles não gravam a base, só o espelho e a sessão em `.archlens/`.

Pedido que muda a base sem plano final ("adicione Y", "X foi substituído", "guarde esta visão") vai sempre para a
skill archlens-plan; só depois do plano final a skill archlens-apply grava.

## CLI

Em cada skill, `SKILL_DIR` é a pasta dela; o repositório do archlens é `ARCHLENS="$(realpath "$SKILL_DIR/../..")"` (o `realpath` segue o link
simbólico de quem instala por `ln -s`: sem ele, o `..` sai pelo `~/.claude` para o Node e para a leitura de
arquivos). CLI: `node "$ARCHLENS/scripts/archlens.mjs" <comando>` (abaixo, `archlens <comando>`). Os caminhos
`references/*.md`, `docs/` e `examples/` são relativos a `$ARCHLENS`. Requer Node ≥ 18. A checagem visual
(`deliver`/`build`) usa `playwright-core` + Chromium (`npm install` e `npx playwright install chromium` em `$ARCHLENS`). Sem eles, a
checagem é pulada com aviso. `archlens help` lista os comandos em três blocos: Planejar, Aplicar e Consultar.

## Localizando a base

Procure `architecture/archlens.json` (a CLI também acha sozinha, subindo a partir do diretório atual).

- **Base no formato 1.x** (pasta com `"archlens"` diferente de `2.x`, ou só um `ARCHITECTURE.md` com bloco
  `archlens-json`): todo comando falha com `E_STORE_FORMAT` e nada é gravado. Proponha `archlens migrate <base>` (ou
  `archlens migrate ARCHITECTURE.md`), feito pela skill archlens-apply, e **pergunte antes**. Planos feitos antes da
  migração deixam de valer: gere-os de novo.
- **Sem base**: pergunte ao usuário o **tipo de repositório** e os parâmetros (tabela abaixo) e crie a base com
  `archlens init` (skill archlens-apply, a única que grava). Sem preferência do usuário, `json` é o padrão; só uma base
  `json` nasce no primeiro `apply` sem `init` (`name` e `description` do delta viram os da base); `markdown` e `gbrain`
  precisam do `init`.
  Se o repositório já tem um `ARCHITECTURE.md` que não foi gerado pelo archlens (sem `source:` no cabeçalho), **pergunte
  antes** ao usuário: movê-lo, ou usar o conteúdo dele como texto livre do primeiro delta. A CLI nunca o sobrescreve
  (`E_STORE_DOC_FOREIGN`).
- **Base gbrain no modo MCP** (`"store": { "kind": "gbrain", "mode": "mcp" }` no `archlens.json`): a base mora no gbrain
  e os comandos leem o espelho local. Antes de ler (`plan`, `show`, `query`, `views`, prévias), rode `archlens remote
  <base> pull` e siga os pedidos (seção *Base compartilhada no gbrain*); sem isso, `E_REMOTE_STALE`. Uma vez por sessão,
  confira o MCP com `archlens remote <base> check`.
- **Conectores**: a base pode usar o conector `json` (padrão, `model.json`), `markdown` (uma pasta por tipo, um `.md`
  por elemento) ou `gbrain` (seção abaixo), escolhido por `store.kind` no `archlens.json`. `archlens store convert <base>
  --to markdown|json` (skill archlens-apply) troca de conector mantendo a versão e os arquivos do usuário. Para abrir no
  Obsidian, abra a pasta da base como vault. Nunca edite as páginas à mão fora do texto
  depois do bloco do archlens (`archlens:end`): o resto é regravado. Esse texto é preservado por toda gravação markdown
  (se o elemento é removido, vai para `notes/removidos/<tipo>/<id>.md`, e o `apply` diz onde) e só se perde ao
  converter para `json`, que exige `--force` (sem ele, `E_STORE_CONVERT` e nada é gravado).

## Repositórios da base e `archlens init`

| Tipo (`--store`) | Onde a base mora | Parâmetros a perguntar |
|---|---|---|
| `json` (padrão) | `model.json` na pasta da base | nenhum (`--name` opcional) |
| `markdown` | a pasta é um vault (Obsidian): um `.md` por elemento | nenhum |
| `gbrain --mode git` | páginas num repositório git que o gbrain sincroniza; o CLI grava sozinho, um commit por apply | `--repo` (caminho de um clone que o usuário já tem), `--remote` (`origin`), `--branch` (`main`), `--prefix` (`archlens`) |
| `gbrain --mode mcp` | páginas no gbrain, gravadas pelo agente nas ferramentas do MCP; o CLI prepara e confere | `--server` (nome do MCP no Claude Code), `--source-id` (a fonte do gbrain), `--prefix` (`archlens`) |

```bash
archlens init architecture --store json|markdown [--name N]
archlens init architecture --store gbrain --mode git --repo ../gbrain-arquitetura [--remote origin] [--branch main] [--prefix archlens]
archlens init architecture --store gbrain --mode mcp --server gbrain-corp [--source-id arquitetura] [--prefix archlens]
```

- O `init` grava `<pasta>/archlens.json` (com `store`) e um `.gitignore` com `.archlens/`; pasta que já tem base dá
  `E_STORE_EXISTS` (para levar uma base local ao gbrain, use `store convert`). A pasta local guarda a configuração, o
  `ARCHITECTURE.md` gerado, `diagrams/` e, no modo MCP, o espelho: pode ir para o repositório do time, e quem clona já
  aponta para a mesma base.
- **Um caminho de gravação por base**: git ou MCP, escolhido no `init`. Misturar os dois na mesma fonte do gbrain gera
  `file_database_drift` no gbrain.
- **Uma fonte do gbrain por base.** O `prefix` deixa a base conviver com outras páginas, mas duas bases do archlens na
  mesma fonte com ids de elemento em comum travam o sync do gbrain (modo git) ou têm páginas recusadas como duplicata
  (modo MCP, `duplicate_of`). No modo MCP, o `sourceId` precisa ser a fonte em que a sessão do MCP grava (as ferramentas
  de tag agem na fonte da sessão).
- **Autenticação e ambiente ficam fora do archlens**: o `archlens.json` não guarda credenciais (`E_STORE_CONFIG`). No modo
  git, git instalado, credenciais e acesso ao remoto são do ambiente do usuário (o archlens não clona); no modo MCP, o
  usuário configura o MCP do gbrain no próprio Claude Code e informa o nome. O `init` só confere o que dá sem credenciais
  (no modo git, que `--repo` é um clone com o `--remote`).
- **Ids precisam ser slugs do gbrain**: minúsculas, dígitos, `.`, `_` e `-`, sem acentos (`E_STORE_GBRAIN_SLUG`). Nomes
  reservados do gbrain (`readme`, `index`, `schema`, `log`, `resolver`) e campos de elemento com nomes que o gbrain carimba
  no cabeçalho (`slug`, `trust_tier`, `source_kind`, `ingested_via`, `ingested_at`, `quarantine`, …) são recusados
  (`E_STORE_GBRAIN_RESERVED`).

## Base compartilhada no gbrain

A base no gbrain é para **times**: arquitetos planejam e aplicam em paralelo (cada plano guarda a versão de cada objeto
que altera ou em que se apoiou; applies que não se cruzam passam, veja `references/merge.md`), e stakeholders consultam
pelo plugin ou direto no gbrain. Layout das páginas e detalhes dos modos: `references/knowledge-doc.md`.

**Modo git.** O CLI faz tudo com o git do ambiente: lê a ponta remota, grava um commit por apply e faz o push (push
recusado: confere de novo e refaz, até 3 vezes). O clone do usuário (branch, índice, arquivos) nunca muda. Rode o sync
do gbrain depois do apply para indexar as páginas; ative o schema pack (`<prefix>/gbrain-pack.yaml`) com `gbrain schema
use`. Erros do git: `E_STORE_GIT`, com a saída dele.

**Modo MCP: o agente chama as ferramentas.** O CLI não fala com o MCP: ele grava um **pedido** (`.archlens/remote/<passo>-request.json`,
ou `--out`) com a lista exata de chamadas `{ tool, arguments }`. O agente faz as chamadas na ordem, sem decidir nada,
e grava o resultado bruto de cada uma em `{ "archlens-remote": "1.0", "request": "<id do pedido>", "results": [...] }`;
depois passa esse arquivo ao comando que a CLI indicar. Resposta que não corresponde ao pedido: `E_REMOTE_RESPONSE`.

| Passo | Comando | O agente |
|---|---|---|
| conferir a sessão (uma vez por sessão) | `archlens remote <base> check`, depois `check --ingest resposta.json` | `whoami` e `request_tools { surface: "full" }` |
| sincronizar o espelho | `archlens remote <base> pull`, depois `pull --ingest resposta.json` até a CLI dizer `espelho … em dia` | `list_pages` (tag `archlens`, com as removidas) e `get_page` das páginas novas ou mudadas |
| reler o que o plano leu | `archlens apply <base> p.json` | `get_page` de cada página do conjunto de leitura |
| gravar | `archlens apply <base> p.json --read-check resposta.json` | `put_pages` (até 50 páginas / 8 MB), `delete_page`, `restore_page`, o histórico por último |
| conferir | `archlens apply <base> --receipts resposta.json` (pode pedir um seguimento: as tags) | `remove_tag` / `add_tag` do seguimento, e de novo `--receipts` |
| recuperar | `archlens apply <base> --resume [id]` ou `--undo [id]` | as chamadas pedidas, e `--receipts` |

- Cada `pull` lista os metadados de todas as páginas do archlens e só busca o conteúdo das novas, restauradas ou com
  `updated_at` diferente; uma página apagada no gbrain some do espelho no `pull` seguinte.
- Gravar exige o conjunto completo de ferramentas do gbrain (`put_pages`, `delete_page`, `restore_page`); sem a sessão
  conferida com ele, `apply` e `store convert` recusam com `E_STORE_GBRAIN_SURFACE`: peça ao operador do servidor ou use o
  modo git. `pull`, `plan`, `show` e `query` funcionam com o conjunto básico.
- **Custo:** cada página lida ou gravada passa pelo contexto do agente. O `pull` só traz o que mudou, mas bases grandes
  ficam bem mais baratas no modo git.
- **Ligações tipadas:** o gbrain não lê as ligações tipadas do cabeçalho das páginas gravadas pelo MCP por HTTP (só os
  `[[wikilinks]]`, como `mentions`). Para a IA corporativa ver os tipos ArchiMate no grafo, o servidor precisa rodar
  `gbrain sweep` (ou use o modo git, cujo sync as lê).

**Edição direta no gbrain**: possível, para acrescentar descrições, mas não recomendada. Só o texto livre depois de
`<!-- archlens:end -->` de cada página é preservado; o resto é regravado pelo archlens. Toda página termina com a marca
`<!-- timeline -->` do gbrain (impede o gbrain de mover seções `## Timeline`/`## History`); não a apague. Uma linha
`<!-- timeline -->` literal, ou uma linha `---` seguida de `## Timeline`, dentro de uma descrição ou do texto livre é
normalizada pelo gbrain.

## Formato 2.0

A base guarda **só** tipos ArchiMate (sem prefixo), o perfil C4 em `c4.kind` (`person`, `softwareSystem`, `container`,
`component`, `deploymentNode`, `infrastructureNode`; cada kind vale para certos tipos, senão `E_C4_TYPE`), uma lista
plana com `parent` (sem `children`) e as 11 relações ArchiMate (sem `uses`). Banco de dados é `application-component`
com `c4.kind: container` e tag `database`; tópico é container com tag `topic`, como `application-component` ou
`application-event`. O vocabulário livre (`c4:*`, `uses`, `children`, `archimate:*`, o campo
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
- `references/knowledge-doc.md`: a pasta `architecture/`, o `ARCHITECTURE.md` gerado, conectores (`markdown`, `gbrain`), `check` e `migrate`
- `docs/GUIA.md`: guia do usuário (apresentação, atalhos, exemplos)
- `examples/`: `loja-online` (DSL completa, 16 visões) e `telemedicina` (texto livre + `delta-01.json`/`plano-01.json`,
  uma rodada de merge com duplicata, `deprecated`/`planned` e a visão to-be)
