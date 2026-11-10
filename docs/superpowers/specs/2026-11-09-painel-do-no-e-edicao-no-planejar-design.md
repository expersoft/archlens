# Painel do nó e edição no Planejar: design

Data: 2026-11-09. Estado: em revisão.

## Intenção

Dois incômodos na GUI (`apps/gui/`):

1. O painel da direita com os dados do item selecionado (`Details.tsx`) é uma lista corrida de títulos e `<dl>`, sem
   separação clara entre as seções. Com a documentação do nó e as `properties`, ele cresce e fica difícil de ler.
2. No Planejar, preencher a documentação de um nó ou ajustar uma propriedade exige pedir ao chat toda vez. O Rodrigo
   quer digitar isso direto na tela, e que essas edições entrem no Delta e sigam o mesmo caminho do resto do rascunho
   até o Aplicar.

O objetivo final, numa **fase 2**, é editar também a estrutura pela tela: criar, alterar e apagar nós e relações. Esta
fase prepara o terreno, mas não entrega isso.

## Ponto de partida

Este trabalho parte da branch `feat/documentacao-do-no` (design
`docs/superpowers/specs/2026-11-04-documentacao-do-no-design.md`, já implementado e ainda não integrado à `develop-v2`).
Ela já entrega:

- `properties` em leitura no `Details.tsx`;
- leitura da documentação sob demanda (`GET /elements/:id/doc`, `DocTab.tsx`, `Markdown` com HTML desligado) e a aba
  Documentação ao lado de Detalhes;
- `docs` no delta (`{ id, text }`, texto inteiro, `""` limpa), `putDoc` nos conectores, pergunta com diferença ao trocar
  texto existente, conflito com edição direta no markdown (409 `E_GUI_PLAN_CHANGED`);
- item `kind: 'doc'` com `diff` no `DeltaPanel`, ferramenta `read_doc` do agente.

Tudo isso continua valendo. O que muda em relação àquele design está na tabela abaixo.

| Ponto | Design de 2026-11-04 | Este design |
|---|---|---|
| Editor de texto na GUI | Fora do escopo; escrever era pelo chat | Editor de markdown no painel do nó, no Planejar |
| `properties` na GUI | Só leitura | Editar, adicionar e remover no Planejar, via Delta |
| Onde a documentação aparece | Aba Documentação ao lado de Detalhes | Cartão recolhível no painel único, com tela cheia |
| Origem das mudanças no Delta | Não havia | Selo chat / tela, desfazer nas edições da tela |
| Chat sobre edição feita à mão | Não havia | Pede confirmação antes de mudar |

## Objetivos

1. Painel do nó redesenhado (Navegar e Planejar), nos temas claro e escuro.
2. No Planejar, editar pela tela as `properties` (alterar, adicionar, remover) e a documentação do nó.
3. Essas edições aparecem no painel Delta como as demais, com a origem marcada, e vão para a base pelo Aplicar de sempre.
4. O chat não sobrescreve uma edição feita na tela sem a confirmação do usuário.

## Fora do escopo (fase 2 ou depois)

- Criar, alterar ou apagar nós e relações pela tela, inclusive nome, descrição, tipo, tecnologia e status.
- Editar no Navegar: lá o painel é só leitura.
- Mudar o painel do nó no HTML gerado (`render.mjs`) e no `embed`; o redesenho é da GUI. *(Chamada minha.)*

## O que não pode acontecer

- Perder uma edição feita na tela: por recarregar a página, por uma nova rodada do chat, por um `set_delta` do agente.
- O chat mudar em silêncio uma propriedade ou documentação que o usuário editou na tela.
- A GUI gravar a base por fora do plano: só o Aplicar (que chama o caminho do `archlens-apply`) grava.
- Abrir o painel ficar perceptivelmente mais lento: a documentação continua lida só quando o cartão dela está aberto.
- Texto da documentação virar HTML ativo (continua `Markdown` com HTML desligado).
- Mudar a CLI, as skills ou `references/` para acomodar o `archlens-ask` (`AGENTS.md`).

