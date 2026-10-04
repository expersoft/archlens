# Exemplo: base construída a partir de repositórios

Três mini-repositórios (`pedidos`, `pagamentos`, `infra`) lidos pela CLI real, na ordem abaixo, até chegar em
`architecture/` e no `ARCHITECTURE.md` gerado. Rode a partir desta pasta (`A="node ../../scripts/archlens.mjs"`).

1. `scan pedidos --as service --system loja --delta delta-pedidos.json`, depois `merge --plan` e `--apply`
   (a primeira leitura não tem base, por isso não usa `--base`).
2. `delta-financeiro.json`: delta de prompt que cria o sistema `financeiro`. O `scan --as service` exige que o sistema
   exista na base (`E_SCAN_TARGET`).
3. `scan pagamentos --base architecture --as service --system financeiro --delta delta-pagamentos.json`. O plano
   perguntou três duplicatas; respostas dadas em `plano-pagamentos.json`:
   `financeiro.pagamentos` = `ext.pagamentos` (`same`, com `type` = `take`); `tech.postgres-15` × `tech.postgres-16`
   (`different`, versões distintas); `ext.pedidos-api` = `loja.pedidos` (`same`, com `type` e `name` = `keep`).
4. `scan infra --base architecture --as system --id infra-cloud --delta delta-infra.json`.

Cada delta leva uma visão salva de impacto (`impacto-pedidos`, `impacto-pagamentos`, `impacto-infra`). A de pedidos
mostra o pagamento (que recebe o tópico `pedido-criado`), porque o impacto segue `flow`.

Como as pastas estão dentro do repositório do archlens, o commit registrado em `sources[].ref` (`@fcfb61d`) é o do
próprio archlens, e os caminhos de `ref` são absolutos da máquina que gerou o exemplo. Para um repositório real, o
`ref` é a URL ou o caminho do repositório com o commit dele.

Arquivos gerados (`ARCHITECTURE.md`, `architecture/diagrams/*`) nunca se editam à mão: use `archlens build architecture`.
