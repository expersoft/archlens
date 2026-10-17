// What counts as infrastructure in a manifest: well-known engine images, categories, and hosts in config values.
export const ENGINES = [
  { match: /postgis|postgres/, engine: 'postgres', category: 'database', label: 'PostgreSQL' },
  { match: /mariadb/, engine: 'mariadb', category: 'database', label: 'MariaDB' },
  { match: /mysql/, engine: 'mysql', category: 'database', label: 'MySQL' },
  { match: /mongo/, engine: 'mongodb', category: 'database', label: 'MongoDB' },
  { match: /elasticsearch/, engine: 'elasticsearch', category: 'database', label: 'Elasticsearch' },
  { match: /opensearch/, engine: 'opensearch', category: 'database', label: 'OpenSearch' },
  { match: /redis|valkey/, engine: 'redis', category: 'cache', label: 'Redis' },
  { match: /kafka|redpanda/, engine: 'kafka', category: 'messaging', label: 'Kafka' },
  { match: /rabbitmq/, engine: 'rabbitmq', category: 'messaging', label: 'RabbitMQ' },
  { match: /minio/, engine: 'minio', category: 'storage', label: 'MinIO' },
];

/** Engine of a container image ("postgres:16-alpine" → postgres 16), or null for an application image. */
export function infraOf(image) {
  const [repo, tag = ''] = String(image).split('@')[0].split(/:(?=[^/]*$)/);
  const last = repo.split('/').at(-1).toLowerCase();
  const hit = ENGINES.find(e => e.match.test(last));
  if (!hit) return null;
  const version = /^(\d+(?:\.\d+)?)/.exec(tag)?.[1];
  return { engine: hit.engine, category: hit.category, ...(version ? { version } : {}) };
}

const LOCAL = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/** Host named by a config value: "proto://[user@]host[:port]…" or "host:port". */
export function hostOf(value) {
  if (typeof value !== 'string') return null;
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([A-Za-z0-9_.-]+)/i.exec(value) ?? /^([A-Za-z][A-Za-z0-9_.-]*):\d{2,5}(?:\/|$)/.exec(value);
  const host = m?.[1];
  return host && !LOCAL.has(host) ? host : null;
}

export const tagOf = category => ({ database: 'database', messaging: 'queue', cache: 'cache', storage: 'storage' })[category] ?? 'infra';
