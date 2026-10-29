# archlens

Plugin para Claude Code com três skills (`archlens-plan`, `archlens-apply`, `archlens-query`): **arquitetura como modelo, diagramas como consultas.**

- Aceita **texto livre** ou uma **DSL JSON** documentada (`references/notation.md`).
- Um metamodelo só: **ArchiMate 3.2** com **perfil C4** por cima. O mesmo container é caixa azul no
  C4 e application component no ArchiMate.
- Mantém a base em **`architecture/`** e gera dela o **`ARCHITECTURE.md`**, de onde se
  extraem visões novas a qualquer momento. A base grava um **formato único (2.0)**: tipos ArchiMate, perfil C4 em
  `c4.kind`, hierarquia por `parent`; `c4:*`, `uses` e `children` valem só na entrada. Base 1.x: `archlens migrate`.
- **Base compartilhada no gbrain:** `archlens init` escolhe onde a base mora: `model.json`, um vault markdown (Obsidian)
  ou um [gbrain](https://github.com/garrytan/gbrain), no **modo git** (o CLI grava um commit por apply no repositório que
  o gbrain sincroniza) ou no **modo MCP** (o agente chama as ferramentas do gbrain; o CLI prepara os pedidos e confere os
  recibos, com `--resume` e `--undo` para applies parciais). Times aplicam em paralelo: o plano guarda a versão de cada
  objeto que altera ou em que se apoiou, e só o que se cruza é recusado.
- **Base que evolui:** cada informação nova vira um delta; `archlens plan` casa entidades (id, alias, nome parecido),
  pergunta conflitos e duplicatas, e registra proveniência, ciclo de vida (as-is/to-be) e histórico.
- **Lê repositórios** (compose, k8s/Helm, Terraform, OpenAPI/AsyncAPI, graphify) e gera deltas com proveniência (`archlens scan`).
- **Prévia de mudanças:** `--delta` / `--plan` desenham a base com um delta ainda não aplicado (esboço à mão no estilo do draw.io, com hachura, `+ ~ − ?`,
  removidos riscados); o status `draft` marca o que ainda está em discussão.
- **C4:** landscape, context, container, component, dynamic, com `focus`/`depth` e elevação de relações; um modelo
  ArchiMate (serviços, interfaces) também gera as setas C4, derivadas e tracejadas.
- **ArchiMate:** camadas de negócio, aplicação e tecnologia, com aninhamento visual (`"nesting": "nested"`); visões entre camadas por travessia de
  suporte (o que sustenta uma oferta ou processo), matriz de impacto de um componente, derivação de
  relações através do que foi ocultado, granularidade C4.
- **Relações explicadas:** cada seta vira uma frase em português ("A serve B: B usa A; se A falhar, há impacto em B"), com cartão de hover, legenda com as setas reais e glossário das confusões comuns do ArchiMate.
- **HTML animado** num arquivo único: prévia animada no hover, 100% da largura, modo apresentação (`P`), setas entre visões,
  zoom e pan pelo `viewBox`, trace, story, pulso de impacto, tema claro/escuro, exportação SVG/PNG.
- **Checagem visual** (`deliver`): screenshots em 1920×1080 e 1280×720, largura ocupada ≥ 90% e fonte ≥ 14px.

```bash
npm install && npx playwright install chromium
node scripts/archlens.mjs build examples/loja-online/architecture
```

| | |
|---|---|
| Skills | [skills/archlens-plan](skills/archlens-plan/SKILL.md), [skills/archlens-apply](skills/archlens-apply/SKILL.md), [skills/archlens-query](skills/archlens-query/SKILL.md) |
| Guia do usuário | [docs/GUIA.md](docs/GUIA.md) |
| DSL | [references/notation.md](references/notation.md) |
| Visões | [references/views.md](references/views.md) |
| Evolução da base (merge) | [references/merge.md](references/merge.md) |
| Repositórios da base (gbrain) | [references/base.md](references/base.md), [references/knowledge-doc.md](references/knowledge-doc.md) |
| Exemplos | [examples/loja-online](examples/loja-online), [examples/telemedicina](examples/telemedicina) |
| Plano de implementação | [docs/plans/](docs/plans/) |

## As três skills

| Skill | Faz | Grava a base? |
|---|---|---|
| `archlens-plan` | transforma informação nova (texto, documento, DSL JSON, repositório) em delta, pergunta cada decisão e termina com um plano final revisado e uma prévia em HTML (`plan`, `plan --answers`, `show`) | não |
| `archlens-apply` | cria a base (`init`), grava o plano final, regenera o `ARCHITECTURE.md` e os diagramas, escreve as notas; também `check`, `migrate` e `store convert` (`apply`, `build`; no modo MCP, `--read-check`, `--receipts`, `--resume`, `--undo`) | sim |
| `archlens-query` | responde com diagramas (C4, ArchiMate) ou markdown/JSON, incluindo o cartão de um elemento (`query`, `render`, `deliver`) | não |

O fluxo: (`init`) → `plan` → responder os itens → `plan --answers` → `apply` → `build`. Numa base gbrain no modo MCP, as
três skills rodam antes `remote pull` (o espelho local) e, uma vez por sessão, `remote check` (a sessão do MCP). Exemplo pronto em
`examples/telemedicina/` (`plano-02.json` aberto, `plano-02-final.json` final, `plano-02-final.md` relatório).

### Instalação

Como plugin (marketplace do repositório):

```bash
claude plugin marketplace add <repo>
claude plugin install archlens
```

Ou ligando as skills direto no Claude Code:

```bash
ln -s <repo>/skills/archlens-* ~/.claude/skills/
```

