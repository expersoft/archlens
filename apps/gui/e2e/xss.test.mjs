// Uma base em que todo campo de texto tenta rodar script (tests/fixtures/xss/base.mjs), no HTML autônomo e na GUI.
// Nada pode executar, e a CSP não pode nem precisar agir: uma violação de CSP aqui significa que o escape falhou e só
// a segunda barreira segurou. Rode com `npm run test:e2e`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';
import { xssOps, VIEWS, DOCS } from '../../../tests/fixtures/xss/base.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = resolve(ROOT, 'scripts/archlens.mjs');
let browser, skip, srv, file;

before(async () => {
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch();
  } catch (e) {
    skip = `Chromium indisponível (${String(e.message).split('\n')[0]}); rode "npx playwright install chromium"`;
    console.warn(`e2e pulado: ${skip}`);
    return;
  }
  const top = mkdtempSync(join(tmpdir(), 'archlens-e2e-xss-'));
  const dir = join(top, 'architecture');
  execFileSync(process.execPath, [CLI, 'init', dir, '--store', 'markdown', '--name', 'XSS'], { encoding: 'utf8', stdio: 'pipe' });
  const store = openStore(resolveBase(dir));
  store.apply(xssOps(), { baseVersion: store.version() });
  file = join(top, 'xss.html');
  execFileSync(process.execPath, [CLI, 'render', dir, '--out', file], { encoding: 'utf8', stdio: 'pipe' });
  srv = await startServer({ config: { port: 0, host: '127.0.0.1', bases: [{ id: 'xss', path: dir }] }, staticDir: DIST_DIR });
});
after(async () => { await browser?.close(); await srv?.close?.(); });

/** Página nova que registra, em todo frame, o que rodou, o que a CSP barrou e as mensagens das cargas. */
async function watched() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(() => {
    window.__csp = [];
    window.__msg = [];
    addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    addEventListener('message', (e) => { if (e.data && e.data.xss !== undefined) window.__msg.push(e.data.xss); });
  });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  return { ctx, page, dialogs };
}

/** O que um documento (página ou frame) mostra de errado: tudo tem de voltar vazio. */
const findings = (f) => f.evaluate(async () => {
  await new Promise((ok) => setTimeout(ok, 300)); // onerror de imagem e eventos de violação chegam depois
  const on = [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name)));
  return {
    ran: window.__xss ?? [],
    csp: window.__csp,
    msg: window.__msg,
    handlers: on.map((el) => el.outerHTML.slice(0, 80)),
    jsLinks: [...document.querySelectorAll('a[href], area[href]')].map((a) => a.getAttribute('href')).filter((h) => /^\s*javascript:/i.test(h)),
    frames: document.querySelectorAll('iframe:not([title="Diagrama"]), object, embed').length,
  };
});
const CLEAN = { ran: [], csp: [], msg: [], handlers: [], jsLinks: [], frames: 0 };

test('cargas de XSS no HTML autônomo: nada executa em nenhuma visão', async (t) => {
  if (skip) return t.skip(skip);
  const { ctx, page, dialogs } = await watched();
  t.after(() => ctx.close());
  await page.goto(pathToFileURL(file).href);
  await page.locator('.node').first().waitFor();
  // um script executável (o do cliente); os blocos de dados são application/json
  assert.equal(await page.locator('script:not([type])').count(), 1);
  const views = await page.evaluate(() => window.archlens.data.views.length);
  assert.equal(views, VIEWS.length);

  for (let i = 0; i < views; i++) {
    await page.evaluate((k) => window.archlens.show(k, true), i);
    const key = await page.evaluate(() => window.archlens.data.views[window.archlens.current].key);
    await t.test(`visão ${key}`, async () => {
      const ids = await page.evaluate(() => Object.keys(window.archlens.data.views[window.archlens.current].nodes));
      assert.ok(ids.length > 0);
      for (const id of ids) {
        const node = page.locator(`section:not([hidden]) [data-node="${id}"]`).first();
        if (!(await node.count())) continue;
        await node.hover({ force: true });
        await node.click({ force: true });
        const tab = page.locator('.drawer-body [data-tab="doc"]');
        if (await tab.count()) { await tab.click(); await page.locator('.drawer-body [data-pane="doc"]').waitFor(); }
      }
      for (const edge of await page.locator('section:not([hidden]) [data-edge]').all()) {
        await edge.hover({ force: true }).catch(() => {});
        await edge.click({ force: true }).catch(() => {});
      }
      for (const k of ['Escape', 'm', 'l', 'r', 'g', '?']) await page.keyboard.press(k);
      assert.deepEqual(await findings(page), CLEAN);
      for (const k of ['Escape', 'l', 'r']) await page.keyboard.press(k);
    });
  }
  assert.deepEqual(dialogs, []);
});

