import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseRegistry } from './bases.mjs';
import { newDraft, checkDraft, replanDraft, cleanRepoUrl, DRAFT_VERSION, DRAFT_MAX_BYTES } from './plan/draft.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function withBase(fn) {
  const dir = join(mkdtempSync(join(tmpdir(), 'archlens-draft-')), 'arch');
  cpSync(join(root, 'examples/loja-online/architecture'), dir, { recursive: true });
  const reg = createBaseRegistry({ port: 1, bases: [{ id: 'loja-online', path: dir }] }, { pollMs: 100000 });
  try { return fn(reg.get('loja-online')); } finally { reg.close(); }
}

// "Cliente" exists as business-actor: a new id with the same name is a possible duplicate.
const dupDelta = {
  'archlens-delta': '1.0',
  source: { kind: 'prompt', ref: 'teste' },
  model: { elements: [{ id: 'cliente-novo', name: 'Cliente', type: 'business-actor' }], relationships: [] },
};
const rejects = (fn, re) => assert.throws(fn, e => e.code === 'E_GUI_DRAFT' && re.test(e.message));

test('newDraft traz a base e a versão do formato', () => withBase(ctx => {
  const d = newDraft(ctx);
  assert.equal(d['archlens-draft'], DRAFT_VERSION);
  assert.deepEqual(d.base, { id: 'loja-online', version: ctx.version });
  assert.equal(d.delta, null);
  assert.equal(d.plan, null);
  assert.equal(d.note, '');
  assert.equal(d.repo, null);
  assert.match(d.archlens, /^\d+\.\d+\.\d+/);
  assert.deepEqual(checkDraft(JSON.parse(JSON.stringify(d)), ctx), d);
}));

test('checkDraft recusa outra base', () => withBase(ctx => {
  const d = { ...newDraft(ctx), base: { id: 'outra', version: 'x' } };
  rejects(() => checkDraft(d, ctx), /este rascunho é da base "outra"/);
}));

test('checkDraft recusa versão desconhecida, campos a mais e tamanho acima do limite', () => withBase(ctx => {
  const d = newDraft(ctx);
  rejects(() => checkDraft({ ...d, 'archlens-draft': '9.9' }, ctx), /versão/);
  rejects(() => checkDraft({ ...d, extra: 1 }, ctx), /extra/);
  rejects(() => checkDraft(null, ctx), /rascunho/);
  rejects(() => checkDraft({ ...d, note: 'x'.repeat(DRAFT_MAX_BYTES) }, ctx), /grande/);
}));

test('checkDraft recusa repo com credencial na URL; cleanRepoUrl também', () => withBase(ctx => {
  const d = { ...newDraft(ctx), repo: { url: 'https://x:y@h/r.git', commit: 'abc' } };
  rejects(() => checkDraft(d, ctx), /credencial/);
  rejects(() => cleanRepoUrl('https://x:y@h/r.git'), /credencial/);
  rejects(() => cleanRepoUrl('https://token@h/r.git'), /credencial/);
  rejects(() => cleanRepoUrl(' https://x:y@h/r.git'), /credencial/);
  rejects(() => cleanRepoUrl('http://token@h/r.git'), /credencial/);
  rejects(() => cleanRepoUrl('ssh://user:pass@h/r.git'), /credencial/);
  assert.equal(cleanRepoUrl('ssh://git@github.com/o/r.git'), 'ssh://git@github.com/o/r.git');
  assert.equal(cleanRepoUrl('  https://h/r.git '), 'https://h/r.git');
  assert.equal(cleanRepoUrl('https://h/r.git'), 'https://h/r.git');
  assert.equal(cleanRepoUrl('git@github.com:o/r.git'), 'git@github.com:o/r.git');
  const ok = { ...newDraft(ctx), repo: { url: 'https://h/r.git', ref: 'main', commit: 'abc' } };
  assert.deepEqual(checkDraft(ok, ctx).repo, ok.repo);
}));

test('checkDraft recusa delta inválido e plano sem delta', () => withBase(ctx => {
  rejects(() => checkDraft({ ...newDraft(ctx), delta: { elements: [] } }, ctx), /delta/);
  rejects(() => checkDraft({ ...newDraft(ctx), plan: { 'archlens-plan': '1.0', items: [] } }, ctx), /plano/);
}));

test('replanDraft reaproveita as respostas', () => withBase(ctx => {
  const base = { ...newDraft(ctx), delta: dupDelta };
  const { draft: open } = replanDraft(ctx, base);
  assert.equal(open.plan.state, 'open');
  const dup = open.plan.items.find(i => i.class === 'possible-duplicate');
  assert.ok(dup, 'o delta gera uma possível duplicata');
  dup.resolution = 'same';
  const { draft, warning } = replanDraft(ctx, open);
  assert.equal(warning, undefined);
  assert.equal(draft.plan.state, 'final');
  assert.equal(draft.plan.items.find(i => i.key === dup.key).resolution, 'same');
}));

test('replanDraft avisa quando a base mudou', () => withBase(ctx => {
  const d = { ...newDraft(ctx), base: { id: ctx.id, version: 'antiga' }, delta: dupDelta };
  const { draft, warning } = replanDraft(ctx, d);
  assert.equal(warning, 'a base mudou desde este rascunho; o plano foi refeito contra a base atual');
  assert.equal(draft.base.version, ctx.version);
}));

test('checkDraft não confia no plano do arquivo', () => withBase(ctx => {
  const { draft: open } = replanDraft(ctx, { ...newDraft(ctx), delta: dupDelta });
  open.plan.items.find(i => i.class === 'possible-duplicate').resolution = 'different';
  const { draft: fin } = replanDraft(ctx, open);
  assert.equal(fin.plan.state, 'final');
  const evil = JSON.parse(JSON.stringify(fin));
  evil.plan.ops.push({ op: 'delete', ref: 'element:cliente' });
  evil.plan.entry = { forged: true };
  const checked = checkDraft(evil, ctx);
  const { draft } = replanDraft(ctx, checked);
  assert.equal(JSON.stringify(draft.plan.ops), JSON.stringify(fin.plan.ops));
  assert.ok(!JSON.stringify(draft.plan).includes('forged'));
}));

test('checkDraft valida o consumo (usage.tokens)', () => withBase(ctx => {
  assert.deepEqual(newDraft(ctx).usage, { tokens: 0 });
  const { usage, ...legacy } = newDraft(ctx);
  assert.ok(checkDraft(legacy, ctx));
  assert.deepEqual(checkDraft({ ...newDraft(ctx), usage: { tokens: 42 } }, ctx).usage, { tokens: 42 });
  for (const bad of [{ tokens: -1 }, { tokens: 1.5 }, { tokens: '3' }, {}, 5, null]) {
    rejects(() => checkDraft({ ...newDraft(ctx), usage: bad }, ctx), /consumo/);
  }
}));
