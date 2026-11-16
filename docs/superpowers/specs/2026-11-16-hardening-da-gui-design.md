# Hardening da GUI e modelo de ameaças (P07)

Brief: [`roadmap-produto/P07-hardening-da-gui.md`](../roadmap-produto/P07-hardening-da-gui.md). Linha **v0** (`develop-v2`); a v1 herda.

## Intenção

Fechar as superfícies de ataque da GUI que não dependem de login, para quem já usa a 0.x num servidor de time, e
deixar escrito o que o archlens assume sobre cada fonte de conteúdo. O conteúdo da base, dos repositórios lidos e do
LLM é escrito por terceiros; hoje a única barreira entre esse conteúdo e o navegador ou a rede do servidor é o escape
manual em `render.mjs` e a checagem de forma da URL de clone. Este ciclo acrescenta a **segunda barreira** em cada
ponto.

**Objetivos.** Um script que rode no documento do diagrama não alcança o host. Um texto da base que escape do
`esc`/`escH` não executa. O servidor não clona de rede interna. Conteúdo lido não grava nada sem a confirmação de quem
usa. Existe um `SECURITY.md` e um modelo de ameaças.

**Não objetivos.** Login, papéis e auditoria (P06). TLS (fica no proxy; P08). Novas funções.

**O que seria fracasso mesmo funcionando.** Perder qualquer uso que existe hoje (tema, exportar, apresentar, atalhos,
HTML aberto direto do disco). Quebrar quem atualiza a 0.x sem mexer na configuração. Uma CSP que mascara falhas de
escape em vez de revelá-las nos testes.

## Ponto de partida

Já em `develop-v2`:

- `376be8d`: `apps/gui/e2e/isolation.test.mjs` prova o problema. Um script no iframe lia `parent.document`, o
  `localStorage` do host, `GET /api/info` e fazia POST na API.
- `706e8d0`: decisão 1 abaixo, implementada e testada (e2e da GUI: 44 passam; suíte da raiz e da GUI verdes; HTML
  autônomo conferido em `file://`).

Fatos do código que o desenho usa:

- O script do diagrama é uma constante (`JS` em `scripts/lib/render.mjs`), igual em todo HTML gerado por uma versão.
  Os dados vão em blocos `<script type="application/json">`, que não executam.
- `render.mjs` não tem manipulador de evento em atributo (`on*=`), nem `eval`, nem recurso externo. Tem `<style>`
  embutido e atributos `style=`.
- O `index.html` da GUI (Vite) só carrega `/assets/*.js` e `/assets/*.css`; quatro componentes usam `style={{…}}`.
- Um iframe `srcdoc` herda a CSP da página que o embute: a CSP do host vale também para o script do diagrama.
- O servidor já recusa POST com `Origin` diferente do `Host` (`checkPostOrigin`); a origem `null` do iframe cai aí.
- O clone passa por `checkRepo` (`apps/gui/server/plan/repo.mjs`), chamado na rota de anexar e na ferramenta do agente.

## Abordagens

**Isolamento do diagrama.**

| Abordagem | Troca |
|---|---|
| **Origem opaca** (sandbox sem `allow-same-origin`) — **escolhida** | Nenhuma mudança de implantação; vale igual para uso local, servidor e desktop. O que dependia da origem (tema, atalhos) passa pela ponte |
| Origem separada (outro host ou porta) | Mesmo isolamento e `localStorage` próprio, mas toda instalação precisa de dois endereços (DNS, proxy, TLS) |
| Manter a origem e confiar só na CSP | Sem mudança de comportamento, mas uma falha na CSP devolve o acesso total ao host |

Escolha do dono (2026-11-16): origem opaca, com a condição de nenhuma usabilidade ser perdida.

**Clone.** Bloqueio de rede privada sempre, mais lista de hosts opcional que também libera Git interno (escolha do
dono). Descartada a lista obrigatória: quebraria quem atualiza sem configurar.

**CSP no HTML autônomo.** Incluída via `<meta>` (escolha do dono). Descartado deixar só na GUI: o arquivo circula por
e-mail e wiki sem a segunda barreira.

## Decisões

1. **Diagrama sem origem (feito).** `sandbox="allow-scripts allow-downloads allow-modals"`. O host marca
   `data-theme` no `<html>` do `srcdoc` (`withTheme`), então o diagrama nasce no tema certo; a troca segue por
   mensagem, sem recarregar. Atalhos da GUI (Ctrl/Meta+B, Ctrl/Meta+K) e Escape com o foco no diagrama chegam pela
   mensagem `key`. O HTML autônomo segue usando o `localStorage` dele.
