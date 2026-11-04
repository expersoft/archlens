// Planejar no Chromium real: servidor da GUI (dist) com o provedor roteirizado sobre uma cópia da loja-online.
// Rode com `npm run test:e2e` (faz o build antes). Sem navegador instalado, o teste é pulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';
import { scripted } from '../server/ask/scripted.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const USAGE = { input: 1, output: 1, cacheRead: 0 };
const turn = (...calls) => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `t${i}`, name, input })), ms: 1, usage: USAGE });
const KEY = 'el:loja.pedidos:description';
const DELTA = {
  'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'e2e' },
  model: {
    elements: [
      { id: 'loja.pedidos', name: 'API de Pedidos', type: 'application-component', description: 'Descrição nova vinda do planejamento' },
      { id: 'sistema-novo', name: 'Sistema Novo Zeta', type: 'application-component' },
    ],
    relationships: [],
  },
};

let srv, browser, page, skip, arch;

before(async () => {
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch();
  } catch (e) {
    skip = `Chromium indisponível (${String(e.message).split('\n')[0]}); rode "npx playwright install chromium"`;
    console.warn(`e2e pulado: ${skip}`);
    return;
  }
  const top = mkdtempSync(join(tmpdir(), 'archlens-e2e-plan-'));
  arch = join(top, 'architecture');
  cpSync(resolve(ROOT, 'examples/loja-online/architecture'), arch, { recursive: true });
  cpSync(resolve(ROOT, 'examples/loja-online/ARCHITECTURE.md'), join(top, 'ARCHITECTURE.md'));
  srv = await startServer({
    config: { port: 0, host: '127.0.0.1', bases: [{ id: 'loja', path: arch }], llm: { provider: 'anthropic' }, plan: { maxRounds: 8, timeoutMs: 30000, maxTokens: 100000 } },
    staticDir: DIST_DIR,
    provider: scripted([
      turn(['set_delta', { delta: DELTA }]),
      turn(['plan_draft', {}]),
      turn(['ask_decision', { key: KEY, recommendation: 'take', reason: 'a descrição nova é a mais completa' }]),
      turn(['reply', { text: 'Plano pronto para revisar.' }]),
      turn(['reply', { text: 'Sem notas por agora.' }]),
    ]),
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
});
after(async () => {
  await browser?.close();
  await srv?.close?.();
});

const model = () => readFileSync(join(arch, 'model.json'), 'utf8');

test('planejar ponta a ponta', async (t) => {
  if (skip) return t.skip(skip);
  await page.goto(srv.url);
  await page.getByRole('button', { name: 'Planejar' }).click();
  const box = page.getByRole('textbox', { name: 'Mensagem' });
  const chat = page.getByRole('list', { name: 'Conversa de planejamento' });

  await t.test('1. um texto vira delta e o agente pergunta a decisão por botões', async () => {
    await box.fill('troque a descrição da API de Pedidos e inclua o Sistema Novo Zeta');
    await box.press('Control+Enter');
    await chat.getByText('a descrição nova é a mais completa').waitFor();
    await chat.getByRole('button', { name: 'keep' }).waitFor();
  });

  await t.test('2. a resposta pelo botão fecha o plano', async () => {
    await chat.getByRole('button', { name: 'take' }).click();
    await chat.getByText('Plano pronto para revisar.').waitFor();
    await page.waitForFunction(() => !([...document.querySelectorAll('button')].find((b) => b.textContent === 'Aplicar')?.disabled ?? true));
  });

  await t.test('3. a prévia alterna entre as abas e o delta fica na lateral', async () => {
    const tab = (name) => page.getByRole('tab', { name });
    await tab('Plano').click();
    assert.equal(await tab('Plano').getAttribute('aria-selected'), 'true');
    await tab('Diagrama').click();
    assert.equal(await tab('Diagrama').getAttribute('aria-selected'), 'true');
    const panel = page.getByTestId('delta-panel');
    await panel.getByRole('button', { name: 'Sistema Novo Zeta' }).waitFor();
    await panel.getByText('API de Pedidos').waitFor();
  });

  await t.test('3b. ArchiMate | C4 redesenha a visão do que muda; o menu de contexto navega pela prévia', async () => {
    const frame = () => page.frameLocator('[data-testid="plan-preview"] iframe[title="Diagrama"]');
    const notation = page.getByRole('group', { name: 'Notação' });
    await frame().locator('[data-node="sistema-novo"]').waitFor();
    const before = await notation.getByRole('button', { name: 'C4' }).getAttribute('class');
    const other = before === 'on' ? 'ArchiMate' : 'C4';
    await notation.getByRole('button', { name: other }).click();
    await page.waitForFunction((o) => [...document.querySelectorAll('[aria-label="Notação"] button')].find((b) => b.textContent === o)?.className === 'on', other);
    await frame().locator('[data-node="sistema-novo"]').waitFor();
    await frame().locator('[data-node="sistema-novo"]').click({ button: 'right', position: { x: 12, y: 12 }, force: true });
    const menu = page.getByRole('menu');
    await menu.getByRole('menuitem').first().waitFor();
    await menu.getByRole('menuitem', { name: /Focar/ }).click();
    await page.locator('[aria-label="Visões da prévia"]').getByRole('button', { pressed: true }).filter({ hasNotText: 'O que muda' }).waitFor();
    await frame().locator('[data-node="sistema-novo"]').waitFor();
  });

  await t.test('4. recarregar a página traz o rascunho de volta, sem gravar nada', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Planejar' }).click();
    await page.getByRole('list', { name: 'Conversa de planejamento' }).getByText('Plano pronto para revisar.').waitFor();
    await page.waitForFunction(() => !([...document.querySelectorAll('button')].find((b) => b.textContent === 'Aplicar')?.disabled ?? true));
    assert.ok(!model().includes('sistema-novo'));
  });

  await t.test('5. aplicar pede confirmação, grava a base e atualiza o catálogo', async () => {
    await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirmar a aplicação' }).getByRole('button', { name: 'Confirmar e aplicar' }).click();
    await page.getByText(/Plano aplicado: base gravada/).waitFor();
    assert.match(model(), /Sistema Novo Zeta/);
    assert.match(model(), /Descrição nova vinda do planejamento/);
    const catalog = await (await fetch(`${srv.url}/api/bases/loja/catalog`)).json();
    assert.ok(JSON.stringify(catalog).includes('sistema-novo'));
    // The draft is gone once applied.
    assert.equal(await page.evaluate(() => localStorage.getItem('archlens-gui-draft:loja')), null);
  });
});
