import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginManifests } from '../scripts/sync-plugin.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'scripts', 'archlens.mjs');
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

const SKILLS = ['archlens-plan', 'archlens-apply', 'archlens-query'];
const skillPath = name => join(ROOT, 'skills', name, 'SKILL.md');
const read = p => readFileSync(p, 'utf8');
/** Every skills/<name>/SKILL.md present, as { name, text }. */
const skills = () => {
  const dir = join(ROOT, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(skillPath(e.name)))
    .map(e => ({ name: e.name, text: read(skillPath(e.name)) }));
};
const frontmatter = text => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  return Object.fromEntries(m[1].split('\n').map(l => /^(\w+):\s*(.*)$/.exec(l)).filter(Boolean).map(x => [x[1], x[2]]));
};
const body = text => text.replace(/^---\n[\s\S]*?\n---\n/, '');

test('the three skills exist', () => {
  assert.deepEqual(skills().map(s => s.name).sort(), [...SKILLS].sort());
});

test('each skill has name and description, and the name matches the folder', () => {
  const all = skills();
  assert.equal(all.length, SKILLS.length);
  for (const { name, text } of all) {
    const fm = frontmatter(text);
    assert.ok(fm, `${name}: sem frontmatter`);
    assert.equal(fm.name, name);
    assert.match(fm.description ?? '', /^Use when /, `${name}: description no formato "Use when …"`);
    const firstPara = body(text).split('\n').filter(l => l.trim() && !l.startsWith('#'))[0];
    assert.match(firstPara, /^Leia `references\/base\.md` antes do primeiro comando/, `${name}: começa citando references/base.md`);
  }
});

test('plugin.json names the plugin archlens and marketplace.json points at the repo root', () => {
  const plugin = JSON.parse(read(join(ROOT, '.claude-plugin', 'plugin.json')));
  assert.equal(plugin.name, 'archlens');
  const market = JSON.parse(read(join(ROOT, '.claude-plugin', 'marketplace.json')));
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, 'archlens');
  assert.equal(market.plugins[0].source, './');
});

// An installed plugin is cached by version: a release that keeps the version never reaches the users.
test('plugin manifests follow package.json (version, description, author); npm version keeps them in sync', () => {
  const pkg = JSON.parse(read(join(ROOT, 'package.json')));
  const expected = pluginManifests(pkg);
  assert.deepEqual(JSON.parse(read(join(ROOT, '.claude-plugin', 'plugin.json'))), expected.plugin);
  assert.deepEqual(JSON.parse(read(join(ROOT, '.claude-plugin', 'marketplace.json'))), expected.marketplace);
  assert.equal(expected.plugin.version, pkg.version);
  assert.equal(expected.marketplace.plugins[0].version, pkg.version);
  assert.ok(pkg.author, 'package.json precisa de author (vai para o plugin.json)');
  assert.match(pkg.scripts.version ?? '', /sync-plugin\.mjs/, 'npm version deve regravar os manifestos do plugin');
});

test('every references/*.md and scripts/* path cited by a skill exists', () => {
  const all = skills();
  assert.ok(all.length > 0);
  for (const { name, text } of all) {
    const cited = [...text.matchAll(/(?:references\/[\w.-]+\.md|scripts\/[\w./-]*\w)/g)].map(m => m[0]);
    assert.ok(cited.includes('references/base.md'), `${name}: cita references/base.md`);
    for (const p of cited) assert.ok(existsSync(join(ROOT, p)), `${name}: ${p} não existe`);
  }
});

test('every archlens command cited by a skill appears in HELP', () => {
  const r = run(['help'], ROOT);
  assert.equal(r.status, 0, r.stderr);
  const commands = new Set([...r.stdout.matchAll(/^ {2}([a-z]+) /gm)].map(m => m[1]));
  const all = skills();
  assert.ok(all.length > 0);
  for (const { name, text } of all) {
    for (const [, cmd] of text.matchAll(/archlens ([a-z]+)/g)) assert.ok(commands.has(cmd), `${name}: archlens ${cmd} não está no HELP`);
  }
});