2. **Menor privilégio no sandbox.** Tirar `allow-modals`: o cliente do diagrama não chama `alert`, `confirm` nem
   `prompt`. *(decisão minha)*
3. **Ponte conferida nos dois lados.**
   - Host (`parseMessage`): além de `ev.source === frame.contentWindow`, exige `ev.origin === 'null'` (a origem do
     iframe isolado). Campos de texto com limite de tamanho (`id` até 500 caracteres); números finitos.
   - Diagrama: mantém `ev.source === window.parent`; valida a forma de cada mensagem (já faz para `act`, `theme` e
     `select`).
   - O alvo `'*'` do `postMessage` **fica**, e isto vai explicado no código e no modelo de ameaças: um documento sem
     origem não é endereçável por origem (host → diagrama), e o diagrama não conhece a origem de quem o embute
     (diagrama → host). A garantia vem de três coisas: a conferência de `source`, o cabeçalho
     `frame-ancestors 'self'` (só a GUI embute a GUI) e o fato de as mensagens só levarem ids, tema, teclas e
     estado da barra. *(decisão minha; o brief pedia "origem conferida")*
4. **CSP do host**, em toda resposta do servidor da GUI:
   `default-src 'self'; script-src 'self' 'sha256-<script do diagrama>'; style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
   frame-ancestors 'self'`.
   O hash é calculado uma vez na subida, a partir do script que `render.mjs` exporta. `'unsafe-inline'` em estilo é
   aceito: o SVG e o React usam `style=`; estilo não executa código. As respostas da API (JSON, NDJSON) e a do logo
   mantêm políticas mais estreitas onde já têm.
5. **CSP do documento do diagrama**, por `<meta http-equiv>` logo após o `charset`, no HTML embutido e no autônomo:
   `default-src 'none'; script-src 'sha256-<script>'; style-src 'unsafe-inline'; img-src data: blob:;
   base-uri 'none'; form-action 'none'`. Sem `connect-src`: o documento não fala com a rede. `render.mjs` exporta o
   hash (`CLIENT_SCRIPT_HASH`) para o servidor não recalcular de outro jeito. O HTML continua abrindo em `file://`
   com todas as funções; o roteiro de conferência do ponto de partida vira teste.
6. **Base de cargas de XSS.** Fixture em `tests/fixtures/xss/` com cargas em todo campo de texto: nome, descrição,
   tecnologia, rótulo e tecnologia de relação, chaves e valores de propriedades, tags, motivo de status, título e
   descrição de visão, nome de agrupamento, notas e documentação do nó (markdown com HTML cru, `javascript:` em
   link, `<img onerror>`), e ids com aspas. Verificação no Chromium, para o HTML autônomo e para a GUI, em todas as
   visões e com cartão, gaveta, aba Documentação, matriz e glossário abertos:
   - nenhuma carga executa (um marcador global que toda carga tentaria escrever continua ausente);
   - **nenhum evento `securitypolicyviolation`**: uma violação significa que o escape falhou e só a CSP segurou, e
     isso reprova o teste. Assim a CSP não mascara regressão de escape;
   - o DOM não ganha `script` além dos conhecidos nem elemento com atributo `on*`.
   Falha de escape encontrada é corrigida neste ciclo.
7. **Clone sem rede interna.**
   - Antes de clonar (https e ssh), o servidor resolve o host e recusa se **qualquer** endereço for loopback,
     privado, link-local, CGNAT, não especificado ou os equivalentes IPv6 (incluindo IPv4 mapeado). Literais de IP
     passam pela mesma regra (`node:net` `BlockList`). Mensagem: "host de rede interna não é permitido; peça ao
     administrador para incluí-lo em plan.gitHosts".
   - Nova opção `plan.gitHosts` (lista de nomes de host, mesmo formato de `gitTokenHosts`). Ausente: vale só o
     bloqueio. Presente: só esses hosts são clonados, **e um host listado é liberado mesmo em rede interna** (Git
     local declarado pelo administrador). Com `gitHosts` definido, `gitTokenHosts` tem de estar contido nele (erro
     de configuração se não).
   - Vale em qualquer modo, inclusive com a GUI ligada só em `127.0.0.1`. *(decisão minha: uma regra só; quem clona
     de `localhost` no uso local declara o host)*
   - `file://` não muda (já exige `allowFileUrls`).
   - **Limite conhecido:** o git resolve o nome de novo ao conectar; um DNS hostil pode responder diferente. O
     bloqueio reduz o risco e a lista o fecha. Vai escrito no modelo de ameaças.
