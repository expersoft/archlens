# Editar no Navegar, editor ampliado, ícone do nó, logo e avisos da visão: design

Data: 2026-11-09. Estado: em revisão. Continua `2026-11-09-painel-do-no-e-edicao-no-planejar-design.md`, na mesma branch
(`feat/painel-do-no`), antes da integração.

## Intenção

Testando a GUI, o Rodrigo trouxe cinco ajustes:

1. Para acrescentar algo a um nó, hoje é preciso ir ao Planejar. Com o Planejar ligado, o próprio Navegar deve deixar
   editar o nó; a edição começa o planejamento com um delta.
2. A "tela cheia" da documentação vira uma janela grande e mais caprichada sobre a tela.
3. A aba Nó ganha um ícone no lugar da palavra.
4. O canto superior esquerdo ganha um logo do archlens, trocável pela configuração por um logo de empresa.
5. O aviso de legibilidade ("em 1920×1024 o texto fica com ~11.8px…") pouco ajuda na GUI; outra forma de mostrar.

## Decisões do Rodrigo

- **Editar no Navegar:** com o Planejar ligado, o painel do nó no Navegar edita Propriedades e Documentação. Confirmada
  a edição, a GUI **já leva para o Planejar**.
- **Editor ampliado:** janela grande sobre a tela, fundo escurecido e desfocado, combinando **sumário recolhível** com
  **Escrever e Prévia lado a lado** (mockup `.superpowers/brainstorm/1777377-1794277649/content/modal-combinado.html`).
- **Ícone da aba Nó:** o "i" de informações (opção 4 do mockup `logo-icone-modal.html`).
- **Logo do archlens:** opção A, a lente sobre as três camadas (`logo-icone-modal.html`).
- **Logo da empresa:** opção 3 do mockup `logo-empresa.html`: o logo da empresa primeiro e "archlens" pequeno ao lado,
  separado por um traço.
- **Avisos da visão:** opção A do mockup `avisos-visao.html`: selo na barra do diagrama, que abre explicação e botões de
  ação. A faixa sobre o diagrama sai.

## Fora do escopo