## Restrições

- `AGENTS.md`: `npm run gui:test`; se mudar prompt do agente do Planejar, `npm --prefix apps/gui run prompt`; avaliar o
  impacto no `archlens-ask` e rodar `npm run check-ask`.
- Cores: as do `styles.css` da GUI (`--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--accent`, nos dois temas) e as
  das camadas do diagrama (`--biz`, `--app`, `--tech`, `--mot`, `--str`, `--impl`, `--oth` e as variantes `-s`, em
  `scripts/lib/render.mjs`, uma paleta para cada tema). A GUI não inventa cores de camada próprias.
- Documentação só existe em base markdown ou gbrain. Em base JSON o cartão Documentação não aparece (como a aba hoje), e
  as `properties` seguem editáveis.

## Decisões do Rodrigo

- Layout: cartões empilhados (opção A do mockup) que recolhem (opção C), porque documentação e relações podem ficar
  grandes.
- Cabeçalho com **fundo cheio** na cor da camada do nó.
- Botão de editar bem visível em cada cartão editável.
- A caixa da documentação é redimensionável e também abre em tela cheia.
- Edições da tela entram no Delta como as demais e seguem com o resto do rascunho.
- No Delta, distinguir o que veio do chat e o que veio da tela.
- Se o chat quiser mudar algo editado na tela, avisa e pede confirmação.
- Painel da direita no Planejar com abas Delta e Nó.
- O botão que confirma uma edição no cartão se chama **Confirmar** ("Pôr no delta" foi vetado).
- Edição estrutural (nós e relações) fica para a fase 2.

## Comportamento

### Painel do nó (Navegar e Planejar)

Mockup de referência: `.superpowers/brainstorm/1315190-1794254559/content/sidebar-hybrid-v2.html`.

- **Cabeçalho:** fundo na cor da camada (`--<camada>`), borda inferior de 3px na variante forte (`--<camada>-s`), texto
  com contraste suficiente nos dois temas. Contém o nome, os selos de tipo (rótulo C4 quando houver e tipo ArchiMate) e
  a descrição curta.
- **Corpo:** cartões, cada um com título em caixa-alta, seta de recolher, contador quando for lista e, no Planejar, o
  botão Editar quando for editável. Ordem:
  1. Propriedades
  2. Documentação (só em base markdown ou gbrain)
  3. Nesta visão (camada, papel, distância, tecnologia), quando o nó está na visão
  4. Relações na visão (ou Relações, quando o nó não está na visão)
  5. Na base (id, pai, apelidos, status)
  6. Filhos
  7. Fontes e rodadas
- **Tetos:** a documentação aparece cortada (altura limitada, esmaecendo no fim) com "Expandir" e "Tela cheia"; listas
  mostram os 5 primeiros itens e "Mostrar mais N". O botão "Como ler as relações?" fica no cartão de relações.
- **Estado dos cartões:** o painel lembra quais cartões ficaram abertos (por cartão, não por nó), em `useStoredState`.
  *(Chamada minha.)*
- **Documentação:** é buscada quando o cartão está aberto e o nó muda, como o `DocTab` faz hoje. A aba Documentação some;
  o `DocTab` vira o conteúdo do cartão. Sem texto, o cartão mostra o estado vazio, e no Planejar o estado vazio oferece
  "Escrever".
- Clicar numa relação, num filho ou no pai continua navegando como hoje.

### Painel do nó no Planejar

- Hoje o Planejar não tem painel do nó: à direita só há o Delta (trilho com Δ). O painel da direita passa a ter **duas
  abas, Delta e Nó** (decisão do Rodrigo; mockup `planejar-paineis.html`, opção A), e o trilho ganha o botão Nó ao lado
  do Δ. Clicar num nó da prévia ou no nome de um item do Delta seleciona o nó e muda para a aba Nó. A aba Delta mostra o
  número de mudanças.
- O painel mostra o nó **como ficará** (base + rascunho): um nó que o chat acabou de propor já pode receber propriedades
  e documentação; um nó que o rascunho remove aparece em leitura, sem Editar. *(Chamada minha.)*

