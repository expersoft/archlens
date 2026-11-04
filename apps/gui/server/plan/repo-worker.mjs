// Runs the repository work off the GUI's main thread: the scan of a clone (`scan`) and the text search over it
// (`grep`, a model-given regex). Posts the result or { error: { message } }.
import { parentPort, workerData } from 'node:worker_threads';
import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { normalizeRepoUrl } from '../../../../scripts/lib/scan/git.mjs';
import { scanDir } from '../../../../scripts/lib/scan/index.mjs';
import { isSecretPath } from './repo.mjs';

const GREP_FILE_MAX = 1024 * 1024;
const LINE_MAX = 300;

function scan({ dir, url }) {
  const inv = scanDir(dir, { url });
  // the temp folder is the server's business, not the model's
  return { commit: inv.repo.commit, inv: { ...inv, repo: { ...inv.repo, path: normalizeRepoUrl(url) } } };
}

const globRe = glob => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*')
  .replace(/\?/g, '[^/]').replace(/\0/g, '.*')}$`, 'i');

function grep({ dir, pattern, glob, limit }) {
  const re = new RegExp(pattern);
  const only = glob ? globRe(glob) : null;
  const matchGlob = rel => !only || only.test(glob.includes('/') ? rel : basename(rel));
  const out = [];
  let more = false;
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= limit) { more = true; return; }
      const abs = join(d, e.name);
      const rel = relative(dir, abs).split(sep).join('/');
      if (isSecretPath(rel)) continue;
      if (e.isDirectory()) { walk(abs); continue; }
      if (!e.isFile() || !matchGlob(rel) || lstatSync(abs).size > GREP_FILE_MAX) continue; // links never followed
      const buf = readFileSync(abs);
      if (buf.subarray(0, 8000).includes(0)) continue;
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i])) continue;
        if (out.length >= limit) { more = true; return; }
        out.push(`${rel}:${i + 1}: ${lines[i].slice(0, LINE_MAX)}`);
      }
    }
  };
  walk(dir);
  return { lines: out, more };
}

try {
  const job = workerData.job === 'grep' ? grep : scan;
  parentPort.postMessage({ result: job(workerData) });
} catch (e) {
  parentPort.postMessage({ error: { message: String(e.message ?? e) } });
}
