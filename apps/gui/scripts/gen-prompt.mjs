#!/usr/bin/env node
// Builds the LLM system prompts (text search, planning) from the hand-written protocol head plus
// references/views.md and the query skill tables, so the view rules never drift. --check only reports.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ASK = fileURLToPath(new URL('../server/ask/', import.meta.url));
export const PROMPT_FILE = join(ASK, 'system-prompt.md');
const PLAN = fileURLToPath(new URL('../server/plan/', import.meta.url));
export const PLAN_PROMPT_FILE = join(PLAN, 'system-prompt.md');
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

/** The planning prompt: hand-written head plus the archlens-plan SKILL.md without its frontmatter. */
export function buildPlanPrompt() {
  const head = readFileSync(join(PLAN, 'prompt-head.md'), 'utf8').trimEnd();
  const skill = readFileSync(join(ROOT, 'skills/archlens-plan/SKILL.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return `${BANNER}\n${head}\n\n${skill}\n`;
}

/** Problems found (empty: the committed prompt is current). */
export function checkPrompt() {
  const problems = [];
  if (!existsSync(PROMPT_FILE)) problems.push('apps/gui/server/ask/system-prompt.md ausente; rode "npm --prefix apps/gui run prompt"');
  else if (readFileSync(PROMPT_FILE, 'utf8') !== buildPrompt()) problems.push('apps/gui/server/ask/system-prompt.md desatualizado; rode "npm --prefix apps/gui run prompt"');
  const plan = 'apps/gui/server/plan/system-prompt.md';
  if (!existsSync(PLAN_PROMPT_FILE)) return [...problems, `${plan} ausente; rode "npm --prefix apps/gui run prompt"`];
  if (readFileSync(PLAN_PROMPT_FILE, 'utf8') !== buildPlanPrompt()) problems.push(`${plan} desatualizado; rode "npm --prefix apps/gui run prompt"`);
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) {
    const problems = checkPrompt();
    for (const p of problems) console.error(`archlens-gui: ${p}`);
    process.exitCode = problems.length ? 1 : 0;
  } else {
    writeFileSync(PROMPT_FILE, buildPrompt());
    writeFileSync(PLAN_PROMPT_FILE, buildPlanPrompt());
    console.log('✓ apps/gui/server/ask/system-prompt.md');
    console.log('✓ apps/gui/server/plan/system-prompt.md');
  }
}
