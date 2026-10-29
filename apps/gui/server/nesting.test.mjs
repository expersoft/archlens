import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { nestState } from './nesting.mjs';
import { renderSpec, createViewCache } from './views.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const reg = createBaseRegistry({ port: 1, bases: [{ id: 'loja', path: join(root, 'examples', 'loja-online', 'architecture') }] }, { pollMs: 100000 });
const loja = reg.get('loja');
test.after(() => reg.close());

const app = extra => ({ notation: 'archimate', viewpoint: 'application', include: ['loja'], ...extra });

test('nestState is null for C4', () => {
  assert.equal(nestState(loja, { level: 'container', scope: 'loja' }), null);
});

test('holders and open follow the spec', () => {
  const off = nestState(loja, app({}));
  assert.equal(off.mode, 'edges');
  assert.ok(off.holders.includes('loja'));
  assert.deepEqual(off.open, []);
  const on = nestState(loja, app({ nesting: 'nested' }));
  assert.equal(on.mode, 'nested');
  assert.ok(on.open.includes('loja'));
  const ex = nestState(loja, app({ nesting: { mode: 'nested', except: ['loja'] } }));
  assert.ok(ex.holders.includes('loja'));
  assert.ok(!ex.open.includes('loja'));
  assert.deepEqual(ex.except, ['loja']);
});

test('renderSpec puts nest in the (cached) result', async () => {
  const cache = createViewCache();
  const r = await renderSpec(loja, app({ nesting: 'nested' }), cache);
  assert.ok(r.nest.open.includes('loja'));
  assert.ok((await renderSpec(loja, app({ nesting: 'nested' }), cache)).nest.open.includes('loja'));
});
