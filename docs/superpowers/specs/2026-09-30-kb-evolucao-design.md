# Evolução incremental da base de conhecimento (merge, proveniência, ciclo de vida, histórico)

- **Data:** 2026-09-30
- **Branch:** `feat/kb-evolucao` (agrupa todas as features de evolução da base)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito

## Contexto e objetivo

O archlens trata o `ARCHITECTURE.md` como base de conhecimento, mas hoje ela só é *criada*: o fluxo
diz "não remodele; edite o JSON e regenere". Não há procedimento para acrescentar e lapidar a base
com novos prompts (e, futuramente, com leitura de repositórios), nem para casar entidades,
detectar conflitos, registrar de onde veio cada fato ou o que mudou em cada rodada.

**Objetivo:** permitir que a base evolua por rodadas de enriquecimento seguras e auditáveis, sem
perder a propriedade central "modele uma vez, peça visões".

### Decisões do usuário

| Tema | Decisão |
|---|---|
| Revisão das mudanças | **Propor e confirmar**: a CLI gera o diff; nada é aplicado antes do ok; conflitos nunca são resolvidos em silêncio |
| Histórico | **No modelo + git**: array `changelog` no JSON, renderizado no `.md`; o git guarda o diff completo |
| Fonte de verdade | **Só o `ARCHITECTURE.md`**: o bloco `archlens-json` é lido e gravado pelo merge; `model.json` vira formato de entrada/delta |
| Remoção | **Ciclo de vida**: `status` em elementos e relações; nada some sem pedido explícito (`remove` com confirmação) |
| Abordagem | **A — delta + `archlens merge` em duas fases (`--plan` / `--apply`)**; casamento e detecção de conflito são determinísticos, na CLI |

### Critérios de sucesso

1. Aplicar o mesmo delta duas vezes não muda a base (idempotência) nem cria entrada no changelog.
2. Nenhum conflito, duplicata provável ou operação destrutiva é aplicado sem resolução explícita.
3. O `.md` mostra, para cada elemento, de que fontes ele veio, e o histórico das rodadas.
4. Bases existentes (exemplos `loja-online` e `telemedicina`) continuam válidas sem migração, e
   todas as visões atuais resolvem igual.

### Fora do escopo

Leitura/extração de repositórios (entrega seguinte, que consumirá o formato de delta definido
aqui), divisão da base por domínio, novos tipos de visão (deployment C4, capability map, foco de
negócio no C4) e exportações (Structurizr, PlantUML, ArchiMate Exchange).

## 1. Mudanças no modelo

Todos os campos são opcionais; ausentes, o comportamento atual se mantém.

### Elementos e relações

```json
{
  "id": "loja.pedidos",
  "aliases": ["orders-service", "API Pedidos"],
  "status": "active",
  "statusReason": "—",
  "sources": [
    { "kind": "prompt", "ref": "rodada 2026-09-30", "excerpt": "a API de pedidos publica no Kafka", "date": "2026-09-30" },
    { "kind": "repo", "ref": "github.com/x/orders@a1b2c3d", "path": "deploy/compose.yml", "date": "2026-10-02" }
  ]
}
```

| Campo | Valores | Semântica |
|---|---|---|
| `status` | `planned`, `active` (padrão), `deprecated`, `retired` | ciclo de vida |
| `statusReason` | texto | motivo da última mudança de status |
| `sources[]` | `{kind, ref, path?, excerpt?, date?}`, `kind ∈ prompt, repo, doc, manual` | proveniência; lista sem duplicatas (chave `kind+ref+path`) |
| `aliases[]` | strings | nomes/ids alternativos confirmados como o mesmo elemento (só elementos) |

- **Compatibilidade:** `source: "<trecho>"` continua aceito e é normalizado como
  `sources: [{kind:"prompt", excerpt:"<trecho>"}]`. O merge grava sempre `sources`.
- **Ids de relação estáveis:** o merge grava `id` em toda relação que cria. Relações sem `id`
  mantêm a geração atual (`from-tipo-to`, sufixo `#n` em paralelas).

