// Kubernetes manifests: workloads (or infrastructure running as a workload), services, ingress rules, env hosts.
import { infraOf, hostOf } from './infra.mjs';

const WORKLOADS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']);

export function k8sFacts(path, docs) {
  const facts = [];
  for (const d of docs) {
    const o = d.data;
    if (!o || typeof o !== 'object' || !o.kind || !o.apiVersion) continue;
    const name = o.metadata?.name ?? '?';
    const at = { file: path, line: d.lineOf('metadata', 'name') };
    if (WORKLOADS.has(o.kind)) {
      const pod = o.kind === 'CronJob' ? o.spec?.jobTemplate?.spec?.template?.spec : o.spec?.template?.spec;
      const image = pod?.containers?.[0]?.image;
      const infra = image ? infraOf(image) : null;
      facts.push(infra ? { kind: 'infra-image', service: name, ...infra, at } : { kind: 'workload', kindK8s: o.kind, name, ...(image ? { image } : {}), at });
      for (const c of pod?.containers ?? []) for (const e of c.env ?? []) {
        const host = hostOf(e.value);
        if (host && host !== name) facts.push({ kind: 'env-ref', from: name, var: e.name, host, at });
      }
    } else if (o.kind === 'Service') {
      facts.push({ kind: 'k8s-service', name, selector: o.spec?.selector ?? {}, at });
    } else if (o.kind === 'Ingress') {
      for (const r of o.spec?.rules ?? []) for (const p of r.http?.paths ?? []) {
        const service = p.backend?.service?.name ?? p.backend?.serviceName;
        if (r.host && service) facts.push({ kind: 'ingress', host: r.host, service, at });
      }
    } else if (o.kind === 'ConfigMap') {
      const from = name.replace(/-(configmap|config|cm)$/, '');
      for (const [k, v] of Object.entries(o.data ?? {})) {
        const host = hostOf(v);
        if (host && host !== from) facts.push({ kind: 'env-ref', from, var: k, host, at });
      }
    }
  }
  return facts;
}
