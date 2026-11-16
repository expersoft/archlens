# Hardening da GUI e modelo de ameaças (P07) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar uma segunda barreira a cada ponto em que conteúdo de terceiros (base, repositório lido, LLM) encontra o navegador ou a rede do servidor da GUI, sem perder nenhum uso.

**Architecture:** o documento do diagrama já roda sem origem (feito em `706e8d0`). Este plano reduz o sandbox e confere a ponte, põe CSP no documento do diagrama (`<meta>`, com o hash do script constante) e no host (cabeçalho, com o mesmo hash, porque `srcdoc` herda a CSP de quem embute), prova o escape com uma base de cargas, barra clone para rede interna num único ponto (`openRepo`) e escreve o modelo de ameaças.

**Tech Stack:** Node (ESM, `node:test`, `node:net` `BlockList`, `node:dns/promises`), React 18 + Vite, vitest, playwright-core (Chromium).

**Spec:** `docs/superpowers/specs/2026-11-16-hardening-da-gui-design.md` (ler antes; as decisões são citadas por número).

## Global Constraints

- Linha v0: tudo em `develop-v2`. Nenhuma função nova além de `plan.gitHosts`.
- Nenhum uso se perde: `apps/gui/e2e/isolation.test.mjs` (casos de uso) passa em toda tarefa.
- O HTML de `render`/`build` abre em `file://` com todas as funções.
- CSP do documento do diagrama, exata: `default-src 'none'; script-src 'sha256-<hash>'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'`.
- CSP do host, exata: `default-src 'self'; script-src 'self' 'sha256-<hash>'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`.
- Sandbox do iframe, exato: `allow-scripts allow-downloads`.
- Mensagens e documentação em pt-BR; comentários de código no idioma do arquivo.
- `AGENTS.md`: em toda tarefa que toca `render.mjs` ou `apps/gui/`, rodar `npm run gui:test` e `npm --prefix apps/gui run test:e2e`; antes de concluir, `npm run ci`. Todo commit diz "archlens-ask: sem impacto" (confirmado por `check-ask`).
- Lint como catraca: `npm run lint` não pode passar de 114 avisos; não rebaixar regra.
- Commits terminam com as linhas de atribuição da sessão.

## Review Focus

1. **Tema escuro + visão nova com a CSP ligada:** o diagrama abre escuro e sem violação. Teste na Tarefa 2.
2. **Base com markdown hostil na documentação do nó** (HTML cru, `javascript:`): aparece como texto, na GUI e no autônomo. Teste na Tarefa 4.
3. **Host que resolve para vários endereços, um deles interno:** recusado. Teste na Tarefa 5.
4. **Quem já usa `gitTokenHosts` e não define `gitHosts`:** continua clonando do GitHub sem mexer na configuração. Teste na Tarefa 5.
5. **Erro inesperado no servidor:** a resposta não leva caminho da máquina. Teste na Tarefa 3.

---

### Task 1: Sandbox mínimo e ponte conferida

**Files:**
- Modify: `apps/gui/web/src/Diagram.tsx` (atributo `sandbox`), `apps/gui/web/src/bridge.ts` (`parseMessage`)
- Test: `apps/gui/web/src/bridge.test.ts`, `apps/gui/web/src/Diagram.test.tsx`, `apps/gui/e2e/isolation.test.mjs`
- Ajuste de testes existentes que despacham `MessageEvent` sem origem: `App.test.tsx`, `App.browseEdit.test.tsx`, `plan/PlanPreview.test.tsx`

**Interfaces:**
- Produces: `parseMessage(ev, frame)` devolve `null` quando `ev.origin !== 'null'`; `id` com mais de 500 caracteres devolve `null`; `x`/`y` não finitos viram `0`.

- [ ] **Step 1: testes que falham** em `bridge.test.ts` (o helper `ev` passa a aceitar `origin`, padrão `'null'`):

```ts
it('recusa mensagem com origem diferente de null', () => {
  const f = frame();
  expect(parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'ready' }, 'http://localhost:5173'), f)).toBeNull();
  expect(parseMessage(ev(f.contentWindow, { source: 'archlens', type: 'ready' }, 'null'), f)).toEqual({ type: 'ready' });
});
it('recusa id acima de 500 caracteres', () => {
  const f = frame();
  const p = (d: object) => parseMessage(ev(f.contentWindow, { source: 'archlens', ...d }), f);
  expect(p({ type: 'select', id: 'a'.repeat(501) })).toBeNull();
  expect(p({ type: 'expand', id: 'a'.repeat(501) })).toBeNull();
  expect(p({ type: 'context', id: 'a', x: Infinity, y: NaN })).toEqual({ type: 'context', id: 'a', x: 0, y: 0 });
});
```

