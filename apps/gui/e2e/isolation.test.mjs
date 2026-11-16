// P07: o documento do diagrama não pode alcançar o host. Um script que rode dentro do iframe (uma falha de escape
// em render.mjs bastaria) não deve ler a página da GUI, o armazenamento dela nem chamar a API do servidor.
// `frame.evaluate` faz o papel do script injetado: roda no contexto do documento do diagrama.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';
import { scripted } from '../server/ask/scripted.mjs';
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let srv, browser, page, skip;

before(async () => {
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch();
  } catch (e) {
    skip = `Chromium indisponível (${String(e.message).split('\n')[0]}); rode "npx playwright install chromium"`;
    console.warn(`e2e pulado: ${skip}`);
    return;
  }
  srv = await startServer({
    config: { port: 0, host: '127.0.0.1', bases: [{ id: 'telemedicina', path: resolve(ROOT, 'examples/telemedicina/architecture') }] },
    staticDir: DIST_DIR,
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
});
after(async () => {
  await browser?.close();
  await srv?.close?.();
});

test('isolamento do diagrama: um script dentro do iframe não alcança o host', async (t) => {
  if (skip) return t.skip(skip);
  await page.goto(srv.url);
  await page.frameLocator('iframe[title="Diagrama"]').locator('[data-node="tele"]').waitFor();
  const diagram = page.frames().find((f) => f !== page.mainFrame());
  assert.ok(diagram, 'o iframe do diagrama existe');

  await t.test('não lê o documento da GUI', async () => {
    const got = await diagram.evaluate(() => {
      try { return { title: window.parent.document.title }; } catch (e) { return { blocked: e.name }; }
    });
    assert.deepEqual(got, { blocked: 'SecurityError' });
  });

  await t.test('não lê o localStorage nem os cookies do host', async () => {
    await page.evaluate(() => { localStorage.setItem('p07-segredo', 'do-host'); document.cookie = 'p07=do-host'; });
    const got = await diagram.evaluate(() => {
      const read = (f) => { try { return f(); } catch (e) { return `blocked:${e.name}`; } };
      return { storage: read(() => localStorage.getItem('p07-segredo')), cookie: read(() => document.cookie) };
    });
    assert.notEqual(got.storage, 'do-host');
    assert.doesNotMatch(String(got.cookie), /p07=do-host/);
  });

  await t.test('não lê a API do servidor', async () => {
    const got = await diagram.evaluate(async (base) => {
      try { const r = await fetch(`${base}/api/info`); return { status: r.status, body: await r.text() }; } catch (e) { return { blocked: e.name }; }
    }, srv.url);
    assert.ok(got.blocked, `o diagrama leu /api/info: ${JSON.stringify(got).slice(0, 200)}`);
  });

  await t.test('não grava pela API do servidor (POST com JSON)', async () => {
    const got = await diagram.evaluate(async (base) => {
      try {
        const r = await fetch(`${base}/api/bases/telemedicina/view`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: { level: 'landscape' } }) });
        return { status: r.status };
      } catch (e) { return { blocked: e.name }; }
    }, srv.url);
    assert.ok(got.blocked || got.status === 403, `o diagrama fez POST na API: ${JSON.stringify(got)}`);
  });
});

