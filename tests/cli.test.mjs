import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawnSync as sp } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveFolder, loadFolder } from '../scripts/lib/store/folder.mjs';
import { hashRaw } from '../scripts/lib/merge.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const shop = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  saveFolder(join(dir, 'architecture'), shop(), { notes: { notes: 'Nota à mão.' } });
  const r = run(['doc', 'architecture'], dir);
  assert.equal(r.status, 0, r.stderr);
  return dir;
};
const changelog = dir => JSON.parse(readFileSync(join(dir, 'architecture', 'changelog.json'), 'utf8'));
const model = dir => JSON.parse(readFileSync(join(dir, 'architecture', 'model.json'), 'utf8'));
/** [path, content] of every file under architecture/ (Node 18 has no recursive readdir with file types). */
const snapshot = dir => {
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push([p, readFileSync(p, 'utf8')]);
    }
  };
  walk(join(dir, 'architecture'));
  return out.sort((a, b) => a[0].localeCompare(b[0]));
};
const legacyMd = raw => ['---', `name: ${raw.name}`, '---', '', '<!-- keep:notes -->', 'Nota antiga.', '<!-- /keep:notes -->', '',
  '```archlens-json', JSON.stringify(raw, null, 2), '```', ''].join('\n');

const previewDelta = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
  model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] }, ops: [{ op: 'remove', id: 'loja.db' }] };

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
  assert.equal(changelog(dir).length, 1);
  assert.match(md, /Nota à mão\./, 'notes survive the merge');
  assert.match(md, /Worker/);
  assert.match(ok.stdout, /git add architecture ARCHITECTURE\.md/);
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
  assert.ok(existsSync(join(dir, 'architecture', 'archlens.json')));
  assert.doesNotMatch(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), /archlens-json/);
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
  const raw = { model: model(dir) };
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

test('doc regenerates ARCHITECTURE.md from the folder, with the notes; a hand edit is overwritten', () => {
  const dir = setup();
  writeFileSync(join(dir, 'ARCHITECTURE.md'), readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8') + '\nEditado à mão.\n');
  const r = run(['doc', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  const md = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  assert.match(md, /Nota à mão\./);
  assert.doesNotMatch(md, /Editado à mão/);
});

test('commands that write refuse an old-format base and point to migrate; reading still works', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop()));
  for (const args of [['doc', 'ARCHITECTURE.md'], ['build', 'ARCHITECTURE.md']]) {
    const r = run(args, dir);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /E_STORE_LEGACY[\s\S]*archlens migrate/);
  }
  assert.equal(run(['build', 'ARCHITECTURE.md', '--out-dir', 'out'], dir).status, 1);
  assert.ok(!existsSync(join(dir, 'out')), 'a refused build creates no output directory');
  assert.equal(run(['validate', 'ARCHITECTURE.md'], dir).status, 0);
  assert.equal(run(['views', 'ARCHITECTURE.md', '--json'], dir).status, 0);
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const p = run(['merge', 'ARCHITECTURE.md', 'd.json', '--plan', 'p.json'], dir);
  assert.equal(p.status, 0, p.stderr);
  const plan = JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8'));
  for (const it of plan.items) if (it.resolution == null) it.resolution = 'yes';
  writeFileSync(join(dir, 'p.json'), JSON.stringify(plan));
  const a = run(['merge', 'ARCHITECTURE.md', '--apply', 'p.json'], dir);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /E_STORE_LEGACY/);
  assert.ok(!existsSync(join(dir, 'architecture')));
  assert.equal(run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--out', 'p.html'], dir).status, 0);
});

test('merge --apply refuses a non-empty architecture/ folder without manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({ 'archlens-delta': '1.0', model: { elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'S' }] } }));
  run(['merge', 'ARCHITECTURE.md', 'delta.json', '--plan', 'p.json'], dir);
  mkdirSync(join(dir, 'architecture'));
  writeFileSync(join(dir, 'architecture', 'leia-me.txt'), 'x');
  const r = run(['merge', 'ARCHITECTURE.md', '--apply', 'p.json'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /E_STORE_NOT_BASE/);
  assert.ok(!existsSync(join(dir, 'architecture', 'archlens.json')));
});

