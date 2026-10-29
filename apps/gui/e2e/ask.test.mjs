// Busca em texto no Chromium real: servidor da GUI (dist) com o provedor roteirizado sobre a loja-online.
// Rode com `npm run test:e2e` (faz o build antes). Sem navegador instalado, o teste é pulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';
import { scripted } from '../server/ask/scripted.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (name, input) => ({ text: '', calls: [{ id: 't', name, input }], ms: 1, usage: USAGE });
const SUPORTE = { notation: 'archimate', viewpoint: 'layered', anchor: 'bp-checkout', traverse: { mode: 'supporters' }, granularity: 'container' };

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
    provider: scripted([
      turn('show_view', { spec: SUPORTE }),
      turn('clarify', { question: 'Qual API?', options: ['loja.pedidos', 'loja.catalogo'] }),
      turn('show_element', { id: 'loja.pedidos' }),
    ]),
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
});
after(async () => {
  await browser?.close();
  await srv?.close?.();
});

const trail = () => page.locator('nav[aria-label="Trilha"]').innerText();
const frame = () => page.frameLocator('iframe[title="Diagrama"]');

test('busca em texto ponta a ponta', async (t) => {
  if (skip) return t.skip(skip);
  await page.goto(srv.url);
  await frame().locator('[data-node]').first().waitFor();
  const box = page.getByRole('textbox', { name: 'Pergunta' });
  await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Pergunta"]')?.disabled);

  await t.test('1. pergunta vira passo "Pergunta" e abre a visão do resultado', async () => {
    await box.fill('o que suporta o checkout?');
    await box.press('Enter');
    await frame().locator('[data-node="bp-checkout"]').waitFor();
    await page.locator('ol[aria-label="Histórico"] .k', { hasText: 'Pergunta' }).waitFor();
    assert.match(await trail(), /›/);
  });

  await t.test('2. esclarecimento mostra botões e a escolha abre o cartão na lateral direita', async () => {
    await box.fill('mostre a API');
    await box.press('Enter');
    await page.getByRole('button', { name: /API de Catálogo/ }).waitFor();
    await page.getByRole('button', { name: /API de Pedidos/ }).click();
    await page.locator('[data-testid="side-right"] h2', { hasText: 'API de Pedidos' }).waitFor();
  });
});
