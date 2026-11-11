# GUI: agrupar na barra do diagrama, notação estável, carregamento e etapas do Aplicar

Data: 2026-11-10. Origem: observações do usuário ao testar a GUI (Navegar e Planejar).

## Intenção

Quem usa a GUI precisa saber sempre o que a tela está fazendo e não pode ser surpreendido por ela. Hoje três coisas
quebram isso:

- **A notação muda sozinha.** Em uma visão ArchiMate, "Focar (só vizinhos)" ou um clique duplo às vezes abrem em C4,
  sem que o usuário peça.
- **A tela muda debaixo do usuário.** Ele pediu outra visão pelo menu do botão direito. Nada indicava que ela ainda
  estava a caminho, então ele foi editar a documentação do nó. Quando a visão chegou, o painel foi refeito e a
  documentação sumiu por um momento.
- **O Aplicar parece travado.** Ele faz várias coisas em sequência, como gravar a base, gerar o documento, regerar as
  visões e conferir a legibilidade, e só dá retorno no fim. O mesmo acontece com a skill `archlens-apply` no terminal.

Há ainda um ajuste de lugar: o botão Agrupar/Desagrupar fica na barra de cima, longe das outras opções do diagrama.

**Sucesso:**

- A notação só muda quando o usuário pede.
- Durante uma espera, fica claro o que está sendo feito, e nenhuma ação iniciada pode ser desfeita por algo que
  termina depois.
- No Aplicar, o usuário vê cada etapa avançar.

## Partes, na ordem de construção

### 1. Agrupar/Desagrupar na barra do diagrama

- O botão "Agrupar tudo" / "Desagrupar tudo" sai da barra de cima (`Shell.tsx`, prop `nestLabel`/`onNestAll`) e vai
  para a barra do diagrama (`Diagram.tsx`, `role="toolbar"`), junto de Ajustar, Exportar e tema.
- **Regras de quando aparece:** iguais às de hoje (só com `view.nest`, e não no Planejar), com o mesmo rótulo
  (`allLabel`).
- **Ação:** igual à de hoje (`onNestAll` → `run(..., toggleAll(...))`).
- **Menu do botão direito:** "Agrupar aqui dentro" continua lá.
- *Decisão do construtor:* a posição exata dentro da barra, desde que fique junto dos outros botões de exibição.

### 2. A notação não muda sozinha

**Regra:** uma ação do diagrama abre na notação da visão atual. A notação só muda pelo botão ArchiMate | C4 da barra
de cima ou por uma ação que traga a notação no próprio rótulo, como "Contexto (C4)" e "Ver em ArchiMate (camadas)".

Hoje `actionsFor` (`apps/gui/server/navigation.mjs`) monta as ações sem saber a notação atual. *Decisão minha
(contrato):* o front envia a **spec da visão atual**. Dela o servidor tira a notação e, quando precisar, os nós da
visão, para saber se o nó está nela. Valem `getActions`, a rota de ações do Navegar, a de `/plan/...` e as `actions`
do cartão (`GET /elements/:id`), todas com o parâmetro opcional. Sem a spec, o comportamento é o de hoje.

*Decisão minha (rótulos):* numa visão ArchiMate, toda ação que abre C4 leva "(C4)" no rótulo, por exemplo "Abrir
containers (C4)", "Abrir componentes (C4)" e "Abrir grupo (C4)". Ela continua no menu, mas deixa de ser a primária.
As que já têm "(C4)" ficam como estão. Numa visão C4, os rótulos são os de hoje. Os testes de rótulo mudam de
acordo.

**"Focar (só vizinhos)":**

| Visão atual | Nó | Abre |
|---|---|---|
| C4 | container ou componente | C4, como hoje: `level` do nó, `scope` no pai, `focus: [id]`, `depth: 1` |
| C4 | sistema, ator, outros | *Decisão minha:* C4 de contexto do sistema (`level: context`, `scope: id`) se for sistema. Nos demais, a mesma visão C4 com `focus: [id]` e `depth: 1` se o nó estiver nela; senão, ArchiMate como hoje, porque esse nó não existe em C4 (notação trocada por falta de opção) |
| ArchiMate | qualquer | ArchiMate em camadas: `anchor: id`, `traverse: { mode: 'both', maxDepth: 1 }`, `granularity: 'component'` (o que hoje só valia para nós fora de C4) |

**"Quem depende" / "Do que depende":** já são ArchiMate. Ficam como estão, porque o rótulo já diz o que fazem. A
matriz também fica como está.

**Clique duplo (ação primária)** num sistema, container ou grupo:

| Visão atual | Nó | Abre |
|---|---|---|
| C4 | sistema, container, grupo | como hoje: "Abrir containers", "Abrir componentes", "Abrir grupo" |
| ArchiMate | sistema ou container com filhos | **decidido pelo usuário:** ArchiMate em camadas com os filhos dentro da caixa do pai: `{ notation: 'archimate', viewpoint: 'layered', anchor: id, traverse: { mode: 'both', maxDepth: 2 }, granularity: <nível dos filhos>, nesting: { mode: 'nested', depth: 1 } }`. Para um sistema, `granularity: 'container'`; para um container, `'component'` |
| ArchiMate | grupo | *Decisão minha:* os membros do grupo em ArchiMate, aninhados no grupo, por exemplo `viewpoint: 'application'`, `include: [id]`, `nesting: { mode: 'nested', depth: 1 }`. O construtor confere no exemplo e escolhe a forma que mostre os membros dentro do grupo |
| qualquer | folha, sem filhos | nada, como hoje |

- **Rótulo no menu:** a ação equivalente em ArchiMate aparece como ação primária, com um rótulo próprio, por exemplo
  "Abrir em camadas (aninhado)".
- **"Abrir containers (C4)":** continua no menu de uma visão ArchiMate para quem quiser trocar de propósito.

**Limitação aceita:** a visão ArchiMate em 2 passos não mostra vizinhos ligados a netos do nó. No exemplo da loja,
o Gateway de Pagamentos e o Serviço Antifraude ligam num componente da API de Pedidos e ficam de fora. A C4 mostra
os dois. O usuário escolheu não mexer no núcleo por isso (sem a regra "vizinhos dos filhos contam").

**Planejar:** a prévia do Planejar usa as mesmas ações (`/plan/...` actions sobre a prévia) e segue a mesma regra.

### 3. Feedback de carregamento de visões (opção C dos mockups)

Vale para toda espera por uma visão nova no Navegar: menu do botão direito, clique duplo, troca de notação, agrupar,
histórico, busca e catálogo. Vale também para a prévia do Planejar.

**Durante a espera:**

- **Barra fina de progresso** (indeterminada) na borda de baixo da barra de cima.
- **Linha de status:** "Carregando “<título ou rótulo da ação>”…" com um botão **Cancelar**. Cancelar descarta o
  pedido (invalida o ticket) e mantém a visão atual.
- **Diagrama:** esmaecido, como hoje (`.busy`). Cliques, clique duplo e botão direito no diagrama não fazem nada.
- **Painel do nó:** legível. **Editar**, **Escrever**, os editores abertos, os botões de ArchiMate | C4 e o
  Agrupar ficam desabilitados, com a dica "Disponível quando a visão terminar de carregar".
- **Editor já aberto quando a espera começa:** o texto digitado não se perde. *Decisão minha:* o editor fica aberto,
  com o texto, e só não aceita digitação nem Confirmar durante a espera. Isso exige que a chegada da visão não
  remonte o painel nem o editor.
- **Atraso:** o aviso visual (barra, linha de status, dica) só aparece se a espera passar de ~300 ms. O bloqueio das
  ações vale desde o primeiro instante.

**A chegada da visão nunca desfaz o que o usuário fez:**

- **Nó selecionado:** se estiver na visão nova, continua selecionado; se não estiver, o painel continua mostrando o
  nó. Hoje a seleção já persiste, então o construtor confere que nada remonta.
- **Causa do sumiço da documentação:** o construtor investiga e corrige a remontagem do painel ou do `DocTab` ao
  trocar de visão, com um teste que reproduz "pedir visão → abrir editor/doc → visão chega → texto intacto".

**Fora:** as rodadas do chat já têm etapas próprias e continuam como estão.

### 4. Etapas do Aplicar

#### GUI: janela central com checklist (opção B)

Ao clicar Aplicar no Planejar, abre uma janela modal no centro, por cima de tudo, com o título "Aplicando N mudanças
na base" e as etapas:

1. Conferindo o plano com a base atual
2. Gravando a base. Detalhe conforme o conector, por exemplo "commit a1b2c3d" no modo git do gbrain, ou a pasta
   gravada.
3. Gerando o ARCHITECTURE.md
4. Regerando as visões salvas, com o detalhe "k de n" e "conferindo a legibilidade" (as capturas e checagens do build)

**Durante:**

- Etapa concluída: ✓. Etapa em andamento: indicador girando. Etapas seguintes: apagadas.
- A janela não fecha, nada atrás dela é clicável, e não há Cancelar: gravar não se interrompe no meio.

