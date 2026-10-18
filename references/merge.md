# Evoluindo a base: delta → plano → apply

A base de conhecimento (a pasta `architecture/`, ou o `ARCHITECTURE.md` gerado, que aponta para ela; se nenhuma
existe, o apply a cria) muda por rodadas. O agente descreve o que há de novo num **delta**; o `plan` compara com a
base, classifica cada item e grava um **plano** com as perguntas; o usuário responde; o `plan --answers` refaz o
plano com as respostas até ele sair **final**; o `apply` grava o plano final, regenera o documento e registra a
rodada no **Histórico**. Nada é decidido em silêncio: conflitos, possíveis duplicatas, remoções e `retired` esperam
resposta. `plan`, `show` e as prévias nunca gravam a base (skill archlens-plan); só o `apply` grava (skill
archlens-apply).

```bash
node scripts/archlens.mjs plan architecture/ delta.json --out p1.json          # relatório + plano (aberto ou final)
# … responda as perguntas em p1.json ("resolution"), possíveis duplicatas primeiro …
node scripts/archlens.mjs plan architecture/ --answers p1.json --out p2.json   # refaz com as respostas (usa o delta de p1)
# … repita até o plano sair final; depois revise …
node scripts/archlens.mjs show architecture/ p2.json --out plano.md             # relatório markdown do plano
node scripts/archlens.mjs deliver architecture/ --plan p2.json --out prévia.html # prévia em HTML (fora da base)
node scripts/archlens.mjs apply architecture/ p2.json                           # grava e registra
```

Se a base não existe, o primeiro delta a cria (`name` e `description` do delta viram os da base).
A base precisa estar no formato 2.0: uma base 1.x falha com `E_STORE_FORMAT` (rode `archlens migrate <base>`).
Planos gerados antes de um `migrate` **não** valem depois: a base muda (tipos, bancos, ids de relações), e com ela a
versão gravada no plano (`E_STORE_CONFLICT` no `apply`). Gere o plano de novo.

## O plano aberto e o plano final

| `state` | Quando | Próximo passo (a CLI imprime) |
|---|---|---|
| `open` | alguma pergunta aplicável sem resposta válida, ou plano bloqueado | responder em `"resolution"` e rodar `plan <base> --answers p.json --out p2.json` |
| `final` | tudo respondido | revisar (`show`, prévia) e rodar `apply <base> p.json` |

- O plano guarda `storeVersion` (a versão da base lida pelo `plan`; `null` se a base ainda não existe) e o `delta` de
  origem: por isso `plan <base> --answers p.json --out p2.json` refaz o plano sem informar o delta de novo. Com o
  delta, a CLI avisa se for outro.
- `--answers` aceita qualquer plano (aberto ou final). Respostas que não casam mais com o plano novo (item sumiu,
  resposta inválida para a pergunta nova) são ignoradas sem erro.
- Só o plano final tem `entry` (a rodada que o apply registra) e `ops` (as operações que ele grava). O `apply` não
  refaz o merge: grava as `ops`, depois de conferir a versão da base e validar o resultado.
- O plano final é para ser lido e revisado, não editado. Editado à mão, o `apply` ainda valida o resultado.
- Plano final sem mudanças: o `apply` imprime `= nada mudou; a base não foi regravada` e sai com 0.

## O relatório (`show`)

`archlens show <base> p.json [--out f.md] [--json]` escreve um markdown determinístico, para colar num PR ou numa
conversa: título (o `summary` do delta), base e versão, fonte, data e estado (**aberto** ou **final**), contagens, e
as seções `Decisões pendentes` (só no aberto, com as opções de cada pergunta), `Decisões`, `Novos`, `Alterados`
(antes → depois), `Removidos`, `Relações` e `Visões`. Seções vazias são omitidas. Se a base mudou desde o plano, a
primeira linha avisa. `--json` dá o mesmo conteúdo estruturado. Nunca grava a base.

## Conflito de versão: refazer com `--answers`

O `apply` recusa, sem gravar nada:

- plano **aberto**: `E_PLAN_OPEN` com os itens sem resposta; responda e rode `plan <base> --answers p.json --out p2.json`;
- um **delta** (ou outro arquivo) no lugar do plano: `E_PLAN_SCHEMA`; rode `plan` primeiro;
- base que **mudou** depois do plano (outra rodada aplicada, edição, `migrate`, ou o próprio plano já aplicado):
  `E_STORE_CONFLICT`. Refaça o plano sobre a base atual reaproveitando as respostas:
  `plan <base> --answers p.json --out p3.json`; confira as perguntas novas, revise e aplique o plano novo.

## O delta

