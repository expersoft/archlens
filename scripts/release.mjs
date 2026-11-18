#!/usr/bin/env node
// Prepares a version of the archlens without a hand edit: the next version in package.json (npm version, which also
// rewrites the plugin manifests through scripts.version), the archlens-ask regenerated (its REFERENCE.md cites the
// version) and the "[Não lançado]" section of CHANGELOG.md closed. No commit, no branch, no GitHub: the release
// workflow (.github/workflows/release.yml) does that part, and anyone can run this by hand as the fallback.
//   node scripts/release.mjs <patch|minor|major|premajor|preminor|prerelease> [--preid alpha] [--date AAAA-MM-DD] [--notes arquivo]
//   node scripts/release.mjs notes <versão> [--out arquivo]   the notes of a version (exit 1 when the section is missing)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/expersoft/archlens';
const UNRELEASED = '## [Não lançado]';
export const TYPES = ['patch', 'minor', 'major', 'premajor', 'preminor', 'prerelease'];

const releaseError = (code, message) => Object.assign(new Error(message), { code });
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The version npm version would give for `type` (the six types the release accepts). */
export function nextVersion(current, type, preid = 'alpha') {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(current);
  if (!m) throw releaseError('E_RELEASE_TYPE', `versão atual inválida: ${current}`);
  const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const pre = m[4];
  switch (type) {
    case 'patch': return pre ? `${x}.${y}.${z}` : `${x}.${y}.${z + 1}`;
    case 'minor': return pre && z === 0 ? `${x}.${y}.0` : `${x}.${y + 1}.0`;
    case 'major': return pre && y === 0 && z === 0 ? `${x}.0.0` : `${x + 1}.0.0`;
    case 'premajor': return `${x + 1}.0.0-${preid}.0`;
    case 'preminor': return `${x}.${y + 1}.0-${preid}.0`;
    case 'prerelease': {
      if (!pre) return `${x}.${y}.${z + 1}-${preid}.0`;
      const p = new RegExp(`^${escape(preid)}\\.(\\d+)$`).exec(pre);
      return p ? `${x}.${y}.${z}-${preid}.${Number(p[1]) + 1}` : `${x}.${y}.${z}-${preid}.0`;
    }
    default: throw releaseError('E_RELEASE_TYPE', `tipo de versão desconhecido: ${type} (use ${TYPES.join(', ')})`);
  }
}

/** [start, end) of the section whose heading line starts with `prefix`, or null. */
function section(text, prefix) {
  const start = text.split('\n').findIndex(l => l === prefix || l.startsWith(`${prefix} `));
  if (start < 0) return null;
  const lines = text.split('\n');
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('## ') && !/^\[[^\]]+\]: /.test(lines[end])) end++;
  return { lines, start, end };
}

/** The body of `## [<version>] — …`, trimmed; null when there is no such section. */
export function releaseNotes(text, version) {
  const s = section(text, `## [${version}]`);
  return s ? s.lines.slice(s.start + 1, s.end).join('\n').trim() : null;
}

/** CHANGELOG.md with "[Não lançado]" closed as `version` on `date`, a new empty one above, and the compare links updated. */
export function closeChangelog(text, { version, previous, date }) {
  const s = section(text, UNRELEASED);
  if (!s) throw releaseError('E_RELEASE_EMPTY', `o CHANGELOG.md não tem a seção "${UNRELEASED}"`);
  const body = s.lines.slice(s.start + 1, s.end);
  if (!body.some(l => l.trim() && !l.startsWith('#'))) {
    throw releaseError('E_RELEASE_EMPTY', `a seção "${UNRELEASED}" do CHANGELOG.md está vazia: escreva o que muda antes de preparar a versão`);
  }
  const lines = [...s.lines];
  lines.splice(s.start, 1, UNRELEASED, '', `## [${version}] — ${date}`);
  const unreleasedLink = `[Não lançado]: ${REPO}/compare/v${version}...HEAD`;
  const versionLink = `[${version}]: ${REPO}/compare/v${previous}...v${version}`;
  const at = lines.findIndex(l => l.startsWith('[Não lançado]: '));
  if (at >= 0) lines.splice(at, 1, unreleasedLink, versionLink);
  else {
    while (lines.length && lines.at(-1) === '') lines.pop();
    lines.push('', unreleasedLink, versionLink, '');
  }
  return lines.join('\n');
}

/**
 * Prepares the version in `root`. Every refusal comes before any file changes. `exec(cmd, args)` runs a command in
 * `root` and returns its stdout. Returns `{ version, previous, notes }`.
 */
export function prepareRelease({ root, type, preid = 'alpha', date, exec }) {
  if (!TYPES.includes(type)) throw releaseError('E_RELEASE_TYPE', `tipo de versão desconhecido: ${type} (use ${TYPES.join(', ')})`);
  if (exec('git', ['status', '--porcelain']).trim()) {
    throw releaseError('E_RELEASE_DIRTY', 'a árvore tem mudanças não commitadas: prepare a versão a partir de um checkout limpo');
  }
  const tags = new Set(exec('git', ['tag', '-l', 'v*']).split('\n').map(t => t.trim()).filter(Boolean));
  const pkgPath = join(root, 'package.json');
  const previous = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  if (!tags.has(`v${previous}`)) {
    throw releaseError('E_RELEASE_UNTAGGED', `a versão ${previous} ainda não tem tag: promova a ${previous} para a main antes de preparar outra`);
  }
  const version = nextVersion(previous, type, preid);
  if (tags.has(`v${version}`)) throw releaseError('E_RELEASE_TAG_EXISTS', `a tag v${version} já existe`);
  const logPath = join(root, 'CHANGELOG.md');
  const closed = closeChangelog(readFileSync(logPath, 'utf8'), { version, previous, date });
  exec('npm', ['version', version, '--no-git-tag-version']);
  exec('npm', ['run', 'ask']);
  writeFileSync(logPath, closed);
  return { version, previous, notes: releaseNotes(closed, version) };
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const args = process.argv.slice(2);
  try {
    if (args[0] === 'notes') {
      const notes = releaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), args[1] ?? '');
      if (notes === null) throw releaseError('E_RELEASE_NOTES', `o CHANGELOG.md não tem a seção da versão ${args[1]}`);
      const out = option(args, '--out');
      if (out) writeFileSync(out, `${notes}\n`);
      else console.log(notes);
    } else {
      const exec = (cmd, a) => execFileSync(cmd, a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
      const date = option(args, '--date') ?? new Date().toISOString().slice(0, 10);
      const r = prepareRelease({ root, type: args[0], preid: option(args, '--preid') ?? 'alpha', date, exec });
      const notesFile = option(args, '--notes');
      if (notesFile) writeFileSync(notesFile, `${r.notes}\n`);
      console.log(r.version);
    }
  } catch (e) {
    console.error(`archlens release: ${e.message}`);
    process.exitCode = 1;
  }
}
