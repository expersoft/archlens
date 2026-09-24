import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateDoc, extractModel } from '../scripts/lib/doc.mjs';

const raw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));

test('generateDoc embeds the canonical model and round-trips through extractModel', () => {
  const md = generateDoc(raw());
  assert.match(md, /```archlens-json/);
  assert.match(md, /Venda Online/);
  assert.match(md, /## Camada de Negócio/);
  assert.match(md, /## Rastreabilidade/);
  assert.deepEqual(extractModel(md), raw());
});

test('generateDoc preserves keep blocks from an existing document', () => {
  const first = generateDoc(raw());
  const edited = first.replace(/<!-- keep:overview -->[\s\S]*?<!-- \/keep:overview -->/,
    '<!-- keep:overview -->\nTexto escrito à mão.\n<!-- /keep:overview -->');
  const again = generateDoc(raw(), { existing: edited });
  assert.match(again, /Texto escrito à mão\./);
});

test('extractModel fails clearly when the block is missing', () => {
  assert.throws(() => extractModel('# nada'), /E_NO_MODEL_BLOCK/);
});


test('published JSON schemas match the registry', async () => {
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  const fresh = buildSchemas();
  for (const name of ['model', 'view']) {
    const onDisk = JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url)));
    assert.deepEqual(onDisk, fresh[name], `schemas/${name}.schema.json is stale: run node scripts/gen-schemas.mjs`);
  }
});
