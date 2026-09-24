# archlens — Plano de implementação

**Objetivo:** skill que transforma texto livre ou uma DSL JSON em um modelo de arquitetura
persistente (metamodelo ArchiMate, com perfil C4), gera um `ARCHITECTURE.md` como base de
conhecimento e extrai visões C4 e ArchiMate renderizadas em HTML animado.

**Arquitetura:** pipeline determinístico em Node (sem dependências em runtime além do ELK vendorizado):

```
model.json | ARCHITECTURE.md ─► load/normalize ─► validate ─► query (view spec → view IR)
                                                              └► layout (ELK) ─► render (SVG+HTML)
                             └► doc (ARCHITECTURE.md, com bloco canônico archlens-json)
```

**Decisões (confirmadas pelo usuário):** renderer próprio; ArchiMate como metamodelo interno; ELK para layout.

## Tarefas

| # | Módulo | Teste primeiro (node:test) | Critério |
|---|--------|---------------------------|----------|
| 1 | `lib/registry.mjs` | tipos ArchiMate/C4, mapeamento C4→ArchiMate | todos os tipos da spec 3.2 com camada e aspecto |
| 2 | `lib/model.mjs` | achatar `children`, resolver `c4:*`, normalizar `uses` | `uses` vira `serving` invertido ou `access` |
| 3 | `lib/validate.mjs` | códigos E_/W_ estáveis | ids duplicados, refs, hierarquia C4, matriz simplificada |
| 4 | `lib/query-c4.mjs` | landscape/context/container/component/dynamic, foco, elevação | arestas elevadas agregadas |
| 5 | `lib/query-archimate.mjs` | viewpoints, supporters/dependents/both, derivação, collapse, matriz | cadeia produto→tecnologia completa |
| 6 | `lib/doc.mjs` | geração + extract ida-e-volta + blocos keep | `extract(doc(m)) == m` |
| 7 | `lib/layout.mjs` | coordenadas absolutas, bandas por camada | ELK com partições por camada |
| 8 | `lib/render.mjs` | HTML autocontido com nós/arestas/matriz | trace, story, impact pulse, layer reveal, tema, export |
| 9 | `archlens.mjs` CLI | smoke test dos comandos | `validate/doc/extract/views/resolve/render/build` |
| 10 | SKILL.md + references + guia | — | revisão manual |
| 11 | Exemplos | build de todos os exemplos sem erros | inspeção visual (screenshots) |

## Verificação

- `npm test` verde.
- `node scripts/archlens.mjs build examples/<x>/model.json` para cada exemplo, sem erros.
- Screenshots headless de cada HTML inspecionados antes de declarar concluído.
