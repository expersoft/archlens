#!/usr/bin/env node
// archlens CLI — model → knowledge base (ARCHITECTURE.md) → C4 / ArchiMate views → animated HTML.
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { dirname, basename, extname, join, resolve, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { normalizeModel, c4KindOf } from './lib/model.mjs';
import { validateModel } from './lib/validate.mjs';
import { generateDoc } from './lib/doc.mjs';
import { resolveView } from './lib/query.mjs';
import { layoutView } from './lib/layout.mjs';
import { viewAlerts } from './lib/view-build.mjs';
import { renderHtml } from './lib/render.mjs';
import { suggestViews } from './lib/suggest.mjs';
import { inspectHtml } from './lib/deliver.mjs';
import { mergeError, canonicalJson, relationshipIds } from './lib/merge.mjs';
import { plan as planOf, finalize, apply as applyPlanTo, answersOf, isFinal, preview as previewOf, show as showPlan, query as queryBase } from './lib/api.mjs';
import { formatPlanReport } from './lib/merge-report.mjs';
import { previewSummary, annotateView } from './lib/preview.mjs';
import { resolveBase, openStore, frontmatterSource, MANIFEST, assertWritable as storeWritable } from './lib/store/index.mjs';
import { diffRaw, contentVersion } from './lib/store/ops.mjs';
import { migrateRaw, reportLines } from './lib/migrate.mjs';
import { FORMAT, isCanonicalFormat } from './lib/canonical.mjs';
import { saveFolder, loadFolder, storeKind } from './lib/store/folder.mjs';
import { initBase, validateStore } from './lib/store/config.mjs';
import { gbrainMcpConnector } from './lib/store/gbrain-mcp.mjs';
import { convertFolder, convertToGbrain, pendingConvertToMcp, finishConvertToMcp } from './lib/store/convert.mjs';
import { scanSource } from './lib/scan/index.mjs';
import { summarize, formatSummary } from './lib/scan/summary.mjs';
import { toDelta } from './lib/scan/to-delta.mjs';

const HELP = `archlens — arquitetura como modelo, diagramas como consultas

Uso: node scripts/archlens.mjs <comando> [base] [opções]

Base: a pasta architecture/ (fonte da verdade), o ARCHITECTURE.md gerado (aponta para ela) ou nada (procura a
partir do diretório atual). Bases 1.x (pasta, .md com bloco archlens-json ou modelo .json) são recusadas
(E_STORE_FORMAT): "archlens migrate <base>" converte para o formato 2.0.

Planejar (nunca grava a base)
  plan      <base> <delta.json> --out p.json  compara o delta com a base e grava o plano (aberto: com perguntas; final: pronto)
            [--answers antigo.json]         reaproveita as respostas de um plano anterior (sem delta, usa o delta dele)
  show      <base> p.json [--out f.md] [--json]   relatório do plano (aberto ou final): decisões, mudanças, relações e visões
  scan      <pasta|url> [--base b] [--out inv.json] [--json]   lê um repositório: inventário e papel sugerido
            <pasta|url> --as system|service [--system id] [--id id] --delta d.json [--from inv.json]   monta o delta

Aplicar (grava a base)
  init      <pasta> --store json|markdown|gbrain [--name N]   cria a base (archlens.json) com o repositório escolhido
            gbrain --mode git --repo R [--remote origin] [--branch main] [--prefix archlens]   R: clone do repositório do gbrain
            gbrain --mode mcp --server S [--source-id ID] [--prefix archlens]   S: nome do MCP configurado no Claude Code
  apply     <base> p.json                    grava um plano final (se a base mudou, refaça o plano com --answers) e registra o histórico
            base gbrain no modo mcp: grava o pedido de releitura; com --read-check resposta.json, o pedido de gravação
            <base> --receipts resposta.json…   confere os recibos do gbrain e atualiza o espelho
            <base> --resume [id] | --undo [id]   pede o que falta gravar, ou devolve as páginas ao que eram (.archlens/applies/)
  doc       <base> [--out f.md]            regenera o ARCHITECTURE.md (gerado; edite architecture/notes/*.md)
  build     <base> [--out-dir DIR]           ARCHITECTURE.md + HTML (padrão: architecture/diagrams/)
  migrate   <base 1.x> [--to DIR]           converte uma base 1.x (pasta, .md ou .json) para o formato 2.0
  remote    <base> pull [--out pedido.json]   base gbrain no modo mcp: grava o pedido de chamadas ao MCP (o agente executa)
            <base> pull --ingest resposta.json… [--out pedido.json]   lê as respostas; grava o próximo pedido ou atualiza o espelho local
            <base> check [--out pedido.json] | check --ingest resposta.json   confere a sessão do MCP (whoami) e se gravar está liberado
            <base local> check --server S [--prefix P] [--out pedido.json]   idem numa base local que vai para o gbrain (store convert --mode mcp)
  store convert <base> --to markdown|json [--force]   grava a base em outro conector (mesma pasta; versão inalterada)
            <base> --to gbrain --mode git --repo R [--remote origin] [--branch main] [--prefix archlens]   leva a base para o gbrain (e de volta com --to json|markdown)
            <base> --to gbrain --mode mcp --server S [--source-id ID] [--prefix archlens]   idem pelo MCP: grava o pedido; o agente cria as páginas; conclui com apply --receipts

Consultar (nunca grava a base)
  views     <base>                           lista as visões definidas e sugere novas
  query     <base> --view k | --spec J [--format md|json] [--out f]   responde em markdown (padrão) ou JSON: elementos por camada/nível, relações, matriz de impacto
  query     <base> --element id [--depth N] [--via t1,t2] [--format md|json]   cartão do elemento: pai, filhos, relações, fontes, rodadas; --depth N inclui "Em volta"
  resolve   <base> --view k | --spec J       imprime o view IR (nós/arestas) de uma visão
  render    <base> --out f.html [seleção]    gera o HTML animado
  deliver   <base> --out f.html [seleção]    render + screenshots 1920×1080/1280×720 + checagens
  validate  <base>                         valida schema, referências, hierarquia C4 e regras ArchiMate
  check     [base] [--json]               valida e confere se o ARCHITECTURE.md está em dia (CI / pre-commit)
  extract   <base> [--out m.json]          imprime o modelo canônico em JSON
  serve     <base> [--port N] [--host H] [--open]   abre a GUI (navegador) sobre a base; padrão 127.0.0.1:5180
            --config archlens-gui.json [--port N] [--host H] [--open]   a GUI sobre várias bases

Atalhos
  merge     <base> <delta.json> --plan p.json  o mesmo que "plan"
  merge     <base> --apply p.json               fecha o plano respondido e o grava (o mesmo que responder e "apply")

Seleção de visões (render/deliver)
  --view k1,k2        visões do modelo pelo key (padrão: todas as definidas)
  --spec J            JSON inline, arquivo .json, ou lista, com view specs ad hoc
  --suggested         inclui as visões sugeridas por "views"

Prévia de um delta ainda não mergeado (render/deliver/build/resolve/views; nunca grava o ARCHITECTURE.md)
  --delta D           a base com o delta D aplicado (decisões pendentes no padrão do plano)
  --plan P            idem, a partir de um plano (usa as respostas já dadas)

Opções
  --json              saída em JSON (validate, views, resolve, plan, merge --plan)
  --answers P         plan, merge --plan: pré-preenche as respostas do plano P (gere de novo após responder "same")
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

function loadBase(store, opts) {
  try { return store.read(opts) ?? { raw: null, notes: {} }; } catch (e) { fail(e.message); }
}

function requireRaw(store) {
  const res = loadBase(store);
  if (!res.raw) fail(`base não encontrada: ${store.describe()} (crie-a com "archlens plan <base> delta.json --out plano.json" e "archlens apply")`);
  return res;
}

function assertWritable(store) {
  try { storeWritable(store); } catch (e) { fail(e.message); }
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
    const l = await layoutView(view);
    if (l.layoutStyle) console.log(`  layout "${spec.key}": ${l.layoutStyle}${l.layoutAuto ? ` (auto; ${Object.entries(l.layoutScores).map(([k, q]) => `${k} ${q.score}`).join(', ')})` : ' (pedido na visão)'}`);
    for (const a of viewAlerts(view, l)) console.warn(`  aviso: ${a}`);
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
  loadBase(store);
  const doc = readJson(input);
  let p;
  try {
    const res = previewOf(store, args.delta ? { delta: doc } : { plan: doc });
    if (res.warning) console.warn(`  aviso: ${res.warning}`);
    p = res.preview;
  } catch (e) {
    if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
    fail(e.message, 2);
  }
  p.label = `${basename(input)} · ${previewSummary(p)}`;
  p.name = `${basename(input).replace(/\.json$/i, '')}-preview`;
  return p;
}

/** key → resolution of the answered items of an earlier plan (for plan --answers). */
function answersFrom(old, delta) {
  let res;
  try { res = answersOf(old, delta); } catch (e) {
    if (e.code !== 'E_PLAN_SCHEMA') throw e;
    throw mergeError('E_PLAN_SCHEMA', '--answers precisa de um plano do archlens (gerado por "archlens plan")');
  }
  if (res.otherDelta) console.warn('  aviso: o plano de --answers foi gerado com outro delta; confira as respostas pré-preenchidas');
  return res;
}

/** The api's messages name their arguments as <base>, <plano> and <novo>; say the real ones. */
function withArgs(msg, { base, plan }) {
  const novo = plan.replace(/\.json$/i, '') + '-2.json';
  return msg.replaceAll('<base>', base).replaceAll('<plano>', plan).replaceAll('<novo>', novo);
}

/** Exits with the api's refusal (code 2), its model errors listed first. */
function failApi(e, names) {
  if (e.errors) printIssues(e.errors.map(x => ({ path: '$', hint: '', ...x })), 'ERRO');
  fail(withArgs(e.message, names), 2);
}

/**
 * plan / merge --plan: the plan of a delta (or, with --answers and no delta, of the delta of the earlier plan) against the
 * base, written to `out`. Returns the plan; exits 2 when it is blocked.
 */
function planCommand(store, deltaPath, args, out, names) {
  loadBase(store); // a base that cannot be read is reported before the arguments
  let planned;
  try {
    const old = args.answers && args.answers !== true ? readJson(args.answers) : null;
    const delta = deltaPath ? readJson(deltaPath) : undefined;
    const given = old ? answersFrom(old, delta) : null;
    if (!given && !delta) return null;
    planned = planOf(store, given?.delta ?? delta, { answers: given?.answers }).plan;
  } catch (e) { fail(e.message, 2); }
  atomicWrite(out, JSON.stringify(planned, null, 2) + '\n');
  if (args.json) console.log(JSON.stringify(planned, null, 2));
  else console.log(`${formatPlanReport(planned)}\n\n✓ plano em ${out}`);
  process.exitCode = planned.blocked ? 2 : 0;
  return planned;
}

/** Revision, preserved texts, regenerated document and suggested commit after a write by apply / merge --apply. */
function afterApply(store, res) {
  const saved = loadBase(store); // the document follows what is on disk (a split model regroups items by file)
  const doc = writeDoc(store, saved.raw, saved.notes);
  const e = res.entry;
  const st = Object.keys(e.status).length;
  console.log(`✓ ${store.describe()} e ${relPath(doc)} (revisão ${saved.raw.changelog.length}, rodada ${e.id}): +${e.added.length} ~${e.changed.length} −${e.removed.length}${st ? `, ${st} mudança(s) de status` : ''}`);
  for (const rel of res.preserved) console.log(`  texto da página removida guardado em ${relPath(join(store.locator.path, rel))}`);
  console.log(`  commit sugerido: git add ${relPath(store.locator.path)} ${relPath(doc)} && git commit -m ${JSON.stringify(`docs(arquitetura): ${e.summary}`)}`);
}

/** Writes a final plan through the connector and reports it; the document is only touched when something changed. */
function applyCommand(store, plan, names) {
  if (store.remote) fail(`E_STORE_UNSUPPORTED: ${store.describe()} é uma base gbrain no modo mcp; grave com "archlens apply ${names.base} ${names.plan}"`, 2); // the writes go by requests
  loadBase(store);
  assertWritable(store);
  if (isFinal(plan) && plan.ops?.length) assertDocOwned(store); // before anything is written
  let res;
  try { res = applyPlanTo(store, plan); } catch (e) { failApi(e, names); }
  if (!res.entry) { console.log('= nada mudou; a base não foi regravada'); return; }
  afterApply(store, res);
}

/** Writes a request for the agent (to --out, or under .archlens/remote/) and says what to do with its response. */
function handOver(store, request, args, next) {
  const out = typeof args.out === 'string' ? args.out : store.remote.requestPath(request);
  atomicWrite(out, JSON.stringify(request, null, 2) + '\n');
  console.log(`✓ pedido "${request.step}" em ${relPath(out)}: ${request.calls.length} chamada(s) ao MCP do gbrain`);
  console.log(`  próximo: faça as chamadas na ordem e grave o resultado bruto de cada uma em { "archlens-remote": "1.0", "request": "${request.id}", "results": [...] }; `
    + `depois rode "${next}"`);
}

/** apply --receipts | --resume | --undo on a gbrain MCP base: the receipts into the mirror, or the next request. */
function remoteApply(store, flow, args, names, { committed, convert } = {}) {
  const receiptsNext = `archlens apply ${names.base} --receipts <resposta.json>`;
  const id = typeof args[flow] === 'string' && flow !== 'receipts' ? args[flow] : undefined;
  let res;
  try {
    if (flow === 'resume') res = store.remote.resume(id);
    else if (flow === 'undo') res = store.remote.undo(id);
    else res = store.remote.receipts([args.receipts, ...args._.slice(2)].map(readJson));
  } catch (e) { fail(e.message, 2); }
  if (flow !== 'receipts') {
    handOver(store, res.request, args, receiptsNext);
    return;
  }
  const list = slugs => slugs.join(', ');
  if (res.state === 'committed') {
    if (committed) committed(res); else afterApply(store, { entry: res.entry, preserved: [] });
    return;
  }
  if (res.state === 'undone') {
    const saved = loadBase(store);
    const doc = saved.raw ? writeDoc(store, saved.raw, saved.notes) : null;
    console.log(`✓ apply ${res.id} desfeito: ${res.committed.length} página(s) do gbrain de volta ao que eram${doc ? `; ${relPath(doc)} regenerado` : ''}`);
    return;
  }
  const undoing = res.state === 'undo-partial';
  console.log(`✗ ${undoing ? 'undo' : 'apply'} ${res.id} parcial: ${res.committed.length} página(s) gravada(s)`
    + `${res.conflicts.length ? `; ${convert ? 'já existiam no gbrain' : 'em conflito (mudaram no gbrain)'}: ${list(res.conflicts)}` : ''}${res.pending.length ? `; sem gravar ainda: ${list(res.pending)}` : ''}`);
  if (res.duplicates?.length) {
    console.log(`  o gbrain não gravou ${res.duplicates.map(d => `${d.slug} (cópia de ${d.of})`).join(', ')}: na mesma fonte, ele guarda uma página só por id e conteúdo; `
      + 'use uma fonte do gbrain por base (--source-id) ou remova a outra página');
  }
  if (res.request) {
    handOver(store, res.request, args, receiptsNext);
    return;
  }
  // A page gbrain filed as a duplicate would be filed so again: --resume cannot finish it.
  const dup = res.duplicates?.length > 0;
  if (convert) console.log(`  a pasta local continua como estava; ${res.conflicts.length ? 'a criação não sobrescreve páginas que já existem: use outro --prefix (desfaça este com --undo) ou ' : ''}${dup ? 'desfaça com --undo' : 'retome com --resume ou desfaça com --undo'}`);
  if (undoing) console.log(`  próximo: archlens apply ${names.base} --undo ${res.id} (pede o que falta desfazer)`);
  else {
    if (!dup && (!res.conflicts.length || res.conflicts.every(s => s.endsWith('/changelog')))) console.log(`  para completar: archlens apply ${names.base} --resume ${res.id}`);
    console.log(`  para desfazer o que foi gravado: archlens apply ${names.base} --undo ${res.id}`);
  }
}

/** After a convert changed the folder's connector: the document is rewritten (a vault's element order differs from model.json) and the result said. */
function afterConvert(loc, res) {
  const converted = openStore(resolveBase(loc.path));
  const back = loadBase(converted);
  const doc = writeDoc(converted, back.raw, back.notes, loc.docPath);
  console.log(`✓ ${relPath(loc.path)}/ agora usa o conector ${res.to} (era ${res.from}); a versão da base não mudou; ${relPath(doc)} regenerado`);
  if (res.to === 'gbrain' && res.commit) console.log(`  ${res.pages} página(s) gravadas no commit ${res.commit.slice(0, 12)} (push feito); rode o sync do gbrain para indexá-las`);
  if (res.to === 'gbrain' && !res.commit) console.log(`  ${res.pages} página(s) criadas no gbrain pelo MCP; o espelho local está em ${relPath(join(loc.path, '.archlens', 'mirror'))}`);
  if (res.dropped.length) console.warn(`  aviso: --force descartou o texto das pessoas de ${res.dropped.length} página(s): ${res.dropped.join(', ')}`);
  if (res.leftover) console.warn(`  aviso: não consegui apagar ${relPath(res.leftover)}; remova-o à mão`);
  if (res.to === 'markdown') console.log(`  abra ${relPath(loc.path)}/ como vault no Obsidian; para o gbrain: gbrain schema use com ${relPath(join(loc.path, 'gbrain-pack.yaml'))}`);
  if (res.mirror) console.log('  a base veio do espelho local: se o gbrain mudou depois do último pull, essas mudanças não vieram (rode "archlens remote <base> pull" antes de converter)');
  console.log(`  commit sugerido: git add -A ${relPath(loc.path)} && git commit -m "chore(archlens): base no conector ${res.to}"`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, file] = args._;
  if (!cmd || args.help || cmd === 'help') { console.log(HELP); return; }
  const previewing = ['render', 'deliver', 'build', 'resolve', 'views'].includes(cmd) && (args.delta || args.plan);
  const create = ['merge', 'plan', 'apply', 'show'].includes(cmd) || (previewing && file != null);
  const BASE_CMDS = ['validate', 'doc', 'extract', 'views', 'resolve', 'query', 'render', 'deliver', 'build', 'merge', 'plan', 'apply', 'show', 'check'];
  const store = BASE_CMDS.includes(cmd) ? openBase(file, { create }) : null; // migrate opens its own; unknown → default
  const preview = previewing ? loadPreview(store, args) : null;
  if (preview && cmd !== 'resolve' && !args.json) console.log(`prévia de ${preview.label}`);
  if (preview?.droppedViews.length) {
    const say = cmd === 'resolve' || args.json ? console.warn : console.log;
    say(`  visões afetadas pelo delta (somem ou mudam no apply): ${preview.droppedViews.join(', ')}`);
  }
  const specsOf = model => selectSpecs(model, args, preview ? preview.views : model.views);
  const base = store && !preview && !['merge', 'plan', 'apply', 'show'].includes(cmd) ? requireRaw(store) : null;
  const load = () => (preview ? preview.raw : base.raw);

  switch (cmd) {
    case 'serve': {
      const gui = await import(new URL('../apps/gui/server/index.mjs', import.meta.url));
      const { createBaseRegistry } = await import(new URL('../apps/gui/server/bases.mjs', import.meta.url));
      const dist = process.env.ARCHLENS_GUI_DIST ?? gui.DIST_DIR;
      if (!existsSync(join(dist, 'index.html'))) fail('a GUI não está construída; rode "npm run gui:build" na raiz do archlens');
      const str = v => (v && v !== true ? v : undefined);
      let port;
      if (args.port !== undefined) {
        port = Number(args.port);
        if (!Number.isInteger(port) || port < 0 || port > 65535) fail('--port aceita um número de 0 a 65535');
      }
      let config;
      try { config = gui.loadConfig({ file: str(args.config), base: str(file), port, host: str(args.host) }); } catch (e) { fail(e.message); }
      if (!config.bases.length) fail('uso: archlens serve <base> [--port N] [--host H] [--open]\n      archlens serve --config archlens-gui.json [--port N]');
      const registry = createBaseRegistry(config);
      const bases = registry.list();
      const bad = args.config ? (bases.some(b => b.ok) ? null : bases[0]) : bases.find(b => !b.ok);
      if (bad || !bases.length) { registry.close(); fail(bad?.error ?? 'nenhuma base válida'); }
      let srv;
      try { srv = await gui.startServer({ config, staticDir: dist, registry }); } catch (e) { registry.close(); fail(e.message); }
      console.log(`archlens GUI: ${srv.url}`);
      if (args.open) openFile(srv.url);
      const stop = () => { registry.close(); srv.close().finally(() => process.exit(0)); };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      break;
    }
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
    case 'query': {
      const format = args.format === 'json' ? 'json' : args.format && args.format !== 'md' ? fail('--format aceita md ou json') : 'md';
      let text;
      try {
        const spec = loadSpecs(args.spec);
        const depth = args.depth === undefined ? 1 : Number(args.depth);
        if (!Number.isInteger(depth) || depth < 1) fail('--depth aceita um número inteiro (1 ou mais)');
        const via = typeof args.via === 'string' ? args.via.split(',').map(t => t.trim()).filter(Boolean) : undefined;
        const res = queryBase(store, { view: args.view === true ? undefined : args.view, spec: spec.length ? spec : undefined,
          element: typeof args.element === 'string' ? args.element : undefined, depth, via, format });
        text = format === 'json' ? JSON.stringify(res, null, 2) + '\n' : res;
      } catch (e) { fail(e.message, 1); }
      if (args.out && args.out !== true) { atomicWrite(args.out, text); console.log(`✓ ${args.out}`); } else process.stdout.write(text);
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
      if (!file) fail('uso: archlens migrate <architecture/ | ARCHITECTURE.md | modelo.json> [--to <pasta>]');
      let loc;
      try { loc = resolveBase(file); } catch (e) { fail(e.message); }
      if (loc.kind === 'folder' && !loc.exists) fail(`base não encontrada: ${file}`);
      let loaded, kind;
      try {
        // In place a json folder is converted below the contract (origins and layout travel to the copy); a vault is
        // read by its connector, only to say it needs no migration.
        kind = loc.kind === 'folder' ? storeKind(readJson(join(loc.path, MANIFEST)), join(loc.path, MANIFEST)) : null;
        loaded = kind === 'json' ? loadFolder(loc.path, { anyFormat: true }) : openStore(loc).read({ anyFormat: true });
      } catch (e) { fail(e.message); }
      const { raw, notes } = loaded;
      // A 2.0 base still in the old single-file container only changes container.
      const already = isCanonicalFormat(raw?.archlens);
      if (already && loc.kind === 'folder') fail(`${file} já está no formato ${FORMAT}`);
      if (kind === 'markdown') fail(`${file}: "archlens migrate" converte só bases json; esta base usa o conector markdown`);
      const res = already ? { raw, report: null, errors: validateModel(raw).errors, diffs: [] } : migrateRaw(raw);
      if (res.errors.length) { printIssues(res.errors, 'ERRO'); fail('corrija os erros do modelo antes de migrar; nada foi gravado', 2); }
      if (res.diffs.length) {
        for (const d of res.diffs) console.log(`  diferença: ${d}`);
        fail(`E_MIGRATE_EQUIV: a tradução para ${FORMAT} não reproduz o modelo (${res.diffs.length} diferença(s)); nada foi gravado`, 2);
      }
      let dest, docPath, replacing;
      if (loc.kind === 'folder') {
        try { dest = openStore({ ...loc, exists: true }); } catch (e) { fail(e.message); }
        docPath = loc.docPath;
        assertDocOwned(dest, docPath); // before anything is written: a foreign document would stop us after the swap
        // In place: copy the folder, save the 2.0 base over the copy (files of the user and split files that end up
        // empty stay), read it back, then swap; the old folder is removed only after the swap.
        const tmp = `${loc.path}.migrate-${process.pid}`;
        const old = `${loc.path}.old-${process.pid}`;
        // Relationship ids change (uses → serving); toCanonical keeps order and count, so origins follow the index.
        const oldIds = relationshipIds(raw), newIds = relationshipIds(res.raw);
        const relOrigins = new Map();
        (raw.model?.relationships ?? []).forEach((r, i) => {
          const from = loaded.origins?.relationships.get(oldIds.get(r));
          if (from) relOrigins.set(newIds.get(res.raw.model.relationships[i]), from);
        });
        const origins = { elements: loaded.origins?.elements ?? new Map(), relationships: relOrigins };
        try {
          cpSync(loc.path, tmp, { recursive: true });
          saveFolder(tmp, res.raw, { notes, origins, layout: loaded.layout });
          const back = loadFolder(tmp);
          if (canonicalJson(back.raw) !== canonicalJson(res.raw)) throw new Error('E_STORE_MIGRATE: a pasta gravada não reproduz o modelo convertido; nada foi trocado');
          renameSync(loc.path, old);
          renameSync(tmp, loc.path);
        } catch (e) {
          rmSync(tmp, { recursive: true, force: true });
          if (existsSync(old) && !existsSync(loc.path)) renameSync(old, loc.path);
          fail(e.message);
        }
        // Past the swap the base is migrated: a leftover old folder (EBUSY/EPERM on Windows) is only a warning.
        try { rmSync(old, { recursive: true, force: true }); } catch {
          console.warn(`  aviso: não consegui apagar ${relPath(old)}; remova-o à mão`);
        }
      } else {
        const to = resolve(args.to && args.to !== true ? args.to : join(dirname(loc.path), 'architecture'));
        let target;
        try { target = resolveBase(to, { create: true }); } catch (e) {
          fail(e.code === 'E_STORE_NOT_BASE' && !(args.to && args.to !== true) ? `${e.message}; use --to <pasta> para escolher outro destino` : e.message);
        }
        if (target.exists) fail(`E_STORE_EXISTS: ${relPath(to)} já tem uma base (${MANIFEST}); escolha outra pasta com --to`);
        docPath = extname(loc.path).toLowerCase() === '.md' ? loc.path : join(dirname(loc.path), 'ARCHITECTURE.md');
        try { dest = openStore({ ...target, docPath }); } catch (e) { fail(e.message); }
        replacing = docPath === loc.path ? loc.path : undefined; // the old .md is replaced by the generated one
        assertDocOwned(dest, docPath, { replacing });
        const existed = existsSync(to); // resolveBase only lets an empty folder through, so everything inside is ours
        try {
          // Not writeBase: a refusal must still reach the cleanup below.
          dest.apply(diffRaw(null, { raw: res.raw, notes }), { baseVersion: null });
          if (contentVersion(dest.read()) !== contentVersion({ raw: res.raw, notes })) throw new Error('E_STORE_MIGRATE: a pasta gravada não reproduz o modelo convertido; nada foi trocado');
        } catch (e) {
          if (existed) for (const n of readdirSync(to)) rmSync(join(to, n), { recursive: true, force: true });
          else rmSync(to, { recursive: true, force: true });
          fail(e.message);
        }
      }
      const back = loadBase(dest);
      if (back.notes.assumptions != null && res.raw.assumptions?.length) {
        console.warn(`  aviso: notes/assumptions.md substitui a lista de premissas do manifesto no documento`);
      }
      const doc = writeDoc(dest, back.raw, back.notes, docPath, { replacing });
      console.log(`✓ ${dest.describe()} no formato ${FORMAT}; ${relPath(doc)} regenerado`);
      if (res.report) {
        for (const l of reportLines(res.report)) console.log(`  ${l}`);
        console.log('  aviso: planos gerados antes da migração não se aplicam mais (a base mudou); gere-os de novo');
      }
      console.log(`  commit sugerido: git add ${relPath(dest.locator.path)} ${relPath(doc)} && git commit -m "chore(archlens): base migrada para o formato ${FORMAT}"`);
      break;
    }
    case 'scan': {
      const usage = 'uso: archlens scan <pasta|url-git> [--ref r] [--base b] [--out inventario.json] [--json] [--helm-render]\n'
        + '      archlens scan <pasta|url-git> --as system|service [--system <id>] [--id <id>] --delta d.json [--from inventario.json]';
      const val = k => (args[k] && args[k] !== true ? args[k] : undefined);
      if (!file && !val('from')) fail(usage);
      let base = null;
      const newBase = at => console.warn(at
        ? `  aviso: nenhuma base encontrada; o delta será para uma base nova: a base será criada em ${relPath(at)} pelo primeiro "apply".`
        : '  aviso: nenhuma base encontrada; o delta será para uma base nova. Use --base para apontar a base existente.');
      try {
        // --base may name a base the first merge will create (missing or empty folder); scan only reads it
        const st = openStore(resolveBase(val('base'), { create: !!val('base') }));
        const loaded = st.read() ?? { raw: null };
        base = loaded.raw ? normalizeModel(loaded.raw) : null;
        if (!base) newBase(val('base') ? st.locator.path : null);
      } catch (e) {
        if (val('base') || e.code === 'E_STORE_FORMAT') fail(e.message);
        newBase();
      }
      if (args.delta) {
        const role = val('as');
        if (!['system', 'service'].includes(role)) fail('E_SCAN_ROLE: informe o papel do repositório com --as system|service (rode sem --delta para ver a sugestão)');
        if (role === 'service' && !val('system')) fail('E_SCAN_ROLE: com --as service, informe o sistema com --system <id>');
        const kindOf = x => (base?.elements.get(x) ? c4KindOf(base, base.elements.get(x)) : null);
        if (base && role === 'service' && !base.elements.has(val('system'))) console.warn(`  nota: o sistema ${val('system')} não existe na base e será criado pelo delta`);
        if (base && val('system') && base.elements.has(val('system')) && kindOf(val('system')) !== 'softwareSystem') fail(`E_SCAN_TARGET: "${val('system')}" não é um software system`);
        if (base && val('id') && base.elements.has(val('id')) && kindOf(val('id')) !== (role === 'system' ? 'softwareSystem' : 'container')) {
          fail(`E_SCAN_TARGET: "${val('id')}" na base não é um ${role === 'system' ? 'software system' : 'container'}`);
        }
      }
      let inv;
      try { inv = val('from') ? readJson(val('from')) : scanSource(file, { ref: val('ref'), helmRender: !!args['helm-render'] }); } catch (e) { fail(e.message); }
      if (val('out')) atomicWrite(val('out'), JSON.stringify(inv, null, 2) + '\n');
      if (!args.delta) {
        const s = summarize(inv, base);
        console.log(args.json ? JSON.stringify(s, null, 2) : formatSummary(s));
        break;
      }
      if (args.delta === true) fail(usage);
      const delta = toDelta(inv, { role: val('as'), system: val('system'), id: val('id'), base });
      atomicWrite(args.delta, JSON.stringify(delta, null, 2) + '\n');
      console.log(`✓ delta em ${args.delta}: ${delta.model.elements.length} elemento(s), ${delta.model.relationships.length} relação(ões)${delta.ops ? `, ${delta.ops.length} sugestão(ões) de retired para confirmar` : ''}`);
      console.log(`  próximo passo: archlens plan <base> ${args.delta} --out plano.json`);
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
    case 'plan': {
      const usage = 'uso: archlens plan <base> <delta.json> --out <plano.json> [--answers <plano-anterior.json>] [--json]\n'
        + '  sem <delta.json>, --answers reaproveita o delta do plano anterior';
      if (!args.out || args.out === true) fail(usage);
      const names = { base: file ?? relPath(store.locator.path), plan: args.out };
      const planned = planCommand(store, args._[2], args, args.out, names);
      if (!planned) fail(usage);
      if (args.json || planned.blocked) break;
      const next = planned.state === 'final'
        ? `archlens apply ${names.base} ${args.out}`
        : `responda os itens pendentes em ${args.out} (campo "resolution") e rode: archlens plan ${names.base} --answers ${args.out} --out ${withArgs('<novo>', names)}`;
      console.log(`  próximo passo: ${next}`);
      break;
    }
    case 'apply': {
      const usage = 'uso: archlens apply <base> <plano.json> [--read-check resposta.json…]   (o plano precisa estar final: archlens plan)\n'
        + '  base gbrain no modo mcp: archlens apply <base> --receipts resposta.json… | --resume [id] | --undo [id]';
      const names = { base: file ?? relPath(store.locator.path), plan: args._[2] ?? '<plano>' };
      const flow = ['receipts', 'resume', 'undo'].find(k => args[k] !== undefined);
      // A convert to the MCP gbrain in flight: its receipts, resume and undo run on the connector it asked for.
      const pend = flow && !store.remote ? pendingConvertToMcp(store.locator) : null;
      if (flow || args['read-check'] !== undefined) {
        if (!store.remote && !pend) fail(`E_STORE_UNSUPPORTED: ${store.describe()} não é uma base gbrain no modo mcp; --read-check, --receipts, --resume e --undo só valem para ela`);
        if (args.out === true || ((flow === 'receipts' || !flow) && args[flow ?? 'read-check'] === true)) fail(usage);
      }
      loadBase(store);
      if (pend) {
        remoteApply({ remote: pend.connector.remote, describe: pend.connector.describe, locator: store.locator }, flow, args, names, {
          convert: true,
          committed: () => {
            let done;
            try { done = finishConvertToMcp(store.locator); } catch (e) { fail(e.message, 2); }
            afterConvert(store.locator, done);
          },
        });
        break;
      }
      if (flow) { remoteApply(store, flow, args, names); break; }
      if (!args._[2]) fail(usage);
      const plan = readJson(args._[2]);
      if (!store.remote) { applyCommand(store, plan, names); break; }
      assertWritable(store);
      if (isFinal(plan) && plan.ops?.length) assertDocOwned(store);
      const readCheck = args['read-check'] ? [args['read-check'], ...args._.slice(3)].map(readJson) : undefined;
      let res;
      try { res = applyPlanTo(store, plan, { readCheck }); } catch (e) { failApi(e, names); }
      if (!res.request) { if (!res.entry) console.log('= nada mudou; a base não foi regravada'); else afterApply(store, res); break; }
      handOver(store, res.request, args, res.request.step === 'read-check'
        ? `archlens apply ${names.base} ${names.plan} --read-check <resposta.json>` : `archlens apply ${names.base} --receipts <resposta.json>`);
      if (res.apply) console.log(`  registro do apply: ${relPath(join(store.locator.path, '.archlens', 'applies', `${res.apply}.json`))} (rodada ${res.entry?.id ?? '-'})`);
      break;
    }
    case 'show': {
      if (!args._[2]) fail('uso: archlens show <base> <plano.json> [--out f.md] [--json]');
      loadBase(store);
      let text;
      try {
        const data = showPlan(store, readJson(args._[2]), { format: args.json ? 'json' : 'md' });
        text = args.json ? JSON.stringify(data, null, 2) + '\n' : data;
      } catch (e) { fail(e.message, 2); }
      if (args.out && args.out !== true) { atomicWrite(args.out, text); console.log(`✓ ${args.out}`); } else process.stdout.write(text);
      break;
    }
    case 'merge': {
      const usage = 'uso: archlens merge <base> <delta.json> --plan <plano.json> [--answers <plano-anterior.json>]  |  archlens merge <base> --apply <plano.json>\n'
        + '  <base>: a pasta architecture/ ou o ARCHITECTURE.md (se não existir, a base é criada em architecture/)';
      if (args.plan && args.plan !== true) {
        if (!args._[2] || !planCommand(store, args._[2], args, args.plan)) fail(usage);
      } else if (args.apply && args.apply !== true) {
        const names = { base: file ?? relPath(store.locator.path), plan: args.apply };
        // On the MCP gbrain the agent makes the writes, request by request: only "archlens apply" carries them.
        if (store.remote) {
          fail(`E_STORE_UNSUPPORTED: ${store.describe()} é uma base gbrain no modo mcp: "merge --apply" não grava por pedidos ao agente; nada foi gravado. `
            + `Rode "archlens remote ${names.base} pull", feche o plano com "archlens plan ${names.base} --answers ${names.plan} --out ${withArgs('<novo>', names)}" se ele estiver aberto, `
            + `e grave com "archlens apply ${names.base} ${names.plan}" (ou o plano novo)`, 2);
        }
        loadBase(store);
        assertWritable(store);
        const plan = readJson(args.apply);
        let final;
        try {
          const before = store.version(); // a plan without storeVersion is pinned to the version it was closed against
          ({ plan: final } = finalize(store, plan));
          if (!('storeVersion' in final)) final = { ...final, storeVersion: before };
        } catch (e) { failApi(e, names); }
        applyCommand(store, final, names);
      } else fail(usage);
      break;
    }
    case 'init': {
      const usage = 'uso: archlens init <pasta> --store json|markdown|gbrain [--name N] [--mode git|mcp] [--repo R] [--remote origin] [--branch main] [--server S] [--source-id ID] [--prefix archlens]';
      if (!file || !args.store || args.store === true) fail(usage);
      const dir = resolve(file);
      const opt = k => (typeof args[k] === 'string' ? args[k] : undefined);
      const fields = { mode: opt('mode'), remote: opt('remote'), branch: opt('branch'), server: opt('server'), sourceId: opt('source-id'), prefix: opt('prefix') };
      // The manifest keeps `repo` relative to the base folder, so the base and the clone move together.
      const repo = opt('repo') && relative(dir, resolve(opt('repo')));
      const store = Object.fromEntries(Object.entries({ kind: args.store, ...fields, repo }).filter(([, v]) => v !== undefined));
      const name = opt('name') ?? (basename(dirname(dir)) || 'Arquitetura');
      let path;
      try { path = initBase(dir, { name, store, warn: w => console.warn(`  aviso: ${w}`) }); } catch (e) { fail(e.message); }
      console.log(`✓ ${relPath(path)} criado (conector ${args.store}${store.mode ? `, modo ${store.mode}` : ''})`);
      console.log(`  próximo: planeje o conteúdo com a skill archlens-plan e grave com archlens-apply`);
      break;
    }
    case 'remote': {
      const usage = 'uso: archlens remote <base> pull [--out pedido.json] | pull --ingest <resposta.json…> [--out pedido.json] | check [--out pedido.json] | check --ingest <resposta.json…>\n'
        + '  base local que vai para o gbrain (store convert --mode mcp): archlens remote <base> check --server S [--prefix P] [--out pedido.json] | check --server S [--prefix P] --ingest <resposta.json…>';
      const action = args._[2];
      if (!file || !['pull', 'check'].includes(action) || args.ingest === true || args.out === true) fail(usage);
      let store = openBase(file);
      // The session check also works on a local base about to be converted: --server names the MCP server.
      if (!store.remote && action === 'check' && typeof args.server === 'string' && store.kind !== 'gbrain') {
        store = gbrainMcpConnector(store.locator, validateStore({ kind: 'gbrain', mode: 'mcp', server: args.server, ...(typeof args.prefix === 'string' ? { prefix: args.prefix } : {}) }));
      }
      if (!store.remote) fail(`E_STORE_UNSUPPORTED: ${store.describe()} não é uma base gbrain no modo mcp; "archlens remote" só vale para ela`);
      const responses = args.ingest ? [args.ingest, ...args._.slice(3)].map(readJson) : null;
      let res;
      try {
        if (action === 'pull') res = responses ? store.remote.pullIngest(responses) : { request: store.remote.pull() };
        else res = responses ? { session: store.remote.checkIngest(responses) } : { request: store.remote.check() };
      } catch (e) { fail(e.message); }
      if (res.request) {
        const out = typeof args.out === 'string' ? args.out : store.remote.requestPath(res.request);
        atomicWrite(out, JSON.stringify(res.request, null, 2) + '\n');
        console.log(`✓ pedido "${res.request.step}" em ${relPath(out)}: ${res.request.calls.length} chamada(s) ao MCP do gbrain`);
        console.log(`  próximo: faça as chamadas na ordem e grave o resultado bruto de cada uma em { "archlens-remote": "1.0", "request": "${res.request.id}", "results": [...] }; `
          + `depois rode "archlens remote ${file} ${action} --ingest <resposta.json>"`);
      } else if (res.done) {
        console.log(`✓ espelho de ${store.describe()} em dia: ${res.done.fetched.length} página(s) lidas, ${res.done.removed.length} removida(s)`);
      } else {
        const s = res.session;
        console.log(`✓ sessão do MCP conferida (${s.identity.transport}); gravar pelo MCP ${s.write ? 'liberado (conjunto completo de ferramentas)'
          : `não liberado (${s.reason}): pull, plan, show e query funcionam; para gravar, o servidor precisa permitir o conjunto completo, ou use o modo git`}`);
      }
      break;
    }
    case 'store': {
      const usage = 'uso: archlens store convert <base> --to markdown|json [--force] | --to gbrain --mode git --repo R [--remote origin] [--branch main] [--prefix archlens]\n'
        + '  | --to gbrain --mode mcp --server S [--source-id ID] [--prefix archlens]   (o agente faz as gravações; veja "archlens remote <base> check --server S")';
      if (file !== 'convert' || !args.to || args.to === true) fail(usage);
      const target = args._[2];
      let loc;
      try { loc = resolveBase(target); } catch (e) { fail(e.message); }
      if (loc.kind !== 'folder' || !loc.exists) fail(`E_STORE_CONVERT: ${target ?? '.'} não é uma pasta de base (migre bases antigas com "archlens migrate")`);
      assertDocOwned(openStore(loc)); // before anything is written
      let res;
      try {
        if (args.to === 'gbrain') {
          const opt = k => (typeof args[k] === 'string' ? args[k] : undefined);
          // The manifest keeps `repo` relative to the base folder, so the base and the clone move together.
          const repo = opt('repo') && relative(loc.path, resolve(opt('repo')));
          const store = Object.fromEntries(Object.entries({ kind: 'gbrain', mode: opt('mode'), remote: opt('remote'), branch: opt('branch'), prefix: opt('prefix'), repo, server: opt('server'), sourceId: opt('source-id') }).filter(([, v]) => v !== undefined));
          res = convertToGbrain(loc, store);
          if (res.request) {
            // MCP mode: the agent makes the writes; the folder changes with the last receipt.
            const out = typeof args.out === 'string' ? args.out : res.connector.remote.requestPath(res.request);
            atomicWrite(out, JSON.stringify(res.request, null, 2) + '\n');
            console.log(`✓ pedido "apply" em ${relPath(out)}: ${res.request.calls.length} chamada(s) ao MCP do gbrain, ${res.pages} página(s) (só criação; o prefixo precisa estar vazio)`);
            console.log(`  próximo: faça as chamadas na ordem e grave o resultado bruto de cada uma em { "archlens-remote": "1.0", "request": "${res.request.id}", "results": [...] }; `
              + `depois rode "archlens apply ${target ?? '.'} --receipts <resposta.json>" (a pasta local só muda com o último recibo)`);
            console.log(`  registro: ${relPath(join(loc.path, '.archlens', 'applies', `${res.apply}.json`))}`);
            break;
          }
          for (const w of res.warnings) console.warn(`  aviso: ${w}`);
        } else res = convertFolder(loc, String(args.to), { force: args.force === true });
      } catch (e) { fail(e.message); }
      afterConvert(loc, res);
      break;
    }
    default:
      fail(`comando desconhecido "${cmd}"\n\n${HELP}`);
  }
}

main().catch(e => fail(e.stack || e.message));
