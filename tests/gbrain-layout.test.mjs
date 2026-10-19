import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFolder } from '../scripts/lib/store/folder.mjs';
import { vaultFiles, readVaultFiles } from '../scripts/lib/store/markdown.mjs';
import { toGbrainFiles, fromGbrainFiles, assertGbrainIds, gbrainSlug } from '../scripts/lib/store/gbrain-layout.mjs';
import { canonicalJson } from '../scripts/lib/merge.mjs';
import { parse as parseYaml } from '../scripts/vendor/yaml/index.js';

const EXAMPLES = ['loja-online', 'telemedicina', 'repos'];
const base = name => loadFolder(new URL(`../examples/${name}/architecture`, import.meta.url).pathname);
const vaultOf = b => new Map([...vaultFiles(b, null)].filter(([, t]) => t !== null));
const fixture = name => readFileSync(new URL(`./fixtures/gbrain-layout/${name}`, import.meta.url), 'utf8');

// A small base: an element with a relationship and a child, one view, one note, a two-round changelog.
const small = () => {
  const raw = {
    archlens: '2.0', name: 'Loja', description: 'Base de teste',
    model: {
      elements: [
        { id: 'loja', type: 'application-component', name: 'Loja', description: 'A loja.' },
        { id: 'loja.pedidos', type: 'application-component', name: 'API de Pedidos', parent: 'loja' },
        { id: 'cliente', type: 'business-actor', name: 'Cliente' },
      ],
      relationships: [{ id: 'r1', from: 'loja.pedidos', type: 'serving', to: 'cliente', description: 'Atende' }],
    },
    views: [{ key: 'landscape', notation: 'c4', level: 'landscape', title: 'Panorama' }],
    changelog: [
      { id: '2026-10-01-01', date: '2026-10-01', summary: 'Primeira', added: ['loja', 'cliente'] },
      { id: '2026-10-02-01', date: '2026-10-02', summary: 'Pedidos', added: ['loja.pedidos'], changed: ['loja'], removed: ['velho'] },
    ],
  };
  return { raw, notes: { overview: '# Visão\n\nTexto.' } };
};
const smallVault = () => vaultOf(small());

test('readVaultFiles reads what readVault reads', () => {
  for (const name of EXAMPLES) {
    const b = base(name);
    const read = readVaultFiles(vaultOf(b));
    // The vault reads elements by id and writes the id every relationship gets; the json base keeps file order and bare ones.
    const key = r => `${r.from}|${r.type}|${r.to}|${r.description ?? ''}`;
    const norm = raw => canonicalJson({
      ...raw,
      model: {
        elements: [...raw.model.elements].sort((x, y) => (x.id < y.id ? -1 : 1)),
        relationships: raw.model.relationships.map(({ id, ...r }) => r).sort((x, y) => (key(x) < key(y) ? -1 : 1)),
      },
    });
    assert.equal(norm(read.raw), norm(b.raw), name);
    assert.deepEqual(read.notes, b.notes);
  }
});

test('toGbrainFiles then fromGbrainFiles is the identity', () => {
  for (const name of EXAMPLES) {
    const v = vaultOf(base(name));
    const back = fromGbrainFiles(toGbrainFiles(v, { prefix: 'archlens' }), { prefix: 'archlens' });
    assert.deepEqual([...back.keys()].sort(), [...v.keys()].sort(), name);
    for (const [rel, text] of v) assert.equal(back.get(rel), text, `${name}: ${rel}`);
  }
  const v = smallVault();
  const back = fromGbrainFiles(toGbrainFiles(v, { prefix: 'a/b' }), { prefix: 'a/b' });
  for (const [rel, text] of v) assert.equal(back.get(rel), text, rel);
});

test('layout snapshots', () => {
  const g = toGbrainFiles(smallVault(), { prefix: 'archlens' });
  assert.equal(g.get('archlens/application-component/loja.pedidos.md'), fixture('element.md'));
  assert.equal(g.get('archlens/manifest.md'), fixture('manifest.md'));
  assert.equal(g.get('archlens/views/landscape.md'), fixture('view.md'));
  assert.equal(g.get('archlens/notes/overview.md'), fixture('note.md'));
  assert.equal(g.get('archlens/changelog.md'), fixture('changelog.md'));
});

