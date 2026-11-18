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
| c | Lacunas de visões: nível deployment do C4, mapa de capacidades, foco de negócio projetado no C4, fluxos de eventos entre sistemas | planejado | [P10](roadmap-produto/P10-visoes-que-faltam.md) | — |
| d | Exportações: Structurizr DSL, PlantUML/Mermaid, ArchiMate Open Exchange | planejado | [P11](roadmap-produto/P11-exportacoes.md) | — |
| e | Fonte plugável do modelo canônico: outras pastas, buckets, um gbrain via MCP (novo adaptador do store; campo `store` reservado no manifesto pelo a.3) | detalhado em e.1–e.4 | — | — |
| e.1 | Formato canônico unificado (2.0): tipos ArchiMate + perfil C4 gravado, hierarquia plana por `parent`, relações só ArchiMate, banco como `application-component`, propriedades com catálogo, `migrate` 1.x → 2.0, C4 derivado através de serviços, aninhamento visual no ArchiMate (`nesting`) | feito | [spec](specs/2026-10-17-canonical-format-design.md) · [plano](plans/2026-10-17-canonical-format.md) | PR #13 → `develop-v2` |
| e.2 | Contrato de conector (store v2): subgrafos, gravação por operações atômicas, versão otimista, histórico no store; conectores `model.json` (padrão) e pasta com um markdown por nó | feito | [spec](specs/2026-10-17-store-connectors-design.md) · [plano](plans/2026-10-17-store-connectors.md) | PR #14 → `develop-v2` |
| e.3 | Três skills sobre uma biblioteca comum, com `plan`/`apply`/`query`: plan (→ plano final resolvido contra o canônico, com prévia), apply (grava o plano final) e query (→ diagramas ou markdown) | feito | [spec](specs/2026-10-18-plan-apply-query-design.md) · [plano](plans/2026-10-18-plan-apply-query.md) | PR #15 → `develop-v2` |
| e.4 | Conectores remotos: gbrain, neo4j, banco relacional, bucket S3 (um ciclo por conector) | detalhado em e.4.1–e.4.4 | — | — |
| e.4.1 | Base compartilhada no gbrain: versão por objeto (conjunto de leitura e de escrita, duplicata criada em paralelo, rodada numerada ao gravar), `archlens init`, conector `gbrain` nos modos git (commit por apply) e MCP (o agente chama as ferramentas; `remote pull`/`check`, `apply --read-check/--receipts/--resume/--undo`), `store convert` para o gbrain | feito | [spec](specs/2026-10-18-gbrain-connector-design.md) · [plano](plans/2026-10-18-gbrain-connector.md) | PR #18 → `develop-v2` |
| e.4.2 | Conector neo4j | planejado | [P12](roadmap-produto/P12-conectores-remotos.md) | — |
| e.4.3 | Conector relacional | planejado | [P12](roadmap-produto/P12-conectores-remotos.md) | — |
| e.4.4 | Conector S3 | planejado | [P12](roadmap-produto/P12-conectores-remotos.md) | — |
| f | archlens-ask: consulta à base no gbrain para assistentes sem execução de código (M365 Copilot, Claude Desktop), em pacote de texto derivado do archlens completo (`portable/archlens-ask/`), com markdown e Mermaid | feito | [spec](specs/2026-10-25-archlens-ask-design.md) · [plano](plans/2026-10-25-archlens-ask.md) | PR #21 → `develop-v2` |
| g | GUI web (`apps/gui/`, `archlens serve`): explorar a base no navegador (diagrama, explorador, cartão do elemento, trilha, menu de contexto) e busca em texto com LLM (Anthropic ou compatível com OpenAI) | feito | [spec](specs/2026-10-28-archlens-gui-design.md) · planos [fase 1](plans/2026-10-29-archlens-gui-fase-1.md) e [fase 2](plans/2026-10-29-archlens-gui-fase-2.md) | PRs #24 e #26 → `develop-v2` |
| g.1 | Lançadores: `bin/archlens` e `bin/archlens.cmd`, para chamar a CLI sem `npm link` | feito | [plano](plans/2026-11-03-archlens-lancadores.md) | PR #30 → `develop-v2` |
| g.2 | Planejar pela GUI: chat que monta o delta, decisões por botões, prévia, anexar repositório e Aplicar | feito | [spec](specs/2026-11-03-gui-planejar-design.md) · [plano](plans/2026-11-03-gui-planejar.md) | PR #33 → `develop-v2` |
| g.3 | Documentação do nó: texto em markdown por elemento, na base, no HTML gerado e na GUI | feito | [spec](specs/2026-11-04-documentacao-do-no-design.md) · [plano](plans/2026-11-04-documentacao-do-no.md) | PR #34 → `develop-v2` |
| g.4 | Painel do nó e edição pela tela (propriedades e documentação), no Planejar e no Navegar; logo e avisos | feito | specs [painel](specs/2026-11-09-painel-do-no-e-edicao-no-planejar-design.md) e [navegar editável](specs/2026-11-09-navegar-editavel-logo-avisos-design.md) · planos [painel](plans/2026-11-09-painel-do-no-e-edicao-no-planejar.md) e [navegar editável](plans/2026-11-10-navegar-editavel-logo-avisos.md) | PR #36 → `develop-v2` |
| g.5 | GUI: Agrupar na barra, notação estável, espera por visão e etapas do Aplicar | feito | [spec](specs/2026-11-10-gui-notacao-carregamento-aplicar-design.md) · [plano](plans/2026-11-10-gui-notacao-carregamento-aplicar.md) | PR #37 → `develop-v2` |
| h | Roadmap de produto: análise de arquitetura, segurança e manutenção, e os planos P00 a P18 | em andamento | [análise e ordem](roadmap-produto/README.md) | PRs #38 e #39 → `develop-v2`; andamento na seção abaixo |

