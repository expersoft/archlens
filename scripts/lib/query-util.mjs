export function viewError(code, message, hint) {
  const err = new Error(`${code}: ${message}${hint ? ` (${hint})` : ''}`);
  err.code = code;
  err.hint = hint;
  return err;
}

/** Filter patterns: "<id>", "tag:<tag>", "type:<archimate type | c4 kind>", "layer:<layer>", "external". */
export function matchesPattern(el, pattern, kindOf = () => null) {
  if (!el) return false;
  if (pattern === 'external') return !!el.c4?.external;
  const [k, v] = pattern.includes(':') ? pattern.split(':', 2) : [null, pattern];
  if (k === 'tag') return el.tags.some(t => t.toLowerCase() === v.toLowerCase());
  if (k === 'type') return el.type === v || kindOf(el) === v || el.c4?.kind === v;
  if (k === 'layer') return el.layer === v;
  return el.id === pattern;
}