8. **Injeção de prompt.**
   - Garantia estrutural, com teste no CI: nenhuma ferramenta do agente de planejamento grava a base; gravar exige
     a rota de aplicar, chamada pela ação de quem usa. O teste enumera as ferramentas e falha se alguma alcançar o
     store em escrita.
   - Casos adversariais em `apps/gui/eval/plan-injection.json`, no molde de `plan-limits.json`: arquivo de
     repositório, nota da base e documentação de nó que mandam apagar elementos, trocar descrições, clonar outra
     URL ou revelar o prompt. Aprovado quando o delta só contém o que a pessoa pediu. Rodam com `--dry`
     (roteirizado) no CI e com LLM real à mão, como o P01 decidiu para a avaliação com LLM.
   - Os mesmos casos servem ao servidor MCP (P17) quando existir.
9. **Cabeçalhos e erros.** Em toda resposta: `x-content-type-options: nosniff`, `referrer-policy: no-referrer`,
   `permissions-policy` negando câmera, microfone, geolocalização, pagamento e USB, `cross-origin-opener-policy:
   same-origin`. Tela cheia **não** entra na política: o documento do diagrama não tem origem e uma lista por origem
   tiraria dele o modo apresentação. Revisão das respostas de erro: nenhuma leva caminho
   absoluto da máquina, saída crua do git nem segredo; erro inesperado responde texto genérico e o detalhe fica no
   log do servidor, que passa pelo `scrub` existente.
10. **`SECURITY.md` e `docs/modelo-de-ameacas.md`.** Ativos (base, credenciais do git, chave do LLM, cota), atores,
    fronteiras de confiança (base, repositório lido, LLM, navegador, rede do servidor), o que cada modo assume
    (CLI/plugin local, GUI local, GUI em servidor sem login), as barreiras por fronteira com o teste que as prova, e
    os riscos aceitos até o P06 (S1: sem autenticação). O `SECURITY.md` diz como relatar e aponta para o modelo.

## Fora do escopo

Login, papéis, auditoria e cotas (P06). TLS e proxy (P08). Trocar o escape manual por um mecanismo de template.
Limite de uso por pessoa.

## Critérios de aceite

- `apps/gui/e2e/isolation.test.mjs` passa (isolamento e os casos de uso), sem `todo`.
- A base de cargas não executa nada nem gera violação de CSP, em nenhuma visão, no HTML autônomo e na GUI.
- Clonar `https://169.254.169.254/…`, `https://localhost/…`, `git@10.0.0.5:x/y` ou um nome que resolve para rede
  privada é recusado; o mesmo host listado em `plan.gitHosts` é aceito; com `gitHosts` definido, um host público fora
  da lista é recusado.
- O HTML de `build`/`render` abre em `file://` com tema persistente, gaveta, exportação SVG e PNG e apresentação,
  sem erro no console.
- Toda resposta do servidor traz os cabeçalhos da decisão 9 e a CSP da decisão 4.
- `npm run ci`, `npm run gui:test` e o e2e da GUI passam.

## O que fica para quem implementa

Nomes de funções e de arquivos de teste; a ordem das fatias; como o teste de XSS percorre as visões; o texto do
modelo de ameaças. Sugestão de fatias, cada uma entregável sozinha: (a) ponte e sandbox; (b) CSP do diagrama e do
host com a base de cargas; (c) clone; (d) injeção de prompt; (e) cabeçalhos e erros; (f) documentos.

## Obrigações do repositório

- **GUI:** mexe em `render.mjs`, na ponte e no servidor; rodar `npm run gui:test` e o e2e em cada fatia.
- **archlens-ask:** sem impacto esperado (nada muda em tipos, visões, formato de `query` nem no layout do gbrain).
  `npm run check-ask` confirma.
- **Documentação:** `README.md` da GUI e `docs/GUIA.md` ganham `plan.gitHosts`; o `CHANGELOG.md` registra a mudança
  de comportamento do clone (rede interna recusada por padrão).
- **Snapshots:** o HTML gerado ganha a linha da CSP; snapshots em `tests/fixtures/` são atualizados uma vez.
