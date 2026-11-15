# P16 — Conector primário com réplicas sincronizadas

**Linha:** v1 · **Tamanho:** G · **Depende de:** P04 (contrato assíncrono), P12 (um primário real, PostgreSQL), P17 (servidor central) · **Requisito:** R3

## Objetivo

Uma base tem um conector **primário**, onde se grava, e um ou mais conectores **complementares** mantidos em dia a
partir dele, para que outras ferramentas consultem a base por outros meios. Exemplo: PostgreSQL como primário,
replicando para um gbrain (git ou MCP).

## Evidência

- O manifesto `archlens.json` aceita um único `store` (`scripts/lib/store/config.mjs`, `validateStore`), com `kind`
  `json`, `markdown` ou `gbrain` (modos `git` e `mcp`).
- `store convert` (`scripts/lib/store/convert.mjs`) **move** a base de um conector para outro: grava o destino,
  confere e troca o manifesto. É uma operação única; depois dela a origem deixa de ser a base. Não há espelho.
- As peças úteis já existem: `diffRaw` e `applyOps` (`store/ops.mjs`) calculam e aplicam a diferença entre dois
  retratos; `contentVersion` identifica um retrato; o changelog registra cada rodada.
- **Restrição do gbrain em modo MCP:** quem grava é um agente chamando as ferramentas do gbrain; a CLI prepara os
  pedidos e confere os recibos (`--read-check`, `--receipts`, `--resume`, `--undo`). Não há processo autônomo que
  grave nesse modo.
- O archlens-ask consulta a base **no gbrain** (`portable/archlens-ask/`): é um consumidor concreto de uma réplica.
- O gbrain em modo git faz um commit por `apply` (`store/gbrain-git.mjs`).

## Escopo

1. **Configuração:** o manifesto (ou a configuração do servidor) declara o primário e a lista de réplicas, cada uma
   com seu conector. Credenciais fora do manifesto, como já é regra.
2. **Sentido único:** primário → réplicas. A réplica é marcada como somente leitura para o archlens; `apply` direto
   nela é recusado com mensagem que aponta o primário.
3. **Replicação por evento:** depois de cada `apply` no primário, as operações (ou a diferença entre versões) entram
   numa fila e são aplicadas em cada réplica, fora do caminho da gravação.
4. **Reconciliação periódica:** compara a versão do primário com a de cada réplica e corrige o desvio.
5. **Desvio na réplica:** mudança feita por fora (um commit manual no gbrain, por exemplo) é detectada e relatada. A
   política é configurável: sobrescrever, ou transformar a mudança em delta que passa pelo plano. Nunca mesclar em
   silêncio.
6. **Estado e observação:** versão e horário da última sincronização por réplica, atraso, falhas, nova tentativa com
   espera crescente; exposto na API, na GUI (para administradores) e nas métricas do P08.
7. **Comandos:** `archlens replica status|sync|add|remove`, e a carga inicial de uma réplica nova.
8. **Réplica gbrain em modo MCP:** decidir e implementar o caminho (ver decisões).

## Fora do escopo

- **Sincronismo nos dois sentidos** com resolução automática de conflito.
- Replicação entre primários (alta disponibilidade do banco é do banco).
- Usar a réplica para responder as consultas do próprio archlens.

## Critérios de aceite

- Depois de um `apply` no primário, a réplica chega à mesma `contentVersion` sem ação manual, e o tempo do `apply`
  não aumenta além do orçamento definido (a replicação é assíncrona).
- Com a réplica fora do ar, o `apply` no primário funciona; quando ela volta, alcança o primário sozinha.
- Um commit manual na réplica gbrain é detectado na reconciliação seguinte e tratado conforme a política.
- `archlens check` aponta réplica atrasada ou divergente.
- O archlens-ask responde igual sobre a réplica gbrain e sobre uma base gbrain gravada diretamente (mesmo layout de
  páginas).

## Decisões a fechar no brainstorm

- **Onde roda o sincronizador.** No servidor central (natural com P17) ou também na CLI, para quem não tem servidor.
- **gbrain MCP como réplica.** Opções: o servidor passa a ser cliente MCP do gbrain com credencial própria; ou a
  réplica MCP não é suportada e recomenda-se o modo git, que o gbrain já sincroniza. A segunda é bem mais simples.
- Replicar operações (pequeno, exige ordem e idempotência) ou o retrato inteiro (simples, pesado em base grande).
- Garantia: eventual é suficiente, ou algum consumidor precisa saber que está lendo uma versão exata.
- O que replica além do modelo: notas, visões salvas, changelog, diagramas gerados.
- Se "réplica" e "exportação agendada" (P11) são o mesmo mecanismo com destinos diferentes.

## Obrigações do repositório

Toca `store/` e o manifesto: avaliar a GUI e rodar `npm run gui:test`. archlens-ask: o layout das páginas no gbrain
não pode mudar; confirmar com `npm run check-ask` e com as perguntas de `eval/perguntas.json` sobre uma réplica.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 2.6, R3), `P16-primario-e-replicas.md`,
> `docs/superpowers/specs/2026-10-18-gbrain-connector-design.md` e os specs aprovados de P04, P12 e P17. Comece o
> brainstorm pelos consumidores: quem vai ler a réplica, por qual meio e com que tolerância a atraso.
