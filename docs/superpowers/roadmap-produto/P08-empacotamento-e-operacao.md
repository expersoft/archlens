# P08 — Empacotamento e operação do servidor

**Trilha:** Servidor de time · **Tamanho:** M · **Depende de:** P06, P07

## Objetivo

Um administrador sobe o archlens num servidor interno em menos de uma hora, seguindo um guia, e consegue saber se ele
está saudável.

## Evidência

- Não há `Dockerfile`, `compose` nem guia de implantação. A GUI sobe por `bin/archlens serve --config archlens-gui.json`.
- `apps/gui/dist/` não é versionado; exige `npm run gui:build` na máquina.
- Aplicar um plano pela GUI regenera os diagramas com Chromium (`chromiumUsable()` em `apps/gui/server/app.mjs`); sem
  ele, a GUI avisa e a base fica sem diagramas atualizados.
- Sem rota de saúde. Log por `console.error`. A telemetria (`apps/gui/server/ask/telemetry.mjs`) é um arquivo local
  com as últimas 500 chamadas ao LLM.
- Sem tratamento de sinal para encerrar: uma gravação em curso pode ser cortada (a escrita é atômica por arquivo, mas
  o fluxo "grava base → documento → diagramas" não é).
- Clones de repositório vão para a pasta temporária do sistema, com validade de 30 min (`plan/repo.mjs`).
- A chave do LLM vem de variável de ambiente ou `.env` (`envfile.mjs`), nunca do arquivo de configuração.

## Escopo

1. **Imagem de contêiner** com Node, git, a GUI compilada e o Chromium do Playwright; usuário sem privilégio; sistema
   de arquivos somente leitura fora dos volumes.
2. **`compose` de exemplo:** archlens + proxy com TLS + (conforme P06) o autenticador. Volumes para as bases e para
   os dados do servidor.
3. **Configuração por ambiente** além do arquivo JSON, com validação e mensagem clara no início.
4. **Saúde e prontidão** (`/healthz`, `/readyz`): bases carregadas, provedor de LLM configurado, Chromium presente.
5. **Logs estruturados** (JSON, com identificador de requisição e usuário) e **métricas** (requisições, latência,
   tokens, erros por código `E_*`).
6. **Encerramento limpo:** parar de aceitar requisições, esperar gravações em curso, limpar clones.
7. **Guia do administrador:** instalar, configurar bases (pasta local, repositório git, gbrain), segredos, cópia de
   segurança e restauração, atualização de versão, solução de problemas.
8. **Publicar a imagem** no registro do GitHub pelo fluxo de release (em conjunto com P14).

## Fora do escopo

Kubernetes/Helm (pode ser um ciclo posterior). Alta disponibilidade com várias réplicas, a menos que P06 já tenha
decidido guardar sessão fora da memória.

## Critérios de aceite

- `docker compose up` com o exemplo sobe a GUI com uma base de exemplo, atrás de TLS e com login.
- Um teste de fumaça no CI constrói a imagem, sobe o contêiner e consulta `/healthz` e uma visão.
- Aplicar um plano dentro do contêiner regenera os diagramas (Chromium funciona sem privilégio extra, ou a limitação
  está documentada).
- Enviar `SIGTERM` durante um `apply` não deixa a base inconsistente.

## Decisões a fechar no brainstorm

- Como as bases chegam ao servidor: volume, clone de um repositório git com sincronização, ou gbrain. Quem faz o push
  quando a GUI grava numa base que mora em git.
- Formato de métricas (Prometheus, OpenTelemetry) conforme o que o time já usa.
- Uma réplica só (simples, estado em memória e disco) ou preparar para várias.
- Tamanho da imagem: Chromium embutido ou imagem "sem diagramas" opcional.

## Obrigações do repositório

archlens-ask: sem impacto. GUI: `npm run gui:test`; o teste de fumaça entra no CI de P01.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P08-empacotamento-e-operacao.md` e os specs de P06 e P07 já
> aprovados. Conduza o brainstorm começando por onde as bases do dono moram hoje e como ele quer que cheguem ao
> servidor.
