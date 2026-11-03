// Text-search evaluation: runs the archlens-ask questions through the agent and scores them against the answer key.
//   node apps/gui/eval/run.mjs [--provider anthropic|openai] [--model M] [--mode tools|json] [--config archlens-gui.json] [--repeat N] [--only id,id] [--dry]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBaseRegistry } from '../server/bases.mjs';
import { createProvider } from '../server/ask/providers.mjs';
import { scripted } from '../server/ask/scripted.mjs';
import { runAsk } from '../server/ask/agent.mjs';
import { renderSpec } from '../server/views.mjs';
import { summarize } from '../server/ask/telemetry.mjs';
import { EVAL_BASE } from '../../../scripts/gen-ask.mjs';
import { loadConfig } from '../server/config.mjs';
import { score } from './compare.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const evalDir = join(root, 'portable/archlens-ask/eval');
const AMBIGUOUS = ['loja.pedidos', 'loja.db-pedidos'];

const turn = calls => ({ text: '', calls: calls.map(([name, input], i) => ({ id: `d${i}`, name, input })), ms: 0, usage: { input: 0, output: 0, cacheRead: 0 } });

// The canned answer of --dry: what the answer key says, to check the plumbing without a key.
function dryTurn(q) {
  if (q.element) return turn([['show_element', { id: q.element }]]);
  if (q.id === 'ambiguo' || q.id === 'grande') return turn([['clarify', { question: 'Qual deles?', options: AMBIGUOUS }]]);
  if (q.view) return turn([['show_view', { view: q.view }]]);
  return turn([['show_view', { spec: q.spec, confirmLarge: true }]]);
}

const percent = f => `${Math.round(f * 100)}%`;
const secs = ms => (ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`);

/** @returns {Promise<{ rows: { id: string, ok: boolean|null, reason: string, ms: number, rounds: number }[], summary: object, meta: object }>} */
export async function runEval({ provider, mode = 'tools', repeat = 1, only, dry = false } = {}) {
  const perguntas = JSON.parse(readFileSync(join(evalDir, 'perguntas.json'), 'utf8'))
    .filter(q => !only || only.includes(q.id));
  const bases = [...new Set([EVAL_BASE, ...perguntas.map(q => q.base).filter(Boolean)])];
  const registry = createBaseRegistry({ port: 0, bases: bases.map(path => ({ id: path, path: join(root, path) })) }, { pollMs: 1e9, remotePollMs: 1e9 });
  const rows = [];
  try {
    for (const q of perguntas) {
      const ctx = registry.get(q.base ?? EVAL_BASE);
      if (!ctx) throw new Error(`base "${q.base ?? EVAL_BASE}" não abriu`);
      let gabarito = null;
      try { gabarito = JSON.parse(readFileSync(join(evalDir, 'gabarito', `${q.id}.json`), 'utf8')); } catch { /* no key */ }
      if (q.id === 'duas-bases') { rows.push({ id: q.id, ...score(q, null, ctx, null), ms: 0, rounds: 0, llm: 0, run: 1 }); continue; }
      for (let run = 1; run <= repeat; run++) {
        const p = dry ? scripted([dryTurn(q)]) : provider;
        let row;
        try {
          const { result, metrics } = await runAsk(ctx, { question: q.pergunta }, { provider: p });
          let render = 0;
          let verdict = score(q, result, ctx, gabarito);
          if (result.kind === 'view') {
            const t = Date.now();
            try { await renderSpec(ctx, result.spec, { get: () => undefined, set() {} }); } catch (e) { verdict = { ok: false, reason: `render falhou: ${e.message}` }; }
            render = Date.now() - t;
          }
          row = { id: q.id, ...verdict, kind: result.kind, ms: metrics.total + render, llm: metrics.llm, rounds: metrics.rounds, run, ...(result.warning ? { warning: result.warning } : {}) };
        } catch (e) {
          row = { id: q.id, ok: false, reason: `erro: ${e.message}`, kind: 'error', ms: 0, llm: 0, rounds: 0, run };
        }
        rows.push(row);
      }
    }
  } finally { registry.close(); }

  const scored = rows.filter(r => r.ok !== null);
  const t = summarize(scored.map(r => ({ ms: { total: r.ms }, rounds: r.rounds, outcome: r.kind })));
  const summary = {
    n: scored.length, accuracy: scored.length ? scored.filter(r => r.ok).length / scored.length : 0,
    clarifications: rows.filter(r => r.kind === 'clarify').length, p50: t.p50, p90: t.p90, oneRound: t.oneRound,
  };
  const meta = { provider: dry ? 'dry' : provider?.name, model: dry ? 'dry' : provider?.model, mode: dry ? 'dry' : mode, repeat };
  return { rows, summary, meta };
}

export function report({ rows, summary, meta }) {
  const lines = [
    `# Avaliação da busca em texto: ${meta.provider} ${meta.model} (${meta.mode}, x${meta.repeat})`, '',
    '| Pergunta | Acerto | Total | LLM | Rodadas | Motivo |', '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.id}${r.run > 1 ? ` #${r.run}` : ''} | ${r.ok === null ? 'manual' : r.ok ? 'sim' : 'não'} | ${secs(r.ms)} | ${secs(r.llm)} | ${r.rounds} | ${String(r.reason).replace(/\|/g, '\\|')} |`),
    '', '## Resumo', '',
    `- Acerto: ${percent(summary.accuracy)} (${summary.n} execuções automáticas)`,
    `- Esclarecimentos: ${summary.clarifications}`,
    `- Total P50: ${secs(summary.p50)} (meta ≤ 15 s; alvo ~5 s); P90: ${secs(summary.p90)} (teto ≤ 60 s)`,
    `- Em uma rodada: ${percent(summary.oneRound)}`, '',
  ];
  return lines.join('\n');
}

