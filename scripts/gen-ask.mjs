#!/usr/bin/env node
// Regenerates the generated files of portable/archlens-ask/ from the code of the full archlens, so the package never drifts.
// It only reads the archlens (registry, render, explain, gbrain pack): nothing there changes for the package. --check only reports.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  out.push(`Todas as páginas da base ficam sob um prefixo (padrão \`archlens/\`) e levam a tag \`${COMMON_TAG}\`. Elementos levam também \`${COMMON_TAG}/<tipo>\`, \`${COMMON_TAG}/c4/<kind>\` (com perfil C4) e \`${COMMON_TAG}/tag/<tag>\` para cada tag do elemento (ex.: \`${COMMON_TAG}/tag/database\`, \`${COMMON_TAG}/tag/queue\`).`);
  out.push('');
  out.push('| página (slug) | conteúdo útil |');
  out.push('|---|---|');
  out.push('| `<prefixo>/<tipo>/<id>` | `get_page` devolve `type` (tipo ArchiMate), `title` (nome), `tags` (acima) e `frontmatter`: `id`, `c4` (kind), `parent` e `group` (wikilinks), `aliases`, `technology`, `status` (**ausente = `active`**), `external`, `relationships` e um campo por tipo de relação com os wikilinks dos destinos (`serving: [[<prefixo>/<tipo>/<id>\\|Nome]]`); `compiled_truth`: descrição + seção "Relações" em frases |');
  out.push('| `<prefixo>/views/<key>` | visão salva: resumo + spec num bloco ```` ```archlens-json ```` |');
  out.push('| `<prefixo>/manifest` | tipo de página `archlens-manifest` (ache com `list_pages {"type":"archlens-manifest"}`); nome e descrição da base; o formato (`"archlens": "2.0"`) está no bloco `archlens-json` do corpo, não no frontmatter |');
  out.push('| `<prefixo>/notes/<nome>` | notas de interpretação |');
  out.push('| `<prefixo>/changelog` | histórico de rodadas |');
  out.push('');
  out.push('Cada item de `relationships` é `{id, type, to, description?, technology?, accessType?, status?}`: só as relações de **saída**; `to` é o **id** do destino (o slug completo está no wikilink do campo do mesmo tipo, ou em `resolve_slugs {"partial": "<id>"}`); `accessType` (só em `access`) é `read`, `write`, `readwrite` ou `access`; `status` ausente = `active`.');
  out.push('');
  out.push('`get_backlinks` devolve `{from_slug, link_type, link_source}`. Com ligações tipadas, cada relação de entrada aparece com o tipo dela (`serving`, `realization`…, `link_source: "frontmatter"`), a hierarquia como `part_of` e o grupo como `member_of`; as citações do corpo aparecem como `mentions` (`link_source: "markdown"`). Inversos no schema pack: `part_of` ↔ `composed_of`, `member_of` ↔ `has_member`.');
  out.push('');
  out.push('Parâmetros que confundem: `resolve_slugs {"partial": "texto"}` (devolve slugs que contêm o texto); `list_pages {"tag": "...", "limit": 100}`; `get_page {"slug": "..."}`; `get_backlinks {"slug": "..."}`; `search {"query": "..."}` (busca por palavra).');
  out.push('');
  return out.join('\n');
}

// The validation base: the same content the loja-online-gbrain demonstration loads into the gbrain.
export const EVAL_BASE = 'examples/loja-online/architecture';
const CLI = join(ROOT, 'scripts', 'archlens.mjs');

const cli = (args, id) => {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`gabarito "${id}": ${res.stderr.trim()}`);
  return res.stdout;
};

/**
 * The answer key: the CLI query (JSON) of each question that has one (spec, view or element), on the question's `base`
 * (default EVAL_BASE). View answers get `derived` and `via` on each edge (from the resolved view), so a validator knows
 * which relationships may differ in type.
 */
export function buildGabarito(perguntas) {
  const out = new Map();
  for (const q of perguntas) {
    const args = q.spec ? ['--spec', JSON.stringify(q.spec)] : q.view ? ['--view', q.view] : q.element ? ['--element', q.element, ...(q.depth ? ['--depth', String(q.depth)] : [])] : null;
    if (!args) continue;
    const base = q.base ?? EVAL_BASE;
    const answer = JSON.parse(cli(['query', base, ...args, '--format', 'json'], q.id));
    if (Array.isArray(answer.edges) && !q.element) {
      const resolved = JSON.parse(cli(['resolve', base, ...args], q.id));
      const byKey = new Map(resolved.edges.map(e => [`${e.from}|${e.type}|${e.to}`, e]));
      answer.edges = answer.edges.map(e => {
        const r = byKey.get(`${e.from}|${e.type}|${e.to}`);
        return { ...e, derived: Boolean(r?.derived), ...(r?.derived && r.via ? { via: r.via } : {}) };
      });
    }
    out.set(`${REL_DIR}/eval/gabarito/${q.id}.json`, `${JSON.stringify(answer, null, 2)}\n`);
  }
  return out;
}

/** Repository-relative path → generated content. */
export function askFiles() {
  const perguntas = JSON.parse(read(`${REL_DIR}/eval/perguntas.json`));
  return new Map([[`${REL_DIR}/REFERENCE.md`, buildReference()], ...buildGabarito(perguntas)]);
}

// Instructions limit of a Microsoft 365 Copilot declarative agent; what does not fit goes to RULES.md (attached knowledge).
export const INSTRUCTIONS_LIMIT = 8000;

/** What the package must mention: the viewpoints, the C4 levels and the spec fields that references/views.md documents. */
export function coverageTerms(viewsMd) {
  const terms = new Set(ARCHIMATE_VIEWPOINTS);
  for (const line of viewsMd.split('\n')) {
    const m = /^\| ((?:`[^`]+`(?:, )?)+) \|/.exec(line); // top-level table rows only (the layout-style table is indented)
    if (!m) continue;
    for (const [, t] of m[1].matchAll(/`([^`]+)`/g)) terms.add(t);
    if (m[1] === '`level`') for (const [, t] of line.slice(m[0].length).matchAll(/`([^`]+)`/g)) terms.add(t);
  }
  return [...terms];
}

/** Problems of the hand-written part (empty: ok): INSTRUCTIONS.md too long, or a term of coverageTerms missing from both files. */
export function checkCoverage({ instructions, rules, viewsMd }) {
  const problems = [];
  if (instructions.length > INSTRUCTIONS_LIMIT) problems.push(`INSTRUCTIONS.md tem ${instructions.length} caracteres (limite ${INSTRUCTIONS_LIMIT})`);
  for (const t of coverageTerms(viewsMd)) {
    if (!instructions.includes(`\`${t}\``) && !rules.includes(`\`${t}\``)) problems.push(`termo "${t}" não aparece em INSTRUCTIONS.md nem em RULES.md`);
  }
  return problems;
}

/** Problems found (empty: the package is current). */
export function checkAsk() {
  const problems = [];
  const hand = name => (existsSync(join(ASK_DIR, name)) ? readFileSync(join(ASK_DIR, name), 'utf8') : '');
  problems.push(...checkCoverage({ instructions: hand('INSTRUCTIONS.md'), rules: hand('RULES.md'), viewsMd: read('references/views.md') }));
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
