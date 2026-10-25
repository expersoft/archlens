#!/usr/bin/env node
// Regenerates the generated files of portable/archlens-ask/ from the code of the full archlens, so the package never drifts.
// It only reads the archlens (registry, render, explain, gbrain pack): nothing there changes for the package. --check only reports.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ELEMENT_TYPES, RELATIONSHIP_TYPES, LAYER_ORDER, LAYER_LABELS, STATUSES, STORE_TAGS, C4_KINDS, C4_LABELS, C4_KIND_TYPES,
  supportDirection,
} from './lib/registry.mjs';
import { GLOSSARY } from './lib/explain.mjs';
import { ARCHIMATE_VIEWPOINTS } from './lib/query-archimate.mjs';
import { gbrainPack } from './lib/store/gbrain-pack.mjs';
import { COMMON_TAG } from './lib/store/gbrain-layout.mjs';
import { parse as parseYaml } from './vendor/yaml/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ASK_DIR = join(ROOT, 'portable', 'archlens-ask');
const REL_DIR = 'portable/archlens-ask';
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const version = () => JSON.parse(read('package.json')).version;

/** The CSS variables of the first :root block (the light theme), e.g. { biz: '#fff5a8', 'biz-s': '#a89a2c' }. */
export function themeColors(renderSource) {
  const at = renderSource.indexOf(':root{');
  if (at < 0) return {};
  const block = renderSource.slice(at, renderSource.indexOf('}', at));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map(m => [m[1], m[2]]));
}

/** Inverse link type of each relationship type, as the gbrain schema pack declares it. */
export function relationshipInverses() {
  const types = Object.keys(RELATIONSHIP_TYPES);
  const raw = { model: {
    elements: [{ id: 'a', type: 'application-component' }, { id: 'b', type: 'application-component' }],
    relationships: types.map(type => ({ from: 'a', to: 'b', type })),
  } };
  const pack = parseYaml(gbrainPack(raw));
  return Object.fromEntries(pack.link_types.filter(l => types.includes(l.name)).map(l => [l.name, l.inverse]));
}

const LAYER_COLORS = [['business', 'biz'], ['application', 'app'], ['technology', 'tech'], ['motivation', 'mot'], ['strategy', 'str'], ['implementation', 'impl'], ['other', 'oth']];
const C4_COLORS = [['person', 'c4-person'], ['softwareSystem', 'c4-system'], ['container', 'c4-container'], ['component', 'c4-component'], ['external', 'c4-external']];
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function supportCell(type) {
  const dir = supportDirection({ type, from: 'origem', to: 'destino' });
  if (!dir) return '—';
  return `${dir[0]} → ${dir[1]}${type === 'triggering' || type === 'flow' ? ' (só quando pedido)' : ''}`;
}

