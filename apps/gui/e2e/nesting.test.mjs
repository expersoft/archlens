// Agrupar e desagrupar o aninhamento no Chromium real, sobre a loja-online.
// Rode com `npm run test:e2e` (faz o build antes). Sem navegador instalado, o teste é pulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';
import { scripted } from '../server/ask/scripted.mjs';

const USAGE = { input: 1, output: 1, cacheRead: 0 };
const SPEC = { notation: 'archimate', viewpoint: 'application', include: ['loja'] };
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
    config: { port: 0, host: '127.0.0.1', bases: [{ id: 'loja', path: resolve(ROOT, 'examples/loja-online/architecture') }] },
    staticDir: DIST_DIR,
    provider: scripted([{ text: '', calls: [{ id: 't', name: 'show_view', input: { spec: SPEC } }], ms: 1, usage: USAGE }]),
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
});
after(async () => {
  await browser?.close();
  await srv?.close?.();
});

const frame = () => page.frameLocator('iframe[title="Diagrama"]');
// quantos nós (fora `loja`) ficam dentro do retângulo de `loja`
const inside = () => frame().locator('[data-node="loja"]').evaluate((box) => {
  const r = box.getBoundingClientRect();
  return [...box.ownerDocument.querySelectorAll('[data-node]')].filter((n) => {
    if (n === box) return false;
    const c = n.getBoundingClientRect();
    return c.left >= r.left && c.right <= r.right && c.top >= r.top && c.bottom <= r.bottom;
  }).length;
});

test('agrupar e desagrupar ponta a ponta', async (t) => {
  if (skip) return t.skip(skip);
  await page.goto(srv.url);
  await frame().locator('[data-node]').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Pergunta"]')?.disabled);
  const box = page.getByRole('textbox', { name: 'Pergunta' });
  await box.fill('mostre a loja na camada de aplicação');
  await box.press('Enter');
  await page.getByRole('button', { name: 'Agrupar tudo' }).waitFor();
  await frame().locator('[data-node="loja"]').waitFor();
  assert.equal(await inside(), 0);

  await page.getByRole('button', { name: 'Agrupar tudo' }).click();
  await page.getByRole('button', { name: 'Desagrupar tudo' }).waitFor();
  await frame().locator('[data-node="loja"]').waitFor();
  assert.ok(await inside() > 0, 'o filho deve ficar dentro da caixa de loja');

  await frame().locator('[data-node="loja"]').click({ button: 'right', position: { x: 12, y: 12 }, force: true });
  await page.getByRole('menuitem', { name: 'Desagrupar', exact: true }).click();
  for (let i = 0; i < 50 && (await inside().catch(() => -1)) !== 0; i++) await page.waitForTimeout(100);
  assert.equal(await inside(), 0);
});