test('render --delta draws the preview and leaves ARCHITECTURE.md untouched', () => {
  const dir = setup();
  const before = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  const files = snapshot(dir);
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--out', 'p.html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prévia de d\.json · \+1 ~0 −1 · relações \+0 ~0 −1, 1 decisão\(ões\) pendente\(s\)/);
  assert.match(readFileSync(join(dir, 'p.html'), 'utf8'), /PRÉVIA · não é a base oficial — d\.json/);
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), before);
  assert.deepEqual(snapshot(dir), files, 'the preview never touches architecture/');
});

test('build --delta writes <delta>-preview.html and never the knowledge base', () => {
  const dir = setup();
  const before = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['build', 'ARCHITECTURE.md', '--delta', 'd.json'], dir);
  assert.ok([0, 3].includes(r.status), r.stderr);
  assert.ok(existsSync(join(dir, 'architecture', 'diagrams', 'd-preview.html')));
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

test('without a base argument the base is found from the cwd; with none around, a clear error', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify(previewDelta));
  assert.equal(run(['views', '--json'], dir).status, 0);
  const empty = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(empty, 'd.json'), JSON.stringify(previewDelta));
  const r = run(['build', '--delta', 'd.json'], empty);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /E_STORE_NOT_FOUND/);
});

test('build writes ARCHITECTURE.md next to the folder and the HTML in architecture/diagrams', () => {
  const dir = setup();
  const r = run(['build', 'architecture'], dir);
  assert.ok([0, 3].includes(r.status), r.stderr);
  assert.ok(existsSync(join(dir, 'architecture', 'diagrams', 'architecture.html')));
  assert.match(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), /^source: architecture\/$/m);
});

test('a view the delta drops still renders in the preview, with the ghost, and is reported', () => {
  const dir = setup();
  writeFileSync(join(dir, 'd.json'), JSON.stringify({ 'archlens-delta': '1.0', ops: [{ op: 'remove', id: 'loja' }] }));
  const r = run(['render', 'ARCHITECTURE.md', '--delta', 'd.json', '--view', 'ctx', '--out', 'p.html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /visões afetadas pelo delta \(somem ou mudam no apply\): ctx/);
  assert.match(readFileSync(join(dir, 'p.html'), 'utf8'), /class="node c4 [^"]*ch-removed[^"]*" data-node="loja"/);
  const j = run(['resolve', 'ARCHITECTURE.md', '--delta', 'd.json', '--view', 'ctx'], dir);
  assert.equal(j.status, 0, j.stderr);
  assert.equal(JSON.parse(j.stdout).nodes.find(n => n.id === 'loja').change, 'removed');
  assert.match(j.stderr, /visões afetadas pelo delta \(somem ou mudam no apply\): ctx/);
  const v = run(['views', 'ARCHITECTURE.md', '--delta', 'd.json', '--json'], dir);
  assert.ok(JSON.parse(v.stdout).defined.some(x => x.key === 'ctx'));
  assert.match(v.stderr, /visões afetadas/);
});

test('migrate turns an old base into architecture/ with the same raw, notes from keep blocks, and a generated .md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop()));
  const r = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /git add architecture ARCHITECTURE\.md/);
  const back = loadFolder(join(dir, 'architecture'));
  assert.deepEqual(back.raw, shop());
  assert.equal(hashRaw(back.raw), hashRaw(shop()), 'plans made before the migration still apply');
  assert.deepEqual(back.notes, { notes: 'Nota antiga.' });
  const md = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  assert.doesNotMatch(md, /archlens-json/);
  assert.match(md, /Nota antiga\./);
  assert.equal(run(['check'], dir).status, 0);
  const again = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /já está no formato novo/);
});

test('a plan made before migrate applies after it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop()));
  writeFileSync(join(dir, 'd.json'), JSON.stringify({ 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'r' },
    model: { elements: [{ id: 'loja.worker', type: 'c4:container', name: 'Worker', parent: 'loja' }] } }));
  assert.equal(run(['merge', 'ARCHITECTURE.md', 'd.json', '--plan', 'p.json'], dir).status, 0);
  assert.equal(run(['migrate', 'ARCHITECTURE.md'], dir).status, 0);
  const a = run(['merge', 'ARCHITECTURE.md', '--apply', 'p.json'], dir);
  assert.equal(a.status, 0, a.stderr);
});

