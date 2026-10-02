import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';
import { generateDoc } from '../scripts/lib/doc.mjs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';

for (const ex of ['loja-online', 'telemedicina']) {
  test(`example ${ex}: the folder is valid, every view resolves and ARCHITECTURE.md is current`, () => {
    const dir = fileURLToPath(new URL(`../examples/${ex}/`, import.meta.url));
    const store = openStore(resolveBase('ARCHITECTURE.md', { cwd: dir }));
    assert.equal(store.kind, 'folder');
    const { raw, notes } = store.load();
    assert.deepEqual(validateModel(raw).errors, []);
    const model = normalizeModel(raw);
    for (const v of model.views) assert.ok(resolveView(model, v).nodes.length, v.key);
    assert.equal(readFileSync(store.locator.docPath, 'utf8'), generateDoc(raw, { notes, source: 'architecture/' }));
  });
}
