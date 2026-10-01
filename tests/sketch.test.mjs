import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sketchShape, hachureGapFor } from '../scripts/lib/sketch.mjs';

const lines = svg => (svg.match(/<path class="sk-fill" d="([^"]*)"/)?.[1].match(/M/g) || []).length;

test('hachure spacing follows the size of the box, within bounds', () => {
  assert.equal(hachureGapFor(60, 20), 7, 'small boxes keep a minimum gap');
  assert.equal(hachureGapFor(600, 400), 16, 'big boxes are capped');
  assert.ok(hachureGapFor(300, 160) > hachureGapFor(150, 60), 'bigger box, wider gap');
});

test('a big box is not filled with proportionally more strokes than a small one', () => {
  const small = sketchShape('<rect class="shape" x="0" y="0" width="150" height="60" rx="3"/>', 'a', { w: 150, h: 60 });
  const big = sketchShape('<rect class="shape" x="0" y="0" width="300" height="120" rx="3"/>', 'a', { w: 300, h: 120 });
  assert.ok(lines(big) < 2 * lines(small), `big ${lines(big)} vs small ${lines(small)}`);
});
