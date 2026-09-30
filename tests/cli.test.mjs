import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDoc, extractModel } from '../scripts/lib/doc.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const md = generateDoc(shop(), { date: '2026-10-01' })
    .replace('<!-- keep:notes -->\n_Decisões, riscos e pendências._', '<!-- keep:notes -->\nNota à mão.');
  writeFileSync(join(dir, 'ARCHITECTURE.md'), md);
  return dir;
};

test('merge --plan lists pending decisions and --apply refuses until they are answered', () => {
  const dir = setup();
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({
    'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'rodada 1' }, summary: 'API migra para Kotlin',
    model: {
      elements: [
        { id: 'loja.api', type: 'c4:container', technology: 'Kotlin' },
        { id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja', technology: 'Kotlin' },
      ],
      relationships: [{ from: 'loja.worker', to: 'loja.db', type: 'uses' }],
    },
  }));
  const p = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'plano.json'], dir);
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /conflito loja\.api\.technology/);
  const plan = JSON.parse(readFileSync(join(dir, 'plano.json'), 'utf8'));
  const refused = run(['merge', 'ARCHITECTURE.md', '--apply', 'plano.json'], dir);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /E_PLAN_PENDING/);
  plan.items.find(i => i.class === 'conflict').resolution = 'take';
  writeFileSync(join(dir, 'plano.json'), JSON.stringify(plan));
  const ok = run(['merge', 'ARCHITECTURE.md', '--apply', 'plano.json'], dir);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /commit sugerido/);
  const md = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  assert.equal(extractModel(md).changelog.length, 1);
  assert.match(md, /Nota à mão\./, 'keep blocks survive the merge');
  assert.match(md, /Worker/);
});

test('merge creates a missing base; the same delta again changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({
    'archlens-delta': '1.0', name: 'Nova', source: { kind: 'manual', ref: 'kickoff' },
    model: { elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }, { id: 'u', type: 'c4:person', name: 'Usuário' }], relationships: [{ from: 'u', to: 'sis' }] },
  }));
  assert.equal(run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p.json'], dir).status, 0);
  assert.equal(run(['merge', 'ARCHITECTURE.md', '--apply', 'p.json'], dir).status, 0);
  assert.ok(existsSync(join(dir, 'ARCHITECTURE.md')));
  const again = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p2.json', '--json'], dir);
  assert.deepEqual(Object.keys(JSON.parse(again.stdout).summary), ['unchanged']);
  const r = run(['merge', 'ARCHITECTURE.md', '--apply', 'p2.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nada mudou/);
});

test('a blocked plan exits with 2 and shows the errors', () => {
  const dir = setup();
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({ 'archlens-delta': '1.0', model: { relationships: [{ from: 'loja.api', to: 'pagamentoz' }] } }));
  const p = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p.json'], dir);
  assert.equal(p.status, 2);
  assert.match(p.stdout, /bloqueado[\s\S]*E_UNKNOWN_REF/);
});

test('doc regenerates an ARCHITECTURE.md in place, keeping hand-written blocks', () => {
  const dir = setup();
  const r = run(['doc', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), /Nota à mão\./);
});
