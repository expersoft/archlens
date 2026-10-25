# archlens-ask

Um agente de **consulta** à base de arquitetura do archlens guardada num **gbrain**, para assistentes que acessam o
gbrain via MCP e mostram markdown e Mermaid, mas **não executam código**: Microsoft 365 Copilot, Claude Desktop e
afins.

Ele responde perguntas como "que sistemas sustentam o processo de checkout?", "o que é impactado se a API de Pedidos
cair?" ou "quem consome o barramento de eventos?". A resposta sai em markdown, em diagramas Mermaid (ArchiMate em
`flowchart` com as cores do archlens; C4 na sintaxe C4 do Mermaid) ou nos dois, com a mesma seleção de elementos e
relações da skill `archlens-query`.

**Somente leitura.** Para mudar a base, use o archlens completo (Claude Code ou harness compatível, skill
`archlens-plan`).

## Arquivos

| Arquivo | Uso no agente | Origem |
|---|---|---|
| `INSTRUCTIONS.md` | instruções do agente (≤ 8000 caracteres) | escrito à mão |
| `RULES.md` | conhecimento anexado: pedido → recorte, travessia, derivação, C4, saída, modelos Mermaid | escrito à mão |
| `REFERENCE.md` | conhecimento anexado: tipos, relações, direção de suporte, cores, páginas no gbrain | **gerado** (`npm run ask`) |
| `EXAMPLES.md` | conhecimento anexado: quatro perguntas resolvidas | escrito à mão |
| `eval/` | perguntas de validação e gabarito da CLI | `perguntas.json` à mão; `gabarito/` gerado |

## Pré-requisito: o gbrain com a base

A base precisa estar num gbrain (conector `gbrain` do archlens; ver `references/base.md` no repositório), e o MCP desse
gbrain precisa estar acessível ao assistente.

**Recomendado: ligações tipadas.** Com a base no **modo git** ou com `gbrain sweep` rodado no servidor, o grafo do
gbrain conhece os tipos ArchiMate, a hierarquia (`part_of`) e os grupos (`member_of`). Sem isso (base gravada pelo MCP
remoto sem `sweep`), o agente ainda consulta, mas avisa que hierarquia e grupos podem sair incompletos e pede licença
antes de ler muitas páginas.

## Instalar no Microsoft 365 Copilot

1. Exponha o MCP do gbrain pela rede (`gbrain serve --http`, com OAuth) num endereço que o seu tenant alcança.
2. No Copilot Studio (ou num agente declarativo), crie um agente e acrescente o servidor MCP do gbrain como
   ferramenta. Libere só as de leitura: `get_page`, `list_pages`, `get_backlinks`, `traverse_graph`, `resolve_slugs`,
   `search`.
3. Cole `INSTRUCTIONS.md` nas instruções do agente.
4. Acrescente `RULES.md`, `REFERENCE.md` e `EXAMPLES.md` como conhecimento (arquivos enviados ou uma pasta do
   SharePoint/OneDrive).
5. Teste com as perguntas de `eval/perguntas.json`.

## Instalar no Claude Desktop

1. Configure o MCP do gbrain no `claude_desktop_config.json`. Para a base de exemplo local
   (`examples/loja-online-gbrain`, montada com `node examples/loja-online-gbrain/setup.mjs`):

   ```json
   {
     "mcpServers": {
       "gbrain-arquitetura": {
         "command": "node",
         "args": ["<caminho do repositório>/examples/loja-online-gbrain/setup.mjs", "gbrain", "serve"]
       }
     }
   }
   ```

   Para um gbrain do time, use o comando ou a URL que ele fornece.
2. Crie um projeto, cole `INSTRUCTIONS.md` nas instruções do projeto e acrescente `RULES.md`, `REFERENCE.md` e
   `EXAMPLES.md` ao conhecimento do projeto.
3. Se o Claude Desktop oferecer execução de código, o agente não precisa dela.

## Outros assistentes (Gemini Gems, agentes com MCP)

O mesmo pacote serve: `INSTRUCTIONS.md` como instruções e os outros três como anexos. Se o assistente aceitar um texto
só, concatene `INSTRUCTIONS.md`, `RULES.md` e `REFERENCE.md`, nessa ordem.

## Limites conhecidos

