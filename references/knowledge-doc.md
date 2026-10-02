# A base de conhecimento: `architecture/` e o `ARCHITECTURE.md`

A base é uma **pasta** (padrão `architecture/`, ao lado do `ARCHITECTURE.md`):

| Arquivo | Conteúdo | Quem escreve |
|---|---|---|
| `archlens.json` | manifesto: `archlens`, `name`, `description`, `assumptions`, `layout` | merge |
| `model.json` (ou `model/*.json`) | `{ elements, relationships }` | merge |
| `views.json` | visões salvas | merge (delta com `views`) |
| `changelog.json` | rodadas de merge | merge |
| `notes/overview.md` | visão geral: propósito, decisões, riscos | pessoas / agente |
| `notes/notes.md` | decisões, riscos, pendências | pessoas / agente |
| `notes/assumptions.md` | prosa de premissas (opcional; sem ele, a lista de `assumptions`) | pessoas / agente |
| `diagrams/` | HTML e screenshots do `build` | build |

O **`ARCHITECTURE.md` é 100% gerado** (por `merge --apply`, `doc` e `build`): resumo, contexto, modelo C4, camadas
ArchiMate, relacionamentos, rastreabilidade, ciclo de vida, premissas, fontes, visões, histórico e notas. O
frontmatter traz `source:` (a pasta), e a CLI aceita o `.md` como atalho para ela. Não edite o `.md`.

## Dividir por domínio

Com a base grande, troque `model.json` por uma pasta: no manifesto, `"layout": { "model": "model/" }` e mova os
elementos para `model/<domínio>.json` (cada um com `{ elements, relationships }`). O merge grava cada elemento no
arquivo de onde veio; elementos novos vão para o arquivo do pai ou, sem pai, para `layout.defaultFile` (padrão
`model/geral.json`); relações ficam no arquivo do elemento de origem. Ids repetidos entre arquivos são erro.

## Manter em dia

- `archlens check` valida o modelo e confere se o `ARCHITECTURE.md` corresponde à pasta (código 1 se não). Use no CI
  ou no pre-commit.
- `archlens doc architecture/` regenera o documento depois de editar as notas.

## Formato antigo

Bases com o modelo num bloco `archlens-json` dentro do `.md` são lidas por todos os comandos de leitura (e pela
prévia). Para gravar, converta: `archlens migrate ARCHITECTURE.md` cria a pasta (os blocos `keep` viram
`notes/*.md`), confere que o modelo é idêntico e só então regenera o `.md`. Planos gerados antes continuam válidos.

## Uso como base de conhecimento

```bash
node scripts/archlens.mjs views architecture/
node scripts/archlens.mjs deliver architecture/ --spec '{"key":"x","notation":"archimate","viewpoint":"impact","anchor":"erp"}' --out erp-impacto.html
```

Nenhuma remodelagem: a pergunta nova vira uma view spec sobre o mesmo estado. Para guardar a visão na base, mande-a
num delta (`views`). Para acrescentar conhecimento, delta → `merge --plan` → `--apply`.
