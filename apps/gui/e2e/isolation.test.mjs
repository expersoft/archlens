// P07: o documento do diagrama não pode alcançar o host. Um script que rode dentro do iframe (uma falha de escape
// em render.mjs bastaria) não deve ler a página da GUI, o armazenamento dela nem chamar a API do servidor.
// `frame.evaluate` faz o papel do script injetado: roda no contexto do documento do diagrama.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';

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

// todo até a correção do P07 entrar: hoje os quatro casos falham (é a prova do problema), sem derrubar a suíte.
test('isolamento do diagrama: um script dentro do iframe não alcança o host', { todo: 'P07: o iframe ainda roda na origem do host' }, async (t) => {
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