### Editar propriedades

- "Editar" troca o cartão para linhas de chave e valor editáveis, com × para remover e "+ Adicionar propriedade".
- Destaque por linha em relação à base: valor alterado em amarelo (aviso), nova em verde, removida riscada até confirmar.
- Botões **Cancelar** e **Confirmar** (decisão do Rodrigo). "Confirmar" leva a edição para o rascunho; não grava a base,
  que continua sendo papel do Aplicar da barra.
- Valor em lista de textos (já aceito em `properties`) aparece como texto separado por vírgula e volta como lista.
  *(Chamada minha.)*
- O tipo original se preserva: uma propriedade número ou booleano que o usuário não mexeu volta com o mesmo tipo e não
  vira mudança. Se ele editar, o valor volta como número/booleano quando o texto for um número/`true`/`false` e a
  original era desse tipo; senão vira texto. Propriedade nova é texto. *(Chamada minha.)*
- Mudar uma propriedade que já tem valor na base gera hoje, no `merge.mjs`, um item `class: 'conflict'` que pede
  resposta. Para edições da tela, a própria edição é a resposta (`take`): o servidor gera essa resolução a partir da
  camada da tela que ele mesmo valida, e nenhuma pergunta abre. O mesmo vale para a remoção de propriedade e para a
  documentação. *(Chamada minha.)*
- Chave vazia ou repetida não deixa confirmar.

### Editar a documentação

- "Editar" troca o cartão para um editor com abas **Escrever / Prévia**, carregado com o texto atual (o do rascunho, se
  houver; senão o da base).
- A caixa é redimensionável na vertical (arrastando o canto) e tem **Tela cheia**: um painel grande sobre a GUI com
  Escrever e Prévia lado a lado, que fecha voltando ao cartão com o mesmo texto.
- Confirmar põe `{ id, text }` em `docs` do rascunho. Esvaziar o texto e confirmar é limpar, e precisa ser explícito
  (aviso antes).
- Texto com os marcadores `<!-- archlens:begin -->` / `<!-- archlens:end -->` é recusado com a mesma mensagem de hoje.
- A troca de texto existente feita **pela tela** não abre a pergunta com diferença: a edição do próprio usuário já é a
  confirmação. Pelo chat, a pergunta continua. *(Chamada minha.)*

### Edições da tela no rascunho

- As edições da tela são uma camada própria do rascunho, separada do delta que o agente escreve: um `set_delta` do agente
  nunca as apaga. O plano e a prévia usam o delta do agente com as edições da tela por cima. *(Mecanismo a cargo de quem
  construir, mas o efeito é este.)*
- Elas viajam com o rascunho: sobrevivem a recarregar a página (o `draftStore` de hoje), ao Salvar/Abrir do arquivo
  `.json` e ao replanejar no servidor (que valida tudo e não confia no navegador).
- O agente as vê: o resumo do rascunho que ele recebe diz o que o usuário editou na tela, para não refazer nem
  contradizer sem perguntar.
- **Conflito com o chat:** se o agente propõe para o mesmo nó um valor diferente na mesma propriedade, ou uma
  documentação diferente, a GUI mostra um aviso com "Manter o seu" (padrão) e "Usar o do chat", com o motivo que o agente
  deu, e só depois a proposta do chat vale. Mockup: `delta-panel.html`.
- O Aplicar da barra do Planejar fica bloqueado enquanto houver conflito sem resposta, como já fica com pergunta aberta.
- **Ciclo de vida do conflito:** "Manter o seu" fica gravado (por nó, campo e valor proposto) e o aviso não volta enquanto
  o chat repetir o mesmo valor; um valor diferente abre aviso novo. "Usar o do chat" tira aquele campo da camada da tela,
  e a partir daí ele é do chat. O motivo do agente é opcional: se ele não der, o aviso mostra só os dois valores. As
  respostas viajam com o rascunho, como as edições. *(Chamada minha.)*

### Painel Delta

