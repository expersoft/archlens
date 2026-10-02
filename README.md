# archlens

Skill para Claude Code: **arquitetura como modelo, diagramas como consultas.**

- Aceita **texto livre** ou uma **DSL JSON** documentada (`references/notation.md`).
- Um metamodelo só: **ArchiMate 3.2** com **perfil C4** por cima. O mesmo container é caixa azul no
  C4 e application component no ArchiMate.
- Mantém a base em **`architecture/`** e gera dela o **`ARCHITECTURE.md`**, de onde se
  extraem visões novas a qualquer momento.
- **Base que evolui:** cada informação nova vira um delta; `archlens merge` casa entidades (id, alias, nome parecido),
  pergunta conflitos e duplicatas, e registra proveniência, ciclo de vida (as-is/to-be) e histórico.
- **Prévia de mudanças:** `--delta` / `--plan` desenham a base com um delta ainda não aplicado (esboço à mão no estilo do draw.io, com hachura, `+ ~ − ?`,
  removidos riscados); o status `draft` marca o que ainda está em discussão.
- **C4:** landscape, context, container, component, dynamic, com `focus`/`depth` e elevação de relações.
- **ArchiMate:** camadas de negócio, aplicação e tecnologia; visões entre camadas por travessia de
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
| Instruções da skill | [SKILL.md](SKILL.md) |
| Guia do usuário | [docs/GUIA.md](docs/GUIA.md) |
| DSL | [references/notation.md](references/notation.md) |
| Visões | [references/views.md](references/views.md) |
| Evolução da base (merge) | [references/merge.md](references/merge.md) |
| Exemplos | [examples/loja-online](examples/loja-online), [examples/telemedicina](examples/telemedicina) |
| Plano de implementação | [docs/plans/](docs/plans/) |

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

[MIT](LICENSE) © 2026 Expersoft. O [ELK](https://eclipse.dev/elk/), usado no layout e incluído em `scripts/vendor/`, mantém a própria licença (EPL-2.0, ver `scripts/vendor/ELK-LICENSE.md`). O [rough.js](https://roughjs.com/) 4.6.6, usado no traço à mão dos rascunhos, também está em `scripts/vendor/` (MIT, ver `scripts/vendor/ROUGH-LICENSE.md`).
