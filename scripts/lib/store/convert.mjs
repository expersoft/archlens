// store convert: the same base written by another connector in the same folder. The folder is copied, the source
// connector's files are taken out of the copy, the target connector writes the base into it, the copy is read back and
// checked, then swapped in. Files the base does not own stay.
import { cpSync, renameSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { storeError } from './errors.mjs';
import { contentVersion, diffRaw } from './ops.mjs';
import { MANIFEST, readJson, loadFolder, jsonConnector } from './folder.mjs';
import { readVault, markdownConnector } from './markdown.mjs';
import { PACK_FILE } from './gbrain-pack.mjs';
import { openStore } from './index.mjs';

/** The files of `kind` in `dir` that are the base itself (not notes, views or changelog, which every connector shares). */
function ownFiles(dir, kind) {
  if (kind === 'markdown') return [...readVault(dir).ctx.pages.values()].map(p => p.rel).concat(existsSync(join(dir, PACK_FILE)) ? [PACK_FILE] : []);
  const { origins, layout } = loadFolder(dir);
  const model = layout?.model ?? 'model.json';
  if (!model.endsWith('/')) return [model];
  return [...new Set([...origins.elements.values(), ...origins.relationships.values()])]
    .concat(readdirSync(join(dir, model)).filter(f => f.endsWith('.json')).map(f => model + f));
}

export function convertFolder(locator, to) {
  if (!['json', 'markdown'].includes(to)) throw storeError('E_STORE_CONVERT', `conector de destino desconhecido "${to}"; use json ou markdown`);
  const source = openStore(locator);
  if (!source.writable) source.apply([]);
  if (source.kind === to) throw storeError('E_STORE_CONVERT', `${source.describe()} já usa o conector ${to}`);
  const cur = source.read();
  if (!cur) throw storeError('E_STORE_NOT_FOUND', `base não encontrada: ${source.describe()}`);
  const before = contentVersion(cur);
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
  return { from: source.kind, to, version: before, leftover };
}
