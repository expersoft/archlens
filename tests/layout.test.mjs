import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrap, layoutView, frameChipWidth } from '../scripts/lib/layout.mjs';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { resolveView } from '../scripts/lib/query.mjs';

test('wrap honours "\\n" as a forced line break', () => {
  assert.deepEqual(wrap('Autorizador\n(Odin)', 20, 248, 3), ['Autorizador', '(Odin)']);
});

test('wrap still word-wraps each forced line and caps at maxLines', () => {
  const lines = wrap('Cache de Cartões e Portadores\n(Sleipnir)', 20, 248, 3);
  assert.deepEqual(lines, ['Cache de Cartões e', 'Portadores', '(Sleipnir)']);
  const capped = wrap('a\nb\nc\nd', 20, 248, 3);
  assert.equal(capped.length, 3);
  assert.ok(capped[2].endsWith('…'));
});

test('wrap without "\\n" is unchanged', () => {
  assert.deepEqual(wrap('Autorizador (Odin)', 20, 248, 3), ['Autorizador (Odin)']);
});

// Frame layout tests
const plat = () => normalizeModel(JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url))));
const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('C4 landscape: each member sits inside its frame, loose elements outside every frame', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } }));
  assert.deepEqual(laid.frames.map(f => f.id).sort(), ['plat-aut', 'plat-cred']);
  for (const n of laid.nodes) {
    if (n.group) assert.ok(inside(n, laid.frames.find(f => f.id === n.group)), n.id);
    else for (const f of laid.frames) assert.ok(!overlaps(n, f), `${n.id} outside ${f.id}`);
  }
});

test('C4 container: the opened boundary sits inside the frame of its group', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'c', notation: 'c4', level: 'container', scope: 'autorizador', groups: { frames: true } }));
  const frame = laid.frames.find(f => f.id === 'plat-aut');
  assert.ok(inside(laid.boundaries[0], frame));
  assert.ok(inside(laid.nodes.find(n => n.id === 'motor'), laid.frames.find(f => f.id === 'plat-cred')));
});

test('C4: a container with its own group stays inside the opened boundary', async () => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  r.model.elements.find(e => e.id === 'autorizador').children[1].group = 'plat-cred';
  const laid = await layoutView(resolveView(normalizeModel(r), { key: 'c', notation: 'c4', level: 'container', scope: 'autorizador', groups: { frames: true } }));
  assert.ok(inside(laid.nodes.find(n => n.id === 'autorizador.regras'), laid.boundaries[0]));
});

test('C4 without frames lays out exactly as before', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'l', notation: 'c4', level: 'landscape' }));
  assert.deepEqual(laid.frames, []);
});

const amSpec = extra => ({ key: 'g', notation: 'archimate', viewpoint: 'layered', granularity: 'system', groups: { only: ['plat-aut', 'plat-cred'] }, ...extra });

for (const style of ['flow', 'bands-flow']) {
  test(`ArchiMate ${style}: one frame per group × layer, inside its band, around its members`, async () => {
    const laid = await layoutView(resolveView(plat(), amSpec({ layout: { style } })));
    assert.equal(laid.layoutStyle, style);
    assert.deepEqual(laid.frames.map(f => `${f.id}@${f.layer}`).sort(),
      ['plat-aut@application', 'plat-aut@business', 'plat-aut@technology', 'plat-cred@application', 'plat-cred@business']);
    for (const f of laid.frames) {
      const band = laid.bands.find(b => b.layer === f.layer);
      if (!band.vertical) assert.ok(f.y >= band.y - 0.5 && f.y + f.h <= band.y + band.height + 0.5, `${f.key} inside its band`);
      for (const n of laid.nodes.filter(n => n.group === f.id && n.layer === f.layer)) assert.ok(inside(n, f), `${n.id} in ${f.key}`);
    }
  });
}

test('ArchiMate: "bands" cannot draw frames, so it switches to bands-flow and says so; auto never picks bands', async () => {
  const asked = await layoutView(resolveView(plat(), amSpec({ layout: { style: 'bands' } })));
  assert.equal(asked.layoutStyle, 'bands-flow');
  assert.match(asked.layoutNote, /bands/);
  const auto = await layoutView(resolveView(plat(), amSpec()));
  assert.notEqual(auto.layoutStyle, 'bands');
  assert.ok(!('bands' in (auto.layoutScores ?? {})));
});

test('ArchiMate: frames only in the layers the view shows', async () => {
  const laid = await layoutView(resolveView(plat(), amSpec({ viewpoint: 'custom', layers: ['business', 'application'], layout: { style: 'bands-flow' } })));
  assert.ok(laid.frames.every(f => ['business', 'application'].includes(f.layer)));
});

test('ArchiMate without frames lays out as before', async () => {
  const laid = await layoutView(resolveView(plat(), { key: 'l', notation: 'archimate', viewpoint: 'layered', granularity: 'system', layout: { style: 'flow' } }));
  assert.deepEqual(laid.frames, []);
});

test('frames are at least as wide as their chip and stay inside the canvas margin', async () => {
  const platRaw = () => JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  const specs = [
    { key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } },
    { key: 'g', notation: 'archimate', viewpoint: 'layered', granularity: 'system', groups: { only: ['plat-aut', 'plat-cred'] }, layout: { style: 'flow' } },
    { key: 'g', notation: 'archimate', viewpoint: 'layered', granularity: 'system', groups: { only: ['plat-aut', 'plat-cred'] }, layout: { style: 'bands-flow' } },
  ];
  for (const spec of specs) {
    const laid = await layoutView(resolveView(normalizeModel(platRaw()), spec));
    assert.ok(laid.frames.length > 0, spec.layout?.style ?? spec.notation);
    for (const f of laid.frames) {
      const tag = `${spec.notation}/${spec.layout?.style} ${f.id}`;
      assert.ok(f.w >= frameChipWidth(f.name, spec.notation === 'archimate') + 28, `${tag} width ${f.w}`);
      assert.ok(f.x >= 16 && f.x + f.w <= laid.width - 16, `${tag} horizontal ${f.x}..${f.x + f.w} of ${laid.width}`);
      assert.ok(f.y >= 0 && f.y + f.h <= laid.height, `${tag} vertical`);
    }
  }
});

test('a frame in a preview is wide enough for its chip with the change mark', async () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/platforms.json', import.meta.url)));
  // one member and a long-ish name: the chip (not the members) decides the frame width
  raw.model.elements.find(e => e.id === 'plat-cred').name = 'Plataforma de Crédito Digital';
  delete raw.model.elements.find(e => e.id === 'limites').group;
  const v = resolveView(normalizeModel(raw), { key: 'l', notation: 'c4', level: 'landscape', groups: { frames: true } });
  v.groups.find(g => g.id === 'plat-cred').change = 'added';
  const laid = await layoutView(v);
  const fr = laid.frames.find(f => f.id === 'plat-cred');
  assert.ok(fr.w >= frameChipWidth(fr.name, false, true) + 28, `width ${fr.w}`);
});
