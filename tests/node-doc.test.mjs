import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { docHash, checkDocText, docOfUserText, userTextOfDoc, docOf, lineDiff, plainWikilinks, demoteHeadings, docToHtml } from '../scripts/lib/node-doc.mjs';
import { BEGIN, END } from '../scripts/lib/store/markdown-page.mjs';

test('docHash is the sha256 of the trimmed text', () => {
  assert.equal(docHash('  Texto\n'), `sha256:${createHash('sha256').update('Texto').digest('hex')}`);
  assert.equal(docHash('Texto'), docHash('\n\nTexto\n'));
  assert.notEqual(docHash('Texto'), docHash('Outro'));
});

test('checkDocText refuses the markers of the archlens block', () => {
  assert.doesNotThrow(() => checkDocText('Texto livre com <!-- comentário -->', 'x'));
  for (const marker of [BEGIN, END]) {
    assert.throws(() => checkDocText(`antes ${marker} depois`, 'x'), e => e.code === 'E_DELTA_DOC' && e.message.includes('"x"') && e.message.includes(marker));
  }
});

test('the text of a page and the documentation convert into each other', () => {
  assert.equal(docOfUserText('\n\nTexto\n\n'), 'Texto');
  assert.equal(docOfUserText('\n'), '');
  assert.equal(docOfUserText(undefined), '');
  assert.equal(userTextOfDoc(''), '\n');
  assert.equal(userTextOfDoc('  \n'), '\n');
  assert.equal(userTextOfDoc('Texto'), '\n\nTexto\n');
  assert.equal(userTextOfDoc('\nTexto\n\n'), '\n\nTexto\n');
  assert.equal(docOfUserText(userTextOfDoc('# Título\n\nCorpo')), '# Título\n\nCorpo');
});

test('docOf reads only what the map holds: an id named after an Object member has no text', () => {
  assert.equal(docOf({ a: 'Texto' }, 'a'), 'Texto');
  assert.equal(docOf({ a: 'Texto' }, 'b'), null);
  assert.equal(docOf(undefined, 'a'), null);
  assert.equal(docOf({}, 'constructor'), null);
  assert.equal(docOf({}, '__proto__'), null);
});

test('lineDiff marca as linhas iguais, removidas e novas', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nx\nc\nd'), [
    { sign: ' ', line: 'a' }, { sign: '-', line: 'b' }, { sign: '+', line: 'x' }, { sign: ' ', line: 'c' }, { sign: '+', line: 'd' },
  ]);
});

test('lineDiff com um lado vazio, sem linha fantasma, e ignorando espaços em volta do texto', () => {
  assert.deepEqual(lineDiff('', 'a'), [{ sign: '+', line: 'a' }]);
  assert.deepEqual(lineDiff('a\n', ''), [{ sign: '-', line: 'a' }]);
  assert.deepEqual(lineDiff('', ''), []);
  assert.deepEqual(lineDiff(' a\r\nb\n', 'a\nb'), [{ sign: ' ', line: 'a' }, { sign: ' ', line: 'b' }]);
});

test('docToHtml não deixa HTML ativo', () => {
  const html = docToHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1)) e [ok](https://a.com)');
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /<a href="https:\/\/a\.com" target="_blank" rel="noopener noreferrer">ok<\/a>/);
});

test('wikilink aparece legível', () => {
  assert.equal(plainWikilinks('Veja [[application-component/loja.api|API da loja]] e [[application-component/loja.web]].'), 'Veja API da loja e loja.web.');
  assert.match(docToHtml('Veja [[a/b|Nome]]'), /Veja Nome/);
});

test('demoteHeadings respeita cerca de código', () => {
  assert.equal(demoteHeadings('# A\n```\n# nao\n```\n## B\n###### C', 3), '#### A\n```\n# nao\n```\n##### B\n###### C');
});
