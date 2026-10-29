// GUI configuration: a JSON file listing the bases, or a single base given on the command line.
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export const DEFAULT_PORT = 5180;

/** @returns {{ port: number, bases: { id: string, name?: string, path: string }[] }} */
export function loadConfig({ file, base, port } = {}) {
  if (file) {
    const abs = resolve(file);
    const cfg = JSON.parse(readFileSync(abs, 'utf8'));
    const bases = (cfg.bases ?? []).map(b => ({
      id: b.id,
      ...(b.name ? { name: b.name } : {}),
      path: resolve(dirname(abs), b.path),
    }));
    return { port: port ?? cfg.port ?? DEFAULT_PORT, bases };
  }
  if (base) {
    const abs = resolve(base);
    return { port: port ?? DEFAULT_PORT, bases: [{ id: basename(abs), path: abs }] };
  }
  return { port: port ?? DEFAULT_PORT, bases: [] };
}
