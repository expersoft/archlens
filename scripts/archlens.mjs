#!/usr/bin/env node
// archlens CLI — model → knowledge base (ARCHITECTURE.md) → C4 / ArchiMate views → animated HTML.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, basename, join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { normalizeModel } from './lib/model.mjs';
import { validateModel } from './lib/validate.mjs';
import { generateDoc, extractModel } from './lib/doc.mjs';
import { resolveView } from './lib/query.mjs';
import { layoutView, legibility } from './lib/layout.mjs';
import { renderHtml } from './lib/render.mjs';
import { suggestViews } from './lib/suggest.mjs';
import { inspectHtml } from './lib/deliver.mjs';
import { planMerge, applyPlan, mergeError, canonicalJson, hashRaw, PLAN_VERSION } from './lib/merge.mjs';
import { formatPlanReport } from './lib/merge-report.mjs';
import { previewModel, previewSummary, annotateView } from './lib/preview.mjs';

const HELP = `archlens — arquitetura como modelo, diagramas como consultas

Uso: node scripts/archlens.mjs <comando> <modelo.json | ARCHITECTURE.md> [opções]

Comandos
  validate  <modelo>                       valida schema, referências, hierarquia C4 e regras ArchiMate
  doc       <modelo> [--out ARCHITECTURE.md] gera/atualiza a base de conhecimento (preserva blocos keep)
  extract   <ARCHITECTURE.md> [--out m.json] extrai o modelo canônico do markdown
  merge     <base.md> <delta.json> --plan p.json  compara o delta com a base e grava o plano (decisões pendentes)
            [--answers antigo.json]         reaproveita as respostas de um plano anterior (ex.: duplicata = same)
  merge     <base.md> --apply p.json            aplica o plano respondido, regenera a base e registra o histórico
  views     <modelo>                         lista as visões definidas e sugere novas
  resolve   <modelo> --view k | --spec J     imprime o view IR (nós/arestas) de uma visão
  render    <modelo> --out f.html [seleção]  gera o HTML animado
  deliver   <modelo> --out f.html [seleção]  render + screenshots 1920×1080/1280×720 + checagens
  build     <modelo> --out-dir DIR           ARCHITECTURE.md + HTML com todas as visões + checagens

Seleção de visões (render/deliver)
  --view k1,k2        visões do modelo pelo key (padrão: todas as definidas)
  --spec J            JSON inline, arquivo .json, ou lista, com view specs ad hoc
  --suggested         inclui as visões sugeridas por "views"

Prévia de um delta ainda não mergeado (render/deliver/build/resolve/views; nunca grava o ARCHITECTURE.md)
  --delta D           a base com o delta D aplicado (decisões pendentes no padrão do plano)
  --plan P            idem, a partir de um plano (usa as respostas já dadas)

Opções
  --json              saída em JSON (validate, views, resolve, merge --plan)
  --answers P         merge --plan: pré-preenche as respostas do plano P (gere de novo após responder "same")
  --title T           título da página
  --shots DIR         pasta dos screenshots (deliver; padrão: <out>.shots/)
  --strict            deliver: não substitui a saída se alguma checagem falhar
  --open              abre o HTML no navegador ao final
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[k] = true; else { args[k] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function loadRaw(path) {
  if (!path) fail('informe o arquivo do modelo (.json ou ARCHITECTURE.md)');
  if (!existsSync(path)) fail(`arquivo não encontrado: ${path}`);
  const text = readFileSync(path, 'utf8');
  try {
    return extname(path).toLowerCase() === '.md' ? extractModel(text) : JSON.parse(text);
  } catch (e) { fail(e.message); }
}

function fail(msg, code = 1) { console.error(`archlens: ${msg}`); process.exit(code); }

function readJson(path) {
  if (!existsSync(path)) fail(`arquivo não encontrado: ${path}`);
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { fail(`${path}: JSON inválido: ${e.message}`); }
}

function atomicWrite(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function printIssues(list, label) {
  for (const i of list) console.log(`  ${label} ${i.code}  ${i.message}\n      em ${i.path} — ${i.hint}`);
}

function loadSpecs(arg) {
  if (!arg || arg === true) return [];
  const text = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
  let v;
  try { v = JSON.parse(text); } catch (e) { fail(`--spec inválido: ${e.message}`); }
  return Array.isArray(v) ? v : [v];
}

function selectSpecs(model, args) {
  let specs = [];
  if (args.view && args.view !== true) {
    for (const k of String(args.view).split(',')) {
      const v = model.views.find(x => x.key === k) ?? suggestViews(model).find(x => x.key === k);
      if (!v) fail(`visão "${k}" não existe (veja "archlens views")`);
      specs.push(v);
    }
  }
  specs.push(...loadSpecs(args.spec));
  if (args.suggested) specs.push(...suggestViews(model).filter(s => !model.views.some(v => v.key === s.key)));
  if (!specs.length) specs = model.views.length ? model.views : suggestViews(model);
  if (!specs.length) fail('nenhuma visão definida nem sugerida');
  return specs;
}

async function buildHtml(raw, specs, title, preview) {
  const { errors } = validateModel(raw);
  if (errors.length) { printIssues(errors, 'ERRO'); fail(`${errors.length} erro(s) no modelo; corrija antes de renderizar`, 2); }
  const model = normalizeModel(raw);
  const laid = [];
  for (const spec of specs) {
    let view;
    try { view = resolveView(model, spec, preview ? { keep: preview.keep } : {}); } catch (e) {
      if (preview) { console.warn(`  aviso: visão "${spec.key}" não abre na prévia: ${e.message}`); continue; }
      fail(`visão "${spec.key}": ${e.message}`, 2);
    }
    if (preview) annotateView(view, preview);
    if (!view.nodes.length) { console.warn(`  aviso: visão "${spec.key}" ficou vazia — revise scope/anchor/filtros`); continue; }
    if (view.nodes.length > 40) console.warn(`  aviso: visão "${spec.key}" tem ${view.nodes.length} nós; considere focus/depth, collapse ou layers`);
    const l = await layoutView(view);
    if (l.layoutStyle) console.log(`  layout "${spec.key}": ${l.layoutStyle}${l.layoutAuto ? ` (auto; ${Object.entries(l.layoutScores).map(([k, q]) => `${k} ${q.score}`).join(', ')})` : ' (pedido na visão)'}`);
    const leg = legibility(l, 1920, 1080 - 56);
    if (!leg.ok) console.warn(`  aviso: "${spec.key}": ${leg.suggestion}`);
    laid.push(l);
  }
  if (!laid.length) fail('nenhuma visão com conteúdo', 2);
  const subtitle = `${laid.length} visão(ões) · archlens${preview ? ' · prévia' : ''}`;
  return { html: renderHtml({ title: title ?? model.name, subtitle, views: laid, ...(preview ? { preview: { label: preview.label } } : {}) }), laid };
}

function openFile(path) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : (existsSync('/proc/sys/fs/binfmt_misc/WSLInterop') ? 'wslview' : 'xdg-open');
  const a = process.platform === 'win32' ? ['/c', 'start', '', path] : [path];
  try { spawn(cmd, a, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch { /* ignore */ }
}

async function deliver(raw, specs, out, args, preview) {
  const { html } = await buildHtml(raw, specs, args.title, preview);
  const tmp = out.replace(/\.html?$/i, '') + `.candidate-${process.pid}.html`;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(tmp, html);
  const shots = args.shots && args.shots !== true ? args.shots : out.replace(/\.html?$/i, '') + '.shots';
  const report = await inspectHtml(tmp, { shotsDir: shots });
  let problems = 0;
  if (!report.available) {
    console.warn(`  aviso: checagem visual pulada: ${report.reason}`);
  } else {
    console.log('  visão                          viewport    largura  fonte');
    for (const r of report.results) {
      const status = r.issues.length ? '✗' : '✓';
      if (r.issues.length) problems++;
      console.log(`  ${status} ${r.key.padEnd(30)} ${r.viewport.padEnd(10)} ${r.fill === null ? '   —' : `${(r.fill * 100).toFixed(0).padStart(3)}%`}   ${r.minFontPx ?? '—'}px`);
      for (const i of r.issues) console.log(`      ${i}`);
    }
    console.log(`  screenshots em ${shots}/`);
  }
  if (problems && args.strict) {
    renameSync(tmp, out.replace(/\.html?$/i, '') + '.rejected.html');
    fail(`${problems} checagem(ns) falharam; saída anterior mantida (--strict)`, 3);
  }
  renameSync(tmp, out);
  console.log(`✓ ${out}${problems ? ` (com ${problems} alerta(s) de qualidade)` : ''}`);
  if (args.open) openFile(out);
  return problems;
}

/** Preview mode (--delta / --plan): the model with the delta applied, never written; exits on bad input. */
function loadPreview(file, args) {
  if (args.delta && args.plan) fail('use --delta ou --plan, não os dois');
  const input = args.delta ?? args.plan;
  if (input === true) fail('informe o arquivo: --delta <delta.json> ou --plan <plano.json>');
  const baseRaw = file && existsSync(file) ? loadRaw(file) : null;
  const doc = readJson(input);
  if (args.plan && doc.baseHash && doc.baseHash !== hashRaw(baseRaw)) {
    console.warn('  aviso: a base mudou depois deste plano; a prévia usa a base atual');
  }
  let p;
  try { p = previewModel(baseRaw, args.delta ? { delta: doc } : { plan: doc }); } catch (e) {
    if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
    fail(e.message, 2);
  }
  p.label = `${basename(input)} · ${previewSummary(p)}`;
  p.name = `${basename(input).replace(/\.json$/i, '')}-preview`;
  return p;
}

/** key → resolution of the answered items of an earlier plan (for merge --plan --answers). */
function answersFrom(old, delta) {
  if (old?.['archlens-plan'] !== PLAN_VERSION || !Array.isArray(old.items)) {
    throw mergeError('E_PLAN_SCHEMA', '--answers precisa de um plano do archlens (gerado por "archlens merge --plan")');
  }
  if (canonicalJson(old.delta) !== canonicalJson(delta)) {
    console.warn('  aviso: o plano de --answers foi gerado com outro delta; confira as respostas pré-preenchidas');
  }
  return new Map(old.items.filter(i => i.resolution != null).map(i => [i.key, i.resolution]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, file] = args._;
  if (!cmd || args.help || cmd === 'help') { console.log(HELP); return; }
  const previewing = ['render', 'deliver', 'build', 'resolve', 'views'].includes(cmd) && (args.delta || args.plan);
  const preview = previewing ? loadPreview(file, args) : null;
  if (preview && cmd !== 'resolve') console.log(`prévia de ${preview.label}`);
  const load = () => (preview ? preview.raw : loadRaw(file));

  switch (cmd) {
    case 'validate': {
      const { errors, warnings } = validateModel(loadRaw(file));
      if (args.json) { console.log(JSON.stringify({ ok: !errors.length, errors, warnings }, null, 2)); }
      else {
        printIssues(errors, 'ERRO');
        printIssues(warnings, 'aviso');
        console.log(errors.length ? `✗ ${errors.length} erro(s), ${warnings.length} aviso(s)` : `✓ modelo válido (${warnings.length} aviso(s))`);
      }
      process.exitCode = errors.length ? 2 : 0;
      break;
    }
    case 'doc': {
      const raw = loadRaw(file);
      const { errors } = validateModel(raw);
      if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros antes de gerar o documento', 2); }
      const isMd = extname(file).toLowerCase() === '.md';
      const out = args.out && args.out !== true ? args.out : isMd ? file : join(dirname(file), 'ARCHITECTURE.md');
      const existing = existsSync(out) ? readFileSync(out, 'utf8') : isMd ? readFileSync(file, 'utf8') : undefined;
      atomicWrite(out, generateDoc(raw, { existing }));
      console.log(`✓ ${out}`);
      break;
    }
    case 'extract': {
      const raw = loadRaw(file);
      const text = JSON.stringify(raw, null, 2) + '\n';
      if (args.out && args.out !== true) { atomicWrite(args.out, text); console.log(`✓ ${args.out}`); } else process.stdout.write(text);
      break;
    }
    case 'views': {
      const model = normalizeModel(load());
      const suggested = suggestViews(model).filter(s => !model.views.some(v => v.key === s.key));
      if (args.json) { console.log(JSON.stringify({ defined: model.views, suggested }, null, 2)); break; }
      console.log('Visões definidas:');
      for (const v of model.views) console.log(`  ${v.key.padEnd(34)} ${v.notation.padEnd(9)} ${v.level ?? v.viewpoint ?? ''} ${v.scope ?? v.anchor ?? ''}`);
      if (!model.views.length) console.log('  (nenhuma)');
      console.log('\nSugestões (use --view <key> em render/deliver, ou copie para "views"):');
      for (const s of suggested) console.log(`  ${s.key.padEnd(34)} ${s.notation.padEnd(9)} ${s.why}`);
      break;
    }
    case 'resolve': {
      const model = normalizeModel(load());
      const specs = selectSpecs(model, args);
      const out = specs.map(s => { const v = resolveView(model, s, preview ? { keep: preview.keep } : {}); return preview ? annotateView(v, preview) : v; });
      console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
      break;
    }
    case 'render': {
      const raw = load();
      const model = normalizeModel(raw);
      if (!args.out || args.out === true) fail('informe --out arquivo.html');
      const { html } = await buildHtml(raw, selectSpecs(model, args), args.title, preview);
      atomicWrite(args.out, html);
      console.log(`✓ ${args.out}`);
      if (args.open) openFile(args.out);
      break;
    }
    case 'deliver': {
      const raw = load();
      const model = normalizeModel(raw);
      if (!args.out || args.out === true) fail('informe --out arquivo.html');
      const problems = await deliver(raw, selectSpecs(model, args), args.out, args, preview);
      process.exitCode = problems ? 3 : 0;
      break;
    }
    case 'build': {
      const raw = load();
      const model = normalizeModel(raw);
      const dir = args['out-dir'] && args['out-dir'] !== true ? args['out-dir'] : dirname(file);
      mkdirSync(dir, { recursive: true });
      if (!preview) {
        const docPath = join(dir, 'ARCHITECTURE.md');
        const { errors } = validateModel(raw);
        if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros do modelo', 2); }
        const existing = existsSync(docPath) ? readFileSync(docPath, 'utf8') : extname(file).toLowerCase() === '.md' ? readFileSync(file, 'utf8') : undefined;
        atomicWrite(docPath, generateDoc(raw, { existing }));
        console.log(`✓ ${docPath}`);
      }
      const base = args.name && args.name !== true ? args.name
        : preview ? preview.name
          : basename(file).replace(/\.(json|md)$/i, '').replace(/^ARCHITECTURE$/i, 'architecture').replace(/\.model$/, '');
      const problems = await deliver(raw, selectSpecs(model, args), join(dir, `${base}.html`), args, preview);
      process.exitCode = problems ? 3 : 0;
      break;
    }
    case 'merge': {
      const usage = 'uso: archlens merge <base.md> <delta.json> --plan <plano.json> [--answers <plano-anterior.json>]  |  archlens merge <base.md> --apply <plano.json>';
      if (!file || extname(file).toLowerCase() !== '.md') fail(`a base do merge é o ARCHITECTURE.md (o bloco archlens-json é a fonte de verdade)\n${usage}`);
      const baseRaw = existsSync(file) ? loadRaw(file) : null;
      if (args.plan && args.plan !== true) {
        const deltaPath = args._[2];
        if (!deltaPath) fail(usage);
        let plan;
        try {
          const delta = readJson(deltaPath);
          const answers = args.answers && args.answers !== true ? answersFrom(readJson(args.answers), delta) : undefined;
          plan = planMerge(baseRaw, delta, { base: basename(file), answers });
        } catch (e) { fail(e.message, 2); }
        atomicWrite(args.plan, JSON.stringify(plan, null, 2) + '\n');
        if (args.json) console.log(JSON.stringify(plan, null, 2));
        else console.log(`${formatPlanReport(plan)}\n\n✓ plano em ${args.plan}`);
        process.exitCode = plan.blocked ? 2 : 0;
      } else if (args.apply && args.apply !== true) {
        let res;
        try { res = applyPlan(baseRaw, readJson(args.apply)); } catch (e) {
          if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
          fail(e.message, 2);
        }
        if (!res.entry) { console.log('= nada mudou; a base não foi regravada'); break; }
        atomicWrite(file, generateDoc(res.raw, { existing: existsSync(file) ? readFileSync(file, 'utf8') : undefined }));
        const e = res.entry;
        const st = Object.keys(e.status).length;
        console.log(`✓ ${file} (revisão ${res.raw.changelog.length}): +${e.added.length} ~${e.changed.length} −${e.removed.length}${st ? `, ${st} mudança(s) de status` : ''}`);
        console.log(`  commit sugerido: git add ${file} && git commit -m ${JSON.stringify(`docs(arquitetura): ${e.summary}`)}`);
      } else fail(usage);
      break;
    }
    default:
      fail(`comando desconhecido "${cmd}"\n\n${HELP}`);
  }
}

main().catch(e => fail(e.stack || e.message));
