// O HTML que `render`/`build` geram, aberto direto do disco (file://), com a CSP do documento ligada:
// todas as funções continuam e nada é barrado pela política. Rode com `npm run test:e2e`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let browser, skip, file;

before(async () => {
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch();
  } catch (e) {
    skip = `Chromium indisponível (${String(e.message).split('\n')[0]}); rode "npx playwright install chromium"`;
    console.warn(`e2e pulado: ${skip}`);
    return;
  }
  file = join(mkdtempSync(join(tmpdir(), 'archlens-e2e-file-')), 'tele.html');
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/archlens.mjs'), 'render', resolve(ROOT, 'examples/telemedicina/architecture'), '--out', file], { encoding: 'utf8', stdio: 'pipe' });
});
after(async () => { await browser?.close(); });

test('HTML autônomo em file://: todas as funções com a CSP ligada', async (t) => {
  if (skip) return t.skip(skip);
  const ctx = await browser.newContext({ acceptDownloads: true, colorScheme: 'light', viewport: { width: 1600, height: 900 } });
  t.after(() => ctx.close());
  await ctx.addInitScript(() => {
    window.__csp = [];
    addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const theme = () => p.evaluate(() => document.documentElement.dataset.theme);
  const open = async () => { await p.goto(pathToFileURL(file).href); await p.locator('.node').first().waitFor(); };

  await t.test('a política está no documento', async () => {
    await open();
    assert.match(await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /^default-src 'none'; script-src 'sha256-/);
  });

  await t.test('tema: T troca, fica gravado e volta ao recarregar', async () => {
    assert.equal(await theme(), 'light');
    await p.keyboard.press('t');
    assert.equal(await theme(), 'dark');
    assert.equal(await p.evaluate(() => localStorage.getItem('archlens-theme')), 'dark');
    await open();
    assert.equal(await theme(), 'dark');
  });

  await t.test('clique num nó abre a gaveta; passar o mouse mostra o cartão', async () => {
    await p.locator('.node').first().hover();
    await p.locator('.hovercard').waitFor();
    await p.locator('.node').first().click();
    assert.notEqual((await p.locator('.drawer-body h2').first().textContent()).trim(), '');
    await p.keyboard.press('Escape');
  });

  await t.test('exportar SVG e PNG', async () => {
    const [svg] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.querySelector('[data-act=svg]').click())]);
    assert.match(readFileSync(await svg.path(), 'utf8'), /^<svg[\s\S]*<\/svg>$/);
    const [png] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.querySelector('[data-act=png]').click())]);
    const bytes = readFileSync(await png.path());
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(bytes.length > 5000, `PNG com ${bytes.length} bytes`);
  });

  await t.test('trocar de visão, legenda, rótulos, fluxo, matriz, ajuda e glossário', async () => {
    const views = await p.locator('#viewSelect option').count();
    assert.ok(views > 1);
    await p.keyboard.press('ArrowRight');
    await p.waitForFunction(() => window.archlens.current === 1);
    for (const k of ['l', 'r', 'a', 'm', '?', 'g', '0']) await p.keyboard.press(k);
    await p.keyboard.press('Escape');
    await p.keyboard.press('ArrowLeft');
    await p.waitForFunction(() => window.archlens.current === 0);
  });

  await t.test('P entra e sai do modo apresentação', async () => {
    await p.keyboard.press('p');
    await p.locator('body.presenting').waitFor({ state: 'attached' });
    await p.keyboard.press('p');
    await p.locator('body:not(.presenting)').waitFor({ state: 'attached' });
  });

  await t.test('nenhum erro e nenhuma violação da política', async () => {
    assert.deepEqual(await p.evaluate(() => window.__csp), []);
    assert.deepEqual(errors, []);
  });

  await t.test('a política barra um script injetado e qualquer saída para a rede', async () => {
    const got = await p.evaluate(async () => {
      const s = document.createElement('script');
      s.textContent = 'window.__injetado = 1';
      document.body.appendChild(s);
      let rede = 'passou';
      try { await fetch('https://example.com/'); } catch { rede = 'barrada'; }
      await new Promise((ok) => setTimeout(ok, 200)); // o evento de violação chega numa tarefa à parte
      return { injetado: window.__injetado ?? null, rede, csp: window.__csp };
    });
    assert.equal(got.injetado, null);
    assert.equal(got.rede, 'barrada');
    assert.ok(got.csp.some((v) => v.startsWith('script-src')), JSON.stringify(got.csp));
    assert.ok(got.csp.some((v) => v.startsWith('connect-src') || v.startsWith('default-src')), JSON.stringify(got.csp));
  });
});
