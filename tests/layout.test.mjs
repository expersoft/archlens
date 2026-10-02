import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrap, layoutView } from '../scripts/lib/layout.mjs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';

test('wrap honours "\\n" as a forced line break', () => {
  assert.deepEqual(wrap('Autorizador\n(Odin)', 20, 248, 3), ['Autorizador', '(Odin)']);
});

test('wrap still word-wraps each forced line and caps at maxLines', () => {
  const lines = wrap('Cache de Cartões e Portadores\n(Sleipnir)', 20, 248, 3);
  assert.deepEqual(lines, ['Cache de Cartões e', 'Portadores', '(Sleipnir)']);
  const capped = wrap('a\nb\nc\nd', 20, 248, 3);
  assert.equal(capped.length, 3);
  assert.ok(capped[2].endsWith('…'));
});

test('wrap without "\\n" is unchanged', () => {
  assert.deepEqual(wrap('Autorizador (Odin)', 20, 248, 3), ['Autorizador (Odin)']);
});

// Frame layout tests
const plat = () => normalizeModel(JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url))));
const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('C4 landscape: each member sits inside its frame, loose elements outside every frame', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } }));
  assert.deepEqual(laid.frames.map(f => f.id).sort(), ['plat-aut', 'plat-cred']);
  for (const n of laid.nodes) {
    if (n.group) assert.ok(inside(n, laid.frames.find(f => f.id === n.group)), n.id);
    else for (const f of laid.frames) assert.ok(!overlaps(n, f), `${n.id} outside ${f.id}`);
  }
});

test('C4 container: the opened boundary sits inside the frame of its group', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'c', notation: 'c4', level: 'container', scope: 'autorizador', groups: { frames: true } }));
  const frame = laid.frames.find(f => f.id === 'plat-aut');
  assert.ok(inside(laid.boundaries[0], frame));
  assert.ok(inside(laid.nodes.find(n => n.id === 'motor'), laid.frames.find(f => f.id === 'plat-cred')));
});

test('C4: a container with its own group stays inside the opened boundary', async () => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  r.model.elements.find(e => e.id === 'autorizador').children[1].group = 'plat-cred';
  const laid = await layoutView(resolveView(normalizeModel(r), { key: 'c', notation: 'c4', level: 'container', scope: 'autorizador', groups: { frames: true } }));
  assert.ok(inside(laid.nodes.find(n => n.id === 'autorizador.regras'), laid.boundaries[0]));
});

test('C4 without frames lays out exactly as before', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'l', notation: 'c4', level: 'landscape' }));
  assert.deepEqual(laid.frames, []);
});
