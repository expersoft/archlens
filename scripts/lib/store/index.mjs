// Where the knowledge base lives and how to read and write it. Only this module and its adapters touch base
// files. Each adapter is a connector (contract.mjs): describe(), read(), readSubgraph(), version(), apply(), history().
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative, basename, extname } from 'node:path';
import { jsonConnector, readJson, MANIFEST } from './folder.mjs';
import { legacyConnector } from './legacy.mjs';
import { storeError } from './errors.mjs';

export { storeError, MANIFEST };

const BLOCK_RE = /```archlens-json/;
const rel = p => relative(process.cwd(), p) || '.';

/** The `source:` of a document's frontmatter (LF or CRLF line endings), or null. */
export function frontmatterSource(md) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const line = fm && /^source:[ \t]*(.+?)\r?$/m.exec(fm[1]);
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

const legacyError = locator => () => storeError('E_STORE_LEGACY',
  `esta base está no formato antigo (bloco archlens-json no .md); rode "archlens migrate ${rel(locator.path)}" para convertê-la para a pasta architecture/`);

/** The connector `store.kind` names in the manifest (json when there is no manifest or no store). */
function folderKind(dir) {
  const p = join(dir, MANIFEST);
  const kind = existsSync(p) ? readJson(p).store?.kind ?? 'json' : 'json';
  if (kind !== 'json') {
    throw storeError('E_STORE_UNSUPPORTED', `"store.kind" "${kind}" em ${rel(p)} ainda não é suportado; use "json"`);
  }
  return kind;
}

export function openStore(locator) {
  if (locator.kind !== 'folder') return legacyConnector(locator, { describe: `${rel(locator.path)} (formato antigo)`, error: legacyError(locator) });
  folderKind(locator.path);
  return jsonConnector(locator, `${rel(locator.path)}/`);
}

/** Throws the connector's own refusal when it cannot write (the old .md base). */
export function assertWritable(store) {
  if (!store.writable) store.apply([]);
}
