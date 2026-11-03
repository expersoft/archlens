// The GUI writes a base exactly as the CLI does: the same delta and answers, applied by /plan/apply and by
// "archlens plan --answers" + "archlens apply" + "archlens build", leave the same folder and the same document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.mjs';
import { scripted } from './ask/scripted.mjs';
import { newDraft } from './plan/draft.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(root, 'scripts/archlens.mjs');
const DELTA = {
  'archlens-delta': '1.0', source: { kind: 'prompt', ref: 'sincronia' },
  model: {
    elements: [
      { id: 'loja.pedidos', name: 'API de Pedidos', type: 'application-component', description: 'Descrição nova vinda da sincronia' },
      { id: 'sistema-novo', name: 'Sistema Novo Zeta', type: 'application-component' },
    ],
    relationships: [{ from: 'loja.bff', to: 'sistema-novo', type: 'serving', description: 'consulta' }],
  },
};
const ANSWERS = { 'el:loja.pedidos:description': 'take' };

function copy() {
  const top = mkdtempSync(join(tmpdir(), 'archlens-sync-'));
  cpSync(join(root, 'examples/loja-online/architecture'), join(top, 'architecture'), { recursive: true });
  cpSync(join(root, 'examples/loja-online/ARCHITECTURE.md'), join(top, 'ARCHITECTURE.md'));
  return top;
}
const answered = plan => ({ ...plan, items: plan.items.map(i => (Object.hasOwn(ANSWERS, i.key) ? { ...i, resolution: ANSWERS[i.key] } : i)) });

/** Every file under `top`, by relative path; the round's date and id (today) are masked. */
function snapshot(top) {
  const today = new Date().toISOString().slice(0, 10);
  const out = {};
  const walk = d => { for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else out[relative(top, p)] = readFileSync(p, 'utf8').replaceAll(today, '<hoje>');
  } };
  walk(top);
  return out;
}

function cli(args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, `archlens ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r;
}

test('sincronia GUI = CLI', async () => {
  const noBrowser = mkdtempSync(join(tmpdir(), 'archlens-nobrowser-'));
  const env = { PLAYWRIGHT_BROWSERS_PATH: noBrowser };

  // CLI
  const viaCli = copy();
  const work = mkdtempSync(join(tmpdir(), 'archlens-sync-work-'));
  const base = join(viaCli, 'architecture');
  writeFileSync(join(work, 'delta.json'), JSON.stringify(DELTA));
  cli(['plan', base, join(work, 'delta.json'), '--out', join(work, 'p1.json')], env);
  const p1 = JSON.parse(readFileSync(join(work, 'p1.json'), 'utf8'));
  assert.equal(p1.state, 'open');
  writeFileSync(join(work, 'p1.json'), JSON.stringify(answered(p1)));
  cli(['plan', base, '--answers', join(work, 'p1.json'), '--out', join(work, 'p2.json')], env);
  assert.equal(JSON.parse(readFileSync(join(work, 'p2.json'), 'utf8')).state, 'final');
  cli(['apply', base, join(work, 'p2.json')], env);
  cli(['build', base], env);

  // GUI
  const viaGui = copy();
  const cfg = { port: 0, bases: [{ id: 'loja', path: join(viaGui, 'architecture') }], llm: { provider: 'anthropic' },
    plan: { maxRounds: 8, timeoutMs: 20000, maxTokens: 100000 } };
  const srv = await startServer({ config: cfg, provider: scripted([]) });
  const saved = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = noBrowser;
  try {
    const post = (path, body) => fetch(`${srv.url}/api/bases/loja/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const first = await (await post('plan/open', { draft: { ...newDraft({ id: 'loja', version: '' }), delta: DELTA } })).json();
    assert.equal(first.draft.plan.state, 'open');
    const final = await (await post('plan/open', { draft: { ...first.draft, plan: answered(first.draft.plan) } })).json();
    assert.equal(final.draft.plan.state, 'final');
    const r = await post('plan/apply', { draft: final.draft, confirm: final.opsHash });
    assert.equal(r.status, 200, await r.clone().text());
  } finally {
    if (saved === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = saved;
    await srv.close();
  }

  const a = snapshot(viaCli), b = snapshot(viaGui);
  assert.deepEqual(Object.keys(b), Object.keys(a));
  for (const k of Object.keys(a)) assert.equal(b[k], a[k], k);
  assert.match(a['ARCHITECTURE.md'], /Sistema Novo Zeta/);
  assert.match(a['architecture/model.json'], /Descrição nova vinda da sincronia/);
});
