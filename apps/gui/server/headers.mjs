// Security headers of every response of the GUI server.
import { CLIENT_SCRIPT_HASH } from '../../../scripts/lib/render.mjs';

/**
 * The host page's policy. The diagram arrives as an iframe srcdoc, which inherits this policy: its client script is
 * allowed by hash (the same one the diagram's own <meta> policy carries). 'unsafe-inline' is for styles only: the SVG
 * and React use style attributes, and a style runs no code.
 */
export const HOST_CSP = [
  "default-src 'self'", `script-src 'self' '${CLIENT_SCRIPT_HASH}'`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'self'",
].join('; ');

// Fullscreen is not in the permissions policy on purpose: the diagram document has no origin, and an allowlist by
// origin would take the presentation mode away from it.
export const SAFE_HEADERS = Object.freeze({
  'content-security-policy': HOST_CSP,
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
});
