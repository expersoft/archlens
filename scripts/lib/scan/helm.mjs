// Helm: Chart.yaml (name, dependencies — known engines become infrastructure) and values (image, ingress, env).
import { readYaml } from './yaml.mjs';
import { infraOf, hostOf } from './infra.mjs';

export function helmChartFacts(path, text) {
  const [doc] = readYaml(text);
  const c = doc?.data ?? {};
  const deps = (c.dependencies ?? []).map(d => d.name).filter(Boolean);
  const facts = [{ kind: 'chart', name: c.name ?? '?', dependencies: deps, at: { file: path, line: doc?.lineOf('name') ?? 1 } }];
  for (const [i, d] of deps.entries()) {
    const infra = infraOf(d);
    if (infra) facts.push({ kind: 'infra-image', service: d, ...infra, at: { file: path, line: doc.lineOf('dependencies', i) } });
  }
  return facts;
}

export function helmValuesFacts(path, text, chartName) {
  const [doc] = readYaml(text);
  const v = doc?.data ?? {};
  const facts = [];
  const repo = v.image?.repository;
  if (repo) {
    const image = v.image.tag ? `${repo}:${v.image.tag}` : repo;
    const at = { file: path, line: doc.lineOf('image', 'repository') };
    const infra = infraOf(image);
    facts.push(infra ? { kind: 'infra-image', service: chartName, ...infra, at } : { kind: 'workload', kindK8s: 'HelmValues', name: chartName, image, at });
  }
  for (const [i, h] of (v.ingress?.hosts ?? []).entries()) {
    const host = typeof h === 'string' ? h : h?.host;
    if (host) facts.push({ kind: 'ingress', host, service: chartName, at: { file: path, line: doc.lineOf('ingress', 'hosts', i) } });
  }
  const env = Array.isArray(v.env) ? Object.fromEntries(v.env.map(e => [e.name, e.value])) : (v.env ?? {});
  for (const [k, val] of Object.entries(env)) {
    const host = hostOf(val);
    if (host && host !== chartName) facts.push({ kind: 'env-ref', from: chartName, var: k, host, at: { file: path, line: doc.lineOf('env', k) } });
  }
  return facts;
}