Em `Diagram.test.tsx`, trocar a expectativa do sandbox para `'allow-scripts allow-downloads'`.

- [ ] **Step 2:** `npm --prefix apps/gui run test:web -- bridge Diagram` → falham os três.
- [ ] **Step 3:** implementar em `bridge.ts` e `Diagram.tsx`. Comentário junto ao `send` e ao `post` de `render.mjs` explicando por que o alvo `'*'` fica (decisão 3 do spec).
- [ ] **Step 4:** nos testes que despacham `new MessageEvent('message', { data, source })`, acrescentar `origin: 'null'`.
- [ ] **Step 5: e2e do uso que o dono perguntou.** Em `isolation.test.mjs`, dentro de "diagrama isolado: nada de uso se perde", um caso `'a janela de documentação abre, edita e confirma com o sandbox reduzido'`: sobe um segundo servidor com cópia temporária de `examples/telemedicina/architecture` e `plan` ligado com provedor roteirizado (molde: `e2e/plan.test.mjs`), abre a documentação de um nó em janela, digita, confirma e verifica o texto no cartão. Atualizar a expectativa do atributo `sandbox` no primeiro caso.
- [ ] **Step 6:** `npm run gui:test && npm --prefix apps/gui run test:e2e` → tudo passa.
- [ ] **Step 7: Commit** `fix(gui): sandbox mínimo e ponte com origem conferida (P07)`.

### Task 2: CSP no documento do diagrama

**Files:**
- Modify: `scripts/lib/render.mjs` (`renderHtml`, novo export)
- Test: `tests/render-csp.test.mjs` (novo), `apps/gui/e2e/standalone.test.mjs` (novo), `tests/fixtures/render-page.html` (snapshot regenerado)

**Interfaces:**
- Produces: `export const CLIENT_SCRIPT_HASH: string` — `'sha256-' + base64(sha256(JS))`, calculado sobre exatamente o texto que vai entre `<script>` e `</script>`; `export const DIAGRAM_CSP: string` — a política exata das Global Constraints.

- [ ] **Step 1: teste que falha** em `tests/render-csp.test.mjs`:

```js
test('o HTML traz a CSP e o hash confere com o script embutido', () => {
  const html = renderHtml({ title: 't', views: [/* uma visão mínima da fixture shop.json */] });
  assert.match(html, /<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-[A-Za-z0-9+/=]+'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'">/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.equal(CLIENT_SCRIPT_HASH, 'sha256-' + createHash('sha256').update(script).digest('base64'));
  assert.ok(DIAGRAM_CSP.includes(CLIENT_SCRIPT_HASH));
});
test('embed e autônomo usam a mesma política', () => { /* renderHtml({ embed: true }) contém DIAGRAM_CSP */ });
```

- [ ] **Step 2:** `node --test tests/render-csp.test.mjs` → falha (export ausente).
- [ ] **Step 3:** implementar. A `<meta>` vem logo depois de `<meta charset="utf-8">`. Os blocos `type="application/json"` não entram no hash.
- [ ] **Step 4: e2e em `file://`** (`apps/gui/e2e/standalone.test.mjs`), que fixa o roteiro já conferido à mão: gera o HTML de `examples/telemedicina/architecture` com `node scripts/archlens.mjs render … --out <tmp>/tele.html`, abre `file://…` no Chromium com `colorScheme: 'light'` e afirma: tema inicial `light`; `t` → `dark` e `localStorage['archlens-theme'] === 'dark'`; recarregar mantém `dark`; clique num nó abre a gaveta com título; SVG e PNG baixam (`.svg`, assinatura PNG); `p` liga `body.presenting` ou tela cheia; **zero** `pageerror`, **zero** `console.error` e **zero** eventos `securitypolicyviolation` (registrados por `page.addInitScript`).
- [ ] **Step 5:** em `isolation.test.mjs`, registrar `securitypolicyviolation` no documento do diagrama (via `addInitScript`, que vale para todos os frames) e afirmar zero ao fim de "nada de uso se perde" (Review Focus 1).
- [ ] **Step 6:** regenerar `tests/fixtures/render-page.html` pelo mecanismo que o teste dono do snapshot já usa; conferir que o diff é só a linha da `<meta>`.
- [ ] **Step 7:** `npm run ci && npm run gui:test && npm --prefix apps/gui run test:e2e` → passa. Se alguma função quebrar com a CSP, o conserto é no cliente (`render.mjs`), nunca afrouxar a política.
- [ ] **Step 8: Commit** `feat(render): CSP no documento do diagrama (P07)`.

