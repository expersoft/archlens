// Errors of the knowledge-base store; the message starts with the code, like the merge errors.
export function storeError(code, message, extra = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code }, extra);
}
