# P10 — Visões que faltam e defeitos de visão

**Trilha:** Funcional · **Tamanho:** G · **Depende de:** P01 · **Item do roadmap:** c

## Objetivo

Completar o conjunto de visões prometido no roadmap e corrigir os defeitos de visão já registrados.

## Evidência

- `docs/superpowers/roadmap.md`, item c, status "depois", sem spec: nível **deployment** do C4, **mapa de
  capacidades**, **foco de negócio projetado no C4**, **fluxos de eventos entre sistemas**.
- Visões C4 atuais: landscape, context, container, component, dynamic (`scripts/lib/query-c4.mjs`). ArchiMate:
  camadas, suporte, impacto (`scripts/lib/query-archimate.mjs`).
- A leitura de repositórios já extrai infraestrutura (compose, Kubernetes/Helm, Terraform) e tópicos
  (AsyncAPI) em `scripts/lib/scan/`, mas não há visão que mostre onde cada container roda.
- **Defeito:** com `granularity: "system"`, a realização de um serviço por um container não sobe para o sistema-pai
  (`tele.api` realiza `as-agenda`, e `tele` não aparece ligado a ele). Descrito em
  `docs/superpowers/specs/2026-10-28-diagram-latency-tech-debt.md`, "Achado lateral".
- **Pendências registradas** no fim do `roadmap.md`: `planned` e `inferred` com tracejados parecidos; `?` na relação
  errada quando um delta remove várias paralelas; pendências de visão sem marca visual; esboço esconde o tracejado de
  `planned`/`inferred`; consumidores de tópicos fora do impacto do produtor (`flow`); trocar uma relação por duas
  paralelas exige duas rodadas.

## Escopo

Um ciclo por item, nesta ordem sugerida:

1. **Defeitos primeiro:** a elevação por granularidade, com teste que reproduz o caso de `examples/telemedicina`, e
   as pendências do roadmap que forem defeito de desenho.
2. **Deployment (C4):** nós de implantação, ambientes, instâncias de container, a partir dos elementos de tecnologia
   do ArchiMate (`node`, `system-software`, `artifact`) que a base já aceita.
3. **Fluxos de eventos:** produtores, tópicos e consumidores entre sistemas, incluindo o impacto de um produtor sobre
   seus consumidores.
4. **Mapa de capacidades:** capacidades de negócio em níveis, com mapa de calor por um atributo (sistemas que
   sustentam, ciclo de vida).
5. **Foco de negócio no C4:** a partir de um produto, processo ou capacidade, o recorte C4 dos sistemas e containers
   que o sustentam.

Para cada visão: spec de visão no schema (`schemas/view.schema.json`), resolução, layout, render, sugestão automática
(`scripts/lib/suggest.mjs`), resposta em markdown (`query-md.mjs`), exemplo em `examples/` e documentação em
`references/views.md` e `docs/GUIA.md`.

## Fora do escopo

Exportar as visões novas para outros formatos (P11 acompanha depois). Novos extratores de repositório.

## Critérios de aceite

- Cada visão nova tem exemplo que passa na checagem visual do `deliver` (largura ≥ 90%, fonte ≥ 14 px) nos dois viewports.
- O caso de `granularity: "system"` tem teste que falhava antes e passa depois.
- A GUI lista as visões novas no Explorador e as ações de navegação fazem sentido para elas.
- `npm run check-ask` passa, com `REFERENCE.md`, regras e exemplos do archlens-ask atualizados.

## Decisões a fechar no brainstorm

- Deployment: o metamodelo atual basta ou precisa de tipos, propriedades ou um conceito de ambiente novos. Mudança de
  formato é cara (migração, conectores, archlens-ask): prefira o que já existe.
- Mapa de capacidades: o tipo `capability` do ArchiMate já é aceito? Como entra o atributo do mapa de calor.
- Se "foco de negócio no C4" é uma visão nova ou um parâmetro das visões C4 existentes (`anchor` de negócio).
- Ordem real de prioridade entre as quatro visões, com o dono.

## Obrigações do repositório

Este plano toca **tudo** que o archlens-ask copia (tipos, travessia, derivação, granularidade, specs de visão, níveis
C4, viewpoints). Em cada PR: `npm run ask`, atualizar à mão `INSTRUCTIONS.md` (limite de 8000 caracteres),
`RULES.md`, `EXAMPLES.md`, e `eval/perguntas.json` se o resultado de alguma pergunta mudar. Mudança em
`references/views.md` pede `npm --prefix apps/gui run prompt`. `npm run gui:test` sempre.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P10-visoes-que-faltam.md`, `references/views.md` e
> `references/notation.md`. Este plano é uma fila de ciclos: comece pelo defeito de granularidade com
> `superpowers:systematic-debugging` e um teste que reproduz. Para as visões novas, faça um brainstorm por visão.
