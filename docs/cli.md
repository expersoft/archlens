# Referência da CLI

<!-- Gerado por `npm run cli-doc` a partir de `archlens --help`. Não edite: mude o texto de ajuda em scripts/archlens.mjs. -->

O texto abaixo é o que `archlens --help` imprime. Guia de uso: [GUIA.md](GUIA.md).

```text
archlens — arquitetura como modelo, diagramas como consultas

Uso: archlens <comando> [base] [opções]

Base: a pasta architecture/ (fonte da verdade), o ARCHITECTURE.md gerado (aponta para ela) ou nada (procura a
partir do diretório atual). Bases 1.x (pasta, .md com bloco archlens-json ou modelo .json) são recusadas
(E_STORE_FORMAT): "archlens migrate <base>" converte para o formato 2.0.

Planejar (nunca grava a base)
  plan      <base> <delta.json> --out p.json  compara o delta com a base e grava o plano (aberto: com perguntas; final: pronto)
            [--answers antigo.json]         reaproveita as respostas de um plano anterior (sem delta, usa o delta dele)
  show      <base> p.json [--out f.md] [--json]   relatório do plano (aberto ou final): decisões, mudanças, relações e visões
  scan      <pasta|url> [--base b] [--out inv.json] [--json]   lê um repositório: inventário e papel sugerido
            <pasta|url> --as system|service [--system id] [--id id] --delta d.json [--from inv.json]   monta o delta

Aplicar (grava a base)
  init      <pasta> --store json|markdown|gbrain [--name N]   cria a base (archlens.json) com o repositório escolhido
            gbrain --mode git --repo R [--remote origin] [--branch main] [--prefix archlens]   R: clone do repositório do gbrain
            gbrain --mode mcp --server S [--source-id ID] [--prefix archlens]   S: nome do MCP configurado no Claude Code
  apply     <base> p.json                    grava um plano final (se a base mudou, refaça o plano com --answers) e registra o histórico
            base gbrain no modo mcp: grava o pedido de releitura; com --read-check resposta.json, o pedido de gravação
            <base> --receipts resposta.json…   confere os recibos do gbrain e atualiza o espelho
            <base> --resume [id] | --undo [id]   pede o que falta gravar, ou devolve as páginas ao que eram (.archlens/applies/)
  doc       <base> [--out f.md]            regenera o ARCHITECTURE.md (gerado; edite architecture/notes/*.md)
  build     <base> [--out-dir DIR]           ARCHITECTURE.md + HTML (padrão: architecture/diagrams/)
  migrate   <base 1.x> [--to DIR]           converte uma base 1.x (pasta, .md ou .json) para o formato 2.0
  remote    <base> pull [--out pedido.json]   base gbrain no modo mcp: grava o pedido de chamadas ao MCP (o agente executa)
            <base> pull --ingest resposta.json… [--out pedido.json]   lê as respostas; grava o próximo pedido ou atualiza o espelho local
            <base> check [--out pedido.json] | check --ingest resposta.json   confere a sessão do MCP (whoami) e se gravar está liberado
            <base local> check --server S [--prefix P] [--out pedido.json]   idem numa base local que vai para o gbrain (store convert --mode mcp)
  store convert <base> --to markdown|json [--force]   grava a base em outro conector (mesma pasta; versão inalterada)
            <base> --to gbrain --mode git --repo R [--remote origin] [--branch main] [--prefix archlens]   leva a base para o gbrain (e de volta com --to json|markdown)
            <base> --to gbrain --mode mcp --server S [--source-id ID] [--prefix archlens]   idem pelo MCP: grava o pedido; o agente cria as páginas; conclui com apply --receipts

Consultar (nunca grava a base)
  views     <base>                           lista as visões definidas e sugere novas
  query     <base> --view k | --spec J [--format md|json] [--out f]   responde em markdown (padrão) ou JSON: elementos por camada/nível, relações, matriz de impacto
  query     <base> --element id [--depth N] [--via t1,t2] [--format md|json]   cartão do elemento: pai, filhos, relações, fontes, rodadas; --depth N inclui "Em volta"
  query     <base> --element id --doc [--out f]   documentação do nó como está na página, para editar (só markdown e gbrain)
  resolve   <base> --view k | --spec J       imprime o view IR (nós/arestas) de uma visão
  render    <base> --out f.html [seleção]    gera o HTML animado
  deliver   <base> --out f.html [seleção]    render + screenshots 1920×1080/1280×720 + checagens
  validate  <base>                         valida schema, referências, hierarquia C4 e regras ArchiMate
  check     [base] [--json]               valida e confere se o ARCHITECTURE.md está em dia (CI / pre-commit)
  extract   <base> [--out m.json]          imprime o modelo canônico em JSON
  serve     <base> [--port N] [--host H] [--open] [--llm anthropic|openai [--model M] [--endpoint URL] [--env-file PATH] [--plan]]
            abre a GUI (navegador) sobre a base; padrão 127.0.0.1:5180; --llm liga a busca em texto (chave no ambiente ou .env); --plan liga o modo Planejar (exige --llm)
            --config archlens-gui.json [--port N] [--host H] [--open]   a GUI sobre várias bases

Atalhos
  merge     <base> <delta.json> --plan p.json  o mesmo que "plan"
  merge     <base> --apply p.json               fecha o plano respondido e o grava (o mesmo que responder e "apply")

Seleção de visões (render/deliver)
  --view k1,k2        visões do modelo pelo key (padrão: todas as definidas)
  --spec J            JSON inline, arquivo .json, ou lista, com view specs ad hoc
  --suggested         inclui as visões sugeridas por "views"

Prévia de um delta ainda não mergeado (render/deliver/build/resolve/views; nunca grava o ARCHITECTURE.md)
  --delta D           a base com o delta D aplicado (decisões pendentes no padrão do plano)
  --plan P            idem, a partir de um plano (usa as respostas já dadas)

Opções
  --json              saída em JSON (validate, views, resolve, plan, merge --plan)
  --answers P         plan, merge --plan: pré-preenche as respostas do plano P (gere de novo após responder "same")
  --title T           título da página
  --shots DIR         pasta dos screenshots (deliver; padrão: <out>.shots/)
  --strict            deliver: não substitui a saída se alguma checagem falhar
  --open              abre o HTML no navegador ao final
```
