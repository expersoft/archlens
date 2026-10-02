#!/usr/bin/env node
// archlens CLI — model → knowledge base (ARCHITECTURE.md) → C4 / ArchiMate views → animated HTML.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, basename, extname, join, resolve, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { normalizeModel } from './lib/model.mjs';
import { validateModel } from './lib/validate.mjs';
import { generateDoc } from './lib/doc.mjs';
import { resolveView } from './lib/query.mjs';
import { layoutView, legibility } from './lib/layout.mjs';
import { renderHtml } from './lib/render.mjs';
import { suggestViews } from './lib/suggest.mjs';
import { inspectHtml } from './lib/deliver.mjs';
import { planMerge, applyPlan, mergeError, canonicalJson, hashRaw, PLAN_VERSION } from './lib/merge.mjs';
import { formatPlanReport } from './lib/merge-report.mjs';
import { previewModel, previewSummary, annotateView } from './lib/preview.mjs';
import { resolveBase, openStore, frontmatterSource, MANIFEST } from './lib/store/index.mjs';

const HELP = `archlens — arquitetura como modelo, diagramas como consultas

Uso: node scripts/archlens.mjs <comando> [base] [opções]

Base: a pasta architecture/ (fonte da verdade), o ARCHITECTURE.md gerado (aponta para ela) ou nada (procura a
partir do diretório atual). Bases antigas (bloco archlens-json no .md, ou um modelo .json) são lidas, mas só
"migrate" as converte para gravar.

Comandos
  validate  <base>                         valida schema, referências, hierarquia C4 e regras ArchiMate
  doc       <base> [--out f.md]            regenera o ARCHITECTURE.md (gerado; edite architecture/notes/*.md)
  extract   <base> [--out m.json]          imprime o modelo canônico em JSON
  merge     <base> <delta.json> --plan p.json  compara o delta com a base e grava o plano (decisões pendentes)
            [--answers antigo.json]         reaproveita as respostas de um plano anterior (ex.: duplicata = same)
  merge     <base> --apply p.json               aplica o plano respondido, regrava a base e registra o histórico
  views     <base>                           lista as visões definidas e sugere novas
  resolve   <base> --view k | --spec J       imprime o view IR (nós/arestas) de uma visão
  render    <base> --out f.html [seleção]    gera o HTML animado
  deliver   <base> --out f.html [seleção]    render + screenshots 1920×1080/1280×720 + checagens
  build     <base> [--out-dir DIR]           ARCHITECTURE.md + HTML (padrão: architecture/diagrams/)
  migrate   <ARCHITECTURE.md|m.json> [--to DIR]  converte uma base antiga para a pasta architecture/
  check     [base] [--json]               valida e confere se o ARCHITECTURE.md está em dia (CI / pre-commit)

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

const relPath = p => relative(process.cwd(), p) || '.';

/** The knowledge base named by `arg` (or found from the cwd); exits with the store's message on errors. */
function openBase(arg, { create = false } = {}) {
  try { return openStore(resolveBase(arg, { create })); } catch (e) { fail(e.message); }
}

function loadBase(store) {
  try { return store.load(); } catch (e) { fail(e.message); }
}

function requireRaw(store) {
  const res = loadBase(store);
  if (!res.raw) fail(`base não encontrada: ${store.describe()} (crie-a com "archlens merge <base> delta.json --plan plano.json")`);
  return res;
}

function assertWritable(store) {
  try { store.assertWritable(); } catch (e) { fail(e.message); }
}

/**
 * Refuses to replace a document this base does not own: `out` may be missing, generated from this base (its
 * `source:` points to the folder), or the file being converted (`replacing`, e.g. the old .md migrate read).
 */
function assertDocOwned(store, out = store.locator.docPath, { replacing } = {}) {
  const p = resolve(out);
  if (!existsSync(p) || (replacing && resolve(replacing) === p)) return;
  const src = frontmatterSource(readFileSync(p, 'utf8'));
  if (src && resolve(dirname(p), src) === resolve(store.locator.path)) return;
  fail(`E_STORE_DOC_FOREIGN: ${relPath(p)} existe e não foi gerado por esta base (sem "source:" apontando para ${relPath(store.locator.path)}/); `
    + 'mova-o, gere em outro lugar com --out, ou transforme o conteúdo dele em um delta (texto livre) antes.');
}

/** Regenerates ARCHITECTURE.md (or `out`) from a folder base; `source:` is the folder relative to the document. */
function writeDoc(store, raw, notes, out = store.locator.docPath, { replacing } = {}) {
  assertDocOwned(store, out, { replacing });
  atomicWrite(out, generateDoc(raw, { notes, source: docSource(store, out) }));
  return out;
}

/** The `source:` value of the document at `out`: the folder base relative to it, with a trailing slash. */
const docSource = (store, out = store.locator.docPath) =>
  `${relative(dirname(resolve(out)), store.locator.path).split(sep).join('/') || '.'}/`;

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

/** In a preview, `defined` is the preview's view list (base views stay selectable even if the delta drops them). */
function selectSpecs(model, args, defined = model.views) {
  let specs = [];
  if (args.view && args.view !== true) {
    for (const k of String(args.view).split(',')) {
      const v = defined.find(x => x.key === k) ?? suggestViews(model).find(x => x.key === k);
      if (!v) fail(`visão "${k}" não existe (veja "archlens views")`);
      specs.push(v);
    }
  }
  specs.push(...loadSpecs(args.spec));
  if (args.suggested) specs.push(...suggestViews(model).filter(s => !defined.some(v => v.key === s.key)));
  if (!specs.length) specs = defined.length ? defined : suggestViews(model);
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
function loadPreview(store, args) {
  if (args.delta && args.plan) fail('use --delta ou --plan, não os dois');
  const input = args.delta ?? args.plan;
  if (input === true) fail('informe o arquivo: --delta <delta.json> ou --plan <plano.json>');
  const baseRaw = loadBase(store).raw;
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
  const create = cmd === 'merge' || (previewing && file != null);
  const BASE_CMDS = ['validate', 'doc', 'extract', 'views', 'resolve', 'render', 'deliver', 'build', 'merge', 'check'];
  const store = BASE_CMDS.includes(cmd) ? openBase(file, { create }) : null; // migrate opens its own; unknown → default
  const preview = previewing ? loadPreview(store, args) : null;
  if (preview && cmd !== 'resolve' && !args.json) console.log(`prévia de ${preview.label}`);
  if (preview?.droppedViews.length) {
    const say = cmd === 'resolve' || args.json ? console.warn : console.log;
    say(`  visões afetadas pelo delta (somem ou mudam no apply): ${preview.droppedViews.join(', ')}`);
  }
  const specsOf = model => selectSpecs(model, args, preview ? preview.views : model.views);
  const base = store && !preview && cmd !== 'merge' ? requireRaw(store) : null;
  const load = () => (preview ? preview.raw : base.raw);

  switch (cmd) {
    case 'validate': {
      const { errors, warnings } = validateModel(base.raw);
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
      assertWritable(store);
      const { errors } = validateModel(base.raw);
      if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros antes de gerar o documento', 2); }
      const out = writeDoc(store, base.raw, base.notes, args.out && args.out !== true ? args.out : undefined);
      console.log(`✓ ${relPath(out)}`);
      break;
    }
    case 'extract': {
      const text = JSON.stringify(base.raw, null, 2) + '\n';
      if (args.out && args.out !== true) { atomicWrite(args.out, text); console.log(`✓ ${args.out}`); } else process.stdout.write(text);
      break;
    }
    case 'views': {
      const model = normalizeModel(load());
      const defined = preview ? preview.views : model.views;
      const suggested = suggestViews(model).filter(s => !defined.some(v => v.key === s.key));
      if (args.json) { console.log(JSON.stringify({ defined, suggested }, null, 2)); break; }
      console.log('Visões definidas:');
      for (const v of defined) console.log(`  ${v.key.padEnd(34)} ${v.notation.padEnd(9)} ${v.level ?? v.viewpoint ?? ''} ${v.scope ?? v.anchor ?? ''}`);
      if (!defined.length) console.log('  (nenhuma)');
      console.log('\nSugestões (use --view <key> em render/deliver, ou copie para "views"):');
      for (const s of suggested) console.log(`  ${s.key.padEnd(34)} ${s.notation.padEnd(9)} ${s.why}`);
      break;
    }
    case 'resolve': {
      const model = normalizeModel(load());
      const specs = specsOf(model);
      const out = specs.map(s => { const v = resolveView(model, s, preview ? { keep: preview.keep } : {}); return preview ? annotateView(v, preview) : v; });
      console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
      break;
    }
    case 'render': {
      const raw = load();
      const model = normalizeModel(raw);
      if (!args.out || args.out === true) fail('informe --out arquivo.html');
      const { html } = await buildHtml(raw, specsOf(model), args.title, preview);
      atomicWrite(args.out, html);
      console.log(`✓ ${args.out}`);
      if (args.open) openFile(args.out);
      break;
    }
    case 'deliver': {
      const raw = load();
      const model = normalizeModel(raw);
      if (!args.out || args.out === true) fail('informe --out arquivo.html');
      const problems = await deliver(raw, specsOf(model), args.out, args, preview);
      process.exitCode = problems ? 3 : 0;
      break;
    }
    case 'build': {
      const raw = load();
      const model = normalizeModel(raw);
      const loc = store.locator;
      const dir = args['out-dir'] && args['out-dir'] !== true ? args['out-dir']
        : loc.kind === 'folder' && loc.exists ? join(loc.path, 'diagrams') : dirname(loc.path);
      if (!preview) {
        assertWritable(store);
        const { errors } = validateModel(raw);
        if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros do modelo', 2); }
        console.log(`✓ ${relPath(writeDoc(store, raw, base.notes))}`);
      }
      mkdirSync(dir, { recursive: true });
      const name = args.name && args.name !== true ? args.name
        : preview ? preview.name
          : loc.kind === 'folder' ? 'architecture'
            : basename(loc.path).replace(/\.(json|md)$/i, '').replace(/^ARCHITECTURE$/i, 'architecture').replace(/\.model$/, '');
      const problems = await deliver(raw, specsOf(model), join(dir, `${name}.html`), args, preview);
      process.exitCode = problems ? 3 : 0;
      break;
    }
    case 'migrate': {
      if (!file) fail('uso: archlens migrate <ARCHITECTURE.md | modelo.json> [--to <pasta>]');
      let loc;
      try { loc = resolveBase(file); } catch (e) { fail(e.message); }
      if (loc.kind !== 'legacy') fail(`${file} já está no formato novo (${relPath(loc.path)}/)`);
      const { raw, notes } = loadBase(openStore(loc));
      const { errors } = validateModel(raw);
      if (errors.length) { printIssues(errors, 'ERRO'); fail('corrija os erros do modelo antes de migrar; nada foi gravado', 2); }
      const to = resolve(args.to && args.to !== true ? args.to : join(dirname(loc.path), 'architecture'));
      let target;
      try { target = resolveBase(to, { create: true }); } catch (e) {
        fail(e.code === 'E_STORE_NOT_BASE' && !(args.to && args.to !== true) ? `${e.message}; use --to <pasta> para escolher outro destino` : e.message);
      }
      if (target.exists) fail(`E_STORE_EXISTS: ${relPath(to)} já tem uma base (${MANIFEST}); escolha outra pasta com --to`);
      const docPath = extname(loc.path).toLowerCase() === '.md' ? loc.path : join(dirname(loc.path), 'ARCHITECTURE.md');
      const dest = openStore({ ...target, docPath });
      const replacing = docPath === loc.path ? loc.path : undefined; // the old .md is replaced by the generated one
      assertDocOwned(dest, docPath, { replacing });
      const existed = existsSync(to); // resolveBase only lets an empty folder through, so everything inside is ours
      let back;
      try {
        dest.save(raw, { notes });
        back = dest.load();
        if (canonicalJson(back.raw) !== canonicalJson(raw)) throw new Error('E_STORE_MIGRATE: a pasta gravada não reproduz o modelo original; nada foi trocado');
        if (hashRaw(back.raw) !== hashRaw(raw)) console.warn('  aviso: a ordem das chaves mudou; planos gerados antes da migração precisarão ser refeitos');
      } catch (e) {
        if (existed) for (const n of readdirSync(to)) rmSync(join(to, n), { recursive: true, force: true });
        else rmSync(to, { recursive: true, force: true });
        fail(e.message);
      }
      if (back.notes.assumptions != null && raw.assumptions?.length) {
        console.warn(`  aviso: notes/assumptions.md substitui a lista de premissas do manifesto no documento`);
      }
      const doc = writeDoc(dest, back.raw, back.notes, docPath, { replacing });
      console.log(`✓ ${dest.describe()} criada; ${relPath(doc)} regenerado (formato novo)`);
      console.log(`  notas: ${Object.keys(notes).length ? Object.keys(notes).map(n => `notes/${n}.md`).join(', ') : '(nenhuma)'}`);
      console.log(`  commit sugerido: git add ${relPath(to)} ${relPath(doc)} && git commit -m "chore(archlens): base migrada para ${relPath(to)}/"`);
      break;
    }
    case 'check': {
      assertWritable(store);
      const { raw, notes } = base;
      const { errors } = validateModel(raw);
      const docPath = store.locator.docPath;
      const lf = t => t.replace(/\r\n/g, '\n');
      const stale = !errors.length && (!existsSync(docPath)
        || lf(readFileSync(docPath, 'utf8')) !== lf(generateDoc(raw, { notes, source: docSource(store) })));
      if (args.json) console.log(JSON.stringify({ ok: !errors.length && !stale, errors, stale }, null, 2));
      else {
        printIssues(errors, 'ERRO');
        if (stale) console.log(`✗ ${relPath(docPath)} desatualizado: foi editado à mão ou falta rodar "archlens doc". Edite ${relPath(store.locator.path)}/notes/*.md e regenere.`);
        else if (!errors.length) console.log(`✓ ${relPath(docPath)} em dia com ${store.describe()}`);
      }
      process.exitCode = errors.length || stale ? 1 : 0;
      break;
    }
    case 'merge': {
      const usage = 'uso: archlens merge <base> <delta.json> --plan <plano.json> [--answers <plano-anterior.json>]  |  archlens merge <base> --apply <plano.json>\n'
        + '  <base>: a pasta architecture/ ou o ARCHITECTURE.md (se não existir, a base é criada em architecture/)';
      const { raw: baseRaw, notes } = loadBase(store);
      if (args.plan && args.plan !== true) {
        const deltaPath = args._[2];
        if (!deltaPath) fail(usage);
        let plan;
        try {
          const delta = readJson(deltaPath);
          const answers = args.answers && args.answers !== true ? answersFrom(readJson(args.answers), delta) : undefined;
          plan = planMerge(baseRaw, delta, { base: basename(store.locator.path), answers });
        } catch (e) { fail(e.message, 2); }
        atomicWrite(args.plan, JSON.stringify(plan, null, 2) + '\n');
        if (args.json) console.log(JSON.stringify(plan, null, 2));
        else console.log(`${formatPlanReport(plan)}\n\n✓ plano em ${args.plan}`);
        process.exitCode = plan.blocked ? 2 : 0;
      } else if (args.apply && args.apply !== true) {
        assertWritable(store);
        let res;
        try { res = applyPlan(baseRaw, readJson(args.apply)); } catch (e) {
          if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
          fail(e.message, 2);
        }
        if (!res.entry) { console.log('= nada mudou; a base não foi regravada'); break; }
        assertDocOwned(store);
        try { store.save(res.raw, { notes }); } catch (e) { fail(e.message); }
        const saved = loadBase(store); // the document follows what is on disk (a split model regroups items by file)
        const doc = writeDoc(store, saved.raw, saved.notes);
        const e = res.entry;
        const st = Object.keys(e.status).length;
        console.log(`✓ ${store.describe()} e ${relPath(doc)} (revisão ${res.raw.changelog.length}): +${e.added.length} ~${e.changed.length} −${e.removed.length}${st ? `, ${st} mudança(s) de status` : ''}`);
        console.log(`  commit sugerido: git add ${relPath(store.locator.path)} ${relPath(doc)} && git commit -m ${JSON.stringify(`docs(arquitetura): ${e.summary}`)}`);
      } else fail(usage);
      break;
    }
    default:
      fail(`comando desconhecido "${cmd}"\n\n${HELP}`);
  }
}

main().catch(e => fail(e.stack || e.message));
