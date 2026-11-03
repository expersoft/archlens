import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { loadConfig } from './config.mjs';
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';
import { initBase } from '../../../scripts/lib/store/config.mjs';
import { diffRaw } from '../../../scripts/lib/store/ops.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ex = n => join(root, 'examples', n, 'architecture');
const tmp = () => mkdtempSync(join(tmpdir(), 'archlens-gui-'));

test('lista as duas bases de exemplo', () => {
  const reg = createBaseRegistry({ port: 1, bases: [
    { id: 'loja-online', path: ex('loja-online') }, { id: 'telemedicina', path: ex('telemedicina') }] }, { pollMs: 100000 });
  try {
    const l = reg.list();
    assert.equal(l.length, 2);
    assert.ok(l.every(b => b.ok));
    assert.equal(l[0].name, 'Loja Online');
    assert.ok(reg.get('telemedicina').model.elements.has('tele.api'));
  } finally { reg.close(); }
});

test('base 1.x aparece com erro e as outras seguem', () => {
  const old = tmp();
  writeFileSync(join(old, 'archlens.json'), '{"name":"x","elements":[]}');
  const reg = createBaseRegistry({ port: 1, bases: [
    { id: 'loja-online', path: ex('loja-online') }, { id: 'velha', path: old }, { id: 'sumiu', path: join(old, 'nao-existe') }] }, { pollMs: 100000 });
  try {
    const l = reg.list();
    const velha = l.find(b => b.id === 'velha');
    assert.equal(velha.ok, false);
    assert.match(velha.error, /E_STORE_FORMAT|formato/);
    assert.equal(velha.name, 'velha');
    assert.equal(l.find(b => b.id === 'sumiu').ok, false);
    assert.equal(l[0].ok, true);
    assert.throws(() => reg.get('velha'), { code: 'E_GUI_BASE' });
    assert.throws(() => reg.get('zzz'), { code: 'E_GUI_BASE' });
  } finally { reg.close(); }
});

test('refresh recarrega quando a base muda; systemOf e kind', async () => {
  const dir = join(tmp(), 'arch');
  cpSync(ex('loja-online'), dir, { recursive: true });
  const reg = createBaseRegistry({ port: 1, bases: [{ id: 'l', name: 'Minha', path: dir }] }, { pollMs: 100000 });
  try {
    const before = reg.get('l');
    assert.equal(reg.list()[0].name, 'Minha');
    const m = JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8'));
    m.elements[0].name = 'Cliente Renomeado';
    const id = m.elements[0].id;
    writeFileSync(join(dir, 'model.json'), JSON.stringify(m, null, 2));
    await reg.refresh();
    const after = reg.get('l');
    assert.notEqual(after.version, before.version);
    assert.equal(after.model.elements.get(id).name, 'Cliente Renomeado');
    assert.equal(after.kind(after.model.elements.get(id)), 'person');
    const sys = [...after.model.elements.values()].find(e => e.c4?.kind === 'softwareSystem');
    assert.equal(after.systemOf(sys.id), sys.id);
    const child = [...after.model.elements.values()].find(e => e.parent && after.systemOf(e.id));
    assert.ok(child);
    assert.equal(after.systemOf('nao-existe'), null);
  } finally { reg.close(); }
});

test('loadConfig: arquivo, base única e porta padrão', () => {
  const d = tmp();
  mkdirSync(join(d, 'sub'));
  writeFileSync(join(d, 'sub', 'gui.json'), JSON.stringify({ port: 9000, bases: [{ id: 'a', name: 'A', path: '../x' }] }));
  const c = loadConfig({ file: join(d, 'sub', 'gui.json') });
  assert.equal(c.port, 9000);
  assert.deepEqual(c.bases, [{ id: 'a', name: 'A', path: join(d, 'x') }]);
  const b = loadConfig({ base: '/a/b/minha-base', port: 7 });
  assert.equal(b.port, 7);
  assert.equal(b.bases[0].id, 'minha-base');
  assert.equal(loadConfig({ base: '/a/b' }).port, 5180);
});

test('loadConfig: valida id e path de cada base e recusa ids repetidos', () => {
  const d = tmp();
  const bad = (bases, re) => {
    writeFileSync(join(d, 'gui.json'), JSON.stringify({ bases }));
    assert.throws(() => loadConfig({ file: join(d, 'gui.json') }), e => e.code === 'E_GUI_CONFIG' && re.test(e.message));
  };
  bad([{ path: 'x' }], /base 1.*id/);
  bad([{ id: '', path: 'x' }], /base 1.*id/);
  bad([{ id: 'a', path: 'x' }, { id: 'b' }], /base 2 \("b"\).*path/);
  bad([{ id: 'a', path: 7 }], /base 1 \("a"\).*path/);
  bad([{ id: 'a', path: 'x' }, { id: 'a', path: 'y' }], /base 2 \("a"\).*repetido/);
  bad(['oi'], /base 1/);
  bad({}, /lista/);
});

test('base gbrain git: a conferência roda numa worker thread e recarrega quando o remoto muda', async () => {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' };
  Object.assign(process.env, env); // a worker herda o ambiente: git hermético, sem identidade global
  const sh = (cwd, ...args) => {
    const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  };
  const d = tmp();
  const remote = join(d, 'remote.git');
  sh(d, 'init', '-q', '--bare', '-b', 'main', remote);
  const user = name => {
    const clone = join(d, `${name}-clone`);
    sh(d, 'clone', '-q', remote, clone);
    sh(clone, 'config', 'user.name', name);
    sh(clone, 'config', 'user.email', `${name}@example.com`);
    const at = join(d, `${name}-base`);
    initBase(at, { name: 'Empresa', store: { kind: 'gbrain', mode: 'git', repo: relative(at, clone), branch: 'main' } });
    return { dir: at, store: () => openStore(resolveBase(at)) };
  };
  const write = (s, raw) => s.apply(diffRaw(s.read(), { raw, notes: {} }), { baseVersion: s.version() });
  const raw = name => ({
    archlens: '2.0', name: 'Empresa',
    model: { elements: [{ id: 'vendas', type: 'application-component', name, c4: { kind: 'softwareSystem' } }], relationships: [] },
    changelog: [{ id: '2026-10-01-01', date: '2026-10-01', summary: 'início', added: [], changed: [], status: {}, removed: [], decisions: [] }],
  });
  const ana = user('ana'), bia = user('bia');
  write(ana.store(), raw('Vendas'));
  const reg = createBaseRegistry({ port: 1, bases: [{ id: 'g', path: bia.dir }] }, { pollMs: 100000, remotePollMs: 100000 });
  try {
    const before = reg.get('g');
    assert.equal(before.model.elements.get('vendas').name, 'Vendas');
    assert.equal(before.snapshot.readSubgraph({ seeds: ['vendas'] }).raw.model.elements.length, 1);
    await reg.refresh(); // sem mudança no remoto: o mesmo contexto
    assert.equal(reg.get('g'), before);
    write(ana.store(), raw('Vendas Online'));
    await reg.refresh();
    const after = reg.get('g');
    assert.notEqual(after.version, before.version);
    assert.equal(after.model.elements.get('vendas').name, 'Vendas Online');
  } finally { reg.close(); }
});