- **Tamanho:** `INSTRUCTIONS.md` cabe nos 8000 caracteres de instruções do M365 Copilot. O resto vai como
  conhecimento, que o assistente consulta por busca: se ele "esquecer" uma regra, cite o arquivo na pergunta.
- **C4 no Mermaid** é marcado como experimental: o layout não é controlável além de `UpdateLayoutConfig` e
  `UpdateRelStyle`. Os modelos foram conferidos no Mermaid 11.4.1. Anote aqui o que não renderizar em cada assistente.
- **Sem o desenho do archlens:** o layout calculado (ELK), o HTML animado e as checagens de legibilidade são do
  archlens completo.
- **Travessia feita pelo modelo:** em bases grandes, o agente pode parar cedo ou errar uma direção. A resposta sempre
  traz o recorte usado e o que ficou de fora.

## Validação

Faça as perguntas de `eval/perguntas.json` ao agente, sobre a base `loja-online` no gbrain, e compare com
`eval/gabarito/<id>.json` (a resposta da `archlens query --format json` para o mesmo recorte):

- **elementos** e **relações diretas** (tipo e direção): iguais ao gabarito;
- **relações derivadas:** mesmas pontas; o tipo pode diferir quando houver caminhos mais curtos empatados;
- perguntas com `esperado` (`ambiguo`, `grande`, `duas-bases`): o comportamento descrito;
- perguntas com `base` (`as-is-registro`, `to-be-registro`, sobre `examples/telemedicina`): carregue essa base num
  gbrain (`archlens store convert … --to gbrain`) para validá-las; elas conferem que o filtro de status vem antes da
  travessia;
- no gabarito, cada relação traz `derived` (e `via`, quando derivada): só as derivadas podem diferir no tipo;
- uma rodada **sem ligações tipadas** (base gravada pelo MCP sem `sweep`): o aviso de hierarquia e grupos
  incompletos aparece;
- `duas-bases`: com dois prefixos `archlens` no mesmo gbrain, o agente pergunta qual base usar.

O resultado não bloqueia mudanças no archlens; ele fica registrado aqui.

| Plataforma | Data | Acertos | Divergências |
|---|---|---|---|
| Ensaio (Claude Code via `gbrain call`, base da demonstração, ligações tipadas) | 2026-10-25 | `suporte-processo`, `impacto-container`, `consumidores-evento`, `grande`: mesmos elementos e relações do gabarito (25/26, 32/41, 3/2, 29/43); `cartao` igual; `ambiguo` listou 8 candidatos e perguntou | nenhuma no conteúdo. O ensaio apontou lacunas de instrução (status ausente, hierarquia nos dois modos, parâmetro de `resolve_slugs`, tags e backlinks tipados do gbrain), já corrigidas |
| Reensaio após a revisão final ([`eval/ensaio-2026-10-25.md`](eval/ensaio-2026-10-25.md)) | 2026-10-25 | as mesmas seis perguntas: elementos e relações iguais ao gabarito (inclusive as derivadas); `ambiguo` perguntou | nenhuma no conteúdo; lacunas de instrução listadas no arquivo |
| M365 Copilot | — | — | — |
| Claude Desktop | — | — | — |

Custo observado no ensaio: ~70 chamadas ao gbrain para uma travessia de 25 elementos (`suporte-processo`) e poucas
chamadas para cartão, foco C4 e ambiguidade.

## Manutenção

O archlens-ask é **derivado** do archlens completo e muda junto com ele. Toda evolução ou correção do archlens inclui,
no mesmo PR:

1. avaliar se a mudança toca o que o archlens-ask copia: tipos, relações, travessia e derivação, specs de visão, níveis
   C4, viewpoints, páginas no gbrain, formato do `query --format md`, cores;
2. se tocar: `npm run ask` (regenera `REFERENCE.md` e o gabarito), atualizar `INSTRUCTIONS.md`, `RULES.md` e
   `EXAMPLES.md` à mão e, se mudar uma pergunta, `eval/perguntas.json`;
3. `npm run check-ask` antes de concluir (avisa sem travar: fica fora do `npm test`);
4. se não tocar: escrever "archlens-ask: sem impacto" na descrição do PR.

Sentido único: as três skills, a CLI e os formatos do archlens nunca mudam para acomodar o archlens-ask.
