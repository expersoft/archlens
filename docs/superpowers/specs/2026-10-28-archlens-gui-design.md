# archlens GUI: navegação e busca em texto sobre a base de arquitetura

- **Data:** 2026-10-28
- **Branch:** a criar a partir de `develop-v2` (PR de volta para `develop-v2`)
- **Status:** desenhado com o usuário em conversa (brainstorming), com esboços de tela no navegador e uma rodada de
  perguntas de um revisor (identidade no modo equipe e várias bases respondidas pelo usuário). As decisões marcadas
  *(decisão do agente)* podem ser revistas na leitura
- **Depende de:** [plan, apply e query](2026-10-18-plan-apply-query-design.md) (e.3): a semântica das visões que a GUI
  reproduz; [conectores](2026-10-17-store-connectors-design.md) e [conector gbrain](2026-10-18-gbrain-connector-design.md)
  (e.2, e.4.1): de onde a base é lida; [archlens-ask](2026-10-25-archlens-ask-design.md): o conjunto de perguntas de
  validação reaproveitado aqui; [débito de latência](2026-10-28-diagram-latency-tech-debt.md): a medição que orienta o
  desenho da busca

## Contexto e objetivo

Hoje, para consultar a base, há duas portas:

- a skill `archlens-query`, que roda no Claude Code;
- o archlens-ask, que roda em assistentes sem execução de código, como o M365 Copilot.

As duas entregam diagramas ou texto a partir de uma pergunta. Nenhuma das duas permite **navegar**: partir de um nó,
abrir quem depende dele, descer de sistema para containers ou trocar de ArchiMate para C4 sem formular uma pergunta nova.
A `archlens-query` também é lenta. A medição de 2026-10-28 deu ~30 s até o diagrama, ~88% disso em turnos do modelo.

**Objetivo:** uma aplicação web, a **archlens GUI** *(nome: decisão do agente)*, para consultar a base sem terminal.
Ela oferece:

1. as visões padrão (C4 e ArchiMate) e as visões salvas da base;
2. busca em texto interpretada por um LLM, que gera o diagrama em poucos segundos;
3. navegação a partir dos nós (expandir, trocar de notação, dependentes por tipo, matriz de dependência, grupos), em que
   cada passo gera uma visão nova sem passar pelo LLM.

**Público:** o mesmo da `archlens-query` e do archlens-ask. São arquitetos e desenvolvedores perto do repositório e
quem só consulta (produto, negócio, gestão).

## Metas

1. **Responder tão bem quanto a `archlens-query`.** Para a mesma pergunta, os mesmos elementos, as mesmas relações
   (inclusive as derivadas) e o mesmo desenho. Isso inclui matriz de dependência e fluxos completos. **Errar a resposta
   é o fracasso inaceitável**, mesmo que a GUI seja rápida.
2. **Busca em texto rápida.** Os alvos do usuário são P50 ≤ 15 s e P90 ≤ 60 s, medidos de Enter até o diagrama na
   tela. Esses são o teto, a meta de trabalho é ~5 s no P50 *(decisão do agente)*. A viabilidade se confirma com
   medição (seção *Avaliação*).
3. **Navegação por clique sem LLM**, abaixo de 1 s por passo numa base do tamanho dos exemplos.
4. **Duas formas de rodar, um código só:**
   - **local:** `archlens serve <base>` na máquina de cada um;
   - **equipe:** um servidor publicado, em imagem Docker.
5. **Fontes da base no MVP:**
   - gbrain via MCP, direto ou por um gateway de LLM que ofereça ferramentas compatíveis com as do gbrain;
   - gbrain via git;
   - markdown;
   - json *(decisão do agente: o conector já existe)*.

   A fonte é escolhida pelo `archlens.json` da base, como hoje.
