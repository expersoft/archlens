// store convert: the same base written by another connector in the same folder. The folder is copied, the source
// connector's files are taken out of the copy, the target connector writes the base into it, the copy is read back and
// checked, then swapped in. Files the base does not own stay.
import { cpSync, renameSync, rmSync, existsSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { storeError } from './errors.mjs';
import { contentVersion, diffRaw } from './ops.mjs';
import { writeSetOf } from './versions.mjs';
import { FORMAT } from '../canonical.mjs';
import { MANIFEST, readJson, loadFolder, jsonConnector } from './folder.mjs';
import { readVault, markdownConnector, vaultFiles, REMOVED } from './markdown.mjs';
import { PACK_FILE } from './gbrain-pack.mjs';
import { openStore } from './index.mjs';
import { validateStore, probeGitRepo, ignoreMirror } from './config.mjs';
import { gbrainGitConnector, TIP } from './gbrain-git.mjs';
import { gbrainMcpConnector, APPLIES, MIRROR, REMOTE, SESSION } from './gbrain-mcp.mjs';
import { assertGbrainIds } from './gbrain-layout.mjs';

/** The files of `kind` in `dir` that are the base itself (not notes, views or changelog, which every connector shares). */
function ownFiles(dir, kind) {
  if (kind === 'markdown') return [...readVault(dir).ctx.pages.values()].map(p => p.rel).concat(existsSync(join(dir, PACK_FILE)) ? [PACK_FILE] : []);
  const { origins, layout } = loadFolder(dir);
  const model = layout?.model ?? 'model.json';
  if (!model.endsWith('/')) return [model];
  return [...new Set([...origins.elements.values(), ...origins.relationships.values()])]
    .concat(readdirSync(join(dir, model)).filter(f => f.endsWith('.json')).map(f => model + f));
}

/** Pages of the vault with text people wrote after the archlens block (the json connector has nowhere to keep it). */
function pagesWithHumanText(dir) {
  return [...readVault(dir).ctx.pages.entries()].filter(([, p]) => (p.userText ?? '').trim()).map(([id, p]) => p.rel ?? id);
}

export function convertFolder(locator, to, { force = false } = {}) {
  if (!['json', 'markdown'].includes(to)) throw storeError('E_STORE_CONVERT', `conector de destino desconhecido "${to}"; use json ou markdown`);
  const source = openStore(locator);
  if (!source.writable) source.apply([]);
  if (source.kind === 'gbrain') return convertFromGbrain(locator, to, { force });
  if (source.kind === to) throw storeError('E_STORE_CONVERT', `${source.describe()} já usa o conector ${to}`);
  const cur = source.read();
  if (!cur) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${source.describe()}`);
  const before = contentVersion(cur);
  const dropped = source.kind === 'markdown' && to === 'json' ? pagesWithHumanText(locator.path) : [];
  if (dropped.length && !force) {
    const shown = dropped.slice(0, 10).join(', ') + (dropped.length > 10 ? ` e mais ${dropped.length - 10}` : '');
    throw storeError('E_STORE_CONVERT', `${dropped.length} página(s) têm texto das pessoas depois do bloco do archlens (${shown}) e o conector json não tem onde guardá-lo; nada foi trocado. Copie o texto para architecture/notes/ ou use --force para convertê-las perdendo esse texto`);
  }
  const dir = locator.path, tmp = `${dir}.convert-${process.pid}`, old = `${dir}.old-${process.pid}`;
  try {
    cpSync(dir, tmp, { recursive: true });
    const own = new Set(ownFiles(tmp, source.kind));
    for (const rel of own) rmSync(join(tmp, rel), { force: true });
    // Folders the source connector emptied go away (model/, type folders); one with other files stays.
    for (const d of new Set([...own].map(rel => dirname(rel)).filter(d => d !== '.'))) {
      if (existsSync(join(tmp, d)) && !readdirSync(join(tmp, d)).length) rmSync(join(tmp, d), { recursive: true });
    }
    const { store, layout, ...top } = readJson(join(tmp, MANIFEST));
    writeFileSync(join(tmp, MANIFEST), JSON.stringify({ ...top, ...(to === 'markdown' ? { store: { kind: 'markdown' } } : {}) }, null, 2) + '\n');
    const target = to === 'markdown' ? markdownConnector({ ...locator, path: tmp }, tmp) : jsonConnector({ ...locator, path: tmp }, tmp);
    target.apply(diffRaw(target.read(), cur), { baseVersion: target.version() });
    if (contentVersion(target.read()) !== before) throw storeError('E_STORE_CONVERT', 'a base gravada pelo conector novo não reproduz a original; nada foi trocado');
    renameSync(dir, old);
    renameSync(tmp, dir);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    if (existsSync(old) && !existsSync(dir)) renameSync(old, dir);
    throw e;
  }
  let leftover = null;
  try { rmSync(old, { recursive: true, force: true }); } catch { leftover = old; }
  return { from: source.kind, to, version: before, leftover, dropped };
}

/** Writes `text` over `path` through a temporary file next to it. */
function writeAtomic(path, text) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** notes/removidos/** of a vault (relative path → text): the text of elements that were removed. */
function removedFiles(dir) {
  const out = new Map();
  const walk = rel => {
    if (!existsSync(join(dir, rel))) return;
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && e.name.endsWith('.md')) out.set(r, readFileSync(join(dir, r), 'utf8'));
    }
  };
  walk(REMOVED.replace(/\/$/, ''));
  return out;
}

/** Removes the folders of `rels` that the removal left empty. */
function dropEmptied(dir, rels) {
  for (const d of new Set(rels.map(rel => dirname(rel)).filter(d => d !== '.'))) {
    if (existsSync(join(dir, d)) && !readdirSync(join(dir, d)).length) rmSync(join(dir, d), { recursive: true });
  }
}

/**
 * Moves a local base (json or markdown) into the gbrain in git mode: the whole base in one commit, written only if no page of
 * the archlens exists under the prefix (E_STORE_EXISTS). Only then the local folder changes: archlens.json becomes the
 * configuration one and the old model files go; notes/, diagrams/ and files the base does not own stay.
 */
export function convertToGbrain(locator, store) {
  const valid = validateStore(store);
  if (valid.kind !== 'gbrain') throw storeError('E_STORE_CONVERT', 'o destino de "store convert" para o gbrain é --to gbrain --mode git --repo R ou --mode mcp --server S');
  if (valid.mode === 'mcp') return convertToGbrainMcp(locator, valid);
  const dir = locator.path;
  const source = openStore(locator);
  if (source.kind === 'gbrain') throw storeError('E_STORE_CONVERT', `${source.describe()} já usa o conector gbrain`);
  if (!source.writable) source.apply([]);
  const cur = source.read();
  if (!cur) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${source.describe()}`);
  assertGbrainIds(cur.raw); // before anything is written
  const warnings = probeGitRepo({ ...valid, repo: resolve(dir, valid.repo) });
  const own = [...new Set([...ownFiles(dir, source.kind), 'views.json', 'changelog.json'])];
  const target = gbrainGitConnector(locator, valid);
  // The text people wrote in the pages of a vault, and the text kept of removed elements, travel with the base.
  const carry = source.kind === 'markdown' ? { base: readVault(dir), removed: removedFiles(dir) } : undefined;
  const ops = diffRaw(null, cur);
  const expect = Object.fromEntries([...writeSetOf(ops)].map(ref => [ref, null]));
  try {
    target.apply(ops, { expect, carry, fresh: true });
  } catch (e) {
    if (e.code === 'E_STORE_CONFLICT' || e.code === 'E_STORE_EXISTS') {
      const found = e.pages ?? (e.conflicts ?? []).map(c => c.ref);
      throw storeError('E_STORE_EXISTS', `${valid.remote}/${valid.branch} já tem páginas do archlens em ${valid.prefix}/ (${found.slice(0, 5).join(', ')}${found.length > 5 ? ` e mais ${found.length - 5}` : ''}); nada foi gravado. `
        + 'Use outro --prefix ou leia a base de lá com um archlens.json de configuração (archlens init --store gbrain)', { conflicts: e.conflicts, pages: e.pages });
    }
    throw e;
  }
  if (contentVersion(target.read()) !== contentVersion(cur)) throw storeError('E_STORE_CONVERT', 'a base lida do gbrain não reproduz a original; a pasta local não foi alterada (confira o commit enviado)');
  const tip = join(dir, TIP);
  const commit = spawnSync('git', ['-C', tip, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const listed = spawnSync('git', ['-C', tip, 'ls-tree', '-r', '--name-only', 'HEAD', '--', valid.prefix], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  // The gbrain has the base; now the folder follows.
  writeAtomic(join(dir, MANIFEST), JSON.stringify({ archlens: cur.raw.archlens ?? FORMAT, name: cur.raw.name, store: valid }, null, 2) + '\n');
  ignoreMirror(dir);
  for (const rel of own) rmSync(join(dir, rel), { force: true });
  dropEmptied(dir, own);
  return { pages: listed.length, commit, warnings, from: source.kind, to: 'gbrain', version: contentVersion(cur), leftover: null, dropped: [] };
}

/** The journals of the applies in `dir` (oldest first). */
function appliesOf(dir) {
  const d = join(dir, APPLIES);
  return existsSync(d) ? readdirSync(d).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(d, f), 'utf8')))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)) : [];
}

