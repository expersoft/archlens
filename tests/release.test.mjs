// scripts/release.mjs: prepares a version (bump, plugin manifests, archlens-ask, changelog) without a hand edit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeChangelog, releaseNotes, prepareRelease, nextVersion } from '../scripts/release.mjs';

const LOG = '# Changelog\n\nTexto.\n\n## [Não lançado]\n\n### Adicionado\n\n- Coisa nova.\n\n## [0.6.0] — 2026-11-03\n\n- Antiga.\n\n'
  + '[Não lançado]: https://github.com/expersoft/archlens/compare/v0.6.0...HEAD\n[0.6.0]: https://github.com/expersoft/archlens/compare/v0.5.0...v0.6.0\n';
const V7 = { version: '0.7.0', previous: '0.6.0', date: '2026-11-18' };

test('closeChangelog fecha a seção, abre outra vazia e atualiza os links', () => {
  const out = closeChangelog(LOG, V7);
  assert.match(out, /## \[Não lançado\]\n\n## \[0\.7\.0\] — 2026-11-18\n\n### Adicionado\n\n- Coisa nova\./);
  assert.match(out, /\[Não lançado\]: https:\/\/github\.com\/expersoft\/archlens\/compare\/v0\.7\.0\.\.\.HEAD\n\[0\.7\.0\]: https:\/\/github\.com\/expersoft\/archlens\/compare\/v0\.6\.0\.\.\.v0\.7\.0\n\[0\.6\.0\]:/);
});

test('closeChangelog recusa [Não lançado] vazio, mesmo só com subtítulos', () => {
  assert.throws(() => closeChangelog(LOG.replace('- Coisa nova.\n', ''), V7), { code: 'E_RELEASE_EMPTY' });
});

test('closeChangelog acrescenta os links quando o arquivo não tem a linha [Não lançado]:', () => {
  const out = closeChangelog(LOG.replace(/\n\[Não lançado\]:.*\n/, '\n'), V7);
  assert.equal(out.match(/^\[Não lançado\]:/gm).length, 1);
  assert.equal(out.match(/^\[0\.7\.0\]:/gm).length, 1);
});

test('releaseNotes pega só a seção exata da versão', () => {
  const log = '## [Não lançado]\n\n## [0.6.0-alpha.1] — 2026-11-01\n\n- Alfa.\n\n## [0.6.0] — 2026-11-03\n\n- Estável.\n\n[0.6.0]: https://x\n';
  assert.equal(releaseNotes(log, '0.6.0'), '- Estável.');
  assert.equal(releaseNotes(log, '0.6.0-alpha.1'), '- Alfa.');
  assert.equal(releaseNotes(log, '0.6'), null);
});

/** A folder with package.json and CHANGELOG.md, and a fake exec that records the commands and answers git and npm. */
function sandbox({ status = '', tags = 'v0.5.0\nv0.6.0\n', log = LOG } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'archlens-release-'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'archlens', version: '0.6.0' }, null, 2)}\n`);
  writeFileSync(join(root, 'CHANGELOG.md'), log);
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (cmd === 'git' && args[0] === 'status') return status;
    if (cmd === 'git' && args[0] === 'tag') return tags;
    if (cmd === 'npm' && args[0] === 'version') {
      const next = args[1];
      writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'archlens', version: next }, null, 2)}\n`);
      return `v${next}\n`;
    }
    return '';
  };
  return { root, calls, exec, changelog: () => readFileSync(join(root, 'CHANGELOG.md'), 'utf8') };
}

test('prepareRelease: sobe a versão, regenera o archlens-ask e fecha o changelog, nessa ordem', () => {
  const s = sandbox();
  const out = prepareRelease({ root: s.root, type: 'minor', date: '2026-11-18', exec: s.exec });
  assert.deepEqual(out, { version: '0.7.0', previous: '0.6.0', notes: '### Adicionado\n\n- Coisa nova.' });
  assert.deepEqual(s.calls, ['git status --porcelain', 'git tag -l v*', 'npm version 0.7.0 --no-git-tag-version', 'npm run ask']);
  assert.match(s.changelog(), /## \[0\.7\.0\] — 2026-11-18/);
});

test('nextVersion segue as regras do npm version para os seis tipos', () => {
  const cases = [
    ['0.6.0', 'patch', '0.6.1'], ['0.6.0', 'minor', '0.7.0'], ['0.6.0', 'major', '1.0.0'],
    ['0.6.0', 'premajor', '1.0.0-alpha.0'], ['0.6.0', 'preminor', '0.7.0-alpha.0'], ['0.6.0', 'prerelease', '0.6.1-alpha.0'],
    ['1.0.0-alpha.0', 'prerelease', '1.0.0-alpha.1'], ['1.0.0-alpha.3', 'prerelease', '1.0.0-alpha.4'],
    ['1.0.0-alpha.3', 'major', '1.0.0'], ['1.0.0-alpha.3', 'patch', '1.0.0'], ['1.1.0-alpha.0', 'minor', '1.1.0'],
    ['1.0.1-alpha.0', 'minor', '1.1.0'],
  ];
  for (const [from, type, want] of cases) assert.equal(nextVersion(from, type, 'alpha'), want, `${from} ${type}`);
  assert.equal(nextVersion('1.0.0-alpha.2', 'prerelease', 'beta'), '1.0.0-beta.0');
  assert.throws(() => nextVersion('0.6.0', 'qualquer'), { code: 'E_RELEASE_TYPE' });
});

test('prepareRelease: pré-versão usa o preid e passa a versão exata ao npm', () => {
  const s = sandbox();
  assert.equal(prepareRelease({ root: s.root, type: 'premajor', preid: 'alpha', date: '2026-11-18', exec: s.exec }).version, '1.0.0-alpha.0');
  assert.ok(s.calls.includes('npm version 1.0.0-alpha.0 --no-git-tag-version'));
});

test('prepareRelease: recusas, sempre antes de mexer em arquivo', () => {
  const refuse = (opts, type, code) => {
    const s = sandbox(opts);
    assert.throws(() => prepareRelease({ root: s.root, type, date: '2026-11-18', exec: s.exec }), { code });
    assert.equal(s.changelog(), opts.log ?? LOG);
    return s;
  };
  refuse({ status: ' M README.md\n' }, 'minor', 'E_RELEASE_DIRTY');
  const untagged = refuse({ tags: 'v0.5.0\n' }, 'minor', 'E_RELEASE_UNTAGGED');
  assert.ok(!untagged.calls.some(c => c.startsWith('npm version')));
  refuse({ log: LOG.replace('- Coisa nova.\n', '') }, 'minor', 'E_RELEASE_EMPTY');
  refuse({}, 'qualquer', 'E_RELEASE_TYPE');
  const exists = refuse({ tags: 'v0.6.0\nv0.7.0\n' }, 'minor', 'E_RELEASE_TAG_EXISTS');
  assert.ok(!exists.calls.some(c => c.startsWith('npm')), 'a tag é conferida antes de subir a versão');
});
