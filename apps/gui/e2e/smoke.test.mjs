// Ponta a ponta no Chromium real: servidor da GUI (dist) + base telemedicina.
// Rode com `npm run test:e2e` (faz o build antes). Sem navegador instalado, o teste é pulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let INICIAL; // título da visão inicial (landscape), lido da própria tela
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

const trail = () => page.locator('nav[aria-label="Trilha"]').innerText();
const frame = () => page.frameLocator('iframe[title="Diagrama"]');

test('GUI ponta a ponta', async (t) => {
  if (skip) return t.skip(skip);
  const first = page.waitForResponse((r) => r.url().endsWith('/view') && r.request().method() === 'POST');
  await page.goto(srv.url);
  const v0 = await (await first).json();
  INICIAL = v0.title;

  await t.test('1. a paisagem abre; página sem rolagem e moldura fixa', async () => {
    await frame().locator('[data-node="tele"]').waitFor();
    assert.equal(v0.spec.level, 'landscape');
    assert.equal(await trail(), INICIAL);
    const css = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
      app: getComputedStyle(document.querySelector('.app')).position,
    }));
    assert.deepEqual(css, { html: 'hidden', body: 'hidden', app: 'fixed' });
  });

  await t.test('2. botão direito abre o menu; Abrir containers soma à trilha', async () => {
    await frame().locator('[data-node="tele"]').click({ button: 'right' });
    await page.getByText('Abrir containers').first().click();
    await page.waitForFunction(() => /Containers de Plataforma de Teleconsulta/.test(document.querySelector('nav[aria-label="Trilha"]')?.textContent ?? ''));
    assert.equal(await trail(), `${INICIAL} › Containers de Plataforma de Teleconsulta`);
  });

  await t.test('3. clique em tele.api preenche "Nesta visão"', async () => {
    await frame().locator('[data-node="tele.api"]').click();
    await page.getByText('Nesta visão', { exact: true }).waitFor();
    await page.locator('[data-testid="side-right"] h2', { hasText: 'API de Agendamento' }).waitFor();
    await page.getByText('Na base', { exact: true }).waitFor();
  });

  await t.test('4. sem rolagem horizontal da página após wheel sobre o diagrama (1600, 1150, 800)', async () => {
    for (const w of [1600, 1150, 800]) {
      await page.setViewportSize({ width: w, height: 900 });
      const box = await page.locator('iframe[title="Diagrama"]').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 8; i++) await page.mouse.wheel(300, 0);
      const r = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
      assert.equal(r.sw, r.iw, `largura ${w}`);
    }
    await page.setViewportSize({ width: 1600, height: 900 });
  });

  await t.test('5. tema: barra do topo muda o iframe; T no iframe muda a aplicação', async () => {
    const appTheme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const frameTheme = () => frame().locator('html').getAttribute('data-theme');
    const before = await appTheme();
    await page.getByRole('button', { name: 'Alternar tema' }).click();
    const after = await appTheme();
    assert.notEqual(after, before);
    await page.waitForFunction((x) => document.querySelector('iframe[title="Diagrama"]').contentDocument.documentElement.dataset.theme === x, after);
    assert.equal(await frameTheme(), after);
    await frame().locator('[data-node="tele.api"]').focus();
    await page.keyboard.press('t');
    await page.waitForFunction((x) => document.documentElement.dataset.theme !== x, after);
    assert.equal(await appTheme(), before);
  });

  await t.test('6. ação que falha mostra o erro e a trilha não muda', async () => {
    const antes = await trail();
    await page.route('**/view', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'teste' }) }));
    await frame().locator('[data-node="tele.api"]').click({ button: 'right' });
    await page.locator('.menu .mi:not(.off)').first().click();
    await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'teste');
    assert.equal(await trail(), antes);
    await page.unroute('**/view');
  });

  await t.test('7. não existe .drawer no iframe', async () => {
    assert.equal(await frame().locator('.drawer').count(), 0);
  });
});
