# P08 — Empacotamento e operação do servidor

**Linha:** v1 · **Tamanho:** M · **Depende de:** P06, P07, P17

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

9. **Ponto central (R4):** o servidor é o único lugar com credenciais do conector primário e das réplicas. Guia de
   segredos (arquivo montado, cofre), rotação, e rede: só o servidor alcança o banco e os repositórios.
10. **Operação das réplicas (P16):** estado e atraso de sincronização nas métricas e na rota de prontidão.
11. **Pronto para Kubernetes (D8):** servidor sem estado local obrigatório (sessão, propostas, cotas e clones em
    armazenamento externo ou volume declarado), várias réplicas atrás de um balanceador, sondas de saúde e
    prontidão, configuração só por ambiente e segredos montados. Dependências externas limitadas a PostgreSQL e
    armazenamento compatível com S3; **nenhum serviço específico de nuvem**. Um chart Helm como último ciclo.
12. **Agregador de identidade no exemplo (D5):** o `compose` de referência sobe um agregador (Keycloak) já
    configurado, e o guia mostra como apontar para Entra ID, Cognito ou outro emissor.
13. **Segredos por organização (D2, D3):** um provedor de segredos substituível guarda, cifradas, as credenciais de
    conector e as chaves de LLM de cada organização. Implementação padrão em arquivo ou banco; cofre externo como
    extensão.
14. **Coletor de medição (D7):** os eventos do P06 são persistidos e expostos (consulta por organização e período,
    exportação), sem lógica de cobrança.
15. **Nada global por processo (D6):** nenhuma configuração ou cache compartilhado entre organizações na memória.

## Fora do escopo

Operadores e recursos específicos de uma nuvem. Cobrança (P18).

## Critérios de aceite

- `docker compose up` com o exemplo sobe a GUI com uma base de exemplo, atrás de TLS e com login.
- Um teste de fumaça no CI constrói a imagem, sobe o contêiner e consulta `/healthz` e uma visão.
- Aplicar um plano dentro do contêiner regenera os diagramas (Chromium funciona sem privilégio extra, ou a limitação
  está documentada).
- Enviar `SIGTERM` durante um `apply` não deixa a base inconsistente.
- Num cluster Kubernetes local (kind ou k3d), duas réplicas do servidor atendem a mesma sessão e a mesma proposta;
  derrubar uma delas não perde trabalho.
- A chave de LLM de uma organização não aparece em log, em resposta de API nem em texto puro no armazenamento.

## Decisões a fechar no brainstorm

- Como as bases chegam ao servidor: volume, clone de um repositório git com sincronização, ou gbrain. Quem faz o push
  quando a GUI grava numa base que mora em git.
- Formato de métricas (Prometheus, OpenTelemetry) conforme o que o time já usa.
- Onde ficam os clones de repositório e os diagramas gerados com várias réplicas (volume compartilhado, S3, ou
  afinidade de sessão).
- Tamanho da imagem: Chromium embutido ou imagem "sem diagramas" opcional.

## Obrigações do repositório

archlens-ask: sem impacto. GUI: `npm run gui:test`; o teste de fumaça entra no CI de P01.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P08-empacotamento-e-operacao.md` e os specs de P06 e P07 já
> aprovados. Conduza o brainstorm começando por onde as bases do dono moram hoje e como ele quer que cheguem ao
> servidor.
