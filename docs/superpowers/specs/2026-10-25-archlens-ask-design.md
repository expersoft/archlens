# archlens-ask: consulta à base no gbrain para agentes sem código (Gem, Copilot e afins)

- **Data:** 2026-10-25
- **Branch:** a criar a partir de `develop-v2` (PR de volta para `develop-v2`)
- **Status:** desenhado com o usuário em conversa (brainstorming), com uma rodada de perguntas de um revisor
  respondida pelo usuário. Decisões marcadas *(decisão do agente)* podem ser revistas na leitura
- **Alvos da primeira versão:** **Microsoft 365 Copilot** e **Claude Desktop**, ambos com suporte nativo a MCP. Gemini
  (Gems) e outros barramentos de agentes ficam para depois, com o mesmo pacote
- **Depende de:** [conector gbrain](2026-10-18-gbrain-connector-design.md) (e.4.1, PR #18): layout das páginas e schema
  pack; [plan, apply e query](2026-10-18-plan-apply-query-design.md) (e.3): a semântica das consultas que esta skill
  reproduz

## Contexto e objetivo

O archlens completo (skills `archlens-plan`, `archlens-apply`, `archlens-query` + CLI em Node) roda no Claude Code ou
em outro harness que executa código. Com o conector gbrain, a base de arquitetura passa a viver num gbrain
compartilhado. Mas quem mais precisa **consultar** a arquitetura (arquitetos, POs, engenheiros de software e diretores)
trabalha em assistentes como Gemini (Gems), GitHub Copilot (agentes) ou outros barramentos de agentes que:

- acessam o gbrain via MCP;
- renderizam markdown e Mermaid;
- **não executam código** (sem Node, sem a CLI do archlens, sem ELK, sem navegador).

As perguntas são as mesmas que o archlens se propõe a responder: impacto de negócio e de tecnologia. Exemplos: "que
sistemas sustentam o processo de negócio X?", "que aplicações consomem o evento Y?", "o que é afetado se o container A
cair?", "me fale do sistema Z".

**Objetivo:** um pacote de texto puro, o **archlens-ask** *(nome: decisão do agente)*, que se cola como instruções de
uma Gem, de um agente do Copilot ou equivalente. Com o MCP do gbrain configurado no ambiente, o pacote responde a essas
perguntas lendo a base direto no gbrain, com a mesma semântica de seleção da `archlens-query`. A resposta sai em
markdown, em diagramas Mermaid ou nos dois.

## Metas

1. **Mesma resposta que a `archlens-query`, em conteúdo.** Para uma mesma pergunta, os mesmos elementos e as mesmas
   relações (inclusive as derivadas), pelas mesmas regras de travessia. As regras são escritas como instruções que o
   modelo segue à mão.
2. **Três formatos de entrega**, escolhidos pelo pedido:
   - **análise em markdown:** tabelas por camada ou nível, relações em frases, matriz de impacto, cartão do elemento.
     É o equivalente ao `archlens query --format md`;
   - **só diagrama(s)** Mermaid;
   - **markdown enriquecido por diagramas** (padrão quando o pedido não diz, *decisão do agente*).
3. **Diagramas pensados para o Mermaid**, como uma visão nova e não uma cópia do layout do archlens:
   - **C4:** notação C4 nativa do Mermaid (`C4Context`, `C4Container`…), com as cores C4 do archlens;
   - **ArchiMate:** o Mermaid não tem ArchiMate. São caixas com o tipo ArchiMate como estereótipo (`«business-process»`,
     `«application-component»`…), nas cores de camada do archlens, uma faixa (`subgraph`) por camada, relações
     derivadas tracejadas e o tipo da relação no rótulo da seta.
4. **Independente do archlens em tempo de execução:** nenhum arquivo, script ou comando do archlens é necessário no
   ambiente do agente. Só o pacote e o MCP do gbrain.
5. **Sincronizado com o archlens completo:** vive no mesmo repositório e é atualizado na mesma manutenção que muda o que
   ele copia (ver *Relação com o archlens completo*).

## Fora do escopo (não-metas)

- **Gravar ou preparar mudanças.** A skill nunca grava no gbrain e nunca monta delta ou plano. Quando a conversa revela
  algo faltando ou errado na base, ela diz que isso deve ser levado ao archlens completo (Claude Code ou harness
  compatível, skill `archlens-plan`) e para ali.
- **Pré-calcular respostas no gbrain.** O `archlens-apply` e o conector gbrain **não mudam**. Tudo é calculado sob
  demanda pelo agente.
- **Reproduzir o desenho do archlens.** Nada de ELK, estilos `flow`/`bands`/`bands-flow`, HTML animado, screenshots,
  checagens de legibilidade ou matriz interativa.
- **Bases fora do gbrain.** Bases em pasta local (json/markdown) ou vault não são alvo: o agente não tem sistema de
  arquivos.
- **Configurar o MCP, credenciais ou o ambiente** do Gemini, Copilot etc. Isso é do usuário (como no conector gbrain).

## Anti-metas (falha mesmo funcionando)

- **Impactar o desenvolvimento das três skills do archlens completo.** Nenhuma regra, formato, campo ou código passa a
  existir nelas por causa do archlens-ask. A dependência vai num sentido só: o archlens completo manda e o archlens-ask
  segue.
- **Respostas que inventam.** Um elemento ou relação que não está no gbrain, ou uma direção de impacto invertida, é pior
  que uma resposta incompleta. Na dúvida, a skill diz o que não conseguiu verificar.
- **Diagramas ilegíveis.** Um Mermaid com 80 nós "porque a travessia trouxe 80" é falha. A skill recorta e diz o que
  ficou de fora.

## Restrições

- **Ambiente sem código:** só chamadas de ferramenta MCP, raciocínio e texto. Toda lógica é instrução em linguagem
  natural, mais tabelas.
- **Ferramentas de leitura do gbrain** (spec do conector, §2): `get_page` (com `include_content`), `list_pages`
  (filtro por tipo/tag, até 100 linhas por chamada, com cursor), `get_backlinks`, `traverse_graph` (profundidade, tipo
  de ligação, direção) e `resolve_slugs`. A skill usa só estas; nenhuma ferramenta de escrita.
- **Ligações tipadas: recomendadas, não obrigatórias** *(decisão do usuário)*. O MCP remoto (HTTP) do gbrain ignora as
  ligações tipadas do frontmatter (`frontmatter_links` do schema pack). Só os `[[wikilinks]]` do **corpo** viram
  ligações, do tipo `mentions`, até alguém rodar `gbrain sweep` no servidor. No modo git, o sync lê as ligações tipadas
  normalmente. O corpo de uma página de elemento cita só os destinos das relações. `parent` e `group` existem apenas no
  frontmatter, e a página de um `grouping` não lista os membros. Então:
  - **Com ligações tipadas** (base no modo git, ou `gbrain sweep` rodado; é o modo **recomendado**, já documentado em
    `references/base.md` para a "IA corporativa"): `get_backlinks`/`traverse_graph` acham relações de entrada, filhos
    (`part_of`) e membros de grupo (`member_of`).
  - **Sem ligações tipadas** (consulta **permitida**, modo degradado): as relações de entrada continuam acessíveis pelos
    backlinks `mentions` do corpo. Filhos e membros de grupo só aparecem lendo as páginas candidatas. A skill usa
    `list_pages` filtrado por tipo (as pastas de tipo prováveis: filhos de um sistema são `application-component`,
    membros de grupo de qualquer tipo) e `get_page` em cada uma, conferindo `parent`/`group`. Antes de uma leitura
    ampla, avisa o custo e pergunta. Quando não ler tudo, a resposta diz que hierarquia e grupos podem estar
    incompletos.
  - **Detecção:** a skill descobre o modo uma vez por conversa. Ela pega um elemento com `parent` conhecido e confere se
    `get_backlinks` do pai o devolve como `part_of`. No modo degradado, avisa uma vez que o modo recomendado é o git ou o
    `sweep`.
  - Em qualquer modo, **a fonte da verdade para tipo e direção de uma relação é a lista `relationships` no frontmatter
    da página de origem**, lida com `get_page`. `traverse_graph` e `get_backlinks` servem para **achar candidatos**,
    nunca para afirmar tipo ou direção.
- **Tamanho das instruções:** M365 Copilot (agente declarativo / Copilot Studio) e Claude Desktop (projeto com
  instruções, ou skill enviada) têm limites de tamanho de instruções e de anexos. O pacote precisa caber: um arquivo
  principal de instruções e poucos anexos de referência (ver *Pacote*). O construtor confere o limite exato de cada
  plataforma e o registra no README do pacote. Se o Claude Desktop oferecer execução de código, a skill **não** depende
  dela.
- **Mermaid:** ArchiMate em `flowchart` (`subgraph`, `classDef`, `linkStyle`, setas `-->`/`-.->`, rótulos em aspas). C4
  na **sintaxe C4 nativa do Mermaid** *(decisão do usuário)*. Ela é marcada como experimental no Mermaid, e o construtor
  confere se M365 Copilot e Claude Desktop a renderizam, registrando no README o que não renderiza. Não há volta
  automática para `flowchart`.

## O que a base no gbrain oferece (layout de hoje)

Sob um prefixo (padrão `archlens/`), todas as páginas têm a tag `archlens` (`scripts/lib/store/gbrain-layout.mjs`):

| Página | Conteúdo útil para consulta |
|---|---|
| `<prefixo>/<tipo-archimate>/<id>.md` | frontmatter: `id`, `type`, `title`, `aliases`, `c4` (kind), `status`, `technology`, `tags`, `group`, `parent` (wikilinks), `external`, `relationships` (lista `{id, type, to, description?, technology?}`, **só as de saída**), campos por tipo de relação com wikilinks; corpo: descrição + seção "Relações" em frases |
| `<prefixo>/views/<key>.md` | visão salva: resumo legível + spec da visão num bloco ` ```archlens-json ` |
| `<prefixo>/manifest.md` | nome e descrição da base (bloco `archlens-json`) |
| `<prefixo>/notes/<nome>.md` | notas de interpretação (texto) |
| `<prefixo>/changelog.md` | histórico de rodadas |
| `<prefixo>/gbrain-pack.yaml` | schema pack: tipos de página e tipos de ligação com inversos |

Exemplo real: `examples/loja-online-vault/architecture/application-component/antifraude.md`.

Consequências para as instruções:

- **Relações de saída** de X: o `relationships` da página de X.
- **Relações de entrada** de X: `get_backlinks(X)` dá as páginas candidatas; o `relationships` de cada uma confirma tipo
  e direção (`to: X`).
- **Hierarquia:** `parent` (filho → pai); os filhos de X são os backlinks cujo `parent` aponta para X.
- **Identificação do elemento pedido:** pelo nome ou alias via `resolve_slugs`/`list_pages`; se houver ambiguidade, a
  skill pergunta ao usuário qual elemento é.

## Comportamento da skill

### Fluxo de uma pergunta

1. **Achar a base:** descobrir o prefixo (procurar `manifest.md` com a tag `archlens`). Se houver mais de uma base,
   perguntar qual. Sem base: dizer que não há base archlens acessível por este MCP.
2. **Classificar o pedido** pela tabela pedido → visão (abaixo), que é a mesma da `archlens-query` (`SKILL.md`, seção
   *Pedido → view spec*). Se uma visão salva (`views/<key>.md`) corresponde ao pedido (pelo título ou pela âncora), usar
   a spec dela.
3. **Resolver a âncora/escopo** em ids da base.
4. **Ler o subgrafo** necessário, com as regras de travessia (abaixo), registrando as páginas lidas.
5. **Montar o resultado**: elementos (com camada/nível, tipo, status, tecnologia) e relações (diretas e derivadas).
6. **Entregar** no formato pedido. Sempre dizer qual recorte foi usado (a spec equivalente em uma linha) e o que ficou
   de fora (recorte por tamanho, páginas que não puderam ser lidas).

### Regras que viram instruções (paridade com a `archlens-query`)

Copiadas da semântica de `references/views.md`, `references/c4.md` e `scripts/lib/registry.mjs` (`supportDirection`,
`orientBySupport`), em texto:

- **Direção de sustentação por relação:**

  | relação | sustenta → é sustentado |
  |---|---|
  | serving, realization, assignment, influence | origem → destino |
  | composition, aggregation | parte (destino) → todo (origem) |
  | access | dado (destino) → quem acessa (origem) |
  | triggering, flow | antes → depois, **só se pedido** (seguir processos) |

- **`supporters(P)`** / **`dependents(A)`** / **`both`**, transitivos, com as relações padrão (`composition, aggregation,
  assignment, realization, serving, access, influence`) e profundidade máxima 12.
- **Hierarquia:** `parent` conta como composição. Subir ao pai é permitido, mas depois de subir não se desce de novo
  (os irmãos não vazam).
- **Granularidade:** `container` esconde componentes C4 e o sistema-pai quando seus containers aparecem; `system`
  sobe tudo ao sistema. Padrões por viewpoint como em `views.md`.
- **Derivação:** quando um elemento sai da visão (camada, `collapse`, granularidade), a cadeia vira relação derivada
  com o **tipo mais fraco** (composition > aggregation > assignment > realization > serving > access > influence),
  pelo caminho mais curto até a âncora, uma por elemento.
- **Elevação C4:** componente → componente vira container → container quando a visão mostra containers. Relações
  paralelas são agregadas.
- **Setas C4 a partir de ArchiMate:** derivação pelos intermediários (`application-service`, `-interface`, `-function`,
  `-process`) como em `references/c4.md`.
- **Status:** padrão mostra tudo menos `retired`; as-is = `active, deprecated`; to-be = `draft, planned, active`.
- **Grupos:** `only`, `crossOnly`, molduras (como `subgraph`).
- **Níveis C4:** landscape, context, container, component, dynamic (passos numerados nas setas).
- **Viewpoints ArchiMate:** business, application, technology, layered, product-support, impact, custom (camadas).
  `impact` sempre inclui a matriz de dependência em markdown.

A tabela **pedido → visão** da `archlens-query` vai para o pacote quase literal, trocando "view spec para a CLI" por
"recorte que você vai montar".

### Formatos de saída

- **Markdown**, espelhando o `archlens query --format md` (`references/views.md`, *Consulta em markdown*): título +
  recorte usado; elementos por camada (ArchiMate) ou nível (C4) em tabela `nome · tipo/kind · status · tecnologia`;
  relações em frases (uma por linha, derivadas marcadas "via …"); matriz de impacto quando `impact`; **cartão do
  elemento** para "me fale de X" (nome, tipo, perfil C4, status, tecnologia, descrição, pai/filhos, relações de saída e
  de entrada por tipo, fontes, notas). O vocabulário das frases segue o `explain.mjs` (ex.: atribuição ator→papel
  "desempenha o papel", nó→artefato "roda em").
- **Mermaid ArchiMate:** `flowchart TB`; um `subgraph` por camada, na ordem negócio → aplicação → tecnologia (outras
  camadas quando presentes: motivação e estratégia acima, implementação abaixo); nó `id["«tipo»<br/>Nome"]`; `classDef`
  por camada com as cores do archlens (abaixo); relações com o tipo no rótulo; derivadas com `-.->` e rótulo
  "tipo (derivada)"; âncora destacada (borda grossa na cor `--focus`). Elementos `draft` com borda tracejada.
  Aninhamento (`nesting: nested`) como `subgraph` dentro da faixa.
- **Mermaid C4** *(decisão do usuário: a notação C4 nativa do Mermaid, não `flowchart`)*:
  - um diagrama por nível: `C4Context` (landscape, context), `C4Container`, `C4Component`, `C4Dynamic` (passos
    numerados com `RelIndex`) e `C4Deployment`, quando houver nós de implantação;
  - elementos: `Person`/`Person_Ext`, `System`/`System_Ext`, `SystemDb`/`SystemQueue` quando as tags indicarem banco ou
    fila (`STORE_TAGS`, tags `topic`/`queue`/`messaging`), e as variantes `Container`/`ContainerDb`/`ContainerQueue`/
    `Component`, com `_Ext` para externos;
  - fronteiras: `System_Boundary`/`Container_Boundary` para o sistema ou container aberto, e `Boundary`/
    `Enterprise_Boundary` para as molduras de grupo;
  - relações: `Rel(from, to, "descrição", "tecnologia")` (agregadas quando paralelas); derivadas com `$tags` ou com o
    texto "(derivada)" no rótulo;
  - cores do archlens com `UpdateElementStyle`/`UpdateRelStyle` (ou `AddElementTag`) por elemento;
  - quando o rótulo de uma relação sair ilegível, ajuste por `UpdateRelStyle` (offsets). Para o resto, vale o layout do
    Mermaid C4, que é limitado (sem controle fino de posição). O construtor documenta essa limitação no README.
- **Legibilidade:** acima de ~12 nós C4 ou ~24 ArchiMate (a regra prática de `views.md`), a skill propõe um recorte
  (granularidade, foco + profundidade, grupos) em vez de desenhar tudo. Pode entregar o markdown completo junto com um
  diagrama recortado.

### Cores (do archlens, `scripts/lib/render.mjs`, tema claro)

| Uso | Preenchimento | Borda |
|---|---|---|
| negócio | `#fff5a8` | `#a89a2c` |
| aplicação | `#b6eef6` | `#338fa0` |
| tecnologia | `#cbe8b9` | `#558f42` |
| motivação | `#dcd6ff` | `#6f62c9` |
| estratégia | `#f6dcaa` | `#ae8330` |
| implementação | `#ffdfe3` | `#b85f6c` |
| outros | `#ffffff` | `#8f8f8f` |
| C4 pessoa / sistema / container / componente / externo | `#0b3d78` / `#1168bd` / `#3f86d0` / `#8cc0f2` / `#8791a1` | texto branco (componente: `#0b2540`) |
| foco/âncora | — | `#f2b705` |

Só o tema claro *(decisão do agente)*: o Mermaid não troca `classDef` por tema e as cores claras continuam legíveis
no escuro.

## Pacote

**Onde fica:** `portable/archlens-ask/` na raiz do repositório *(decisão do agente)*, **fora de `skills/`**:

- `tests/skills.test.mjs` exige exatamente as três skills em `skills/`;
- tudo em `skills/` é instalado pelo plugin do Claude Code, e o archlens-ask não é para o Claude Code (lá já existe a
  `archlens-query`).

**Conteúdo** *(estrutura: decisão do agente; o construtor ajusta aos limites medidos)*:

| Arquivo | Origem | Papel |
|---|---|---|
| `INSTRUCTIONS.md` | escrito à mão | o "prompt de sistema": papel, escopo somente leitura, fluxo, regras de travessia, tabela pedido → visão, formatos de saída, regras do Mermaid, recusas e encaminhamento ao archlens completo |
| `REFERENCE.md` | **gerado** | vocabulário: tipos de elemento (camada, aspecto), tipos de relação e inversos, direção de sustentação, mapeamento C4 ↔ ArchiMate, camadas e rótulos, status, tabela de cores, `classDef` (ArchiMate) e estilos `UpdateElementStyle` (C4) prontos, formato das páginas no gbrain |
| `EXAMPLES.md` | escrito à mão | 3 a 5 perguntas resolvidas ponta a ponta sobre `loja-online` (chamadas MCP feitas, raciocínio da travessia, resposta final em markdown + Mermaid) |
| `README.md` | escrito à mão | como instalar no **M365 Copilot** (agente com o MCP do gbrain como ação/conector) e no **Claude Desktop** (MCP do gbrain configurado + o pacote como instruções de projeto ou skill); nota curta para Gems e agentes genéricos com MCP; limites conhecidos de cada um; resultado da validação por plataforma |

Se uma plataforma só aceitar um texto, o README explica como concatenar `INSTRUCTIONS.md` + `REFERENCE.md`. Gerar essa
versão concatenada fica a critério do construtor.

## Relação com o archlens completo (sincronização)

- **Sentido único.** O archlens-ask lê o que o archlens completo define e nunca o contrário. Nenhuma das três skills,
  nem a CLI, nem os formatos, ganha requisito por causa dele.
- **Parte gerada:** `scripts/gen-ask.mjs` *(nome: decisão do agente)*, no mesmo estilo de `gen-schemas.mjs` e
  `sync-plugin.mjs`, gera `REFERENCE.md` a partir de `registry.mjs` (tipos, relações, `supportDirection`, camadas, C4),
  das cores em `render.mjs` e do schema pack (`gbrain-pack.mjs`). Com `--check`, só informa se está desatualizado
  (exit 1). Um script npm `ask` (gerar) e `check-ask` (conferir).
- **Checagem que avisa sem travar** *(decisão do usuário)*: `npm run check-ask` (fora do `npm test`) confere que
  `REFERENCE.md` está em dia. Também confere que `INSTRUCTIONS.md` cita todo viewpoint, nível C4 e campo de spec que a
  `archlens-query` documenta em `references/views.md`. Se o repositório tiver CI, ela roda lá como checagem **não
  obrigatória**. Um PR do archlens completo nunca é bloqueado por ela. Os testes do gerador (se gera, se o `--check`
  detecta desatualização) podem ficar no `npm test`, porque testam o script e não o estado do pacote.
- **Parte escrita à mão:** regras de travessia, tabela pedido → visão e formatos de saída.
- **Instruções explícitas para agentes de codificação** *(pedido do usuário)*. O repositório ganha um `AGENTS.md` na
  raiz (lido por Codex, Copilot e outros) e um `CLAUDE.md` que o importa (`@AGENTS.md`). Nenhum dos dois existe hoje.
  O texto diz, sem ambiguidade, que **toda evolução ou correção do archlens completo** inclui, no mesmo PR:
  1. avaliar se a mudança toca o que o archlens-ask copia: tipos, relações, regras de travessia/derivação, specs de
     visão, níveis C4, viewpoints, formato das páginas no gbrain, formato do `query --format md`, cores;
  2. se tocar: rodar `npm run ask`, atualizar `INSTRUCTIONS.md`/`EXAMPLES.md` à mão e, quando mudar o resultado de uma
     pergunta, o gabarito em `eval/`;
  3. rodar `npm run check-ask` antes de concluir;
  4. se não tocar: dizer isso na descrição do PR ("archlens-ask: sem impacto").

  O `AGENTS.md` também registra o sentido único: nunca mudar as três skills, a CLI ou os formatos para acomodar o
  archlens-ask. O mesmo checklist entra no README do pacote. O conteúdo inicial do `AGENTS.md` se limita a isso *(decisão
  do agente)*.
- **Versão:** o cabeçalho de `INSTRUCTIONS.md` traz a versão do archlens (do `package.json`) e o formato da base que
  entende (`archlens` 2.0). Diante de um manifesto com formato diferente, o agente avisa.

## Validação

**Critério de aceite** *(decisão do usuário, sobre proposta do agente)*: as mesmas perguntas, feitas pela
`archlens-query` (CLI) e pelo archlens-ask num agente com o MCP do gbrain, sobre a base `loja-online` no gbrain
(`examples/loja-online-gbrain`), são comparadas assim. O desenho não é comparado.

- **elementos** e **relações diretas** (tipo e direção): iguais ao gabarito;
- **relações derivadas:** mesmas pontas; o tipo pode diferir quando houver caminhos mais curtos empatados;
- **não bloqueia o merge:** o PR sai com o resultado por plataforma (acertos e divergências) registrado no README do
  pacote.

- **Conjunto de perguntas** (arquivo versionado, ex.: `portable/archlens-ask/eval/perguntas.md`, *decisão do agente*),
  cobrindo ao menos: suporte a processo (`layered` + supporters), suporte a produto (`product-support`), impacto de
  container (`impact` + matriz), consumidores de evento (dependents via `triggering`/`flow`), contexto e containers C4,
  cartão de elemento, as-is × to-be, recorte por grupos, uma visão salva.
- **Gabarito:** gerado pela CLI (`archlens query --format json`) para cada pergunta, versionado ao lado.
- **Execução:** manual, feita pelo usuário, no **M365 Copilot** e no **Claude Desktop** (o ambiente-alvo não roda em
  CI). Um harness automatizado que dirige um modelo pelo MCP do gbrain da demonstração é desejável mas opcional *(fica
  a critério do construtor)*.
- **Ambiente:** a demonstração `examples/loja-online-gbrain` monta o gbrain local (modo git, ligações tipadas
  presentes).
  - **Claude Desktop:** alcança o MCP local (stdio) desse gbrain. O README traz a configuração.
  - **M365 Copilot:** precisa de um MCP acessível pela rede, então valida num gbrain hospedado no ambiente do usuário. O
    README diz o que é preciso, sem automatizar.
  - **Modo degradado:** o conjunto de perguntas roda ao menos uma vez sem ligações tipadas. Por exemplo, numa base
    gravada pelo MCP sem `sweep`. Isso confere que os avisos de hierarquia e grupos incompletos aparecem.

## O que fica para o construtor

- Texto final de `INSTRUCTIONS.md`, ordem das seções e quanto do raciocínio exigir explícito do modelo (ex.: listar as
  páginas lidas antes de responder).
- Formato exato de `REFERENCE.md` e dos `classDef`.
- Estratégia de leitura que economiza chamadas (quando usar `traverse_graph` para mapear e quando `get_page` para
  confirmar).
- Medir os limites de tamanho de cada plataforma e ajustar a divisão dos arquivos.
- Mensagens de recusa e de encaminhamento ao archlens completo.

## Riscos

- **Deriva do modelo na travessia:** sem código, o modelo pode errar uma direção ou parar cedo. Mitigação: tabela de
  direção explícita, exemplos resolvidos, exigir que a resposta cite o recorte e diga o que não verificou, e o conjunto
  de perguntas de validação.
- **Custo em chamadas MCP:** travessias profundas leem muitas páginas. Mitigação: `traverse_graph` para mapear, recorte
  por granularidade cedo, aviso ao usuário quando a pergunta é ampla demais.
- **Divergência entre plataformas:** Gemini e Copilot podem diferir. O resultado da validação por plataforma fica
  registrado.
