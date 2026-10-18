// All-or-nothing writes of a set of files inside a base folder: new contents go to temp files first, the caller's check
// runs right before the swap (a concurrent writer changes the version), then the renames and deletions happen.
import { writeFileSync, renameSync, rmSync, mkdirSync, readdirSync, rmdirSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { storeError } from './errors.mjs';

/** The folders `mkdirSync(d, { recursive: true })` created, from `first` (what it returned) down to `d`. */
function madeFolders(first, d) {
  const made = [];
  if (first) for (let p = resolve(d), top = resolve(first); p.length >= top.length; p = dirname(p)) made.push(p);
  return made;
}

/** Removes the folders of `made` that are empty, deepest first. */
function removeEmpty(made) {
  for (const d of made.sort((a, b) => b.length - a.length)) { try { if (!readdirSync(d).length) rmdirSync(d); } catch { /* gone */ } }
}

/** `changes`: relative path → new text, or null to delete. Throws before touching any file if a write or the check fails. */
export function writeFilesAtomically(dir, changes, { check } = {}) {
  const temps = [];
  const made = []; // folders created for the temp files, removed again if the write fails before the swap
  try {
    for (const [rel, text] of changes) {
      if (text == null) continue;
      const path = join(dir, rel);
      made.push(...madeFolders(mkdirSync(dirname(path), { recursive: true }), dirname(path)));
      const tmp = `${path}.tmp-${process.pid}`;
      writeFileSync(tmp, text);
      temps.push([tmp, path]);
    }
    check?.();
  } catch (e) {
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    removeEmpty(made);
    throw e;
  }
  const done = [];
  try {
    for (const [tmp, path] of temps) { renameSync(tmp, path); done.push(path); }
    for (const [rel, text] of changes) if (text == null) { rmSync(join(dir, rel), { force: true }); done.push(join(dir, rel)); }
  } catch (e) {
    for (const [tmp] of temps) rmSync(tmp, { force: true });
    removeEmpty(made);
    throw storeError('E_STORE_PARTIAL', `gravação interrompida depois de trocar ${done.length} arquivo(s) (${done.map(p => relative(dir, p)).join(', ') || 'nenhum'}): ${e.message}`);
  }
}
