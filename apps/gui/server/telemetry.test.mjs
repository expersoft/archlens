import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTelemetry, summarize } from './ask/telemetry.mjs';

const entry = (total, rounds = 1, outcome = 'view') => ({ at: 'x', base: 'b', provider: 'p', model: 'm', mode: 'tools', outcome, ms: { total, llm: 0, tools: 0, render: 0 }, rounds, calls: 1, cacheRead: 0, question: 'segredo?' });

test('summarize: p50, p90 (vizinho mais próximo), oneRound e desfechos', () => {
  const es = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t, i) => entry(t, i < 3 ? 1 : 2, i === 9 ? 'error' : 'view'));
  assert.deepEqual(summarize(es), { n: 10, p50: 50, p90: 90, oneRound: 0.3, byOutcome: { view: 9, error: 1 } });
  assert.equal(summarize([]).n, 0);
});

test('record: sem pergunta por padrão, uma linha por entrada no arquivo, limite keep', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'archlens-tel-')), 'sub', 't.ndjson');
  const t = createTelemetry({ file, keep: 2 });
  t.record(entry(1)); t.record(entry(2)); t.record(entry(3));
  assert.equal(t.recent().length, 2);
  assert.ok(t.recent().every(e => !('question' in e)));
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(!lines[0].includes('segredo'));
  const q = createTelemetry({ questions: true });
  q.record(entry(1));
  assert.equal(q.recent()[0].question, 'segredo?');
});