7. **Várias bases por servidor** *(decisão do usuário)*. A configuração do servidor tem uma lista de bases, cada uma com
   id, nome e localização (pasta, repositório git ou prefixo no gbrain com o endpoint MCP). A tela tem um seletor de
   base, e as rotas da API levam o id da base. Modelo em memória, cache e telemetria são por base. O `archlens serve
   <base>` local abre uma base só, que é a lista com um item. Uma pergunta que não deixa claro a qual base se refere
   (a pergunta `duas-bases` do eval) é respondida na base selecionada na tela.
6. **LLM plugável por chave de API:** Anthropic, OpenAI, OpenRouter ou gateway interno.

## Fora do escopo (MVP)

- **Escrever na base.** A GUI só lê. Mudar a base continua com `archlens-plan` → `archlens-apply`. Uma visão que o
  usuário queira manter pode, no máximo, ser exportada como delta para a `archlens-plan` (ver *Deixado ao construtor*).
- **Gestão de usuários e autenticação própria.** No modo equipe, a autenticação fica num proxy ou SSO na frente da
  aplicação *(palpite confirmado pelo usuário)*.
- **Leitura com a identidade de cada usuário.** No MVP, o servidor lê a base com uma **credencial de serviço** única
  (git, MCP do gbrain ou gateway), e todos os usuários veem a mesma base *(decisão do usuário)*. Repassar o token de
  cada usuário, com modelo e cache por usuário ou por escopo, fica previsto para depois. O desenho não deve impedir:
  o acesso à base passa por um ponto só (o "contexto de base"), que hoje é global e depois poderá ser por usuário.
- **Outras fontes**, como neo4j ou banco relacional. Elas virão no futuro do archlens como novos conectores. A GUI não
  pode fechar esse caminho: lê a base **só pelo contrato de conector** (ver *Fontes*).
- **O modo "MCP só na inferência"**, em que o gateway entrega as ferramentas do gbrain apenas ao modelo e a GUI nunca
  enxerga a base. Fica previsto no desenho e registrado como risco (ver *Fontes*), mas só será construído se o gateway
  real for assim.
- **Preview de deltas/planos** (`archlens preview`). Continua na `archlens-plan`.

## Anti-metas

- **Um segundo motor de diagramas.** A GUI não reimplementa resolução, layout ou render numa biblioteca de grafos
  (React Flow, Cytoscape etc.). Faria isso divergir da skill, e a meta 1 cai.
- **Regras de consulta só da GUI.** O que o LLM da GUI sabe sobre como traduzir pergunta em spec sai das mesmas
  `references/` que a `archlens-query` usa. Não existe um texto paralelo que envelhece separado.
- **Mudar o núcleo para acomodar a GUI.** Vale o mesmo sentido único do archlens-ask: quem manda é o archlens completo. O
  núcleo pode ganhar exportações e ajustes que **também** servem à CLI (ver *Mudanças no núcleo*), mas nunca uma regra de
  visão diferente para a GUI.

## Onde vive

**No repositório do archlens, como pacote próprio** *(recomendação do agente, aceita pelo usuário)*:

```
apps/gui/              ← workspace npm; package.json, testes e build próprios
  server/              ← Node: API HTTP, conectores, LLM, cache do modelo
  web/                 ← React: telas
  Dockerfile
```

Motivos:

- `scripts/lib` não é uma API publicada nem versionada. Num repositório à parte, cada mudança no núcleo exigiria
  lançar uma versão e depois atualizar a GUI. No mesmo repositório, a GUI importa `scripts/lib` direto, e uma quebra
  aparece no PR que mexeu no núcleo.
- O plugin do Claude Code é o repositório inteiro (`marketplace.json` com `source: './'`). A GUI no repositório
  pesa no clone do plugin, mas pouco: o build (`dist/`) e o `node_modules` da GUI ficam fora do git. O plugin
  continua sem build e sem dependências em tempo de execução. A raiz do repositório **não** ganha dependências da GUI.
- O `npm test` da raiz continua testando só o archlens. A GUI tem os próprios testes, que rodam no CI do mesmo PR
  *(decisão do agente)*.
