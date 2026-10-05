// OpenAPI / Swagger: one application interface per document.
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

// user:password@ in a server url never reaches the inventory
const noUserinfo = u => String(u).replace(/^([a-z][a-z0-9+.-]*:\/\/)?[^@/\s]+@/i, '$1');

export function openapiFacts(path, doc) {
  const d = doc.data;
  const ops = Object.values(d.paths ?? {}).flatMap(p => METHODS.filter(m => p?.[m]).map(m => p[m]));
  const servers = d.servers ? d.servers.map(s => s.url) : d.host ? [`${(d.schemes ?? ['https'])[0]}://${d.host}${d.basePath ?? ''}`] : [];
  return [{
    kind: 'api', title: d.info?.title ?? path, version: String(d.info?.version ?? ''), servers: servers.map(noUserinfo), operations: ops.length,
    tags: [...new Set(ops.flatMap(o => o.tags ?? []))], at: { file: path, line: doc.lineOf('info', 'title') },
  }];
}
