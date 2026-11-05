import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';
import { viewAnswer, formatViewAnswer } from '../scripts/lib/query-md.mjs';
import { buildView } from '../scripts/lib/view-build.mjs';
import { whereSpec, matchesWhere, cutByWhere } from '../scripts/lib/query-where.mjs';
import { asBase } from './helpers.mjs';

const PROPERTIES = {
  'loja.api': { squad: 'Checkout' },
  'loja.api.catalogo': { squad: 'Vitrine' },
  'loja.api.checkout': { squad: 'Checkout' },
  pagamentos: { squad: 'Checkout', canais: ['web', 'app'] },
  'proc-checkout': { squad: 'Checkout' },
  'app-svc-checkout': { squad: 'Vitrine' },
};

function withProperties(elements, properties) {
  for (const el of elements) {
    if (properties[el.id]) el.properties = properties[el.id];
    withProperties(el.children ?? [], properties);
  }
}

function shop(extra = {}) {
  const raw = JSON.parse(readFileSync(new URL('fixtures/shop.json', import.meta.url), 'utf8'));
  withProperties(raw.model.elements, { ...PROPERTIES, ...extra });
  return normalizeModel(asBase(raw));
}

const ids = view => view.nodes.map(n => n.id).sort();
const CHECKOUT = { squad: 'Checkout' };
const CONTAINERS = { notation: 'c4', level: 'container', scope: 'loja' };

test('filtra sem herança: o valor do sistema não vale para os containers', () => {
  const view = resolveView(shop(), { ...CONTAINERS, where: CHECKOUT });
  assert.deepEqual([...view.whereResults].sort(), ['loja.api', 'pagamentos']);
  assert.ok(!ids(view).includes('loja.web') && !ids(view).includes('loja.db'));

  const inherited = resolveView(shop({ loja: { squad: 'Plataforma' } }), { ...CONTAINERS, where: { squad: 'Plataforma' } });
  assert.deepEqual(inherited.whereResults, []);
  assert.deepEqual(inherited.nodes, []);
});

test('o ancestral entra como moldura e não conta como resultado', () => {
  const spec = { notation: 'archimate', viewpoint: 'application', where: { squad: 'Vitrine' } };
  const view = resolveView(shop(), spec);
  assert.deepEqual(ids(view), ['app-svc-checkout', 'loja', 'loja.api', 'loja.api.catalogo']);
  assert.deepEqual([...view.whereResults].sort(), ['app-svc-checkout', 'loja.api.catalogo']);

  const md = formatViewAnswer(viewAnswer(shop(), spec));
  assert.match(md, /\| API \(moldura\) \|/);
  assert.match(md, /\| Catalogo \|/);
});

test('a fronteira do escopo fica só com nó interno no resultado', () => {
  const kept = resolveView(shop(), { ...CONTAINERS, where: CHECKOUT });
  assert.deepEqual(kept.boundaries.map(b => b.id), ['loja']);
  const gone = resolveView(shop(), { ...CONTAINERS, where: { canais: 'web' } });
  assert.deepEqual(ids(gone), ['pagamentos']);
  assert.deepEqual(gone.boundaries, []);
});

test('depth não traz vizinhos sem o valor', () => {
  const view = resolveView(shop(), { ...CONTAINERS, focus: ['loja.api'], depth: 2, where: CHECKOUT });
  assert.deepEqual(ids(view), ['loja.api', 'pagamentos']);
  assert.deepEqual([...view.whereResults].sort(), ['loja.api', 'pagamentos']);
});

test('o foco recorta os resultados', () => {
  const spec = { ...CONTAINERS, focus: ['loja.web'], where: CHECKOUT };
  const view = resolveView(shop(), spec);
  assert.deepEqual(view.nodes, []);
  assert.deepEqual(view.whereResults, []);
  assert.match(formatViewAnswer(viewAnswer(shop(), spec)), /Nenhum nó tem/);
});

test('include vence o filtro', () => {
  const view = resolveView(shop(), { notation: 'c4', level: 'landscape', include: ['cliente'], where: CHECKOUT });
  assert.deepEqual(ids(view), ['cliente', 'pagamentos']);
  assert.deepEqual([...view.whereResults].sort(), ['cliente', 'pagamentos']);

  const am = resolveView(shop(), { notation: 'archimate', viewpoint: 'business', include: ['k8s'], where: CHECKOUT });
  assert.deepEqual(ids(am), ['k8s', 'proc-checkout']);
});

test('caixa, espaços e lista casam', () => {
  assert.equal(matchesWhere({ properties: { squad: ' Checkout ' } }, { squad: ['checkout'] }), true);
  assert.equal(matchesWhere({ properties: { canais: ['web', 'app'] } }, { canais: ['APP'] }), true);
  assert.equal(matchesWhere({ properties: { versao: 2, ativo: true } }, { versao: ['2'], ativo: ['TRUE'] }), true);
});