// O isolamento não pode custar nada a quem usa: o que dependia da origem do host continua funcionando pela ponte.
test('diagrama isolado: nada de uso se perde', async (t) => {
  if (skip) return t.skip(skip);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true, colorScheme: 'light' });
  // roda em todo frame, inclusive no documento do diagrama: registra o que a CSP barrar
  await ctx.addInitScript(() => {
    window.__csp = [];
    addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const frame = () => p.frameLocator('iframe[title="Diagrama"]');
  const bar = () => p.getByRole('toolbar', { name: 'Ferramentas do diagrama' });
  const themeIs = (x) => frame().locator(`html[data-theme="${x}"]`).waitFor({ state: 'attached' });
  const open = async () => { await p.goto(srv.url); await frame().locator('[data-node="tele"]').waitFor(); };
  t.after(() => ctx.close());

  await t.test('o iframe está em sandbox sem allow-same-origin nem allow-modals', async () => {
    await open();
    assert.equal(await p.locator('iframe[title="Diagrama"]').getAttribute('sandbox'), 'allow-scripts allow-downloads');
    assert.equal(await p.evaluate(() => document.querySelector('iframe[title="Diagrama"]').contentDocument), null);
  });

  await t.test('tema escuro gravado: o diagrama já nasce escuro, sem passar pelo claro', async () => {
    await p.evaluate(() => localStorage.setItem('archlens-theme', 'dark'));
    await p.reload();
    await frame().locator('[data-node="tele"]').waitFor();
    // o atributo vem no próprio documento (srcdoc), antes de qualquer script ou mensagem da ponte
    assert.match(await p.locator('iframe[title="Diagrama"]').getAttribute('srcdoc'), /^<!doctype html>\s*<html data-theme="dark"/);
    await themeIs('dark');
  });

  await t.test('trocar o tema pelo botão não recarrega o diagrama (zoom e seleção ficam)', async () => {
    await frame().locator('[data-node="tele"]').click();
    const mark = await p.frames().find((f) => f !== p.mainFrame()).evaluate(() => { window.__p07 = 1; return window.__p07; });
    assert.equal(mark, 1);
    await bar().getByRole('button', { name: 'Alternar tema do diagrama' }).click();
    await themeIs('light');
    assert.equal(await p.frames().find((f) => f !== p.mainFrame()).evaluate(() => window.__p07), 1, 'o documento do diagrama é o mesmo');
    assert.equal(await p.evaluate(() => localStorage.getItem('archlens-theme')), 'light');
  });

  await t.test('T dentro do diagrama troca o tema e o host guarda a escolha', async () => {
    await frame().locator('[data-node="tele"]').focus();
    await p.keyboard.press('t');
    await themeIs('dark');
    await p.waitForFunction(() => localStorage.getItem('archlens-theme') === 'dark');
    await p.reload();
    await frame().locator('[data-node="tele"]').waitFor();
    await themeIs('dark');
  });

  await t.test('uma visão nova abre no tema escolhido', async () => {
    await frame().locator('[data-node="tele"]').click({ button: 'right' });
    await p.getByText('Abrir containers').first().click();
    await frame().locator('[data-node="tele.api"]').waitFor();
    await themeIs('dark');
  });

  await t.test('Exportar SVG baixa um SVG com o desenho', async () => {
    const [d] = await Promise.all([p.waitForEvent('download'), bar().getByRole('button', { name: 'Exportar SVG' }).click()]);
    assert.match(d.suggestedFilename(), /\.svg$/);
    const svg = readFileSync(await d.path(), 'utf8');
    assert.match(svg, /^<svg[\s\S]*data-node="tele\.api"[\s\S]*<\/svg>$/);
    assert.match(svg, /data-theme="dark"/);
  });

  await t.test('Exportar PNG baixa uma imagem PNG de verdade', async () => {
    const [d] = await Promise.all([p.waitForEvent('download'), bar().getByRole('button', { name: 'Exportar PNG' }).click()]);
    assert.match(d.suggestedFilename(), /\.png$/);
    const png = readFileSync(await d.path());
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(png.length > 5000, `PNG com ${png.length} bytes`);
  });

  await t.test('os botões da barra chegam ao diagrama e o estado volta (Fluxo, Rótulos, Legenda, Ajustar, Animar)', async () => {
    for (const name of ['Fluxo', 'Rótulos', 'Legenda']) {
      const b = bar().getByRole('button', { name, exact: true });
      const before = await b.getAttribute('aria-pressed');
      await b.click();
      await p.waitForFunction(([n, v]) => [...document.querySelectorAll('.toolbar button')].find((x) => x.textContent === n)?.getAttribute('aria-pressed') !== v, [name, before]);
    }
    await bar().getByRole('button', { name: 'Ajustar' }).click();
    await bar().getByRole('button', { name: 'Animar' }).click();
  });

  await t.test('Apresentar põe o diagrama em tela cheia e dá para sair', async () => {
    await bar().getByRole('button', { name: 'Apresentar', exact: true }).click();
    await p.waitForFunction(() => document.fullscreenElement?.tagName === 'IFRAME');
    await frame().locator('[data-node="tele.api"]').waitFor();
    await p.evaluate(() => document.exitFullscreen());
    await p.waitForFunction(() => !document.fullscreenElement);
  });

  await t.test('P dentro do diagrama entra no modo apresentação', async () => {
    await frame().locator('[data-node="tele.api"]').focus();
    await p.keyboard.press('p');
    await frame().locator('body.presenting').waitFor({ state: 'attached' });
    await p.keyboard.press('p');
    await frame().locator('body:not(.presenting)').waitFor({ state: 'attached' });
  });

  await t.test('atalhos da GUI com o foco dentro do diagrama: Ctrl+K abre a busca, Ctrl+B recolhe a lateral', async () => {
    await frame().locator('[data-node="tele.api"]').focus();
    const left = () => p.evaluate(() => document.querySelector('[data-testid="side-left"]')?.getBoundingClientRect().width ?? 0);
    const w0 = await left();
    await p.keyboard.press('Control+b');
    await p.waitForFunction((w) => (document.querySelector('[data-testid="side-left"]')?.getBoundingClientRect().width ?? 0) !== w, w0);
    await frame().locator('[data-node="tele.api"]').focus();
    await p.keyboard.press('Control+b');
    await p.waitForFunction((w) => (document.querySelector('[data-testid="side-left"]')?.getBoundingClientRect().width ?? 0) === w, w0);
    await frame().locator('[data-node="tele.api"]').focus();
    await p.keyboard.press('Control+k');
    await p.waitForFunction(() => document.activeElement?.tagName === 'INPUT');
  });

  await t.test('seleção, menu de contexto e cartão de ajuda continuam funcionando', async () => {
    await p.keyboard.press('Escape');
    await frame().locator('[data-node="tele.api"]').click();
    await p.locator('[data-testid="side-right"] h2', { hasText: 'API de Agendamento' }).waitFor();
    await frame().locator('[data-node="tele.api"]').hover();
    await frame().locator('.hovercard').waitFor();
    await frame().locator('[data-node="tele.api"]').click({ button: 'right' });
    await p.locator('.menu .mi').first().waitFor();
    await p.keyboard.press('Escape');
  });

  await t.test('nenhum erro no console e nenhuma violação de CSP durante o uso', async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(await p.frames().find((f) => f !== p.mainFrame()).evaluate(() => window.__csp), []);
    assert.deepEqual(await p.evaluate(() => window.__csp), []);
  });

  await t.test('a CSP do documento do diagrama barra um script injetado', async () => {
    const got = await p.frames().find((f) => f !== p.mainFrame()).evaluate(async () => {
      const s = document.createElement('script');
      s.textContent = 'window.__injetado = 1';
      document.body.appendChild(s);
      await new Promise((ok) => setTimeout(ok, 200)); // o evento de violação chega numa tarefa à parte
      return { injetado: window.__injetado ?? null, csp: window.__csp };
    });
    assert.equal(got.injetado, null);
    assert.ok(got.csp.some((v) => v.startsWith('script-src')), JSON.stringify(got.csp));
  });
});