test('no section of the old SKILL.md is lost', () => {
  const titles = ['Fluxo', 'Formato 2.0', 'Propriedades', 'Aninhamento (ArchiMate)', 'Pedido → view spec',
    'Alertas do deliver/build', 'Erros comuns', 'Referências'];
  const texts = [...skills().map(s => s.text), existsSync(join(ROOT, 'references', 'base.md')) ? read(join(ROOT, 'references', 'base.md')) : ''];
  const headings = texts.flatMap(t => t.split('\n').filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/^#+ /, '')));
  for (const t of titles) assert.ok(headings.some(h => h.startsWith(t)), `seção "${t}" sumiu`);
});

test('only archlens-apply runs init, apply, build, doc, migrate or store convert', () => {
  const writes = /archlens (init|apply|build|doc|migrate|store convert)\b/;
  const others = skills().filter(s => s.name !== 'archlens-apply');
  assert.equal(others.length, 2);
  for (const { name, text } of others) {
    for (const line of text.split('\n')) {
      if (writes.test(line)) assert.match(line, /skill archlens-apply/, `${name}: "${line.trim()}" roda um comando que grava a base`);
    }
  }
});

test('archlens-apply runs init; without a base, plan and query ask the repository type and hand init over to it', () => {
  assert.match(read(skillPath('archlens-apply')), /archlens init <pasta> --store json\|markdown\|gbrain/);
  for (const name of ['archlens-plan', 'archlens-query']) {
    const line = read(skillPath(name)).split('\n').find(l => /archlens init\b/.test(l));
    assert.ok(line, `${name}: encaminha o archlens init`);
    assert.match(line, /skill archlens-apply/, `${name}: o init é da skill archlens-apply`);
    assert.match(read(skillPath(name)), /tipo de repositório/, `${name}: pergunta o tipo de repositório`);
  }
});

test('the three skills pull an MCP base before reading it and check the MCP session once per session', () => {
  for (const name of SKILLS) {
    const text = read(skillPath(name));
    assert.ok(text.includes('archlens remote <base> pull'), `${name}: cita archlens remote <base> pull`);
    const check = text.split('\n').find(l => l.includes('archlens remote <base> check'));
    assert.ok(check, `${name}: cita archlens remote <base> check`);
    assert.match(check, /uma vez por sessão/i, `${name}: check uma vez por sessão`);
  }
  // plan and query read the base in their flow: the pull comes first
  for (const [name, reader] of [['archlens-plan', 'archlens plan '], ['archlens-query', 'archlens views ']]) {
    const flow = read(skillPath(name)).slice(read(skillPath(name)).indexOf('## Fluxo'));
    const pull = flow.indexOf('archlens remote <base> pull');
    assert.ok(pull >= 0 && pull < flow.indexOf(reader), `${name}: o pull vem antes de ${reader.trim()}`);
  }
});

test('archlens-apply conducts the MCP apply: --read-check, --receipts, --resume, --undo', () => {
  const text = read(skillPath('archlens-apply'));
  for (const flag of ['--read-check', '--receipts', '--resume', '--undo']) {
    assert.match(text, new RegExp(`archlens apply <base> [^\\n\`]*${flag}`), `archlens-apply: cita archlens apply … ${flag}`);
  }
  assert.match(text, /archlens store convert <base> --to gbrain --mode git/);
  assert.match(text, /archlens store convert <base> --to gbrain --mode mcp/);
});

test('archlens-apply runs build after apply', () => {
  const text = read(skillPath('archlens-apply'));
  const apply = text.indexOf('archlens apply');
  const build = text.indexOf('archlens build');
  assert.ok(apply >= 0 && build >= 0);
  assert.ok(build > apply, 'archlens build aparece antes de archlens apply');
});

test('archlens-plan ends with show and a deliver --plan preview', () => {
  const text = read(skillPath('archlens-plan'));
  const flow = text.slice(text.indexOf('## Fluxo'));
  const steps = flow.split(/\n(?=\d+\. )/);
  const plans = [...flow.matchAll(/archlens plan /g)].map(m => m.index);
  const lastPlan = plans.at(-1);
  const show = flow.lastIndexOf('archlens show');
  const deliver = [...flow.matchAll(/archlens deliver [^\n`]*--plan [^\n`]*--out/g)].map(m => m.index).at(-1);
  assert.ok(show > lastPlan, 'show depois do último plan');
  assert.ok(deliver > lastPlan, 'deliver --plan … --out depois do último plan');
  const last = steps.filter(s => /^\d+\. /.test(s)).at(-1);
  assert.match(last, /skill archlens-apply/, 'o último passo passa à skill archlens-apply');
});

test('the root SKILL.md is gone', () => {
  assert.equal(existsSync(join(ROOT, 'SKILL.md')), false);
});

// Installed as ~/.claude/skills/<name> → <repo>/skills/<name>, "$SKILL_DIR/../.." is ~/.claude for Node and the Read
// tool, which normalize ".." before following the link; realpath follows the link first.
const ARCHLENS_DEF = 'ARCHLENS="$(realpath "$SKILL_DIR/../..")"';

test('skills reach the repo through realpath, never through a bare $SKILL_DIR/../..', () => {
  const texts = [...skills().map(s => [s.name, s.text]), ['references/base.md', read(join(ROOT, 'references', 'base.md'))]];
  for (const [name, text] of texts) {
    const bare = text.split(ARCHLENS_DEF).join('').match(/\$SKILL_DIR\/\.\.\/\.\./g);
    assert.equal(bare, null, `${name}: use $ARCHLENS (${ARCHLENS_DEF}) em vez de $SKILL_DIR/../..`);
  }
  for (const { name, text } of skills()) {
    assert.ok(text.includes(ARCHLENS_DEF), `${name}: define ${ARCHLENS_DEF}`);
    assert.ok(text.includes('node "$ARCHLENS/scripts/archlens.mjs"'), `${name}: CLI por $ARCHLENS`);
  }
});

test('a skill linked into a skills folder finds the CLI with the documented commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-skills-'));
  symlinkSync(join(ROOT, 'skills', 'archlens-plan'), join(dir, 'archlens-plan'));
  const SKILL_DIR = join(dir, 'archlens-plan');
  const sh = cmd => spawnSync('bash', ['-c', cmd], { encoding: 'utf8', env: { ...process.env, SKILL_DIR } });
  const r = sh(`${ARCHLENS_DEF}; node "$ARCHLENS/scripts/archlens.mjs" help && test -f "$ARCHLENS/references/base.md"`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^archlens — /);
  assert.notEqual(sh('node "$SKILL_DIR/../../scripts/archlens.mjs" help').status, 0, 'o caminho sem realpath falha pelo link');
});

test('merge.md previews never run build (it writes inside the base)', () => {
  const text = read(join(ROOT, 'references', 'merge.md'));
  const section = text.slice(text.indexOf('## Pré-visualizando'), text.indexOf('\n## ', text.indexOf('## Pré-visualizando') + 1));
  assert.ok(section.length > 0);
  for (const line of section.split('\n')) assert.doesNotMatch(line, /archlens(\.mjs)? build /, `prévia com build: "${line.trim()}"`);
});
