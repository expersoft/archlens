# Documentação do nó: design

Data: 2026-11-04. Estado: em revisão.

## Intenção

Hoje um nó da base diz pouco: o vault `examples/loja-online-vault` tem 62 páginas, 29 com `description` (a maior com 81
caracteres) e nenhuma com texto livre. Quem cuida de um sistema, como ele funciona e qual o nome do tópico ficam numa
wiki à parte.

Queremos que cada nó (sistema, processo de negócio ou qualquer outro) carregue duas coisas:

- **`properties`:** fatos curtos para perguntar sobre o modelo (squad, linguagem).
- **Documentação do nó:** texto livre em markdown, o que iria numa wiki ou no Confluence (resumo das funcionalidades, da
  arquitetura, contexto).

Vale a regra de `references/base.md`: **propriedade serve para filtrar, elemento serve para atravessar.** Se a pergunta
precisa atravessar ("tudo da squad Checkout, com suas ligações"), a squad vira elemento.

## Estado atual

| | `properties` | Texto depois do bloco do archlens |
|---|---|---|
| Guardado em | JSON, vault, gbrain; catálogo opcional | só vault e gbrain |
| Markdown aberto direto | sim | sim |
| Painel do nó no HTML (`render.mjs`) | sim | não |
| `query --format md` (`formatElementCard`) | sim | não |
| Detalhes da GUI (`Details.tsx`) | não, embora a API traga | não |
| `ARCHITECTURE.md` (`doc.mjs`) | não | não |
| Filtro por valor | não existe | não se aplica |

O texto livre já existe como `userText` em `markdown-page.mjs`: é preservado em toda gravação, muda de pasta junto com o
elemento e vai para `notes/removidos/` na remoção. Mas fica em `ctx.pages`, e `read()` devolve só `{ raw, notes }`, então
renderização, consulta e GUI nunca o recebem. O plano não tem como carregá-lo.

## Objetivos

1. Ler a documentação do nó na GUI, no HTML gerado, no `ARCHITECTURE.md`, no `query --format md` e na busca com LLM.
2. Escrever a documentação pela GUI (Planejar), pela skill (`archlens-plan` e `archlens-apply`) ou direto no markdown.
3. Mostrar `properties` no painel Detalhes da GUI e no `ARCHITECTURE.md`.
4. Filtrar por valor de propriedade.

## Fora do escopo

- Documentação do nó em bases JSON.
- Busca dentro do texto da documentação (`find_elements` segue por nome, id e apelido).
- Anexos e imagens do vault na GUI e no HTML.
- Editor de texto na GUI: escrever pela GUI é pelo chat do Planejar.
- Modelo obrigatório de seções: o texto é livre.
- Mudar o modelo das `properties` ou o catálogo.

## O que não pode acontecer

- Abrir a GUI, um diagrama ou o HTML ficar perceptivelmente mais lento por causa da documentação.
- Perder texto escrito por pessoas, seja por gravação de plano, seja por edição concorrente.
- Injetar HTML ou script vindo do texto da documentação na GUI ou no HTML gerado.
- Mudar a CLI, as skills ou `references/` para acomodar o `archlens-ask` (sentido único, `AGENTS.md`).

## Restrições

- O formato da página não muda: o texto continua depois de `<!-- archlens:end -->`. Vaults existentes seguem válidos, e
  o texto que já exista nesse trecho passa a ser a documentação do nó.
- `apps/gui/` e `portable/archlens-ask/` seguem o `AGENTS.md`: `npm run gui:test`, `npm run ask`, `npm run check-ask` e
  `npm --prefix apps/gui run prompt` quando couber.
- Só `archlens-apply` grava a base; `archlens-plan` nunca grava.

## Decisões do Rodrigo

- As duas opções por nó: `properties` e texto livre.
- A regra "propriedade filtra, elemento atravessa" fica como está.
- Três caminhos de escrita: GUI, skill e markdown direto, este só no trecho liberado, sem tocar no cabeçalho nem no bloco.
- JSON fica de fora nesta primeira versão.
- A documentação fica disponível em todas as saídas, sem prejudicar a abertura das telas.
- Na GUI e no HTML, a leitura é uma **aba Documentação** no painel do nó, ao lado de Detalhes, com o diagrama visível
  (opção B do mockup).
- `archlens check` falha depois de uma edição direta, com mensagem indicando `archlens build`.
- O filtro por propriedade não herda: só entra o nó que tem o valor, e os pais aparecem como moldura.
- Trocar texto existente passa por confirmação com a diferença à vista; o texto antigo fica só no git.

## Comportamento

### Escrita

