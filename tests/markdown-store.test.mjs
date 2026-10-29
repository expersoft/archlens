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

test('removing an element keeps the text people wrote in its page under notes/removidos/', () => {
  const { dir, c } = vault();
  const rel = 'system-software/pg.md';
  writeFileSync(join(dir, rel), `${page(dir, rel)}\nBackup diário às 3h.\n`);
  const cur = c().read();
  const next = structuredClone(cur);
  next.raw.model.elements = next.raw.model.elements.filter(e => e.id !== 'pg');
  next.raw.model.relationships = next.raw.model.relationships.filter(r => r.from !== 'pg' && r.to !== 'pg');
  const res = c().apply(diffRaw(cur, next), { baseVersion: c().version() });
  assert.ok(!existsSync(join(dir, rel)), 'the page goes away');
  const kept = 'notes/removidos/system-software/pg.md';
  assert.deepEqual(res.preserved, [kept]);
  const text = page(dir, kept);
  assert.match(text.split('\n')[0], /PostgreSQL 16/);
  assert.match(text.split('\n')[0], /pg/);
  assert.match(text, /Backup diário às 3h\./);
  assert.equal(contentVersion(c().read()), contentVersion(next), 'the kept text is not part of the base');
  // A later apply neither reads nor removes it.
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.web').technology = 'Remix'; });
  assert.match(page(dir, kept), /Backup diário às 3h\./);
  // Back and removed again: the new text goes after the one already kept.
  change(c(), raw => { raw.model.elements.push({ id: 'pg', type: 'system-software', name: 'PostgreSQL 17' }); });
  writeFileSync(join(dir, rel), `${page(dir, rel)}\nRéplica em outra zona.\n`);
  change(c(), raw => { raw.model.elements = raw.model.elements.filter(e => e.id !== 'pg'); });
  assert.match(page(dir, kept), /Backup diário às 3h\.[\s\S]*PostgreSQL 17[\s\S]*Réplica em outra zona\./);
});

test('removing an element whose page has no human text leaves nothing behind', () => {
  const { dir, c } = vault();
  const cur = c().read();
  const next = structuredClone(cur);
  next.raw.model.elements = next.raw.model.elements.filter(e => e.id !== 'pg');
  next.raw.model.relationships = next.raw.model.relationships.filter(r => r.from !== 'pg' && r.to !== 'pg');
  const res = c().apply(diffRaw(cur, next), { baseVersion: c().version() });
  assert.deepEqual(res.preserved, []);
  assert.ok(!existsSync(join(dir, 'notes', 'removidos')));
});

test('the json connector reports no preserved files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-json-'));
  writeFileSync(join(dir, 'archlens.json'), JSON.stringify({ archlens: '2.0', name: 'x' }));
  const c = openStore(resolveBase(dir));
  const res = c.apply(diffRaw(c.read(), { raw: shop(), notes: {} }), { baseVersion: c.version() });
  assert.deepEqual(res.preserved, []);
});

test('the page aliases start with the element name; reading gives back the model aliases as they were', () => {
  const cases = [undefined, ['orders-service'], ['API', 'api-legada']]; // loja.api is named "API"
  for (const aliases of cases) {
    const raw = shop();
    const el = raw.model.elements.find(e => e.id === 'loja.api');
    if (aliases) el.aliases = aliases;
    const { dir, c } = vault({ raw, notes: {} });
    const rel = 'application-component/loja.api.md';
    const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(page(dir, rel))[1]);
    assert.equal(fm.aliases[0], 'API', JSON.stringify(aliases));
    for (const a of aliases ?? []) assert.ok(fm.aliases.includes(a));
    if (!aliases?.includes('API')) assert.equal(new Set(fm.aliases).size, fm.aliases.length, 'no duplicates');
    const back = c().read().raw.model.elements.find(e => e.id === 'loja.api');
    assert.deepEqual(back.aliases, aliases, JSON.stringify(aliases));
    assert.equal(contentVersion(c().read()), contentVersion({ raw, notes: {} }));
    const bytes = page(dir, rel);
    change(c(), () => {});
    assert.equal(page(dir, rel), bytes, 'same bytes on a second write');
  }
});

/** markdownlint MD022/MD032/MD025 problems in a page body (frontmatter left out): headings and lists not surrounded by blank lines, more than one H1. */
const lintProblems = text => {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const lines = body.split('\n');
  const out = [];
  const isList = l => /^\s*- /.test(l);
  lines.forEach((l, i) => {
    const prev = lines[i - 1], next = lines[i + 1];
    if (/^#{1,6} /.test(l)) {
      if (i > 0 && prev !== '') out.push(`MD022 above line ${i + 1}: ${l}`);
      if (next !== undefined && next !== '') out.push(`MD022 below line ${i + 1}: ${l}`);
    }
    if (isList(l) && prev !== undefined && prev !== '' && !isList(prev)) out.push(`MD032 before line ${i + 1}: ${l}`);
    if (isList(l) && next !== undefined && next !== '' && !isList(next)) out.push(`MD032 after line ${i + 1}: ${l}`);
  });
  if (lines.filter(l => /^# /.test(l)).length > 1) out.push('MD025: more than one H1');
  return out;
};

test('generated pages and kept texts pass markdownlint (blank lines around headings and lists, one H1), with a config for the frontmatter title', () => {
  const { dir, c } = vault();
  for (const type of readdirSync(dir).filter(n => !n.includes('.') && n !== 'notes')) {
    for (const f of readdirSync(join(dir, type))) assert.deepEqual(lintProblems(page(dir, `${type}/${f}`)), [], `${type}/${f}`);
  }
  const lint = JSON.parse(page(dir, '.markdownlint.json'));
  assert.deepEqual(lint.MD025, { front_matter_title: '' }, 'the frontmatter title does not count as a second H1');
  const rel = 'system-software/pg.md';
  writeFileSync(join(dir, rel), `${page(dir, rel)}\nBackup diário às 3h.\n`);
  change(c(), raw => { raw.model.elements = raw.model.elements.filter(e => e.id !== 'pg'); raw.model.relationships = raw.model.relationships.filter(r => r.from !== 'pg' && r.to !== 'pg'); });
  change(c(), raw => { raw.model.elements.push({ id: 'pg', type: 'system-software', name: 'PostgreSQL 17' }); });
  writeFileSync(join(dir, rel), `${page(dir, rel)}\nRéplica em outra zona.\n`);
  change(c(), raw => { raw.model.elements = raw.model.elements.filter(e => e.id !== 'pg'); });
  assert.deepEqual(lintProblems(page(dir, 'notes/removidos/system-software/pg.md')), []);
});

test('a markdownlint config the people of the vault adjusted is kept', () => {
  const { dir, c } = vault();
  writeFileSync(join(dir, '.markdownlint.json'), '{ "default": true, "MD013": false }\n');
  change(c(), raw => { raw.model.elements.find(e => e.id === 'loja.web').technology = 'Remix'; });
  assert.equal(page(dir, '.markdownlint.json'), '{ "default": true, "MD013": false }\n');
});

test('two ids of one type that differ only by letter case are refused (one file on case-insensitive disks)', () => {
  const { dir, c } = vault();
  const before = readdirSync(dir).sort();
  assert.throws(() => change(c(), raw => { raw.model.elements.push({ id: 'n1', type: 'node', name: 'A' }, { id: 'N1', type: 'node', name: 'B' }); }),
    e => e.code === 'E_STORE_MD_ID' && /"n1"/.test(e.message) && /"N1"/.test(e.message));
  assert.deepEqual(readdirSync(dir).sort(), before);
});
