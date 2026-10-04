# Changelog

Mudanças relevantes do archlens, por versão. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- **Leitura de repositórios** (`archlens scan`): pasta local ou URL git vira um delta com proveniência
  (`kind: repo`, `ref <url|caminho>@commit`, arquivo e linha). Lê docker-compose, Kubernetes, Helm (opcionalmente
  renderizado com `--helm-render`), Terraform, OpenAPI, AsyncAPI, manifestos de build e a saída do graphify
  (módulos, fluxos, conceitos de negócio e comunidades). O papel do repositório é sempre perguntado: serviço
  (container / application component) ou sistema com os deployáveis como containers; a base vem de `--base`, e o
  sistema nunca é presumido pelo nome do repositório.
- Correlação entre repositórios: produtor e consumidor de um tópico viram fluxo; placeholders `ext.*` criados por
  um repositório são assumidos pela leitura do repositório real; nova leitura não duplica e acompanha o commit
  mais recente; o que sumiu vira pergunta.

## [0.2.0] — pré-release

A base de conhecimento passa a evoluir por rodadas, sem ser refeita a cada prompt, e ganha uma fonte de verdade
separada do documento.

### Adicionado

- **Evolução incremental da base** (#5): cada informação nova vira um delta que passa por
  `merge --plan` → perguntas → `merge --apply`. Inclui casamento de entidades (id, alias, nome parecido), conflitos
  campo a campo, proveniência por item (`sources`), ciclo de vida (`planned`, `active`, `deprecated`, `retired`) e
  histórico de rodadas.
- **Rascunho e prévia** (#6): status `draft` com notação de esboço à mão (rough.js, hachura no estilo Sketch do
  draw.io) e diagramas gerados a partir de um delta ou plano ainda não aplicado, com marcadores `+ ~ − ?` e itens
  removidos como fantasmas. A prévia nunca grava a base.
- **Agrupamentos e molduras** (#8): elemento `grouping` com membros pelo campo `group`; visões recortadas por
  agrupamento (`groups.only`, `crossOnly`); molduras no C4 e no ArchiMate (uma por grupo e camada), ligadas ou
  desligadas pela visão.

### Mudado

- **Modelo canônico fora do `ARCHITECTURE.md`** (#7): a fonte de verdade fica na pasta `architecture/` (manifesto,
  `model.json` ou `model/*.json`, visões, histórico, notas), atrás de uma camada de armazenamento. O
  `ARCHITECTURE.md` passa a ser 100% gerado e determinístico. Novos comandos `archlens migrate` (converte bases no
  formato antigo) e `archlens check` (documento em dia, para CI e pre-commit). Bases antigas continuam legíveis.
- Exemplos `loja-online` e `telemedicina` migrados para `architecture/`.

## [0.1.0] — 2026-10-04

Primeira versão: arquitetura como modelo (ArchiMate 3.2 com perfil C4), diagramas como consultas.

### Adicionado

- Entrada em texto livre ou DSL JSON; `ARCHITECTURE.md` como base de conhecimento.
- Visões C4 (landscape, context, container, component, dynamic) com `focus`/`depth`, elevação de relações,
  notação de mensageria e `expand` multi-sistema (#1).
- Visões ArchiMate por camada, travessia de suporte, matriz de impacto, derivação e granularidade C4; layouts
  ortogonais `flow`, `bands`, `bands-flow` com escolha automática (#4).
- Relações explicadas em português, HTML animado num arquivo único, checagem visual com screenshots.
- `\n` força quebra de linha em nomes; `expand` no schema da visão (#2). Zoom/pan na tela inteira (#3).

[Não lançado]: https://github.com/expersoft/archlens/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/expersoft/archlens/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/expersoft/archlens/releases/tag/v0.1.0