- Se o peso no plugin incomodar um dia, separar depois é barato, porque a fronteira já é um pacote.

O `archlens serve` é um comando da CLI que sobe o servidor da GUI. Ele só funciona se o pacote da GUI estiver
construído. Sem ele, a mensagem diz como construir (`npm run gui:build`) *(decisão do agente)*.

## Stack

*(escolha do usuário: React + Node; Docker para servidor)*

- **Front:** React + TypeScript, empacotado com Vite *(decisão do agente)*.
- **Servidor:** Node (≥ 18, o mesmo `engines` do archlens), ESM, importando `scripts/lib`. O framework HTTP fica a
  critério do construtor, de preferência um leve.
- **Docker:** uma imagem com o servidor e o front construído. Base, provedor de LLM e fonte vêm por variáveis de
  ambiente e arquivo de configuração montado. Credenciais nunca vão para a imagem.

## Arquitetura

```
navegador (React)                         servidor (Node)                          fontes
┌──────────────────────┐   HTTP/JSON   ┌────────────────────────────────┐
│ busca · abas · trilha│──────────────▶│ /api/catalog  /api/view        │
│ SVG do archlens      │◀──────────────│ /api/element  /api/ask (stream)│
│ hover · menu direito │               │                                │
└──────────────────────┘               │ modelo em memória (por versão) │◀── conector (contrato)
                                       │ resolveView · layout · render  │     json · markdown ·
                                       │ agente de busca (LLM + tools)  │     gbrain git · gbrain MCP
                                       └───────────────┬────────────────┘
                                                       ▼
                                             provedor de LLM (API key)
```

Princípio: **toda visão é uma spec**. Pergunta em texto, clique no menu, visão salva e troca de notação produzem uma
view spec no formato de `references/views.md`. O servidor resolve, faz o layout e devolve o SVG. O LLM só aparece
quando é preciso traduzir texto em spec.

### Servidor

- **Modelo em memória.** Na subida, o servidor abre a base pelo conector e mantém o modelo normalizado em memória,
  junto com a `version` do conector. Ele confere a versão periodicamente e, quando ela muda, recarrega
  *(decisão do agente: intervalo configurável)*. Cada resposta leva a versão da base que a produziu.
- **Endpoints** *(nomes indicativos; formato fica ao construtor)*:
  - `GET /api/catalog`: visões salvas e sugeridas (o mesmo de `archlens views`), árvore de elementos (hierarquia por
    `parent` e grupos) e a versão da base.
  - `POST /api/view`: recebe uma spec e devolve o SVG da visão, os metadados por nó e aresta que a interação usa
    (id, nome, tipo, perfil C4, tecnologia, descrição, explicação das relações) e os alertas de qualidade. O mesmo
    resolve, layout e render do `archlens deliver`, sem os screenshots.
  - `GET /api/element/:id`: o cartão do elemento (o mesmo de `archlens query --element`) para o painel de detalhes.
  - `POST /api/ask`: a pergunta em texto, com o contexto da visão atual. Responde em **stream**, com as etapas
    ("interpretando", "consultando a base", "montando a visão") e, ao final, a spec, a visão e, se for o caso, uma
    resposta em texto (o markdown do `query --format md`). Também pode responder com uma pergunta de esclarecimento.
