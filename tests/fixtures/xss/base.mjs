// A base whose every text field tries to run script. Used by apps/gui/e2e/xss.test.mjs to prove the escaping of
// scripts/lib/render.mjs and of the GUI: nothing here may execute, and the CSP must not even have to act.
// Each field carries its own number, so a payload that runs says which field let it through.

/** What every payload tries: mark the page and tell whoever embeds it. */
const hit = n => `window.__xss=(window.__xss||[]).concat(${n});try{parent.postMessage({xss:${n}},'*')}catch(e){}`;

/** One text that breaks out of the usual contexts: tag body, attribute, title, style, script, svg. */
export const payload = n => `X${n}"'><img src=x onerror="${hit(n)}"><svg onload="${hit(n)}"></svg></title></style></script><script>${hit(n)}</script><iframe srcdoc="<script>${hit(n)}</script>"></iframe><a href="javascript:${hit(n)}">l</a>`;

/** A real image address, as people put in a node's page. The test answers it itself: nothing leaves the machine. */
export const IMAGE = 'https://imagens.archlens.test/arquitetura.png';

/** Markdown of a node's page: raw html, a javascript: link, an image with a handler, a link reference. */
export const markdown = n => [
  `## Visão geral ${payload(n)}`,
  '',
  `Texto [clique](javascript:${hit(n + 1)}) e ![img](x" onerror="${hit(n + 2)}) e <img src=x onerror="${hit(n + 3)}">.`,
  '',
  `<script>${hit(n + 4)}</script>`,
  '',
  `<details open ontoggle="${hit(n + 5)}"><summary>s</summary></details>`,
  '',
  `[ref]: javascript:${hit(n + 6)}`,
  '',
  // a legitimate image of a node's page: it must load without the policy acting (https images are allowed)
  `![diagrama](${IMAGE})`,
].join('\n');

let n = 0;
const p = () => payload(++n);

export const MANIFEST = { name: p(), description: p() };

export const ELEMENTS = [
  { id: 'grupo', type: 'grouping', name: p(), description: p() },
  { id: 'ator', type: 'business-actor', name: p(), description: p(), c4: { kind: 'person' } },
  { id: 's1', type: 'application-component', name: p(), description: p(), technology: p(), group: 'grupo', c4: { kind: 'softwareSystem' },
    tags: [p(), p()], properties: { [p()]: p(), dono: p() }, status: 'deprecated', statusReason: p() },
  { id: 's1.api', type: 'application-component', name: p(), description: p(), technology: p(), parent: 's1', c4: { kind: 'container' },
    status: 'planned', statusReason: p() },
  { id: 's1.db', type: 'application-component', name: p(), description: p(), technology: p(), parent: 's1', c4: { kind: 'container', role: 'database' } },
  { id: 's2', type: 'application-component', name: p(), description: p(), group: 'grupo', external: true, c4: { kind: 'softwareSystem' } },
  { id: 'proc', type: 'business-process', name: p(), description: p() },
  { id: 'no', type: 'node', name: p(), description: p(), technology: p() },
];

export const RELATIONSHIPS = [
  { id: 'r1', from: 's1', to: 'ator', type: 'serving', description: p(), technology: p() },
  { id: 'r2', from: 's2', to: 's1', type: 'serving', description: p(), technology: p() },
  { id: 'r3', from: 's1.db', to: 's1.api', type: 'serving', description: p(), technology: p() },
  { id: 'r4', from: 's2', to: 's1.api', type: 'serving', description: p(), technology: p() },
  { id: 'r5', from: 's1', to: 'proc', type: 'serving', description: p() },
  { id: 'r6', from: 'no', to: 's1', type: 'serving', description: p() },
];

export const VIEWS = [
  { key: 'panorama', notation: 'c4', level: 'landscape', title: p(), description: p() },
  { key: 'contexto', notation: 'c4', level: 'context', scope: 's1', title: p() },
  { key: 'containers', notation: 'c4', level: 'container', scope: 's1', title: p() },
  { key: 'camadas', notation: 'archimate', viewpoint: 'layered', title: p() },
  { key: 'impacto', notation: 'archimate', viewpoint: 'impact', anchor: 's1', title: p() },
];

export const NOTES = { overview: markdown(1000), notes: markdown(1100) };
export const DOCS = { s1: markdown(2000), 's1.api': markdown(2100), s2: markdown(2200) };

/** The store operations that write the whole base. */
export const xssOps = () => [
  { op: 'setManifest', manifest: { archlens: '2.0', ...MANIFEST } },
  ...ELEMENTS.map(element => ({ op: 'upsertElement', element })),
  ...RELATIONSHIPS.map(relationship => ({ op: 'upsertRelationship', relationship })),
  ...VIEWS.map(view => ({ op: 'putView', view })),
  ...Object.entries(NOTES).map(([name, text]) => ({ op: 'putNote', name, text })),
  ...Object.entries(DOCS).map(([id, text]) => ({ op: 'putDoc', id, text })),
];
