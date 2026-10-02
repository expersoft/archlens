# Evoluindo a base: delta → plano → apply

A base de conhecimento (a pasta `architecture/`, ou o `ARCHITECTURE.md` gerado, que aponta para ela; se nenhuma existe, o apply a cria) muda por **merge**. O agente descreve o que há de novo num
**delta**; a CLI compara com a base, classifica cada item e grava um **plano** com as perguntas; o usuário
responde; o `apply` grava a base, regenera o documento e registra a rodada no **Histórico**.
Nada é decidido em silêncio: conflitos, possíveis duplicatas, remoções e `retired` esperam resposta.

```bash
node scripts/archlens.mjs merge architecture/ delta.json --plan plano.json   # relatório + plano
# … responda as possíveis duplicatas; se alguma for "same", gere o plano de novo com as respostas:
node scripts/archlens.mjs merge architecture/ delta.json --plan plano2.json --answers plano.json
# … responda os itens restantes com "resolution": null …
node scripts/archlens.mjs merge architecture/ --apply plano2.json           # grava e registra
```

Se a base não existe, o primeiro delta a cria (`name` e `description` do delta viram os da base).
Planos gerados antes de um `migrate` continuam válidos depois (o hash é sobre o modelo, não sobre o arquivo).

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
| elementos | mesmo DSL de `notation.md`. Para **enriquecer** um existente, basta `id` + os campos novos. `parent` e `children` funcionam; `parent` aceita id ou alias |
| relações | `from`/`to` aceitam id ou alias. `A uses B` casa com o `B serving A` que já estiver na base |
| `views` | key nova entra; key existente com definição diferente vira conflito (`keep` \| `take`) |
| `ops` | `rename` (o nome antigo vira alias), `alias`, `status` (+ `reason`), `remove` (cascata: filhos, relações, visões) |
| `source` num item | texto livre: `"source": "<trecho literal>"` vira `excerpt` junto da fonte do delta |

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
fosse novo. Por isso, **se alguma duplicata for `same`, gere o plano de novo com `--answers`**: o plano novo
já trata o item como o elemento da base (relações casam com as da base, filhos entram dentro dele) e pode trazer
perguntas novas. As respostas do plano anterior entram pré-preenchidas (o relatório as marca como
`✓ respondido`); respostas inválidas são ignoradas.

`--answers <plano.json>` lê os `resolution` preenchidos daquele plano, por `key`. Use-o com o **mesmo delta**
(a CLI avisa se o delta mudou, porque `rel:<n>` e `op:<n>` são posições no delta).

## Perguntando ao usuário

- Mostre o resumo do relatório (contagens e novos).
- Pergunte **primeiro as possíveis duplicatas**. Se alguma for `same`, grave as respostas, rode
  `--plan <novo.json> --answers <plano.json>` e continue no plano novo.
- Faça **uma pergunta por item** com `resolution: null`, na ordem de `n`, com a sua recomendação e o motivo.
  Ex.: *"A base diz que a API de Pedidos é Java/Spring; o repo mostra Kotlin. Recomendo `take` (o repo é mais recente). Ok?"*
- Pule os itens com `when` se a duplicata foi respondida `different`.
- Grave as respostas no `plano.json` (campo `resolution` de cada item) e rode o `--apply`.

## Erros

| Código | Quando | O que fazer |
|---|---|---|
| `E_DELTA_SCHEMA` | falta `"archlens-delta": "1.0"` ou op sem `op`/`id` | corrija o delta |
| plano `blocked` | o resultado teria erros de validação (`E_UNKNOWN_REF`, `E_UNKNOWN_TYPE`…) | corrija o delta e planeje de novo |
| `E_PARENT_CYCLE` | o delta move um elemento para dentro de um descendente seu (plano bloqueado) | corrija o `parent` no delta e planeje de novo |
| `E_PLAN_PENDING` | há `resolution: null` | responda os itens listados |
| `E_PLAN_RESOLUTION` | resposta fora das opções | use as opções da tabela |
| `E_PLAN_REPLAN` | o apply encontrou uma decisão que não está no plano (típico: duplicata respondida `same` sem replanejar) | rode `--plan <novo.json> --answers <plano.json>` e responda as perguntas novas |
| `E_PLAN_STALE` | a base mudou depois do plano (inclusive por já ter aplicado este plano) | gere o plano de novo |
| `E_MERGE_INVALID` | o resultado com as respostas reais é inválido | reveja as respostas (ex.: `value:` com id inexistente) |

## Pré-visualizando (antes do apply)

```bash
node scripts/archlens.mjs deliver architecture/ --delta delta.json --out prévia.html   # pendências no padrão do plano
node scripts/archlens.mjs deliver architecture/ --plan plano.json --out prévia.html    # usa as respostas já dadas
node scripts/archlens.mjs build architecture/ --delta delta.json                          # diagrams/<delta>-preview.html; nunca o .md
```

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
- `status`: `draft` (em discussão), `planned`, `active` (padrão), `deprecated`, `retired`. `draft` é desenhado em esboço à mão (hachura na cor do tipo e contorno duplo, como o modo Sketch do draw.io). Visões escondem `retired` por padrão; use
  `status` na view spec para as-is/to-be. O `validate` avisa `W_RETIRED_DEPENDENCY`.
- Cada apply que muda algo acrescenta uma entrada em `changelog` (seção **Histórico** do `.md`). Aplicar o mesmo
  delta de novo não muda nada e não cria entrada: o apply imprime `= nada mudou; a base não foi regravada`.

## Boas práticas

- Um delta por fonte e por rodada: facilita o histórico e a revisão.
- Reutilize ids da base (`archlens views architecture/` e as tabelas do `.md` mostram os ids).
- Depois do apply, sugira o commit do `ARCHITECTURE.md` ao usuário.
