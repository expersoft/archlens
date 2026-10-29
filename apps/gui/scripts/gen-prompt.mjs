#!/usr/bin/env node
// Builds the LLM system prompt of the text search from the hand-written protocol head plus
// references/views.md and the query skill tables, so the view rules never drift. --check only reports.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ASK = fileURLToPath(new URL('../server/ask/', import.meta.url));
export const PROMPT_FILE = join(ASK, 'system-prompt.md');
const BANNER = '<!-- gerado por apps/gui/scripts/gen-prompt.mjs; não edite -->';

/** The skill part from "## Pedido → view spec" up to (not including) "## Erros comuns". */
export function skillSections(skillMd) {
  const start = skillMd.indexOf('## Pedido → view spec');
  const end = skillMd.indexOf('## Erros comuns');
  if (start < 0 || end < start) throw new Error('skills/archlens-query/SKILL.md: seções "Pedido → view spec" e "Erros comuns" não encontradas');
  return skillMd.slice(start, end).trimEnd();
}

export function buildPrompt() {
  const head = readFileSync(join(ASK, 'prompt-head.md'), 'utf8').trimEnd();
  const views = readFileSync(join(ROOT, 'references/views.md'), 'utf8');
  const skill = skillSections(readFileSync(join(ROOT, 'skills/archlens-query/SKILL.md'), 'utf8'));
  return `${BANNER}\n${head}\n\n# Referência: view specs (references/views.md)\n\n${views}\n\n# Referência: pedido → spec e alertas (skill archlens-query)\n\n${skill}\n`;
}

/** Problems found (empty: the committed prompt is current). */
export function checkPrompt() {
  if (!existsSync(PROMPT_FILE)) return ['apps/gui/server/ask/system-prompt.md ausente; rode "npm --prefix apps/gui run prompt"'];
  if (readFileSync(PROMPT_FILE, 'utf8') !== buildPrompt()) return ['apps/gui/server/ask/system-prompt.md desatualizado; rode "npm --prefix apps/gui run prompt"'];
  return [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const problems = checkPrompt();
    for (const p of problems) console.error(`archlens-gui: ${p}`);
    process.exitCode = problems.length ? 1 : 0;
  } else {
    writeFileSync(PROMPT_FILE, buildPrompt());
    console.log('✓ apps/gui/server/ask/system-prompt.md');
  }
}
