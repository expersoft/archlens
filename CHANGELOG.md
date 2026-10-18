# Changelog

Mudanças relevantes do archlens, por versão. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Mudado (incompatível)

- **O `SKILL.md` da raiz saiu**: a skill única virou três (`skills/archlens-plan`, `archlens-apply`, `archlens-query`).
  Quem tem `~/.claude/skills/archlens → <repo>` troca o link: instale o plugin ou use
  `ln -s <repo>/skills/archlens-* ~/.claude/skills/`.
- **Formato canônico 2.0**: a base guarda tipos ArchiMate, o perfil C4 em `c4.kind`, uma lista plana com `parent` e só
  relações ArchiMate. `c4:*`, `uses` e `children` continuam aceitos na entrada (prompt, delta, scan) e são traduzidos.
  Bases 1.x são recusadas com `E_STORE_FORMAT`; `archlens migrate <base>` converte, conferindo que o modelo não muda
  de sentido. Bancos de dados passam a ser `application-component` com a tag `database`.

### Adicionado

- **`archlens plan` / `apply` / `show`**: `plan` compara o delta com a base e grava um plano (aberto, com perguntas, ou
  final); `plan --answers` reaproveita as respostas; `apply` grava um plano final; `show` imprime o relatório. O **plano
  final carrega as operações do store** e a versão da base, e o `apply` recusa se a base mudou. `merge` segue como atalho.
- **`archlens query`**: responde em markdown (padrão) ou JSON (`--format`) a uma visão ou spec, e `--element <id>` dá o
  cartão do elemento (pai, filhos, relações, fontes, rodadas; `--depth` inclui o que está em volta).
- **Prévia de plano final**: `render`/`deliver`/`build`/`resolve`/`views` com `--plan <plano.json>` desenham a base com o plano, aberto ou final, já aplicado (sem gravar).
- **Plugin com três skills** (`archlens-plan`, `archlens-apply`, `archlens-query`) em `.claude-plugin/`; exemplo em
  `examples/telemedicina/plano-02*.json`.
- **Conector `markdown`**: a base vira um vault (uma pasta por tipo ArchiMate, um `.md` por elemento) que abre no Obsidian;
  escolhido por `store.kind` no `archlens.json`. Exemplo em `examples/loja-online-vault/`.
- **Contrato de conector** com gravação por operações atômicas e versão do conteúdo (`E_STORE_CONFLICT` quando a base muda
  entre o plano e o `--apply`); os conectores `json` e `markdown` dão a mesma versão para a mesma base.
- `archlens store convert <base> --to markdown|json`: troca o conector da base na mesma pasta, sem mudar a versão nem
  apagar arquivos que a base não possui.
- **Schema pack do gbrain** (`gbrain-pack.yaml`) gerado na base `markdown`.
- Propriedades do usuário com listas de texto e catálogo opcional no `archlens.json` (`W_PROPERTY`).
- C4 gerado de modelos ArchiMate: setas derivadas através de serviços, interfaces e funções de aplicação.
- Aninhamento visual nas visões ArchiMate (`"nesting": "nested"`, com `depth`).

## [0.3.0] — pré-release

### Adicionado

- **Leitura de repositórios** (`archlens scan`, #10): pasta local ou URL git vira um delta com proveniência
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

[0.3.0]: https://github.com/expersoft/archlens/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/expersoft/archlens/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/expersoft/archlens/releases/tag/v0.1.0
