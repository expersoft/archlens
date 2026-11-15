# P07 — Hardening da GUI e modelo de ameaças

**Trilha:** Servidor de time · **Tamanho:** M · **Depende de:** P01 · **Desbloqueia:** P08, P13

## Objetivo

Fechar as superfícies de ataque que não dependem de login, e deixar escrito o modelo de ameaças do archlens.

## Evidência

- **Diagrama na origem do host.** `apps/gui/web/src/Diagram.tsx:127`:
  `<iframe srcDoc={view.html} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals">`. Um `srcDoc`
  com `allow-scripts` e `allow-same-origin` roda na mesma origem da GUI e pode chamar a API com a sessão do usuário.
  O comentário na linha 44 confirma a dependência ("mesma origem do srcDoc", para ler o tema do `localStorage`).
- O HTML do diagrama é gerado em `scripts/lib/render.mjs` a partir de nomes e descrições da base, com escape manual
  (`esc`, `escH`) e `innerHTML` no cliente (linhas ~845, 850, 952, 981, 1053). A base pode vir de um repositório git
  ou de um gbrain que outra pessoa escreve. Não foi encontrada falha de escape; o risco é a ausência de segunda barreira.
- `postMessage(..., '*')` nos dois sentidos (`apps/gui/web/src/bridge.ts:42`, `render.mjs:675`).
- Cabeçalhos: só `x-frame-options` e `content-security-policy: frame-ancestors 'self'`. Sem `script-src`, sem
  `nosniff`, sem `referrer-policy`.
- **SSRF pelo clone.** `apps/gui/server/plan/repo.mjs` (`checkRepo`) aceita qualquer host https ou ssh; redirects estão
  desligados e o token só vai a `gitTokenHosts`, mas o servidor ainda alcança endereços internos.
- **Injeção de prompt.** O agente de planejamento lê arquivos de repositórios e notas da base e tem ferramentas que
  montam o delta. Os prompts tratam isso como "conteúdo externo"; não há teste adversarial.
- Já bem resolvido (não regredir): guarda de DNS rebinding, checagem de origem em POST, ambiente filtrado e
  `GIT_ASKPASS` para o git, `SECRET_FILES`, remoção de credenciais antes do LLM, `markdown-it` com `html: false`.

## Escopo

1. **Isolar o diagrama.** Tirar `allow-same-origin` (o tema passa pela ponte em vez do `localStorage`) ou servir o
   diagrama de uma origem separada. Confirmar que exportação SVG/PNG e tela cheia continuam funcionando.
2. **Ponte com origem conferida** e mensagens validadas por forma nos dois lados.
3. **CSP completa** para o host e, dentro do documento do diagrama, uma CSP que só permite o script embutido (hash ou
   nonce) e proíbe rede.
4. **Testes de escape:** uma base de teste com cargas de XSS em todo campo de texto (nome, descrição, rótulo de
   relação, propriedades, título de visão, notas), verificada no navegador para o HTML autônomo e para a GUI.
5. **Clone:** lista de hosts permitidos, bloqueio de endereços privados e de link-local depois da resolução de nome.
6. **Injeção de prompt:** casos adversariais em `apps/gui/eval/` (arquivo de repositório que manda apagar elementos,
   por exemplo); garantir que nada é gravado sem a confirmação explícita do usuário.
7. **Cabeçalhos** (`nosniff`, `referrer-policy`, `permissions-policy`) e revisão do log de erros (sem caminhos da
   máquina nem segredos).
8. **`SECURITY.md` e modelo de ameaças** em `docs/`: ativos, atores, fronteiras de confiança (base, repositório lido,
   LLM, navegador), o que cada modo de uso assume.

## Fora do escopo

Login e papéis (P06). TLS (fica no proxy; documentado em P08).

## Critérios de aceite

- Um script injetado no documento do diagrama não consegue ler `document.cookie` do host nem chamar `/api` com a
  sessão do usuário. Há teste e2e que prova isso.
- A base de cargas de XSS não executa nada, em nenhuma visão, no HTML autônomo nem na GUI.
- Clonar `https://169.254.169.254/…`, `https://localhost/…` ou um nome que resolve para rede privada é recusado.
- O HTML gerado por `build` continua abrindo direto do disco (`file://`) com todas as funções.

## Decisões a fechar no brainstorm

- Origem opaca (sandbox sem `allow-same-origin`) ou origem separada para o diagrama; efeito no tema, no download e no
  modo apresentação.
- Lista de hosts de clone: obrigatória no modo servidor, ou só bloqueio de rede privada por padrão.
- Se o HTML autônomo também ganha CSP via `<meta>`.

## Obrigações do repositório

Mexe em `render.mjs` e na ponte `embed`: avaliar impacto na GUI, rodar `npm run gui:test` e o e2e. archlens-ask: sem
impacto esperado.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` e `P07-hardening-da-gui.md`. Comece escrevendo o teste e2e que
> mostra o problema: um script dentro do iframe do diagrama alcançando a API do host. Depois conduza o brainstorm das
> decisões abertas. Use também a skill `security-review` sobre o diff final.