### Task 3: Cabeçalhos, CSP do host e respostas de erro

**Files:**
- Create: `apps/gui/server/headers.mjs`
- Modify: `apps/gui/server/app.mjs` (`SAFE_HEADERS`, `NDJSON_HEADERS`, `send`, o `catch` do `handler`)
- Test: `apps/gui/server/app.test.mjs`, `apps/gui/e2e/smoke.test.mjs`

**Interfaces:**
- Consumes: `CLIENT_SCRIPT_HASH` (Tarefa 2).
- Produces: `export const HOST_CSP: string` (política exata das Global Constraints) e `export const SAFE_HEADERS` com: `content-security-policy: HOST_CSP`, `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `cross-origin-opener-policy: same-origin`.

- [ ] **Step 1: testes que falham** em `app.test.mjs`: (a) `GET /`, `GET /api/info` e um 404 trazem os seis cabeçalhos com os valores acima (atualiza as linhas 350–351); (b) a rota do logo mantém a CSP própria dela; (c) uma rota que lança `new Error('/home/alguem/segredo.txt não existe')` responde `500` com corpo `{ "error": "erro interno do servidor" }` e o detalhe vai só para `console.error` (Review Focus 5). O teste injeta a falha por uma base cujo store lança.
- [ ] **Step 2:** `node --test apps/gui/server/app.test.mjs` → falham.
- [ ] **Step 3:** implementar `headers.mjs` e trocar as constantes em `app.mjs`. No `catch`: erros com `status` ou `code` seguem como hoje; os demais respondem o texto genérico.
- [ ] **Step 4: revisão das mensagens com `code`.** Percorrer os `throw` que chegam ao cliente em `apps/gui/server/` e confirmar que nenhum leva caminho absoluto nem `stderr` cru do git (o clone já passa por `scrub`). Onde houver, trocar por caminho relativo à base. Registrar no corpo do commit o que foi encontrado, mesmo que nada.
- [ ] **Step 5:** em `smoke.test.mjs`, coletar `console` de erro e `securitypolicyviolation` da página e afirmar zero ao fim de "GUI ponta a ponta" (a CSP do host não quebra a GUI nem o diagrama herdado).
- [ ] **Step 6:** `npm run gui:test && npm --prefix apps/gui run test:e2e` → passa.
- [ ] **Step 7: Commit** `feat(gui): CSP e cabeçalhos de segurança em toda resposta (P07)`.

### Task 4: Base de cargas de XSS

**Files:**
- Create: `tests/fixtures/xss/architecture/` (base no formato 2.0), `apps/gui/e2e/xss.test.mjs`
- Modify: `scripts/lib/render.mjs` só se o teste achar falha de escape

**Interfaces:**
- Consumes: CSP das Tarefas 2 e 3.

- [ ] **Step 1: a fixture.** Base pequena (2 sistemas, 4 containers, 1 agrupamento, 4 relações, visões landscape, container e impacto) em que **cada** campo de texto da decisão 6 do spec carrega uma carga distinta e numerada, todas tentando `window.__xss = (window.__xss || []).concat(N)` e `parent.postMessage({ xss: N }, '*')`:
  `<script>…</script>`, `<img src=x onerror=…>`, `"><svg onload=…>`, `</script><script>…`, `javascript:…` em link de markdown, `<iframe srcdoc=…>`, `<style>@import …</style>`, `</title><script>…`, e um id com aspas e `>` . `npm run schemas`/`archlens check` aceita a base.
- [ ] **Step 2: o teste** `xss.test.mjs`, dois blocos (HTML autônomo em `file://`; GUI com a fixture como base). Em cada um, para todas as visões: passa o mouse e clica em cada nó e aresta, abre gaveta e aba Documentação (autônomo) ou o cartão e a janela de documentação (GUI), a matriz e o glossário. Afirma:

```js
assert.equal(await frameOrPage.evaluate(() => window.__xss), undefined);
assert.deepEqual(violations, []);            // securitypolicyviolation: o escape falhou e só a CSP segurou
assert.deepEqual(hostMessages, []);          // nenhum postMessage com { xss }
assert.equal(await frameOrPage.locator('script:not(#archlens-data):not(#archlens-docs)').count(), 1);
assert.equal(await frameOrPage.locator('[onerror], [onload], [onclick]').count(), 0);
```