test('migrate refuses a destination that already holds a base and an invalid model, writing nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop()));
  saveFolder(join(dir, 'outra'), shop());
  const manifestOf = () => readFileSync(join(dir, 'outra', 'archlens.json'), 'utf8');
  const before = manifestOf();
  const r = run(['migrate', 'ARCHITECTURE.md', '--to', 'outra'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /E_STORE_EXISTS/);
  assert.equal(manifestOf(), before, 'the existing base is untouched');
  mkdirSync(join(dir, 'solta'));
  writeFileSync(join(dir, 'solta', 'leia-me.txt'), 'x');
  const old = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  const n = run(['migrate', 'ARCHITECTURE.md', '--to', 'solta'], dir);
  assert.equal(n.status, 1);
  assert.match(n.stderr, /E_STORE_NOT_BASE/);
  assert.equal(readFileSync(join(dir, 'solta', 'leia-me.txt'), 'utf8'), 'x');
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), old);
  const bad = shop();
  bad.model.relationships.push({ from: 'loja', to: 'nada' });
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(bad));
  const v = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(v.status, 2);
  assert.ok(!existsSync(join(dir, 'architecture')));
  assert.match(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), /archlens-json/, 'the old document stays');
});

test('check: 0 when the document is current, 1 when it was edited by hand or the model is invalid', () => {
  const dir = setup();
  assert.equal(run(['check'], dir).status, 0);
  const md = join(dir, 'ARCHITECTURE.md');
  writeFileSync(md, readFileSync(md, 'utf8').replace('# Loja Mini', '# Loja Mini editada'));
  const stale = run(['check', 'architecture'], dir);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /desatualizado[\s\S]*architecture\/notes/);
  const j = run(['check', '--json'], dir);
  assert.deepEqual(JSON.parse(j.stdout), { ok: false, errors: [], stale: true });
  run(['doc', 'architecture'], dir);
  const m = JSON.parse(readFileSync(join(dir, 'architecture', 'model.json'), 'utf8'));
  m.relationships.push({ from: 'loja', to: 'nada' });
  writeFileSync(join(dir, 'architecture', 'model.json'), JSON.stringify(m));
  assert.equal(run(['check'], dir).status, 1);
});

const PROSE = '# Nossa arquitetura\n\nTexto escrito à mão.\n';

test('a hand-written ARCHITECTURE.md is never overwritten: merge --apply, doc and build refuse, writing nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), PROSE);
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({ 'archlens-delta': '1.0', name: 'Nova', source: { kind: 'manual', ref: 'k' },
    model: { elements: [{ id: 'sis', type: 'c4:softwareSystem', name: 'Sistema' }] } }));
  const p = run(['merge', 'architecture/', 'delta.json', '--plan', 'p.json'], dir);
  assert.equal(p.status, 0, p.stderr);
  const a = run(['merge', 'architecture/', '--apply', 'p.json'], dir);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /E_STORE_DOC_FOREIGN[\s\S]*source:[\s\S]*--out/);
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), PROSE);
  assert.ok(!existsSync(join(dir, 'architecture', 'archlens.json')), 'the base is not written either');
  saveFolder(join(dir, 'architecture'), shop());
  for (const args of [['doc', 'architecture'], ['build', 'architecture']]) {
    const r = run(args, dir);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /E_STORE_DOC_FOREIGN/);
  }
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), PROSE);
  assert.ok(!existsSync(join(dir, 'architecture', 'diagrams')));
  const o = run(['doc', 'architecture', '--out', 'other.md'], dir);
  assert.equal(o.status, 0, o.stderr);
  assert.match(readFileSync(join(dir, 'other.md'), 'utf8'), /source: architecture\//);
});

test('migrate of a model .json refuses an unrelated ARCHITECTURE.md next to it, creating nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'm.json'), JSON.stringify(shop()));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), PROSE);
  const r = run(['migrate', 'm.json'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /E_STORE_DOC_FOREIGN/);
  assert.ok(!existsSync(join(dir, 'architecture')));
  assert.equal(readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8'), PROSE);
});

test('merge --apply on a split model writes the document from what is on disk (check passes right after)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const base = join(dir, 'architecture');
  mkdirSync(join(base, 'model'), { recursive: true });
  writeFileSync(join(base, 'archlens.json'), JSON.stringify({ archlens: '1.0', name: 'Split', layout: { model: 'model/' } }));
  writeFileSync(join(base, 'model', 'a.json'), JSON.stringify({ elements: [{ id: 'a', type: 'c4:softwareSystem', name: 'A' }], relationships: [] }));
  writeFileSync(join(base, 'model', 'b.json'), JSON.stringify({ elements: [{ id: 'b', type: 'c4:softwareSystem', name: 'B' }],
    relationships: [{ from: 'b', to: 'a', type: 'uses', description: 'b usa a' }] }));
  assert.equal(run(['doc', 'architecture'], dir).status, 0);
  writeFileSync(join(dir, 'delta.json'), JSON.stringify({ 'archlens-delta': '1.0', source: { kind: 'manual', ref: 'r' },
    model: { relationships: [{ from: 'a', to: 'b', type: 'uses', description: 'a usa b' }] } }));
  assert.equal(run(['merge', 'architecture', 'delta.json', '--plan', 'p.json'], dir).status, 0);
  const a = run(['merge', 'architecture', '--apply', 'p.json'], dir);
  assert.equal(a.status, 0, a.stderr);
  const c = run(['check', 'architecture'], dir);
  assert.equal(c.status, 0, c.stdout);
});

