import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';
import { generateDoc } from '../scripts/lib/doc.mjs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';

for (const ex of ['loja-online', 'telemedicina', 'repos', 'loja-online-vault']) {
  test(`example ${ex}: the folder is valid, every view resolves and ARCHITECTURE.md is current`, () => {
    const dir = fileURLToPath(new URL(`../examples/${ex}/`, import.meta.url));
    const store = openStore(resolveBase('ARCHITECTURE.md', { cwd: dir }));
    assert.equal(store.kind, ex.endsWith('-vault') ? 'markdown' : 'json');
    const { raw, notes } = store.read();
    assert.deepEqual(validateModel(raw).errors, []);
    const model = normalizeModel(raw);
    for (const v of model.views) assert.ok(resolveView(model, v).nodes.length, v.key);
    assert.equal(readFileSync(store.locator.docPath, 'utf8'), generateDoc(raw, { notes, source: 'architecture/' }));
  });
}

test('telemedicina plano-02-final is current', () => {
  const src = fileURLToPath(new URL('../examples/telemedicina/', import.meta.url));
  const cli = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
  const tmp = mkdtempSync(join(tmpdir(), 'archlens-ex-'));
  try {
    cpSync(src, tmp, { recursive: true });
    const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: tmp, encoding: 'utf8' });
    // dates come from "today": drop them (created, and date fields inside ops/entry) before comparing
    const strip = v => JSON.parse(JSON.stringify(v, (k, x) => (k === 'created' || k === 'date' || k === 'at' || (k === 'id' && /^\d{4}-\d\d-\d\d-\d+$/.test(x)) ? undefined : x)));
    const before = run('show', 'architecture', 'plano-02-final.json');
    run('plan', 'architecture', '--answers', 'plano-02-final.json', '--out', 'x.json');
    assert.deepEqual(strip(JSON.parse(readFileSync(join(tmp, 'x.json'), 'utf8'))),
      strip(JSON.parse(readFileSync(join(src, 'plano-02-final.json'), 'utf8'))));
    assert.equal(before, readFileSync(join(src, 'plano-02-final.md'), 'utf8'));
    run('show', 'architecture', 'plano-02-final.json', '--out', 'y.md');
    assert.equal(readFileSync(join(tmp, 'y.md'), 'utf8'), readFileSync(join(src, 'plano-02-final.md'), 'utf8'));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