// A janela de documentação é da GUI (fora do iframe): o sandbox do diagrama, sem allow-modals, não a afeta.
test('diagrama isolado: a janela de documentação abre, edita, pede confirmação ao descartar e confirma', async (t) => {
  if (skip) return t.skip(skip);
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-e2e-doc-')), 'architecture');
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/archlens.mjs'), 'init', dir, '--store', 'markdown', '--name', 'Doc'], { encoding: 'utf8' });
  const store = openStore(resolveBase(dir));
  store.apply([
    { op: 'upsertElement', element: { id: 's1', type: 'application-component', name: 'Sistema Um', c4: { kind: 'softwareSystem' } } },
    { op: 'upsertElement', element: { id: 's2', type: 'application-component', name: 'Sistema Dois', c4: { kind: 'softwareSystem' } } },
    { op: 'upsertRelationship', relationship: { id: 's1-s2', from: 's1', to: 's2', type: 'serving' } },
    { op: 'putDoc', id: 's1', text: '## Visão geral\n\nTexto original do nó.' },
  ], { baseVersion: store.version() });
  const own = await startServer({
    config: { port: 0, host: '127.0.0.1', bases: [{ id: 'doc', path: dir }], llm: { provider: 'anthropic' }, plan: { maxRounds: 8, timeoutMs: 30000, maxTokens: 100000 } },
    staticDir: DIST_DIR, provider: scripted([]),
  });
  const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  t.after(async () => { await p.close(); await own.close(); });
  await p.goto(own.url);
  await p.frameLocator('iframe[title="Diagrama"]').locator('[data-node="s1"]').click();
  await p.getByText('Texto original do nó.').first().waitFor();

  await p.getByRole('button', { name: 'Editar documentação' }).click();
  await p.locator('[data-card="doc"]').getByRole('button', { name: 'Tela cheia' }).click();
  const win = p.getByRole('dialog', { name: /Documentação · Sistema Um/ });
  await win.waitFor();
  const area = win.getByRole('textbox', { name: 'Documentação' });
  await area.fill('## Visão geral\n\nTexto editado na janela P07.');

  // descartar com alteração: o confirm nativo é da página do host e continua aparecendo
  let asked = '';
  p.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
  await win.getByRole('button', { name: 'Cancelar' }).click();
  assert.notEqual(asked, '', 'descartar com alteração pede confirmação');
  await win.waitFor(); // recusado: a janela continua aberta com o texto

  await win.getByRole('button', { name: 'Confirmar' }).click();
  await win.waitFor({ state: 'detached' });
  await p.getByText('Texto editado na janela P07.').first().waitFor();
});
