# Roadmap do archlens

Objetivo: o `ARCHITECTURE.md` como **base de conhecimento perene** de arquitetura (corporativa, de
soluções e de aplicações), montada e lapidada por prompts e pela leitura de repositórios; e, a partir
dela, **visões C4 e ArchiMate** geradas sob demanda (panoramas ou recortes por aplicação, funcionalidade
de negócio ou produto).

Cada item tem o próprio spec e o próprio plano (`docs/superpowers/specs/`, `docs/superpowers/plans/`).

| # | Item | Status | Spec / plano | Entrega |
|---|---|---|---|---|
| a | Evolução incremental da base: delta → plano → apply, casamento de entidades, conflitos, proveniência, ciclo de vida, histórico | feito | [spec](specs/2026-09-30-kb-evolucao-design.md) · [plano](plans/2026-09-30-kb-evolucao.md) | PR #5 → `develop-v2` |
| a.1 | Rascunho e prévia: status `draft`, notação de esboço, diagramas a partir de deltas não mergeados | feito | [spec](specs/2026-09-30-kb-preview-design.md) · [plano](plans/2026-09-30-kb-preview.md) | PR #6 → `develop-v2` |
| a.2 | Agrupamentos e molduras (C4 e ArchiMate): `grouping` + `group` nos membros, recorte `groups.only`/`crossOnly`, molduras ligadas pela visão (resolve agrupadores do prompt virando sistemas) | feito | [spec](specs/2026-10-02-kb-groups-design.md) · [plano](plans/2026-10-02-kb-groups.md) | PR #8 → `develop-v2` |
| a.3 | Modelo canônico fora do `ARCHITECTURE.md`: pasta `architecture/` (manifesto, `model.json` ou `model/*.json`, visões, histórico, notas) atrás de uma camada de armazenamento; `ARCHITECTURE.md` 100% gerado; `check` e `migrate` | feito | [spec](specs/2026-10-01-kb-store-design.md) · [plano](plans/2026-10-01-kb-store.md) | PR #7 → `develop-v2` |
| b | Leitura de repositórios (`archlens scan`): graphify, docker-compose, Kubernetes/Helm, Terraform, OpenAPI/AsyncAPI e build → inventário com arquivo e linha → delta com proveniência; papel do repositório sempre perguntado; correlação por tópicos e chamadas; o que sumiu vira pergunta | feito | [spec](specs/2026-10-03-repo-reading-design.md) · [plano](plans/2026-10-03-repo-reading.md) | PR #10 → `develop-v2` |
| c | Lacunas de visões: nível deployment do C4, mapa de capacidades, foco de negócio projetado no C4, fluxos de eventos entre sistemas | depois | — | — |
| d | Exportações: Structurizr DSL, PlantUML/Mermaid, ArchiMate Open Exchange | depois | — | — |
| e | Fonte plugável do modelo canônico: outras pastas, buckets, um gbrain via MCP (novo adaptador do store; campo `store` reservado no manifesto pelo a.3) | detalhado em e.1–e.4 | — | — |
| e.1 | Formato canônico unificado (2.0): tipos ArchiMate + perfil C4 gravado, hierarquia plana por `parent`, relações só ArchiMate, banco como `application-component`, propriedades com catálogo, `migrate` 1.x → 2.0, C4 derivado através de serviços, aninhamento visual no ArchiMate (`nesting`) | feito | [spec](specs/2026-10-17-canonical-format-design.md) · [plano](plans/2026-10-17-canonical-format.md) | PR #13 → `develop-v2` |
| e.2 | Contrato de conector (store v2): subgrafos, gravação por operações atômicas, versão otimista, histórico no store; conectores `model.json` (padrão) e pasta com um markdown por nó | feito | [spec](specs/2026-10-17-store-connectors-design.md) · [plano](plans/2026-10-17-store-connectors.md) | PR #14 → `develop-v2` |
| e.3 | Três skills sobre uma biblioteca comum, com `plan`/`apply`/`query`: plan (→ plano final resolvido contra o canônico, com prévia), apply (grava o plano final) e query (→ diagramas ou markdown) | feito | [spec](specs/2026-10-18-plan-apply-query-design.md) · [plano](plans/2026-10-18-plan-apply-query.md) | PR #15 → `develop-v2` |
| e.4 | Conectores remotos: neo4j, gbrain (MCP), bucket S3, banco relacional | depois de e.2 | — | — |

## Pendências registradas

- `planned` e `inferred` usam tracejados parecidos e se confundem na tela.
- `build` sempre regrava o `ARCHITECTURE.md` (a data `generated:` gera ruído no git). → resolvido pelo a.3 (documento determinístico).
- `ARCHITECTURE.md` escrito à mão (sem bloco `archlens-json`): a mensagem de erro não orienta o que fazer; resolvido pelo a.3 (`E_STORE_NOT_BASE` orienta a tratar como texto livre).
- Base única em um arquivo: dividir por domínio quando a base crescer. → o a.3 aceita `layout.model: "model/"`.
- Do PR #6: `?` pendente na relação errada quando um delta remove várias paralelas; pendências de visão sem marca visual; esboço esconde o tracejado de `planned`/`inferred`; botões de exportar do artefato; consumidores de tópicos fora do impacto do produtor (`flow`); trocar uma relação por duas paralelas exige duas rodadas.
