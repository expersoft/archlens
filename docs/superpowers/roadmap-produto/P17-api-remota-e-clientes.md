# P17 — API remota: servidor central, CLI e GUI como clientes

**Linha:** v1 · **Tamanho:** G · **Depende de:** P02 (fronteira do núcleo), P04 (contrato assíncrono), P06 (identidade) · **Desbloqueia:** P08, P13, P16, P18 · **Requisito:** R4

## Objetivo

O conector principal é acessado num ponto só. CLI, GUI e app desktop falam com um servidor archlens pela rede, cada
pessoa com a própria identidade, sem que ninguém precise de credencial do banco, do repositório ou do gbrain. O
tempo de resposta não piora de forma perceptível em relação ao uso local.

## Evidência

- **A CLI é só local.** Todo comando de base passa por `openBase` → `openStore(resolveBase(...))` em
  `scripts/archlens.mjs`; o comando `remote` trata apenas do espelho do gbrain em modo MCP.
- **A API HTTP atual é interna da GUI** (`apps/gui/server/app.mjs`, `plan/routes.mjs`): caminhos sem versão
  (`/api/bases/...`), sem identidade, respostas moldadas pelas telas, erros como `{ error, code }`. O rascunho de
  plano viaja inteiro no corpo de cada chamada de `/plan*`.
- O servidor já tem o que uma API de consulta precisa: o modelo normalizado em memória por base, recarregado quando a
  versão muda (`bases.mjs`), e um cache LRU de visões por versão e spec (`views.mjs`).
- As skills chamam a CLI (`"$ARCHLENS/bin/archlens"`); se a CLI falar com o servidor, as skills passam a funcionar
  remotamente sem mudar.
- Custos conhecidos do modo local: cada comando da CLI lê e normaliza a base inteira; `deliver` e `build` precisam de
  Chromium na máquina.
- Medição de outubro: numa consulta pela skill, a CLI responde por ~3,7 s de ~30 s; o resto é o modelo.

## Avaliação: é preciso uma API nova?

**Sim.** Duas camadas, com papéis diferentes:

| Camada | O que expõe | Quem usa | Prós | Contras |
|---|---|---|---|---|
| **API de caso de uso** (`/api/v1`) | buscar, resolver e desenhar visão, cartão e documentação do elemento, planejar, responder itens, aplicar, histórico, propostas | GUI, desktop, consultas da CLI, integrações | usa o modelo em memória e o cache; autorização fina; pouca transferência | cada comando da CLI precisa de um caminho remoto |
| **Conector remoto** (`store.kind: "remote"`) | o contrato do store por HTTP: retrato com versão, subgrafo, versões por objeto, `apply` de operações, histórico | `plan`, `apply`, `build`, `check` da CLI sem reescrita | reaproveita todo o núcleo no cliente | entrega a base inteira a quem pode ler; autorização só por base |

Recomendação: a API de caso de uso é o produto; o conector remoto é o atalho de compatibilidade para a CLI e pode ser
restrito a quem tem capacidade de planejar.

## Escopo

1. **API v1 versionada e documentada** (OpenAPI gerado dos tipos do P02), com erros `E_*` estáveis, paginação e
   idempotência nas escritas. A GUI migra para ela; a API antiga sai.
2. **Organização no caminho** desde já (`/api/v1/orgs/{org}/bases/{base}/...`), com uma organização padrão. Prepara o
   P18 sem custo agora.
3. **Conector remoto** no núcleo, passando no teste de contrato do P04.
4. **CLI com destino remoto:** `archlens login <url>`, perfis de servidor, e os comandos de base aceitando uma base
   remota. Consultas (`views`, `resolve`, `query`, `find`) pela API de caso de uso; `plan`/`apply` pelo conector
   remoto ou por rotas próprias.
5. **Identidade para clientes que não são navegador** (com P06): fluxo de código de dispositivo ou PKCE com retorno
   em `localhost`, e tokens pessoais com escopo e validade para automação e CI.
