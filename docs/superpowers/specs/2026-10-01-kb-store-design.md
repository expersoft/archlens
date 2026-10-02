# Modelo canônico fora do ARCHITECTURE.md (pasta `architecture/`, camada de armazenamento)

- **Data:** 2026-10-01
- **Branch:** `feat/kb-store` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito
- **Depende de:** [evolução incremental](2026-09-30-kb-evolucao-design.md) e [prévia](2026-09-30-kb-preview-design.md), já em `develop-v2`
- **Roadmap:** item (a.3) de [`docs/superpowers/roadmap.md`](../roadmap.md), antes da leitura de repositórios (b)

## Contexto e objetivo

Hoje o `ARCHITECTURE.md` acumula três papéis: **fonte da verdade** (bloco `archlens-json`), **documento de
leitura** (tabelas regeneradas) e **texto autoral** (blocos `keep:overview`, `keep:assumptions`, `keep:notes`).
Nos exemplos, o JSON é ~75% do arquivo (loja-online: 998 de 1334 linhas, 45 KB). Com a leitura de
repositórios, cada item ganha `sources` com caminho e linha, e o arquivo cresce mais rápido.

Problemas: o agente que abre o documento para entender a arquitetura carrega o JSON inteiro; cada mudança
aparece três vezes no diff (JSON, tabelas, data `generated:`); duas branches que evoluem a base conflitam no
mesmo bloco; não é possível dividir a base por domínio; e há três regras de edição diferentes no mesmo arquivo.

**Objetivo:** mover a fonte da verdade para uma pasta `architecture/` (manifesto, modelo, visões, histórico,
notas), atrás de uma **camada de armazenamento com adaptadores**, e tornar o `ARCHITECTURE.md` 100% gerado,
determinístico e verificável (`archlens check`). Bases no formato atual continuam legíveis e são convertidas
por `archlens migrate`.

### Decisões do usuário

| Tema | Decisão |
|---|---|
| Layout | Pasta `architecture/` com a fonte; `ARCHITECTURE.md` gerado na **raiz** do repositório |
| Divisão do modelo | Começa em um `model.json`; o loader já aceita `model/*.json` (dividir depois é mover elementos) |
| Texto autoral | `architecture/notes/*.md` são fonte; o `.md` gerado os inclui |
| Formato antigo | **Leitura + `migrate`**: comandos de leitura aceitam; comandos que gravam recusam e orientam |
| Abordagem | **A — camada de armazenamento com adaptadores** (`folder` e `legacy` agora) |
| Futuro registrado | A fonte do modelo canônico deve poder ser configurada para **outras pastas, buckets ou um gbrain via MCP**. Este ciclo não implementa isso, mas o contrato do store e o campo reservado `store` no manifesto existem para que um adaptador novo não exija refatoração |

### Critérios de sucesso

1. `migrate` de `loja-online` e `telemedicina` produz pastas cujo `load()` devolve exatamente o raw do formato
   antigo, e as visões resolvem com o mesmo IR antes e depois.
2. Gerar o `ARCHITECTURE.md` duas vezes sobre o mesmo conteúdo produz os mesmos bytes; `check` detecta um `.md`
   editado à mão.
3. Nenhum módulo além de `scripts/lib/store/` lê ou grava arquivos da base.
4. Gravar a pasta duas vezes produz os mesmos bytes (diff só do que mudou).
5. Planos gerados antes do `migrate` continuam aplicáveis depois (o hash é sobre o raw).

### Fora do escopo

Adaptadores remotos (bucket, MCP); regras automáticas de qual elemento vai para qual domínio; ler de volta
edições feitas no `.md`; dividir `views.json` e `changelog.json`.

## 1. Layout e conteúdo

```
repo/
  ARCHITECTURE.md            ← 100% gerado; frontmatter aponta para a fonte
  architecture/
    archlens.json            ← manifesto
    model.json               ← { elements, relationships }   (ou model/*.json)
    views.json               ← [ view specs ]
    changelog.json           ← [ rodadas de merge ]
    notes/
      overview.md            ← visão geral (era keep:overview)
      notes.md               ← decisões, riscos, pendências (era keep:notes)
      assumptions.md         ← opcional: prosa de premissas (era keep:assumptions)
    diagrams/                ← saída padrão do build (html + screenshots)
```

