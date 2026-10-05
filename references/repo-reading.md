# Lendo repositórios: `archlens scan`

`scan` lê uma pasta ou URL git e devolve um **inventário** (fatos com arquivo e linha) e, com `--as`, um **delta**
com proveniência. Nunca grava na base nem altera o repositório lido.

## 1. Quando usar e o fluxo

Use quando o usuário apontar um repositório (pasta ou URL git) como fonte de arquitetura.

1. `archlens scan <repo> --base <base>`: imprime o resumo (fatos por fonte, avisos, papel sugerido, elemento já
   existente, sistemas prováveis com o motivo). Sem base, avisa e segue. Na primeira leitura, `--base` pode apontar a
   base que o primeiro `merge --apply` vai criar (pasta ausente ou vazia): o aviso de base nova sai e o delta é para
   uma base nova (o aviso diz onde a base será criada).
2. **Pergunte o papel e o sistema** mostrando a sugestão e os motivos. Nunca assuma pelo nome. Se o resumo mostrar
   `já na base: <nome> (<id>), semelhança de nome <n>`, confirme com o usuário se é o mesmo elemento e, se for, passe
   `--id <id existente>` no passo 3. Sem `--id`, o delta cria um id a partir do nome do repositório: o plano traz uma
   possível duplicata e os ids de infraestrutura ganham o prefixo errado (`<sistema>.<repo>-db` em vez de
   `<id existente>-db`).
3. `archlens scan <repo> --base <base> --as system|service [--system <id>] [--id <id>] --delta d.json [--from inv.json]`.
   `--from` reaproveita um inventário salvo com `--out inv.json`.
4. Troque nomes técnicos por nomes de negócio (os técnicos vão para `aliases`), ligue processos a capacidades já
   modeladas e sugira agrupamentos.
5. `merge <base> d.json --plan p.json`, responda só os itens com `"resolution": null`, `merge <base> --apply p.json`.
   Com `--as service`, um `--system` que ainda não está na base é criado pelo próprio delta (o scan avisa:
   `o sistema <id> não existe na base e será criado pelo delta`).

Erros: `E_SCAN_SOURCE` (pasta/URL inválida ou clone falhou), `E_SCAN_ROLE` (`--as` ausente/inválido; `service` sem
`--system`), `E_SCAN_TARGET` (`--id`/`--system` que existe na base com outro tipo, por exemplo `--system` apontando
um container). Uma pasta que não é base e não está vazia continua sendo erro (`E_STORE_NOT_BASE`).

URL: `git clone --depth 1` numa pasta temporária, apagada ao fim, sem prompt de credenciais (`GIT_TERMINAL_PROMPT=0`)
e com limite de 120 s; repositório privado usa as credenciais git já configuradas do usuário. `--ref` escolhe
branch/tag; um sha completo (40 dígitos) é buscado com `git fetch --depth 1 origin <sha>` e posto em checkout (o
servidor precisa permitir buscar um commit pelo sha; se não permitir, `E_SCAN_SOURCE`). Pasta local usa o commit
atual, com aviso se houver alterações não commitadas.

Identidade (`properties.repo` e o `ref` das fontes): a URL lida; numa pasta local que é a raiz de um clone com remote
`origin`, a URL desse remote sem credenciais (assim a mesma base reconhece o repositório lido por pasta ou por URL);
sem remote, ou numa subpasta de outro repositório, o caminho absoluto da pasta.

Ignora `node_modules`, `vendor`, `.git`, `build`, `dist`, `target`, `.gradle`, `.venv` e o `.gitignore` da raiz,
exceto `graphify-out/graph.json`, lido mesmo quando `graphify-out/` está no `.gitignore`.

Pastas de teste e fixtures (`test`, `tests`, `__tests__`, `fixtures`) são puladas em qualquer profundidade abaixo da
raiz, **exceto** quando alguma pasta acima delas se chama `deploy`, `k8s`, `kustomize`, `helm`, `charts`,
`environments`, `overlays`, `infra` ou `terraform` (ali `test` é um ambiente: `deploy/k8s/overlays/test/d.yaml` é
lido). `spec/` é lida (costuma guardar os contratos: `api/spec/openapi.yaml`). Uma pasta de teste passada como raiz é
lida normalmente.

Arquivos reconhecidos que não foram lidos ficam em `skipped: [{ path, reason }]` no inventário e numa linha do resumo,
`arquivos reconhecidos e pulados: N (pasta de teste: …; grande demais: …)` (até 5 caminhos por motivo; a lista
completa está no inventário). Reconhecido sem abrir = tipo pelo nome (compose, `Chart.yaml`, `*.tf`, build, grafo) ou
`.yaml`/`.json` com nome de openapi/swagger/asyncapi; o motivo `grande demais` também gera o fato `unreadable` (§2).
Os demais arquivos de fora contam só em `files.ignored` no inventário.

