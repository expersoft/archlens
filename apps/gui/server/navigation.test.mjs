import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { renderSpec, createViewCache } from './views.mjs';
import { actionsFor, flipSpec, titleFor } from './navigation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ex = n => join(root, 'examples', n, 'architecture');
const reg = createBaseRegistry({ port: 1, bases: [
  { id: 'loja', path: ex('loja-online') }, { id: 'tele', path: ex('telemedicina') }] }, { pollMs: 100000 });
const loja = reg.get('loja');
const tele = reg.get('tele');
test.after(() => reg.close());

const flat = acts => acts.flatMap(a => [a, ...(a.sub ? flat(a.sub) : [])]);

test('softwareSystem: Abrir containers primeiro, com Contexto (C4)', () => {
  const acts = actionsFor(loja, 'loja');
  assert.equal(acts[0].label, 'Abrir containers');
  assert.equal(acts[0].primary, true);
  assert.equal(acts[0].spec.level, 'container');
  assert.ok(acts.some(a => a.label === 'Contexto (C4)'));
  assert.ok(acts.some(a => a.label === 'Matriz de dependência' && a.matrix));
});

test('Quem depende: Todos (n) e sem tipos de motivação', () => {
  const acts = actionsFor(tele, 'tele.api');
  const dep = acts.find(a => a.label.startsWith('Quem depende'));
  assert.ok(dep, 'esperava Quem depende');
  assert.match(dep.sub[0].label, /^Todos \(/);
  for (const s of dep.sub.slice(1)) {
    assert.ok(!['goal', 'requirement', 'principle'].includes(s.spec.types?.[0]));
  }
  assert.equal(actionsFor(tele, 'nao-existe').length, 0);
});

test('flipSpec e titleFor', () => {
  assert.deepEqual(flipSpec(loja, { notation: 'archimate', anchor: 'loja.pedidos', viewpoint: 'layered' }),
    { notation: 'c4', level: 'container', scope: 'loja', focus: ['loja.pedidos'], depth: 1 });
  assert.deepEqual(flipSpec(loja, { notation: 'archimate', viewpoint: 'application' }), { notation: 'c4', level: 'landscape' });
  assert.deepEqual(flipSpec(loja, { notation: 'c4', level: 'landscape' }),
    { notation: 'archimate', viewpoint: 'application', granularity: 'container' });
  assert.equal(flipSpec(loja, { notation: 'c4', level: 'container', scope: 'loja' }).anchor, 'loja');
  assert.equal(titleFor(loja, { notation: 'c4', level: 'container', scope: 'loja' }), 'Containers de Plataforma de E-commerce');
});

const FULL = process.env.GUI_SWEEP === 'full';
const MODE = FULL ? 'varredura' : 'amostra';

test(`${MODE}: ações e trocas de notação renderizam`, { timeout: 300000 }, async t => {
  const cache = createViewCache(100000);
  const times = [];
  let failures = 0;
  const run = async (ctx, where, spec) => {
    const t0 = performance.now();
    try { await renderSpec(ctx, spec, cache); } catch (e) {
      failures++; t.diagnostic(`FALHA ${ctx.id}/${where}: ${e.message} ${JSON.stringify(spec)}`);
    }
    times.push(performance.now() - t0);
  };
  for (const ctx of [loja, tele]) {
    const ids = [...ctx.model.elements.keys()].sort();
    for (const [i, id] of ids.entries()) {
      if (!FULL && i % 5 !== 0) continue;
      for (const a of flat(actionsFor(ctx, id))) {
        if (!a.spec) continue;
        await run(ctx, `${id}/${a.label}`, a.spec);
        await run(ctx, `${id}/${a.label}/flip`, flipSpec(ctx, a.spec));
      }
    }
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  t.diagnostic(`${MODE}: ${times.length} visões, ${failures} falhas, p95 ${p95.toFixed(0)} ms, max ${times.at(-1).toFixed(0)} ms`);
  assert.equal(failures, 0);
  assert.ok(p95 < 1000, `p95 ${p95}`);
});

const AM = { spec: { notation: 'archimate', viewpoint: 'layered', anchor: 'loja' } };
const C4 = { spec: { notation: 'c4', level: 'container', scope: 'loja' }, nodes: ['cliente', 'loja.pedidos', 'loja.bff'] };
const focar = acts => acts.find(a => a.label === 'Focar (só vizinhos)');

test('ArchiMate: clique duplo no sistema abre camadas aninhadas', () => {
  const p = actionsFor(loja, 'loja', AM).find(a => a.primary);
  assert.equal(p.label, 'Abrir em camadas (aninhado)');
  assert.deepEqual(p.spec, { notation: 'archimate', viewpoint: 'layered', anchor: 'loja', traverse: { mode: 'both', maxDepth: 2 },
    granularity: 'container', nesting: { mode: 'nested', depth: 1 } });
});

test('ArchiMate: clique duplo no container usa granularidade component', () => {
  const p = actionsFor(loja, 'loja.pedidos', AM).find(a => a.primary);
  assert.equal(p.spec.granularity, 'component');
  assert.equal(p.spec.notation, 'archimate');
});

test('ArchiMate: ações C4 levam (C4) e não são primárias', () => {
  const acts = actionsFor(loja, 'loja', AM);
  assert.ok(!acts.find(a => a.label === 'Abrir containers (C4)').primary);
  assert.ok(acts.some(a => a.label === 'Contexto (C4)'));
  for (const a of flat(acts)) if (a.spec?.notation === 'c4') assert.match(a.label, /\(C4\)/);
});

test('ArchiMate: Focar fica em ArchiMate mesmo num container', () => {
  assert.deepEqual(focar(actionsFor(loja, 'loja.pedidos', AM)).spec, { notation: 'archimate', viewpoint: 'layered',
    anchor: 'loja.pedidos', traverse: { mode: 'both', maxDepth: 1 }, granularity: 'component' });
});

test('C4: Focar num container segue em C4', () => {
  assert.deepEqual(focar(actionsFor(loja, 'loja.pedidos', C4)).spec,
    { notation: 'c4', level: 'container', scope: 'loja', focus: ['loja.pedidos'], depth: 1 });
});

test('C4: Focar num sistema abre o contexto dele', () => {
  assert.deepEqual(focar(actionsFor(loja, 'erp', C4)).spec, { notation: 'c4', level: 'context', scope: 'erp' });
});

test('C4: Focar num ator presente na visão foca nela', () => {
  assert.deepEqual(focar(actionsFor(loja, 'cliente', C4)).spec, { ...C4.spec, focus: ['cliente'], depth: 1 });
});

test('C4: Focar num nó fora da visão e sem C4 cai em ArchiMate', () => {
  assert.equal(focar(actionsFor(loja, 'bp-checkout', C4)).spec.notation, 'archimate');
});

test('C4: rótulos de hoje, com Abrir containers primário', () => {
  const p = actionsFor(loja, 'loja', C4).find(a => a.primary);
  assert.equal(p.label, 'Abrir containers');
});

test('ArchiMate: clique duplo num grupo mostra os membros aninhados', () => {
  const p = actionsFor(loja, 'plat-vendas', AM).find(a => a.primary);
  assert.equal(p.spec.notation, 'archimate');
  assert.equal(p.spec.nesting.mode, 'nested');
  assert.deepEqual(p.spec.groups.only, ['plat-vendas']);
  assert.ok(actionsFor(loja, 'plat-vendas', AM).some(a => a.label === 'Abrir grupo (C4)' && !a.primary));
});