### Manifesto (`archlens.json`)

```json
{ "archlens": "1.0", "name": "…", "description": "…", "assumptions": [ … ],
  "layout": { "model": "model.json" } }
```

- Uma pasta é base archlens **se e somente se** contém `archlens.json`.
- `name`, `description`, `assumptions` são os campos de topo do raw atual (`archlens` também).
- `layout` é opcional. `layout.model`: `"model.json"` (padrão) ou `"model/"` (diretório). Com diretório,
  `layout.defaultFile` (padrão `"model/geral.json"`) recebe elementos novos sem pai.
- `store` é **reservado** para a futura fonte externa (`{ "kind": "s3" | "mcp" | …, … }`). Neste ciclo, se
  presente, `E_STORE_UNSUPPORTED`.
- Campos de topo desconhecidos do raw são preservados no manifesto (ida e volta sem perda).

### Raw em memória

Inalterado: `{ archlens, name, description?, assumptions?, model: { elements, relationships }, views?, changelog? }`.
O store monta esse objeto a partir dos arquivos e o desmonta ao gravar. `views.json` e `changelog.json` ausentes
equivalem a `[]`; ao gravar, são criados mesmo vazios só se o raw tiver a chave.

### Modelo dividido (`model/*.json`)

- Cada arquivo: `{ "elements": [...], "relationships": [...] }`. O loader junta em ordem alfabética do nome.
- Id de elemento repetido entre arquivos → `E_STORE_DUP_ID` citando os dois arquivos.
- `load()` devolve `origins`: `Map<elementId, arquivo>` e, para relações, o arquivo de cada uma (por índice
  canônico, usando `relationshipIds`).
- `save()` com origens:
  - elemento existente volta ao arquivo de origem;
  - elemento novo vai para o arquivo do **pai** (se o pai tem origem), senão para `layout.defaultFile`;
  - relação vai para o arquivo do **elemento de origem** (`from`); relação existente fica onde estava;
  - elemento ou relação removidos saem do arquivo; arquivo que fica vazio permanece com listas vazias.
- Elementos aninhados (`children`) ficam no arquivo do elemento raiz que os contém.

### Formatação estável

JSON com 2 espaços e `\n` final. Ordem das chaves de cada elemento/relação/visão: a ordem canônica já usada
pelo bloco `archlens-json` hoje (a do raw); ordem dos itens: a do raw (o merge já preserva a ordem e acrescenta
no fim). Gravar o mesmo raw duas vezes gera os mesmos bytes.

### `ARCHITECTURE.md` gerado

- Mesmas seções de hoje, com três mudanças:
  1. sem bloco `archlens-json` e sem marcadores `keep`;
  2. sem `generated:` no frontmatter (fica `revision` e `updated` do changelog; sem changelog, `updated` é
     omitido) → determinístico;
  3. aviso no topo: "Gerado por archlens a partir de `architecture/`. Não edite: escreva em
     `architecture/notes/*.md` e evolua a base com `archlens merge`."
- Frontmatter ganha `source: architecture/` (caminho relativo ao `.md`).
- Notas: `overview.md` na seção "Visão geral" (fallback: `description` ou o texto-guia atual);
  `assumptions.md` antes da tabela de inferidos na seção "Premissas" (fallback: lista de `assumptions`);
  `notes.md` na seção "Notas".
- Seção "Modelo canônico" troca o bloco por um parágrafo com os caminhos dos arquivos da fonte.
- **Consequência aceita:** o `.md` sozinho deixa de ser base para a CLI; continua documento e contexto.

## 2. Armazenamento, resolução e CLI

### Contrato (`scripts/lib/store/index.mjs`)

```js
resolveBase(arg, { cwd, create = false }) → locator   // { kind: 'folder' | 'legacy', path, exists, docPath }
openStore(locator) → {
  kind, writable,                     // writable: false no legacy
  describe(),                         // "pasta architecture/" | "ARCHITECTURE.md (formato antigo)"
  load()  → { raw, notes, origins },  // notes = { overview?, notes?, assumptions? } (strings)
  save(raw, { notes, origins }),      // grava atomicamente (tmp + rename por arquivo); só no folder
}
```