- **Ações de navegação → spec.** O servidor (ou o front, a critério do construtor) traduz cada ação do menu em spec
  pelas mesmas regras da tabela *Pedido → view spec* da `archlens-query`:

  | Ação no nó | Spec gerada (exemplo) |
  |---|---|
  | Abrir containers (sistema X) | `{notation:"c4", level:"container", scope:"X"}` |
  | Abrir componentes (container C) | `{notation:"c4", level:"component", scope:"C"}` |
  | Ver em ArchiMate / ver em C4 | a visão equivalente na outra notação, ancorada no nó |
  | Quem depende ▸ todos / por tipo | visão de impacto ancorada no nó, filtrada pelo tipo escolhido |
  | Do que depende ▸ todos / por tipo | visão de suporte (`traverse.mode: "supporters"`) ancorada no nó |
  | Matriz de dependência | `{notation:"archimate", viewpoint:"impact", anchor:"X"}`, com a matriz aberta |
  | Abrir grupo | a visão atual com `groups.only` no grupo |
  | Focar (só vizinhos) | C4: a visão atual com `focus:[X], depth:1`. ArchiMate: a spec não tem `focus`; no MVP, âncora em X com travessia de um passo nos dois sentidos *(decisão do agente; acrescentar `focus` ao ArchiMate seria mudança no núcleo, fora deste trabalho)* |

  O mapeamento exato de "ver na outra notação" e de "por tipo" (que tipos aparecem no submenu e em qual campo da spec o
  filtro entra) fica ao construtor, desde que use só o que a spec já aceita. Se faltar um filtro na spec, isso é
  mudança no núcleo e segue a regra de sentido único.

### Front

**Tela principal** (esboço validado com o usuário: misto dos arranjos "diagrama no centro" e "explorador com árvore"):

- **Topo:** a busca, que aceita nome de elemento ou pergunta (Ctrl+K), e o seletor **ArchiMate | C4**, que troca a
  notação da visão atual.
- **Centro:** o diagrama, com a **trilha** das visões percorridas acima dele (clicar num passo volta a ele) e a barra
  de ferramentas da página de hoje: animar, fluxo, rótulos, legenda, matriz, ajustar, tema, exportar e apresentar.
- **Lateral esquerda, recolhível, com duas abas alternáveis:**
  - **Conversa e histórico:** cada pergunta e cada clique viram um passo com miniatura. Clicar num passo volta a ele.
    A caixa de pergunta fica no pé da aba.
  - **Explorador:** visões salvas e sugeridas da base, a árvore de elementos (sistemas → containers → componentes,
    grupos) e um filtro. Clicar numa visão a abre. Clicar num elemento o seleciona e centraliza, se estiver na visão
    atual. Se não estiver, abre o contexto dele *(decisão do agente)*.
- **Lateral direita, recolhível:** os detalhes do nó selecionado (tipo, perfil C4, tecnologia, descrição, dependências,
  dependentes, fontes), a partir do cartão do elemento.
- **Recolher as laterais** como no VS Code ou no draw.io: uma ou as duas, por um clique no ícone ou por atalho. O modo
  "Apresentar" esconde as duas. O estado das laterais fica salvo no navegador *(decisão do agente)*.

**Interação no diagrama:**

- **Hover: igual ao de hoje** (requisito do usuário). Prévia de um passo, com os vizinhos destacados e o resto
  esmaecido, e o cartão em português do nó ou da relação, que pode ser fixado. É o comportamento do `render.mjs`.
- **Botão direito: o menu de ações** da tabela acima (requisito do usuário: de preferência no botão direito). Submenu
  "por tipo" em *Quem depende* e *Do que depende*. Também tem "Focar" e "Fixar detalhes".
- **Clique simples:** seleciona o nó e preenche a lateral direita *(decisão do agente)*.
- **Duplo clique:** a expansão natural, de sistema para containers, de container para componentes e de grupo para
  membros *(decisão do agente)*.
- Zoom e arrasto como hoje.

**Reaproveitar o render de hoje.** O SVG e o script de interação (hover, cartão, animação, matriz, tema, exportar)
vêm do `render.mjs`. A GUI embute o SVG de uma visão e liga o próprio menu e a própria seleção por cima, pelos
`data-node` que o SVG já tem. Como separar o script atual da página inteira (hoje ele assume a página do
`renderHtml`) fica ao construtor, dentro da regra de *Mudanças no núcleo*.

### Busca em texto (agente)

**Uma chamada ao LLM como objetivo, não como regra** (requisito do usuário: não sacrificar a qualidade da resposta para
caber em uma rodada).