Mockup de referência: `.superpowers/brainstorm/1315190-1794254559/content/delta-panel.html`.

- Cada mudança ganha um selo de origem: **chat**, **tela**, ou os dois quando chat e tela mexeram no mesmo nó. Dentro do
  item, cada campo mostra de onde veio.
- Mudança de propriedade aparece como hoje (`before → after`); propriedade removida aparece riscada.
- Documentação aparece resumida ("+18 linhas") com "ver diferença", que abre a diferença inteira (o `diff` de hoje).
- Edições da tela têm **desfazer**, por nó: apaga as edições da tela daquele nó (propriedades e documentação), e ele
  fica como o chat o deixa agora, ou como na base se o chat não mexeu nele. Não há histórico por edição. Mudanças do chat
  não têm desfazer aqui; se desfazem pelo chat. *(Chamada minha.)*
- Clicar no nome continua levando o nó ao diagrama; agora também abre o painel do nó.

## Lacuna no núcleo: remover propriedade

O delta hoje só **define** propriedades: `merge.mjs` aplica cada chave de `incoming.properties` e não tem como remover
uma chave. Remover propriedade pela tela é requisito do Rodrigo, então o formato do delta precisa de um jeito de dizer
"remova esta propriedade". Isso toca `schemas/delta.schema.json`, `merge.mjs`, o relatório do plano, a skill
`archlens-plan`/`references/` e, por tabela, o `archlens-ask` (`npm run ask`, `check-ask`). A forma (valor `null`, uma
`op` nova ou outra) fica com quem construir, desde que seja explícita e apareça na revisão do plano. Uma remoção pelo
chat também passa a ser possível com isso.

## Critérios de aceite

1. No Navegar e no Planejar, em tema claro e escuro, o painel mostra cabeçalho na cor da camada e os cartões na ordem
   acima, que recolhem e lembram o estado; documentação e listas longas têm teto e "expandir"/"mostrar mais".
2. No Planejar, numa base markdown (`examples/loja-online-vault`): alterar uma propriedade, adicionar outra, remover uma
   terceira e escrever a documentação de um nó pela tela; o Delta mostra as quatro mudanças com selo "tela"; Aplicar
   grava na base exatamente isso.
3. Recarregar a página e Salvar/Abrir o rascunho mantêm as edições da tela.
4. Depois de editar `criticidade` na tela, um pedido ao chat que muda `criticidade` abre o aviso; "Manter o seu" mantém
   o valor da tela, "Usar o do chat" troca, e o Aplicar fica bloqueado até a resposta.
5. Um `set_delta` do agente que não menciona o nó editado não apaga a edição da tela.
6. "Desfazer" num nó editado na tela apaga as edições da tela dele, e o nó fica como o chat o deixa (ou como na base).
7. Em base JSON, o cartão Documentação não aparece e propriedades seguem editáveis.
8. `npm test`, `npm run gui:test` e `npm run check-ask` passam.

## Chamadas minhas (Claude)

- Partir da `feat/documentacao-do-no`.
- Redesenho só na GUI; o painel do HTML gerado fica como está.
- Edição da tela vale como resposta ao conflito de propriedade do `merge.mjs`; tipo original preservado.
- Ciclo de vida do conflito chat × tela e desfazer por nó.
- Painel lembra cartões abertos por cartão, não por nó.
- No Planejar o painel mostra o estado futuro; nó removido fica em leitura.
- Troca de documentação pela tela não abre a pergunta com diferença.
- Desfazer só nas edições da tela.
- Lista de textos editada como texto separado por vírgula.

## Fica a cargo de quem construir

- Como guardar a camada de edições da tela no rascunho e como ela chega ao servidor e ao agente.
- A forma de "remover propriedade" no delta.
- Componentes, nomes, rotas e a divisão em tarefas. Sugestão de ordem: painel novo (só leitura) → painel no Planejar →
  editar propriedades → editar documentação → origem e desfazer no Delta → conflito com o chat.
- Detalhes visuais finos (espaçamentos, ícones) dentro do mockup aprovado.