function parseArgs(argv) {
  const a = { repeat: 1, mode: 'tools' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry') a.dry = true;
    else if (['--provider', '--model', '--mode', '--repeat', '--only', '--config'].includes(k)) a[k.slice(2)] = argv[++i];
    else throw new Error(`argumento desconhecido: ${k}`);
  }
  a.repeat = Number(a.repeat);
  if (!Number.isInteger(a.repeat) || a.repeat < 1) throw new Error('--repeat deve ser um inteiro >= 1');
  if (!['tools', 'json'].includes(a.mode)) throw new Error('--mode deve ser tools ou json');
  if (a.only) a.only = a.only.split(',');
  return a;
}

/** The provider of the CLI: `--config` reuses the GUI's llm block and its .env (the gateway in real use); flags override. */
export function evalProvider(a, { env = process.env } = {}) {
  let llm = { provider: 'anthropic' };
  if (a.config) {
    const cfg = loadConfig({ file: a.config });
    if (!cfg.llm) throw new Error(`${a.config}: sem bloco "llm"`);
    llm = cfg.llm;
    env = cfg.env;
  }
  return createProvider({ ...llm, ...(a.provider ? { provider: a.provider } : {}), ...(a.model ? { model: a.model } : {}), tools: a.mode === 'tools' }, { env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const provider = a.dry ? undefined : evalProvider(a);
    const out = await runEval({ provider, mode: a.mode, repeat: a.repeat, only: a.only, dry: a.dry });
    const dir = join(here, 'results');
    mkdirSync(dir, { recursive: true });
    const name = `${new Date().toISOString().slice(0, 10)}-${out.meta.model}-${out.meta.mode}`.replace(/[^\w.-]+/g, '_');
    writeFileSync(join(dir, `${name}.md`), report(out));
    writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(out, null, 2)}\n`);
    console.log(report(out));
    console.log(`gravado em apps/gui/eval/results/${name}.{md,json}`);
    process.exit(out.summary.accuracy === 1 || a.dry ? 0 : 1);
  } catch (e) {
    console.error(`eval: ${e.message}`);
    process.exit(2);
  }
}