test('the pack has prefixed path_prefixes and the four new page types; no lint config', () => {
  const g = toGbrainFiles(smallVault(), { prefix: 'archlens' });
  const pack = parseYaml(g.get('archlens/gbrain-pack.yaml'));
  const prefixes = Object.fromEntries(pack.page_types.map(t => [t.name, t.path_prefixes]));
  assert.deepEqual(prefixes['application-component'], ['archlens/application-component/']);
  for (const t of ['archlens-manifest', 'archlens-view', 'archlens-note', 'archlens-changelog']) assert.ok(prefixes[t][0].startsWith('archlens/'), t);
  assert.ok(![...g.keys()].some(k => k.includes('markdownlint')));
});

test('every page carries the archlens tag', () => {
  const g = toGbrainFiles(smallVault(), { prefix: 'archlens' });
  for (const [rel, text] of g) {
    if (!rel.endsWith('.md')) continue;
    const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(text)[1]);
    assert.ok(fm.tags.includes('archlens'), rel);
  }
});

test('files outside the prefix are ignored', () => {
  const g = toGbrainFiles(smallVault(), { prefix: 'archlens' });
  g.set('outro/application-component/intruso.md', '---\nid: intruso\ntype: application-component\n---\n');
  g.set('README.md', '# oi');
  g.set('archlens/solto.md', 'x');
  const back = fromGbrainFiles(g, { prefix: 'archlens' });
  assert.deepEqual([...back.keys()].filter(k => k.includes('intruso') || k === 'README.md' || k.includes('solto')), []);
  assert.equal(readVaultFiles(back).raw.model.elements.length, 3);
});

test('text written after the archlens block survives the round trip', () => {
  const v = smallVault();
  const rel = 'business-actor/cliente.md';
  v.set(rel, `${v.get(rel).replace(/\n$/, '')}\n\nAnotação humana.\n`);
  const g = toGbrainFiles(v, { prefix: 'archlens' });
  assert.match(g.get(`archlens/${rel}`), /Anotação humana\.\n\n<!-- timeline -->\n$/);
  assert.equal(fromGbrainFiles(g, { prefix: 'archlens' }).get(rel), v.get(rel));
});

test('every page ends with gbrain\'s timeline sentinel, and only that one is taken off on reading', () => {
  const v = smallVault();
  const rel = 'business-actor/cliente.md';
  v.set(rel, `${v.get(rel).replace(/\n$/, '')}\n\n## History\n\n- 2026-10-01: criado\n\n<!-- timeline -->\n`);
  const g = toGbrainFiles(v, { prefix: 'archlens' });
  for (const [path, text] of g) if (path.endsWith('.md')) assert.ok(text.endsWith('\n\n<!-- timeline -->\n'), path);
  assert.equal(fromGbrainFiles(g, { prefix: 'archlens' }).get(rel), v.get(rel)); // the one people wrote stays
});

test('frontmatter keys gbrain stamps are dropped on reading and refused as element fields', () => {
  const v = smallVault();
  const g = toGbrainFiles(v, { prefix: 'archlens' });
  const rel = 'archlens/business-actor/cliente.md';
  // What a put_page stamps (src/core/persistence/page-prepare.ts putProvenance, and trust_tier for a remote writer).
  const provenance = "trust_tier: agent_written\ningested_at: '2026-10-19T10:02:13.230Z'\nsource_kind: mcp:put_page\ningested_via: mcp:put_page\n";
  const stamped = new Map(g).set(rel, g.get(rel).replace(/^---\n/, `---\n${provenance}embed_skip: true\n`));
  assert.deepEqual(fromGbrainFiles(stamped, { prefix: 'archlens' }), fromGbrainFiles(g, { prefix: 'archlens' }));
  for (const key of ['trust_tier', 'source_kind', 'ingested_via']) {
    const raw = small().raw;
    raw.model.elements[0] = { ...raw.model.elements[0], [key]: 'x' };
    assert.throws(() => assertGbrainIds(raw), e => e.code === 'E_STORE_GBRAIN_RESERVED' && e.message.includes(key), key);
  }
});