- Edição estrutural (criar, apagar nós e relações): segue para a fase 2.
- Mudar os avisos da CLI, do `archlens deliver` e o aviso dentro do HTML gerado (`render.mjs`, "Texto a ~Npx nesta
  tela"): ficam como estão.
- Logo no HTML gerado e no `ARCHITECTURE.md`.

## O que não pode acontecer

- Perder uma edição feita no Navegar: ela tem as mesmas garantias das edições do Planejar (camada da tela, sobrevive a
  recarregar, a rodada do chat, a Salvar/Abrir).
- O Navegar gravar a base: ele só alimenta o rascunho; gravar continua sendo o Aplicar do Planejar.
- Editar no Navegar com o Planejar desligado.
- Servir pela rota do logo qualquer arquivo além dos configurados.
- Mudar o texto dos avisos que a CLI imprime.

## Comportamento

### 1. Editar no Navegar

- Com `plan.enabled`, o painel do nó do Navegar mostra "✎ Editar" em Propriedades e Documentação (e "Escrever" na
  documentação vazia), com os **mesmos editores** do Planejar (`PropsEditor`, `DocEditor`). Sem o Planejar ligado, nada
  muda: só leitura.
- O que o editor mostra como "atual" é o nó **como o rascunho o deixa**, se houver rascunho; senão, o da base. Assim uma
  edição feita antes no Planejar aparece no Navegar. *(Chamada minha.)*
- **Confirmar:** a edição vai para o rascunho do Planejar pelo mesmo caminho das edições do Planejar (`/plan/edit`,
  camada da tela). Se não há rascunho, ele nasce com essa edição. Se há, a edição entra nele. Em seguida a GUI troca para
  o Planejar, com a aba **Nó** aberta naquele nó e o Delta atualizado. *(Entrar no rascunho existente e abrir a aba Nó
  são chamadas minhas.)*
- **Cancelar** ou trocar de nó com o editor sujo segue as regras do Planejar (confirmação "Descartar a edição não
  confirmada?").
- **Bloqueios:** enquanto uma rodada do chat ou uma gravação do Planejar estiver em andamento, o Editar do Navegar fica
  desabilitado com a mesma dica ("Aguarde o chat terminar para editar" / "Aguarde a gravação terminar"). Se houver um
  conflito chat × tela pendente, a edição segue normalmente e o aviso continua no Planejar.
- **Base JSON:** propriedades editáveis; sem cartão Documentação (como no Planejar).
- **Fonte única do rascunho:** o rascunho continua sendo do Planejar (`PlanView` e `draftStore`); o Navegar não mantém
  cópia própria. Como fazer o Navegar falar com o rascunho (por exemplo, o `PlanView` montado escondido expondo uma
  função de edição, ou o `draftStore` como ponto de troca) fica com quem construir, desde que não haja duas cópias que
  possam divergir.

### 2. Editor ampliado da documentação

Mockup: `modal-combinado.html`. Substitui o diálogo de tela cheia do `DocEditor` e o "Tela cheia" de leitura do
`DocTab`.

- Janela centralizada ocupando cerca de 90% da largura e 88% da altura, cantos arredondados, sombra, fundo da GUI
  escurecido e desfocado (`backdrop-filter`), nos dois temas.
- **Cabeçalho:** quadradinho na cor da camada, "Documentação · <nome do nó>", rótulos C4/ArchiMate, botão fechar.
- **Barra:** botão ☰ (mostra/oculta o sumário), formatação (título, negrito, itálico, lista, lista numerada, citação,
  código, link, tabela) que insere a sintaxe markdown na seleção, e o seletor **Escrever / Lado a lado / Prévia**
  (padrão: Lado a lado).
- **Sumário:** os títulos (`#` a `###`) do texto, com recuo por nível; clicar rola editor e prévia até a seção; o título
  da seção onde está o cursor fica destacado. Atualiza enquanto se digita.
- **Prévia:** o componente `Markdown` de sempre (HTML desligado).
- **Rodapé:** "markdown · N linhas · alterado" e "Esc fecha · Ctrl+Enter confirma"; botões **Cancelar** e
  **Confirmar**.
- **Leitura** (Navegar sem edição ou nó removido): a mesma janela sem barra de formatação, sem seletor (só Prévia), sem
  Cancelar/Confirmar; só o sumário e o botão fechar.
- Acessibilidade: `role="dialog"`, `aria-modal`, foco preso dentro, Esc fecha (com a confirmação de descarte se houver
  texto não confirmado), foco volta ao botão que abriu.

### 3. Ícone da aba Nó

- O "i" de informações (círculo com "i"), em SVG em linha, com `currentColor`.
- Trilho da direita: só o ícone, com a dica "Nó (detalhes do item selecionado)". Aba do painel: ícone + "Nó".
- O Δ do Delta continua como está.

### 4. Logo

- **Logo do archlens:** a lente sobre as três camadas (mockup `logo-icone-modal.html`, opção A), em SVG em linha, com as
  cores de camada da GUI (`--biz-s`, `--app-s`, `--tech-s`) e o aro em `--accent`, adaptando-se ao tema. Fica à esquerda
  de "archlens" na barra do topo (`Shell.tsx`). O mesmo símbolo vira o favicon da GUI. *(Favicon: chamada minha.)*
- **Logo da empresa** (opção 3): no `archlens-gui.json`, um bloco `brand`:

  ```json
  "brand": { "logo": "marca/empresa.svg", "logoDark": "marca/empresa-branco.svg", "name": "Empresa" }
  ```

  - `logo`: obrigatório no bloco; caminho relativo à pasta do `archlens-gui.json` (como os `path` das bases). SVG, PNG ou
    WebP.
  - `logoDark`: opcional; usado no tema escuro. Sem ele, o `logo` vale nos dois temas.
  - `name`: opcional; vai para o título da aba do navegador ("<name> · archlens") e para o `alt` da imagem.
  - Com `brand`, a barra mostra o logo da empresa (altura igual à do símbolo do archlens, largura proporcional, com um
    teto), um traço vertical e "archlens" pequeno e esmaecido.
  - Sem `brand`, a barra mostra o logo do archlens e o nome, como hoje.
- **Servidor:** valida `brand` ao carregar a configuração (arquivo existe, extensão aceita, tamanho até 1 MB) com erro
  claro em português; expõe em `/api/info` só se há marca, o `name` e as URLs; serve os dois arquivos numa rota própria
  (por exemplo `/api/brand/logo` e `/api/brand/logo-dark`) com o tipo de conteúdo certo. A rota nunca recebe caminho do
  navegador. SVG servido com `Content-Security-Policy` restritiva e exibido por `<img>` (scripts do SVG não rodam).
- `serve <base>` sem arquivo de configuração não tem marca (o logo do archlens aparece).

### 5. Avisos da visão

Mockup: `avisos-visao.html`, opção A.

- A faixa `.alerts` sobre o diagrama (`Diagram.tsx`) sai.
- Na barra do diagrama, um selo **⚠ N** (N = número de avisos) aparece só quando há aviso. Clicar abre um painel
  flutuante, ancorado no selo, que fecha com Esc ou clique fora.
- Cada aviso vira um item com título e explicação em português simples, e botões de ação quando houver:
  - **Texto pequeno na tela inteira** (legibilidade): "Visão grande para uma tela", explicação com o número de elementos
    e o tamanho do texto. Ações: **Agrupar tudo** (quando a visão aceita agrupamento), **Focar no selecionado** (quando
    há nó selecionado: a visão de foco nele), **Mostrar só uma camada** (visões ArchiMate com mais de uma camada: as
    camadas presentes como opções) e **Apresentar com zoom** (o modo Apresentar).
  - **Muitos nós** (mais de 40): mesmo tratamento e ações.
  - **Nota do layout** (`layoutNote`): só o texto, sem ação.
- As ações usam as navegações que a GUI já tem (os botões da barra, o menu de contexto, o Apresentar); nenhuma ação
  nova no núcleo. Uma ação que não se aplica à visão atual não aparece.
- **Dados:** a GUI precisa saber o tipo de cada aviso. O núcleo passa a devolver, junto com o texto de hoje, um aviso
  estruturado (`{ kind: 'legibility' | 'size' | 'layout', text, nodes?, minFontPx? }`); a CLI continua imprimindo `text`
  igual. Isso toca `scripts/lib/view-build.mjs` e a forma de `alerts` na GUI.
- Na prévia do Planejar, o mesmo selo (hoje a prévia não mostra avisos).

## Restrições

- `AGENTS.md`: mudanças em `view-build.mjs` pedem avaliação de impacto na GUI e `npm run gui:test`; avaliar o
  archlens-ask (`npm run check-ask`). Se mudar o prompt, `npm --prefix apps/gui run prompt`.
- Cores só dos tokens da GUI e da paleta de camadas copiada do `render.mjs`.
- Textos de interface em português.

## Critérios de aceite

1. Com o Planejar ligado, no Navegar: selecionar um nó, editar uma propriedade e confirmar leva ao Planejar com a aba Nó
   naquele nó e a mudança no Delta com selo "tela"; com rascunho existente, a edição soma-se a ele. Com o Planejar
   desligado, o Navegar não mostra Editar.
2. Editar a documentação no Navegar pelo editor ampliado e confirmar tem o mesmo efeito.
3. Durante uma rodada do chat ou uma gravação, o Editar do Navegar fica desabilitado com a dica.
4. O editor ampliado tem sumário (que navega e destaca a seção), Lado a lado como padrão, formatação que insere markdown,
   Esc/Ctrl+Enter, foco preso, nos dois temas; a versão de leitura não edita.
5. A aba Nó mostra o ícone "i" no trilho e ícone + "Nó" na aba.
6. Sem `brand`, a barra mostra a lente + "archlens" e o favicon novo; com `brand`, logo da empresa (e a versão escura no
   tema escuro), traço e "archlens" discreto, e o título da aba com o nome; configuração inválida falha ao subir com
   mensagem clara; a rota do logo não serve outro arquivo.
7. Uma visão grande mostra o selo ⚠ em vez da faixa; o painel explica e as ações funcionam (agrupar, focar, camada,
   apresentar), só as que se aplicam; a CLI imprime os mesmos textos de antes.
8. `npm test`, `npm run gui:test` e `npm run check-ask` passam.

## Respostas à revisão do construtor (chamadas minhas)

- **Rascunho que ainda não existe:** `/plan/edit` passa a aceitar a ausência de `draft`; o servidor cria um com
  `newDraft(ctx)`, aplica a edição e replaneja, como hoje.
- **Navegar × rascunho:** o `draftStore` (localStorage) é o ponto de troca. O Navegar lê o rascunho salvo, chama
  `/plan/edit`, grava o resultado com `draftStore.save` e troca para o Planejar. Se o `PlanView` já estiver montado, o
  `App` o avisa (por exemplo, uma prop que muda) e ele relê o rascunho salvo em vez do estado em memória. O `PlanView`
  publica para o `App` se há rodada do chat ou gravação em andamento (callback), e o `App` repassa ao Navegar para os
  bloqueios. Enquanto há rodada ou gravação, o Navegar não escreve no `draftStore`.
- **Nó selecionado no Navegar e o rascunho:** o Navegar só seleciona nós da base. Se o rascunho remove o nó, o painel
  mostra o aviso "removido pelo rascunho" e não oferece Editar. Nós que só existem no rascunho são editados no Planejar.
- **Avisos:** `alerts` continua uma lista de textos (CLI, `embed`, testes e archlens-ask intactos); a GUI recebe um campo
  paralelo, `alertInfo`, com `{ kind, text, nodes?, minFontPx? }`. A medida segue a tela de referência de hoje
  (1920×1024), sem viewport vindo da GUI.
- **Selo na prévia do Planejar:** mostra os mesmos avisos; das ações, só as que a barra da prévia já tem (Agrupar tudo,
  Apresentar). Se a rota da prévia ainda não devolve os avisos, passa a devolver `alertInfo`.
- **`logoDark`:** segue o tema da interface escolhido na GUI (o mesmo que troca as cores). Sem `logoDark`, o `logo` vale
  nos dois temas; a documentação recomenda um logo legível nos dois ou fornecer o `logoDark`.
- **Editor ampliado e troca de visão:** ele abre sobre o painel onde a edição começou; com texto não confirmado, trocar de
  nó, de visão (Navegar/Planejar) ou fechar pede a confirmação de descarte antes.

## Chamadas minhas (Claude)

- No Navegar o editor parte do nó como o rascunho o deixa.
- Edição do Navegar entra no rascunho existente e abre a aba Nó no Planejar.
- Conflito pendente não bloqueia editar no Navegar.
- Favicon com o símbolo da lente.
- Versão de leitura do editor ampliado sem formatação nem botões de confirmar.
- Teto de 1 MB e formatos SVG/PNG/WebP para o logo; SVG por `<img>` com CSP.
- Ações do selo restritas às navegações existentes; aviso estruturado no núcleo com o mesmo texto para a CLI.
- Selo também na prévia do Planejar.

## Fica a cargo de quem construir

- Como o Navegar chega ao rascunho do Planejar sem duplicá-lo.
- Nomes das rotas e campos de `/api/info` para a marca; nome exato do campo estruturado dos avisos.
- Ícones da barra de formatação e o teto de largura do logo.
- Ordem sugerida: ícone e logo do archlens → `brand` → avisos → editor ampliado → editar no Navegar.
