import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateDoc, extractModel } from '../scripts/lib/doc.mjs';

const raw = () => JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));

test('generateDoc is a readable document only: no model block, no keep markers, no generation date', () => {
  const md = generateDoc(raw());
  assert.doesNotMatch(md, /```archlens-json/);
  assert.doesNotMatch(md, /<!-- keep:/);
  assert.doesNotMatch(md, /^generated:/m);
  assert.match(md, /^source: architecture\/$/m);
  assert.match(md, /Gerado por archlens a partir de `architecture\/`\. Não edite: escreva em `architecture\/notes\/\*\.md` e evolua a base com `archlens merge`\./);
  assert.match(md, /Venda Online/);
  assert.match(md, /## Camada de Negócio/);
  assert.match(md, /## Rastreabilidade/);
  assert.match(md, /## Modelo canônico[\s\S]*archlens\.json/);
  assert.equal(generateDoc(raw()), md, 'deterministic');
});

test('generateDoc puts the notes in their sections, with defaults when missing', () => {
  const md = generateDoc({ ...raw(), assumptions: ['p1'] }, { notes: { overview: 'Visão à mão.', notes: 'Risco X.' }, source: '../kb/' });
  assert.match(md, /## Visão geral\n\nVisão à mão\.\n/);
  assert.match(md, /## Premissas e inferências\n\n- p1\n/);
  assert.match(md, /## Notas\n\nRisco X\.\n/);
  assert.match(md, /^source: \.\.\/kb\/$/m);
  const bare = generateDoc(raw());
  assert.match(bare, /## Notas\n\n_Decisões, riscos e pendências\._/);
  assert.match(bare, /## Visão geral\n\n_Descreva aqui/);
});

test('generateDoc shows lifecycle, sources and history', () => {
  const r = raw();
  const api = r.model.elements.find(e => e.id === 'loja').children.find(c => c.id === 'loja.api');
  Object.assign(api, { status: 'deprecated', statusReason: 'migração para Kotlin', sources: [{ kind: 'repo', ref: 'github.com/x/orders@a1b2c3d', date: '2026-10-02' }] });
  r.changelog = [{ id: '2026-10-02-01', date: '2026-10-02', source: { kind: 'repo', ref: 'github.com/x/orders@a1b2c3d' }, summary: 'Leitura do repo orders',
    added: ['loja.worker'], changed: ['loja.api'], status: { 'loja.api': 'deprecated' }, removed: [], decisions: ['conflito loja.api.technology: take "Kotlin"'] }];
  const md = generateDoc(r);
  assert.match(md, /^revision: 1$/m);
  assert.match(md, /^updated: 2026-10-02$/m);
  assert.match(md, /## Ciclo de vida[\s\S]*API[\s\S]*deprecated[\s\S]*migração para Kotlin/);
  assert.match(md, /## Fontes[\s\S]*\| repo \| github\.com\/x\/orders@a1b2c3d \| 2026-10-02 \| 1 \|/);
  assert.match(md, /## Histórico[\s\S]*2026-10-02[\s\S]*Leitura do repo orders/);
  assert.match(md, /\| Status \|/);
  assert.match(md, /\| Fontes \|/);
});

test('generateDoc without lifecycle data keeps the old tables and has no updated date', () => {
  const md = generateDoc(raw());
  assert.doesNotMatch(md, /\| Status \|/);
  assert.doesNotMatch(md, /\| Fontes \|/);
  assert.match(md, /^revision: 0$/m);
  assert.doesNotMatch(md, /^updated:/m);
  assert.match(md, /_Todos os elementos e relações estão ativos\._/);
  assert.match(md, /_Nenhuma rodada de merge registrada\._/);
});

test('extractModel fails clearly when the block is missing', () => {
  assert.throws(() => extractModel('# nada'), /E_NO_MODEL_BLOCK/);
});


test('published JSON schemas match the registry', async () => {
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  const fresh = buildSchemas();
  for (const name of ['model', 'view', 'delta', 'plan']) {
    const onDisk = JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url)));
    assert.deepEqual(onDisk, fresh[name], `schemas/${name}.schema.json is stale: run node scripts/gen-schemas.mjs`);
  }
});

test('schemas describe the new fields', async () => {
  const { buildSchemas } = await import('../scripts/gen-schemas.mjs');
  const s = buildSchemas();
  assert.deepEqual(s.model.$defs.element.properties.status.enum, ['draft', 'planned', 'active', 'deprecated', 'retired']);
  assert.ok(s.model.$defs.source.properties.kind.enum.includes('repo'));
  assert.ok(s.model.properties.changelog);
  assert.ok(s.view.properties.status);
  assert.deepEqual(s.delta.$defs.element.required, ['id']);
  assert.equal(s.plan.properties['archlens-plan'].const, '1.0');
});

test('generateDoc lists the groupings and their direct members by layer', () => {
  const md = generateDoc(JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url))));
  assert.match(md, /## Contexto e atores[\s\S]*## Agrupamentos[\s\S]*### Plataforma de Autorização/);
  assert.match(md, /### Plataforma de Autorização\n\n`plat-aut`\n\nAutoriza e tokeniza transações\n\n\| Camada \| Membros \|/);
  assert.match(md, /\| Aplicação \| Autorizador, Tokenização \|/);
  assert.doesNotMatch(md.slice(md.indexOf('## Agrupamentos'), md.indexOf('## Modelo C4')), /API de Autorização/, 'inherited members are not repeated');
  assert.doesNotMatch(generateDoc(raw()), /## Agrupamentos/);
});

test('generateDoc: groupings stay out of the layer tables and counts, and each group shows its id (and status)', () => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  r.model.elements.find(e => e.id === 'plat-cred').status = 'draft';
  const md = generateDoc(r);
  assert.doesNotMatch(md, /## Camada de Outros/);
  assert.doesNotMatch(md.slice(md.indexOf('## Resumo'), md.indexOf('## Contexto e atores')), /Outros/);
  assert.match(md, /### Plataforma de Autorização\n\n`plat-aut`\n\nAutoriza/);
  assert.match(md, /### Plataforma de Crédito\n\n`plat-cred` · status: draft\n/);
});
