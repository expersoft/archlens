# Leitura de repositórios (`archlens scan`)

- **Data:** 2026-10-03
- **Branch:** `feat/repo-reading` (a partir de `develop-v2`; PR de volta para `develop-v2`)
- **Status:** design aprovado em conversa; aguardando revisão do spec escrito
- **Roadmap:** item (b) de [`docs/superpowers/roadmap.md`](../roadmap.md)
- **Depende de:** evolução incremental (merge, proveniência, ciclo de vida), base em `architecture/` (a.3), agrupamentos (a.2)

## Contexto e objetivo

A base de conhecimento hoje cresce por prompts e textos. Repositórios trazem fatos que o prompt não tem: o que é
implantado, com que infraestrutura, que contratos expõe, que tópicos publica e assina, como o código está dividido em
módulos e que fluxos de negócio ele implementa. O graphify, quando configurado no repositório, já entrega um grafo do
código (`graphify-out/graph.json`) com módulos, dependências, comunidades, conceitos extraídos dos docs e fluxos
(hyperedges).

**Objetivo:** ler um repositório (pasta local ou URL git) e produzir um **delta** com proveniência que entra pelo
fluxo normal (`merge --plan` → prévia → perguntas → `--apply`), reaproveitando o que a base já tem, correlacionando
repositórios entre si (tópicos, chamadas) e transformando o que sumiu em pergunta, nunca em remoção silenciosa.

### Decisões do usuário

| Tema | Decisão |
|---|---|
| Fontes no primeiro ciclo | **Todas**: graphify, docker-compose, Kubernetes/Helm, Terraform, OpenAPI/AsyncAPI (mais arquivos de build para módulos quando não há graphify) |
| Acesso | **Pasta local ou URL git** (clone raso temporário); sem `graphify-out/`, segue com manifestos e o relatório sugere rodar o graphify |
| Graphify na base | **Módulos + fluxos + conceitos de negócio**; comunidades só como sugestão no relatório |
| Papel do repositório | **Sempre perguntado**: microsserviço → o repositório é um serviço (container C4 / application component ArchiMate); monolito ou monolito modular → o repositório é o sistema e os deployáveis são containers. A CLI sugere com motivo; a resposta fica registrada na base |
| Abordagem | **A — inventário determinístico + delta montado pela CLI + interpretação pela skill** |
| Base em uso | Informada com `--base` (ou procurada a partir do diretório atual); usada só para leitura: reaproveitar ids, achar o elemento do repositório, sugerir o sistema, detectar o que sumiu |
| Sistema pelo nome | **Nunca supor**: prefixo do nome (`terminus-*`) e indícios técnicos viram sugestão com motivo; quem decide é o usuário |

### Critérios de sucesso

1. Ler duas vezes o mesmo repositório (mesmo commit) não muda a base.
2. Um repositório de um módulo já conhecido (ex.: `terminus-assignment-api` → `terminus.assignment`, vindo de prompt)
   enriquece o elemento existente em vez de criar outro.
3. Dois repositórios que publicam e assinam o mesmo tópico ficam ligados (`uses` + `flow`), e a matriz de impacto do
   produtor mostra o consumidor.
4. Todo item vindo de repositório tem `sources` com `kind: "repo"`, `ref` (URL ou caminho com o commit), `path` e `line`.
5. Um item que sumiu do repositório vira pergunta de `retired`; itens com outras fontes não são tocados.
6. Nada é gravado na base pelo `scan`; o repositório lido nunca é alterado.

### Fora do escopo

Ler código-fonte diretamente (vem do graphify); renderizar templates Helm sem o `helm` instalado; HCL completo
(expressões, `for_each`, módulos remotos); vários sistemas de um monorepo numa leitura só (lê-se por pasta);
credenciais e tokens (usa o git do usuário).

## 1. `archlens scan` e o inventário

```
archlens scan <pasta|url-git> [--ref <branch|tag|commit>] [--base <base>] [--out inventario.json] [--json]
```

- URL: `git clone --depth 1` (com `--branch <ref>` quando informado) numa pasta temporária, apagada ao fim;
  repositórios privados usam as credenciais git do usuário. Pasta local: lida como está, com o commit atual
  (`git rev-parse HEAD`) e aviso se houver alterações não commitadas; pasta fora de git → `commit: null` e aviso.
- Ignora `node_modules`, `vendor`, `.git`, `build`, `dist`, `target`, `.gradle`, `.venv` e o que o `.gitignore` da raiz
  exclui (padrões simples: nomes, `dir/`, `*.ext`).
