# ARCHITECTURE.md: a base de conhecimento

`archlens doc model.json` (ou `build`) gera um markdown que serve a duas coisas:

1. **Leitura humana:** interpretação da arquitetura, elementos por notação e camada, relações,
   rastreabilidade e premissas.
2. **Fonte de verdade:** o último bloco ```` ```archlens-json ```` guarda o modelo completo. Qualquer
   comando da CLI aceita o `.md` no lugar do `.json`.

## Seções

| Seção | Origem |
|---|---|
| frontmatter (`name`, `generated`, `notations`, contagens) | gerado |
| Visão geral | **keep:overview**: escrita pelo agente/usuário, preservada |
| Resumo | contagem por camada e por tipo C4 |
| Contexto e atores | atores, papéis, stakeholders |
| Modelo C4 | sistema → containers → componentes (tabelas) |
| Camada de Estratégia/Negócio/Aplicação/Tecnologia/… | uma tabela por camada presente, com tipo ArchiMate e perfil C4 |
| Relacionamentos | origem, relação ("usa" para C4), destino, descrição, tecnologia |
| Rastreabilidade | para cada produto/capacidade: o que o sustenta, por camada. Para cada aplicação: negócio que depende dela e tecnologia que a sustenta |
| Premissas e inferências | **keep:assumptions** + tabela de itens inferidos com confiança e trecho de origem |
| Visões | catálogo das visões definidas |
| Notas | **keep:notes**: decisões, riscos, pendências |
| Modelo canônico | bloco `archlens-json` |

## Regras de edição

- Para mudar a arquitetura, edite o **JSON** (no `model.json` ou no bloco do `.md`) e regenere.
  As tabelas não são lidas de volta.
- Texto dentro de `<!-- keep:nome -->…<!-- /keep:nome -->` sobrevive à regeneração.
- Ids são a chave de tudo. Renomear um id quebra visões e referências: prefira mudar `name`.

## Uso como base de conhecimento

Numa conversa futura, com o `.md` em mãos:

```bash
node scripts/archlens.mjs views ARCHITECTURE.md
node scripts/archlens.mjs deliver ARCHITECTURE.md --spec '{"key":"x","notation":"archimate","viewpoint":"impact","anchor":"erp"}' --out erp-impacto.html
```

Nenhuma remodelagem: a pergunta nova vira uma view spec nova sobre o mesmo estado. Para incorporar a
visão ao documento, acrescente-a em `views` e rode `doc`/`build`.
