# ArchiMate no archlens

O metamodelo interno é o ArchiMate 3.2. Todo elemento, inclusive os C4, tem um tipo ArchiMate, uma
**camada** e um **aspecto** (ativo, comportamento, passivo, composto ou motivação).

## Catálogo

| Camada | Estrutura ativa | Comportamento | Passivo / composto |
|---|---|---|---|
| Estratégia | — | capability, value-stream, course-of-action | resource |
| Negócio | business-actor, business-role, business-collaboration, business-interface | business-process, business-function, business-interaction, business-event, **business-service** | business-object, contract, representation, *product* |
| Aplicação | application-component, application-collaboration, application-interface | application-function, application-interaction, application-process, application-event, **application-service** | data-object |
| Tecnologia | node, device, system-software, technology-collaboration, technology-interface, path, communication-network | technology-function, technology-process, technology-interaction, technology-event, **technology-service** | artifact |
| Física | equipment, facility, distribution-network | — | material |
| Motivação | stakeholder, driver, assessment, goal, outcome, principle, requirement, constraint, meaning, value | | |
| Implementação | — | work-package, implementation-event | deliverable, gap, *plateau* |
| Outros | | | grouping, location |

Notação visual: cores oficiais por camada (negócio amarelo, aplicação azul-claro, tecnologia verde,
motivação lilás, estratégia bege, implementação rosa) e ícone do tipo no canto superior direito.
Serviços são pílulas; comportamentos têm cantos arredondados; estrutura e dados, cantos retos.

## Relações e setas

| relação | desenho |
|---|---|
| composition | linha com losango cheio na origem |
| aggregation | linha com losango vazio na origem |
| assignment | ponto na origem + seta cheia no destino |
| realization | tracejada + triângulo vazio no destino |
| serving | linha + seta aberta no destino |
| access | pontilhada + seta pequena (write: no dado; read: no leitor; readwrite: ambas) |
| influence | tracejada + seta aberta |
| triggering | linha + seta cheia |
| flow | tracejada + seta cheia |
| specialization | linha + triângulo vazio |
| association | linha simples |
| **derivada** | tracejada mais clara, tooltip com a cadeia "via …" |

## Regras verificadas (simplificação da tabela normativa)

O `validate` não reproduz a tabela completa do apêndice B da especificação. Ele pega os erros que
quebram as travessias:

- `access`: a origem é comportamento ou estrutura ativa, e o destino **passivo**. Caso contrário, `E_REL_INVALID`.
- `serving`: não envolve elementos passivos (`E_REL_INVALID`). Se vai de uma camada mais alta para
  uma mais baixa (negócio servindo tecnologia), gera `W_REL_DIRECTION`.
- `realization`: do concreto para o abstrato. Invertido entre camadas gera `W_REL_DIRECTION`. Realizar motivação,
  estratégia ou partir de implementação é livre.
- `assignment`: não parte de elemento passivo.
- `triggering`/`flow`: nunca com elemento passivo.
- `specialization`: apenas entre elementos do mesmo tipo.
- `influence` fora da motivação gera `W_REL_SUSPECT`.

## Padrões de modelagem que fazem as visões funcionarem

```
produto ─aggregation→ business service ←realization─ business process ←serving─ application service
                                                           ↑assignment                 ↑realization
                                                        ator/papel            container / componente (C4)
                                                                                         ↑serving
                                                              technology service / system software / node
```

- Uma oferta (**product**) agrega serviços de negócio e contratos.
- Processos **realizam** serviços de negócio. Atores e papéis são **atribuídos** a processos.
- Containers/componentes C4 **realizam** application services, que **servem** processos.
- A tecnologia **serve** containers (system-software, technology-service) ou os **realiza** (artifact).
  Nós são **atribuídos** a artifacts ou **realizam** technology services.
- Dados de aplicação (data-object) **realizam** objetos de negócio. Containers/componentes os **acessam**.
- **Banco de dados** é `application-component` (C4 container com tag `database`), não `data-object`: ele pode servir e
  ser servido. O SGBD o **serve** (`serving`); o conteúdo, quando conhecido, é `data-object` com `parent` no banco.

### Intermediários

Serviços, interfaces e funções de aplicação ligam o componente ao resto do modelo, e o C4 os atravessa
(`references/c4.md`, "C4 a partir de ArchiMate"):

- o componente **realiza** o `application-service` (`realization`);
- o componente **compõe** a `application-interface` (`composition`);
- o componente é **atribuído** (`assignment`) à `application-function` ou ao `application-process`.

Quem consome o serviço (`serving`) passa a aparecer, no C4, ligado ao componente (seta tracejada, "via").

## Aninhamento

`"nesting"` na view spec escolhe como pai e filho aparecem (padrão `"edges"`: losango de composição, como sempre):

- `"nested"`: os filhos são desenhados **dentro** da caixa do pai. Aninham o `parent` e as relações explícitas
  `composition` e `aggregation` entre elementos visíveis (o todo contém a parte). Cada elemento tem um pai visual só:
  o `parent` tem prioridade; sem ele, vale a primeira `composition`/`aggregation` na ordem do modelo (as outras
  seguem como setas).
- `{ "mode": "nested", "depth": N }`: aninha só até o nível N a partir do topo. Um elemento mais fundo que N fica na
  caixa do ancestral aninhado mais próximo, ao lado do pai e ligado a ele pelo losango.
- No modo aninhado, a composição implícita e a relação que originou o aninhamento não viram seta (a descrição vai
  para o tooltip do filho). O pai é desenhado como caixa grande sob as setas.
- Vale para os estilos `flow` e `bands-flow`; com aninhamento, `bands` cai para `bands-flow`. Em faixas, um filho de
  outra camada fica dentro do pai, na faixa do pai.
- Caixas aninhadas ocupam espaço: em diagramas grandes use `depth` ou `focus`/`granularity`.
