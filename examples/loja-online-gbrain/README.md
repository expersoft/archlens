# loja-online-gbrain: a base compartilhada num gbrain (modo git)

Demonstração local do e.4.1: a base `loja-online` vive num **gbrain** e num **repositório git do time**. Arquitetos
planejam e aplicam mudanças pelo archlens; qualquer pessoa (ou a IA corporativa) consulta direto no gbrain.

Nada aqui é instalado globalmente e o seu `~/.gbrain` não é tocado: tudo fica em `.demo/`, ignorado pelo git.

## Montar

Requer Node ≥ 18, git e [Bun](https://bun.sh) ≥ 1.4 no PATH. Da raiz do repositório:

```bash
node examples/loja-online-gbrain/setup.mjs        # ~1 min na primeira vez (baixa e instala o gbrain)
```

O que ele faz, em ordem:

1. baixa o gbrain no commit fixado nos testes (`ac1ba4c`, versão 0.60.304) para `.demo/gbrain/` e instala as dependências
   ali (`bun install --ignore-scripts`);
2. cria um cérebro PGLite, sem embeddings, em `.demo/home/` (o `GBRAIN_HOME` da demonstração);
3. cria o repositório do time (`.demo/arquitetura.git`, um repositório git *bare*) e a cópia dele que o gbrain sincroniza
   (`.demo/gbrain-source/`, registrada como a fonte `arquitetura`);
4. cria o clone de quem usa o archlens (`.demo/meu-clone/`);
5. copia `examples/loja-online/architecture` para `architecture/` e roda
   `archlens store convert architecture --to gbrain --mode git --repo .demo/meu-clone`: a base vira 81 páginas markdown sob
   `archlens/`, num commit enviado ao repositório do time;
6. ativa o schema pack do archlens no gbrain (`gbrain schema use`) e sincroniza (`gbrain sources refresh arquitetura`).

## Onde ficam os dados

| Pasta | O que é |
|---|---|
| `.demo/arquitetura.git` | **fonte da verdade**: o repositório do time, com as páginas em `archlens/<tipo>/<id>.md`, `manifest.md`, `views/`, `notes/`, `changelog.md` |
| `.demo/gbrain-source/` | a cópia que o gbrain sincroniza a partir do repositório do time |
| `.demo/home/.gbrain/` | o cérebro do gbrain (banco PGLite com o índice, a busca e o grafo) |
| `.demo/meu-clone/` | o clone de quem usa o archlens; o archlens grava numa worktree dele, em `architecture/.archlens/tip/` |
| `architecture/archlens.json` | só a configuração: `store: { kind: "gbrain", mode: "git", repo: "../.demo/meu-clone", … }` |
| `ARCHITECTURE.md`, `architecture/diagrams/` | gerados localmente pelo archlens |

## Consultar pelo archlens

```bash
node scripts/archlens.mjs query examples/loja-online-gbrain/architecture --element loja.pedidos
node scripts/archlens.mjs query examples/loja-online-gbrain/architecture --view impacto-api-pedidos
node scripts/archlens.mjs deliver examples/loja-online-gbrain/architecture --view containers --out /tmp/containers.html
```

No modo git o archlens lê direto do repositório do time; não há `pull`.

## Consultar direto no gbrain

`setup.mjs gbrain …` roda o gbrain da demonstração com o `GBRAIN_HOME` dela. `gbrain call <ferramenta> <json>` executa a
mesma operação que o MCP do gbrain expõe:

```bash
G="node examples/loja-online-gbrain/setup.mjs gbrain"
$G call list_pages '{"tag":"archlens","limit":5}'                                  # páginas do archlens
$G call list_pages '{"tag":"archlens/application-component"}'                      # só aplicações
$G call get_page '{"slug":"archlens/application-component/loja.pedidos"}'          # uma página
$G call traverse_graph '{"slug":"archlens/application-component/loja.pedidos","depth":1,"direction":"out"}'
$G call get_backlinks '{"slug":"archlens/application-component/loja.pedidos"}'     # o que aponta para ela
$G call search '{"query":"pagamento","limit":5}'                                   # busca por texto
```

O `traverse_graph` devolve as ligações com os tipos ArchiMate (`serving`, `realization`, `part_of`…) que o schema pack
declara.

## Mudar a base e ver no gbrain

```bash
B=examples/loja-online-gbrain/architecture
node scripts/archlens.mjs plan $B delta.json --out /tmp/p1.json    # responda as perguntas e refaça com --answers até sair final
node scripts/archlens.mjs apply $B /tmp/p2.json                    # um commit + push para o repositório do time
node examples/loja-online-gbrain/setup.mjs sync                    # o gbrain importa o que chegou
```

Num ambiente real, a sincronização do gbrain roda sozinha (cron, watcher ou hook); aqui ela é manual.

## Desmontar

```bash
node examples/loja-online-gbrain/setup.mjs down    # apaga .demo/, architecture/ e ARCHITECTURE.md
```