- `scripts/lib/store/folder.mjs`: leitura e gravação da pasta; divisão em `model/*.json`; formatação estável.
- `scripts/lib/store/legacy.mjs`: lê o `.md` com bloco (`extractModel`) e converte os blocos `keep` em `notes`.
  `save` lança `E_STORE_LEGACY`: "esta base está no formato antigo (bloco archlens-json no .md); rode
  `archlens migrate <arquivo>` para convertê-la para a pasta architecture/".
- `doc.mjs` vira puro: `generateDoc(raw, { notes, source })` → texto. `extractModel` continua exportado (usado
  pelo legacy e pelo migrate). A leitura dos `keep` sai do `generateDoc` e vai para o legacy.
- Nenhum outro módulo lê ou grava arquivos da base. `archlens.mjs` usa só `resolveBase`/`openStore`.

### Resolução da base (`resolveBase`)

1. Argumento é diretório com `archlens.json` → `folder`. Diretório inexistente (ou sem manifesto e vazio) e
   `create: true` → `folder` com `exists: false`. Diretório existente, não vazio, sem manifesto →
   `E_STORE_NOT_BASE`.
2. Argumento é um arquivo `archlens.json` → `folder` do diretório dele.
3. Argumento é `.md`:
   - frontmatter com `source:` → `folder` nesse caminho (relativo ao `.md`);
   - tem bloco `archlens-json` → `legacy`;
   - senão → `E_STORE_NOT_BASE`: "o arquivo não é uma base archlens. Para começar uma base a partir dele, trate
     o conteúdo como texto livre (delta) e rode `archlens merge architecture/ delta.json --plan plano.json`."
4. Sem argumento: sobe a partir de `cwd` procurando `architecture/archlens.json`; não achando, `ARCHITECTURE.md`
   (legacy); não achando, `E_STORE_NOT_FOUND` (com `create: true`: `folder` em `cwd/architecture`, inexistente).

`docPath` (onde o `.md` gerado mora): para `folder`, `<pai da pasta>/ARCHITECTURE.md`; para `legacy`, o próprio
arquivo.

### Comandos

| Comando | Base aceita | Efeito |
|---|---|---|
| `views`, `validate`, `resolve`, `render`, `deliver`, prévia (`--delta`/`--plan`) | folder ou legacy | só leitura |
| `merge --plan` | folder (existente ou não) ou legacy | só leitura; hash sobre o raw, como hoje |
| `merge --apply` | folder (`create: true`) | grava a pasta e regenera o `.md`; legacy → `E_STORE_LEGACY` |
| `doc [--out]` | folder | regenera só o `.md` (`docPath` ou `--out`); legacy → `E_STORE_LEGACY` |
| `build [--out-dir]` | folder | regenera o `.md` e o HTML/screenshots; padrão `architecture/diagrams/`; legacy → `E_STORE_LEGACY` |
| `migrate <md> [--to <pasta>]` | legacy | ver abaixo |
| `check [base]` | folder | valida o modelo; regenera o `.md` em memória; código 1 se diferente do disco |

Em modo prévia, `build` continua recusando gravar a base e escreve `<nome>-preview.html` na pasta de saída.

### `migrate`

1. `resolveBase(md)` deve dar `legacy`; destino padrão `<dir do md>/architecture/` (ou `--to`); destino com
   `archlens.json` → `E_STORE_EXISTS`.
2. `load()` do legacy → `raw`, `notes` (de `keep:overview`, `keep:notes`; `keep:assumptions` só se diferente do
   texto que o `generateDoc` antigo produziria a partir de `raw.assumptions`; textos-guia padrão descartados).
3. `save()` na pasta nova; recarrega e compara `canonicalJson` com o raw do legacy (diferença → apaga a pasta
   criada e falha com `E_STORE_MIGRATE`).
4. Só então regenera o `.md` (novo formato) no lugar do antigo, e imprime o commit sugerido
   (`git add architecture ARCHITECTURE.md && git commit -m "chore(archlens): base migrada para architecture/"`).

### `check`

