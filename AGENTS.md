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
