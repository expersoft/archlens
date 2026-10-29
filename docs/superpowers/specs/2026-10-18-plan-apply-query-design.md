# Três skills sobre uma biblioteca comum: plan, apply e query

- **Data:** 2026-10-18
- **Branch:** `feat/plan-apply-query` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** escrito sem a rodada inicial de perguntas (o usuário pediu para seguir direto ao planejamento); revisado
  com o usuário em conversa (terminologia do Terraform, prévia em HTML no plan, diagramas no apply). Decisões marcadas
  *(decisão do agente)* podem ser revistas na leitura
- **Depende de:** [formato canônico 2.0](2026-10-17-canonical-format-design.md) (e.1, PR #13) e
  [contrato de conector](2026-10-17-store-connectors-design.md) (e.2, PR #14)
- **Roadmap:** item e.3 de [`docs/superpowers/roadmap.md`](../roadmap.md)

## Contexto e objetivo

Hoje o archlens é **uma** skill (`SKILL.md` na raiz, 200 linhas) que cobre tudo: localizar a base, traduzir informação
nova em delta, planejar, perguntar, aplicar, gerar visões e documentação. Ela mistura três trabalhos com gatilhos e
riscos diferentes:

1. **Planejar**: "o repositório X / este texto / este documento traz o quê de novo em relação à base?". Lê a base,
   nunca grava.
2. **Aplicar**: gravar uma mudança já revisada. É o único passo que altera a fonte da verdade.
3. **Consultar**: "o que sustenta o produto P", "contexto do sistema X", "o que depende de A". Lê a base, nunca grava.

A decomposição registrada no e.1 decidiu a fronteira: a primeira etapa entrega uma mudança **resolvida contra o
canônico** (ids casados, perguntas respondidas, versão do store em que se baseou) e é ela que é revisada; a segunda só a
aplica, de forma **mecânica e atômica**, e recusa se o store mudou desde então.

É o modelo do Terraform: `terraform plan -out` grava um plano com a versão do estado; `terraform apply plano` só executa e
recusa um plano velho ("Saved plan is stale"); `terraform show plano` o mostra legível. A diferença é que o plano do
archlens tem **perguntas** (duplicatas, conflitos, remoções), então ele tem dois estados: **aberto** (com perguntas sem
resposta) e **final** (todas respondidas, com as operações do store prontas).

O que falta para isso existir:

- **O plano não carrega a mudança.** O `merge --apply` reexecuta o merge inteiro a partir de `plan.delta` + respostas
  (`applyPlan` em `scripts/lib/merge.mjs`). Um conector remoto (e.4) teria de ler a base inteira e rodar o casamento de
  entidades para aplicar. O contrato do e.2 já tem o que falta: `diffRaw` gera operações e `apply(ops, { baseVersion })`
  as grava atomicamente.
- **A lógica mora no CLI.** `scripts/archlens.mjs` (592 linhas) faz leitura, versão, merge, gravação e documento dentro
  dos `case`. As três skills (e, depois, um servidor MCP ou os conectores do e.4) precisam das mesmas funções.
- **Consulta só sai em HTML.** Não há resposta em markdown, e o `readSubgraph` do e.2 não é usado por ninguém.
- **Não há relatório legível de um plano** além do resumo no terminal e da prévia em HTML.

**Objetivo:** uma biblioteca comum (`scripts/lib/api.mjs`); o plano com estado `open`/`final`, em que o final carrega as
operações do store; os comandos `plan`, `apply`, `show` e `query`; e três skills (`archlens-plan`, `archlens-apply`,
`archlens-query`) que substituem o `SKILL.md` único.

### Decisões

| Tema | Decisão | Origem |
|---|---|---|
| Fronteira das skills | a primeira entrega a mudança resolvida; a segunda só aplica | usuário (e.1) |
| Terminologia | a do Terraform: `plan`, `apply`, `show`; skills `archlens-plan`, `archlens-apply`, `archlens-query` | usuário |
| Plano aberto e final | um único arquivo de plano com `state: "open" \| "final"`; `plan --answers` refaz o plano com as respostas e sai final quando nada fica pendente (sem passo separado de "resolver") | usuário (proposta do agente aceita) |
| Conteúdo do plano final | as **operações do store** (`diffRaw(base, resultado)`, com `appendHistory` por último) + `storeVersion` + o delta e os itens respondidos | decisão do agente |
| Prévia em HTML no plan | sim: `deliver --delta` antes das perguntas, `deliver --plan` com plano aberto ou final; nunca grava a base | usuário (confirmado) |
| Diagramas | os **diagramas salvos** (visões da base, `architecture/diagrams/`) são da skill **apply**, que roda `build` depois de gravar, como o documento; a **query** só gera visões avulsas fora da base e respostas em markdown | usuário (proposta do agente aceita) |
| `build` dentro do `apply`? | não: o comando `apply` regrava a base e o `ARCHITECTURE.md` (como hoje); o `build` (Chromium, screenshots) é um passo da skill | usuário (proposta do agente aceita) |
| Quem grava | só a skill apply altera a pasta da base (inclui `migrate`, `store convert`, `doc`, `build` e notas) | decisão do agente |
| Empacotamento | plugin do Claude Code (`.claude-plugin/`) com `skills/archlens-plan`, `skills/archlens-apply`, `skills/archlens-query`; o `SKILL.md` da raiz deixa de existir | decisão do agente |
| Texto comum às skills | `references/base.md` (localizar a base, formato 2.0, conectores, erros de formato), lido pelas três | decisão do agente |
| Comandos atuais | `merge --plan` e `merge --apply <plano>` continuam funcionando como atalhos, com o mesmo comportamento | decisão do agente |
| Consulta em markdown | `archlens query` com `--format md\|json` sobre view specs e um cartão de elemento (`--element`) lido por `readSubgraph` | decisão do agente |

### Critérios de sucesso

1. `archlens apply <base> plano.json` grava a base só com `store.apply(ops, { baseVersion })`, sem reexecutar o merge
   (teste com um conector falso que registra as chamadas).
2. Para todo cenário respondido dos testes de merge, aplicar o plano final produz a mesma base (`canonicalJson`) que
   `merge --apply <plano>` produz hoje.
3. Um plano final com `storeVersion` velho não grava nada (`E_STORE_CONFLICT`), e a mensagem diz como refazê-lo
   reaproveitando as respostas (`archlens plan <base> --answers plano.json --out novo.json`).
4. `plan`, `apply`, `show`, `query` e as prévias do CLI passam por `scripts/lib/api.mjs`: o CLI deixa de importar
   `planMerge`, `applyPlan` e `previewModel` (o `diffRaw` continua só no `migrate`, que grava uma base nova inteira).
5. As três skills carregam pelo plugin e por link simbólico de cada pasta; o teste de skills confere frontmatter, que
   todo arquivo citado existe e que todo comando citado existe no `HELP`.
6. `archlens query --format md` responde as visões dos exemplos e o cartão de elemento; snapshots estáveis.

### Fora do escopo

Conectores remotos e o uso real de `readSubgraph` por eles (e.4); servidor MCP; visões novas (c); exportações (d);
interface para responder perguntas fora do chat; trava entre processos; `build` automático dentro do comando `apply`.

## 1. A biblioteca comum (`scripts/lib/api.mjs`)

Funções que recebem o conector já aberto; nenhuma lê `process.argv`, escreve no terminal ou chama `process.exit`. Erros
saem como `Error` com `code` (o padrão atual de `mergeError`/`storeError`). O CLI cuida de arquivos, mensagens e códigos
de saída.

```js
plan(store, delta, { answers, today })          → { plan }            // aberto ou final
apply(store, plan)                              → { version, entry, preserved }   // só store.apply
show(store, plan, { format: 'md' | 'json' })    → string | object     // relatório legível
preview(store, { delta | plan })                → { raw, preview, warning? }      // plano aberto ou final
query(store, { view | spec | element, depth, via, format }) → string | object
```

- `plan` lê `store.read()` e `contentVersion` na mesma leitura (como o CLI faz hoje), roda `planMerge` com `answers` e,
  se nenhuma pergunta aplicável ficou sem resposta válida e o plano não está bloqueado, roda `applyPlan` e acrescenta
  `ops` e `entry` (estado `final`). Plano que não muda nada: final com `ops: []`, `entry: null`.
- `apply` recebe um plano `final`, calcula `applyOps(read(), ops)` só para validar o resultado (`E_MERGE_INVALID` se
  inválido, nada gravado) e chama `store.apply(ops, { baseVersion: plan.storeVersion })`. Plano aberto: `E_PLAN_OPEN`.
- `preview` com plano final: base lida + `applyOps`, sem pendências; o diff de elementos e relações é o mesmo da prévia
  atual (o builder extrai de `previewModel` a parte que compara duas bases).

Os módulos atuais (`merge.mjs`, `preview.mjs`, `query.mjs`, `doc.mjs`, `store/*`) ficam; `api.mjs` os compõe.

## 2. O plano aberto e o plano final

O formato continua `"archlens-plan": "1.0"`, com campos novos (compatível: planos antigos sem `state` são abertos):

```json
{
  "archlens-plan": "1.0",
  "state": "final",
  "base": "architecture",
  "baseHash": "sha256:…",
  "storeVersion": "sha256:…",
  "created": "2026-10-18",
  "delta": { "archlens-delta": "1.0", "…": "…" },
  "items": [ { "n": 3, "key": "dup:pedidos-api", "class": "possible-duplicate", "resolution": "same", "…": "…" } ],
  "summary": { "new": 3, "possible-duplicate": 1 },
  "blocked": false,
  "errors": [],
  "entry": { "id": "2026-10-18-01", "added": ["…"], "changed": ["…"], "removed": [], "status": {}, "decisions": ["…"] },
  "ops": [ { "op": "upsertElement", "element": { "…": "…" } }, { "op": "appendHistory", "entry": { "…": "…" } } ]
}
```

| Campo | Regra |
|---|---|
| `state` | `open`: alguma pergunta aplicável sem resposta válida, ou plano bloqueado; `final`: tudo respondido |
| `storeVersion` | a versão do store lida pelo `plan`; `null` quando a base ainda não existe |
| `delta` | o delta de origem: permite refazer o plano com `--answers` sem informar o delta de novo |
| `entry`, `ops` | só no `final`; `entry` é a rodada que o apply registra (a mesma do `appendHistory`) |

- Fluxo: `plan <base> delta.json --out p1.json` → o agente pergunta e grava as respostas em `p1.json` → `plan <base>
  --answers p1.json --out p2.json` → `p2.json` é final (ou aberto com as perguntas que surgiram, por exemplo depois de
  uma duplicata `same`) → `apply <base> p2.json`.
- `--answers` aceita qualquer plano (aberto ou final). Sem o argumento do delta, usa `delta` do plano de `--answers`; com
  ele, avisa se for outro delta (como hoje).
- Respostas que não casam mais com o plano novo (item sumiu, resposta inválida para a pergunta nova) são ignoradas sem
  erro, como hoje.
- O plano final é para ser lido e revisado, não editado. Editado à mão, o apply ainda valida o resultado; não há hash de
  integridade *(decisão do agente: a validação do resultado e a versão do store bastam)*.
- `schemas/plan.schema.json` ganha `state`, `entry` e `ops` (gerado por `npm run schemas`).

## 3. CLI

| Comando | O que faz |
|---|---|
| `plan <base> <delta.json> --out p.json [--answers p0.json] [--json]` | plano aberto ou final; imprime o resumo de hoje e o próximo passo (perguntas ou `apply`) |
| `plan <base> --answers p.json --out p2.json` | refaz o plano com as respostas, com o delta de `p.json` |
| `apply <base> p.json` | aplica um plano final; regenera o `ARCHITECTURE.md`; imprime revisão e commit sugerido (saída de hoje) |
| `show <base> p.json [--out f.md] [--json]` | relatório do plano (seção 4) |
| `query <base> --view k \| --spec J [--format md\|json] [--out f]` | resposta em markdown/JSON de uma visão |
| `query <base> --element id [--depth N] [--via t1,t2] [--format md\|json]` | cartão do elemento (seção 5) |
| `render`/`deliver`/`build`/`resolve`/`views` com `--plan p.json` | prévia de plano aberto (como hoje) ou final (novo) |
| `merge <base> <delta.json> --plan p.json` | atalho mantido = `plan` (saída e arquivo de hoje, mais `state`) |
| `merge <base> --apply p.json` | atalho mantido: aceita o plano aberto todo respondido, como hoje (`plan` com as respostas em memória + `apply`) |

- `apply` com plano aberto: `E_PLAN_OPEN` ("o plano tem N pergunta(s) sem resposta: item(ns) …; responda e rode
  `archlens plan <base> --answers p.json --out p2.json`"), nada gravado. Com um delta: `E_PLAN_SCHEMA` orientando a rodar
  `plan` primeiro.
- `apply` com versão velha: `E_STORE_CONFLICT` com a orientação `archlens plan <base> --answers p.json --out novo.json`.
- Plano final sem mudanças: `apply` imprime "nada mudou", não grava nem regenera o documento, sai com 0.
- Os códigos de saída seguem os de hoje (2 para plano bloqueado, conflito e pendência).
- `HELP` em três blocos: "Planejar (nunca grava a base)", "Aplicar (grava a base)", "Consultar (nunca grava a base)".

## 4. Relatório do plano (`show`)

Markdown determinístico, para colar num PR ou numa conversa. Plano final:

```markdown
# Plano: API de pedidos lida do repositório

Base `architecture` na versão `sha256:3f2a…` · fonte: repo github.com/x/pedidos@a1b2c3d · 2026-10-18 · **final**

**+3 elementos · ~2 alterados · −1 removido · relações +4 −1**

## Decisões
- 3. pedidos-api parece loja.pedidos → **mesmo elemento**

## Novos
| id | nome | tipo | C4 | pai |
|---|---|---|---|---|

## Alterados
- **API de Pedidos** (`loja.pedidos`): technology `Java` → `Java / Spring Boot`; aliases + `orders-service`

## Removidos
## Relações
## Visões
```

- Plano aberto: a mesma estrutura, `**aberto**` no cabeçalho, uma seção `## Decisões pendentes` (texto de `describeItem`
  com as opções) antes de `## Decisões`, e as mudanças calculadas com as perguntas no padrão da prévia.
- Nomes e valores antigos vêm da base lida; se a versão da base mudou desde o plano, a primeira linha avisa (como a prévia).
- `--json`: o mesmo conteúdo estruturado. Seções vazias são omitidas.

## 5. Consulta em markdown (`archlens query`)

### Visão (`--view` / `--spec`)

Resolve a view spec como `resolve` faz hoje (mesmo IR) e escreve:

- título e a spec usada (uma linha de JSON);
- elementos agrupados por camada (ArchiMate) ou por nível (C4): tabela `nome · tipo/kind · status · tecnologia`;
- relações: uma linha por aresta com a frase de `explainEdge` (`explain.mjs`);
- viewpoint `impact`: a matriz de dependência como tabela markdown;
- visões com mais de 40 nós: nota no fim sugerindo recortar.

### Cartão de elemento (`--element id`)

Lê `store.readSubgraph({ seeds: [id], depth, via })` (padrão `depth: 1`), não a base inteira *(primeiro uso do
`readSubgraph` pelo CLI, previsto no e.2)*. Escreve: nome, tipo, perfil C4, status, descrição, pai e filhos, relações de
saída e de entrada agrupadas por tipo (com a frase do `explainEdge`), propriedades, fontes (proveniência) e as rodadas do
`store.history()` que citam o id. `--depth N` inclui os vizinhos a N saltos numa seção "Em volta". Id inexistente:
`E_UNKNOWN_REF` com sugestões por nome/alias (`findCandidates` de `match.mjs`).

`--format json` devolve as mesmas estruturas sem formatação.

## 6. As três skills

```
.claude-plugin/plugin.json          ← plugin "archlens"
.claude-plugin/marketplace.json     ← marketplace local de um plugin, para "claude plugin marketplace add <repo>"
skills/archlens-plan/SKILL.md
skills/archlens-apply/SKILL.md
skills/archlens-query/SKILL.md
references/base.md                  ← novo: o que as três precisam sobre a base
references/…                        ← os atuais, sem mudança de lugar
```

Em cada skill, `SKILL_DIR` é a pasta dela e o CLI é `node $SKILL_DIR/../../scripts/archlens.mjs` (funciona pelo plugin
e por link simbólico da pasta, porque o `..` segue o alvo do link).

| Skill | Gatilho (resumo da `description`) | Conteúdo (migrado do `SKILL.md` atual) | Termina com |
|---|---|---|---|
| `archlens-plan` | informação nova para a base: prompt, texto livre, documento, JSON, repositório; "o que este repo traz que a base não tem"; "X foi substituído"; "como fica se…" | passos 3–5 do fluxo atual (delta, plano, prévia em HTML, perguntas uma a uma, duplicatas primeiro), `scan`, `plan --answers`, `show` | o plano final + `show` + prévia `deliver --plan` (HTML fora da base); "para gravar, use a skill archlens-apply" |
| `archlens-apply` | gravar um plano revisado; migrar base 1.x; trocar de conector; regenerar documento e diagramas salvos; escrever as notas | `apply`, depois `build` (diagramas das visões salvas em `architecture/diagrams/` + relatório de qualidade e alertas), notas (passos 10–11), `migrate`, `store convert`, `check`, `doc` | base, documento e diagramas salvos em dia + commit sugerido |
| `archlens-query` | pedidos de visão e perguntas sobre a arquitetura: diagramas C4/ArchiMate, "o que sustenta P", impacto, as-is/to-be, "me fale do sistema X" | tabela pedido → view spec, estilos de layout, alertas, `deliver --spec/--view --out` (fora da base), `views`, `query --format md`, `--element` | HTML e/ou markdown; nada gravado na base |

- Regras que valem para as três (nunca editar o `ARCHITECTURE.md`, base 1.x → `migrate` com ok do usuário, ids
  estáveis) ficam em `references/base.md`, citado no topo de cada `SKILL.md`.
- Erros comuns vão para a skill a que pertencem (ex.: "duplicata aceita sem perguntar" → plan; "aplicar para ver como
  fica" → plan e apply; "visão gigante" → query e apply, por causa do `build`).
- **Visão que o usuário quer manter** (a query mostrou e ele gostou): a query não grava; ela monta o delta com `views` e
  passa à skill plan, que segue o fluxo normal até o apply (e o `build` gera o diagrama salvo).
- A skill apply recusa seguir sem um plano final: se o usuário pede "adicione Y na base", ela manda para a skill plan.
- Instalação (README e `docs/GUIA.md`): `claude plugin marketplace add <repo>` + `claude plugin install archlens`, ou
  `ln -s <repo>/skills/archlens-* ~/.claude/skills/`. Quem tinha `~/.claude/skills/archlens → <repo>` precisa trocar o
  link (anotado no `CHANGELOG.md` em "Mudado (incompatível)").

## 7. Testes (TDD, `node:test`)

- **`api.mjs`** (`tests/api.test.mjs`): `plan` aberto = `planMerge` de hoje mais `state: "open"`; `plan` com todas as
  respostas = final com `ops` terminando em `appendHistory`; plano bloqueado fica aberto; `--answers` de um plano final e
  de um aberto dão o mesmo resultado; respostas que não casam são ignoradas; `apply` com conector falso que registra as
  chamadas (só `read`, `version`, `apply`) e com o `delta` do plano trocado por `{}` (prova que não reexecuta o merge);
  plano aberto (`E_PLAN_OPEN`), versão velha e plano de outra base (`E_STORE_CONFLICT`), resultado inválido
  (`E_MERGE_INVALID`): nada gravado; base inexistente criada pelo apply.
- **Equivalência:** para cada cenário (base, delta, respostas) dos testes de merge e para o `delta-02.json` do
  `telemedicina` sobre a base do exemplo, `apply(plano final)` = `applyPlan(base, plano)` (`canonicalJson` da base e do
  changelog). Os `plano-*.json` dos exemplos foram feitos contra bases que já os aplicaram e não servem para isso.
- **Relatório:** snapshots de `show` para o `delta-02` do `telemedicina` (final e aberto) e para um plano com remoção e
  relações.
- **Consulta:** snapshots de `query --format md` para três visões do `loja-online` (C4 container, product-support,
  impact) e do cartão de um container com `--depth 1`; `E_UNKNOWN_REF` com sugestões; o cartão lê por `readSubgraph`
  (conector falso).
- **CLI:** `plan` → `plan --answers` → `apply` de ponta a ponta nas bases `json` e `markdown`; atalhos `merge --plan` /
  `--apply` inalterados (os testes atuais continuam passando); `deliver --plan` com plano final; o CLI não importa
  `planMerge`, `applyPlan`, `previewModel`.
- **Skills** (`tests/skills.test.mjs`): cada `skills/*/SKILL.md` tem `name` e `description`; todo `references/*.md` e
  `scripts/*` citado existe; todo `archlens <comando>` citado aparece no `HELP`; só `archlens-apply` manda rodar `apply`,
  `build`, `migrate`, `store convert` e `doc`; `plugin.json` existe.

## 8. Exemplos e documentação

- `examples/telemedicina/plano-02.json` (aberto), `plano-02-final.json` e `plano-02-final.md` (`show`) a partir do
  `delta-02.json` (respostas: item 3 `take`, 5 `same`, 6 `keep`, 12 `yes`). O `delta-02` continua sendo só prévia: a base
  do exemplo não é gravada.
- `references/merge.md`: o fluxo `plan` → `plan --answers` → `apply`, plano aberto e final, `show`, conflito e refazer
  com `--answers`; os atalhos `merge`.
- `references/views.md`: seção "Consulta em markdown" (`query`).
- `references/base.md` novo; `README.md` e `docs/GUIA.md`: as três skills e a instalação.
- `CHANGELOG.md` (`[Não lançado]`): adicionado (`plan`/`apply`/`show`, plano final com operações, `query`, plugin) e
  mudado incompatível (o `SKILL.md` da raiz saiu; trocar o link simbólico).
- Roadmap: e.3 feito, com o PR.

## 9. O que fica para o builder

- A forma interna de extrair de `previewModel` a comparação entre duas bases.
- O texto das `description` das skills (gatilhos acima como base; sem sobreposição entre elas).
- A divisão exata do texto do `SKILL.md` atual entre as três skills e `references/base.md`, desde que nada se perca
  (o teste de skills ajuda; um checklist no PR lista para onde foi cada seção).
- O layout das tabelas do relatório e da consulta, desde que determinístico.