test('migrate drops a keep:assumptions block that is only an old copy of the list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const raw = { ...shop(), assumptions: ['Premissa um', 'Premissa dois'] };
  writeFileSync(join(dir, 'ARCHITECTURE.md'), ['---', `name: ${raw.name}`, '---', '',
    '<!-- keep:assumptions -->', '- Premissa um', '<!-- /keep:assumptions -->', '',
    '```archlens-json', JSON.stringify(raw, null, 2), '```', ''].join('\n'));
  const r = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(dir, 'architecture', 'notes', 'assumptions.md')));
  const md = readFileSync(join(dir, 'ARCHITECTURE.md'), 'utf8');
  assert.match(md, /- Premissa um\n- Premissa dois/);
});

test('migrate warns when a hand-written assumptions note replaces the manifest list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const raw = { ...shop(), assumptions: ['Premissa um'] };
  writeFileSync(join(dir, 'ARCHITECTURE.md'), ['---', `name: ${raw.name}`, '---', '',
    '<!-- keep:assumptions -->', 'Premissas discutidas na reunião de 12/03.', '<!-- /keep:assumptions -->', '',
    '```archlens-json', JSON.stringify(raw, null, 2), '```', ''].join('\n'));
  const r = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, 'architecture', 'notes', 'assumptions.md')));
  assert.match(r.stdout + r.stderr, /aviso: notes\/assumptions\.md substitui a lista de premissas do manifesto/);
});

test('check ignores line endings: a CRLF copy of the generated document is current', () => {
  const dir = setup();
  const md = join(dir, 'ARCHITECTURE.md');
  writeFileSync(md, readFileSync(md, 'utf8').replace(/\n/g, '\r\n'));
  const c = run(['check'], dir);
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

test('migrate into a non-empty architecture/ suggests --to', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  writeFileSync(join(dir, 'ARCHITECTURE.md'), legacyMd(shop()));
  mkdirSync(join(dir, 'architecture', 'adr'), { recursive: true });
  writeFileSync(join(dir, 'architecture', 'adr', '0001.md'), '# ADR 1\n');
  const r = run(['migrate', 'ARCHITECTURE.md'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /E_STORE_NOT_BASE[\s\S]*--to <pasta>/);
});

const repoCopy = name => {
  const dir = mkdtempSync(join(tmpdir(), `archlens-${name}-`));
  cpSync(fileURLToPath(new URL(`./fixtures/repos/${name}/`, import.meta.url)), dir, { recursive: true });
  const g = (...a) => sp('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'init.defaultBranch=main', ...a], { cwd: dir });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'init');
  return dir;
};

test('scan without --as prints the summary (text and pure --json) and writes the inventory with --out', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const r = run(['scan', repo, '--base', 'architecture', '--out', 'inv.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /papel sugerido: service/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'inv.json'), 'utf8'))['archlens-inventory'], '1.0');
  const j = run(['scan', repo, '--base', 'architecture', '--json'], dir);
  assert.equal(JSON.parse(j.stdout).role.suggested, 'service');
});

test('scan --delta needs a role and a system; a target of the wrong kind is refused; nothing is written on error', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const noRole = run(['scan', repo, '--base', 'architecture', '--delta', 'd.json'], dir);
  assert.equal(noRole.status, 1);
  assert.match(noRole.stderr, /E_SCAN_ROLE/);
  const noSys = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--delta', 'd.json'], dir);
  assert.match(noSys.stderr, /E_SCAN_ROLE/);
  const badSys = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja.api', '--delta', 'd.json'], dir);
  assert.equal(badSys.status, 1);
  assert.match(badSys.stderr, /E_SCAN_TARGET/);
  assert.ok(!existsSync(join(dir, 'd.json')));
});

test('scan --system naming a system not in the base: the delta creates it, with a note', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const r = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'nada', '--delta', 'd.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /o sistema nada não existe na base e será criado pelo delta/);
  const d = JSON.parse(readFileSync(join(dir, 'd.json'), 'utf8'));
  assert.deepEqual(d.model.elements.find(e => e.id === 'nada')?.type, 'c4:softwareSystem');
});

test('scan --base pointing at a base not created yet: new-base warning, delta written, base untouched', () => {
  const repo = repoCopy('pedidos');
  const dir = mkdtempSync(join(tmpdir(), 'archlens-'));
  const r = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja', '--delta', 'd.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /nenhuma base encontrada/);
  assert.ok(existsSync(join(dir, 'd.json')));
  assert.ok(!existsSync(join(dir, 'architecture')), 'scan never writes the base');
  mkdirSync(join(dir, 'outra'));
  writeFileSync(join(dir, 'outra', 'x.txt'), 'x');
  const bad = run(['scan', repo, '--base', 'outra', '--as', 'service', '--system', 'loja', '--delta', 'd2.json'], dir);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /E_STORE_NOT_BASE/);
});

