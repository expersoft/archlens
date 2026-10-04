# Exemplo: base construída a partir de repositórios

Três mini-repositórios (`pedidos`, `pagamentos`, `infra`) lidos pela CLI real, na ordem abaixo, até chegar em
`architecture/` e no `ARCHITECTURE.md` gerado. Rode a partir desta pasta (`A="node ../../scripts/archlens.mjs"`).

1. `$A scan pedidos --base architecture --as service --system loja --delta delta-pedidos.json`, depois
   `$A merge architecture delta-pedidos.json --plan plano-pedidos.json` e `$A merge architecture --apply plano-pedidos.json`.
   A base ainda não existe: o scan avisa que o delta é para uma base nova, e o `--apply` a cria. O container
   `loja.pedidos` guarda o nome do serviço do compose (`pedidos-api`) em `aliases`. O host `pagamentos` (variável
   `PAGAMENTOS_URL`) ainda não está na base, então nasce o placeholder `ext.pagamentos`.
2. `$A scan pagamentos --base architecture --as service --system financeiro --delta delta-pagamentos.json`. O sistema
   `financeiro` não existe: o scan avisa e o delta o cria. A leitura reivindica `ext.pagamentos`: o delta traz
   `remove ext.pagamentos` e a relação `loja.pedidos → financeiro.pagamentos` com a fonte original (a leitura de
   `pedidos`). O host `pedidos-api` (`PEDIDOS_URL`) resolve para `loja.pedidos` pelo alias. Respostas em
   `plano-pagamentos.json`: `tech.postgres-15` × `tech.postgres-16` = `different` (versões distintas) e a remoção de
   `ext.pagamentos` = `yes`.
3. `$A scan infra --base architecture --as system --id infra-cloud --delta delta-infra.json`, plano e apply (sem
   perguntas).
4. `delta-visoes.json`: delta de prompt com as visões de impacto (`impacto-pedidos`, `impacto-pagamentos`,
   `impacto-infra`), plano e apply.
5. `$A build architecture` e `$A check architecture`.

A visão `impacto-pedidos` mostra `financeiro.pagamentos` (que assina o tópico `pedido-criado`), porque o impacto segue
`flow`. Nenhum `ext.*` sobra para pedidos ou pagamentos, e nenhum dos dois containers fica `external`.

Como as pastas estão dentro do repositório do archlens, o commit registrado em `sources[].ref` é o do próprio archlens.
Os scans usam caminhos relativos, mas o `ref` de uma pasta local é sempre o caminho absoluto dela na máquina que fez a
leitura (comportamento do scan). Para um repositório real, o `ref` é a URL ou o caminho do repositório com o commit
dele.

Arquivos gerados (`ARCHITECTURE.md`, `architecture/diagrams/*`) nunca se editam à mão: use `archlens build architecture`.
