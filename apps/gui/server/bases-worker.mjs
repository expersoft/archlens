// Reads one base off the GUI's main thread: a remote connector (gbrain git) fetches on every read, running git
// synchronously, which would stall every request meanwhile. Posts { version, raw } (raw only when the version is not
// `known`), { text } (the documentation of the node `doc`, when given) or { error }.
import { parentPort, workerData } from 'node:worker_threads';
import { openStore, resolveBase } from '../../../scripts/lib/store/index.mjs';
import { contentVersion } from '../../../scripts/lib/store/ops.mjs';

try {
  const store = openStore(resolveBase(workerData.path));
  if (workerData.doc !== undefined) parentPort.postMessage({ text: store.readDoc(workerData.doc) });
  else {
    const snap = store.read();
    const version = contentVersion(snap);
    parentPort.postMessage(version === workerData.known ? { version } : { version, raw: snap?.raw ?? null });
  }
} catch (e) {
  parentPort.postMessage({ error: { message: e.message, code: e.code } });
}