## 2. Fontes lidas e fatos

| Fonte | Fatos |
|---|---|
| docker-compose | `service`, `depends-on`, `env-ref` (host em variável), `infra-image` (postgres, mysql, redis, kafka…) |
| Kubernetes | `workload`, `k8s-service`, `ingress`, `env-ref` |
| Helm (`Chart.yaml`, `values*.yaml`) | `chart`, imagem, ingress e env dos values; `<chart>/templates/**` não é lido como YAML; `--helm-render` roda `helm template <chart>` (60 s) e lê a saída como Kubernetes (`at.file`: `<chart>/templates (helm template)`); sem o `helm`, fato `warning` e o aviso `helm não encontrado: --helm-render ignorado` |
| Terraform (`*.tf`) | `cloud-resource` (database, messaging, storage, cache, cluster, other), `tf-ref`; atributos com `pass`, `secret`, `token`, `key` ou `credential` no nome ficam fora |
| OpenAPI / Swagger | `api` (título, versão, servers sem `usuário:senha@`, operações, tags) |
| AsyncAPI | `channel` com `publish` ou `subscribe` |
| Graphify (`graphify-out/graph.json`) | `module`, `module-dep`, `flow`, `domain-concept`, `community` (só no resumo), `graph-stale` |
| Build (`settings.gradle*`, `pom.xml`, `package.json` com workspaces, `go.mod`) | `module`, `module-dep` quando não há graphify |
| Arquivo detectado que não abre | `unreadable`; a leitura continua. Também: arquivo de tipo reconhecido acima do limite (2 MB; grafo 64 MB) vira `arquivo grande demais (N MB)`, e um `.json` com nome de openapi/swagger/asyncapi que não parseia; os demais `.json`/`.yaml` genéricos que não servem ficam `ignored` |

Kubernetes: documentos com `{{` no `metadata.name` ou na imagem são templates não renderizados e são descartados.

**AsyncAPI 2.x:** a operação é vista do cliente. `subscribe` significa que **a aplicação envia** (publica) e `publish`
que ela recebe; o scan já normaliza isso (3.x: `send`/`receive`). Não inverta à mão.

## 3. Papel do repositório

Sempre perguntado. Microsserviço: o repositório é um **serviço** (container C4 / application component). Monolito ou
monolito modular: o repositório é o **sistema** e os deployáveis são containers. A sugestão vem do número de
deployáveis e módulos executáveis (um só: `service`; dois ou mais: `system`). Do compose, só contam como deployáveis
do repositório os serviços com `build` ou cuja imagem (último segmento, sem a tag) tem o nome do repositório; os
outros (imagem de outro repositório, por exemplo `acme/pagamentos` no compose de `pedidos`) são **hosts**: resolvem
como qualquer host de `env-ref` (container da base ou placeholder `ext.*`), também quando aparecem em `depends_on`, e
os fatos deles mesmos (variáveis do serviço vizinho) não entram no delta. Workloads k8s e Helm continuam contando
(descrevem o deploy do próprio repositório). A resposta fica em
`properties.repo` (URL sem credenciais ou caminho absoluto) e `properties.repoRole`; uma nova leitura reaproveita o
papel e avisa se o inventário o contradisser.

## 4. Mapeamento

**Papel `system`:** repositório = `c4:softwareSystem` (id: `--id`, o existente ou o nome normalizado). Deployáveis =
`c4:container`. Biblioteca = `c4:component` no container que mais depende dela (sem dono: container com tag
`library`). Banco, fila, cache e storage próprios = container com tag `database`/`queue`/`cache`/`storage`; cluster =
`archimate:node`. API = `application-interface` realizada pelo dono. `depends-on`, `env-ref`, `module-dep` = `uses`
(descrição com a evidência); `tf-ref` = `serving`.

**Papel `service`:** o repositório inteiro é **um** container em `--system`; módulos viram componentes; o resto segue
as mesmas regras com esse container como dono. Os nomes com que ele roda (serviço do compose, workload k8s, chart
Helm) diferentes do nome do repositório entram em `aliases` desse container (repo `pedidos` com serviço `pedidos-api`
→ alias `pedidos-api`), para que outros repositórios o achem pelo host. No papel `system`, os containers deployáveis
já levam esses nomes.

Regras comuns:

- **Tópico** (`channel`): container com tag `topic` e id global `topic.<nome>`. **Publicar** = `archimate:flow` do
  produtor para o tópico; **assinar** = `flow` do tópico para o consumidor.
- **Motor de banco** (`infra-image`, `cloud-resource`): `archimate:system-software` que **realiza** o container do
  banco. Fila, cache e storage são **servidos** (`serving`) pelo componente de tecnologia.
- **`tf-ref`** só liga recursos achados nos arquivos lidos (também entre arquivos).
- **Fluxo do graphify** = `archimate:business-process` `inferred`, servido pelos containers dos participantes. Como o
  graphify costuma ligar fluxos só a documentos, um fluxo pode não ter módulos como participantes; nesse caso ele se
  liga ao elemento do repositório.
- **Conceito de domínio** = `business-object` (ou `data-object`), acessado pelos containers que o usam.

## 5. Ids, proveniência e confiança

- Ids: `<sistema>`, `<sistema>.<servico>`, `<sistema>.<servico>.<modulo>`, `topic.<nome>` (global). Normalização:
  minúsculas, `[^a-z0-9]+` vira `-`. Ids já existentes na base têm prioridade.
- Todo item tem `sources: [{ kind: "repo", ref: "<url ou caminho>@<commit7>", path, line, excerpt }]`. Sem commit, o
  `ref` termina em `@sem-commit`. Módulo e dependência entre módulos achados no graphify e no build guardam o arquivo
  de build como fonte; a dependência fica com a maior contagem.
- A proveniência segue a leitura mais recente: no merge, as fontes `repo` que chegam substituem as fontes do **mesmo
  repositório** (o `ref` antes do último `@`) no item; fontes de outros repositórios, prompts e documentos ficam. Reler
  num commit novo troca o commit das fontes (o apply registra uma revisão), sem acumular commits antigos nem linhas
  que mudaram.
- Fatos de manifesto e contrato não levam `inferred`. Levam `inferred: true` e `confidence` (`alta`/`média`/`baixa`):
  componente por dependência, processo por hyperedge, relação por variável de ambiente, dono de biblioteca, elemento
  `ext.*` criado por host desconhecido.
- **Placeholder** (`ext.<host>`): `c4:softwareSystem` `external`, `inferred`, `confidence: baixa`, criado quando um
  host de configuração não está na base nem no repositório lido. Ele guarda o lugar até alguém confirmar o que é, ou
  até o repositório desse host ser lido (§6).

## 6. Correlação entre repositórios e visão de impacto

- Tópicos têm id global, então repositórios que publicam e assinam o mesmo tópico se encontram no merge.
- Um `env-ref` cujo host é um container já na base (último segmento do id ou alias, incluindo os nomes de runtime
  do §4) vira `uses` para ele; a resolução prefere o container real a um `ext.*`. Sem correspondência, nasce um
  placeholder `ext.<host>` (§5).
- **A leitura reivindica os placeholders que a representam.** Ao ler um repositório, cada elemento real que a leitura
  cria ou enriquece para o próprio repositório (papel `service`: o container dele; papel `system`: o sistema e cada
  deployável) procura na base placeholders `ext.*` `external` e `inferred` cujas fontes são **todas** `repo` (de
  qualquer repositório) e cujo nome normalizado bate com o nome do elemento, o último segmento do id ou um alias/nome
  de runtime dele. Para cada um, o delta traz:
  - `ops: [{ "op": "remove", "id": "ext.<host>", "reason": "substituído por <id real> (lido em <ref>)" }]`;
  - cada relação da base com o placeholder numa das pontas, reemitida com o id real no lugar dele, mesmo `type`,
    `description`, `technology` e `inferred`, e as **fontes originais** (o fato é do outro repositório; a leitura atual
    não carimba a sua proveniência nele).
  O merge não oferece como duplicata um elemento que o mesmo delta remove, então o plano mostra só a remoção (confirme
  com `yes`) e as relações novas; o placeholder some, e o container real não herda `external` nem `inferred`. Não é
  mais preciso responder `same` a uma duplicata `ext.*` × container real. Um placeholder com outra fonte (prompt,
  documento, edição manual) não é reivindicado: alguém o confirmou, e a duplicata volta a ser pergunta.
- A visão `impact` segue `flow`: o impacto de quem publica chega a quem assina. Salve uma por serviço, por exemplo
  `{ "key": "impacto-pedidos", "notation": "archimate", "viewpoint": "impact", "anchor": "loja.pedidos" }`.

## 7. Nova leitura