```json
{
  "archlens-delta": "1.0",
  "source": { "kind": "prompt", "ref": "rodada 2026-10-01", "date": "2026-10-01" },
  "summary": "Uma frase: o que esta rodada trouxe",
  "assumptions": ["premissas novas"],
  "model": { "elements": [ ... ], "relationships": [ ... ] },
  "views": [ ... ],
  "ops": [
    { "op": "rename", "id": "loja.pedidos", "name": "Orders API" },
    { "op": "alias",  "id": "loja.pedidos", "add": ["orders-service"] },
    { "op": "status", "id": "erp", "status": "deprecated", "reason": "migração para SAP" },
    { "op": "remove", "id": "loja.temp" }
  ]
}
```

| Campo | Regra |
|---|---|
| `source` | de onde veio a rodada: `kind` = `prompt` \| `repo` \| `doc` \| `manual`, `ref` (rodada, `repo@commit`, documento), `path`, `date`. Herdado por todo item criado ou alterado |
| elementos | mesmo DSL de `notation.md` (vocabulário livre, traduzido na entrada). Para **enriquecer** um existente, basta `id` + os campos novos. `parent` e `children` funcionam; `parent` aceita id ou alias |
| relações | `from`/`to` aceitam id ou alias. `A uses B` casa com o `B serving A` que já estiver na base |
| `views` | key nova entra; key existente com definição diferente vira conflito (`keep` \| `take`) |
| `ops` | `rename` (o nome antigo vira alias), `alias`, `status` (+ `reason`), `remove` (cascata: filhos, relações, visões) |
| `source` num item | texto livre: `"source": "<trecho literal>"` vira `excerpt` junto da fonte do delta |

## Tradução na entrada

O delta usa o vocabulário livre (o do prompt e do `scan`); a CLI o traduz para o formato 2.0 **antes** de casar os
itens, e o plano e o `apply` já trabalham em 2.0. A base nunca guarda `c4:*`, `uses`, `children` nem o campo `archimate`.

| Entrada | Saída 2.0 |
|---|---|
| `c4:person` | `business-actor` + `c4.kind: person` |
| `c4:softwareSystem` / `c4:container` / `c4:component` | `application-component` + o kind (a tag `database` não muda o tipo) |
| `c4:deploymentNode` / `c4:infrastructureNode` | `node` + o kind |
| `archimate:X` ou `X` | `X` |
| `archimate: Y` num elemento `c4:*` | `type: Y` e o kind C4 mantido; combinação inválida: `E_C4_TYPE` |
| `children` | lista plana com `parent`, pai antes de filho |
| `application-component` sem `c4` | kind inferido pela profundidade numa cadeia de componentes (0 sistema, 1 container, 2 componente; mais fundo, sem kind) |
| `business-actor` ou `business-role` de topo sem `c4` | `c4.kind: person` |
| `uses` / `c4:uses` com alvo ativo | `serving` com as pontas invertidas |
| `uses` / `c4:uses` com alvo passivo | `access` com `accessType` (padrão `readwrite`) |
| `archimate:R` / `R` | `R` |

Duas regras de detalhe:

- **O delta fica como veio no plano** (`plan.delta`, vocabulário livre). O `apply` repete a tradução sobre a mesma base
  (o hash garante que é a mesma) e o `--answers` compara o delta original. O que o plano simula e o que o `apply`
  grava é 2.0.
- **O kind C4 só é inferido para elementos novos.** Um kind inferido nunca vira conflito com o kind gravado de um
  elemento já casado (por id, alias ou nome): enriquecer `{ "id": "loja.api", "technology": "Kotlin" }` não pergunta
  nada sobre C4.

## Como a CLI casa os itens

1. **id igual** ao da base;
2. **alias**: id, nome ou alias do delta igual a um alias da base (ou alias do delta igual a um id da base).
   Comparação sem acento, caixa ou pontuação;
3. **possível duplicata** (nunca automática): mesmo tipo ArchiMate e nome parecido (≥ 0,75), ou mesmo pai e mesma
   tecnologia com nome minimamente parecido.

## Classes no plano

| Classe | Significado | Resposta (`resolution`) |
|---|---|---|
| `new` | não casou: entra como novo | — |
| `unchanged` | casou e nada difere (só ganha a fonte) | — |
| `enrich` | preenche campos vazios, tags, aliases, fontes | — |
| `conflict` | um campo preenchido difere | `keep` \| `take` \| `value:<valor>` (visões: `keep` \| `take`) |
| `possible-duplicate` | parece um elemento da base | `same` (vira alias e o item é mesclado) \| `different` (entra como novo) |
| `op` | operação explícita | `remove` e `status: retired`: `yes` \| `no` (o item lista em `cascade.views` / `views` as visões salvas afetadas) |

