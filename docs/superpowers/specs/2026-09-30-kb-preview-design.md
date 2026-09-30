# Rascunho e prévia de deltas (status `draft`, notação de esboço, pré-visualização)

- **Data:** 2026-09-30
- **Branch:** `feat/kb-preview` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito
- **Depende de:** [evolução incremental da base](2026-09-30-kb-evolucao-design.md) (merge, proveniência, ciclo de vida, histórico), já mergeado em `develop-v2`
- **Roadmap:** item (a.1) de [`docs/superpowers/roadmap.md`](../roadmap.md)

## Contexto e objetivo

A base (`ARCHITECTURE.md`) evolui por deltas: `merge --plan` → perguntas → `merge --apply`. Hoje, para
ver o efeito de um delta num diagrama, é preciso aplicá-lo, e aí ele já está na base oficial. Também
não há como manter na base um item "em discussão": `planned` significa decidido.

**Objetivo:** (1) avaliar visualmente uma mudança **antes** de integrá-la, gerando diagramas a partir
de um delta (ou de um plano parcialmente respondido) sem gravar nada na base; (2) ter um status
persistente `draft` para itens já na base mas ainda em discussão; (3) uma notação de rascunho
inconfundível com as atuais.

### Decisões do usuário

| Tema | Decisão |
|---|---|
| O que é rascunho | Itens de um **delta não mergeado** (na prévia) **e** um novo status persistente **`draft`** na base |
| Notação | **Esboço à mão**: preenchimento esmaecido, contorno duplo tremido, texto na cor da borda |
| Decisões pendentes na prévia | Aceita **delta** (pendências assumem o padrão do plano) **ou plano** (usa as respostas dadas); pendências marcadas com `?` |
| Removidos na prévia | **Fantasma riscado**: continuam no diagrama, esmaecidos e riscados, com as relações que caem junto |
| Abordagem | **Reutilizar o motor do merge**: a prévia roda o mesmo `planMerge`, compara base × resultado e marca as mudanças |
| Escopo temporal dos marcadores | `+ ~ − ?` e fantasmas existem **só na prévia**; depois do merge, cada item volta à notação normal do seu status |

### Critérios de sucesso

1. Para o mesmo delta e as mesmas respostas, o modelo exibido na prévia (sem os fantasmas) é idêntico
   ao que `merge --apply` gravaria.
2. A prévia nunca grava nem altera o `ARCHITECTURE.md`.
3. Novo, alterado, removido/retired e decisão pendente são distinguíveis num screenshot 1920×1080, em C4
   e em ArchiMate, sem se confundir com `planned`, `inferred` ou `deprecated`.
4. Bases e visões existentes resolvem igual (nenhum `draft` → nada muda).

### Fora do escopo

Comparação entre duas revisões já mergeadas da base; resolver a semelhança visual entre `planned` e
`inferred` (registrada como pendência); leitura de repositórios (item b do roadmap).

## 1. Status `draft` e notação de esboço

### Modelo

- `STATUSES = ['draft', 'planned', 'active', 'deprecated', 'retired']`. `draft` = em discussão, não
  decidido; vale para elementos e relações.
- Entra e sai por `ops: [{ "op": "status", "status": "draft" }]` ou pelo campo `status` no delta, como
  os demais. Só `retired` continua exigindo confirmação (`yes`/`no`).
- Filtro padrão das visões inalterado ("todos menos `retired`"): `draft` aparece por padrão. Receitas:
  as-is `["active","deprecated"]`; to-be `["draft","planned","active"]` (ou sem `draft` para só o decidido).
- `W_RETIRED_DEPENDENCY` inalterado; `draft` não gera aviso.
- `ARCHITECTURE.md`: a seção "Ciclo de vida" lista `draft`; a coluna Status aparece quando houver `draft`.
- Schemas (`model`, `delta`, `view`) aceitam `draft` via `STATUSES`.

### Notação (C4 e ArchiMate)

- Dois filtros SVG definidos uma vez por página: `feTurbulence` (`fractalNoise`, `baseFrequency` ≈ 0,035
  e 0,04, `numOctaves` 2, sementes distintas) + `feDisplacementMap` (`scale` ≈ 5).
- Classe **`sketch`** (esboço): preenchimento da cor do tipo com opacidade ≈ 0,22; contorno duplo — um traço
  de 2px com o primeiro filtro e um de 1,2px levemente deslocado com o segundo —; texto na cor da borda.
- Nó com `status: draft` → `sketch`, sem marcador. Relação `draft` → linha com o filtro de esboço.
- Legenda da página: entrada "rascunho (draft)". Painel: "Rascunho: em discussão" + `statusReason`.
- Exportação SVG/PNG carrega os `defs` dos filtros (verificado por teste).
- `planned` (tracejado largo) e `inferred` (tracejado curto) inalterados.

## 2. Motor da prévia

### `scripts/lib/preview.mjs` (puro, sem I/O)

