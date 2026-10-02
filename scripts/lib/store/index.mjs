// Where the knowledge base lives and how to read and write it. Only this module and its adapters touch base
// files. A future adapter (another folder, a bucket, an MCP knowledge store) implements the same contract:
// kind, writable, describe(), load(), save(), assertWritable().
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative, basename, extname } from 'node:path';
import { loadFolder, saveFolder, MANIFEST } from './folder.mjs';
import { loadLegacy, legacyNotes } from './legacy.mjs';
import { storeError } from './errors.mjs';

export { storeError, MANIFEST };

const BLOCK_RE = /```archlens-json/;
const rel = p => relative(process.cwd(), p) || '.';

function frontmatterSource(md) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md);
  const line = fm && /^source:\s*(.+)$/m.exec(fm[1]);
  return line ? line[1].trim().replace(/^"(.*)"$/, '$1') : null;
}

const folderAt = (path, docPath) => ({
  kind: 'folder', path, exists: existsSync(join(path, MANIFEST)), docPath: docPath ?? join(dirname(path), 'ARCHITECTURE.md'),
});

const NOT_BASE_MD = arg => `${arg} não é uma base archlens (nem bloco archlens-json, nem "source:" no cabeçalho). `
  + 'Para começar uma base a partir dele, trate o conteúdo como texto livre (delta) e rode '
  + '"archlens merge architecture/ delta.json --plan plano.json".';

/**
 * A folder as a base: with the manifest it is one; missing or empty it can become one (only with `create`);
 * anything else is refused, so the CLI never writes a base into a folder that holds other things.
 */
function folderBase(p, { create, label = rel(p), docPath, missing = `base não encontrada: ${label}` }) {
  if (existsSync(join(p, MANIFEST))) return folderAt(p, docPath);
  const empty = !existsSync(p) || (statSync(p).isDirectory() && !readdirSync(p).length);
  if (!empty) throw storeError('E_STORE_NOT_BASE', `${label} não é uma base archlens (falta ${MANIFEST}) e não está vazia`);
  if (create) return folderAt(p, docPath);
  throw storeError('E_STORE_NOT_FOUND', missing);
}

export function resolveBase(arg, { cwd = process.cwd(), create = false } = {}) {
  if (arg == null) return discover(resolve(cwd), create);
  const p = resolve(cwd, arg);
  const ext = extname(p).toLowerCase();
  if (basename(p) === MANIFEST) return folderAt(dirname(p));
  if (ext === '.md') {
    if (!existsSync(p)) return folderBase(join(dirname(p), 'architecture'), { create, docPath: p, missing: `arquivo não encontrado: ${arg}` });
    const text = readFileSync(p, 'utf8');
    const src = frontmatterSource(text);
    if (src) return folderBase(resolve(dirname(p), src), { create, docPath: p, missing: `a fonte apontada por ${arg} (${src}) não existe` });
    if (BLOCK_RE.test(text)) return { kind: 'legacy', path: p, exists: true, docPath: p };
    throw storeError('E_STORE_NOT_BASE', NOT_BASE_MD(arg));
  }
  if (ext === '.json') {
    if (!existsSync(p)) throw storeError('E_STORE_NOT_FOUND', `arquivo não encontrado: ${arg}`);
    return { kind: 'legacy', path: p, exists: true, docPath: join(dirname(p), 'ARCHITECTURE.md') };
  }
  return folderBase(p, { create, label: arg });
}

/** Walks up from cwd: first architecture/archlens.json, then ARCHITECTURE.md. */
function discover(cwd, create) {
  const up = function* () { for (let d = cwd; ; d = dirname(d)) { yield d; if (dirname(d) === d) return; } };
  for (const d of up()) if (existsSync(join(d, 'architecture', MANIFEST))) return folderAt(join(d, 'architecture'));
  for (const d of up()) if (existsSync(join(d, 'ARCHITECTURE.md'))) return resolveBase(join(d, 'ARCHITECTURE.md'), { cwd, create });
  return folderBase(join(cwd, 'architecture'), {
    create, missing: `nenhuma base encontrada (architecture/${MANIFEST} ou ARCHITECTURE.md) a partir de ${rel(cwd)}; informe o caminho`,
  });
}

export function openStore(locator) {
  if (locator.kind === 'folder') {
    let last = null; // what load() saw: save() keeps its layout and file origins
    return {
      kind: 'folder', writable: true, locator,
      describe: () => `${rel(locator.path)}/`,
      assertWritable() {},
      load() {
        if (!existsSync(join(locator.path, MANIFEST))) return { raw: null, notes: {}, origins: null, layout: undefined };
        last = loadFolder(locator.path);
        return last;
      },
      save(raw, { notes, origins = last?.origins, layout = last?.layout } = {}) {
        saveFolder(locator.path, raw, { notes, origins, layout });
      },
    };
  }
  const legacyError = () => storeError('E_STORE_LEGACY',
    `esta base está no formato antigo (bloco archlens-json no .md); rode "archlens migrate ${rel(locator.path)}" para convertê-la para a pasta architecture/`);
  return {
    kind: 'legacy', writable: false, locator,
    describe: () => `${rel(locator.path)} (formato antigo)`,
    assertWritable() { throw legacyError(); },
    load() {
      const { raw, keeps } = loadLegacy(locator.path);
      return { raw, notes: legacyNotes(raw, keeps), origins: null, layout: undefined };
    },
    save() { throw legacyError(); },
  };
}