- O `scan` não toca a base nem o repositório.

### Formato

```json
{ "archlens-inventory": "1.0",
  "repo": { "url": "…", "path": "…", "name": "terminus-assignment-api", "commit": "a1b2c3d…", "dirty": false, "scannedAt": "2026-10-03" },
  "files": { "compose": 1, "k8s": 4, "helm": 2, "terraform": 0, "openapi": 1, "asyncapi": 1, "graphify": 1, "build": 1, "ignored": 230 },
  "facts": [ { "kind": "service", "name": "api", "image": "…", "build": ".", "ports": ["8080"], "at": { "file": "docker-compose.yml", "line": 3 } } ] }
```

### Fatos por fonte

| Fonte (detecção) | Fatos |
|---|---|
| docker-compose (`compose*.y?ml`, `docker-compose*.y?ml`) | `service` {name, image?, build?, ports}; `depends-on` {from, to}; `env-ref` {from, var, host}; `infra-image` {service, engine: postgres\|mysql\|mariadb\|mongo\|redis\|kafka\|rabbitmq\|elasticsearch\|…, version?} |
| Kubernetes (`*.y?ml` com `apiVersion` e `kind`) | `workload` {kind, name, image}; `k8s-service` {name, selector}; `ingress` {host, service}; `env-ref` (env e ConfigMap com URL/host) |
| Helm (`Chart.yaml`, `values*.y?ml`) | `chart` {name, dependencies}; imagem, ingress e env dos values tratados como `workload`/`ingress`/`env-ref`; `--helm-render` usa `helm template` quando o binário existe |
| Terraform (`*.tf`) | `cloud-resource` {type, name, category: database\|messaging\|storage\|cache\|cluster\|other, attrs literais}; `tf-ref` {from, to} |
| OpenAPI (`openapi*`, `swagger*`, `.y?ml`/`.json` com chave `openapi`/`swagger`) | `api` {title, version, servers, operations, tags} |
| AsyncAPI (chave `asyncapi`) | `channel` {name, action: publish\|subscribe, message?} (2.x publish/subscribe; 3.x send/receive normalizados) |
| Graphify (`graphify-out/graph.json`) | `module` {name, executable}; `module-dep` {from, to, count}; `flow` {label, participants, confidence}; `domain-concept` {label, degree}; `graph-stale` {builtAt, commit} |
| Build (`settings.gradle*`, `pom.xml`, `package.json` com workspaces, `go.mod`) | `module` e `module-dep` quando não há graphify |
| Qualquer arquivo detectado que não abre | `unreadable` {error}; a leitura continua |

- Módulos executáveis: no graphify, módulos com ponto de entrada (classe de aplicação, `main`, `Application`,
  `Activity` de launcher, plugin Gradle `application`/`com.android.application`); no build, por plugin/empacotamento.
- `module-dep` do graphify: arestas `imports`/`calls`/`references` entre nós de módulos diferentes (primeira pasta do
  `source_file` que é um módulo de build), agregadas com contagem.
- `domain-concept`: até 10 nós de maior grau cujo `source_file` está num módulo de domínio ou que o graphify classifica
  como `concept` de negócio; testes e UI excluídos.

### Analisadores

- YAML: biblioteca `yaml` (ISC) vendorizada em `scripts/vendor/` (sem dependência de execução nova).
- Terraform: extrator mínimo próprio de HCL (blocos `resource`/`data`/`module` com dois rótulos, atributos com
  literais e referências `tipo.nome.*`); limites documentados.
- JSON (OpenAPI/AsyncAPI/graph.json): nativo.

## 2. Do inventário ao delta

```
archlens scan <pasta|url> --base <base> --as system|service [--system <id>] [--id <id>] --delta d.json [--from inventario.json]
```

### Base em uso