test('cargas de XSS na GUI: nada executa na página nem no diagrama', async (t) => {
  if (skip) return t.skip(skip);
  const { ctx, page, dialogs } = await watched();
  t.after(() => ctx.close());
  const diagram = () => page.frames().find((f) => f !== page.mainFrame());
  const frame = () => page.frameLocator('iframe[title="Diagrama"]');
  const clean = async () => {
    assert.deepEqual(await findings(page), CLEAN, 'página da GUI');
    assert.deepEqual(await findings(diagram()), CLEAN, 'documento do diagrama');
  };
  const walk = async (ids) => {
    for (const id of ids) {
      const node = frame().locator(`[data-node="${id}"]`).first();
      if (!(await node.count())) continue;
      await node.hover({ force: true });
      await node.click({ force: true });
      await page.locator('[data-testid="side-right"] h2').first().waitFor();
      for (const closed of await page.locator('[data-testid="side-right"] .np-toggle[aria-expanded="false"]').all()) await closed.click().catch(() => {});
      if (!DOCS[id]) continue;
      // nó com documentação: o markdown hostil aparece no cartão e na janela ampliada
      const card = page.locator('[data-card="doc"]');
      await card.locator('.doc-text').waitFor();
      await card.getByRole('button', { name: 'Tela cheia' }).click();
      const win = page.getByRole('dialog', { name: /^Documentação/ });
      await win.locator('.doc-text, .doc-win-body').first().waitFor();
      await win.getByRole('button', { name: 'Fechar' }).click();
      await win.waitFor({ state: 'detached' });
    }
  };

  await page.goto(srv.url);
  await frame().locator('[data-node="s1"]').waitFor();

  await t.test('panorama: cartões, propriedades, relações e documentação de cada nó', async () => {
    await walk(['s1', 's2', 'ator']);
    await clean();
  });

  await t.test('barra do diagrama: legenda, rótulos, fluxo e glossário', async () => {
    const bar = page.getByRole('toolbar', { name: 'Ferramentas do diagrama' });
    for (const name of ['Legenda', 'Rótulos', 'Fluxo']) await bar.getByRole('button', { name, exact: true }).click();
    for (const edge of await frame().locator('[data-edge]').all()) await edge.hover({ force: true }).catch(() => {});
    await clean();
  });

  await t.test('containers de s1 pelo menu de contexto', async () => {
    await frame().locator('[data-node="s1"]').click({ button: 'right', force: true });
    await page.getByText('Abrir containers').first().click();
    await frame().locator('[data-node="s1.api"]').waitFor();
    await walk(['s1.api', 's1.db', 's2']);
    await clean();
  });

  await t.test('busca e explorador mostram os nomes como texto', async () => {
    await page.getByRole('searchbox', { name: 'Buscar' }).fill('X');
    await page.waitForTimeout(500);
    await clean();
    await page.getByRole('searchbox', { name: 'Buscar' }).fill('');
    const filter = page.getByRole('searchbox', { name: 'Filtrar elementos' });
    if (await filter.count()) { await filter.fill('X'); await page.waitForTimeout(300); }
    await clean();
    await page.keyboard.press('Escape');
  });

  assert.deepEqual(dialogs, []);
});