```js
previewModel(baseRaw, { delta } | { plan }) → {
  raw,      // base + delta aplicados, com removidos re-inseridos como fantasmas
  changes,  // Map<id, { kind: 'added'|'changed'|'removed'|'retired', fields?: [{ field, before, after }] }>
  pending,  // Map<id, planItem[]> — perguntas ainda sem resposta, por elemento ou relação
  plan,     // o plano usado (banner e relatório)
}
```

1. **Merge.** Novo export `previewMerge(baseRaw, delta, { answers })` em `merge.mjs`: roda o mesmo
   `runMerge` em modo plano e devolve `{ raw, plan, idMap }` sem as recusas do apply. `--delta`: pendências
   assumem o padrão (`take`/`different`/`yes`). `--plan`: usa o delta contido no plano e as respostas
   dadas (`answers`), com o padrão só nas que faltam.
2. **Plano bloqueado** (`blocked: true`) → a prévia é recusada com os mesmos erros de `merge --plan`.
3. **Diff base × resultado por id**, usando o `idMap` do merge (duplicata `same` e aliases não viram
   removido + criado):
   - `added`: id inexistente na base;
   - `removed`: id da base ausente no resultado → re-inserido como fantasma sob o mesmo pai; relações
     que caíram junto re-inseridas e marcadas `removed`;
   - `retired`: status passou a `retired` neste delta;
   - `changed`: campo relevante diferente (`name`, `type`, `description`, `technology`, `external`,
     `parent`, `status`, `statusReason`, `tags`, `aliases`, `properties`, `owner`, `url`; **não** `sources`),
     com a lista `fields`;
   - relações: mesma lógica, pelo id canônico (`relIds` do merge).
4. **Pendências:** cada item do plano com `resolution: null` cuja condição `when` se aplica é associado ao
   alvo; `possible-duplicate` aparece no item novo e no candidato da base.

### Visões na prévia

- Visões da base + as trazidas pelo delta; `--view` / `--spec` como hoje.
- Itens `removed`/`retired` neste delta ficam visíveis como fantasmas mesmo que o filtro de status da visão
  esconda `retired`; o resto segue o filtro normal.
- Visão que a mudança quebra (ex.: `scope` removido) é pulada com aviso no relatório da prévia; as demais
  são geradas.

## 3. CLI, renderização e documentação

### CLI

- `render`, `deliver`, `build` aceitam `--delta <d.json>` **ou** `--plan <p.json>`; os dois juntos → erro.
- Em modo prévia, `build` gera só HTML + screenshots, **nunca** o `ARCHITECTURE.md`; nome padrão
  `<delta|plano>-preview.html`.
- `resolve --delta/--plan` imprime o IR com `change` e `pending`; `views --delta/--plan` lista as visões.
- Resumo no terminal: `prévia de delta-01.json: +4 ~2 −1, 2 decisões pendentes`, mais visões puladas.

### Renderização (`render.mjs`)

- Nós do IR ganham `change` e `pending`; arestas ganham `change`.
- Classes: `ch-added` (esboço + marcador `+`), `ch-changed` (forma oficial + contorno de esboço externo
  + `~`), `ch-removed` / `ch-retired` (forma esmaecida, riscada em esboço vermelho, `−`), `pending`
  (marcador amarelo `?`, ao lado do outro). Marcadores no canto superior direito.
- Painel: diferença campo a campo (alterado); o que sai junto (removido); a pergunta, a resposta assumida
  e as alternativas (pendente).
- Banner fixo "PRÉVIA · não é a base oficial" com fonte e resumo do delta, visível também no modo
  apresentação (`P`) e nos screenshots. Legenda: seção "mudanças da prévia".

### Skill e documentação

- `SKILL.md`: passo "mostre a prévia" entre planejar e perguntar (sugerir gerar a visão afetada); tabela
  de pedidos: "como fica se aplicarmos isso?" → `deliver --delta`; "e se eu responder X?" → `deliver --plan`.
- `references/merge.md`, `references/views.md`: prévia, marcadores, `draft`. `references/notation.md`: `draft`.
- `docs/GUIA.md` e `README.md`: um parágrafo cada.
- `examples/telemedicina/delta-02.json` (só para prévia, não mergeado) com um item novo, um alterado, um
  removido e uma duplicata pendente; `delta-02-preview.html` gerado.

## 4. Testes (TDD, `node:test`)

- `tests/preview.test.mjs`: cada `kind`; duplicata `same` não vira removido+criado; fantasma re-inserido no
  pai certo; relações removidas junto; pendência nos dois lados da duplicata; `--plan` usa respostas; plano
  bloqueado recusado; **prévia sem fantasmas ≡ resultado do apply** (mesmo delta, mesmas respostas); base de
  entrada não mutada.
- `query` / `render`: `draft` visível por padrão; classes `ch-*`, `pending`, `st-draft` no HTML; fantasmas
  visíveis com o filtro padrão; exportação contém os filtros SVG.
- `cli`: `build --delta` não toca o `ARCHITECTURE.md`; `--delta` + `--plan` recusado; visão quebrada pulada
  com aviso.
- `model` / `validate` / schemas: `draft` aceito.
- Regressão: visões de `loja-online` e `telemedicina` resolvem igual.
