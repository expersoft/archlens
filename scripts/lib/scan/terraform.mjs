// Terraform: a minimal HCL reader — resource blocks of known categories, literal attributes, and references.
// Not a full HCL parser: expressions, for_each and remote modules are out of scope (references/repo-reading.md).
const CATEGORIES = [
  [/^(aws_db_instance|aws_rds_cluster|google_sql_database_instance|azurerm_(postgresql|mysql|mssql|cosmosdb)\w*|aws_dynamodb_table)$/, 'database'],
  [/^(aws_msk_cluster|aws_sqs_queue|aws_sns_topic|aws_kinesis_stream|google_pubsub_topic|azurerm_(servicebus|eventhub)\w*)$/, 'messaging'],
  [/^(aws_s3_bucket|google_storage_bucket|azurerm_storage_account)$/, 'storage'],
  [/^(aws_elasticache_\w+|google_redis_instance|azurerm_redis_cache)$/, 'cache'],
  [/^(aws_eks_cluster|google_container_cluster|azurerm_kubernetes_cluster)$/, 'cluster'],
];
export const categoryOf = type => CATEGORIES.find(([re]) => re.test(type))?.[1] ?? 'other';

const BLOCK = /^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/;
const ATTR = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/;
const REF = /\b([a-z][a-z0-9]*_[a-z0-9_]+)\.([A-Za-z0-9_-]+)\b/g;

export function terraformFacts(path, text) {
  const blocks = [];
  let cur = null, depth = 0;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/"(?:[^"\\]|\\.)*"/g, s => (s.includes('{') || s.includes('}') ? '""' : s)).replace(/#.*$|\/\/.*$/, '');
    if (!cur && depth === 0) {
      const m = BLOCK.exec(line);
      if (m) { cur = { type: m[1], name: m[2], line: i + 1, attrs: {}, refs: new Set() }; depth = 0; }
    }
    if (cur) {
      if (depth === 1) {
        const a = ATTR.exec(line);
        if (a) {
          const v = a[2];
          if (/^".*"$/.test(v)) cur.attrs[a[1]] = v.slice(1, -1);
          else if (/^(-?\d+(\.\d+)?|true|false)$/.test(v)) cur.attrs[a[1]] = JSON.parse(v);
        }
      }
      for (const r of line.matchAll(REF)) if (`${r[1]}.${r[2]}` !== `${cur.type}.${cur.name}`) cur.refs.add(`${r[1]}.${r[2]}`);
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (cur && depth === 0) { blocks.push(cur); cur = null; }
  });
  const known = blocks.filter(b => categoryOf(b.type) !== 'other');
  const keys = new Set(known.map(b => `${b.type}.${b.name}`));
  const facts = known.map(b => ({ kind: 'cloud-resource', type: b.type, name: b.name, category: categoryOf(b.type), attrs: b.attrs, at: { file: path, line: b.line } }));
  for (const b of known) for (const r of b.refs) if (keys.has(r)) facts.push({ kind: 'tf-ref', from: `${b.type}.${b.name}`, to: r, at: { file: path, line: b.line } });
  return facts;
}