### Raiz do modelo

```json
"changelog": [
  {
    "id": "2026-09-30-01",
    "date": "2026-09-30",
    "source": { "kind": "repo", "ref": "github.com/x/orders@a1b2c3d" },
    "summary": "Ingestão do repo orders: 3 containers, 1 tópico",
    "added": ["orders.worker"],
    "changed": ["loja.pedidos"],
    "status": { "erp.faturamento": "deprecated" },
    "removed": [],
    "decisions": ["duplicata: orders-service = loja.pedidos", "conflito loja.pedidos.technology: take \"Kotlin\""]
  }
]
```

Escrito apenas por `merge --apply`. `id` = data + sequencial do dia.

### Visões

Novo campo opcional `status: ["planned", "active", ...]` na view spec. Padrão: todos exceto
`retired`. Elementos `deprecated` recebem classe visual própria (borda riscada/opacidade reduzida)
em C4 e ArchiMate; `planned`, borda tracejada distinta da de `inferred`. Relações com uma ponta
filtrada somem junto.

### Validação (novos códigos)

| Código | Nível | Condição |
|---|---|---|
| `E_STATUS` | erro | `status` fora dos valores permitidos |
| `E_ALIAS_CONFLICT` | erro | mesmo alias em dois elementos, ou alias igual ao id de outro elemento |
| `E_SOURCE` | erro | `sources[]` sem `kind` válido ou sem `ref`/`excerpt` |
| `W_RETIRED_DEPENDENCY` | aviso | elemento não-`retired` sustentado por elemento `retired` (travessia de suporte, 1 salto) |

## 2. Delta e fluxo `plan` → `apply`

### Formato do delta (`schemas/delta.schema.json`)

```json
{
  "archlens-delta": "1.0",
  "source": { "kind": "repo", "ref": "github.com/x/orders@a1b2c3d", "date": "2026-10-02" },
  "summary": "Leitura do repo orders",
  "name": "opcional: nome da base (só usado ao criar)",
  "description": "opcional: só usado ao criar",
  "assumptions": ["premissas novas desta rodada"],
  "model": { "elements": [], "relationships": [] },
  "views": [],
  "ops": [
    { "op": "rename", "id": "loja.pedidos", "name": "Orders API" },
    { "op": "status", "id": "erp.faturamento", "status": "deprecated", "reason": "migração para SAP" },
    { "op": "alias",  "id": "loja.pedidos", "add": ["orders-service"] },
    { "op": "remove", "id": "loja.temp" }
  ]
}
```

- `source` do delta é herdado por todo item criado ou alterado que não declare `sources` próprio.
- Elementos do delta podem usar `children` ou `parent`; `parent`, `from`, `to`, `scope`, `anchor`
  e `focus` aceitam id **ou alias** da base e são reescritos para o id canônico.
- `views` do delta seguem as mesmas regras (nova key → `new`; key existente com spec diferente → `conflict`).
- `assumptions` são acrescentadas sem duplicar.
- `ops` referenciam elementos ou relações por id/alias. `remove` de elemento remove também os
  filhos e as relações que o tocam (listados no plano). Ops sempre exigem resolução quando são
  `remove` ou `status: retired`.

### Fase 1 — `archlens merge <base.md> <delta.json> --plan <plano.json>`

1. **Carregar** a base (bloco `archlens-json`); se o arquivo não existe, a base é vazia (criação).
2. **Casar elementos**, nesta ordem, parando no primeiro acerto:
   1. id do delta = id da base;
   2. id ou `name` do delta = alias da base (ou vice-versa);
   3. candidato fuzzy (`match.mjs`): mesmo tipo ArchiMate **e** (similaridade de nome normalizado
      ≥ limiar **ou** mesmo pai e mesma `technology`). Fuzzy **nunca** casa automaticamente.
3. **Casar relações:** por `id`; senão pela tripla normalizada `(from, tipo ArchiMate, to)` depois
   de resolver ids/aliases e converter `uses` (logo `A uses B` casa com `B serving A` existente).
