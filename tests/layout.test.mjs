import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap } from '../scripts/lib/layout.mjs';

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