O merge casa por id e alias, então ler de novo atualiza. Ler duas vezes o mesmo commit não muda a base; num commit
novo, as fontes passam a apontar só para ele (§5). Isso vale também para um placeholder `ext.*` que só leituras
deste repositório criaram (todas as fontes `repo` com a chave dele): quando um host ainda resolve para ele, o delta o
reemite só com `id` e as fontes da leitura atual (sem `name`/`type`, logo sem conflito), e o merge troca as fontes do
commit antigo pelas novas. Um placeholder com fonte de outro repositório não é reemitido. O que sumiu
vira pergunta: só elementos cujas fontes são **todas** este repositório, que a leitura nova não produziu nem referencia
mais, entram no delta como `ops` `status: "retired"` (com motivo `não encontrado em <repo>@<commit7>`). Confirme um a
um (`yes`/`no`). Elementos com outras fontes não são tocados. Um placeholder reivindicado (§6) sai por `remove`, nunca
também por `retired`; se a remoção for recusada (`no`), ele fica, e a próxima leitura do repositório que o criou o
sugere como `retired` quando o host passar a resolver para o container real.

**Migração de identidade.** Uma base feita antes da identidade pelo remote guarda em `properties.repo` (e no `ref`
das fontes) o caminho absoluto da pasta. Numa nova leitura da mesma pasta, agora identificada pela URL do remote, o
caminho antigo é tratado como o mesmo repositório: o elemento com `properties.repo` igual ao caminho desta leitura é
encontrado (resumo `já na base`, sem `--id`), e as fontes `<caminho>@…` contam como deste repositório para o que
sumiu (`retired`) e para os placeholders (§6, acima). A diferença em `properties.repo` aparece uma vez, como conflito
normal (base = caminho, delta = URL): **migração: responda `take` para passar a identidade ao remote**. Com `keep`, a
base fica com o caminho e a pergunta volta na próxima leitura. As fontes antigas `<caminho>@<commit>` não são
substituídas pelas novas (o merge só troca fontes da mesma chave); elas continuam valendo como deste repositório
enquanto a leitura for da mesma pasta.

## 8. Graphify

Aproveitado: módulos (e dependências agregadas por contagem), fluxos, conceitos de negócio (até 10, de maior grau,
sem testes nem UI, e sem métodos — rótulo com `(` —, membros — começando por `.` — nem tipos de id — terminando em
`Id`/`ID`). Comunidades (`community_name` dos nós) aparecem só no resumo, em `comunidades (sugestões de componentes)`:
as 10 maiores com nome, sem as de teste; o delta as ignora. Barras invertidas de grafos gerados no Windows viram `/`. `graph-stale` avisa quando o
grafo é mais antigo que o commit. Sem `graphify-out/`, o scan usa manifestos de build e o resumo sugere rodar o
graphify no repositório (skill `graphify`, na raiz dele) e repetir a leitura.

## 9. Limites

- Terraform: não é um parser HCL completo. Valores interpolados ficam fora de `attrs` (as referências dentro deles
  ainda contam); heredocs são ignorados; bloco de uma linha (`resource "x" "y" { a = 1 }`) não guarda atributos; bloco
  sem fechar torna o arquivo `unreadable`. Sem `for_each`, expressões nem módulos remotos.
- Helm: templates só com `--helm-render` e o `helm` instalado; sem isso, só os `values`.
- Relações nunca são aposentadas: uma relação que sumiu do repositório continua na base (só elementos viram pergunta
  de `retired`, §7); remova-a com um delta de `ops` se for o caso.
- A reivindicação de placeholders (§6) compara nomes normalizados exatos: `ext.pagamentos-svc` não é reivindicado por
  um container `pagamentos` sem esse alias.
- Nomes de `Service` do Kubernetes não viram aliases do container; um host igual ao nome do `Service` (e diferente
  do workload) só resolve se o alias for adicionado à mão.
- Pastas `test`, `tests`, `__tests__` e `fixtures` fora de um caminho de deploy (§1) são puladas, inclusive um
  manifesto Kubernetes ou um contrato dentro delas (`src/test/resources/openapi.yaml`); o resumo lista os
  reconhecidos pelo nome (`arquivos reconhecidos e pulados`), mas um `.yaml` genérico pulado (um manifesto sem nome de
  contrato) não é aberto e conta só como `ignored`. Para ler uma dessas pastas, passe-a como raiz.
- Monorepo com vários sistemas: uma leitura por pasta.
- Credenciais e tokens: vêm do git do usuário; o archlens não os guarda.
- Código-fonte não é lido diretamente; vem do graphify.