/**
 * The convert to a gbrain in MCP mode waiting for its receipts, if any: { id, state, store, connector } for the last
 * journal that carries a `convert` and was not closed (finishedAt) while archlens.json is still the local one; null otherwise. Its connector runs --receipts, --resume and --undo.
 */
export function pendingConvertToMcp(locator) {
  if (openStore(locator).kind === 'gbrain') return null;
  const j = appliesOf(locator.path).filter(x => x.convert && x.state !== 'undone' && !x.finishedAt).at(-1);
  if (!j) return null;
  return { id: j.id, state: j.state, store: j.convert.store, connector: gbrainMcpConnector(locator, j.convert.store) };
}

/**
 * Moves a local base into the gbrain in MCP mode: the agent makes the writes. Asks for one create-only apply with every
 * page (the prefix has to be empty: a page already there fails on its own and shows up in the receipts) and keeps a
 * journal; nothing local changes until finishConvertToMcp, after all the receipts are in. The text people wrote in the
 * pages of a vault, and notes/removidos/**, travel in the pages like in git mode.
 */
function convertToGbrainMcp(locator, valid) {
  const dir = locator.path;
  const source = openStore(locator);
  if (source.kind === 'gbrain') throw storeError('E_STORE_CONVERT', `${source.describe()} já usa o conector gbrain`);
  if (!source.writable) source.apply([]);
  const cur = source.read();
  if (!cur) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${source.describe()}`);
  const open = pendingConvertToMcp(locator);
  if (open && ['requested', 'partial', 'committed'].includes(open.state)) {
    throw storeError('E_STORE_CONVERT', `já há uma conversão para o gbrain em andamento (apply ${open.id}); conclua com "archlens apply ${relative(process.cwd(), dir) || '.'} --receipts <resposta.json>", `
      + `retome com --resume ou desfaça com --undo ${open.id}`);
  }
  const connector = gbrainMcpConnector(locator, valid);
  const carry = source.kind === 'markdown' ? { base: readVault(dir), removed: removedFiles(dir) } : undefined;
  const own = [...new Set([...ownFiles(dir, source.kind), 'views.json', 'changelog.json'])];
  const made = connector.create(cur, { carry, convert: { store: valid, from: source.kind, version: contentVersion(cur), own } });
  return { ...made, mode: 'mcp', connector, from: source.kind, to: 'gbrain', version: contentVersion(cur), dropped: [] };
}

/**
 * Closes a convert to the MCP gbrain once its journal is committed: the mirror (what the receipts wrote) has to read back
 * as the original base, which has to be the one the request was made from; only then archlens.json becomes the
 * configuration one and the model files go (notes/, diagrams/ and files the base does not own stay).
 */
export function finishConvertToMcp(locator) {
  const dir = locator.path;
  const pend = pendingConvertToMcp(locator);
  const j = pend && appliesOf(dir).find(x => x.id === pend.id);
  if (!j || j.state !== 'committed') {
    throw storeError('E_STORE_CONVERT', `a conversão para o gbrain ainda não terminou (${j ? `apply ${j.id} "${j.state}"` : 'nenhum pedido'}); a pasta local não foi alterada`);
  }
  const there = pend.connector.read();
  if (!there || contentVersion(there) !== j.convert.version) throw storeError('E_STORE_CONVERT', 'a base lida do espelho não reproduz a original; a pasta local não foi alterada (confira as páginas gravadas no gbrain)');
  const source = openStore(locator);
  const cur = source.read();
  if (contentVersion(cur) !== j.convert.version) {
    throw storeError('E_STORE_CONVERT', 'a base local mudou depois do pedido de conversão; a pasta local não foi alterada. Desfaça o apply com --undo e converta de novo');
  }
  writeAtomic(join(dir, MANIFEST), JSON.stringify({ archlens: cur.raw.archlens ?? FORMAT, name: cur.raw.name, store: j.convert.store }, null, 2) + '\n');
  ignoreMirror(dir);
  for (const rel of j.convert.own) rmSync(join(dir, rel), { force: true });
  dropEmptied(dir, j.convert.own);
  // The journal stays (undo information) but is closed: a later conversion back to local does not make it pending again.
  writeAtomic(join(dir, APPLIES, `${j.id}.json`), JSON.stringify({ ...j, finishedAt: new Date().toISOString() }, null, 2) + '\n');
  return { pages: Object.keys(j.pages).length, from: j.convert.from, to: 'gbrain', version: j.convert.version, leftover: null, dropped: [] };
}

/** Every file under `dir` as a path relative to it. */
function filesUnder(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesUnder(dir, join(rel, e.name)) : [join(rel, e.name)]));
}

/** Removes the clone's registration of the worktree at `path` whose folder is gone (<common dir>/worktrees/<name>, by its gitdir). */
function dropRegistration(repo, path) {
  const common = spawnSync('git', ['-C', repo, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' });
  if (common.status !== 0) return;
  const admin = join(resolve(repo, common.stdout.trim()), 'worktrees');
  if (!existsSync(admin)) return;
  for (const name of readdirSync(admin)) {
    let gitdir;
    try { gitdir = readFileSync(join(admin, name, 'gitdir'), 'utf8').trim(); } catch { continue; }
    if (resolve(dirname(gitdir)) === resolve(path)) rmSync(join(admin, name), { recursive: true, force: true });
  }
}

/** Takes the tip worktree (<dir>/.archlens/tip) out of the clone and the folder; the base is local again. */
function dropTip(dir, store) {
  if (store.mode === 'mcp') {
    // The mirror and the requests belong to the gbrain base; the journals stay.
    for (const sub of [MIRROR, REMOTE, SESSION]) rmSync(join(dir, sub), { recursive: true, force: true });
    const left = join(dir, '.archlens');
    if (existsSync(left) && !readdirSync(left).length) rmSync(left, { recursive: true });
    return;
  }
  const tip = join(dir, TIP);
  const repo = resolve(dir, store.repo);
  if (existsSync(repo)) {
    // Only the tip's registration: "git worktree prune" would also drop the user's own stale ones.
    const removed = spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', tip], { encoding: 'utf8' });
    if (removed.status !== 0) dropRegistration(repo, tip);
  }
  rmSync(tip, { recursive: true, force: true });
  const mirror = join(dir, '.archlens');
  if (existsSync(mirror) && !readdirSync(mirror).length) rmSync(mirror, { recursive: true });
}

/**
 * Brings a gbrain (git) base back to the folder as json or markdown: the base is written to a temporary folder, read back
 * and checked, and its files go over the folder (archlens.json last), which keeps its notes/, diagrams/ and other files.
 */
export function convertFromGbrain(locator, to, { force = false } = {}) {
  if (!['json', 'markdown'].includes(to)) throw storeError('E_STORE_CONVERT', `conector de destino desconhecido "${to}"; use json ou markdown`);
  const dir = locator.path;
  const source = openStore(locator);
  if (source.kind !== 'gbrain') throw storeError('E_STORE_CONVERT', `${source.describe()} não usa o conector gbrain`);
  const cur = source.read();
  if (!cur) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${source.describe()}`);
  const before = contentVersion(cur);
  const vault = source.vault();
  // A vault keeps the text people wrote in the pages (and the text of removed elements); the json connector has nowhere to.
  const dropped = to === 'json' ? [...vault.base.ctx.pages.entries()].filter(([, p]) => (p.userText ?? '').trim()).map(([id]) => id) : [];
  if (dropped.length && !force) {
    throw storeError('E_STORE_CONVERT', `${dropped.length} página(s) têm texto das pessoas depois do bloco do archlens (${dropped.slice(0, 10).join(', ')}) e o conector json não tem onde guardá-lo; nada foi trocado. Use --force para convertê-las perdendo esse texto`);
  }
  const store = validateStore(readJson(join(dir, MANIFEST)).store);
  const tmp = `${dir}.convert-${process.pid}`;
  try {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, MANIFEST), JSON.stringify({ archlens: cur.raw.archlens ?? FORMAT, name: cur.raw.name, ...(to === 'markdown' ? { store: { kind: 'markdown' } } : {}) }, null, 2) + '\n');
    let target;
    if (to === 'markdown') {
      // The vault's pages are rendered over the gbrain's, so what people wrote in them comes along.
      target = markdownConnector({ ...locator, path: tmp }, tmp);
      for (const [rel, text] of vaultFiles(cur, vault.base, { read: rel => vault.files.get(rel) })) {
        if (text === null) continue;
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), text);
      }
      for (const [rel, text] of vault.files) {
        if (!rel.startsWith(REMOVED) || existsSync(join(tmp, rel))) continue;
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), text);
      }
    } else {
      target = jsonConnector({ ...locator, path: tmp }, tmp);
      target.apply(diffRaw(target.read(), cur), { baseVersion: target.version() });
    }
    if (contentVersion(target.read()) !== before) throw storeError('E_STORE_CONVERT', 'a base gravada pelo conector novo não reproduz a original; nada foi trocado');
    const files = filesUnder(tmp).sort((a, b) => (a === MANIFEST ? 1 : b === MANIFEST ? -1 : 0));
    for (const rel of files) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      if (rel === MANIFEST) writeAtomic(join(dir, rel), readFileSync(join(tmp, rel), 'utf8')); else copyFileSync(join(tmp, rel), join(dir, rel));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  dropTip(dir, store);
  return { from: 'gbrain', to, version: before, leftover: null, dropped, mirror: store.mode === 'mcp' };
}