Débito técnico registrado: [latência dos diagramas](specs/2026-10-28-diagram-latency-tech-debt.md) (medição de
outubro; as propostas entram no P05).

## Roadmap de produto (P00 a P18)

O que vem depois dos itens acima está em [`roadmap-produto/`](roadmap-produto/README.md): a análise, a ordem
sugerida e um brief por plano. Andamento:

| Plano | Entrega | Status | Spec / plano | Entrega |
|---|---|---|---|---|
| [P01](roadmap-produto/P01-ci-e-suite-verde.md) | CI no GitHub Actions, lint, fixtures congeladas | feito | [spec](specs/2026-11-15-ci-e-suite-vigiada-design.md) | PR #40 → `develop-v2` |
| [P07](roadmap-produto/P07-hardening-da-gui.md) | Isolamento do diagrama, CSP, clone sem rede interna, modelo de ameaças | feito | [spec](specs/2026-11-16-hardening-da-gui-design.md) · [plano](plans/2026-11-16-hardening-da-gui.md) | commits `376be8d`…`74850f1` em `develop-v2` |
| [P14](roadmap-produto/P14-distribuicao-release-e-docs.md) | Release automatizado, este roadmap em dia, documentação por público | feito | [spec](specs/2026-11-18-release-e-documentacao-design.md) · [plano](plans/2026-11-18-release-e-documentacao.md) | PR #41 → `develop-v2` |
| [P05](roadmap-produto/P05-performance-e-escala.md) | Benchmarks e orçamentos de tempo (a parte de medição) | a seguir | — | — |
| [P00](roadmap-produto/P00-linhas-v0-e-v1.md) | Abertura da linha v1 | depois da Fase 0 (P05 e P14) | — | — |
| P02, P03, P04, P06, P08 a P13, P15 a P18 | Linha v1 e depois | não iniciados | [ordem e dependências](roadmap-produto/README.md) | — |

## Pendências registradas

- `planned` e `inferred` usam tracejados parecidos e se confundem na tela.
- `build` sempre regrava o `ARCHITECTURE.md` (a data `generated:` gera ruído no git). → resolvido pelo a.3 (documento determinístico).
- `ARCHITECTURE.md` escrito à mão (sem bloco `archlens-json`): a mensagem de erro não orienta o que fazer; resolvido pelo a.3 (`E_STORE_NOT_BASE` orienta a tratar como texto livre).
- Base única em um arquivo: dividir por domínio quando a base crescer. → o a.3 aceita `layout.model: "model/"`.
- Do PR #6: `?` pendente na relação errada quando um delta remove várias paralelas; pendências de visão sem marca visual; esboço esconde o tracejado de `planned`/`inferred`; botões de exportar do artefato; consumidores de tópicos fora do impacto do produtor (`flow`); trocar uma relação por duas paralelas exige duas rodadas.