Quem tinha `~/.claude/skills/archlens → <repo>` deve **trocar esse link**: o `SKILL.md` da raiz foi removido e o link antigo
não aponta mais para nenhuma skill (`rm ~/.claude/skills/archlens` e use um dos dois caminhos acima).

### Atualização

Pelo plugin: atualize o marketplace, depois o plugin, e abra uma sessão nova do Claude Code (a atualização só vale nela):

```bash
claude plugin marketplace update archlens
claude plugin update archlens@archlens
```

O Claude Code guarda o plugin instalado por **versão**: só chega aos usuários o que sai numa versão nova (veja abaixo). Com o
marketplace do GitHub, vale a branch padrão do repositório. A cópia instalada não tem `node_modules`: a checagem visual do
`deliver`/`build` (Playwright + Chromium) é pulada com aviso, a menos que se rode `npm install` nela.

Pelos links simbólicos: um `git pull` (ou trocar de branch) no repositório já atualiza as skills na próxima sessão, sem versão
nova. É o caminho mais prático para quem desenvolve o archlens.

### Publicar uma versão

A versão do plugin vem do `package.json`. Nunca edite `.claude-plugin/*.json` à mão: `npm version` regrava os dois
manifestos (o teste `tests/skills.test.mjs` recusa manifestos fora de sincronia). A versão sai por PR para `develop-v2`, e a
tag é criada no commit do merge:

```bash
git checkout -b chore/release-<x>
npm version minor --no-git-tag-version   # ou patch / major: package.json, package-lock.json e .claude-plugin/*.json
# o npm reformata o package.json: mantenha só a linha da versão (git diff package.json)
npm run ask                              # o REFERENCE.md do archlens-ask cita a versão
# CHANGELOG.md: "[Não lançado]" vira "[<x>] — pré-release", com o link de comparação no fim
claude plugin validate .
npm test
npm run test:gbrain   # opcional: integração com um gbrain real (precisa do bun e de rede; ambiente temporário, nada global)
# PR → develop-v2; depois do merge:
git tag -a v<x> -m "archlens <x>" <commit do merge> && git push origin v<x>
```

`npm run check-plugin` só confere a sincronia (sai com 1 se os manifestos não acompanham o `package.json`). Quem instala pelo
marketplace do GitHub recebe a versão quando ela chega à branch padrão (`main`).

## GUI

Uma interface web local para **explorar** a base: o diagrama no centro, a conversa e o histórico, o Explorador (visões
salvas e sugeridas, árvore por camada) e os Detalhes do elemento à direita.

```bash
npm run gui:build                                  # uma vez: instala e compila o front (apps/gui/dist)
node scripts/archlens.mjs serve architecture --open   # [--port N] [--host H]; padrão 127.0.0.1:5180
node scripts/archlens.mjs serve --config archlens-gui.json   # várias bases
```

```json
{ "bases": [{ "id": "loja", "name": "Loja online", "path": "examples/loja-online/architecture" }] }
```

Os `path` do `archlens-gui.json` valem a partir da pasta do próprio arquivo, não de onde o comando roda; cada base
precisa de `id` único e `path`.

> **Atenção:** com `--host` diferente de `localhost`/`127.0.0.1` (por exemplo `0.0.0.0`), a API — só leitura, mas
> **sem autenticação** — fica aberta a quem alcança a máquina pela rede. Em equipe, ponha um proxy com login na frente.

O que faz:

- **Navega** pelas visões: botão direito no elemento abre o menu de visões (contexto, containers, componentes,
  suporte, impacto…), duplo clique expande, a trilha e o histórico voltam a qualquer passo. A notação alterna entre
  ArchiMate e C4, e o tema, o painel esquerdo (`Ctrl+B`) e o direito (`Ctrl+Alt+B`) seguem o seu gosto.
- **Detalhes** do elemento: "Nesta visão" (tipo C4 e ArchiMate, papel, distância, relações como frases) e "Na base"
  (apelidos, pai, filhos, fontes e rodadas).
- **Busca por nome** (`Ctrl+K`), seletor de base, e a troca de base reinicia o histórico.

O que não faz: **só lê**, nunca grava a base (mudanças continuam em `archlens-plan` e `archlens-apply`). A busca em
linguagem natural, com LLM, vem numa fase seguinte. O teste ponta a ponta, em Chromium real, é `npm --prefix apps/gui run test:e2e`.

## Manter o ARCHITECTURE.md em dia

```bash
# .git/hooks/pre-commit
node path/to/archlens/scripts/archlens.mjs check || exit 1
```

```yaml
# CI (GitHub Actions)
- run: node path/to/archlens/scripts/archlens.mjs check
```

Em times com Windows, fixe as quebras de linha em LF para o documento e a base não mudarem só por causa do checkout
(o `check` já ignora CRLF, mas os diffs ficam limpos):

```gitattributes
# .gitattributes
ARCHITECTURE.md text eol=lf
architecture/** text eol=lf
architecture/**/*.png binary
```

## Licença

[MIT](LICENSE) © 2026 Expersoft. O [ELK](https://eclipse.dev/elk/), usado no layout e incluído em `scripts/vendor/`, mantém a própria licença (EPL-2.0, ver `scripts/vendor/ELK-LICENSE.md`). O [rough.js](https://roughjs.com/) 4.6.6, usado no traço à mão dos rascunhos, também está em `scripts/vendor/` (MIT, ver `scripts/vendor/ROUGH-LICENSE.md`). O [yaml](https://eemeli.org/yaml/) 2.9.1, usado na leitura de manifestos YAML com número de linha (`archlens scan`), também está em `scripts/vendor/yaml/` (ISC, ver `scripts/vendor/YAML-LICENSE`).
