# Exemplo: base construída a partir de repositórios

Três mini-repositórios (`pedidos`, `pagamentos`, `infra`) lidos pela CLI real, na ordem abaixo, até chegar em
`architecture/` e no `ARCHITECTURE.md` gerado. Rode a partir desta pasta (`A="node ../../scripts/archlens.mjs"`).

As pastas daqui não são repositórios git (estão dentro do repositório do archlens). Lidas direto, a identidade delas
seria o caminho absoluto na máquina de quem leu. Para a base trazer refs estáveis, cada pasta é copiada para um
repositório git temporário com remote `origin` em `https://example.com/acme/<nome>`, e o scan lê essa cópia: numa
pasta local que é a raiz de um clone com remote, a identidade é a URL do remote. As fontes ficam
`https://example.com/acme/<nome>@<commit>` (o commit é o da cópia; datas e autor fixos o tornam reprodutível):

```sh
T=$(mktemp -d)
export GIT_AUTHOR_NAME=acme GIT_AUTHOR_EMAIL=dev@example.com GIT_COMMITTER_NAME=acme GIT_COMMITTER_EMAIL=dev@example.com
export GIT_AUTHOR_DATE=2026-10-03T12:00:00Z GIT_COMMITTER_DATE=2026-10-03T12:00:00Z
for n in pedidos pagamentos infra; do
  cp -r $n $T/$n && git -C $T/$n init -q && git -C $T/$n add -A && git -C $T/$n commit -qm "exemplo $n"
  git -C $T/$n remote add origin https://example.com/acme/$n
done
```

Nos passos abaixo, `pedidos`, `pagamentos` e `infra` no `scan` são `$T/pedidos`, `$T/pagamentos` e `$T/infra`.

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

Para um repositório real, lido por URL ou por um clone local com remote, o `ref` é a URL do repositório (sem
credenciais) com o commit dele; sem remote, é o caminho absoluto da pasta.

Arquivos gerados (`ARCHITECTURE.md`, `architecture/diagrams/*`) nunca se editam à mão: use `archlens build architecture`.
