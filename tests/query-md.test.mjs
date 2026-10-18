import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { query } from '../scripts/lib/api.mjs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { viewAnswer, formatViewAnswer, elementCard } from '../scripts/lib/query-md.mjs';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';
import { matchSnapshot, memStore } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const BASE = fileURLToPath(new URL('../examples/loja-online/architecture', import.meta.url));
const open = () => openStore(resolveBase(BASE, { cwd: BASE }));
const model = () => normalizeModel(open().read().raw);
const run = args => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('container view matches the snapshot', () => {
  const md = query(open(), { spec: { notation: 'c4', level: 'container', scope: 'loja' } });
  matchSnapshot(md, 'query-container.md');
});

test('product-support view matches the snapshot', () => {
  matchSnapshot(query(open(), { view: 'suporte-venda-online' }), 'query-product-support.md');
});

test('impact view renders the matrix as a markdown table', () => {
  const md = query(open(), { view: 'impacto-api-pedidos' });
  matchSnapshot(md, 'query-impact.md');
  assert.match(md, /^## Matriz de dependência/m);
  assert.match(md, /\| Elemento \| Tipo \| Camada \| Relação \| Dist\. \| Caminho \|/);
});

test('sections follow layers for ArchiMate and levels for C4', () => {
  const arch = viewAnswer(model(), { key: 'x', notation: 'archimate', viewpoint: 'layered', anchor: 'loja.pedidos' });
  assert.deepEqual(arch.sections.map(s => s.label), ['Negócio', 'Aplicação', 'Tecnologia'].filter(l => arch.sections.some(s => s.label === l)));
  assert.ok(arch.sections.length >= 2);
  const c4 = viewAnswer(model(), { key: 'c', notation: 'c4', level: 'container', scope: 'loja' });
  assert.deepEqual(c4.sections.map(s => s.label), ['Pessoas', 'Sistemas de software', 'Contêineres']);
  assert.deepEqual(Object.keys(c4.sections[0].rows[0]), ['id', 'name', 'type', 'kind', 'status', 'technology']);
});

test('a view with more than 40 nodes ends with a note to cut it', () => {
  const answer = viewAnswer(model(), { key: 'tudo', notation: 'archimate', viewpoint: 'layered' });
  assert.ok(answer.sections.flatMap(s => s.rows).length > 40);
  assert.match(answer.notes[0], /mais de 40 nós.*focus|recort/i);
  assert.match(formatViewAnswer(answer).trimEnd().split('\n').pop(), /recort/i);
});

test('markdown table cells escape the pipe', () => {
  const answer = { title: 'T', spec: {}, sections: [{ label: 'S', rows: [{ id: 'a', name: 'A | B', type: 't', kind: null, status: 'active', technology: 'x|y' }] }], edges: [], notes: [] };
  assert.match(formatViewAnswer(answer), /\| A \\\| B \| t \| active \| x\\\|y \|/);
});

test('an unknown view key fails with the message selectSpecs uses today', () => {
  assert.throws(() => query(open(), { view: 'nao-existe' }), e => e.code === 'E_QUERY_VIEW' && e.message === 'E_QUERY_VIEW: visão "nao-existe" não existe (veja "archlens views")');
  assert.throws(() => query(open(), {}), e => e.code === 'E_QUERY_INPUT');
  const r = run(['query', BASE, '--view', 'nao-existe']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /visão "nao-existe" não existe/);
});

test('query --view prints markdown by default, --format json gives the structure, and the base is untouched', () => {
  const before = open().version();
  const r = run(['query', BASE, '--view', 'containers']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, query(open(), { view: 'containers' }));
  const j = run(['query', BASE, '--view', 'containers', '--format', 'json']);
  const data = JSON.parse(j.stdout);
  assert.ok(data.edges.length && data.edges[0].sentence);
  const out = join(mkdtempSync(join(tmpdir(), 'archlens-')), 'r.md');
  assert.equal(run(['query', BASE, '--view', 'containers', '--out', out]).status, 0);
  assert.equal(readFileSync(out, 'utf8'), r.stdout);
  assert.equal(open().version(), before);
});

const ID = 'loja.pedidos';
const lojaMem = (changelog) => { const raw = open().read().raw; if (changelog) raw.changelog = changelog; return memStore(raw); };

test('the card of a container matches the snapshot', () => {
  matchSnapshot(query(open(), { element: ID, depth: 1 }), 'query-element-pedidos.md');
});

test('the card reads through readSubgraph, not read', () => {
  const store = lojaMem();
  query(store, { element: ID });
  assert.ok(store.calls.includes('readSubgraph'));
  assert.ok(!store.calls.includes('read'));
});

test('depth 2 adds an Em volta section with the second ring', () => {
  assert.doesNotMatch(query(lojaMem(), { element: ID, depth: 1 }), /^## Em volta/m);
  const card = query(lojaMem(), { element: ID, depth: 2, format: 'json' });
  assert.ok(card.around.length > 0);
  assert.match(query(lojaMem(), { element: ID, depth: 2 }), /^## Em volta/m);
});

test('rounds list only changelog entries that cite the id', () => {
  const e = (id, extra) => ({ id, date: '2026-10-0' + id.slice(-1), summary: 's' + id, added: [], changed: [], removed: [], status: {}, decisions: [], ...extra });
  const card = query(lojaMem([
    e('r1', { added: [ID] }), e('r2', { changed: [ID] }), e('r3', { removed: [ID] }), e('r4', { status: { [ID]: 'deprecated' } }),
    e('r5', { decisions: [`duplicata descartada: ${ID} ≠ x`] }), e('r6', { added: ['outro'], decisions: [`${ID}.repo`] }),
  ]), { element: ID, format: 'json' });
  assert.deepEqual(card.rounds.map(r => r.id), ['r1', 'r2', 'r3', 'r4', 'r5']);
});

test('an unknown id suggests similar names', () => {
  assert.throws(() => query(lojaMem(), { element: 'loja.pedido' }),
    e => e.code === 'E_UNKNOWN_REF' && e.suggestions.some(s => s.id === ID) && e.message.includes(ID));
  assert.throws(() => query(lojaMem(), { element: 'zzz' }), e => e.code === 'E_UNKNOWN_REF' && e.suggestions.length === 0);
});

test('elementCard groups relationships by type and direction', () => {
  const card = query(open(), { element: ID, format: 'json' });
  assert.equal(card.element.id, ID);
  assert.equal(card.parent.id, 'loja');
  assert.ok(card.children.length >= 4);
  assert.ok(card.outgoing.serving && card.incoming.serving && card.incoming.realization);
  assert.ok(card.outgoing.serving[0].sentence);
  assert.equal(typeof elementCard, 'function');
});

test('query --element --via passes the types as a list', () => {
  const r = run(['query', BASE, '--element', ID, '--via', 'serving', '--format', 'json']);
  assert.equal(r.status, 0, r.stderr);
  const card = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(card.outgoing), ['serving']);
  assert.deepEqual(Object.keys(card.incoming), ['serving']);
  const md = run(['query', BASE, '--element', ID, '--depth', '2']);
  assert.match(md.stdout, /^# API de Pedidos/m);
  const bad = run(['query', BASE, '--element', 'nada']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /não existe na base/);
});

test('every query input error exits with 1', () => {
  assert.equal(run(['query', BASE]).status, 1);
  assert.equal(run(['query', BASE, '--view', 'x', '--format', 'xml']).status, 1);
  assert.equal(run(['query', BASE, '--element', 'nao.existe']).status, 1);
  assert.equal(run(['query', BASE, '--view', 'nao-existe']).stderr.includes('E_QUERY_VIEW: visão'), true);
});

test('query --element needs a depth that is an integer of 1 or more', () => {
  for (const d of ['0', '-1', '1.5', 'x']) {
    const r = run(['query', BASE, '--element', 'loja', '--depth', d]);
    assert.equal(r.status, 1, `depth ${d}`);
    assert.match(r.stderr, /--depth/);
  }
  assert.equal(run(['query', BASE, '--element', 'loja', '--depth', '2']).status, 0);
});
