# Débito técnico: tempo de geração de diagramas na archlens-query

- **Data:** 2026-10-28
- **Branch de origem:** `develop-v2`
- **Status:** débito registrado a partir de uma medição numa sessão do Claude Code. Nada implementado ainda
- **Escopo:** skill `archlens-query` e CLI (`resolve`, `render`, `deliver`, `views`); parte das propostas vale também
  para o `build` da `archlens-apply`

## Contexto

O usuário percebe a geração de diagramas pela skill como lenta, sem saber em qual parte. Para descobrir, medimos uma
consulta real e anotamos o horário de cada passo, separando os turnos do modelo das chamadas da CLI:

- **base:** `examples/telemedicina`
- **pedido:** "os sistemas envolvidos no serviço de agendamento de consultas"
- **spec resultante:**

```json
{"key":"sistemas-agendamento","title":"Sistemas por trás do agendamento de consultas",
 "notation":"archimate","viewpoint":"layered","anchor":"bs-agendamento",
 "traverse":{"mode":"supporters"},"granularity":"system"}
```

- **resultado:** 10 nós, layout `bands-flow` (escolhido pelo `auto`), sem alertas. A fonte ficou em 24,7 px no viewport
  de 1920×1080 e em 16,4 px no de 1280×720

## Medição

### Linha do tempo da sessão

| # | Etapa | Tipo | Tempo |
|---|---|---|---|
| 1 | Carregar a skill e decidir o primeiro passo | modelo | 4,3 s |
| 2 | Ler `references/base.md` e listar o exemplo | ferramenta | ~0,05 s |
| 3 | Interpretar e decidir | modelo | 2,8 s |
| 4 | `archlens views` | archlens | 0,45 s |
| 5 | Decidir como achar o "serviço de agendamento" | modelo | 3,3 s |
| 6 | `grep` no `model.json` (achou `bs-agendamento`) | ferramenta | 0,01 s |
| 7 | Escolher a granularidade | modelo | 3,4 s |
| 8 | `grep` em `references/views.md` | ferramenta | 0,01 s |
| 9 | Montar a spec | modelo | 4,3 s |
| 10 | `archlens resolve` | archlens | 0,37 s |
| 11 | Ler o JSON do resolve (cerca de 300 linhas) e decidir | modelo | 5,2 s |
| 12 | `archlens deliver` | archlens | 2,83 s |
| 13 | Listar e abrir o screenshot | modelo e ferramenta | ~3 s |
| | **Total até o diagrama** | | **~30 s**, dos quais a CLI ≈ 3,7 s (~12%) |

**Ressalva:** a sessão leu só o começo do `base.md`, e o agente já sabia por onde procurar. Em uso real a skill manda
ler o `base.md` inteiro (15 KB) e o `views.md` (14 KB), e o modelo explora mais. Então a fatia do modelo tende a ser
**maior** do que a medida aqui.

### Decomposição do `deliver` (~2,2 s com o cache quente)

| Parte | Tempo |
|---|---|
| Início do Node | 0,04 s |
| render, `layout.style` em `auto` (calcula os 3 estilos e fica com o melhor) | 0,66 s |
| render com `bands-flow` forçado | 0,53 s |
| abrir o Chromium (`chromium.launch`) | ~0,1 s |
| para cada viewport: contexto + `goto` | ~0,15 s |
| para cada viewport: `waitForTimeout(120)` fixo | 0,12 s |
| para cada viewport: `page.screenshot` | ~0,45 s |
| fechar o navegador | ~0,05 s |

`scripts/lib/deliver.mjs` passa pelos dois viewports (`VIEWPORTS`) **um depois do outro**, então a checagem visual soma
≈ 0,1 + 2 × 0,72 ≈ 1,5 s.

## Diagnóstico

1. **O gargalo está no modelo, não na CLI.** São cerca de 6 turnos antes do `deliver`, de 3 a 5 s cada. Eles somam
   ~88% do tempo.