- **Entrada do modelo:** a pergunta, a visão atual (spec e nós visíveis), o histórico curto da conversa e um
  **catálogo compacto** da base: id, nome, tipo, perfil C4, pai e aliases de cada elemento, além das visões salvas.
  Junto vai um **prompt de sistema montado a partir de `references/views.md`** e da tabela *Pedido → view spec* da
  skill. O prompt é gerado no build *(decisão do agente)*, como o `REFERENCE.md` do archlens-ask, e um check avisa
  quando ele fica para trás.
- **Ferramentas que o servidor executa em milissegundos:**
  - `find_elements(texto)`: casamento por nome e alias, com o mesmo `match` do archlens;
  - `element_card(id)`;
  - `relations(ids, via?)`: as relações entre e em volta dos elementos dados, em frases curtas (tipo, origem, destino,
    descrição). Serve para montar os `steps` de uma visão dinâmica ("o fluxo de checkout") a partir da pergunta, como a
    skill faz lendo as relações *(decisão do agente: necessária para a meta 1 em fluxos)*;
  - `try_view(spec)`: resolve e faz o layout sem gerar o SVG, e devolve um **resumo**: contagens por camada ou nível,
    nomes dos nós e os **alertas de qualidade** calculados (ver abaixo). Nunca devolve o JSON inteiro. A medição mostrou
    que ler o JSON do `resolve` custou ~5 s de modelo.
- **Alertas e recorte, como na skill.** A skill lê o relatório do `deliver` e refaz a spec diante de alertas (visão
  grande demais, texto pequeno demais, pouca ocupação). A GUI usa **as checagens calculadas** do `layout.mjs`
  (`legibility`, `layoutQuality`) e as de tamanho da visão, **sem screenshots e sem Chromium** *(decisão do agente)*.
  O `try_view` devolve esses alertas, e o agente propõe ou aplica o recorte que a skill aplicaria (a pergunta `grande`
  do eval). As checagens que só os screenshots fazem ficam fora. O critério de acerto compara a seleção, não os pixels.
- **Saída:** uma spec (com `title`), ou uma pergunta de esclarecimento para o usuário quando o nome casa com vários
  elementos e o contexto não decide. Se a pergunta pedir análise ("o que é afetado se…"), a resposta também traz o
  texto do `query --format md`.
- **Tetos:** número máximo de rodadas de ferramenta e tempo máximo por pergunta, configuráveis *(decisão do agente:
  começar com 4 rodadas e 45 s)*. Ao bater o teto, a GUI mostra o melhor resultado obtido, com aviso.
- **Base grande:** se o catálogo passar de um limite de tamanho, ele vai resumido (sistemas, containers e visões), e o
  modelo usa `find_elements` para o resto. O limite fica ao construtor e é medido.

### Provedor de LLM

Um adaptador com duas famílias: **API da Anthropic** e **API compatível com OpenAI**. A segunda cobre OpenAI,
OpenRouter e gateways internos. A configuração tem provedor, endpoint, modelo, chave e cabeçalhos extras. A chave vem
do ambiente (local) ou de um segredo do servidor (Docker), e nunca chega ao navegador. O modelo padrão sugerido é um
rápido da família Claude atual. A troca é por configuração.

## Fontes

A GUI lê a base **só pelo contrato de conector** (`describe`, `read`, `readSubgraph`, `version`), com `openStore` e
`resolveBase` de `scripts/lib/store`. Com isso, um conector novo (neo4j, banco relacional) serve à GUI sem mudança nela.

| Fonte | Como a GUI lê |
|---|---|
| `json`, `markdown` | conector de hoje, sobre a pasta da base (local) ou uma pasta montada no contêiner |
| gbrain modo git | conector de hoje: lê a ponta remota numa worktree destacada; o servidor precisa de acesso ao repositório git |
| gbrain modo MCP | o **servidor vira cliente MCP**. Hoje o conector troca arquivos de pedido e resposta com um agente (`remote pull` monta as chamadas `list_pages`/`get_page`, o agente executa e devolve o bruto, `--ingest` grava o espelho). Na GUI, um executor automático faz as chamadas desse mesmo pedido num cliente MCP e entrega as respostas ao mesmo `ingest`. O espelho e as regras de sincronização continuam os do conector |