test('chaves somam (E) e valores da mesma chave são alternativas (OU)', () => {
  const el = { properties: { squad: 'Checkout', canais: ['web'] } };
  assert.equal(matchesWhere(el, { squad: ['Checkout'], canais: ['app', 'web'] }), true);
  assert.equal(matchesWhere(el, { squad: ['Checkout'], canais: ['app'] }), false);
  assert.equal(matchesWhere({}, { squad: ['Checkout'] }), false);
  assert.equal(matchesWhere({ properties: { squad: null } }, { squad: ['null'] }), false);
  assert.equal(matchesWhere({ properties: { squad: { nome: 'x' } } }, { squad: ['[object Object]'] }), false);
});

test('cutByWhere separa resultados de ancestrais e ignora include ausente', () => {
  const nodeIds = new Set(['loja', 'loja.api', 'loja.api.catalogo', 'loja.web']);
  const { kept, results } = cutByWhere(shop(), { squad: ['Vitrine'] }, nodeIds, { include: ['loja.web', 'pagamentos'] });
  assert.deepEqual([...results].sort(), ['loja.api.catalogo', 'loja.web']);
  assert.deepEqual([...kept].sort(), ['loja', 'loja.api', 'loja.api.catalogo', 'loja.web']);
});

test('escopo e âncora sem o valor saem, sem quebrar a visão', async () => {
  const model = shop();
  const context = { notation: 'c4', level: 'context', scope: 'loja', where: CHECKOUT };
  const c4 = resolveView(model, context);
  assert.deepEqual(ids(c4), ['pagamentos']);
  assert.equal(c4.scope, 'loja');
  assert.deepEqual((await buildView(model, { key: 'ctx', ...context })).nodes, ['pagamentos']);

  const impact = { notation: 'archimate', viewpoint: 'impact', anchor: 'venda', traverse: { mode: 'supporters' }, where: CHECKOUT };
  const am = resolveView(model, impact);
  assert.ok(!ids(am).includes('venda'));
  const proc = am.nodes.find(n => n.id === 'proc-checkout');
  assert.equal(proc.role, 'supporter');
  assert.equal(proc.distance, 2);
  assert.ok(am.nodes.every(n => !n.isAnchor));
  assert.ok(am.matrix.some(r => r.id === 'svc-pedido' && !r.shown));
  assert.ok((await buildView(model, { key: 'imp', ...impact })).nodes.includes('proc-checkout'));
});

test('visão dinâmica ignora e avisa', () => {
  const spec = { notation: 'c4', level: 'dynamic', scope: 'loja', steps: [{ from: 'cliente', to: 'loja.web', description: 'compra' }], where: CHECKOUT };
  const view = resolveView(shop(), spec);
  assert.equal(view.whereIgnored, true);
  assert.equal(view.whereResults, undefined);
  assert.deepEqual(ids(view), ['cliente', 'loja.web']);
  assert.ok(viewAnswer(shop(), spec).notes.includes('A visão dinâmica ignora "where".'));
});

test('sem where nada muda na visão', () => {
  const view = resolveView(shop(), CONTAINERS);
  assert.equal(view.whereResults, undefined);
  assert.equal(view.whereIgnored, undefined);
  assert.equal(whereSpec({ key: 'k' }), null);
  assert.ok(viewAnswer(shop(), CONTAINERS).sections.every(s => s.rows.every(r => !('frame' in r))));
});

test('resultado vazio não é erro', () => {
  const spec = { notation: 'c4', level: 'landscape', where: { squad: 'Inexistente' } };
  assert.match(formatViewAnswer(viewAnswer(shop(), spec)), /Nenhum nó tem/);
});

test('normaliza valor simples e lista', () => {
  assert.deepEqual(whereSpec({ where: { squad: 'Checkout', versao: 2, ativo: true, canais: ['web', 'app'] } }),
    { squad: ['Checkout'], versao: ['2'], ativo: ['true'], canais: ['web', 'app'] });
});

test('where inválido recusa com E_VIEW_WHERE', () => {
  for (const where of [null, 'squad', [], {}, { squad: null }, { squad: [] }, { squad: { a: 1 } }, { squad: [['x']] }]) {
    assert.throws(() => resolveView(shop(), { notation: 'c4', level: 'landscape', where }), e => e.code === 'E_VIEW_WHERE', JSON.stringify(where));
    assert.throws(() => resolveView(shop(), { notation: 'archimate', viewpoint: 'business', where }), e => e.code === 'E_VIEW_WHERE', JSON.stringify(where));
  }
  assert.throws(() => resolveView(shop(), { notation: 'c4', level: 'dynamic', scope: 'loja', steps: [], where: {} }), e => e.code === 'E_VIEW_WHERE');
});
