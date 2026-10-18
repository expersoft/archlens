import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, resolveBase } from '../scripts/lib/store/index.mjs';
import { diffRaw, contentVersion } from '../scripts/lib/store/ops.mjs';
import { parse as parseYaml } from '../scripts/vendor/yaml/index.js';
import { asBase } from './helpers.mjs';

const shop = () => asBase(JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url))));
const vault = (base = { raw: shop(), notes: {} }) => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-vault-'));
  writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x', store: { kind: 'markdown' } }));
  const c = openStore(resolveBase(dir));
  c.apply(diffRaw(c.read(), base), { baseVersion: c.version() });
  return { dir, c: () => openStore(resolveBase(dir)) };
};
const page = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const change = (c, mutate) => { const cur = c.read(); const next = structuredClone(cur); mutate(next.raw); c.apply(diffRaw(cur, next), { baseVersion: c.version() }); };

test('one page per element under its type folder, with frontmatter, title, description, archlens block and wikilinks', () => {
  const { dir } = vault();
  const text = page(dir, 'application-component/loja.api.checkout.md');
  const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)[1]);
  assert.equal(fm.id, 'loja.api.checkout');
  assert.equal(fm.type, 'application-component');
  assert.equal(fm.title, 'Checkout');
  assert.equal(fm.c4, 'component');
  assert.equal(fm.parent, '[[application-component/loja.api|API]]');
  assert.ok(fm.relationships.some(r => r.type === 'realization' && r.to === 'app-svc-checkout' && typeof r.id === 'string'));
  assert.deepEqual(fm.realization, ['[[application-service/app-svc-checkout|Servico de checkout]]']);
  assert.ok(fm.tags.includes('archlens/application-component') && fm.tags.includes('archlens/c4/component'));
  assert.match(text, /\n# Checkout\n/);
  assert.match(text, /<!-- archlens:begin -->[\s\S]*\*\*realization\*\* → \[\[application-service\/app-svc-checkout\|Servico de checkout\]\][\s\S]*<!-- archlens:end -->/);
  assert.ok(existsSync(join(dir, 'business-actor', 'cliente.md')));
  assert.ok(existsSync(join(dir, 'gbrain-pack.yaml')));
});

test('writing the same base twice gives the same bytes, and reading gives the same base', () => {
  const { dir, c } = vault();
  const before = readdirSync(join(dir, 'application-component')).map(f => page(dir, `application-component/${f}`));
  change(c(), () => {});
  assert.deepEqual(readdirSync(join(dir, 'application-component')).map(f => page(dir, `application-component/${f}`)), before);
  assert.equal(contentVersion(c().read()), contentVersion({ raw: shop(), notes: {} }));
});

test('text people write in a page survives, even when the element changes type and the file moves', () => {
  const { dir, c } = vault();
  const rel = 'application-component/loja.web.md';
  writeFileSync(join(dir, rel), `${page(dir, rel)}\nNotas da equipe: migrar para Remix.\n`);
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.web').technology = 'Remix'; });
  assert.match(page(dir, rel), /Notas da equipe: migrar para Remix\./);
  // app-svc-checkout is the only application-service, and the checkout page links to it (realization).
  writeFileSync(join(dir, 'application-service/app-svc-checkout.md'), `${page(dir, 'application-service/app-svc-checkout.md')}\nDono: time de checkout.\n`);
  change(c(), raw => { raw.model.elements.find(e => e.id === 'app-svc-checkout').type = 'application-interface'; });
  assert.ok(!existsSync(join(dir, 'application-service/app-svc-checkout.md')));
  assert.match(page(dir, 'application-interface/app-svc-checkout.md'), /Dono: time de checkout\./, 'the text moves with the page');
  assert.ok(!existsSync(join(dir, 'application-service')), 'an emptied type folder goes away');
  assert.match(page(dir, 'application-component/loja.api.checkout.md'), /\[\[application-interface\/app-svc-checkout\|Servico de checkout\]\]/, 'links to the moved page are rewritten');
});

test('renaming an element rewrites the links to it and moves no file', () => {
  const { dir, c } = vault();
  const files = () => readdirSync(join(dir, 'application-component')).sort();
  const before = files();
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.api').name = 'API de Pedidos'; });
  assert.deepEqual(files(), before);
  assert.match(page(dir, 'application-component/loja.api.checkout.md'), /parent: "\[\[application-component\/loja\.api\|API de Pedidos\]\]"/);
});

