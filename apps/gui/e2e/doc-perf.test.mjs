// Documentação do nó no Chromium real: a aba do HTML gerado e da GUI, e o custo dela na abertura do diagrama.
// Duas bases iguais de 60 nós, uma com 5 KB de documentação em cada nó. Rode com `npm run test:e2e` (faz o build antes).
// Sem navegador instalado, o teste é pulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, DIST_DIR } from '../server/index.mjs';
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';
import { renderViews } from '../../../scripts/lib/build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'scripts/archlens.mjs');
const SISTEMAS = 6, CONTAINERS = 9; // 6 + 6 × 9 = 60 nós
const TAMANHO = 5 * 1024;
const ABERTURAS = 5;
const INJECAO = '<script>window.__injetado = 1</script>\n\n<img src="x" onerror="window.__injetado = 1">';
const marca = (id) => `marca-${id}-fim`;

/** 5 KB de markdown; o primeiro nó leva também o que não pode virar HTML ativo. */
function textoDe(id, i) {
  const paragrafo = 'Este parágrafo conta o que o nó faz, quem cuida dele e como ele conversa com os vizinhos da plataforma. ';
  const inicio = `## Visão geral\n\n${marca(id)}\n\n${i === 0 ? `${INJECAO}\n\n` : ''}`;
  return (inicio + paragrafo.repeat(Math.ceil(TAMANHO / paragrafo.length))).slice(0, TAMANHO);
}

function modelo() {
  const sistemas = Array.from({ length: SISTEMAS }, (_, s) => ({ id: `s${s}`, type: 'application-component', name: `Sistema ${s}`, c4: { kind: 'softwareSystem' } }));
  const containers = sistemas.flatMap((sis, s) => Array.from({ length: CONTAINERS }, (_, c) => ({
    id: `s${s}.c${c}`, type: 'application-component', name: `Container ${s}.${c}`, parent: sis.id, c4: { kind: 'container' },
  })));
  const relacoes = containers.slice(1).map((e, i) => ({ id: `r${i}`, type: 'serving', from: containers[i].id, to: e.id }));
  const visoes = [
    { key: 'paisagem', title: 'Paisagem', notation: 'c4', level: 'landscape' },
    { key: 'aplicacao', title: 'Aplicação', notation: 'archimate', viewpoint: 'application' },
    { key: 'containers', title: 'Containers', notation: 'c4', level: 'container', scope: 's0' },
  ];
  return { elementos: [...sistemas, ...containers], relacoes, visoes };
}

/** Grava a base em `dir` e devolve o HTML gerado dela. */
async function criarBase(dir, { elementos, relacoes, visoes }, textos) {
  execFileSync(process.execPath, [CLI, 'init', dir, '--store', 'markdown', '--name', 'Medição'], { encoding: 'utf8' });
  const store = openStore(resolveBase(dir));
  store.apply([
    ...elementos.map((element) => ({ op: 'upsertElement', element })),
    ...relacoes.map((relationship) => ({ op: 'upsertRelationship', relationship })),
    ...visoes.map((view) => ({ op: 'putView', view })),
    ...Object.entries(textos).map(([id, text]) => ({ op: 'putDoc', id, text })),
  ], { baseVersion: store.version() });
  const { raw, docs } = store.read();
  const { html } = await renderViews(raw, raw.views, { title: 'Medição', docs });
  return html;
}

const mediana = (ns) => [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)];

let tmp, browser, skip, srvCom, srvSem, htmlCom, htmlSem, arquivoCom, arquivoSem, textoTotal, ids;

