#!/usr/bin/env node
// Checks the documentation (every versioned .md): relative links point to files or folders that exist, anchors exist
// among the headings of the target (GitHub's rule), and every "archlens <command>" in a bash block is a command the CLI
// has. External links (http, mailto) are not checked: the network would make the CI flaky. Exit 1 on any problem.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliCommands, cliHelp } from './gen-cli-doc.mjs';

// Folders whose markdown is data for tests, not documentation: their links are broken on purpose or point inside
// fixtures that only exist when a test builds them.
const EXCLUDED = [
  'tests/fixtures/', // bases, gbrain pages and repositories used as test input
];

const FENCE = /^\s*(```|~~~)/;

/** The lines of a markdown text, each with whether it is inside a fenced code block and that block's language. */
function scan(markdown) {
  const out = [];
  let fence = null;
  for (const [i, line] of markdown.split('\n').entries()) {
    const m = FENCE.exec(line);
    if (m && !fence) { fence = { mark: m[1], lang: line.trim().slice(3).trim().split(/\s/)[0].toLowerCase() }; out.push({ line, n: i + 1, code: true, fenceLine: true }); continue; }
    if (m && fence && line.trim().startsWith(fence.mark)) { fence = null; out.push({ line, n: i + 1, code: true, fenceLine: true }); continue; }
    out.push({ line, n: i + 1, code: !!fence, lang: fence?.lang });
  }
  return out;
}

const noInlineCode = line => line.replace(/(`+)[^`]*?\1/g, '');

/** GitHub's anchor for a heading: lowercase, accents kept, punctuation removed, each space a hyphen. */
export function slugify(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-');
}

/** The anchors a markdown text defines: its headings (repeated ones numbered -1, -2…) and <a id|name>. */
export function anchorsOf(markdown) {
  const seen = new Map();
  const out = new Set();
  for (const { line, code } of scan(markdown)) {
    if (code) continue;
    const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const base = slugify(h[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      out.add(n ? `${base}-${n}` : base);
    }
    for (const a of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) out.add(a[1].toLowerCase());
  }
  return out;
}

/** The link targets of a markdown text outside code, decoded, with their line: inline links, images and definitions. */
export function linksOf(markdown) {
  const out = [];
  for (const { line, n, code } of scan(markdown)) {
    if (code) continue;
    const text = noInlineCode(line);
    const targets = [...text.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)].map(m => m[1]);
    const def = /^\s{0,3}\[[^\]]+\]:\s+(<[^>]+>|\S+)/.exec(text);
    if (def) targets.push(def[1]);
    for (const t of targets) {
      let target = t.replace(/^<|>$/g, '');
      try { target = decodeURIComponent(target); } catch { /* keep it as written */ }
      out.push({ target, line: n });
    }
  }
  return out;
}

const CLI_LINE = /^\s*(?:\$\s+)?(?:archlens|bin\/archlens(?:\.cmd)?|node\s+scripts\/archlens\.mjs)\s+([a-z][a-z-]*)/;

/** The archlens commands called at the start of a line in bash/sh blocks. */
export function commandsOf(markdown) {
  const out = [];
  for (const { line, n, code, fenceLine, lang } of scan(markdown)) {
    if (!code || fenceLine || !['bash', 'sh', 'shell', 'console'].includes(lang)) continue;
    const m = CLI_LINE.exec(line);
    if (m) out.push({ command: m[1], line: n });
  }
  return out;
}

/** Problems of `files` (paths relative to `root`), as "file:line: …". */
export function checkDocs({ root, files, commands }) {
  const problems = [];
  const anchors = new Map();
  const anchorsIn = file => {
    if (!anchors.has(file)) anchors.set(file, anchorsOf(readFileSync(join(root, file), 'utf8')));
    return anchors.get(file);
  };
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const { target, line } of linksOf(text)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http, https, mailto, …
      const [pathPart, anchor] = target.split('#');
      const path = pathPart.split('?')[0];
      const dest = path ? normalize(path.startsWith('/') ? path.slice(1) : join(dirname(file), path)) : file;
      if (path && !existsSync(join(root, dest))) { problems.push(`${file}:${line}: link para ${path}, que não existe`); continue; }
      if (anchor === undefined || !anchor) continue;
      if (!dest.endsWith('.md') || statSync(join(root, dest)).isDirectory()) continue;
      if (!anchorsIn(dest).has(anchor.toLowerCase())) problems.push(`${file}:${line}: âncora #${anchor} não existe em ${dest}`);
    }
    for (const { command, line } of commandsOf(text)) {
      if (!commands.includes(command)) problems.push(`${file}:${line}: comando "archlens ${command}" não existe na CLI`);
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(f => f && !EXCLUDED.some(dir => f.startsWith(dir)));
  const problems = checkDocs({ root, files, commands: cliCommands(cliHelp()) });
  for (const p of problems) console.error(p);
  console.log(problems.length ? `✗ ${problems.length} problema(s) na documentação` : `✓ documentação: links e comandos em ${files.length} arquivos`);
  process.exitCode = problems.length ? 1 : 0;
}