4. **Classificar** cada item:

   | Classe | Quando | Precisa de resolução |
   |---|---|---|
   | `new` | não casou | não (confirmado em bloco no apply) |
   | `unchanged` | casou, nenhum campo difere | não (só acrescenta a fonte) |
   | `enrich` | casou; só preenche campos vazios, acrescenta tags/aliases/fontes/properties novas | não |
   | `conflict` | casou; campo preenchido difere em `type`, `parent`, `technology`, `description`, `external`, `name`, `accessType`, ou em uma chave de `properties` | sim: `keep` \| `take` \| `value:<x>` |
   | `possible-duplicate` | casamento fuzzy | sim: `same` (vira alias; o item é reclassificado) \| `different` (vira `new`) |
   | `op` | operação explícita | `remove` e `status: retired`: sim (`yes`/`no`); demais: não |

5. **Simular** o resultado assumindo `take` em conflitos, `different` em duplicatas e `yes` em
   ops, e rodar `validateModel`. Erros `E_*` bloqueiam o plano (`blocked: true`, com os erros);
   o apply revalida com as resoluções reais.
6. **Emitir** relatório no terminal (agrupado por classe; `unchanged`/`enrich` só contados) e o
   `plano.json`:

   ```json
   {
     "archlens-plan": "1.0",
     "base": "ARCHITECTURE.md", "baseHash": "sha256:…",
     "delta": { "...delta original..." },
     "items": [
       { "n": 1, "class": "conflict", "target": "loja.pedidos", "field": "technology",
         "base": "Java / Spring Boot", "delta": "Kotlin / Spring Boot", "resolution": null },
       { "n": 2, "class": "possible-duplicate", "target": "orders-service", "candidate": "loja.pedidos",
         "score": 0.82, "why": "mesmo tipo; nome parecido", "resolution": null }
     ],
     "summary": { "new": 3, "unchanged": 10, "enrich": 4, "conflict": 1, "possible-duplicate": 1, "op": 0 },
     "blocked": false
   }
   ```

   `--json` imprime o plano no stdout em vez do relatório.

### Fase 2 — `archlens merge <base.md> --apply <plano.json>`

1. Recusa (`E_PLAN_PENDING`) se houver `resolution: null`; recusa (`E_PLAN_STALE`) se o hash do
   bloco atual da base ≠ `baseHash`.
2. Recalcula a classificação com as resoluções (duplicatas `same` reclassificam o item) e aplica:
   `new` insere; `enrich`/`unchanged` mesclam listas e preenchem vazios; `conflict` segue a
   resolução; ops executam. Toda mudança acrescenta a fonte do delta em `sources`.
3. Revalida; erros `E_*` abortam sem gravar.
4. Se houve alguma mudança efetiva, acrescenta a entrada no `changelog`; se nada mudou, não grava
   entrada (idempotência).
5. Regenera o `ARCHITECTURE.md` completo (preservando blocos `keep`) e grava de forma atômica.
6. Imprime o resumo e uma sugestão de mensagem de commit.

### Papel do agente (SKILL.md)

1. Traduz o prompt (ou, no futuro, o repo) em **delta**, seguindo `references/free-text.md`.
2. Roda `--plan` e mostra o resumo ao usuário.
3. Para cada `conflict`, `possible-duplicate` e op destrutiva, faz **uma pergunta**, com sua recomendação.
4. Preenche as resoluções no plano, roda `--apply`, lê alertas e sugere o commit.

## 3. Documento gerado

Mudanças em `scripts/lib/doc.mjs`:

- Frontmatter: `revision` (nº de entradas do changelog) e `updated` (data da última entrada; na
  falta, data de geração). `generated` permanece como data de geração.
- Nota do topo: "evolua a base com `archlens merge`; edição manual do bloco continua possível".
- Tabelas de elementos: coluna **Status** (só se algum ≠ `active`) e **Fontes** (kinds abreviados
  `P`/`R`/`D`/`M`).