**Endpoint MCP configurável.** O que importa é o **conjunto de ferramentas compatível com o gbrain**, não quem as
serve. A configuração tem a URL do endpoint, o tipo de autenticação (token, OAuth ou cabeçalhos), a credencial e um
**mapa de nomes de ferramenta** opcional, para o gateway que prefixa ou renomeia. O mesmo executor atende:

- o **MCP do gbrain direto** (`gbrain serve --http`);
- **um gateway de LLM que expõe as ferramentas do gbrain como endpoint MCP**. Segundo o usuário, este é o caminho mais
  provável no início.

Na subida, a GUI confere se as ferramentas de leitura necessárias existem e diz claramente qual falta. É o
equivalente ao `remote check` só de leitura.

**Risco em aberto: o gateway real.** O usuário ainda não sabe se o gateway vai expor as ferramentas como endpoint que
a aplicação chama ou só ao modelo durante a inferência. No segundo caso, a GUI não lê a base e a navegação sem LLM não
funciona. O desenho prevê um modo futuro em que o espelho é alimentado pelo que o LLM lê, mas ele não entra no MVP.
**Conferir com o gateway assim que possível.** Se ele for só de inferência, este ponto volta para conversa antes da
implementação do modo MCP.

**Risco em aberto: chamada de ferramentas no gateway.** O agente de busca depende de *tool calling*, de preferência com
streaming, na API compatível com OpenAI. Se o modelo do gateway não fizer isso de forma confiável, a busca cai para
**saída estruturada sem ferramentas**: uma chamada que devolve a spec em JSON, com um catálogo maior no prompt
(inclusive relações resumidas), e o servidor valida e, se preciso, refaz uma vez com o erro *(decisão do agente)*. O
adaptador de LLM declara se o provedor suporta ferramentas, e a avaliação roda nos dois modos.

## Mudanças no núcleo (`scripts/lib`)

Permitidas só quando também valem para a CLI e não mudam o resultado de nenhuma visão:

- **Exportar o SVG e os metadados de uma visão** (hoje internos ao `render.mjs`: `viewSvg`, `viewData`), sem a
  página inteira.
- **Separar o script de interação** da página do `renderHtml`, para a GUI montá-lo sobre um SVG avulso. A página da CLI
  continua igual.
- **Carregar o ELK sem `createRequire`** (`layout.mjs`), se o construtor quiser o layout também no navegador. No MVP o
  layout roda no servidor, então isto é opcional.
- **Executor MCP para o conector gbrain** (montar pedidos e consumir respostas sem arquivos intermediários), se o
  formato de arquivos de hoje atrapalhar.

O teste do núcleo (`npm test`) continua passando, e as páginas de `archlens deliver` não mudam *(critério do agente)*.

## Avaliação

**Mede qualidade e velocidade juntas, desde a primeira versão da busca.**