/** The content of REFERENCE.md. */
export function buildReference() {
  const colors = themeColors(read('scripts/lib/render.mjs'));
  const inverses = relationshipInverses();
  const ink = colors['am-ink'] ?? '#18202c';
  const out = [];
  out.push('# archlens-ask — referência');
  out.push('');
  out.push(`> Gerado por \`scripts/gen-ask.mjs\` a partir do archlens ${version()}; não edite. Formato de base: \`2.0\`.`);
  out.push('');

  out.push('## Tipos de elemento (ArchiMate 3.2)');
  out.push('');
  for (const layer of LAYER_ORDER) {
    const types = Object.entries(ELEMENT_TYPES).filter(([, d]) => d.layer === layer);
    if (!types.length) continue;
    out.push(`### ${LAYER_LABELS[layer]} (\`${layer}\`)`);
    out.push('');
    out.push('| tipo | rótulo | camada | aspecto |');
    out.push('|---|---|---|---|');
    for (const [t, d] of types) out.push(`| \`${t}\` | ${d.label} | ${d.layer} | ${d.aspect} |`);
    out.push('');
  }

  out.push('## Tipos de relação');
  out.push('');
  out.push('"Quem sustenta quem" é a direção de suporte usada nas travessias (`supporters`/`dependents`). Força: usada na derivação (o tipo mais fraco da cadeia vence).');
  out.push('');
  out.push('| tipo | rótulo | força | inverso (gbrain) | quem sustenta quem | significado | leitura |');
  out.push('|---|---|---|---|---|---|---|');
  for (const [t, d] of Object.entries(RELATIONSHIP_TYPES)) {
    const g = GLOSSARY.types[t] ?? {};
    out.push(`| \`${t}\` | ${cell(g.label ?? d.label)} | ${d.strength} | \`${inverses[t]}\` | ${supportCell(t)} | ${cell(g.meaning)} | ${cell(g.reading)} |`);
  }
  out.push('');

  out.push('## Perfil C4');
  out.push('');
  out.push('| kind | rótulo | tipos ArchiMate aceitos |');
  out.push('|---|---|---|');
  for (const k of C4_KINDS) out.push(`| \`${k}\` | ${C4_LABELS[k]} | ${C4_KIND_TYPES[k].map(t => `\`${t}\``).join(', ')} |`);
  out.push('');
  out.push(`Tags de armazenamento (viram \`SystemDb\`/\`ContainerDb\`): ${STORE_TAGS.map(t => `\`${t}\``).join(', ')}. Tags de mensageria (viram \`SystemQueue\`/\`ContainerQueue\`): \`topic\`, \`queue\`, \`messaging\`.`);
  out.push('');

  out.push('## Status');
  out.push('');
  out.push(`${STATUSES.map(s => `\`${s}\``).join(', ')}. Padrão das visões: todos menos \`retired\`.`);
  out.push('');

  out.push('## Viewpoints ArchiMate');
  out.push('');
  out.push(ARCHIMATE_VIEWPOINTS.map(v => `\`${v}\``).join(', '));
  out.push('');

  out.push('## Cores');
  out.push('');
  out.push('| uso | preenchimento | borda |');
  out.push('|---|---|---|');
  for (const [layer, v] of LAYER_COLORS) out.push(`| ${LAYER_LABELS[layer]} (\`${layer}\`) | \`${colors[v]}\` | \`${colors[`${v}-s`]}\` |`);
  for (const [kind, v] of C4_COLORS) out.push(`| C4 ${kind} | \`${colors[v]}\` | texto \`${kind === 'component' ? colors['c4-component-ink'] : colors['c4-ink']}\` |`);
  out.push(`| foco / âncora | — | \`${colors.focus}\` |`);
  out.push('');
  out.push('`classDef` para os diagramas ArchiMate (`flowchart`):');
  out.push('');
  out.push('```text');
  for (const [layer, v] of LAYER_COLORS) out.push(`classDef ${layer} fill:${colors[v]},stroke:${colors[`${v}-s`]},color:${ink}`);
  out.push(`classDef anchor stroke:${colors.focus},stroke-width:4px`);
  out.push('classDef draft stroke-dasharray:5 3');
  out.push('```');
  out.push('');
  out.push('Estilos para os diagramas C4 (sintaxe C4 do Mermaid), um por elemento:');
  out.push('');
  out.push('```text');
  for (const [kind, v] of C4_COLORS) {
    const font = kind === 'component' ? colors['c4-component-ink'] : colors['c4-ink'];
    out.push(`UpdateElementStyle(<id do ${kind}>, $bgColor="${colors[v]}", $fontColor="${font}", $borderColor="${colors['c4-person']}")`);
  }
  out.push(`UpdateElementStyle(<id da âncora>, $borderColor="${colors.focus}")`);
  out.push('```');
  out.push('');

  out.push('## Páginas da base no gbrain');
  out.push('');
  out.push(`Todas as páginas da base levam a tag \`${COMMON_TAG}\` e ficam sob um prefixo (padrão \`archlens/\`). Elementos levam também \`${COMMON_TAG}/<tipo>\` e, com perfil C4, \`${COMMON_TAG}/c4/<kind>\`.`);
  out.push('');
  out.push('| página | conteúdo útil |');
  out.push('|---|---|');
  out.push('| `<prefixo>/<tipo>/<id>.md` | frontmatter: `id`, `type`, `title`, `aliases`, `c4`, `status`, `technology`, `tags`, `group`, `parent`, `external`, `relationships` (lista `{id, type, to, description?, technology?}`, só as de saída); corpo: descrição + seção "Relações" em frases |');
  out.push('| `<prefixo>/views/<key>.md` | visão salva: resumo + spec num bloco ```` ```archlens-json ```` |');
  out.push('| `<prefixo>/manifest.md` | nome, descrição e formato da base (bloco `archlens-json`, campo `archlens`) |');
  out.push('| `<prefixo>/notes/<nome>.md` | notas de interpretação |');
  out.push('| `<prefixo>/changelog.md` | histórico de rodadas |');
  out.push('| `<prefixo>/gbrain-pack.yaml` | schema pack: tipos de página e tipos de ligação com inversos |');
  out.push('');
  out.push('Ligações extras do schema pack: `part_of` (inverso `composed_of`, do campo `parent`) e `member_of` (inverso `has_member`, do campo `group`).');
  out.push('');
  return out.join('\n');
}

/** Repository-relative path → generated content. */
export function askFiles() {
  return new Map([[`${REL_DIR}/REFERENCE.md`, buildReference()]]);
}

/** Problems found (empty: the package is current). */
export function checkAsk() {
  const problems = [];
  for (const [rel, text] of askFiles()) {
    const path = join(ROOT, rel);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) problems.push(`${rel} desatualizado; rode "npm run ask"`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const problems = checkAsk();
    for (const p of problems) console.error(`archlens: ${p}`);
    process.exitCode = problems.length ? 1 : 0;
  } else {
    for (const [rel, text] of askFiles()) {
      const path = join(ROOT, rel);
      if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      console.log(`✓ ${rel}`);
    }
  }
}