**Ao terminar:**

- A janela mostra o resumo: rodada, commit sugerido ou feito, visões regeradas e quantos alertas de legibilidade,
  com o mesmo conteúdo que a GUI mostra hoje após o Aplicar.
- Um botão **Fechar**. *Decisão minha.*

**Se falhar:**

- A etapa fica em vermelho, com a mensagem, e as seguintes não acontecem.
- Se a falha vier depois de a base estar gravada (documento ou visões), a janela diz que a base foi gravada. O
  servidor já distingue isso: `docError` e `build.error`.
- Recusas antes de gravar (409 do plano mudado, conflitos) seguem o caminho de hoje. A janela fecha e mostra a
  mensagem, ou o construtor a mostra na própria etapa 1.

**Notas:** depois que a janela fecha, o chat propõe as notas como hoje (`notesDraftNeeded`). *Decisão minha:* as
notas ficam fora do checklist, porque dependem do usuário revisar. A janela termina com "A seguir: o chat propõe as
notas de interpretação".

**Como chega à tela:**

- A rota `/plan/apply` passa a emitir as etapas em fluxo, como a rota de rodada do chat já faz com `stage`: eventos
  `step` (início e fim de cada etapa, com detalhe) e um evento final com o resultado de hoje.
- O núcleo expõe pontos de progresso: um callback opcional `onStep` em `applyAndDocument`/`applyPlan` e no
  `buildDiagrams` (por visão), sem mudar o comportamento para quem não passa o callback.
- *Decisão minha:* o servidor roda o apply num **worker**, como `bases-worker.mjs` já faz com leituras, e repassa
  as etapas que ele posta. O motivo: `applyAndDocument` é síncrono (inclusive o git, que usa `spawnSync`), então na
  thread principal as etapas 2 e 3 só chegariam juntas, já concluídas. O núcleo continua síncrono, e a CLI e os
  conectores não mudam. A volta para a thread principal precisa recarregar a base (`registry.reload`) e manter o
  turno (`inTurn`) de hoje, para nenhuma leitura ficar entre a conferência e a gravação.
- *Decisão do construtor:* o formato exato dos eventos, sem quebrar a API para clientes que esperam o JSON final.
  Pode ser `Accept`, um parâmetro ou uma rota nova.

#### Skill `archlens-apply` e CLI

- **A CLI imprime as etapas ao começar e ao terminar**, no mesmo vocabulário da GUI:
  - `archlens apply`: conferindo, gravando, gerando o ARCHITECTURE.md;
  - `archlens build`: "visão k de n: <key>", com as checagens.
  - Formato: linhas `✓ …`, `… …`. Sem animação: a saída precisa continuar legível em log e CI.
- **A skill `archlens-apply`** mostra ao usuário, no início, o checklist do fluxo dela (conferir o plano, aplicar,
  gerar, ler o relatório de qualidade, escrever a interpretação, entregar). Ela marca cada passo ao concluir e repassa
  as linhas de etapa da CLI, em vez de ficar em silêncio até o fim.
- **Modo MCP do gbrain:** as etapas dele, como releitura, gravação e recibos, já são passos separados. A skill os põe
  no checklist.

## Fora do escopo

- A regra de núcleo "os vizinhos dos filhos contam na travessia", para a visão ArchiMate ficar igual à C4 em
  vizinhos. Fica registrada como possibilidade futura.
- Bloquear a GUI durante as rodadas do chat (já existe tratamento próprio).
- Mudar o que o Aplicar faz. Só passa a contar o que faz.

## Anti-objetivos

- Trocar de notação sem pedido do usuário, mesmo "para ajudar".
- Spinner que pisca em visões rápidas.
- Perder texto digitado em qualquer espera.
- Saída da CLI com animação ou caracteres de controle que poluam logs.

## Restrições do repositório

- **AGENTS.md, archlens-ask:**
  - As partes 1 a 3 são da GUI.
  - A parte 4 muda a saída da CLI (`apply`, `build`) e a skill `archlens-apply`. Avaliar o impacto no archlens-ask:
    provavelmente nenhum, porque ele não reproduz o apply, mas rodar `npm run check-ask`.
- **AGENTS.md, GUI:**
  - `npm run gui:test`.
  - Mudanças em `archlens-apply` ou `references/` pedem `npm --prefix apps/gui run prompt`.
- **Testes:**
  - Os testes atuais de `navigation.mjs` que esperam C4 em "Focar" para containers continuam valendo quando a visão
    atual é C4.
  - Novos testes cobrem ArchiMate.
- **CHANGELOG:** entrada para as quatro partes.
