# Roadmap do archlens

Objetivo: o `ARCHITECTURE.md` como **base de conhecimento perene** de arquitetura (corporativa, de
soluções e de aplicações), montada e lapidada por prompts e pela leitura de repositórios; e, a partir
dela, **visões C4 e ArchiMate** geradas sob demanda (panoramas ou recortes por aplicação, funcionalidade
de negócio ou produto).

Cada item tem o próprio spec e o próprio plano (`docs/superpowers/specs/`, `docs/superpowers/plans/`).

| # | Item | Status | Spec / plano | Entrega |
|---|---|---|---|---|
| a | Evolução incremental da base: delta → plano → apply, casamento de entidades, conflitos, proveniência, ciclo de vida, histórico | feito | [spec](specs/2026-09-30-kb-evolucao-design.md) · [plano](plans/2026-09-30-kb-evolucao.md) | PR #5 → `develop-v2` |
| a.1 | Rascunho e prévia: status `draft`, notação de esboço, diagramas a partir de deltas não mergeados | em andamento | [spec](specs/2026-09-30-kb-preview-design.md) | branch `feat/kb-preview` |
| b | Leitura de repositórios: extrair deltas de docker-compose, k8s/Helm, Terraform, OpenAPI/AsyncAPI, filas/tópicos e dependências entre serviços | próximo | — | — |
| c | Lacunas de visões: nível deployment do C4, mapa de capacidades, foco de negócio projetado no C4, fluxos de eventos entre sistemas | depois | — | — |
| d | Exportações: Structurizr DSL, PlantUML/Mermaid, ArchiMate Open Exchange | depois | — | — |

## Pendências registradas

- `planned` e `inferred` usam tracejados parecidos e se confundem na tela.
- `build` sempre regrava o `ARCHITECTURE.md` (a data `generated:` gera ruído no git).
- `ARCHITECTURE.md` escrito à mão (sem bloco `archlens-json`): a mensagem de erro não orienta o que fazer; tratar junto com o item (b).
- Base única em um arquivo: dividir por domínio quando a base crescer.
