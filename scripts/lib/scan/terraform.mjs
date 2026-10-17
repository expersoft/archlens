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

const BLOCK = /^\s*resource\s+"__STR_(\d+)__"\s+"__STR_(\d+)__"\s*\{/;
const ATTR = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/;
const REF = /\b([a-z][a-z0-9]*_[a-z0-9_]+)\.([A-Za-z0-9_-]+)\b/g;
const HEREDOC_START = /<<-?(\w+)/;
// Attributes that may hold credentials never reach the inventory (it is written to disk and shared).
const SECRET = /pass|secret|token|key|credential/i;

// Mask quoted strings and return { masked: line with placeholders, strings: array of original strings }
function maskStrings(raw) {
  const strings = [];
  let masked = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      let j = i + 1;
      while (j < raw.length && (raw[j] !== '"' || raw[j - 1] === '\\')) j++;
      const s = raw.slice(i, j + 1);
      strings.push(s);
      masked += `"__STR_${strings.length - 1}__"`;
      i = j + 1;
    } else {
      masked += raw[i];
      i++;
    }
  }
  return { masked, strings };
}

// Extract original string content (without quotes)
function getStringContent(s) {
  return s.slice(1, -1);
}

export function terraformFacts(path, text) {
  const blocks = [];
  let cur = null, depth = 0;
  let inHeredoc = null;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Handle heredoc bodies: if we're in a heredoc, check if this line closes it
    if (inHeredoc) {
      if (raw.trim() === inHeredoc) {
        inHeredoc = null;
      }
      continue;
    }

    // Mask strings before processing
    const { masked, strings } = maskStrings(raw);

    // Strip comments from masked line
    const line = masked.replace(/#.*$|\/\/.*$/, '');

    // Check for heredoc start on masked/comment-stripped line (so <<X in strings or comments is ignored)
    const heredocMatch = line.match(HEREDOC_START);
    if (heredocMatch) {
      inHeredoc = heredocMatch[1];
    }

    // Try to start a new resource block
    if (!cur && depth === 0) {
      const m = BLOCK.exec(line);
      if (m) {
        const typeIdx = parseInt(m[1]);
        const nameIdx = parseInt(m[2]);
        const type = getStringContent(strings[typeIdx]);
        const name = getStringContent(strings[nameIdx]);
        cur = { type, name, line: i + 1, attrs: {}, refs: new Set() };
        depth = 0;
      }
    }

    if (cur) {
      // Extract attributes at depth 1
      if (depth === 1) {
        const a = ATTR.exec(line);
        if (a && !SECRET.test(a[1])) {
          const v = a[2];
          // Check if value is a single string placeholder
          const strMatch = v.match(/^"__STR_(\d+)__"$/);
          if (strMatch) {
            const idx = parseInt(strMatch[1]);
            const originalStr = strings[idx];
            const content = getStringContent(originalStr);
            // Only extract if no interpolation
            if (!content.includes('${') && !content.includes('%{')) {
              cur.attrs[a[1]] = content;
            }
          } else if (/^(-?\d+(\.\d+)?|true|false)$/.test(v)) {
            cur.attrs[a[1]] = JSON.parse(v);
          }
        }
      }

      // Find references in the masked line
      for (const r of line.matchAll(REF)) {
        if (`${r[1]}.${r[2]}` !== `${cur.type}.${cur.name}`) {
          cur.refs.add(`${r[1]}.${r[2]}`);
        }
      }
    }

    // Find references inside string interpolations (for all lines, not just inside resource blocks)
    if (cur) {
      for (const s of strings) {
        const content = getStringContent(s);
        for (const m of content.matchAll(REF)) {
          if (`${m[1]}.${m[2]}` !== `${cur.type}.${cur.name}`) {
            cur.refs.add(`${m[1]}.${m[2]}`);
          }
        }
      }
    }

    // Update depth based on braces in masked line
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;

    // Close block if depth returns to 0
    if (cur && depth === 0) {
      blocks.push(cur);
      cur = null;
    }
  }

  // Check for unclosed block
  if (cur) {
    throw new Error(`bloco HCL não fechado: resource "${cur.type}" "${cur.name}" (linha ${cur.line})`);
  }

  const known = blocks.filter(b => categoryOf(b.type) !== 'other');
  const facts = known.map(b => ({ kind: 'cloud-resource', type: b.type, name: b.name, category: categoryOf(b.type), attrs: b.attrs, at: { file: path, line: b.line } }));
  // Add references, filtering out those to unknown resource types
  for (const b of known) {
    for (const r of b.refs) {
      const refType = r.split('.')[0];
      if (categoryOf(refType) !== 'other') {
        facts.push({ kind: 'tf-ref', from: `${b.type}.${b.name}`, to: r, at: { file: path, line: b.line } });
      }
    }
  }
  return facts;
}
