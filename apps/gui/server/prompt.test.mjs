import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, checkPrompt } from '../scripts/gen-prompt.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const here = dirname(fileURLToPath(import.meta.url));

test('prompt carries views.md and the skill tables', () => {
  const p = buildPrompt();
  assert.ok(p.includes(readFileSync(join(root, 'references/views.md'), 'utf8')));
  for (const s of ['| O usuário pede | View spec |', '| Alerta | Ação |', 'layout.style']) assert.ok(p.includes(s), s);
  assert.ok(!p.includes('## Erros comuns'));
});

test('committed prompt is current', () => {
  assert.deepEqual(checkPrompt(), [], 'rode "npm --prefix apps/gui run prompt"');
});

test('head describes only the protocol', () => {
  const head = readFileSync(join(here, 'ask/prompt-head.md'), 'utf8');
  for (const t of ['show_view', 'show_element', 'clarify', 'try_view', 'find_elements', 'relations', 'element_card']) {
    assert.ok(head.includes(t), t);
  }
  assert.ok(!/viewpoint:|level:/.test(head));
  assert.ok(head.length <= 3500);
});