Itens com `"when": "dup:<id>=same"` só valem se a duplicata correspondente for respondida `same`. Eles mostram
só as diferenças de **campo** do próprio elemento; relações e filhos do item do delta foram planejados como se ele
fosse novo. Por isso, **se alguma duplicata for `same`, refaça o plano com `--answers`** (o plano continua aberto
enquanto houver perguntas): o plano novo
já trata o item como o elemento da base (relações casam com as da base, filhos entram dentro dele) e pode trazer
perguntas novas. As respostas do plano anterior entram pré-preenchidas (o relatório as marca como
`✓ respondido`); respostas inválidas são ignoradas.

`--answers <plano.json>` lê os `resolution` preenchidos daquele plano, por `key`. Sem o argumento do delta, usa o
delta do próprio plano; com ele, use o **mesmo delta** (a CLI avisa se o delta mudou, porque `rel:<n>` e `op:<n>` são
posições no delta).

### Agrupamentos

- `group` é um campo como os outros: preencher um vazio é `enrich`; mudar de grupo é `conflict` (`keep` | `take`).
- `"group": null` tira o elemento do grupo (conflito quando ele tem um; o `take` apaga a chave). Sem grupo, é no-op.
- `{"op": "remove", "id": "<agrupamento>"}` remove só o agrupamento: os membros diretos perdem o `group` e ficam
  (os aninhados nele sobem para o topo), e as visões salvas tiram o id de `groups.only` (sem grupos restantes, a
  visão sai; `crossOnly` com menos de 2 vira `false`). O item lista isso em `cascade.members` e `cascade.views`.
- `status: retired` num agrupamento listado em `groups.only` de uma visão: o item avisa em `views`, e o plano fica
  bloqueado (`E_VIEW_GROUP`) até o delta tirar o agrupamento da visão ou acrescentar `"retired"` ao `status` dela.

## Perguntando ao usuário

- Mostre o resumo do relatório (contagens e novos).
- Pergunte **primeiro as possíveis duplicatas**. Se alguma for `same`, grave as respostas, rode
  `plan <base> --answers <plano.json> --out <novo.json>` e continue no plano novo.
- Faça **uma pergunta por item** com `resolution: null`, na ordem de `n`, com a sua recomendação e o motivo.
  Ex.: *"A base diz que a API de Pedidos é Java/Spring; o repo mostra Kotlin. Recomendo `take` (o repo é mais recente). Ok?"*
- Pule os itens com `when` se a duplicata foi respondida `different`.
- Grave as respostas no `plano.json` (campo `resolution` de cada item) e rode `plan <base> --answers plano.json --out
  plano2.json`; repita até o plano sair `final`, mostre o `show` e a prévia, e só então o `apply` (skill archlens-apply).

## Erros

| Código | Quando | O que fazer |
|---|---|---|
| `E_DELTA_SCHEMA` | falta `"archlens-delta": "1.0"` ou op sem `op`/`id` | corrija o delta |
| plano `blocked` | o resultado teria erros de validação (`E_UNKNOWN_REF`, `E_UNKNOWN_TYPE`…) | corrija o delta e planeje de novo |
| `E_PARENT_CYCLE` | o delta move um elemento para dentro de um descendente seu (plano bloqueado) | corrija o `parent` no delta e planeje de novo |
| `E_PLAN_OPEN` | `apply` de um plano aberto (perguntas sem resposta ou bloqueado) | responda e rode `plan <base> --answers p.json --out p2.json` |
| `E_PLAN_SCHEMA` | `apply`, `show` ou `--answers` com um arquivo que não é plano (ex.: o delta) | rode `plan` primeiro |
| `E_STORE_CONFLICT` | a base mudou depois do plano (inclusive por já ter aplicado este plano) | refaça com `plan <base> --answers p.json --out novo.json` |
| `E_MERGE_INVALID` | o resultado com as respostas reais é inválido | reveja as respostas (ex.: `value:` com id inexistente) |
| `E_PLAN_RESOLUTION` | resposta fora das opções (atalho `merge --apply`; o `plan --answers` ignora) | use as opções da tabela |
| `E_PLAN_PENDING` | há `resolution: null` (atalho `merge --apply`) | responda os itens listados |
| `E_PLAN_REPLAN` | o `merge --apply` encontrou uma decisão que não está no plano (típico: duplicata `same` sem replanejar) | rode `plan <base> --answers p.json --out p2.json` e responda as perguntas novas |
| `E_PLAN_STALE` | atalho `merge --apply` com um plano antigo (sem `storeVersion`): a base mudou depois dele | gere o plano de novo |