before(async () => {
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch();
  } catch (e) {
    skip = `Chromium indisponível (${String(e.message).split('\n')[0]}); rode "npx playwright install chromium"`;
    console.warn(`e2e pulado: ${skip}`);
    return;
  }
  tmp = mkdtempSync(join(tmpdir(), 'archlens-doc-perf-'));
  const m = modelo();
  ids = m.elementos.map((e) => e.id);
  assert.equal(ids.length, 60);
  const textos = Object.fromEntries(ids.map((id, i) => [id, textoDe(id, i)]));
  textoTotal = Object.values(textos).reduce((n, t) => n + t.length, 0);
  const dirCom = join(tmp, 'com/architecture'), dirSem = join(tmp, 'sem/architecture');
  htmlCom = await criarBase(dirCom, m, textos);
  htmlSem = await criarBase(dirSem, m, {});
  arquivoCom = join(tmp, 'com.html');
  arquivoSem = join(tmp, 'sem.html');
  writeFileSync(arquivoCom, htmlCom);
  writeFileSync(arquivoSem, htmlSem);
  const servidor = (id, path) => startServer({ config: { port: 0, host: '127.0.0.1', bases: [{ id, path }] }, staticDir: DIST_DIR });
  [srvCom, srvSem] = await Promise.all([servidor('com', dirCom), servidor('sem', dirSem)]);
});
after(async () => {
  await browser?.close();
  await srvCom?.close?.();
  await srvSem?.close?.();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const novaPagina = () => browser.newPage({ viewport: { width: 1600, height: 900 } });
const noHtml = (p) => p.locator('svg [data-node]').first();
const naGui = (p) => p.frameLocator('iframe[title="Diagrama"]').locator('[data-node]').first();

/** Milissegundos de uma abertura, numa página nova, até o diagrama aparecer. */
async function abrir(url, diagrama) {
  const p = await novaPagina();
  const inicio = performance.now();
  await p.goto(url, { waitUntil: 'commit' });
  await diagrama(p).waitFor();
  const ms = performance.now() - inicio;
  await p.close();
  return ms;
}

/** Medianas das aberturas, alternando as duas bases para o ruído da máquina cair sobre ambas; a primeira abertura só aquece. */
async function medir(urlCom, urlSem, diagrama) {
  await abrir(urlCom, diagrama);
  await abrir(urlSem, diagrama);
  const com = [], sem = [];
  for (let i = 0; i < ABERTURAS; i++) {
    sem.push(await abrir(urlSem, diagrama));
    com.push(await abrir(urlCom, diagrama));
  }
  return { comDoc: mediana(com), semDoc: mediana(sem) };
}

test('HTML gerado: o texto entra na página só ao clicar na aba Documentação, sem virar HTML ativo', async (t) => {
  if (skip) return t.skip(skip);
  const p = await novaPagina();
  await p.goto(pathToFileURL(arquivoCom).href);
  await noHtml(p).waitFor();
  await p.locator('[data-node="s0"]').first().click();
  const painel = p.locator('.drawer-body');
  const aba = painel.locator('[data-tab="doc"]');
  await aba.waitFor();

  const pagina = () => p.evaluate(() => document.body.innerText);
  assert.ok(!(await pagina()).includes(marca('s0')), 'o texto apareceu antes do clique');
  assert.equal(await painel.locator('[data-pane="doc"]').innerHTML(), '', 'o texto entrou no DOM antes do clique');

  await aba.click();
  await painel.locator('[data-pane="doc"] h2', { hasText: 'Visão geral' }).waitFor();
  assert.ok((await pagina()).includes(marca('s0')), 'o texto não apareceu depois do clique');
  assert.equal(await aba.getAttribute('aria-selected'), 'true');
  assert.ok(await painel.locator('[data-pane="details"]').isHidden(), 'Detalhes segue visível');

  assert.ok((await pagina()).includes('<script>'), 'o script do texto deveria aparecer como texto');
  assert.equal(await painel.locator('[data-pane="doc"] script, [data-pane="doc"] img').count(), 0);
  assert.equal(await p.evaluate(() => window.__injetado), undefined);
  await p.close();
});

test('GUI: a aba Documentação traz o texto do nó só ao ser aberta', async (t) => {
  if (skip) return t.skip(skip);
  const p = await novaPagina();
  await p.goto(srvCom.url);
  await naGui(p).waitFor();
  await p.frameLocator('iframe[title="Diagrama"]').locator('[data-node="s1"]').click();
  const aba = p.getByRole('tab', { name: 'Documentação' });
  await aba.waitFor();
  const texto = p.getByText(marca('s1'));
  assert.equal(await texto.count(), 0, 'o texto apareceu antes do clique');
  await aba.click();
  await texto.waitFor();
  await p.locator('[data-testid="side-right"] h2', { hasText: 'Visão geral' }).waitFor();
  await p.close();
});

test('o texto não se repete por visão', (t) => {
  if (skip) return t.skip(skip);
  console.log(`HTML: ${htmlSem.length} caracteres sem documentação, ${htmlCom.length} com; ${textoTotal} de texto`);
  assert.ok(htmlCom.length - htmlSem.length <= textoTotal * 1.5); // o texto não se repete por visão
  for (const id of ids) assert.equal(htmlCom.split(marca(id)).length - 1, 1, id);
});

test('o HTML gerado abre com documentação como abre sem ela', async (t) => {
  if (skip) return t.skip(skip);
  const { comDoc, semDoc } = await medir(pathToFileURL(arquivoCom).href, pathToFileURL(arquivoSem).href, noHtml);
  console.log(`HTML, mediana de ${ABERTURAS} aberturas até o svg: ${semDoc.toFixed(0)} ms sem documentação, ${comDoc.toFixed(0)} ms com`);
  assert.ok(comDoc <= semDoc * 1.10 + 50); // ms até o svg aparecer; 50 ms de folga para ruído
});

test('a GUI abre com documentação como abre sem ela', async (t) => {
  if (skip) return t.skip(skip);
  const { comDoc, semDoc } = await medir(srvCom.url, srvSem.url, naGui);
  console.log(`GUI, mediana de ${ABERTURAS} aberturas até o svg: ${semDoc.toFixed(0)} ms sem documentação, ${comDoc.toFixed(0)} ms com`);
  assert.ok(comDoc <= semDoc * 1.10 + 50); // ms até o svg aparecer; 50 ms de folga para ruído
});