test('scan → merge → apply on a base; reading the same commit again changes nothing', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const s = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja', '--delta', 'd.json'], dir);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(run(['merge', 'architecture', 'd.json', '--plan', 'p.json'], dir).status, 0);
  const plan = JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8'));
  for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'possible-duplicate' ? 'different' : 'take';
  writeFileSync(join(dir, 'p.json'), JSON.stringify(plan));
  assert.equal(run(['merge', 'architecture', '--apply', 'p.json'], dir).status, 0);
  assert.equal(run(['check'], dir).status, 0);
  run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja', '--delta', 'd2.json'], dir);
  const again = run(['merge', 'architecture', 'd2.json', '--plan', 'p2.json', '--json'], dir);
  assert.deepEqual(Object.keys(JSON.parse(again.stdout).summary), ['unchanged']);
});

test('scan reads a git url (file://) and --from reuses an inventory; no base found → warning', () => {
  const repo = repoCopy('pedidos');
  const empty = mkdtempSync(join(tmpdir(), 'archlens-'));
  const r = run(['scan', `file://${repo}`, '--out', 'inv.json', '--as', 'service', '--system', 'loja', '--delta', 'd.json'], empty);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /nenhuma base encontrada/);
  const d = JSON.parse(readFileSync(join(empty, 'd.json'), 'utf8'));
  assert.equal(d.source.ref.startsWith(`file://${repo}@`), true);
  const again = run(['scan', '--from', 'inv.json', '--as', 'service', '--system', 'loja', '--delta', 'd2.json'], empty);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(empty, 'd2.json'), 'utf8')), d);
  const bad = run(['scan', '/nao/existe'], empty);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /E_SCAN_SOURCE/);
});

test('re-reading at a new commit with no fact changes: only the new commit stays in the repo provenance (item 5)', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const g = (...a) => sp('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' });
  const read = (n) => {
    assert.equal(run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja', '--delta', `d${n}.json`], dir).status, 0);
    assert.equal(run(['merge', 'architecture', `d${n}.json`, '--plan', `p${n}.json`], dir).status, 0);
    const plan = JSON.parse(readFileSync(join(dir, `p${n}.json`), 'utf8'));
    for (const it of plan.items) if ('resolution' in it && it.resolution == null) it.resolution = it.class === 'possible-duplicate' ? 'different' : 'take';
    writeFileSync(join(dir, `p${n}.json`), JSON.stringify(plan));
    const r = run(['merge', 'architecture', '--apply', `p${n}.json`], dir);
    assert.equal(r.status, 0, r.stderr);
  };
  read(1);
  writeFileSync(join(repo, 'README.md'), 'nada de arquitetura\n');
  g('add', '-A'); g('commit', '-qm', 'readme');
  const head = g('rev-parse', 'HEAD').stdout.trim().slice(0, 7);
  read(2);
  const refs = [];
  const walk = list => list.forEach(e => { for (const s of e.sources ?? []) if (s.kind === 'repo') refs.push(s.ref); walk(e.children ?? []); });
  const m = model(dir);
  walk(m.elements);
  for (const r of m.relationships) for (const s of r.sources ?? []) if (s.kind === 'repo') refs.push(s.ref);
  assert.ok(refs.length > 5);
  assert.deepEqual([...new Set(refs.map(r => r.slice(r.lastIndexOf('@') + 1)))], [head]);
});