Valida (`validateModel`; erros → código 1), gera o `.md` em memória e compara com o arquivo em `docPath`.
Diferente ou ausente → código 1 com: "ARCHITECTURE.md desatualizado: foi editado à mão ou falta rodar
`archlens doc`. Edite `architecture/notes/*.md` e regenere." `--json` imprime `{ ok, errors, stale }`.
Exemplos de pre-commit e de passo de CI vão no `README.md`.

### Erros novos

`E_STORE_LEGACY`, `E_STORE_NOT_BASE`, `E_STORE_NOT_FOUND`, `E_STORE_DUP_ID`, `E_STORE_JSON` (arquivo e
posição), `E_STORE_EXISTS`, `E_STORE_MIGRATE`, `E_STORE_UNSUPPORTED`, `E_STORE_LAYOUT` (`layout.model` que não é
um `.json` ou uma pasta terminada em `/` dentro da base, ou `defaultFile` fora dela: gravaria arquivos que a leitura
não vê), `E_STORE_DOC_FOREIGN` (o `ARCHITECTURE.md` de destino existe e não foi gerado por esta base: a CLI nunca
o sobrescreve).

## 3. Skill, exemplos e documentação

- `SKILL.md`: passo 1 procura `architecture/` e depois `ARCHITECTURE.md`; base antiga → sugerir `migrate`
  (perguntando antes); comandos passam a usar a pasta (`archlens merge architecture/ delta.json …`); passo 10:
  escrever em `architecture/notes/overview.md` e `notes.md`; erros comuns: "editar o ARCHITECTURE.md (é gerado)",
  "não rodar `check` no CI".
- `references/knowledge-doc.md`: reescrito (layout, papel de cada arquivo, notas, divisão em `model/*.json`,
  `check`, `migrate`).
- `references/merge.md`: base = pasta; plano antigo continua válido após `migrate`.
- `docs/GUIA.md` e `README.md`: um parágrafo cada; `README.md` com exemplo de pre-commit e de CI.
- `roadmap.md`: a.1 → feito (PR #6); nova linha a.3; pendências do `generated:` e do `.md` escrito à mão →
  resolvidas por a.3; registrar o item futuro "fonte plugável (pastas, buckets, gbrain via MCP)".
- Exemplos: `loja-online` e `telemedicina` migrados com o próprio `migrate`; cada um com `architecture/`,
  `ARCHITECTURE.md` gerado e `architecture/diagrams/`; `delta-01.json`, `plano-01.json` e `delta-02.json` do
  telemedicina continuam válidos contra a pasta; script `npm run examples` aponta para as pastas.

## 4. Testes (TDD, `node:test`)

- `tests/store.test.mjs`:
  - ida e volta: `save` → `load` devolve raw e notas iguais; campos de topo desconhecidos preservados;
  - formatação estável: duas gravações, mesmos bytes;
  - `model/*.json`: junção em ordem; `E_STORE_DUP_ID`; elemento novo no arquivo do pai e, sem pai, no
    `defaultFile`; relação no arquivo do `from`; removido sai do arquivo certo; arquivo vazio permanece;
  - `E_STORE_JSON` com o nome do arquivo; `store` no manifesto → `E_STORE_UNSUPPORTED`;
  - legacy: lê raw e notas dos `keep`; `save` → `E_STORE_LEGACY`.
- `resolveBase`: pasta, manifesto, `.md` com `source:`, `.md` legacy, `.md` sem bloco (`E_STORE_NOT_BASE`),
  busca subindo diretórios, `create: true`, pasta não vazia sem manifesto.
- `doc`: sem bloco, sem `keep`, sem `generated:`; aviso e `source:`; notas incluídas nas seções; determinístico.
- `cli`: `migrate` (raw idêntico, `keep` → notas, `.md` trocado só no fim, destino existente recusado);
  `check` (0 em dia, 1 editado à mão, 1 com erro de validação); `merge --apply` em pasta inexistente cria a base;
  `merge --apply`/`doc`/`build` em legacy recusam; leitura e prévia em pasta e em legacy; `build` padrão
  `architecture/diagrams/`.
- Regressão: visões dos dois exemplos com o mesmo IR antes e depois do `migrate`; suíte atual verde (testes de
  I/O ajustados para a pasta).
