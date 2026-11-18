# GUI: configurar e operar o `archlens serve`

Configuração e operação da GUI web: o servidor, a busca com LLM, o Planejar e a edição pela tela. Para usar a GUI no
dia a dia, veja o [guia](GUIA.md#planejar-pela-gui). Este arquivo é a semente do guia do administrador (plano P08).

Uma interface web local para **explorar** a base: o diagrama no centro, a conversa e o histórico, o Explorador (visões
salvas e sugeridas, árvore por camada) e os Detalhes do elemento à direita.

```bash
npm run gui:build                                  # uma vez: instala e compila o front (apps/gui/dist)
bin/archlens serve architecture --open   # [--port N] [--host H]; padrão 127.0.0.1:5180
bin/archlens serve --config archlens-gui.json   # várias bases
```

```json
{ "bases": [{ "id": "loja", "name": "Loja online", "path": "examples/loja-online/architecture" }] }
```

Os `path` do `archlens-gui.json` valem a partir da pasta do próprio arquivo, não de onde o comando roda; cada base
precisa de `id` único e `path`.

> **Atenção:** com `--host` diferente de `localhost`/`127.0.0.1` (por exemplo `0.0.0.0`), a API — só leitura, mas
> **sem autenticação** — fica aberta a quem alcança a máquina pela rede. Em equipe, ponha um proxy com login na frente.

O que faz:

- **Navega** pelas visões: botão direito no elemento abre o menu de visões (contexto, containers, componentes,
  suporte, impacto…), duplo clique expande, a trilha e o histórico voltam a qualquer passo. A notação alterna entre
  ArchiMate e C4; o tema da interface (botão da barra do topo) e o do diagrama (o mesmo botão ☀/☾ na barra do diagrama, ou `T`
  no diagrama) são escolhidos em separado; o painel esquerdo (`Ctrl+B`) e o direito (`Ctrl+Alt+B` ou `Ctrl+Shift+B`) seguem o seu gosto.
- **Detalhes** do elemento: "Nesta visão" (tipo C4 e ArchiMate, papel, distância, relações como frases) e "Na base"
  (apelidos, pai, filhos, propriedades, fontes e rodadas). Em base `markdown` ou `gbrain`, o cartão Documentação do painel do nó traz o
  texto do nó.
- **Busca por nome** (`Ctrl+K`), seletor de base, e a troca de base reinicia o histórico.

- **Agrupar e desagrupar** (visões ArchiMate com elementos aninháveis): os botões `Agrupar tudo` e `Desagrupar tudo`
  da barra do diagrama aninham ou desaninham todos os elementos de uma vez, e o menu de contexto do elemento traz
  `Agrupar aqui dentro` e `Desagrupar` para um elemento só. Por baixo, a view spec ganha `nesting.except`, a lista dos
  elementos que ficam no sentido contrário ao padrão da visão.
- **Busca em texto** (opcional, com LLM): a caixa de pergunta da conversa transforma uma pergunta em linguagem natural
  numa visão, no cartão de um elemento ou numa pergunta de esclarecimento. Veja a seção seguinte.

O que não faz: **sem o modo Planejar ligado, só lê** e nunca grava a base (mudanças continuam em `archlens-plan` e
`archlens-apply`); veja "Planejar pela GUI" abaixo. O teste ponta a ponta, em Chromium real, é
`npm --prefix apps/gui run test:e2e`.

## Busca em texto (LLM)

A busca é **opt-in**: sem `llm` na configuração (nem `--llm` no `serve`), nada sai da máquina e a caixa de pergunta
mostra como ligar.

```bash
export ANTHROPIC_API_KEY=...        # ou ponha a chave num .env (abaixo)
bin/archlens serve architecture --llm anthropic [--model claude-haiku-5-5] [--env-file .env]
```

**A chave** vem do ambiente ou de um arquivo `.env`, nunca do `archlens-gui.json`, e nunca chega ao navegador nem
aparece em erro, log ou telemetria. O ambiente do processo vence o `.env`. O `.env` fica, por padrão, ao lado do
`archlens-gui.json` (ou na pasta atual em `serve <base>`); `--env-file` (ou `envFile` no JSON) aponta outro. Se o
arquivo não estiver no `.gitignore`, o `serve` avisa, porque a chave poderia ir para o repositório.

**Sem a chave:** com `--llm` na linha de comando, o `serve` não sobe e diz qual variável falta. Com o `llm` vindo do
`archlens-gui.json` (que o time pode versionar), a GUI sobe com a busca desligada: o terminal avisa e a caixa de
pergunta diz qual variável definir; diagramas e navegação seguem normais. Um `llm` malformado no arquivo continua
impedindo a subida.

**Logo da empresa.** O bloco `brand` do `archlens-gui.json` troca a marca do archlens no topo pelo logo da empresa
(com um traço e "archlens" discreto ao lado); a aba do navegador passa a ter o título `<name> · archlens`:

```json
{ "brand": { "name": "Acme", "logo": "marca/acme.svg", "logoDark": "marca/acme-claro.svg" } }
```

`logo` é obrigatório; `logoDark` (opcional) vale no tema escuro; `name` serve de texto alternativo e título. Os caminhos
são relativos à pasta do `archlens-gui.json` e precisam ficar dentro dela; só `.svg`, `.png` e `.webp`, até 1 MB. Com
`serve <base>` (sem arquivo de configuração) não há marca.

O bloco `llm` (e `telemetry`) do `archlens-gui.json`:

```json
{
  "bases": [{ "id": "loja", "path": "examples/loja-online/architecture" }],
  "llm": { "provider": "anthropic", "model": "claude-haiku-5-5", "effort": "low", "maxRounds": 4, "maxHistory": 4, "timeoutMs": 45000 },
  "telemetry": { "file": "telemetria.jsonl", "questions": false }
}
```

| Destino | `llm` |
|---|---|
| Anthropic | `{ "provider": "anthropic" }` (padrão `claude-haiku-5-5`; chave em `ANTHROPIC_API_KEY`) |
| OpenAI | `{ "provider": "openai", "model": "gpt-..." }` (chave em `OPENAI_API_KEY`) |
| OpenRouter | `{ "provider": "openai", "endpoint": "https://openrouter.ai/api/v1", "model": "...", "apiKeyEnv": "OPENROUTER_API_KEY" }` |
| Gateway compatível com OpenAI | `{ "provider": "openai", "endpoint": "https://gw.exemplo.com/v1", "model": "...", "apiKeyEnv": "GW_KEY" }` |
| Gateway compatível com Anthropic | `{ "provider": "anthropic", "endpoint": "https://gw.exemplo.com", "apiKeyEnv": "GW_KEY" }` |
| Azure OpenAI | `{ "provider": "openai", "endpoint": "https://x.openai.azure.com/openai/deployments/d", "model": "d", "auth": { "header": "api-key" }, "query": { "api-version": "2024-10-21" } }` |

Exemplo pronto com OpenRouter: `examples/loja-online/archlens-gui.json`. Copie `examples/loja-online/.env.example` para
`.env` na mesma pasta, preencha a chave e rode `bin/archlens serve --config examples/loja-online/archlens-gui.json --open`.

- `endpoint` (barras finais são ignoradas): no `openai`, a URL até a base da API, **com** o `/v1` quando o gateway o exige
  (a busca acrescenta `/chat/completions`); no `anthropic`, **sem** `/v1` (o SDK acrescenta `/v1/messages`). `auth` é
  `"x-api-key"`, `"bearer"`, `"none"` ou `{ "header": "nome" }`; `headers` põe cabeçalhos fixos e `query` parâmetros de
  URL.
- Segredos em cabeçalhos extras vão em `headersEnv` (`{ "x-tenant-key": "NOME_DA_VARIAVEL" }`), lidos do ambiente ou
  do `.env`, nunca escritos no JSON.
- `tools: false` para gateways que não fazem chamada de ferramentas: a busca passa ao modo sem ferramentas (o catálogo
  e as relações vão no prompt e o modelo responde um objeto JSON).
- **Tetos:** `maxRounds` (padrão 4 rodadas de modelo) e `timeoutMs` (padrão 45 s) por pergunta; ao bater o teto, a GUI
  mostra o melhor resultado obtido, com aviso.
- **Histórico da conversa:** `maxHistory` (padrão 4, de 0 a 50) diz quantas perguntas anteriores da conversa vão junto
  com a pergunta nova, para o modelo entender continuações ("e quem usa ele?"); `0` manda cada pergunta isolada.
- **O que sai da máquina:** o catálogo da base (elementos, tipos, visões) e a pergunta, somente para o provedor
  configurado. A telemetria (`GET /api/telemetry` e, se houver `telemetry.file`, uma linha JSON por pergunta) guarda só
  tempos e contagens; o texto da pergunta só entra com `telemetry.questions: true`.
- **Proteção dos POSTs:** os POSTs da API exigem `Content-Type: application/json` e recusam `Origin` de outro site.
  Atrás de um proxy reverso, preserve o cabeçalho `Host` original.

**Avaliação.** `npm --prefix apps/gui run eval -- [--provider anthropic|openai] [--model M] [--mode tools|json]
[--config archlens-gui.json] [--repeat 3] [--only id,id] [--dry]` roda as perguntas de `portable/archlens-ask/eval/perguntas.json` contra o
gabarito (mesma seleção de nós e arestas) e grava `apps/gui/eval/results/<data>-<modelo>-<modo>.{md,json}` com acerto,
P50/P90 e fração em uma rodada. `--config` reusa o bloco `llm` e o `.env` da GUI (endpoint, autenticação, cabeçalhos e chave), para medir o gateway que
será usado; sem `--config` a chave vem só do ambiente do processo, e `--provider`/`--model`/`--mode` sempre prevalecem.
`--dry` confere o encanamento sem chave. Metas: P50 ≤ 15 s e P90 ≤ 60 s (alvo ~5 s);
o acerto vem antes da velocidade.

## Planejar pela GUI

O modo **Planejar** leva o fluxo da `archlens-plan` e da `archlens-apply` para a GUI: você descreve a mudança num chat, o
agente monta o delta e o plano, pergunta as decisões por botões, mostra a prévia (diagrama, delta e plano) e, só quando
você clica em **Aplicar**, a base é gravada e o `ARCHITECTURE.md` e os diagramas são regenerados.

É **desligado por padrão** e exige um LLM **com ferramentas** (veja "Busca em texto"; `tools: false` não serve).
Liga-se com `--plan` na linha de comando ou com `plan` no `archlens-gui.json`; desligado, as rotas de planejamento
respondem 404 e a GUI continua só de leitura.

```bash
bin/archlens serve architecture --llm anthropic --plan
```

```json
{
  "bases": [{ "id": "loja", "path": "examples/loja-online/architecture" }],
  "llm": { "provider": "anthropic" },
  "plan": {
    "maxRounds": 40, "timeoutMs": 600000, "maxTokens": 400000,
    "gitTokenEnv": "GITHUB_TOKEN", "gitTokenHosts": ["github.com"], "gitUser": "x-access-token",
    "cloneTimeoutMs": 120000, "cloneMaxMb": 200, "allowFileUrls": false,
    "gitHosts": ["github.com", "git.interno.empresa.com.br"]
  }
}
```

`"plan": true` liga com os padrões acima. Sem chave do LLM, `--plan` impede a subida; com `plan` vindo do arquivo, o
planejamento fica desligado com aviso no terminal e na GUI (a mesma regra da busca). Numa base gbrain no modo MCP o
planejamento é recusado com mensagem clara; use a skill `archlens-plan`.

- **Tetos de uso:** `maxRounds` (rodadas de modelo, 1 a 100), `timeoutMs` (10 s a 30 min) e `maxTokens`, todos por
  mensagem. Ao bater um teto o agente para e a GUI mostra o rascunho como está, com aviso.
- **Anexar repositório:** o botão "Anexar repositório" do chat recebe uma URL git (`https://…` ou ssh) e, opcional, um
  ref. O servidor faz um clone raso e o agente lê **só dentro dele** (`scan_repo`, `read_file`, `grep`), recusando
  `.env*`, chaves, `.git/` e links que saem do clone. **Um repositório por rascunho:** aplique ou descarte o atual
  antes de anexar outro. `cloneTimeoutMs` e `cloneMaxMb` limitam o clone.
- **De onde o servidor clona:** antes de clonar, o servidor resolve o host e **recusa endereços de rede interna**
  (`localhost`, redes privadas, link-local como `169.254.169.254`), para não servir de ponte para a rede dele.
  `gitHosts` (opcional) é a lista de hosts permitidos: com ela, **só** esses hosts são clonados, e um host listado
  vale mesmo em rede interna (um Git local, por exemplo). Os hosts de `gitTokenHosts` também valem em rede interna, e
  com `gitHosts` definido têm de estar nela. Atrás de um proxy HTTPS (`HTTPS_PROXY`), um nome que o servidor não resolve é
  deixado para o proxy; para restringir os destinos nesse caso, use `gitHosts`.
- **Token do git (repositório privado):** `gitTokenEnv` é o **nome** da variável (ambiente ou `.env`, nunca o valor no
  JSON) e **`gitTokenHosts` é obrigatório junto com ele**: o token só é entregue aos hosts listados (`gitUser`
  é o usuário, padrão `x-access-token`), não importa que URL alguém anexe, e redirecionamentos do git são desligados.
  URL com credencial embutida (`https://usuário:token@…`) é recusada.
- **Credenciais da máquina do servidor:** URLs `https` de hosts fora de `gitTokenHosts` e URLs `ssh` são clonadas com
  as credenciais e a configuração git da máquina do servidor (credential helper, chaves e agente ssh, `~/.gitconfig`).
  Com a GUI ouvindo além de `localhost`, qualquer usuário que alcance a porta consegue ler os repositórios (e os hosts
  internos) que o servidor alcança.
- **`file://` e caminhos locais** são recusados, a não ser com `plan.allowFileUrls: true` (útil em testes e em
  máquina de confiança); sem isso só `https` e `ssh`.
- **Rascunho:** o delta, as respostas e o repositório ficam no navegador (localStorage, por base) e voltam depois de
  recarregar a página. `Salvar` grava o rascunho num arquivo e `Abrir` o restaura em outro navegador ou máquina; ao
  abrir, o servidor o valida e **replaneja** contra a base de agora. `Descartar` apaga o rascunho atual e a conversa
  (depois de confirmar), inclusive um rascunho salvo que o servidor não aceita mais.
- **Aplicar exige Chromium no servidor.** O servidor replaneja, confere que o plano é o que você confirmou e grava; em
  seguida regenera `ARCHITECTURE.md` e os diagramas, o que usa o Chromium (`npx playwright install chromium`, na máquina
  do servidor). Sem ele, a **base é gravada do mesmo jeito**, o documento é regenerado e a GUI avisa que os diagramas
  salvos não foram refeitos. Se o documento não puder ser regenerado depois da gravação, a GUI avisa que a base foi
  gravada e pede `archlens doc`.
- **Aviso de host:** com o modo ligado e `--host` diferente de `localhost`/`127.0.0.1`, o terminal avisa que qualquer um
  que alcance a porta pode aplicar. Não há autenticação: em equipe, ponha um proxy com login na frente.

**O chat só planeja arquitetura.** A barreira não é o prompt, é o que o servidor deixa o agente fazer: ele não tem
ferramenta de gravar, de rodar comando nem de acessar a rede; lê só a base, `references/` e o clone anexado; tudo o
que ele produz passa pelas validações do núcleo; conteúdo lido (README, textos da base) vai ao modelo marcado como dado, não
como ordem; chave e token nunca entram no prompt. Pedidos fora do escopo recebem uma frase fixa de recusa. A
avaliação desses limites roda sem chave no `gui:test` e, com um LLM real:

```bash
npm --prefix apps/gui run eval -- --plan-limits [--config archlens-gui.json] [--provider P] [--model M] [--dry]
```

## Editar o nó pela tela (Planejar)

No Planejar, a lateral direita tem duas abas, **Delta** e **Nó** (botões no trilho; clicar num nó da prévia ou no nome
de um item do Delta abre o Nó). O painel mostra o nó **como ficará** (base + rascunho), em cartões recolhíveis, com o
cabeçalho na cor da camada; o Navegar usa o mesmo painel, só leitura.

- **Propriedades:** `Editar` no cartão abre uma linha por propriedade, onde você altera valores, adiciona outras e
  remove. O tipo original (número, booleano, lista) é preservado; uma lista se edita como texto separado por vírgula.
  `Confirmar` põe a edição no rascunho, `Cancelar` descarta.
- **Documentação** (base `markdown` ou `gbrain`; em base `json` o cartão não aparece): `Editar` abre uma caixa de
  markdown redimensionável, com `Tela cheia`, que abre o **editor ampliado**: sumário dos títulos (clicar leva à seção e
  a destaca), **Lado a lado** (texto e prévia) como padrão, ou só Escrever ou só Prévia, barra de formatação que insere
  markdown (título, negrito, itálico, listas, citação, código, link, tabela), `Esc` fecha devolvendo o texto à caixa,
  `Ctrl+Enter` confirma, **Cancelar** pergunta antes de descartar e o foco fica preso na janela. Na leitura (Navegar sem
  Planejar, ou o cartão sem edição) a mesma janela abre só para ler. Trocar o texto pela tela não abre a pergunta com a
  diferença do chat.
- **Origem no Delta:** cada mudança leva o selo **chat** ou **tela**; nas da tela há **desfazer**, que apaga as edições
  da tela daquele nó e deixa o nó como o chat o deixa (ou como está na base).
- **O que não se perde:** as edições da tela ficam numa camada própria do rascunho, que sobrevive a recarregar a
  página, a `Salvar`/`Abrir` e a um `set_delta` do agente que não cita o nó.
- **Conflito com o chat:** se o chat quiser mudar uma propriedade ou documentação que você editou, abre um aviso:
  **Manter o seu** ou **Usar o do chat**; o **Aplicar** fica bloqueado até a resposta.
- **Enquanto o chat roda**, as edições da tela ficam travadas.
- Editar a estrutura (nós e relações) pela tela fica para uma fase seguinte.

**Editar no Navegar.** Com o Planejar ligado, o painel do nó do Navegar também tem `Editar` (propriedades e
documentação). `Confirmar` leva ao Planejar, na aba **Nó** daquele nó, com a mudança no Delta (selo **tela**); se já
existe rascunho, a edição se soma a ele. Com o Planejar desligado o Navegar segue só de leitura. Durante uma rodada do
chat ou uma gravação o `Editar` fica desabilitado (`Aguarde o chat terminar para editar`, `Aguarde a gravação
terminar`), e um rascunho salvo ilegível não é sobrescrito: o erro aparece e o modo não muda. O nó que o rascunho remove
mostra "removido pelo rascunho" e não oferece `Editar`; nós que só existem no rascunho se editam no Planejar.

**Avisos da visão.** Uma visão grande demais para a tela, ou com nota de layout, mostra um selo **⚠ n** ao lado das
ferramentas do diagrama (no Navegar e na prévia do Planejar) em vez de uma faixa sobre o diagrama. O painel do selo
explica cada aviso e oferece só as ações que se aplicam: agrupar, focar no selecionado, mostrar só uma camada e
apresentar com zoom. A CLI e o `embed` continuam imprimindo os mesmos textos de `alerts`.
