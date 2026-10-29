// GUI configuration: a JSON file listing the bases, or a single base given on the command line.
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export const DEFAULT_PORT = 5180;

const configError = message => Object.assign(new Error(message), { code: 'E_GUI_CONFIG' });

/** Each base needs a non-empty string id and path; ids are unique. */
function checkBases(list, file) {
  if (!Array.isArray(list)) throw configError(`${file}: "bases" deve ser uma lista`);
  const seen = new Set();
  list.forEach((b, i) => {
    const id = b && typeof b === 'object' && typeof b.id === 'string' ? b.id : null;
    const who = `${file}: base ${i + 1}${id ? ` ("${id}")` : ''}`;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw configError(`${who} deve ser um objeto com id e path`);
    if (!id || !id.trim()) throw configError(`${who} precisa de um id (texto não vazio)`);
    if (typeof b.path !== 'string' || !b.path.trim()) throw configError(`${who} precisa de um path (texto não vazio)`);
    if (seen.has(id)) throw configError(`${who}: id repetido`);
    seen.add(id);
  });
}

/** @returns {{ port: number, bases: { id: string, name?: string, path: string }[] }} */
export function loadConfig({ file, base, port, host } = {}) {
  if (file) {
    const abs = resolve(file);
    const cfg = JSON.parse(readFileSync(abs, 'utf8'));
    checkBases(cfg.bases ?? [], file);
    const bases = (cfg.bases ?? []).map(b => ({
      id: b.id,
      ...(b.name ? { name: b.name } : {}),
      path: resolve(dirname(abs), b.path),
    }));
    const h = host ?? cfg.host;
    return { port: port ?? cfg.port ?? DEFAULT_PORT, ...(h ? { host: h } : {}), bases };
  }
  if (base) {
    const abs = resolve(base);
    return { port: port ?? DEFAULT_PORT, ...(host ? { host } : {}), bases: [{ id: basename(abs), path: abs }] };
  }
  return { port: port ?? DEFAULT_PORT, ...(host ? { host } : {}), bases: [] };
}
