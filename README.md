# archlens

Plugin para Claude Code com três skills (`archlens-plan`, `archlens-apply`, `archlens-query`): **arquitetura como modelo, diagramas como consultas.**

- **Uma base de arquitetura perene** em `architecture/` (ArchiMate 3.2 com perfil C4 por cima), de onde se gera o
  `ARCHITECTURE.md` e se extraem visões C4 e ArchiMate sob demanda, em HTML animado para apresentação.
- **Evolui por deltas:** texto livre, DSL JSON ou leitura de repositórios viram um plano revisado item a item antes de gravar.
- **Base local ou compartilhada:** `model.json`, vault markdown (Obsidian) ou [gbrain](https://github.com/garrytan/gbrain).
- **GUI web** (`archlens serve`) para navegar, perguntar e planejar no navegador.

A lista completa do que o archlens faz está no [guia](docs/GUIA.md#o-que-o-archlens-faz).

```bash
npm install && npx playwright install chromium
bin/archlens build examples/loja-online/architecture
```

| | |
|---|---|
| Skills | [skills/archlens-plan](skills/archlens-plan/SKILL.md), [skills/archlens-apply](skills/archlens-apply/SKILL.md), [skills/archlens-query](skills/archlens-query/SKILL.md) |
| Guia do usuário | [docs/GUIA.md](docs/GUIA.md) |
| Referência da CLI | [docs/cli.md](docs/cli.md) (gerada de `archlens --help`) |
| Configurar e operar a GUI | [docs/GUI.md](docs/GUI.md) |
| DSL | [references/notation.md](references/notation.md) |
| Visões | [references/views.md](references/views.md) |
| Evolução da base (merge) | [references/merge.md](references/merge.md) |
| Repositórios da base (gbrain) | [references/base.md](references/base.md), [references/knowledge-doc.md](references/knowledge-doc.md) |
| Exemplos | [examples/loja-online](examples/loja-online), [examples/telemedicina](examples/telemedicina) |
| Roadmap, specs e planos | [docs/superpowers/](docs/superpowers/roadmap.md) (o plano original de setembro fica em [docs/plans/](docs/plans/), como histórico) |
| Contribuir e publicar versões | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Segurança | [SECURITY.md](SECURITY.md), [modelo de ameaças](docs/modelo-de-ameacas.md) |

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

### Comando `archlens`

`bin/archlens` (Linux, macOS e Git Bash) e `bin/archlens.cmd` (cmd e PowerShell) rodam a CLI sem digitar `node`: acham o
Node (`ARCHLENS_NODE`, se definido, senão o do PATH), conferem a versão mínima (18) e repassam argumentos e código de
saída. As skills usam `"$ARCHLENS/bin/archlens"`. Para ter `archlens` em qualquer pasta:

```bash
ln -s <repo>/bin/archlens ~/.local/bin/archlens   # Linux/macOS (ou ponha <repo>/bin no PATH)
```

No Windows, ponha `<repo>\bin` no PATH do usuário. Com npm, `npm link` na raiz do repositório também cria o comando.

### Atualização

Pelo plugin: atualize o marketplace, depois o plugin, e abra uma sessão nova do Claude Code (a atualização só vale nela):

```bash
claude plugin marketplace update archlens
claude plugin update archlens@archlens
```

O Claude Code guarda o plugin instalado por **versão**: só chega aos usuários o que sai numa versão nova (veja [CONTRIBUTING.md](CONTRIBUTING.md#publicar-uma-versão)). Com o
marketplace do GitHub, vale a branch padrão do repositório. A cópia instalada não tem `node_modules`: a checagem visual do
`deliver`/`build` (Playwright + Chromium) é pulada com aviso, a menos que se rode `npm install` nela.

Pelos links simbólicos: um `git pull` (ou trocar de branch) no repositório já atualiza as skills na próxima sessão, sem versão
nova. É o caminho mais prático para quem desenvolve o archlens.

## Licença

[MIT](LICENSE) © 2026 Expersoft. O [ELK](https://eclipse.dev/elk/), usado no layout e incluído em `scripts/vendor/`, mantém a própria licença (EPL-2.0, ver `scripts/vendor/ELK-LICENSE.md`). O [rough.js](https://roughjs.com/) 4.6.6, usado no traço à mão dos rascunhos, também está em `scripts/vendor/` (MIT, ver `scripts/vendor/ROUGH-LICENSE.md`). O [yaml](https://eemeli.org/yaml/) 2.9.1, usado na leitura de manifestos YAML com número de linha (`archlens scan`), também está em `scripts/vendor/yaml/` (ISC, ver `scripts/vendor/YAML-LICENSE`).
