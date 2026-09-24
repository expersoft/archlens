// Visual verification: screenshots at presentation resolutions + width-fill and legibility checks.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VIEWPORTS = [[1920, 1080], [1280, 720]];
export const MIN_FILL = 0.9;

/** Returns { available, results: [{ key, viewport, fill, minFontPx, shot, issues[] }] }. */
export async function inspectHtml(htmlPath, { shotsDir, viewports = VIEWPORTS, minFill = MIN_FILL } = {}) {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch {
    return { available: false, reason: 'playwright-core não instalado (rode "npm install" na pasta da skill)', results: [] };
  }
  let browser;
  try { browser = await chromium.launch(); } catch (e) {
    return { available: false, reason: `Chromium indisponível (${e.message.split('\n')[0]}); rode "npx playwright install chromium"`, results: [] };
  }
  const results = [];
  try {
    if (shotsDir) mkdirSync(shotsDir, { recursive: true });
    const url = pathToFileURL(resolve(htmlPath)).href;
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url);
      const keys = await page.evaluate(() => window.archlens.data.views.map(v => v.key));
      for (const key of keys) {
        await page.evaluate(k => window.archlens.show(window.archlens.data.views.findIndex(v => v.key === k)), key);
        await page.waitForTimeout(120);
        const m = await page.evaluate(() => {
          const s = document.querySelector('.view:not([hidden]) svg.diagram');
          const r = s.getBoundingClientRect();
          const c = s.querySelector('.content').getBoundingClientRect();
          const v = window.archlens.data.views[window.archlens.current];
          const scale = Math.min(r.width / v.width, r.height / v.height);
          return { fill: c.width / window.innerWidth, minFontPx: v.minFont * scale, min: window.archlens.data.minScreenPx };
        });
        const shot = shotsDir ? join(shotsDir, `${key}@${w}x${h}.png`) : null;
        if (shot) await page.screenshot({ path: shot });
        const issues = [];
        if (m.fill < minFill) issues.push(`ocupa ${(m.fill * 100).toFixed(0)}% da largura (< ${minFill * 100}%): use layout.direction "auto"/"DOWN" ou divida a visão`);
        if (m.minFontPx < m.min) issues.push(`texto ~${m.minFontPx.toFixed(1)}px (< ${m.min}px): divida a visão (focus+depth, exclude, collapse, layers)`);
        results.push({ key, viewport: `${w}x${h}`, fill: +m.fill.toFixed(3), minFontPx: +m.minFontPx.toFixed(1), shot, issues });
      }
      if (errors.length) results.push({ key: '*', viewport: `${w}x${h}`, fill: null, minFontPx: null, shot: null, issues: errors.map(e => `erro de JS: ${e}`) });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return { available: true, results };
}
