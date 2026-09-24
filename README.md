# archlens

Skill para Claude Code: **arquitetura como modelo, diagramas como consultas.**

- Aceita **texto livre** ou uma **DSL JSON** documentada (`references/notation.md`).
- Um metamodelo só: **ArchiMate 3.2** com **perfil C4** por cima. O mesmo container é caixa azul no
  C4 e application component no ArchiMate.
- Gera um **`ARCHITECTURE.md`** (base de conhecimento com o modelo canônico embutido) de onde se
  extraem visões novas a qualquer momento.
- **C4:** landscape, context, container, component, dynamic, com `focus`/`depth` e elevação de relações.
- **ArchiMate:** camadas de negócio, aplicação e tecnologia; visões entre camadas por travessia de
  suporte (o que sustenta uma oferta ou processo), matriz de impacto de um componente, derivação de
  relações através do que foi ocultado, granularidade C4.
- **HTML animado** num arquivo único: 100% da largura, modo apresentação (`P`), setas entre visões,
  zoom e pan pelo `viewBox`, trace, story, pulso de impacto, tema claro/escuro, exportação SVG/PNG.
- **Checagem visual** (`deliver`): screenshots em 1920×1080 e 1280×720, largura ocupada ≥ 90% e fonte ≥ 14px.

```bash
npm install && npx playwright install chromium
node scripts/archlens.mjs build examples/loja-online/model.json --out-dir /tmp/loja
```

| | |
|---|---|
| Instruções da skill | [SKILL.md](SKILL.md) |
| Guia do usuário | [docs/GUIA.md](docs/GUIA.md) |
| DSL | [references/notation.md](references/notation.md) |
| Visões | [references/views.md](references/views.md) |
| Exemplos | [examples/loja-online](examples/loja-online), [examples/telemedicina](examples/telemedicina) |
| Plano de implementação | [docs/plans/](docs/plans/) |

Layout por [ELK](https://eclipse.dev/elk/) (EPL-2.0, vendorizado em `scripts/vendor/`).
