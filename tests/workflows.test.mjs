// The release workflows only run for real after the merge: their shape is checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readYaml } from '../scripts/lib/scan/yaml.mjs';

const load = name => readYaml(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8'))[0].data;
const steps = wf => Object.values(wf.jobs).flatMap(j => j.steps);
const runs = wf => steps(wf).map(s => `${s.run ?? ''} ${s.uses ?? ''}`);
const has = (wf, text) => runs(wf).some(r => r.includes(text));
const indexOf = (wf, text) => runs(wf).findIndex(r => r.includes(text));

test('release.yml: "Preparar versão" por workflow_dispatch, com tipo, branch e preid', () => {
  const wf = load('release.yml');
  const inputs = wf.on.workflow_dispatch.inputs;
  assert.equal(inputs.tipo.type, 'choice');
  assert.deepEqual(inputs.tipo.options, ['patch', 'minor', 'major', 'premajor', 'preminor', 'prerelease']);
  assert.equal(inputs.branch.default, 'develop-v2');
  assert.equal(inputs.preid.default, 'alpha');
  assert.deepEqual(wf.permissions, { contents: 'write', 'pull-requests': 'write', actions: 'write' });
});

test('release.yml: recusa pré-versão em develop-v2 antes de preparar, e branch de release que já existe', () => {
  const wf = load('release.yml');
  const guard = runs(wf).findIndex(r => /pre\*/.test(r) && r.includes('develop-v2') && r.includes('exit 1'));
  assert.ok(guard >= 0, 'falta o passo que recusa pré-versão em develop-v2');
  assert.ok(guard < indexOf(wf, 'node scripts/release.mjs'), 'a recusa vem antes de preparar');
  assert.ok(runs(wf).some(r => r.includes('git ls-remote') && r.includes('chore/release-') && r.includes('exit 1')));
});

test('release.yml: busca as tags, prepara, roda o CI local, abre o PR e dispara o CI nele', () => {
  const wf = load('release.yml');
  const checkout = steps(wf).find(s => String(s.uses).startsWith('actions/checkout'));
  assert.equal(checkout.with['fetch-depth'], 0);
  for (const text of ['node scripts/release.mjs', 'npm run ci', 'gh pr create', 'gh workflow run ci.yml']) assert.ok(has(wf, text), text);
  assert.ok(indexOf(wf, 'npm run ci') < indexOf(wf, 'gh pr create'));
  assert.ok(indexOf(wf, 'gh pr create') < indexOf(wf, 'gh workflow run ci.yml'));
});

test('tag.yml: só no push para a main; cria a tag anotada e o release com as notas do changelog', () => {
  const wf = load('tag.yml');
  assert.deepEqual(Object.keys(wf.on), ['push']);
  assert.deepEqual(wf.on.push.branches, ['main']);
  assert.deepEqual(wf.permissions, { contents: 'write' });
  for (const text of ['release.mjs notes', 'git tag -a', 'gh release create', '--prerelease']) assert.ok(has(wf, text), text);
  assert.ok(indexOf(wf, 'release.mjs notes') <= indexOf(wf, 'git tag -a'));
});

test('os inputs chegam aos scripts por variável de ambiente, nunca interpolados no shell', () => {
  for (const name of ['release.yml', 'tag.yml']) {
    for (const s of steps(load(name))) assert.doesNotMatch(s.run ?? '', /\$\{\{\s*(inputs|github\.event)\./, `${name}: ${s.name}`);
  }
});
