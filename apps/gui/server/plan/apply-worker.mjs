// Applies a confirmed plan off the GUI's main thread: applyAndDocument is synchronous (git included, with spawnSync), so
// on the main thread its steps would arrive together, already done, and every request would wait meanwhile.
// workerData = { path, plan }. Posts { step } at each step, then { result } or { error }.
import { parentPort, workerData } from 'node:worker_threads';
import { openStore, resolveBase } from '../../../../scripts/lib/store/index.mjs';
import { applyAndDocument } from '../../../../scripts/lib/apply-flow.mjs';

try {
  const store = openStore(resolveBase(workerData.path));
  const res = applyAndDocument(store, workerData.plan, { onStep: step => parentPort.postMessage({ step }) });
  const { docError, ...rest } = res;
  parentPort.postMessage({ result: { ...rest, ...(docError ? { docError: { code: docError.code, message: docError.message } } : {}) } });
} catch (e) {
  parentPort.postMessage({ error: { message: e.message, code: e.code } });
}
