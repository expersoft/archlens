# ARCHITECTURE.md: a base de conhecimento

`archlens merge` (ou `doc`/`build`) gera e mantém um markdown que serve a duas coisas:

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
| Ciclo de vida | itens `planned`, `deprecated`, `retired`, com o motivo |
| Premissas e inferências | **keep:assumptions** + tabela de itens inferidos com confiança e trecho de origem |
| Fontes | cada fonte (prompt, repo, doc, manual) e quantos itens ela sustenta |
| Visões | catálogo das visões definidas |
| Histórico | últimas 10 rodadas de merge (data, fonte, resumo, mudanças, decisões); o completo fica em `changelog` |
| Notas | **keep:notes**: decisões, riscos, pendências |
| Modelo canônico | bloco `archlens-json` |

## Regras de edição

- Para mudar a arquitetura, use **`archlens merge`** (`references/merge.md`): proveniência e histórico ficam
  registrados. Editar o bloco `archlens-json` à mão e rodar `archlens doc ARCHITECTURE.md` também funciona.
  As tabelas não são lidas de volta.
- Texto dentro de `<!-- keep:nome -->…<!-- /keep:nome -->` sobrevive à regeneração.
- Ids são a chave de tudo. Renomear um id quebra visões e referências: prefira mudar `name`.

## Uso como base de conhecimento

Numa conversa futura, com o `.md` em mãos:

```bash
node scripts/archlens.mjs views ARCHITECTURE.md
node scripts/archlens.mjs deliver ARCHITECTURE.md --spec '{"key":"x","notation":"archimate","viewpoint":"impact","anchor":"erp"}' --out erp-impacto.html
```

Nenhuma remodelagem: a pergunta nova vira uma view spec nova sobre o mesmo estado. Para guardar a visão na
base, mande-a num delta (`views`) e rode o merge. Para acrescentar conhecimento, delta → `merge --plan` → `--apply`.