test('date-like strings are quoted for gbrain, whose YAML reader takes them for timestamps; the vault keeps its bytes', () => {
  const b = small();
  b.raw.model.elements[2] = { ...b.raw.model.elements[2], since: '2026-10-18', properties: { implantado: '2026-01-05 08:00:00', codigo: '0b101', inicio: '2026-1-5T8:00:00Z', texto: 'normal' } };
  b.raw.views[0].title = '2026-10-18';
  const v = vaultOf(b);
  assert.match(v.get('business-actor/cliente.md'), /^since: 2026-10-18$/m); // the markdown connector writes as before
  const g = toGbrainFiles(v, { prefix: 'archlens' });
  const page = g.get('archlens/business-actor/cliente.md');
  for (const line of ['since: "2026-10-18"', '  implantado: "2026-01-05 08:00:00"', '  codigo: "0b101"', '  inicio: "2026-1-5T8:00:00Z"', '  texto: normal']) {
    assert.ok(page.split('\n').includes(line), `${line}\n${page}`);
  }
  assert.match(g.get('archlens/views/landscape.md'), /^title: "2026-10-18"$/m);
  assert.deepEqual(fromGbrainFiles(g, { prefix: 'archlens' }), v);
});

test('ids that are not gbrain slugs are refused', () => {
  const raw = small().raw;
  raw.model.elements.push({ id: 'Loja.Pedidos', type: 'application-component', name: 'x' }, { id: 'pagamento-crédito', type: 'application-service', name: 'y' });
  assert.throws(() => assertGbrainIds(raw), e => e.code === 'E_STORE_GBRAIN_SLUG' && e.message.includes('Loja.Pedidos') && e.message.includes('pagamento-crédito'));
  assert.doesNotThrow(() => assertGbrainIds(small().raw));
  for (const name of EXAMPLES) assert.doesNotThrow(() => assertGbrainIds(base(name).raw), name);
});

test('reserved names are refused', () => {
  const raw = small().raw;
  raw.model.elements.push({ id: 'index', type: 'application-component', name: 'x' });
  assert.throws(() => assertGbrainIds(raw), e => e.code === 'E_STORE_GBRAIN_RESERVED');
});

test('gbrainSlug ports slugifySegment', () => {
  assert.equal(gbrainSlug('Pagamento Crédito'), 'pagamento-credito');
  assert.equal(gbrainSlug('  a__b..c  --d '), 'a__b..c-d');
  assert.equal(gbrainSlug('loja.pedidos'), 'loja.pedidos');
  assert.equal(gbrainSlug('日本語 x!'), '日本語-x');
});

test('the text of a removed element travels vault -> gbrain -> vault under notes/removidos/', () => {
  const v = smallVault();
  const rel = 'business-actor/cliente.md';
  v.set(rel, `${v.get(rel).replace(/\n$/, '')}\n\nAnotação humana.\n`);
  const { raw, ctx } = readVaultFiles(v);
  raw.model.elements = raw.model.elements.filter(e => e.id !== 'cliente');
  raw.model.relationships = [];
  const after = vaultFiles({ raw, notes: {} }, { ctx }, { exists: () => false });
  assert.match(after.get('notes/removidos/business-actor/cliente.md'), /Anotação humana\./);
  const vault = new Map([...after].filter(([, t]) => t !== null));
  const g = toGbrainFiles(vault, { prefix: 'archlens' });
  assert.match(g.get('archlens/notes/removidos/business-actor/cliente.md'), /^---\ntype: archlens-note\n[\s\S]*Anotação humana\./);
  const back = fromGbrainFiles(g, { prefix: 'archlens' });
  assert.equal(back.get('notes/removidos/business-actor/cliente.md'), vault.get('notes/removidos/business-actor/cliente.md'));
});

test('the pack carries the extra page types even without a prefix', () => {
  const pack = parseYaml(toGbrainFiles(smallVault(), { prefix: '' }).get('gbrain-pack.yaml'));
  assert.ok(pack.page_types.some(t => t.name === 'archlens-changelog'));
});
