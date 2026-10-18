// All-or-nothing writes of a set of files inside a base folder: new contents go to temp files first, the caller's check
// runs right before the swap (a concurrent writer changes the version), then the renames and deletions happen.
import { writeFileSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { storeError } from './errors.mjs';

/** `changes`: relative path → new text, or null to delete. Throws before touching any file if a write or the check fails. */
export function writeFilesAtomically(dir, changes, { check } = {}) {
  const temps = [];
  try {
    for (const [rel, text] of changes) {
      if (text == null) continue;
      const path = join(dir, rel);
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${process.pid}`;
      writeFileSync(tmp, text);
      temps.push([tmp, path]);
    }
    check?.();
  } catch (e) {
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    throw e;
  }
  const done = [];
  try {
    for (const [tmp, path] of temps) { renameSync(tmp, path); done.push(path); }
    for (const [rel, text] of changes) if (text == null) { rmSync(join(dir, rel), { force: true }); done.push(join(dir, rel)); }
  } catch (e) {
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    throw storeError('E_STORE_PARTIAL', `gravação interrompida depois de trocar ${done.length} arquivo(s) (${done.map(p => relative(dir, p)).join(', ') || 'nenhum'}): ${e.message}`);
  }
}