6. **Onde os diagramas são gerados:** o servidor desenha e confere (ele tem o Chromium); o cliente recebe HTML, SVG
   ou PNG. `build` remoto roda no servidor.
7. **Performance** (ver seção abaixo).
8. **Compatibilidade de versões:** o cliente informa sua versão; o servidor recusa com mensagem clara o que não
   suporta.
9. **Modo local intacto:** sem servidor configurado, tudo funciona como hoje.

## Performance

Requisito do dono: sem impacto significativo no tempo de resposta. Nada abaixo foi medido; são hipóteses e metas a
confirmar com os benchmarks do P05.

- **Hipótese:** consultas remotas ficam iguais ou mais rápidas que as locais, porque o servidor não relê nem
  normaliza a base a cada comando e tem cache de visões. O custo novo é rede e autenticação.
- **Mitigações obrigatórias:** GET condicional por versão (`ETag`/`If-None-Match`) e cópia local do retrato em
  `.archlens/` para o conector remoto; compressão; conexão persistente; leitura por subgrafo em vez da base inteira;
  respostas em fluxo para operações longas (plano com LLM, `build`); validação do token sem ida ao IdP a cada
  requisição.
- **Metas propostas:** sobrecarga p95 ≤ 100 ms por comando em rede local e ≤ 300 ms com 50 ms de latência de rede,
  para a base de referência de 2 000 elementos; nenhuma etapa interativa da GUI mais lenta que hoje.
- **Risco a medir:** `plan` pelo conector remoto transfere o retrato inteiro; com base grande isso domina o tempo, e
  é o argumento para rotas de plano no servidor.

## Fora do escopo

Multi-tenant de verdade (P18). Réplicas (P16). GraphQL ou gRPC.

## Critérios de aceite

- Numa máquina sem acesso ao banco nem ao repositório da base, a CLI autenticada consulta, planeja e aplica.
- As três skills funcionam contra uma base remota sem alteração no texto das skills além da instrução de `login`.
- Um usuário sem capacidade de aplicar recebe 403 pela CLI, pela GUI e por chamada direta.
- Os benchmarks do P05 rodam em modo local e remoto e as metas acima são atendidas, ou a diferença está explicada e
  aceita pelo dono.
- A GUI não usa nenhuma rota fora de `/api/v1`.
- Sem servidor configurado, `npm test` passa sem mudança de comportamento.

## Decisões a fechar no brainstorm

- Se a CLI remota cobre todos os comandos ou só consulta, plano e aplicação (por exemplo `scan`, `migrate`,
  `store convert` continuam locais ou administrativos).
- Onde roda o LLM do planejamento remoto: no servidor (chave central, cota por usuário) ou no cliente (a skill usa o
  modelo da sessão). Para as skills do Claude Code, o modelo é o da sessão e o servidor só resolve e grava.
- Expor também um **servidor MCP** do archlens sobre a API v1, para assistentes sem execução de código. Isso
  competiria com o archlens-ask sobre o gbrain ou o substituiria; decidir o papel de cada um.
- O conector remoto entrega a base inteira: aceitar, ou limitar a quem pode planejar.
- Onde mora o servidor no repositório, já que deixa de ser "o servidor da GUI".

## Obrigações do repositório

Mudança grande em `store/`, na CLI e no servidor: `npm run gui:test`, e2e, `check-ask`. As skills mudam (instrução de
login e de base remota): `npm --prefix apps/gui run prompt` e avaliar o `INSTRUCTIONS.md` do archlens-ask.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 2.6, R4), `P17-api-remota-e-clientes.md`, os specs
> aprovados de P02, P04 e P06, e as rotas em `apps/gui/server/app.mjs` e `plan/routes.mjs`. Antes do brainstorm, meça
> com os benchmarks do P05 o tempo local de `resolve`, `query` e `plan` na base de referência, para ter a linha de
> base das metas. Divida em ciclos: (1) API v1 e migração da GUI, (2) conector remoto e `login`, (3) comandos remotos
> da CLI e skills.
