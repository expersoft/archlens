# Instruções para agentes de codificação

## archlens-ask: atualize junto com o archlens

`portable/archlens-ask/` é um pacote de texto (instruções, regras, referência e exemplos) que reproduz a consulta do
archlens para assistentes sem execução de código (M365 Copilot, Claude Desktop). Ele é **derivado** do archlens
completo: as skills `archlens-plan`, `archlens-apply` e `archlens-query`, a CLI (`scripts/`), `references/`, os
formatos e o conector gbrain.

**Toda evolução ou correção do archlens inclui, no mesmo PR:**

1. **Avaliar o impacto no archlens-ask.** A mudança toca algo que ele copia: tipos de elemento ou relação, direção de
   suporte, travessia, derivação, granularidade, specs de visão, níveis C4, viewpoints, layout das páginas no gbrain,
   formato do `query --format md`, cores?
2. **Se tocar:**
   - rode `npm run ask` (regenera `portable/archlens-ask/REFERENCE.md` e `portable/archlens-ask/eval/gabarito/`);
   - atualize à mão `INSTRUCTIONS.md`, `RULES.md` e `EXAMPLES.md` onde o comportamento mudou;
   - se mudar o resultado ou o sentido de uma pergunta de validação, atualize `eval/perguntas.json`.
3. **Rode `npm run check-ask` antes de concluir** e resolva o que ele apontar (arquivos gerados desatualizados, termos
   de `references/views.md` ausentes, `INSTRUCTIONS.md` acima de 8000 caracteres).
4. **Se não tocar:** escreva "archlens-ask: sem impacto" na descrição do PR.

**Sentido único.** Nunca mude as três skills, a CLI, `references/` ou os formatos para acomodar o archlens-ask. Quem
manda é o archlens completo; o archlens-ask acompanha.

Detalhes: `portable/archlens-ask/README.md` e `docs/superpowers/specs/2026-10-25-archlens-ask-design.md`.

## GUI: avalie o impacto

`apps/gui/` é uma interface web que consome o núcleo (`embed`, `buildView`, `viewData`) e a base. Em mudanças de
`render.mjs`, `query*.mjs`, `view-build.mjs` ou `store/`:

1. **Avalie o impacto na GUI:** a ponte com o iframe (`embed`), a forma de `viewData` e do cartão do elemento, o catálogo
   e as ações de navegação.
2. **Rode `npm run gui:test`** antes de concluir e resolva o que ele apontar.
3. **Segurança do diagrama:** o diagrama roda num iframe sem origem e só conversa com a GUI pela ponte (`postMessage`);
   não volte a dar `allow-same-origin` ao iframe nem leia o iframe pelo host. O script de `render.mjs` é liberado por
   hash na CSP do documento e na do servidor: nada de manipulador em atributo (`on*=`) nem de recurso externo no HTML
   gerado. Mudou o cliente do diagrama ou o servidor? Rode também `npm --prefix apps/gui run test:e2e`. O porquê está
   em `docs/modelo-de-ameacas.md`.
4. **Prompts da GUI:** mudanças em `references/views.md` ou na skill `archlens-query` (busca em texto) e na `archlens-plan`, na
   `archlens-apply` ou em `references/` (planejamento) pedem `npm --prefix apps/gui run prompt` (o `gui:test` falha com
   prompt desatualizado).

## CI: o que já é verificado sozinho

Todo PR passa pelo workflow `.github/workflows/ci.yml`. Ele roda o lint (`npm run lint`), `check-plugin`, `check-ask`,
`check-schemas`, `prompt:check`, `npm audit`, a suíte da raiz e a suíte e o build da GUI (Node 20, 22 e 24),
os testes que abrem o Chromium (incluindo o e2e da GUI) e os lançadores no Windows.

- **O CI confere se os derivados estão em dia; não decide se a mudança pede atualizar os textos.** Avaliar o impacto no
  archlens-ask e na GUI, e atualizar à mão `INSTRUCTIONS.md`, `RULES.md`, `EXAMPLES.md` e `eval/perguntas.json`,
  continua sendo trabalho de quem faz a mudança.
- **Antes de abrir o PR**, `npm run ci` roda localmente o lint, os checks de derivados e a suíte da raiz; em mudanças
  que tocam a GUI, rode também `npm run gui:test`.
- **Exemplos são documentação viva.** Testes de snapshot leem `tests/fixtures/`, nunca `examples/`. Quem edita um
  exemplo roda `npm run ask` (o gabarito do archlens-ask é gerado a partir dele).
- **Lint como catraca.** As regras rebaixadas a aviso em `biome.json` são dívida conhecida; não rebaixe regra nova para
  fazer um PR passar.
