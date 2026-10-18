import { toCanonical } from '../scripts/lib/canonical.mjs';

/** A free-vocabulary fixture (c4:*, uses, children) as a 2.0 base, the way migrate writes it. */
export const asBase = raw => toCanonical(raw).raw;
