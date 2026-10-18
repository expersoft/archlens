import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plan, answersOf, show } from '../scripts/lib/api.mjs';
import { resolveBase, openStore } from '../scripts/lib/store/index.mjs';
import { saveFolder } from '../scripts/lib/store/folder.mjs';
import { asBase, memStore } from './helpers.mjs';

const TODAY = { today: '2026-10-01' };
const CLI = fileURLToPath(new URL('../scripts/archlens.mjs', import.meta.url));
const dir = fileURLToPath(new URL('../examples/telemedicina/', import.meta.url));
const tele = () => openStore(resolveBase('ARCHITECTURE.md', { cwd: dir })).read().raw;
const delta02 = () => JSON.parse(readFileSync(new URL('../examples/telemedicina/delta-02.json', import.meta.url)));
const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));

/** Compares `text` with tests/fixtures/<name>; UPDATE_SNAPSHOTS=1 (or a missing file) writes it instead. */
function snapshot(name, text) {
  const file = new URL(`./fixtures/${name}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(file)) { writeFileSync(file, text); return; }
  assert.equal(text, readFileSync(file, 'utf8'));
}

const fill = (p, byN) => { for (const it of p.items) if (it.n in byN && 'resolution' in it) it.resolution = byN[it.n]; return p; };
/** Telemedicina delta-02, answered in rounds like the skill does: 3 take, 5 same → re-plan → 6 keep, 12 yes. */
function telePlans() {
  const mem = memStore(tele());
  const d = delta02();
  const open = plan(mem, d, TODAY).plan;
  const second = plan(mem, d, { ...TODAY, answers: answersOf(fill(structuredClone(open), { 3: 'take', 5: 'same' })).answers }).plan;
  const final = plan(mem, d, { ...TODAY, answers: answersOf(fill(structuredClone(second), { 6: 'keep', 12: 'yes' })).answers }).plan;
  assert.equal(final.state, 'final');
  return { mem, open, second, final };
}
const removalPlan = () => {
  const mem = memStore(shop());
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'limpeza', date: '2026-10-01' }, summary: 'Remove a API e liga o cliente ao gateway',
    model: { elements: [], relationships: [{ from: 'cliente', to: 'pagamentos', type: 'uses', description: 'Paga direto' }] },
    ops: [{ op: 'remove', id: 'loja.api' }] };
  const open = plan(mem, d, TODAY).plan;
  const p = plan(mem, d, { ...TODAY, answers: answersOf(fill(open, Object.fromEntries(open.items.filter(i => i.op === 'remove').map(i => [i.n, 'yes'])))).answers }).plan;
  assert.equal(p.state, 'final');
  return { mem, p };
};

test('the final telemedicina delta-02 report matches the snapshot', () => {
  const { mem, final } = telePlans();
  snapshot('show-telemedicina-final.md', show(mem, final));
});

test('the open telemedicina delta-02 report lists pending decisions with their options', () => {
  const { mem, second } = telePlans();
  const md = show(mem, second);
  assert.match(md, /## Decisões pendentes/);
  assert.match(md, /→ keep \| take/);
  assert.match(md, /\*\*aberto\*\*/);
  snapshot('show-telemedicina-open.md', md);
  const { open } = telePlans();
  assert.match(show(mem, open), /→ same \| different/);
});

test('a report with removals and relationships matches the snapshot', () => {
  const { mem, p } = removalPlan();
  const md = show(mem, p);
  assert.match(md, /## Removidos/);
  assert.match(md, /## Relações/);
  snapshot('show-removal.md', md);
});

test('header and totals', () => {
  const { mem, final } = telePlans();
  const lines = show(mem, final).split('\n');
  assert.equal(lines[0], `# Plano: ${final.delta.summary}`);
  assert.match(lines[2], /^Base `architecture` .* \*\*final\*\*$/);
  assert.match(lines[4], /^\*\*\+\d+ elementos · ~\d+ alterados · −\d+ removido\(s\) · relações \+\d+ −\d+\*\*$/);
  const open = telePlans().open;
  assert.match(show(mem, open).split('\n')[2], /\*\*aberto\*\*$/);
});

test('changed lines show old → new per field, aliases as + additions', () => {
  const { mem, final } = telePlans();
  assert.match(show(mem, final), /- \*\*Worker de Notificações\*\* \(`tele.notificador`\): technology `[^`]+` → `Node.js 22`/);
  const base = tele();
  base.model.elements.find(e => e.id === 'tele').aliases = ['plataforma'];
  const m = memStore(base);
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'x', date: '2026-10-01' }, summary: 's',
    model: { elements: [{ id: 'tele', type: 'application-component', aliases: ['teleconsulta'] }], relationships: [] } };
  assert.match(show(m, plan(m, d, TODAY).plan), /aliases \+ `teleconsulta`/);
});

test('empty sections are omitted', () => {
  const m = memStore(shop());
  const d = { 'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'x', date: '2026-10-01' }, summary: 'só um',
    model: { elements: [{ id: 'loja.cache', type: 'c4:container', name: 'Cache', parent: 'loja' }], relationships: [] } };
  const md = show(m, plan(m, d, TODAY).plan);
  assert.match(md, /## Novos/);
  for (const s of ['Decisões pendentes', 'Decisões', 'Alterados', 'Removidos', 'Relações', 'Visões']) assert.ok(!md.includes(`## ${s}`), s);
});

test('a changed base is flagged in the first line', () => {
  const { final } = telePlans();
  const moved = tele();
  moved.model.elements.push({ id: 'zz', type: 'application-component', name: 'Zz' });
  const md = show(memStore(moved), final);
  assert.match(md.split('\n')[0], /^> Atenção: a base mudou/);
  assert.ok(!/^> Atenção/.test(show(telePlans().mem, final)));
});

test('json format returns the structured data', () => {
  const { mem, final } = telePlans();
  const data = show(mem, final, { format: 'json' });
  assert.equal(data.state, 'final');
  assert.equal(data.stale, false);
  assert.equal(data.title, final.delta.summary);
  assert.deepEqual(data.added.map(e => e.id), [...data.added.map(e => e.id)].sort());
  assert.ok(data.decisions.length && data.relationships.length);
  JSON.parse(JSON.stringify(data));
});

test('CLI: show prints markdown, --out writes it and --json gives valid JSON', () => {
  const { mem, p } = removalPlan();
  const tmp = mkdtempSync(join(tmpdir(), 'archlens-show-'));
  saveFolder(join(tmp, 'architecture'), shop(), { notes: {} });
  writeFileSync(join(tmp, 'p.json'), JSON.stringify(p));
  const run = args => spawnSync(process.execPath, [CLI, ...args], { cwd: tmp, encoding: 'utf8' });
  const md = run(['show', 'architecture', 'p.json']);
  assert.equal(md.status, 0, md.stderr);
  assert.equal(md.stdout, show(mem, p));
  const out = run(['show', 'architecture', 'p.json', '--out', 'f.md']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(tmp, 'f.md'), 'utf8'), md.stdout);
  const js = run(['show', 'architecture', 'p.json', '--json']);
  assert.equal(JSON.parse(js.stdout).state, 'final');
  assert.match(run(['show', 'architecture']).stderr, /uso: archlens show/);
});
