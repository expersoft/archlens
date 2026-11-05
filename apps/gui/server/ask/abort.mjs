// Time limits and cancelling for what the agents wait on.
export const abortError = () => Object.assign(new Error('busca cancelada'), { code: 'E_LLM_ABORT' });

// Node 18 has no AbortSignal.any.
export function combine(signal, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => { ctl.timedOut = true; ctl.abort(); }, ms);
  const onAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  return { ctl, done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } };
}

// Rejects as soon as the signal aborts, even if the provider ignores it.
export function raceAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
