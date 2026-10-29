// Per-question timings, in memory (last `keep`) and optionally one JSON line per entry in a file.
// The question text is recorded only with `questions: true`; the API key never reaches here.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createTelemetry({ file, questions = false, keep = 500 } = {}) {
  const entries = [];
  return {
    record(entry) {
      const { question, ...rest } = entry;
      const e = questions && question != null ? { ...rest, question } : rest;
      entries.push(e);
      if (entries.length > keep) entries.shift();
      if (file) {
        try { mkdirSync(dirname(file), { recursive: true }); appendFileSync(file, JSON.stringify(e) + '\n'); }
        catch { /* telemetry must not break a question */ }
      }
    },
    recent: () => [...entries],
  };
}

const rank = (sorted, p) => (sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null);

/** p50/p90 of ms.total (nearest rank), share of one-round answers, counts per outcome. */
export function summarize(entries) {
  const totals = entries.map(e => e.ms?.total ?? 0).sort((a, b) => a - b);
  const byOutcome = {};
  for (const e of entries) byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
  return {
    n: entries.length, p50: rank(totals, 0.5), p90: rank(totals, 0.9),
    oneRound: entries.length ? entries.filter(e => e.rounds === 1).length / entries.length : 0,
    byOutcome,
  };
}