test('a page without frontmatter, a page in the wrong folder and a duplicated id are refused; loose .md files are ignored', () => {
  const { dir, c } = vault();
  writeFileSync(join(dir, 'solto.md'), '# Fora das pastas de tipo\n');
  assert.doesNotThrow(() => c().read());
  writeFileSync(join(dir, 'application-component', 'README.md'), '# Componentes\n');
  assert.throws(() => c().read(), e => e.code === 'E_STORE_MD' && /application-component\/README\.md/.test(e.message));
  writeFileSync(join(dir, 'application-component', 'README.md'), page(dir, 'business-actor/cliente.md'));
  assert.throws(() => c().read(), e => e.code === 'E_STORE_MD_PATH');
  writeFileSync(join(dir, 'application-component', 'README.md'), '---\nid: [quebrado\n---\n');
  assert.throws(() => c().read(), e => e.code === 'E_STORE_MD');
});

test('the gbrain pack declares exactly the page types and link fields the pages use', () => {
  const { dir } = vault();
  const pack = parseYaml(page(dir, 'gbrain-pack.yaml'));
  assert.equal(pack.api_version, 'gbrain-schema-pack-v1');
  assert.equal(pack.name, 'archlens');
  const types = new Set(readdirSync(dir).filter(n => existsSync(join(dir, n, '.')) && !n.includes('.') && n !== 'notes'));
  assert.deepEqual(new Set(pack.page_types.map(t => t.name)), types);
  for (const t of pack.page_types) assert.deepEqual(t.path_prefixes, [`${t.name}/`]);
  const used = new Set();
  for (const type of types) for (const f of readdirSync(join(dir, type))) {
    const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(page(dir, `${type}/${f}`))[1]);
    for (const k of Object.keys(fm)) if (['parent', 'group', 'serving', 'realization', 'access', 'aggregation', 'composition', 'assignment', 'flow', 'triggering', 'influence', 'specialization', 'association'].includes(k) && fm[k] != null) used.add(`${type}:${k}`);
  }
  assert.deepEqual(new Set(pack.frontmatter_links.map(l => `${l.page_type}:${l.fields[0]}`)), used);
  for (const l of pack.frontmatter_links) assert.ok(pack.link_types.some(t => t.name === l.link_type), l.link_type);
});

test('values with "---" in them read back as written (a closing fence counts only at the start of a line)', () => {
  const { c } = vault();
  change(c(), raw => {
    const el = raw.model.elements.find(e => e.id === 'loja.web');
    el.owner = 'team---';
    el.statusReason = 'antes\n---\ndepois';
    el.properties = { nota: 'x\n---\ny' };
  });
  const el = c().read().raw.model.elements.find(e => e.id === 'loja.web');
  assert.equal(el.owner, 'team---');
  assert.equal(el.statusReason, 'antes\n---\ndepois');
  assert.deepEqual(el.properties, { nota: 'x\n---\ny' });
  assert.equal(el.name, 'Web');
  assert.equal(el.description, undefined);
});

test('an id that would break a wikilink is refused on write and nothing is written', () => {
  const { dir, c } = vault();
  for (const ch of ['[', ']', '|', '#', '^']) {
    const before = readdirSync(dir).sort();
    assert.throws(() => change(c(), raw => { raw.model.elements.push({ id: `p${ch}x`, type: 'node', name: 'N' }); }),
      e => e.code === 'E_STORE_MD_ID', ch);
    assert.deepEqual(readdirSync(dir).sort(), before);
    assert.ok(!existsSync(join(dir, 'node', `p${ch}x.md`)), ch);
  }
});

test('a description holding an archlens marker is refused on write, naming the element', () => {
  const { c } = vault();
  for (const marker of ['<!-- archlens:begin -->', '<!-- archlens:end -->']) {
    assert.throws(() => change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.web').description = `a ${marker} b`; }),
      e => e.code === 'E_STORE_MD' && /loja\.web/.test(e.message), marker);
  }
});

test('an empty type folder a person made survives an apply; one the apply emptied goes away', () => {
  const { dir, c } = vault();
  mkdirSync(join(dir, 'device'));
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.web').technology = 'Remix'; });
  assert.ok(existsSync(join(dir, 'device')), 'the person-made folder stays');
  change(c(), raw => { raw.model.elements = raw.model.elements.filter(e => e.id !== 'pg'); raw.model.relationships = raw.model.relationships.filter(r => r.from !== 'pg' && r.to !== 'pg'); });
  assert.ok(!existsSync(join(dir, 'system-software')), 'the folder this apply emptied goes away');
  assert.ok(existsSync(join(dir, 'device')));
});