2. **Saídas verbosas viram tempo de modelo.** O `resolve` imprime o JSON completo, e só a leitura dele custou ~5 s.
3. **Achar o elemento a partir do nome exige improviso.** O agente recorre a `grep` no `model.json`, um caminho que
   não serve para bases `markdown` nem `gbrain`.
4. **Na CLI, a checagem visual pesa mais que o render.** Cerca de 1,5 s, contra 0,66 s do render, por causa dos
   screenshots em série.

## Propostas

### Lado do modelo (maior impacto)

| # | Proposta | Ganho esperado |
|---|---|---|
| M1 | **Comando de busca por nome**: `archlens find <base> "<texto>"`, que devolve id, tipo, nome e camada. Reaproveita a busca por nome e alias que já existe no `E_UNKNOWN_REF` e funciona em qualquer conector | elimina 1 a 2 turnos (~3–7 s) |
| M2 | **Saída curta no `resolve`** (`--format brief`: uma linha por nó e por aresta, mais a contagem e os alertas). Alternativa: a skill pular o `resolve` e ir direto ao `deliver`, que já valida | ~5 s por consulta |
| M3 | **Referências sob demanda.** Um bloco curto de "consulta rápida" no SKILL.md, e o `base.md` inteiro só para gbrain/MCP ou para uma base nova | encurta o primeiro turno |
| M4 | **`views` filtrando pelo pedido**: `archlens views <base> --match "<texto>"` traz as visões salvas e as sugeridas que tocam o termo (no caso medido, `process-bp-agendar`) | o modelo usa uma spec pronta e evita turnos de montagem |

### Lado da CLI (~2,2 s por `deliver`)

| # | Proposta | Ganho esperado |
|---|---|---|
| C1 | **Viewports em paralelo** em `inspectHtml` (dois contextos ao mesmo tempo) | ~0,6–0,7 s |
| C2 | **Screenshot mais barato**: um viewport por padrão (`--shots all` para os dois), JPEG, ou PNG direto do SVG | até ~0,45 s por screenshot evitado |
| C3 | **Trocar o `waitForTimeout(120)`** por um sinal de pronto do renderer (ex.: `window.archlens.ready`) | ~0,24 s |
| C4 | **Pular no `auto` os estilos que não têm como ganhar** (poucos nós; estilo obrigatório por molduras ou aninhamento) | ~0,13 s por visão; pesa no `build` com muitas visões |
| C5 | **Um navegador para todas as visões** no `build` e entre visões (se ainda não for assim) e, na `deliver`, reusar a página entre visões | relevante em máquina fria e no WSL |

## Achado lateral (possível defeito)

Com `granularity:"system"`, o diagrama não liga a **Plataforma de Teleconsulta** (`tele`) ao serviço **Agenda e
cobrança** (`as-agenda`). Quem realiza o serviço é o container `tele.api`, e essa realização deveria subir para o
sistema-pai. Em vez disso, `tele.api` só aparece como caminho (`via`) das arestas derivadas `gateway → as-agenda` e
`ss-rds → as-agenda`. Precisa investigar na elevação de relações por granularidade (`query-archimate.mjs`), com um teste
que reproduza o caso.

## Impacto no archlens-ask

- **M1, M4, C1–C5:** sem impacto. São comandos novos ou otimizações internas que não mudam a semântica das visões.
- **M2:** sem impacto se for só um formato novo do `resolve`. O `query --format md`, que o archlens-ask copia, não muda.
- **M3:** só muda a SKILL.md. Avaliar se o `INSTRUCTIONS.md` deve seguir a mesma organização.
- **Achado lateral:** se a correção mudar o resultado da granularidade `system`, rodar `npm run ask` e atualizar
  `eval/perguntas.json` quando alguma pergunta de validação mudar.

## Como medir de novo

Repetir a consulta acima em `examples/telemedicina`, anotando o horário (`date +%T.%3N`) antes e depois de cada passo,
e comparar com a tabela da *Linha do tempo*. Para a CLI isolada: `time archlens render …`, `time archlens deliver …`, e
um script com `playwright-core` que mede `launch`, `goto` e `screenshot`.
