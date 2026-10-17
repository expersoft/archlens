// docker-compose: services, infrastructure images, depends_on and hosts referenced in environment variables.
import { readYaml } from './yaml.mjs';
import { infraOf, hostOf } from './infra.mjs';

const dirOf = b => String(b).replace(/^\.\/?/, '').replace(/\/$/, '');

export function composeFacts(path, text) {
  const [doc] = readYaml(text);
  const facts = [];
  for (const [name, s] of Object.entries(doc?.data?.services ?? {})) {
    const at = { file: path, line: doc.lineOf('services', name) };
    const image = typeof s?.image === 'string' ? s.image : undefined;
    const build = typeof s?.build === 'string' ? s.build : s?.build?.context;
    const infra = build == null && image ? infraOf(image) : null;
    if (infra) facts.push({ kind: 'infra-image', service: name, ...infra, at });
    else facts.push({ kind: 'service', name, ...(image ? { image } : {}), ...(build != null ? { build: dirOf(build) } : {}), ports: (s?.ports ?? []).map(String), at });
    const deps = Array.isArray(s?.depends_on) ? s.depends_on : Object.keys(s?.depends_on ?? {});
    for (const d of deps) facts.push({ kind: 'depends-on', from: name, to: d, at: { file: path, line: doc.lineOf('services', name, 'depends_on') } });
    const env = Array.isArray(s?.environment)
      ? Object.fromEntries(s.environment.map(x => String(x).split(/=(.*)/s).slice(0, 2)))
      : (s?.environment ?? {});
    for (const [v, val] of Object.entries(env)) {
      const host = hostOf(val);
      if (host && host !== name) facts.push({ kind: 'env-ref', from: name, var: v, host, at: { file: path, line: doc.lineOf('services', name, 'environment') } });
    }
  }
  return facts;
}