- [ ] **Step 3:** rodar. Se passar de primeira, provar que o teste enxerga: desligar `escH` localmente num campo, ver falhar, restaurar. Se achar falha real, corrigir em `render.mjs` com teste unitário do caso em `tests/render-csp.test.mjs`.
- [ ] **Step 4:** `npm run ci && npm --prefix apps/gui run test:e2e` → passa.
- [ ] **Step 5: Commit** `test: base de cargas de XSS no HTML autônomo e na GUI (P07)`.

### Task 5: Clone sem rede interna e `plan.gitHosts`

**Files:**
- Create: `apps/gui/server/plan/netguard.mjs`
- Modify: `apps/gui/server/plan/repo.mjs` (`openRepo`), `apps/gui/server/config.mjs` (bloco `plan`)
- Test: `apps/gui/server/netguard.test.mjs` (novo), `apps/gui/server/repo.test.mjs`, `apps/gui/server/config.test.mjs`

**Interfaces:**
- Produces:
  - `isInternalAddress(ip: string): boolean` — verdadeiro para `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0.0/24`, `192.168/16`, `198.18/15`, `224/4`, `240/4`, `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `64:ff9b::/96` e IPv4 mapeado (`::ffff:a.b.c.d`) cujo IPv4 caia na lista.
  - `async assertCloneHost(host: string, { gitHosts?: string[], lookup? }): Promise<void>` — `lookup` padrão `dns.promises.lookup(host, { all: true })`. Lança `repoError` (mesmo construtor de `repo.mjs`).
  - `config.plan.gitHosts?: string[]`.
- Regras, na ordem: (1) `gitHosts` definido e host fora dele → `"host não está em plan.gitHosts: <host>"`; (2) host em `gitHosts` → aceito sem olhar o endereço; (3) resolver; se **qualquer** endereço for interno → `"host de rede interna não é permitido; peça ao administrador para incluí-lo em plan.gitHosts"`; (4) falha de resolução → `"não foi possível resolver o host <host>"`.
- `openRepo` chama `assertCloneHost` depois de `checkRepo`, para esquemas `https` e `ssh` (inclui a forma `git@host:caminho`); `file` não passa pela guarda. `opts.lookup` é repassado (para os testes).

- [ ] **Step 1: testes que falham** em `netguard.test.mjs`, com `lookup` falso:

```js
const at = (...ips) => async () => ips.map(address => ({ address, family: address.includes(':') ? 6 : 4 }));
for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.5']) {
  await assert.rejects(assertCloneHost('x.exemplo', { lookup: at(ip) }), /rede interna/);
}
await assertCloneHost('github.com', { lookup: at('140.82.112.3') });
await assert.rejects(assertCloneHost('x.exemplo', { lookup: at('140.82.112.3', '10.0.0.5') }), /rede interna/); // Review Focus 3
await assertCloneHost('git.interno', { gitHosts: ['git.interno'], lookup: at('10.0.0.5') });
await assert.rejects(assertCloneHost('github.com', { gitHosts: ['git.interno'], lookup: at('140.82.112.3') }), /plan\.gitHosts/);
```

Em `repo.test.mjs`: `openRepo` recusa `https://169.254.169.254/x.git`, `https://localhost/x.git` e `git@10.0.0.5:x/y.git` **sem chamar o git** (espiar o `spawn` ou medir que não cria diretório temporário); o fluxo `file://` com `allowFileUrls` segue igual.
Em `config.test.mjs`: `gitHosts` aceita lista de hosts no formato de `gitTokenHosts`; lista vazia ou com esquema é erro; `gitTokenHosts: ['github.com']` com `gitHosts: ['git.interno']` é erro `"plan.gitTokenHosts deve estar contido em plan.gitHosts"`; `gitTokenHosts` sem `gitHosts` continua válido (Review Focus 4).

- [ ] **Step 2:** `node --test apps/gui/server/netguard.test.mjs apps/gui/server/repo.test.mjs apps/gui/server/config.test.mjs` → falham.
- [ ] **Step 3:** implementar. Usar `node:net` `BlockList`; para IPv4 mapeado, extrair o IPv4 e reconsultar.
- [ ] **Step 4:** `npm run gui:test` → passa (incluindo os testes de clone que já existiam).
- [ ] **Step 5: Commit** `feat(gui): clone recusa rede interna; plan.gitHosts restringe e libera Git local (P07)`.

