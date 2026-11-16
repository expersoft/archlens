import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hideMachinePaths } from './redact.mjs';

test('hideMachinePaths: caminho absoluto vira só o nome do arquivo', () => {
  assert.equal(hideMachinePaths('E_STORE_JSON: /srv/bases/loja/architecture/model.json: JSON inválido na linha 3'), 'E_STORE_JSON: model.json: JSON inválido na linha 3');
  assert.equal(hideMachinePaths(`ENOENT: no such file or directory, open '${join(tmpdir(), 'x', 'notes', 'overview.md')}'`), "ENOENT: no such file or directory, open 'overview.md'");
  assert.equal(hideMachinePaths('não li C:\\Users\\ana\\bases\\loja\\model.json agora'), 'não li model.json agora');
  assert.equal(hideMachinePaths('pasta /home/ana/bases/ sem base'), 'pasta bases sem base');
});

test('hideMachinePaths: URLs, caminhos relativos e ids de elemento ficam como estão', () => {
  for (const s of ['não foi possível clonar https://github.com/acme/loja.git: fatal', 'arquivo não encontrado: src/app/main.ts', 'elemento loja.pedidos / loja.db',
    'git@github.com:acme/loja.git', 'razão 3/4 e data 01/02/2026', 'visão "containers" (c4/container)']) {
    assert.equal(hideMachinePaths(s), s);
  }
});
