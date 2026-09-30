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

test('generateDoc shows lifecycle, sources and history', () => {
  const r = raw();
  const api = r.model.elements.find(e => e.id === 'loja').children.find(c => c.id === 'loja.api');
  Object.assign(api, { status: 'deprecated', statusReason: 'migração para Kotlin', sources: [{ kind: 'repo', ref: 'github.com/x/orders@a1b2c3d', date: '2026-10-02' }] });
  r.changelog = [{ id: '2026-10-02-01', date: '2026-10-02', source: { kind: 'repo', ref: 'github.com/x/orders@a1b2c3d' }, summary: 'Leitura do repo orders',
    added: ['loja.worker'], changed: ['loja.api'], status: { 'loja.api': 'deprecated' }, removed: [], decisions: ['conflito loja.api.technology: take "Kotlin"'] }];
  const md = generateDoc(r, { date: '2026-10-03' });
  assert.match(md, /^revision: 1$/m);
  assert.match(md, /^updated: 2026-10-02$/m);
  assert.match(md, /archlens merge/);
  assert.match(md, /## Ciclo de vida[\s\S]*API[\s\S]*deprecated[\s\S]*migração para Kotlin/);
  assert.match(md, /## Fontes[\s\S]*\| repo \| github\.com\/x\/orders@a1b2c3d \| 2026-10-02 \| 1 \|/);
  assert.match(md, /## Histórico[\s\S]*2026-10-02[\s\S]*Leitura do repo orders/);
  assert.match(md, /\| Status \|/);
  assert.match(md, /\| Fontes \|/);
  assert.deepEqual(extractModel(md), r);
});

test('generateDoc without lifecycle data keeps the old tables', () => {
  const md = generateDoc(raw(), { date: '2026-10-03' });
  assert.doesNotMatch(md, /\| Status \|/);
  assert.doesNotMatch(md, /\| Fontes \|/);
  assert.match(md, /^revision: 0$/m);
  assert.match(md, /^updated: 2026-10-03$/m);
  assert.match(md, /_Todos os elementos e relações estão ativos\._/);
  assert.match(md, /_Nenhuma rodada de merge registrada\._/);
});