- Nova seção **Fontes**: tabela `tipo | ref | data | itens sustentados`.
- Nova seção **Ciclo de vida**: itens `planned`, `deprecated`, `retired` com `statusReason`.
- Nova seção **Histórico**: últimas 10 entradas (data, fonte, resumo, contagens, decisões); o
  completo fica no JSON.
- **Premissas e inferências**: a coluna "Origem" passa a ler `sources[].excerpt`.
- Round-trip continua: `extractModel(generateDoc(m))` devolve `m` intacto.

## 4. CLI e código

| Arquivo | Mudança |
|---|---|
| `scripts/lib/match.mjs` (novo) | normalização (acentos, caixa, pontuação, sufixos genéricos como api/service/app/sistema) e pontuação de similaridade (tokens + distância de edição) |
| `scripts/lib/merge.mjs` (novo) | `planMerge(baseRaw, delta) → plan`, `applyPlan(baseRaw, plan) → { raw, changelogEntry }`; puro, sem I/O |
| `scripts/lib/model.mjs` | campos `status`, `statusReason`, `sources`, `aliases`; normalização de `source` legado |
| `scripts/lib/validate.mjs` / `registry` | novos códigos |
| `scripts/lib/query-c4.mjs`, `query-archimate.mjs` | filtro de `status` na view |
| `scripts/lib/render.mjs` | estilos `deprecated`/`planned` |
| `scripts/lib/doc.mjs` | seções novas |
| `scripts/archlens.mjs` | comando `merge` (`--plan`, `--apply`, `--json`); `doc`/`build` aceitam o `.md` como entrada e saída no mesmo caminho |
| `scripts/gen-schemas.mjs`, `schemas/` | campos novos em `model.schema.json`; novo `delta.schema.json` e `plan.schema.json` |

## 5. Skill e documentação

- `SKILL.md`: fluxo com dois ramos — **criar** (primeiro delta sobre arquivo inexistente) e
  **enriquecer** (delta → plan → perguntas → apply). Remove "não remodele; edite o JSON".
  Tabela de pedidos ganha "acrescente/atualize/desative X" → delta.
- `references/merge.md` (novo): formato do delta, classes, resoluções, como perguntar ao usuário.
- `references/free-text.md`: passa a produzir delta; `source` → `sources`.
- `references/knowledge-doc.md`: novas seções e regras de edição.
- `references/notation.md`: campos novos.
- `docs/GUIA.md`: seção "Evoluindo a base".
- `examples/telemedicina/`: `delta-01.json` ("o PEP Tasy será substituído por um PEP em nuvem")
  e o `ARCHITECTURE.md` resultante.

## 6. Testes (TDD, `node:test`)

- `tests/match.test.mjs`: normalização; limiar; tipos diferentes nunca são candidatos.
- `tests/merge.test.mjs`:
  - casamento por id, por alias (nos dois sentidos) e fuzzy como `possible-duplicate`;
  - cada classe; relação `uses` casando com `serving` invertido;
  - referências por alias reescritas para o id canônico;
  - `remove` e `status: retired` exigindo resolução; remoção em cascata listada;
  - plano bloqueado por erro de validação; `E_PLAN_PENDING`; `E_PLAN_STALE`;
  - idempotência (segundo apply sem mudança e sem changelog);
  - criação de base a partir de arquivo inexistente.
- `tests/model.test.mjs` / `validate`: `source` legado; `E_STATUS`, `E_ALIAS_CONFLICT`,
  `E_SOURCE`, `W_RETIRED_DEPENDENCY`.
- `tests/query.test.mjs`: filtro de status padrão e explícito.
- `tests/doc.test.mjs`: round-trip com campos novos; seções Fontes, Ciclo de vida, Histórico.
- Regressão: `build` de `loja-online` e `telemedicina` resolve as mesmas visões (mesmos nós e arestas).
- CLI: smoke test de `merge --plan` e `--apply` num diretório temporário.
