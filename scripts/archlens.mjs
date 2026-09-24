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

const HELP = `archlens — arquitetura como modelo, diagramas como consultas

Uso: node scripts/archlens.mjs <comando> <modelo.json | ARCHITECTURE.md> [opções]

Comandos
  validate  <modelo>                       valida schema, referências, hierarquia C4 e regras ArchiMate
  doc       <modelo> [--out ARCHITECTURE.md] gera/atualiza a base de conhecimento (preserva blocos keep)
  extract   <ARCHITECTURE.md> [--out m.json] extrai o modelo canônico do markdown
  views     <modelo>                         lista as visões definidas e sugere novas
  resolve   <modelo> --view k | --spec J     imprime o view IR (nós/arestas) de uma visão
  render    <modelo> --out f.html [seleção]  gera o HTML animado
  deliver   <modelo> --out f.html [seleção]  render + screenshots 1920×1080/1280×720 + checagens
  build     <modelo> --out-dir DIR           ARCHITECTURE.md + HTML com todas as visões + checagens

Seleção de visões (render/deliver)
  --view k1,k2        visões do modelo pelo key (padrão: todas as definidas)
  --spec J            JSON inline, arquivo .json, ou lista, com view specs ad hoc
  --suggested         inclui as visões sugeridas por "views"

Opções
  --json              saída em JSON (validate, views, resolve)
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

async function buildHtml(raw, specs, title) {
  const { errors } = validateModel(raw);
  if (errors.length) { printIssues(errors, 'ERRO'); fail(`${errors.length} erro(s) no modelo; corrija antes de renderizar`, 2); }
  const model = normalizeModel(raw);
  const laid = [];
  for (const spec of specs) {
    let view;
    try { view = resolveView(model, spec); } catch (e) { fail(`visão "${spec.key}": ${e.message}`, 2); }
    if (!view.nodes.length) { console.warn(`  aviso: visão "${spec.key}" ficou vazia — revise scope/anchor/filtros`); continue; }
    if (view.nodes.length > 40) console.warn(`  aviso: visão "${spec.key}" tem ${view.nodes.length} nós; considere focus/depth, collapse ou layers`);
    const l = await layoutView(view);
    const leg = legibility(l, 1920, 1080 - 56);
    if (!leg.ok) console.warn(`  aviso: "${spec.key}": ${leg.suggestion}`);
    laid.push(l);
  }
  if (!laid.length) fail('nenhuma visão com conteúdo', 2);
  return { html: renderHtml({ title: title ?? model.name, subtitle: `${laid.length} visão(ões) · archlens`, views: laid }), laid };
}

function openFile(path) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : (existsSync('/proc/sys/fs/binfmt_misc/WSLInterop') ? 'wslview' : 'xdg-open');
  const a = process.platform === 'win32' ? ['/c', 'start', '', path] : [path];
  try { spawn(cmd, a, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch { /* ignore */ }
}

async function deliver(raw, specs, out, args) {
  const { html } = await buildHtml(raw, specs, args.title);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, file] = args._;
  if (!cmd || args.help || cmd === 'help') { console.log(HELP); return; }

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
      const out = args.out && args.out !== true ? args.out : join(dirname(file), 'ARCHITECTURE.md');
      const existing = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
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
      const model = normalizeModel(loadRaw(file));
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
      const model = normalizeModel(loadRaw(file));
      const specs = selectSpecs(model, args);
      const out = specs.map(s => resolveView(model, s));
      console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
      break;
    }
    case 'render': {
      const raw = loadRaw(file);
      const model = normalizeModel(raw);
      if (!args.out || args.out === true) fail('informe --out arquivo.html');
      const { html } = await buildHtml(raw, selectSpecs(model, args), args.title);
      atomicWrite(args.out, html);
      console.log(`✓ ${args.out}`);
      if (args.open) openFile(args.out);
      break;
    }
    case 'deliver': {
      const raw = loadRaw(file);
      const model = normalizeModel(raw);
      if (!args.out || args.out === true) fail('informe --out arquivo.html');
      const problems = await deliver(raw, selectSpecs(model, args), args.out, args);
      process.exitCode = problems ? 3 : 0;
      break;
    }
    case 'build': {
      const raw = loadRaw(file);
      const model = normalizeModel(raw);
      const dir = args['out-dir'] && args['out-dir'] !== true ? args['out-dir'] : dirname(file);
      mkdirSync(dir, { recursive: true });
      const docPath = join(dir, 'ARCHITECTURE.md');
      if (extname(file).toLowerCase() !== '.md' || resolve(file) !== resolve(docPath)) {
        const { errors } = validateModel(raw);
        if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros do modelo', 2); }
        atomicWrite(docPath, generateDoc(raw, { existing: existsSync(docPath) ? readFileSync(docPath, 'utf8') : undefined }));
        console.log(`✓ ${docPath}`);
      }
      const name = (args.name && args.name !== true ? args.name : basename(file).replace(/\.(json|md)$/i, '').replace(/^ARCHITECTURE$/i, 'architecture').replace(/\.model$/, '')) + '.html';
      const problems = await deliver(raw, selectSpecs(model, args), join(dir, name), args);
      process.exitCode = problems ? 3 : 0;
      break;
    }
    default:
      fail(`comando desconhecido "${cmd}"\n\n${HELP}`);
  }
}

main().catch(e => fail(e.stack || e.message));
