// Errors of the knowledge-base store; the message starts with the code, like the merge errors.
export function storeError(code, message, extra = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code }, extra);
}

/** A write of node documentation on a connector that has nowhere to keep it. */
export const docsUnsupported = () => storeError('E_STORE_DOC', 'documentação do nó exige uma base markdown ou gbrain; converta com "archlens store convert"');