- **Perguntas:** `portable/archlens-ask/eval/perguntas.json` sobre a base de exemplo do archlens-ask, com o mesmo
  gabarito (`eval/gabarito/`, gerado pela CLI). Outras perguntas podem ser acrescentadas, como as de navegação ("e quem
  depende disso, só os sistemas?").
- **Acerto:** a seleção resolvida pela spec da GUI (nós e arestas, inclusive as derivadas) bate com o gabarito. A spec
  não precisa ser idêntica, basta o resultado ser o mesmo. Perguntas de esclarecimento contam à parte.
- **Velocidade:** por pergunta, tempo total, tempo de LLM, número de rodadas de ferramenta e tempo de resolve e render.
  Registrar P50 e P90 e a fração de perguntas resolvidas em uma rodada.
- **Critério:** o acerto vem antes da velocidade. Uma mudança que acelera e erra mais é recusada.
- **Telemetria em uso real** *(decisão do agente)*: o servidor registra os mesmos tempos por pergunta, sem o conteúdo da
  pergunta por padrão, para acompanhar P50 e P90 fora do conjunto de validação.

## Aprendizados do protótipo (2026-10-29)

Um protótipo descartável (servidor Node sem framework + React por UMD, a página de hoje num iframe) validou a tela
com o usuário. O que ele mostrou e passa a valer para a construção:

- **A navegação sem LLM se sustenta.** Todas as ações do menu de todos os elementos das duas bases de exemplo (1.338
  visões) resolveram sem erro, quase todas entre 50 e 800 ms. As poucas acima de 1 s (até 2,6 s) são visões ArchiMate
  grandes ancoradas num sistema inteiro, com o tempo todo no layout `auto`, que calcula os três estilos. O plano
  precisa de um jeito de manter esse caso abaixo de 1 s, como calcular os estilos em paralelo, guardar em cache por
  spec e versão da base ou mostrar primeiro um estilo e trocar depois.
- **A página inteira num iframe não serve para a versão final.** Ela foi feita para a tela inteira: dentro da GUI
  ela traz a própria barra, os próprios avisos de legibilidade e o próprio tema, e esconde o botão de tema abaixo de
  1400 px. Isso confirma o SVG avulso com metadados (*Mudanças no núcleo*) e a barra de ferramentas do diagrama
  desenhada pela GUI.
- **Um só painel de detalhes: o da GUI** *(requisito do usuário)*. O cartão flutuante da página de hoje não aparece. A
  lateral direita tem duas partes:
  - **Nesta visão**: papel e distância, relações da visão em frases com a tecnologia, "Como ler as relações?". Clicar
    numa relação rastreia a cadeia.
  - **Na base**: apelidos, pai, id, filhos, fontes com o trecho de origem, rodadas.

  O acabamento é o do cartão de hoje. Os dados de "Nesta visão" vêm dos metadados exportados com o SVG, os de "Na base"
  do cartão do elemento. A seleção pelo diagrama, por uma relação do painel ou pela árvore leva sempre ao mesmo nó.
- **Tema da aplicação inteira**, com um botão na barra do topo e sincronizado com o diagrama nos dois sentidos.
- **Laterais travadas na tela, como no VS Code** *(requisito do usuário)*. A aplicação é uma moldura fixa e só o
  diagrama se move. Cada lateral tem a própria faixa de ícones do seu lado: a esquerda com Conversa e Explorador, a
  direita com Detalhes. Abaixo de ~1100 px de largura, as laterais começam recolhidas.
- **"Quem depende ▸ por tipo"** com a contagem por tipo funcionou, mas traz tipos pouco úteis (goal, requirement). O
  construtor decide entre filtrar por camada e esconder tipos da motivação.

## Relação com o archlens-ask

A GUI não copia nada do archlens-ask. Ela importa o núcleo e lê `references/` direto. Uma mudança no archlens que
afete o archlens-ask provavelmente afeta a GUI também, então o `AGENTS.md` ganha um item análogo: avaliar o impacto
na GUI e rodar os testes dela no mesmo PR *(decisão do agente)*.

## Deixado ao construtor

- Framework HTTP do servidor, gerenciamento de estado no React e biblioteca de UI (sem biblioteca de diagramas: ver
  *Anti-metas*).
- Formato exato dos endpoints e do stream de `/api/ask`.
- O mapeamento exato de "ver na outra notação" e dos tipos no submenu "por tipo".
- Como extrair o script de interação do `render.mjs`.
- Exportar a visão atual como delta para a `archlens-plan` ("manter esta visão"): desejável, não obrigatório no MVP.
- Fases de entrega. Sugestão: (1) servidor + navegação + fontes de arquivo; (2) busca em texto + avaliação; (3) MCP
  (direto e por gateway) + Docker.