- `--base`: pasta `architecture/` ou `ARCHITECTURE.md` gerado (mesma resolução dos demais comandos). Sem `--base`,
  procura a partir do diretório atual; não achando, avisa ("nenhuma base encontrada; o delta será para uma base nova;
  use --base") e segue — a skill pergunta antes.
- A base é só lida: o `scan` nunca grava nela.
- Usos: (1) achar o elemento do repositório — primeiro `properties.repo` igual ao repositório (URL normalizada ou
  caminho absoluto), depois casamento por nome/alias (o mesmo do merge); (2) reaproveitar ids existentes; (3) sugerir
  o sistema; (4) detectar o que sumiu.

### Resumo e pergunta do papel (sem `--as`)

Sem `--as`, a CLI não gera delta: imprime (e com `--json` devolve) o resumo:

- contagem por tipo de fato e avisos (`graphify ausente` com a sugestão de rodar o graphify; `graph-stale`;
  `dirty`; `unreadable`);
- **papel sugerido** com motivo: um deployável e nenhum módulo executável a mais → `service`; dois ou mais → `system`;
- **elemento já existente** para o repositório (por `properties.repo`, ou candidato por nome com a semelhança);
- **sistemas prováveis** com motivo: nome/prefixo do repositório × nome/id/alias de sistema; tópicos do repositório
  já ligados a containers de um sistema; hosts chamados que são containers de um sistema; conceitos do graphify já
  modelados sob um sistema. Sem indícios → nenhum candidato.

A skill pergunta o papel e o sistema mostrando a sugestão e os motivos; **nunca decide pelo usuário**.

### Mapeamento — papel `system`

- Repositório → `c4:softwareSystem` (id: `--id`, ou o elemento já existente, ou o nome do repositório normalizado).
- Deployáveis (serviço compose / workload k8s com build ou imagem própria; módulo executável) → `c4:container` filho.
- Módulos de biblioteca → `c4:component` dentro do container que mais depende deles (maior `module-dep.count`);
  sem dono → container com tag `library`.
- Infra própria (`infra-image`, `cloud-resource` de banco/mensageria/cache/storage) → container com tag
  `database`/`queue`/`cache`/`storage` **e** `archimate:system-software` (motor/versão) servindo-o; cluster →
  `archimate:node` servindo os containers.
- `depends-on`, `env-ref`, `module-dep` → `uses` (descrição com a evidência: "via ORDERS_DB_URL",
  "312 referências no código"); `tf-ref` → `serving`.
- `api` → `application-interface` do container dono, que a realiza (`realization`).
- `channel` → container com tag `topic`, id global `topic.<nome-normalizado>`; quem publica `uses` o tópico; o tópico
  `flow` para quem assina.
- `flow` (graphify) → `archimate:business-process` (`inferred`, `confidence` da hyperedge), `serving` dos
  containers dos participantes para o processo.
- `domain-concept` → `archimate:business-object` (ou `data-object` quando o nó vem de um módulo de dados), acessado
  (`access`) pelos containers que o usam.

### Mapeamento — papel `service`

- O repositório inteiro é **um** `c4:container` (id: `--id`, ou o existente, ou `<sistema>.<nome-do-repo>`) dentro do
  sistema `--system` (obrigatório; deve existir na base ou ser criado pelo delta quando não houver base).
- Módulos → componentes do container; infra, APIs, canais, fluxos e conceitos pelas mesmas regras, com esse container
  como dono.

### Ids, proveniência e confiança

- Ids: `<sistema>`, `<sistema>.<servico>`, `<sistema>.<servico>.<modulo>`, `topic.<nome>` (global). Normalização: minúsculas,
  `[^a-z0-9]+` → `-`. Ids existentes na base têm prioridade.
- Nomes técnicos ficam em `aliases` quando a skill troca o nome por um nome de negócio.
- Cada item: `sources: [{ kind: "repo", ref: "<url ou caminho>@<commit7>", path: "<arquivo>", line: <n>, excerpt: "<evidência curta>" }]`;
  `sources` ganha os campos opcionais `path` (já existente) e `line` (novo, inteiro ≥ 1).
- Fatos de manifesto/contrato não levam `inferred`; deduções (componente por dependência, processo por hyperedge,
  relação por variável de ambiente, dono de biblioteca) levam `inferred: true` e `confidence` (`alta`/`média`/`baixa`).
- O elemento do repositório recebe `properties.repo` (URL normalizada sem credenciais, ou caminho absoluto) e
  `properties.repoRole` (`system`/`service`).

### Correlação entre repositórios

- Tópicos com id global se encontram no merge: produtor `uses` tópico, tópico `flow` consumidor.
- `env-ref` com host que corresponde a um container existente na base (id ou alias) → `uses` para ele; sem
  correspondência → elemento `inferred` (`external` quando o host é de fora) que a skill confirma ou renomeia.

### Nova leitura e itens que sumiram

- O merge casa por id e alias: ler de novo atualiza.
- Itens da base cuja **única** fonte `repo` é este repositório e que não aparecem no inventário atual entram no delta
  como `ops: [{ op: "status", id, status: "retired", reason: "não encontrado em <repo>@<commit7>" }]` — o merge já pede
  confirmação (`yes`/`no`). Itens com qualquer outra fonte não são tocados.
- O papel registrado (`properties.repoRole`) é reaproveitado; se o inventário contradisser (ex.: `service` com dois
  deployáveis), o resumo avisa.

### Papel da skill depois do delta

Trocar nomes técnicos por nomes de negócio (técnicos em `aliases`), ligar processos do graphify a capacidades e
produtos existentes, sugerir agrupamentos quando módulos ou o graphify indicarem plataformas, e seguir o fluxo normal.

## 3. CLI, código, skill e testes

### CLI

- `archlens scan <pasta|url> [--ref] [--base] [--out] [--json] [--helm-render]` → inventário + resumo.
- `archlens scan … --as system|service [--system] [--id] --delta d.json [--from inventario.json]` → delta.
- Erros: `E_SCAN_SOURCE` (pasta/URL inexistente, clone falhou com a mensagem do git), `E_SCAN_ROLE` (`--as` ausente ou
  inválido com `--delta`; `service` sem `--system`), `E_SCAN_TARGET` (`--id`/`--system` inexistente na base ou de tipo
  inesperado).

### Código

- `scripts/lib/scan/index.mjs`: percorrer a pasta, detectar tipos, juntar fatos, montar o inventário.
- Um extrator por fonte, mesma assinatura (`(files, ctx) → facts`): `compose.mjs`, `k8s.mjs`, `helm.mjs`,
  `terraform.mjs` (com o extrator HCL), `openapi.mjs`, `asyncapi.mjs`, `graphify.mjs`, `build.mjs`.
- `scripts/lib/scan/summary.mjs`: resumo, papel sugerido, candidatos na base (usa o casamento do merge).
- `scripts/lib/scan/to-delta.mjs`: puro — inventário + papel + base → delta (regras da seção 2, inclusive `retired`).
- `scripts/lib/scan/git.mjs`: clone raso, commit, `dirty`.
- `scripts/vendor/yaml.mjs` (+ licença).

### Skill e documentação

- `SKILL.md`: passo 3, entrada "repositório": `scan --base` → resumo → perguntar papel e sistema (com a sugestão e os
  motivos) → `scan --delta` → refinar nomes → merge. Erros comuns: "assumir o sistema pelo nome do repositório",
  "aplicar sem olhar os `retired` sugeridos".
- `references/repo-reading.md` (novo): fontes, fatos, mapeamento, ids, confiança, correlação, nova leitura, limites,
  graphify.
- `references/merge.md`: fonte `repo` com `path`/`line`; `retired` vindos de nova leitura.
- `docs/GUIA.md`, `README.md`: um parágrafo cada.
- Exemplo `examples/repos/`: `pedidos` (compose + OpenAPI + AsyncAPI publicando `pedido-criado`), `pagamentos`
  (k8s + Helm + AsyncAPI assinando `pedido-criado`, com um `graphify-out/graph.json` pequeno), `infra` (Terraform com
  RDS e MSK); lidos para uma base `examples/repos/architecture/` mostrando a correlação.

## 4. Testes (TDD, `node:test`)

- Extratores: fixture mínima por fonte → fatos esperados com `at` (arquivo e linha) corretos.
- Inventário: ignora pastas de build/dependências; arquivo ilegível vira `unreadable`; `graph-stale` quando o commit
  difere.
- `to-delta` (`system` e `service`): ids, `sources` (`kind`, `ref` com commit, `path`, `line`), `inferred`/`confidence`
  só nas deduções, infra com system-software servindo, API com realização, tópico com `uses`/`flow`, processos e
  objetos do graphify.
- Base: reaproveita id existente (caso `terminus.assignment`); acha por `properties.repo` na segunda leitura; sugere
  sistema com motivo (prefixo e tópico) sem decidir; sem base, avisa.
- Nova leitura: item sumido → `op: status retired` com motivo; item com outra fonte intocado; mesma leitura duas
  vezes → nada muda.
- Correlação: dois repositórios com o mesmo tópico aplicados em sequência → `uses` + `flow`; impacto do produtor
  mostra o consumidor.
- CLI: pasta e URL (`file://` de um repositório git local criado no teste, sem rede); `--from`; `E_SCAN_*`; `--json` puro.
- Ponta a ponta: os três mini-repositórios → `scan` → `merge --plan` → `--apply`; `check` passa; visões resolvem.
- Schemas: `sources[].line` aceito.
