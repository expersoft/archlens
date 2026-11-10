import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { normalizeModel } from '../../../scripts/lib/model.mjs';
import { resolveView } from '../../../scripts/lib/query.mjs';
import { layoutView } from '../../../scripts/lib/layout.mjs';
import { renderHtml } from '../../../scripts/lib/render.mjs';
import { asBase } from '../../../tests/helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Carrega a página embutida de verdade (o script do diagrama roda) e devolve o que ela mandou ao host. */
async function load() {
  const m = normalizeModel(asBase(JSON.parse(readFileSync(join(root, 'tests/fixtures/shop.json'), 'utf8'))));
  const v = await layoutView(resolveView(m, { key: 'k', notation: 'c4', level: 'container', scope: 'loja' }));
  const html = renderHtml({ title: 't', views: [v], embed: true });
  const sent = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w.ResizeObserver = class { observe() {} disconnect() {} };
      w.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
      Object.defineProperty(w, 'parent', { value: { postMessage: (d) => sent.push(JSON.parse(JSON.stringify(d))) } });
    },
  });
  await new Promise((r) => setTimeout(r, 50));
  return { w: dom.window, sent, close: () => dom.window.close() };
}

test('a página embutida, ao carregar, só avisa ready: não desfaz a seleção do host', async () => {
  const { sent, close } = await load();
  assert.deepEqual(sent.map((m) => m.type), ['ready']);
  close();
});

test('desmarcar no diagrama (Esc) com um nó selecionado ainda avisa o host', async () => {
  const { w, sent, close } = await load();
  w.archlens.trace('loja.api');
  sent.length = 0;
  w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(sent.filter((m) => m.type === 'select'), [{ source: 'archlens', type: 'select', id: null }]);
  close();
});