- **GUI e skill:** o pedido entra no delta e no plano, com o texto completo revisável antes de aplicar. Aplicar substitui
  o trecho inteiro da página; não há mescla de trechos. A rodada do histórico registra quais nós tiveram a documentação
  alterada, sem copiar o texto.
- **Operação nova:** a lista fechada `OPS` (`store/ops.mjs`) ganha uma operação de documentação do nó, e cada conector a
  implementa: markdown, gbrain git e gbrain MCP.
- **Markdown direto:** nada a construir na escrita; o conector já lê e preserva esse trecho. A edição não entra no
  histórico.
- **Trocar texto existente:** é sempre uma decisão do usuário. O plano abre uma pergunta (como o `class: conflict` do
  merge), e a revisão mostra a diferença entre o texto antigo e o novo, na skill e no painel Delta do Planejar. Só depois
  da confirmação o plano fica final. O texto antigo fica apenas no git da base; o archlens não guarda cópia.
- **Limpar a documentação:** um plano pode deixar o texto vazio, desde que explicitamente, e isso conta como troca.
- **Conflito:** vale só para planos que escrevem a documentação do nó. A referência é o texto que quem revisou viu: a
  versão dele viaja no delta ou no rascunho, e não é calculada só ao finalizar. Se o texto mudou desde então, o apply
  recusa com `E_STORE_CONFLICT` e nada é gravado. Na GUI, `plan/routes.mjs` replaneja sobre a base atual e compara só o
  `opsHash`, que não percebe essa mudança; lá a recusa precisa existir também, como o 409 `E_GUI_PLAN_CHANGED` que a rota
  já usa. Planos que mexem em campos ou relações do nó seguem sem conflito
  por causa do texto, porque o conector preserva o trecho. O gbrain MCP continua mais estrito (a versão do elemento é a
  revisão da página), e isso é aceitável, porque recusa sem perder texto.
- **Marcadores:** texto contendo `<!-- archlens:begin -->` ou `<!-- archlens:end -->` é recusado, como já ocorre na
  `description`.
- **Base JSON:** pedir documentação do nó recebe erro claro dizendo que o recurso exige uma base markdown ou gbrain, com
  a indicação de `store convert`. Nunca é ignorado em silêncio.
- **Conversão para JSON:** segue como hoje: recusa sem `--force` e lista os nós afetados.
- **Elemento removido ou com tipo novo:** segue como hoje (`notes/removidos/`, mudança de pasta).

### Leitura

- **Leitura separada do modelo:** a documentação não entra em `raw` nem em `viewData`. O conector ganha uma leitura do
  texto de um nó e uma de todos os textos.
- **GUI:** a aba busca o texto numa rota própria só quando aberta e renderiza markdown com `markdown-it` (já é dependência
  da GUI), com HTML desligado. Sem texto, a aba mostra um estado vazio que diz como escrever. Uma edição direta no
  markdown aparece sem reiniciar o servidor. Em base JSON, a aba não aparece.
- **HTML gerado:** o texto vai dentro do arquivo, uma vez por nó, e nunca repetido por visão. O painel monta a aba só ao
  abri-la. O texto sai sanitizado: nada do que a pessoa escreveu vira HTML ativo. O HTML dentro da GUI (`embed`) não leva
  a documentação; quem mostra é a aba da GUI.
- **`ARCHITECTURE.md`:** uma seção própria com a documentação dos nós que têm texto, fora das tabelas, com títulos
  rebaixados para não quebrar a hierarquia do documento. Nós sem texto não aparecem nela. `properties` entram como dado
  de cada nó no documento.
- **`query --format md`:** o cartão do elemento ganha a seção Documentação.
- **Busca com LLM:** o texto só entra quando o agente abre aquele nó, nunca no contexto inicial nem no catálogo, e com
  teto de tamanho.
- **`archlens-ask`:** o cartão do elemento passa a incluir a documentação, lida da página no gbrain.
- **Saídas salvas:** uma edição direta no markdown só chega ao `ARCHITECTURE.md` e aos HTML salvos em `diagrams/` no
  próximo `archlens build`; a GUI, a consulta e a busca leem o texto atual.
- **`archlens check`:** continua comparando o `ARCHITECTURE.md` por inteiro. Depois de uma edição direta, ele falha até
  alguém rodar `archlens build`, e a mensagem precisa dizer isso, em vez de "editado à mão". O fluxo de edição direta tem
  dois passos, e `references/` e as skills passam a dizer isso.

### `properties`

