# P15 — Edição gráfica do modelo

**Linha:** v1 · **Tamanho:** G · **Depende de:** P03 (cliente do diagrama modular), P07 (ponte segura) · **Requisito:** R1

## Objetivo

Criar, alterar e excluir nós e conexões direto no diagrama, sem escrever prompt, complementando o que o chat ou a
leitura de repositório propuseram. Toda edição continua passando pelo plano antes de ser gravada.

## Evidência

- `apps/gui/server/plan/edits.mjs`: a camada de edições da tela é
  `{ [id]: { properties?, doc? } }`. `checkEdits` recusa qualquer outro campo ("campos desconhecidos nas edições").
  Só vale para nós que já existem na base ou no delta.
- Não há como, pela tela: criar elemento, criar relação, excluir, renomear, trocar tipo, mover de pai, mudar o ciclo
  de vida.
- O que já ajuda:
  - `composeDelta(delta, edits)` sobrepõe as edições da tela ao delta do agente, e `screenConflicts` trata o caso em
    que o chat propõe outro valor para o mesmo campo;
  - o formato de delta aceita `rename` e `remove` (`schemas/delta.schema.json`);
  - `checkRelationship(type, src, dst)` em `scripts/lib/registry.mjs` diz se uma relação é válida entre dois tipos;
  - `ELEMENT_TYPES`, `RELATIONSHIP_TYPES`, `C4_KIND_TYPES` dão o catálogo para uma paleta;
  - a prévia já desenha o delta com `+ ~ −` (`scripts/lib/preview.mjs`).
- A ponte do iframe só leva `ready`, `select`, `context`, `expand`, `theme`, `state` do diagrama para o host, e
  `act`, `theme`, `select` no sentido contrário (`apps/gui/web/src/bridge.ts`).
- O diagrama é SVG gerado no servidor, com layout automático (ELK, `scripts/lib/layout.mjs`). A base não guarda
  posição de nós.
- O rascunho viaja inteiro a cada requisição (`DRAFT_MAX_BYTES = 2_000_000`) e o plano é refeito no servidor.

## Escopo

1. **Camada de edições estendida:** operações de tela para criar elemento (tipo, nome, pai, perfil C4), criar
   relação (origem, destino, tipo, rótulo), renomear, mudar tipo quando permitido, mover de pai, mudar ciclo de vida,
   excluir elemento ou relação. Compostas no delta por `composeDelta`, com as mesmas regras de conflito com o chat.
2. **Interação no diagrama:** paleta de tipos por notação (C4 e ArchiMate); "ligar" arrastando de um nó a outro, com
   a escolha limitada aos tipos de relação válidos para o par; excluir pelo menu de contexto e pelo teclado; renomear
   no lugar; desfazer e refazer sobre a camada de edições.
3. **Ponte:** mensagens novas e tipadas (gesto de ligação, posição do clique na tela vazia, pedido de exclusão),
   validadas nos dois lados.
4. **Retorno imediato:** o que foi editado aparece na prévia com a notação de delta; erros de validação do núcleo
   aparecem junto do elemento, em linguagem de usuário.
5. **Exclusão com impacto:** antes de excluir, mostrar o que depende do elemento (relações, filhos, visões salvas),
   usando o que o plano já calcula.
6. **Convivência com as outras fontes:** editar um nó que veio de leitura de repositório preserva a proveniência e
   registra a edição manual como fonte.

## Fora do escopo

- **Posicionamento livre** de caixas e roteamento manual de setas. O layout segue automático; guardar posições seria
  mudança de formato da base e de todo o render.
- Edição simultânea em tempo real por várias pessoas.
- Gravar sem passar pelo plano.

## Critérios de aceite

- Sem usar o chat, uma pessoa cria um sistema, dois containers dentro dele e uma relação entre eles, vê a prévia,
  aplica, e a base resultante passa em `archlens check`.
- A GUI não oferece um tipo de relação que `checkRelationship` recusa para o par escolhido.
- Uma edição gráfica e uma proposta do chat sobre o mesmo elemento geram um conflito visível, nunca uma sobrescrita
  silenciosa.
- Excluir um elemento com dependentes mostra o impacto e pede confirmação.
- Nenhuma regra de modelagem duplicada na GUI: validação, casamento de entidades e plano vêm do núcleo.
- Tempo de resposta por edição dentro do orçamento definido no P05 para a base de referência.

## Decisões a fechar no brainstorm

- A edição acontece só no Planejar, ou também direto no Navegar (como hoje faz o `Editar` do painel do nó).
- Como evitar refazer o plano inteiro a cada gesto: aplicar a edição de forma otimista na tela e reconciliar, ou
  agrupar gestos.
- Onde a camada de edições mora quando as propostas forem para o servidor (P09, corte 1).
- Até onde ir no ArchiMate: todos os tipos, ou um subconjunto guiado por camada.
- Se edições de visão (o que entra, agrupamento, título) fazem parte deste plano.

## Obrigações do repositório

Mexe em `render.mjs` (ponte e cliente) e possivelmente no formato de delta: avaliar a GUI (`npm run gui:test`, e2e)
e o archlens-ask (`npm run check-ask`). Mudança em `references/` ou na skill `archlens-plan` pede
`npm --prefix apps/gui run prompt`. Regra do `AGENTS.md`: o núcleo não muda só para acomodar a GUI; o que entrar no
delta tem de fazer sentido também para a CLI.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 2.6, R1), `P15-edicao-grafica-do-modelo.md`,
> `apps/gui/server/plan/edits.mjs` e `docs/superpowers/specs/2026-11-09-painel-do-no-e-edicao-no-planejar-design.md`.
> Ofereça ao dono um protótipo descartável do gesto de ligar dois nós antes de fechar o desenho. Divida em ciclos:
> (1) criar e excluir nós, (2) relações, (3) renomear e mover, (4) desfazer e impacto.
