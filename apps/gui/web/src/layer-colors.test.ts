import { describe, expect, it } from 'vitest';
// @ts-expect-error o pacote não traz @types/node
import { readFileSync } from 'node:fs';

const dir = (import.meta as unknown as { dirname: string }).dirname;
const render = readFileSync(`${dir}/../../../../scripts/lib/render.mjs`, 'utf8');
const css = readFileSync(`${dir}/styles.css`, 'utf8');

const NAMES = ['biz', 'app', 'tech', 'mot', 'str', 'impl', 'oth'].flatMap((n) => [n, `${n}-s`]);

/** Variáveis de camada do bloco que começa em `start` (até a chave que fecha). */
function layerVars(source: string, start: string, from = 0) {
  const at = source.indexOf(start, from);
  expect(at).toBeGreaterThanOrEqual(0);
  const block = source.slice(at, source.indexOf('}', at));
  return Object.fromEntries(NAMES.map((n) => [n, new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{3,8})`).exec(block)?.[1]]));
}

describe('cores de camada da GUI', () => {
  it('tema claro: iguais às do render.mjs', () => {
    const want = layerVars(render, ':root{');
    expect(Object.values(want).every(Boolean)).toBe(true);
    expect(layerVars(css, ':root{--biz')).toEqual(want);
  });
  it('tema escuro: iguais às do render.mjs', () => {
    const want = layerVars(render, ':root[data-theme="dark"]{');
    expect(Object.values(want).every(Boolean)).toBe(true);
    expect(layerVars(css, ':root[data-theme="dark"]{--biz')).toEqual(want);
  });
});