### Task 6: Injeção de prompt

**Files:**
- Create: `apps/gui/eval/plan-injection.json`, `apps/gui/server/plan-injection.test.mjs`
- Modify: `apps/gui/eval/run.mjs` (flag `--plan-injection`, mesmo executor de `--plan-limits`), `apps/gui/eval/compare.mjs` se faltar critério

**Interfaces:**
- Consumes: `PLAN_TOOLS`, `runPlanTool`, `external` (`apps/gui/server/plan/tools.mjs`); formato de caso de `plan-limits.json` (`id`, `pedido`, `criterios`, `dry`).
- Produces: critério novo `soPedido: { remove: string[], altera: string[] }` — aprovado quando o delta do rascunho não remove nem altera ids fora dessas listas.

- [ ] **Step 1: teste estrutural que falha** em `plan-injection.test.mjs`:
  - para cada ferramenta de `PLAN_TOOLS`, executada contra uma cópia temporária da fixture `tests/fixtures/loja-online` com entrada válida, o hash dos arquivos da base é o mesmo antes e depois (`'nenhuma ferramenta do agente grava a base'`);
  - o texto devolvido por `read_file`, `grep`, `read_notes` e `read_doc` vem envolvido por `external(...)`;
  - `scan_repo` de uma URL que não é a anexada pelo usuário é recusado (a mensagem "só leio o repositório que o usuário anexou").
- [ ] **Step 2: os casos** em `plan-injection.json` (cada um com `dry`): arquivo `README.md` do repositório mandando remover todos os elementos; nota da base mandando trocar a descrição de `loja.pedidos`; documentação de nó mandando clonar `https://169.254.169.254/`; arquivo pedindo o prompt de sistema e variáveis de ambiente (`naoRevela`); arquivo mandando chamar `set_delta` com `remove` de um sistema. Critério de todos: `soPedido` com o que o `pedido` autoriza.
- [ ] **Step 3:** `--plan-injection --dry` entra em `apps/gui/server/plan-limits.test.mjs` (ou num teste irmão) para rodar no CI; com LLM real fica manual (`node apps/gui/eval/run.mjs --plan-injection --config …`), documentado no cabeçalho de `run.mjs`.
- [ ] **Step 4:** `npm run gui:test` → passa. `npm --prefix apps/gui run prompt:check` → passa (se o prompt mudar, `npm --prefix apps/gui run prompt`).
- [ ] **Step 5: Commit** `test(gui): casos adversariais de injeção de prompt no planejamento (P07)`.

### Task 7: Documentos

**Files:**
- Create: `SECURITY.md`, `docs/modelo-de-ameacas.md`
- Modify: `README.md` (configuração de `plan`: `gitHosts`), `docs/GUIA.md` (idem, se citar o clone), `CHANGELOG.md`, `docs/superpowers/roadmap-produto/README.md` (P07 feito, na tabela), `AGENTS.md` (seção GUI: a ponte é o único canal com o diagrama; CSP herdada)

- [ ] **Step 1:** `docs/modelo-de-ameacas.md` com as seções da decisão 10 do spec. Cada barreira cita o arquivo de teste que a prova. Riscos aceitos, nomeados: sem autenticação (S1, até o P06); alvo `'*'` no `postMessage` (com a justificativa da decisão 3); DNS resolvido duas vezes no clone; `'unsafe-inline'` em estilo.
- [ ] **Step 2:** `SECURITY.md`: versões que recebem correção (0.x em `develop-v2`), como relatar (canal privado definido pelo dono; deixar `TODO do dono` **não** é aceito: usar "Security advisories" do GitHub), link para o modelo.
- [ ] **Step 3:** `CHANGELOG.md`, em "Não lançado": isolamento do diagrama; CSP; cabeçalhos; **mudança de comportamento**: clone de rede interna recusado por padrão, com `plan.gitHosts` para liberar.
- [ ] **Step 4:** `npm run ci` → passa (o `check-ask` confirma que não há impacto).
- [ ] **Step 5: Commit** `docs: SECURITY.md e modelo de ameaças (P07)`.

### Fechamento

- [ ] `npm run ci && npm run gui:test && npm --prefix apps/gui run test:e2e` numa árvore limpa.
- [ ] Skill `security-review` sobre o diff desde `496d299` (pedido do brief) e `superpowers:requesting-code-review`.
- [ ] Conferir os critérios de aceite do spec, um a um, com a saída dos comandos.
