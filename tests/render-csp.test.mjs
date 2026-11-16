// The diagram document carries its own CSP: only the embedded client script runs and the page never talks to the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { layoutView } from '../scripts/lib/layout.mjs';
import { renderHtml, CLIENT_SCRIPT_HASH, DIAGRAM_CSP } from '../scripts/lib/render.mjs';
import { asBase } from './helpers.mjs';

const view = async () => layoutView(resolveView(normalizeModel(asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))))), { key: 'k', notation: 'c4', level: 'container', scope: 'loja' }));
const POLICY = /^default-src 'none'; script-src 'sha256-[A-Za-z0-9+/]{43}='; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'$/;

test('the page declares the CSP right after the charset, and the hash is the embedded script\'s', async () => {
  const html = renderHtml({ title: 't', views: [await view()] });
  assert.match(DIAGRAM_CSP, POLICY);
  assert.ok(html.includes(`<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${DIAGRAM_CSP}">\n`));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'one executable script; the data blocks are application/json');
  assert.equal(CLIENT_SCRIPT_HASH, `sha256-${createHash('sha256').update(scripts[0][1]).digest('base64')}`);
  assert.ok(DIAGRAM_CSP.includes(`script-src '${CLIENT_SCRIPT_HASH}'`));
});

test('embedded and standalone pages carry the same policy and the same script', async () => {
  const views = [await view()];
  const script = h => h.match(/<script>([\s\S]*?)<\/script>/)[1];
  const a = renderHtml({ title: 't', views }), b = renderHtml({ title: 't', views, embed: true });
  assert.ok(b.includes(`content="${DIAGRAM_CSP}"`));
  assert.equal(script(a), script(b));
});

test('the page has no inline event handler, which the policy would block', async () => {
  const html = renderHtml({ title: 't', views: [await view()] });
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /\son[a-z]+\s*=/i);
});
