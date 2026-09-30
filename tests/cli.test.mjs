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

test('merge --plan --answers reuses the answers of an earlier plan (duplicate answered same)', () => {
  const dir = setup();
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({
    'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'rodada 2' },
    model: {
      elements: [{ id: 'gateway-pag', type: 'c4:softwareSystem', name: 'Gateway Pagamentos', external: true }],
      relationships: [{ from: 'loja.api.checkout', to: 'gateway-pag', type: 'uses', description: 'Captura' }],
    },
  }));
  assert.equal(run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p1.json'], dir).status, 0);
  const p1 = JSON.parse(readFileSync(join(dir, 'p1.json'), 'utf8'));
  for (const it of p1.items) {
    if (it.key === 'dup:gateway-pag') it.resolution = 'same';
    else if (it.key === 'el:gateway-pag:name') it.resolution = 'keep';
  }
  writeFileSync(join(dir, 'p1.json'), JSON.stringify(p1));
  const stale = run(['merge', 'ARCHITECTURE.md', '--apply', 'p1.json'], dir);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /E_PLAN_REPLAN[\s\S]*--answers/);
  const p = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p2.json', '--answers', 'p1.json'], dir);
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /possível duplicata[^\n]*respondido: same/);
  assert.match(p.stdout, /conflito pagamentos-serving-loja\.api\.checkout\.description/);
  const p2 = JSON.parse(readFileSync(join(dir, 'p2.json'), 'utf8'));
  p2.items.find(i => i.key === 'rel:0:description').resolution = 'take';
  writeFileSync(join(dir, 'p2.json'), JSON.stringify(p2));
  const ok = run(['merge', 'ARCHITECTURE.md', '--apply', 'p2.json'], dir);
  assert.equal(ok.status, 0, ok.stderr);
  const raw = extractModel(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'));
  assert.equal(raw.model.relationships.find(r => r.from === 'loja.api.checkout' && r.to === 'pagamentos').description, 'Captura');
  const bad = run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p3.json', '--answers', 'delta.json'], dir);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /E_PLAN_SCHEMA/);
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

const previewDelta = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
  model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }, ops: [{ op: 'remove', id: 'loja.db' }] };

test('render --delta draws the preview and leaves ARCHITECTURE.md untouched', () => {
  const dir = setup();
  const before = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--out', 'p.html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prévia de d\.json · \+1 ~0 −1, 1 decisão\(ões\) pendente\(s\)/);
  assert.match(readFileSync(join(dir, 'p.html'), 'utf8'), /PRÉVIA · não é a base oficial — d\.json/);
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), before);
});

test('build --delta writes <delta>-preview.html and never the knowledge base', () => {
  const dir = setup();
  const before = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['build', 'ARCHITECTURE.md', '--delta', 'd.json'], dir);
  assert.ok([0, 3].includes(r.status), r.stderr);
  assert.ok(existsSync(join(dir, 'd-preview.html')));
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), before);
});

test('render --plan uses the plan answers; --delta with --plan is refused', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  assert.equal(run(['merge', 'ARCHITECTURE.md', 'd.json', '--plan', 'p.json'], dir).status, 0);
  const viaPlan = run(['render', 'ARCHITECTURE.md', '--plan', 'p.json', '--out', 'q.html'], dir);
  assert.equal(viaPlan.status, 0, viaPlan.stderr);
  const both = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--plan', 'p.json', '--out', 'x.html'], dir);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /--delta ou --plan/);
  assert.ok(!existsSync(join(dir, 'x.html')));
});

test('in a preview, a view that does not open is skipped with a warning', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--view', 'ctx', '--spec', '{"key":"x","notation":"c4","level":"context","scope":"nada"}', '--out', 'p.html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /visão "x" não abre na prévia/);
});

test('resolve --delta prints the annotated IR; a preview of a missing base shows everything as new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'd.json'), JSON.stringify({ 'archlens-delta': '1.0', model: { elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }, { id: 'u', type: 'c4:person', name: 'Usuário' }], relationships: [{ from: 'u', to: 'sis' }] } }));
  const r = run(['resolve', 'ARCHITECTURE.md', '--delta', 'd.json', '--spec', '{"key":"l","notation":"c4","level":"landscape"}'], dir);
  assert.equal(r.status, 0, r.stderr);
  const ir = JSON.parse(r.stdout);
  assert.deepEqual(ir.nodes.map(n => n.change).sort(), ['added', 'added']);
  assert.ok(!existsSync(join(dir, 'ARCHITECTURE.md')));
});

test('views --delta --json prints parseable JSON only', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['views', 'ARCHITECTURE.md', '--delta', 'd.json', '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Array.isArray(JSON.parse(r.stdout).defined));
});

test('a preview command without the base file argument fails cleanly', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['build', '--delta', 'd.json'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /informe o arquivo da base/);
});
