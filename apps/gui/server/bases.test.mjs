import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { loadConfig } from './config.mjs';

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