- **Detalhes da GUI:** mostra as `properties` do cartão na aba Detalhes.
- **Filtro:** a spec de visão ganha um filtro por valor de propriedade, e consulta e busca com LLM respondem "quais
  sistemas têm squad Checkout?" com ele. Vale para valor simples e para lista de textos. A semântica é estrita, e não a
  de `groups.only`, que mantém `keepIds`:
  - Entra só o nó que tem o valor. Não há herança: o valor de um sistema não vale para seus containers e componentes.
  - Os ancestrais de um nó que entrou aparecem só como moldura de contexto, mesmo sem o valor, e não contam como
    resultado. Escopo e âncora sem o valor seguem a mesma regra: viram moldura se tiverem filhos no resultado e saem nos
    demais casos.
  - `depth` não traz vizinhos sem o valor. `include` explícito vence o filtro, porque é pedido nominal.
  - Visões dinâmicas ignoram o filtro, como ignoram o recorte de grupos, e a resposta avisa.
  - Resultado vazio não é erro: a resposta diz que nenhum nó tem aquele valor.

### Desempenho

Critério medido, com uma base de teste de 60 nós e 5 KB de documentação em cada:

- A rota do cartão e a de visão não leem nem transportam a documentação.
- O tempo até o diagrama aparecer na GUI e no HTML gerado fica a até 10% da mesma base sem documentação.
- O aumento do HTML é próximo do volume do texto, o que prova que ele não se repete por visão.

## Chamadas minhas (Claude)

Pontos que o Rodrigo aprovou no resumo, mas que foram propostos por mim:

- GUI e skill passam pelo plano revisado; a edição direta fica fora do histórico.
- O apply avisa em vez de sobrescrever em caso de conflito.
- Recusa clara em base JSON.
- `properties` entram no painel Detalhes e no `ARCHITECTURE.md`, e o filtro por valor entra neste projeto.
- Na GUI, o texto é buscado só ao abrir a aba; no HTML, ele vai no arquivo e é montado ao abrir a aba.
- `ARCHITECTURE.md` com seção própria; LLM lendo sob demanda; texto sem modelo de seções.

Decididas ao escrever este documento, sem terem sido discutidas:

- Aplicar substitui o trecho inteiro, sem mescla.
- O conflito vale só para planos que escrevem a documentação, com referência no texto que quem revisou viu.
- Limpar a documentação é permitido, de forma explícita.
- Detalhes do filtro: `depth` sem vizinhos fora do valor, `include` vence o filtro, escopo e âncora como moldura, visões
  dinâmicas ignoram, vazio não é erro.
- A aba não aparece em base JSON.
- Os números do critério de desempenho (60 nós, 5 KB, 10%).
- Imagens e anexos ficam fora.
- O `examples/loja-online-vault` ganha documentação em alguns nós, para servir de demonstração e de teste.

## Critérios de aceite

1. Em `loja-online-vault`, um nó com documentação mostra o texto formatado na aba da GUI e na aba do HTML gerado, e
   aparece no `ARCHITECTURE.md`, no `query --format md` e numa resposta da busca com LLM sobre esse nó.
2. Pedir a documentação de um nó pela skill e pelo Planejar gera plano revisável; aplicar grava só o trecho liberado, e
   frontmatter e bloco ficam iguais.
3. Editar o markdown direto depois da revisão e aplicar um plano que escreve a documentação daquele nó recusa com
   conflito e preserva o texto, na skill e na GUI. Um plano que só muda campos ou relações do nó aplica normalmente e
   mantém o texto. Trocar texto existente abre pergunta e mostra a diferença antes de o plano ficar final.
4. Numa base JSON, o pedido recebe a recusa clara, e a aba não aparece.
5. Um texto com `<script>` não executa nem na GUI nem no HTML.
6. Filtrar uma visão por `squad` retorna como resultado só os nós com esse valor, com os ancestrais como moldura e sem
   herança; as `properties` aparecem em Detalhes e no `ARCHITECTURE.md`. Depois de uma edição direta, `archlens check`
   falha e indica `archlens build`.
7. O critério de desempenho é medido e atendido.
8. `npm test`, `npm run gui:test` e `npm run check-ask` passam.

## Fica a cargo de quem construir

- Nomes da operação, da ref de versão, dos métodos do conector, da rota e do campo no delta e na spec de visão.
- Forma exata do filtro de propriedade, desde que atenda à semântica acima.
- Como renderizar markdown no HTML gerado (na geração ou no navegador), desde que o arquivo siga único, sanitizado e
  sem dependência externa.
- Como tratar wikilinks do Obsidian na GUI e no HTML: no mínimo, aparecer legível; se der, navegar para o nó.
- Se a busca com LLM recebe o texto no cartão ou numa ferramenta própria, e o teto de tamanho.
- A ordem de entrega. Sugestão: `properties`, depois leitura, depois escrita.
