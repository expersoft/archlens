# Lendo repositórios: `archlens scan`

`scan` lê uma pasta ou URL git e devolve um **inventário** (fatos com arquivo e linha) e, com `--as`, um **delta**
com proveniência. Nunca grava na base nem altera o repositório lido.

## 1. Quando usar e o fluxo

Use quando o usuário apontar um repositório (pasta ou URL git) como fonte de arquitetura.

1. `archlens scan <repo> --base <base>`: imprime o resumo (fatos por fonte, avisos, papel sugerido, elemento já
   existente, sistemas prováveis com o motivo). Sem base, avisa e segue.
2. **Pergunte o papel e o sistema** mostrando a sugestão e os motivos. Nunca assuma pelo nome.
3. `archlens scan <repo> --base <base> --as system|service [--system <id>] [--id <id>] --delta d.json [--from inv.json]`.
   `--from` reaproveita um inventário salvo com `--out inv.json`.
4. Troque nomes técnicos por nomes de negócio (os técnicos vão para `aliases`), ligue processos a capacidades já
   modeladas e sugira agrupamentos.
5. `merge <base> d.json --plan p.json`, responda só os itens com `"resolution": null`, `merge <base> --apply p.json`.
   Com `--as service`, o `--system` precisa existir na base (`E_SCAN_TARGET`); crie-o antes por um delta.

Erros: `E_SCAN_SOURCE` (pasta/URL inválida ou clone falhou), `E_SCAN_ROLE` (`--as` ausente/inválido; `service` sem
`--system`), `E_SCAN_TARGET` (`--id`/`--system` inexistente ou de tipo inesperado).

URL: `git clone --depth 1` (`--ref` escolhe branch/tag) numa pasta temporária, apagada ao fim; repositório privado usa
as credenciais git do usuário. Pasta local usa o commit atual, com aviso se houver alterações não commitadas.
Ignora `node_modules`, `vendor`, `.git`, `build`, `dist`, `target`, `.gradle`, `.venv` e o `.gitignore` da raiz.

## 2. Fontes lidas e fatos

| Fonte | Fatos |
|---|---|
| docker-compose | `service`, `depends-on`, `env-ref` (host em variável), `infra-image` (postgres, mysql, redis, kafka…) |
| Kubernetes | `workload`, `k8s-service`, `ingress`, `env-ref` |
| Helm (`Chart.yaml`, `values*.yaml`) | `chart`, imagem, ingress e env dos values; `--helm-render` usa `helm template` se o `helm` existir |
| Terraform (`*.tf`) | `cloud-resource` (database, messaging, storage, cache, cluster, other), `tf-ref` |
| OpenAPI / Swagger | `api` (título, versão, servers, operações, tags) |
| AsyncAPI | `channel` com `publish` ou `subscribe` |
| Graphify (`graphify-out/graph.json`) | `module`, `module-dep`, `flow`, `domain-concept`, `graph-stale` |
| Build (`settings.gradle*`, `pom.xml`, `package.json` com workspaces, `go.mod`) | `module`, `module-dep` quando não há graphify |
| Arquivo detectado que não abre | `unreadable`; a leitura continua |

**AsyncAPI 2.x:** a operação é vista do cliente. `subscribe` significa que **a aplicação envia** (publica) e `publish`
que ela recebe; o scan já normaliza isso (3.x: `send`/`receive`). Não inverta à mão.

## 3. Papel do repositório

Sempre perguntado. Microsserviço: o repositório é um **serviço** (container C4 / application component). Monolito ou
monolito modular: o repositório é o **sistema** e os deployáveis são containers. A sugestão vem do número de
deployáveis e módulos executáveis (um só: `service`; dois ou mais: `system`). A resposta fica em
`properties.repo` (URL sem credenciais ou caminho absoluto) e `properties.repoRole`; uma nova leitura reaproveita o
papel e avisa se o inventário o contradisser.

## 4. Mapeamento

**Papel `system`:** repositório = `c4:softwareSystem` (id: `--id`, o existente ou o nome normalizado). Deployáveis =
`c4:container`. Biblioteca = `c4:component` no container que mais depende dela (sem dono: container com tag
`library`). Banco, fila, cache e storage próprios = container com tag `database`/`queue`/`cache`/`storage`; cluster =
`archimate:node`. API = `application-interface` realizada pelo dono. `depends-on`, `env-ref`, `module-dep` = `uses`
(descrição com a evidência); `tf-ref` = `serving`.

**Papel `service`:** o repositório inteiro é **um** container em `--system`; módulos viram componentes; o resto segue
as mesmas regras com esse container como dono.

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
  `ref` termina em `@sem-commit`.
- Fatos de manifesto e contrato não levam `inferred`. Levam `inferred: true` e `confidence` (`alta`/`média`/`baixa`):
  componente por dependência, processo por hyperedge, relação por variável de ambiente, dono de biblioteca, elemento
  `ext.*` criado por host desconhecido.

## 6. Correlação entre repositórios e visão de impacto

- Tópicos têm id global, então repositórios que publicam e assinam o mesmo tópico se encontram no merge.
- Um `env-ref` cujo host é um container já na base (id ou alias) vira `uses` para ele; a resolução prefere o
  container real a um `ext.*`. Sem correspondência, nasce um elemento `inferred` (`ext.*`), que você confirma ou
  renomeia.
- O merge pergunta possíveis duplicatas (por exemplo `ext.pagamentos` × o container real). Responda `same` se for a
  mesma coisa; os conflitos de `type`/`name` que vierem junto pedem `take`/`keep` conscientes.
- A visão `impact` segue `flow`: o impacto de quem publica chega a quem assina. Salve uma por serviço, por exemplo
  `{ "key": "impacto-pedidos", "notation": "archimate", "viewpoint": "impact", "anchor": "loja.pedidos" }`.

## 7. Nova leitura

O merge casa por id e alias, então ler de novo atualiza. Ler duas vezes o mesmo commit não muda a base. O que sumiu
vira pergunta: só elementos cujas fontes são **todas** este repositório, que a leitura nova não produziu nem referencia
mais, entram no delta como `ops` `status: "retired"` (com motivo `não encontrado em <repo>@<commit7>`). Confirme um a
um (`yes`/`no`). Elementos com outras fontes não são tocados.

## 8. Graphify

Aproveitado: módulos (e dependências agregadas por contagem), fluxos, conceitos de negócio (até 10, de maior grau,
sem testes nem UI). Comunidades aparecem só no relatório, como sugestão de agrupamento. `graph-stale` avisa quando o
grafo é mais antigo que o commit. Sem `graphify-out/`, o scan usa manifestos de build e o resumo sugere rodar o
graphify no repositório (skill `graphify`, na raiz dele) e repetir a leitura.

## 9. Limites

- Terraform: não é um parser HCL completo. Valores interpolados ficam fora de `attrs` (as referências dentro deles
  ainda contam); heredocs são ignorados; bloco de uma linha (`resource "x" "y" { a = 1 }`) não guarda atributos; bloco
  sem fechar torna o arquivo `unreadable`. Sem `for_each`, expressões nem módulos remotos.
- Helm: templates só com `--helm-render` e o `helm` instalado; sem isso, só os `values`.
- Monorepo com vários sistemas: uma leitura por pasta.
- Credenciais e tokens: vêm do git do usuário; o archlens não os guarda.
- Código-fonte não é lido diretamente; vem do graphify.