## Pré-visualizando (antes do apply)

```bash
node scripts/archlens.mjs deliver architecture/ --delta delta.json --out /tmp/prévia.html   # pendências no padrão do plano
node scripts/archlens.mjs deliver architecture/ --plan plano.json --out /tmp/prévia.html    # usa as respostas já dadas
```

O `--out` da prévia vai para fora da pasta da base. O `build` não é prévia: mesmo com `--delta` ele escreve
`architecture/diagrams/<delta>-preview.html` dentro da base, por isso fica com a skill archlens-apply, nunca com a
skill archlens-plan.

A prévia roda o mesmo merge do plano e desenha a base com o delta aplicado:

| Marcador | Significado | No painel |
|---|---|---|
| esboço + `+` | novo neste delta | o que o delta traz: nome, tipo, tecnologia |
| contorno em esboço + `~` | alterado | antes → depois de cada campo |
| esmaecido, riscado, `−` | removido ou `retired` (fantasma: continua visível com as relações que caem) | o que sai junto |
| `?` amarelo | decisão pendente (no nó ou no rótulo da relação) | a pergunta, o que a prévia assumiu e as alternativas |
| relação em esboço, mais grossa | relação alterada | "alterada" na lista de relações |

Visões que o apply apagaria ou apararia (ex.: `scope` removido) continuam na prévia na forma da base, com o
fantasma; o terminal avisa `visões afetadas pelo delta (somem ou mudam no apply): …`.

Pendências assumem o padrão do plano: `take` em conflitos, `different` em duplicatas, `yes` em remoções. Plano
bloqueado não tem prévia. Com as mesmas respostas, a prévia mostra exatamente o que o apply gravaria.

Os marcadores ficam dentro do nó (canto superior direito em C4, esquerdo em ArchiMate). Elemento novo com
`status: draft` mostra `+` na prévia; depois do merge, `draft` é desenhado em esboço, sem marcador. O painel lista as
alternativas de cada decisão pendente e marca relações como "sai", "nova" ou "alterada". `views --delta … --json`
imprime só o JSON. Os comandos de prévia exigem o arquivo da base mesmo que ele ainda não exista.

## Proveniência, ciclo de vida e histórico

- Todo item tocado ganha a fonte do delta em `sources` (sem duplicar). O `.md` mostra a coluna **Fontes**
  (`P` prompt, `R` repo, `D` doc, `M` manual) e a seção **Fontes**.
- Fonte `repo` (leitura de repositório): `ref` com o commit (`<url ou caminho>@<commit7>`, ou `@sem-commit`), `path` e
  `line`. Itens `retired` vindos de uma nova leitura entram como `ops` (`status: "retired"`) e pedem confirmação
  (`yes`/`no`); veja `references/repo-reading.md`.
- `status`: `draft` (em discussão), `planned`, `active` (padrão), `deprecated`, `retired`. `draft` é desenhado em esboço à mão (hachura na cor do tipo e contorno duplo, como o modo Sketch do draw.io). Visões escondem `retired` por padrão; use
  `status` na view spec para as-is/to-be. O `validate` avisa `W_RETIRED_DEPENDENCY`.
- Cada apply que muda algo acrescenta uma entrada em `changelog` (seção **Histórico** do `.md`). Aplicar o mesmo
  delta de novo não muda nada e não cria entrada: o apply imprime `= nada mudou; a base não foi regravada`.

## Boas práticas

- Um delta por fonte e por rodada: facilita o histórico e a revisão.
- Reutilize ids da base (`archlens views architecture/` e as tabelas do `.md` mostram os ids).
- Depois do apply, sugira o commit da pasta `architecture/` e do `ARCHITECTURE.md` ao usuário (a CLI imprime
  `git add architecture ARCHITECTURE.md`).

## Atalhos `merge`

Os comandos antigos continuam, como atalhos:

| Atalho | O mesmo que |
|---|---|
| `merge <base> <delta.json> --plan p.json [--answers p0.json]` | `plan <base> <delta.json> --out p.json [--answers p0.json]` (mesmo arquivo, com `state`) |
| `merge <base> --apply p.json` | fechar o plano aberto todo respondido (`plan` com as respostas em memória) + `apply`; recusa com `E_STORE_CONFLICT` (base mudou), `E_PLAN_PENDING`, `E_PLAN_RESOLUTION`, `E_PLAN_REPLAN` ou `E_PLAN_STALE` (plano antigo) |

O fluxo das skills é `plan` → `plan --answers` → `show` + prévia → `apply`: o plano final revisado é exatamente o que
o `apply` grava.
