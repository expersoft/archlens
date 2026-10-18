# Base compartilhada no gbrain: versão por objeto, configuração e conector gbrain (git e MCP)

- **Data:** 2026-10-18
- **Branch:** `feat/store-gbrain` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design conversado com o usuário e revisado por um leitor independente (dúvidas respondidas pelo usuário); aguardando a aprovação do spec escrito. Decisões marcadas *(decisão do agente)*
  podem ser revistas na leitura
- **Depende de:** [contrato de conector](2026-10-17-store-connectors-design.md) (e.2, PR #14) e
  [plan, apply e query](2026-10-18-plan-apply-query-design.md) (e.3, PR #15)
- **Roadmap:** item e.4, primeiro ciclo (e.4.1). Ordem combinada dos conectores remotos: **gbrain → neo4j → relacional → S3**,
  um ciclo por conector; este ciclo também entrega a base comum a todos

## Contexto e objetivo

O archlens vai apoiar **times de arquitetura de soluções e corporativa**. A base deixa de ser a pasta de uma pessoa e passa a
morar num repositório central, onde:

- **arquitetos**, em time, planejam e aplicam mudanças pelo archlens (`plan` → `apply`), muitas vezes em **domínios
  paralelos** da empresa (vendas, logística, RH) ao mesmo tempo;
- **stakeholders** consultam o as-is e o to-be: pelo próprio plugin (`query`, diagramas) ou **direto no repositório** (no
  gbrain, pela IA corporativa que lê as páginas).

Os repositórios remotos são **conectores adicionais**: na configuração inicial, o usuário escolhe entre os locais que já existem
(`model.json`, pasta de markdown) e os novos (gbrain neste ciclo; neo4j, relacional e S3 nos próximos).

O que impede isso hoje:

1. **A versão é da base inteira.** Entre o `plan` e o `apply`, qualquer mudança em qualquer lugar recusa o apply
   (`E_STORE_CONFLICT`). Com domínios evoluindo em paralelo, quase todo apply viraria "refaça o plano".
2. **Não há conector remoto**, nem configuração inicial que o escolha (`store.kind` só aceita `json` e `markdown`).
3. **Destinos sem transação** (o MCP do gbrain grava página a página) podem deixar um apply pela metade.

**Objetivo:** versão por objeto (o que o plano altera e o que suas decisões leram); `archlens init` para escolher e gravar o
repositório da base no `archlens.json`; e o conector `gbrain` em dois modos — **git** (o CLI grava num clone do repositório que
o gbrain sincroniza) e **MCP** (o agente chama as ferramentas do gbrain; o CLI prepara e confere) —, com a base inteira
(elementos, manifesto, visões, notas e histórico) em páginas legíveis pelo gbrain.

### Decisões

| Tema | Decisão | Origem |
|---|---|---|
| Público | times de arquitetura de soluções e corporativa; stakeholders consultam pelo plugin ou direto no repositório | usuário |
| Repositórios | conectores adicionais, escolhidos na configuração inicial | usuário |
| Concorrência | **opção C**: o plano guarda a versão de cada objeto que altera **e** de cada objeto em que suas decisões se apoiaram; applies que não se cruzam passam em paralelo; havendo cruzamento, o segundo é recusado e refeito com `--answers` | usuário (opções apresentadas pelo agente) |
| Reserva | conectores sem versão por objeto (o `model.json` num arquivo só) continuam com a versão da base inteira | usuário |
| Ordem | gbrain → neo4j → relacional → S3; base comum entra no primeiro ciclo | usuário (agrupamento: agente) |
| gbrain: caminhos | **git** (sync do gbrain a partir do repositório; principalmente atualizações) e **MCP** (atualizações e consultas) | usuário |
| Um caminho de gravação por base | escolhido no `init`; misturar git e MCP na mesma fonte gera `file_database_drift` no gbrain | agente (achado no código do gbrain) |
| Edição direta no gbrain | possível, para acrescentar descrições, mas não recomendada: só o texto livre depois de `<!-- archlens:end -->` é preservado | usuário |
| O que vai para o gbrain | elementos (uma página por elemento, sempre atualizada), manifesto, visões, notas e o histórico (`changelog`) como um nó consultável | usuário |
| Histórico concorrente | um nó único; acrescentar uma rodada nunca recusa o apply: em conflito de revisão, relê e acrescenta de novo | agente |
| Configuração | no `archlens.json`, como hoje; a primeira chamada do plugin (sem base) a popula com o repositório escolhido e os parâmetros | usuário |
| Autenticação e ambiente | **fora do escopo do archlens**: o usuário configura o MCP do gbrain (ou outro compatível com as mesmas ferramentas) no próprio Claude Code e informa o nome dele; no modo git, informa o repositório; git instalado, credenciais e acesso ao remoto são do ambiente dele | usuário |
| Modo MCP | o **agente** chama as ferramentas do gbrain (o CLI não tem as credenciais do MCP); o CLI prepara a lista exata de chamadas e confere os recibos | usuário (proposta do agente) |
| Testes | um gbrain local (a partir do código-fonte, `GBRAIN_HOME` isolado, PGLite, sem embeddings) e um repositório git local novo, só para os testes | usuário |
| Leitura no modo MCP | antes de gravar, o agente relê as páginas do conjunto de leitura e o CLI confere as revisões; a janela de segundos até a gravação fica documentada (no modo git a proteção é completa) | usuário (recomendação do agente) |
| Ferramentas do MCP | gravar pelo MCP exige o conjunto completo de ferramentas do gbrain (`put_pages`, `delete_page`, `restore_page`); consultar funciona com o básico | usuário (recomendação do agente) |
| Duplicata criada em paralelo | no apply, a busca de duplicatas é refeita para os elementos que o plano cria, contra a base atual; candidato novo → conflito | usuário (recomendação do agente) |
| Id da rodada no histórico | atribuído na hora de gravar (o do plano é provisório) | agente |
| Obsidian | não é um conector à parte: é o conector `markdown`; compartilhar o vault (Obsidian Sync headless, git, MCP) é do ambiente | agente (o usuário não se opôs) |

### O que o gbrain oferece (lido no código, commit `ac1ba4c`, versão 0.60.304, 2026-10-18)

- **Página = arquivo markdown**; o slug é o caminho (`application-component/loja.pedidos`). A identidade sobrevive a renomear ou
  mover a página pelo `id` do frontmatter (que o conector `markdown` já grava).
- **MCP, gravação:** `put_page` (página inteira), `put_pages` (até 50 páginas / 8 MB por chamada), `edit_page`, `delete_page`
  (soft-delete, restaurável por 72 h), `restore_page`. Todas aceitam **`expected_revision`** (recusa com `revision_conflict` e
  devolve `current_revision`) e um **`request_id`** idempotente com recibo durável (`get_write_request`,
  `list_write_requests`). Omitir `expected_revision` é "só criar".
- **`put_pages` não é atômico:** as páginas entram juntas na fila, mas cada uma passa pela própria checagem; o lote pode terminar
  `partial`.
- **MCP remoto (HTTP) ignora ligações tipadas do frontmatter** (`frontmatter_links` do schema pack): só os `[[wikilinks]]` do
  corpo viram ligações, do tipo `mentions`, até alguém rodar `gbrain sweep` no servidor. Pelo git, o sync lê as ligações
  tipadas normalmente.
- **MCP, leitura:** `get_page` (com `include_content` e `revision`), `list_pages` (filtro por tipo, cursor por `updated_after`,
  até 100 linhas por chamada), `get_backlinks`, `traverse_graph` (profundidade, tipo de ligação, direção), `resolve_slugs`.
- **Sync:** só arquivos `.md` (sem `README.md`, `index.md`, `schema.md`, `log.md`, `RESOLVER.md` e pastas ocultas).

### Critérios de sucesso

1. **Paralelo sem cruzamento:** contra o mesmo gbrain (modo git), dois planos de domínios que não se tocam, feitos sobre a mesma
   versão, são aplicados um depois do outro e os dois passam, sem refazer plano.
2. **Cruzamento recusado:** se o segundo plano altera um objeto que o primeiro alterou, ou se apoia num objeto que o primeiro
   alterou (por exemplo, uma duplicata `same` casada com um elemento que o primeiro renomeou ou removeu, ou uma relação nova
   para um elemento que o primeiro removeu), o segundo apply é recusado (`E_STORE_CONFLICT`), nada é gravado, e a mensagem
   lista os objetos em conflito e o `plan --answers` para refazer.
3. **Modo git atômico:** um apply é um commit; uma falha antes do push não deixa nada no remoto.
4. **Modo MCP recuperável:** um lote interrompido (`partial`) é completado por `archlens apply --resume` ou desfeito por
   `archlens apply --undo`, a partir do registro local do apply.
5. **Ida e volta:** `store convert` de uma base local para o gbrain (modo git) e de volta devolve a mesma base (`canonicalJson`),
   e os três exemplos passam por isso.
6. **Legível sem o archlens:** depois do sync do gbrain (modo git), `traverse_graph` a partir de um container devolve os
   vizinhos com os tipos de relação ArchiMate, e as páginas de manifesto, visões, notas e histórico aparecem em `list_pages`.
7. **Locais intactos:** `json` continua com a versão da base inteira; `markdown` local ganha versão por objeto (por arquivo); os
   testes atuais continuam passando.

### Fora do escopo

neo4j, relacional e S3 (próximos ciclos); autenticação, instalação ou hospedagem do gbrain; edição pela interface do gbrain como
caminho suportado; trava entre processos; colaboração em tempo real; otimização de leitura no modo MCP além do incremental
(seção 5); o `ARCHITECTURE.md` e os diagramas salvos **dentro** do gbrain (eles continuam locais, ao lado do `archlens.json`,
*decisão do agente*).

## 1. Versão por objeto (base comum)

### Objetos e versões

Um **objeto** é um elemento (por `id`), uma relação (por `id`), uma visão (por `key`), uma nota (por nome) ou o manifesto. O
histórico **não** é objeto de conflito (seção 1.4).

Cada conector declara `versioning: 'object' | 'base'` e passa a implementar:

```js
objectVersions(refs) → Map<ref, string | null>   // ref = "element:loja.pedidos", "relationship:<id>", "view:<key>", "note:<nome>", "manifest"
```

`null` = o objeto não existe. Conectores `base` devolvem a versão da base inteira para qualquer ref.

| Conector | `versioning` | Versão de um objeto |
|---|---|---|
| `json` | `base` | `contentVersion` da base (como hoje) |
| `markdown` (local) | `object` | hash do conteúdo canônico do objeto (`canonicalJson` do elemento com as relações que saem dele, que vivem na página dele) |
| `gbrain` modo git | `object` | o mesmo hash, calculado sobre o arquivo na ponta remota depois do `fetch` |
| `gbrain` modo MCP | `object` | a `revision` da página no gbrain |

Relação: no `markdown` e no `gbrain`, as relações moram na página do elemento de origem, então a versão de uma relação é a da
página de origem *(decisão do agente: a granularidade física é a página)*.

### O que o plano guarda

O plano final ganha `objects`: `{ "<ref>": "<versão lida>" | null }`, com:

- **conjunto de escrita:** todo objeto que as `ops` criam, alteram ou removem;
- **conjunto de leitura:** todo objeto em que uma decisão do merge se apoiou:
  - o elemento casado por id, alias ou duplicata (`same` e `different`: as duas respostas dependem do candidato como ele estava);
  - o pai de cada elemento novo ou movido; o `group` de cada membro;
  - as duas pontas de cada relação nova ou alterada;
  - o elemento alvo de cada `op` (`rename`, `alias`, `status`, `remove`) e tudo que a cascata de uma remoção alcança;
  - as visões cujas referências o merge reescreveu.

`merge.mjs` passa a registrar no contexto do merge (`ctx.read`) cada objeto da base consultado nessas decisões; o plano final
grava `objects` a partir de `ctx.read` ∪ alvos das `ops`. `storeVersion` continua no plano (para conectores `base` e para
mensagens).

### O que o apply confere

`store.apply(ops, { expect })`, com `expect = plan.objects` (conectores `object`) ou `{ base: plan.storeVersion }` (conectores
`base`):

- relê as versões de todos os refs de `expect`; se alguma difere, `E_STORE_CONFLICT` com a lista `conflicts: [{ ref, planned,
  current }]`, nada gravado;
- a mensagem do CLI lista os objetos (com nome) e o `archlens plan <base> --answers <plano> --out <novo>`;
- o `apply` mecânico da api (e.3) continua: valida o resultado de `applyOps` sobre a base lida (completa, nos modos locais e git;
  sobre o espelho, no modo MCP) e só então grava.

Planos antigos (só `storeVersion`) continuam aceitos nos conectores `object` com a regra antiga (versão da base inteira).

### Duplicata criada em paralelo

O conjunto de leitura só cobre o que existe: se A e B criam ao mesmo tempo o mesmo conceito com ids diferentes, nenhum vê o do
outro. Por isso, o apply refaz a busca de possíveis duplicatas (`findCandidates`, a mesma do `plan`) **só para os elementos que o
plano cria**, contra a base lida na hora de gravar. Um candidato que não estava na base do plano é conflito: `E_STORE_CONFLICT`
com `conflicts: [{ ref: "element:<novo>", reason: "possible-duplicate", candidate: "<id criado em paralelo>" }]` e a mesma
orientação de refazer com `--answers` (o plano novo traz a pergunta de duplicata). Vale para todos os conectores.

### Histórico

`appendHistory` nunca gera conflito: o conector acrescenta a rodada ao histórico que está **na hora de gravar**, e o
número da rodada (`<data>-<seq>`) é atribuído nesse momento, contando as rodadas do dia que já estão lá. O `entry.id` do plano é
provisório; o registro local do apply (modo MCP) e a saída do `apply` mostram o id definitivo. Nos conectores
com revisão (gbrain MCP), um `revision_conflict` na página de histórico é tratado relendo a página, acrescentando a rodada e
gravando de novo (até 5 tentativas; depois, `E_STORE_HISTORY_RETRY` com o restante do apply já gravado e a rodada guardada no
registro local para `apply --resume`).

## 2. Configuração inicial: `archlens init`

```bash
archlens init <pasta> --store json|markdown                                   # como hoje (a pasta é a base)
archlens init <pasta> --store gbrain --mode git --repo <caminho do clone> [--remote origin] [--branch main] [--prefix archlens]
archlens init <pasta> --store gbrain --mode mcp --server <nome do MCP no Claude Code> [--source-id <fonte>] [--prefix archlens]
```

- Grava `<pasta>/archlens.json` com `"archlens": "2.0"`, `name` e `store`:

```json
{ "archlens": "2.0", "name": "Arquitetura Corporativa",
  "store": { "kind": "gbrain", "mode": "git", "repo": "../gbrain-arquitetura", "remote": "origin", "branch": "main", "prefix": "archlens" } }
```

```json
{ "archlens": "2.0", "name": "Arquitetura Corporativa",
  "store": { "kind": "gbrain", "mode": "mcp", "server": "gbrain-corp", "sourceId": "arquitetura", "prefix": "archlens" } }
```

- `archlens.json` não guarda credenciais. `repo` é o caminho de um clone que o usuário já tem (o archlens não clona nem
  configura credenciais); `server` é só o nome do MCP configurado no Claude Code.
- `prefix`: pasta do gbrain onde ficam as páginas do archlens (padrão `archlens`), para a base conviver com outras páginas do
  mesmo gbrain.
- `<pasta>` local (por exemplo, `architecture/`) guarda o `archlens.json`, o `ARCHITECTURE.md` gerado, `diagrams/` e o espelho
  do modo MCP (`.archlens/`, ignorado pelo git). Ela pode ir para um repositório do time, para que um arquiteto novo só clone e
  já aponte para a mesma base.
- Pasta que já tem base: `E_STORE_EXISTS`. Base local existente que deve ir para o gbrain: `store convert` (seção 6).
- `init` confere o que dá para conferir sem credenciais: no modo git, que `repo` é um clone git com o `remote` e a `branch`
  informados; no modo MCP, nada (o agente confere chamando `whoami` — ver a skill).
- **Skills:** `references/base.md` passa a dizer: sem base, pergunte ao usuário o tipo de repositório e os parâmetros, e rode
  `archlens init` (comando da skill **archlens-apply**, a única que grava). A skill archlens-plan, ao criar uma base nova, encaminha
  para isso.

## 3. Layout da base no gbrain

Mesmo formato de página do conector `markdown` (e.2), sob `<prefix>/`:

```
<prefix>/<tipo-archimate>/<id>.md     ← um elemento por página, com as relações que saem dele
<prefix>/manifest.md                  ← manifesto (o archlens.json do repositório, como JSON num bloco)
<prefix>/views/<key>.md               ← uma visão por página
<prefix>/notes/<nome>.md              ← overview, notes, assumptions
<prefix>/changelog.md                 ← histórico: uma seção por rodada, mais recente no fim
```

- **Manifesto, visões e histórico** são páginas markdown com o conteúdo em JSON num bloco ```archlens-json e um resumo legível
  no corpo (título, descrição; para visões, a lista do que a visão mostra; para o histórico, uma linha por rodada com data,
  resumo e os elementos citados como `[[wikilinks]]`), para a IA corporativa entender sem o archlens. O bloco é a fonte; o resumo
  é regenerado.
- **Elementos:** idênticos às páginas do conector `markdown`, com wikilinks prefixados (`[[archlens/application-component/
  loja.pedidos|API de Pedidos]]`). Texto livre depois de `<!-- archlens:end -->` é preservado (inclusive quando alguém o escreve
  direto no gbrain).
- **Tag comum:** toda página do layout leva também a tag `archlens` (além das `archlens/<tipo>` do e.2), porque o `list_pages`
  do gbrain filtra por tag e não por prefixo; é ela que o `pull` do modo MCP usa.
- **Schema pack:** o `gbrain-pack.yaml` do e.2, com `path_prefixes` prefixados e os tipos de página novos (`archlens-manifest`,
  `archlens-view`, `archlens-note`, `archlens-changelog`). No modo git ele é gravado no repositório; ativá-lo no gbrain
  (`gbrain schema use`) é do ambiente (documentado).
- **Nomes reservados do gbrain** (`README.md`, `index.md`, `schema.md`, `log.md`, `RESOLVER.md`): nenhum arquivo do layout usa;
  um elemento cujo id colida recebe `E_STORE_GBRAIN_RESERVED` no `apply`.

## 4. Conector `gbrain`, modo git

O CLI faz tudo sozinho, com o git do ambiente:

- **read:** `git fetch <remote> <branch>`; lê as páginas de `<prefix>/` na ponta remota (sem mexer no diretório de trabalho do
  usuário: `git show`/`git ls-tree` sobre `FETCH_HEAD`) e monta a base pelo leitor do conector `markdown`.
- **objectVersions:** hash do conteúdo canônico de cada objeto na ponta remota.
- **apply:**
  1. `fetch`; confere `expect` contra a ponta remota (conflito → `E_STORE_CONFLICT`, nada gravado);
  2. monta os arquivos novos sobre a ponta remota numa árvore temporária (`git worktree add` numa pasta temporária, ou índice
     alternativo; escolha do builder), com o mesmo gerador de páginas do `markdown` (mesmos bytes);
  3. um commit com a mensagem `docs(arquitetura): <resumo da rodada>` e `push <remote> HEAD:<branch>`;
  4. push recusado (alguém gravou antes): volta ao passo 1 até 3 vezes; só recusa se a conferência do passo 1 achar conflito.
  Falha antes do push: nada no remoto; a árvore temporária é apagada.
- O diretório de trabalho e a branch atual do clone do usuário nunca são alterados *(decisão do agente)*.
- **history:** lê `<prefix>/changelog.md`.
- Erros do git (sem remoto, sem permissão, sem rede): `E_STORE_GIT` com a saída do git.

## 5. Conector `gbrain`, modo MCP (o agente chama as ferramentas)

O CLI não fala com o MCP. Ele mantém um **espelho local** da base em `<pasta>/.archlens/mirror/` (layout da seção 3 + um
`revisions.json` com `slug → revision`) e troca arquivos de pedido e resposta com o agente:

| Passo | CLI | Agente |
|---|---|---|
| sincronizar | `archlens remote <base> pull` grava `pull-request.json`: as chamadas `list_pages` (o `list_pages` não filtra por prefixo: filtra por `tag` — toda página do archlens leva a tag `archlens` — com o cursor `updated_after` + `updated_after_slug` desde a última sincronização e `include_deleted: true`, para ver remoções) | executa, grava cada resposta em `pull-response-N.json` |
| | `archlens remote <base> pull --ingest pull-response-*.json` grava `get-request.json`: as páginas novas ou com revisão diferente | `get_page` com `include_content: true` de cada uma, grava as respostas |
| | `archlens remote <base> pull --ingest get-response-*.json` atualiza o espelho e o `revisions.json` | — |
| planejar | `plan`, `show`, `query` e prévias leem o **espelho** (o plano guarda as `revision` como versões) | — |
| reler o lido | `archlens apply <base> plano.json` (base MCP) grava primeiro `read-check-request.json`: `get_page` de cada página do conjunto de leitura que não está no de escrita | executa, grava as respostas |
| aplicar | `archlens apply <base> plano.json --read-check read-check-response.json` confere as revisões relidas e o plano contra o espelho (revisão diferente → `E_STORE_CONFLICT`, nada pedido para gravar), valida e grava `apply-request.json`: lotes `put_pages` (≤ 50 páginas / 8 MB) e `delete_page`, cada página com `expected_revision` do plano, um `request_id` por lote, e o histórico por último; abre o **registro do apply** em `.archlens/applies/<id>.json` (conteúdo anterior de cada página, para desfazer) | executa os lotes em ordem e grava os recibos em `apply-response.json` |
| conferir | `archlens apply <base> --receipts apply-response.json` confere cada página: `committed`, `revision_conflict` ou pendente; atualiza o espelho | — |
| recuperar | `apply --resume` gera os pedidos que faltam (mesmos `request_id`s para o que ficou pendente; novos para o que não foi enviado); `apply --undo` gera as chamadas que devolvem o conteúdo anterior das páginas já gravadas (com `expected_revision` = a revisão que o apply gravou) | executa |

- `revision_conflict` numa página do conjunto de escrita depois de o lote começar (alguém gravou no meio): o apply fica
  `partial`; o CLI informa as páginas gravadas e as em conflito e oferece `--undo` (o resto do plano não é forçado).
- **Janela residual:** entre a releitura do conjunto de leitura e o `put_pages` passam segundos; uma mudança nesse intervalo numa
  página só lida não é detectada. Fica documentada em `references/merge.md`; o modo git não tem essa janela.
- **Ferramentas exigidas:** gravar pelo MCP exige o conjunto completo de ferramentas do gbrain (`put_pages`, `delete_page`,
  `restore_page`, que não estão no conjunto básico; o cliente pede com `request_tools { surface: "full" }`, até o teto que o
  operador do servidor permite). A skill confere no início da sessão (`whoami` + `request_tools`); sem o conjunto completo, o
  `apply` e o `store convert` para o gbrain são recusados com `E_STORE_GBRAIN_SURFACE`, sugerindo o modo git. `pull`, `plan`,
  `show` e `query` funcionam com o conjunto básico (`list_pages`, `get_page`, `traverse_graph`).
- O `archlens.json` do espelho é o `<prefix>/manifest.md` do gbrain; a `<pasta>` local guarda só a configuração.
- **Custo:** cada página lida ou gravada passa pelo contexto do agente. A sincronização é incremental (`updated_after`), e a
  skill avisa que bases grandes são mais baratas no modo git. Ler só o subgrafo de um delta fica para depois *(decisão do agente)*.
- **Ligações tipadas:** como o MCP remoto ignora as do frontmatter, `references/base.md` documenta que o servidor precisa rodar
  `gbrain sweep` (ou usar o modo git) para a IA corporativa ver os tipos ArchiMate no grafo.
- O formato exato dos arquivos de pedido e resposta é do builder, desde que: cada pedido seja uma lista de chamadas
  `{ tool, arguments }` que o agente executa sem decidir nada; cada resposta guarde o resultado bruto da ferramenta; e o CLI
  recuse resposta que não corresponda ao pedido (`E_REMOTE_RESPONSE`).
- **Skills:** archlens-plan e archlens-query rodam o `pull` antes de ler uma base MCP; archlens-apply conduz `apply` →
  `--receipts` → (`--resume` | `--undo`). As três conferem uma vez por sessão, com `whoami` do MCP configurado, que o servidor
  responde.

## 6. `store convert` para o gbrain

- `archlens store convert <base local> --to gbrain --mode git --repo <clone> [...]`: grava a base inteira no layout da seção 3 num
  commit (mesmo protocolo do apply, `expect` = "nenhuma página do archlens existe em `<prefix>/`"), e troca o `archlens.json`
  local pelo de configuração. A pasta local mantém `notes/`, `diagrams/` e arquivos desconhecidos.
- `--to gbrain --mode mcp`: gera o `apply-request.json` de criação (todas as páginas, `expected_revision` omitido = só criar),
  seguido de `--receipts`.
- `--to json|markdown` a partir do gbrain: lê (git: direto; MCP: espelho) e grava a base local.
- Ida e volta devolve a mesma base (`canonicalJson`); `E_STORE_CONVERT` se não.

## 7. Testes

- **Unidade (no `npm test`):**
  - `ctx.read` do merge: para cada cenário de decisão (casamento por id, alias, duplicata `same`/`different`, pai novo e movido,
    pontas de relação, `rename`/`alias`/`status`/`remove` com cascata, visões reescritas), o conjunto de leitura esperado;
  - conferência de `expect`: conflito de escrita, conflito de leitura, sem conflito; mensagem com nomes e `--answers`;
  - duplicata criada em paralelo: dois planos que criam o mesmo conceito com ids diferentes; o segundo apply é recusado com
    `reason: "possible-duplicate"`;
  - id da rodada: dois applies no mesmo dia gravam `-01` e `-02`;
  - histórico mesclado: dois applies em sequência sobre a mesma versão acrescentam as duas rodadas;
  - `markdown` local com `versioning: 'object'`: os dois applies paralelos do critério 1 e os dois conflitos do critério 2;
  - layout gbrain (seção 3): snapshot de manifesto, visão, nota, histórico e um elemento com prefixo; nomes reservados;
  - modo MCP com um **gbrain falso em memória** (implementa `list_pages`, `get_page`, `put_pages`, `delete_page` com
    `revision`, `expected_revision`, `request_id`, lote `partial` simulado e conjunto básico × completo): `pull`, releitura do
    conjunto de leitura (conflito detectado), `apply`, `--receipts`, `--resume`, `--undo`, `E_REMOTE_RESPONSE`,
    `E_STORE_GBRAIN_SURFACE`.
- **Integração (fora do `npm test` padrão; `npm run test:gbrain`, ligado por `GBRAIN_TEST=1`):**
  - `scripts/test-env/gbrain-up.sh` (ou `.mjs`): clona o gbrain numa pasta temporária, `bun install`, `GBRAIN_HOME` isolado,
    `gbrain init --pglite --no-embedding`, um repositório git bare local como remoto e um clone dele registrado como fonte do
    gbrain; `gbrain-down` apaga tudo. Nada global (`bun install -g` nunca; `~/.gbrain` nunca tocado);
  - critérios 1, 2, 3, 5 e 6 contra esse ambiente (modo git, `gbrain sync` entre os passos);
  - modo MCP: o papel do agente é feito pelo próprio teste, chamando as operações do gbrain pelo CLI dele (`gbrain` expõe as
    operações do MCP como comandos), com os mesmos pedidos e respostas que o agente usaria; critério 4 com um lote interrompido.
- Versão do gbrain usada nos testes registrada no spec do plano e no `references/` (o MCP do gbrain muda rápido).

## 8. Documentação

- `references/base.md`: configuração (`init`), repositórios suportados, um caminho de gravação por base, autenticação e ambiente
  fora do archlens, custo do modo MCP, `gbrain sweep`, edição direta só no texto livre.
- `references/knowledge-doc.md`: seção "Conector gbrain" (layout, modos, versões, registro do apply).
- `references/merge.md`: versão por objeto, conjunto de leitura, conflitos e como refazer.
- Skills: os passos de `pull` (MCP), `apply --receipts`/`--resume`/`--undo`, `init` na falta de base.
- `README.md`, `docs/GUIA.md`, `CHANGELOG.md` (`[Não lançado]`), roadmap: e.4 dividido em e.4.1 (este, com a base comum),
  e.4.2 neo4j, e.4.3 relacional, e.4.4 S3.

## 9. O que fica para o builder

- Como `merge.mjs` registra o conjunto de leitura sem espalhar chamadas pelo código (um ponto de acesso à base no contexto do
  merge é o caminho esperado).
- A árvore temporária do modo git (`git worktree` ou índice alternativo).
- O formato exato dos arquivos de pedido e resposta do modo MCP (restrições na seção 5).
- O texto do resumo legível das páginas de manifesto, visões e histórico.
- A forma do gbrain falso dos testes de unidade.
