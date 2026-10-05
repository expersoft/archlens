# Leitura de repositórios — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `archlens scan <pasta|url>` lê um repositório (graphify, docker-compose, Kubernetes/Helm, Terraform,
OpenAPI/AsyncAPI, arquivos de build), grava um inventário de fatos com arquivo e linha e, com o papel do repositório
respondido, monta um delta com proveniência que entra pelo fluxo normal de merge — reaproveitando a base, ligando
repositórios pelos tópicos e chamadas, e transformando o que sumiu em pergunta.

**Architecture:** um subsistema novo em `scripts/lib/scan/`: `git.mjs` (clone raso, commit, URL normalizada),
`walk.mjs` (arquivos e detecção), `yaml.mjs` (leitura YAML com linhas, sobre a biblioteca `yaml` vendorizada),
`infra.mjs` (motores, hosts, categorias), um extrator por fonte (`compose`, `k8s`, `helm`, `terraform`, `openapi`,
`asyncapi`, `graphify`, `build`), `index.mjs` (inventário), `summary.mjs` (papel sugerido, candidatos na base,
avisos) e `to-delta.mjs` (inventário + papel + base → delta, puro). A CLI ganha o comando `scan`. O merge, o store e
as visões não mudam, salvo dois ajustes pequenos: `sources[].line` e `flow` na travessia da visão de impacto.

**Tech Stack:** Node ≥ 18, ESM (`.mjs`), `node:test`; `git` do sistema (spawnSync); biblioteca `yaml` 2.x (ISC)
vendorizada em `scripts/vendor/yaml/`. Nenhuma dependência de execução nova no `package.json`.

**Spec:** `docs/superpowers/specs/2026-10-03-repo-reading-design.md`

## Global Constraints

- Node ≥ 18; sem dependência nova no `package.json`; `yaml` vendorizada (como ELK e rough.js), com a licença.
- Mensagens ao usuário em português; comentários de código em inglês.
- O `scan` **nunca** grava na base nem altera o repositório lido; só escreve o inventário (`--out`) e o delta (`--delta`).
- Inventário: `{ "archlens-inventory": "1.0", repo: { url?, path, name, commit, dirty, scannedAt }, files: {...}, facts: [...] }`;
  todo fato tem `kind` e `at: { file, line }` (caminho relativo POSIX, linha ≥ 1).
- Proveniência: `sources: [{ kind: "repo", ref: "<url normalizada ou caminho absoluto>@<commit7>", path, line, excerpt? }]`;
  sem commit, `@sem-commit`.
- `properties.repo` (URL sem credenciais e sem `.git`, ou caminho absoluto) e `properties.repoRole` (`system`|`service`)
  no elemento do repositório.
- Ids: `<sistema>`, `<sistema>.<deployavel>`, `<container>.<modulo>`, `topic.<nome>`, `tech.<motor>[-<versao>]`,
  `ext.<host>`, `proc.<rótulo>`, `obj.<rótulo>`; normalização `norm()` (minúsculas, sem acento, `[^a-z0-9]+` → `-`).
  Ids que já existem na base têm prioridade; para elementos já existentes o delta não envia `name`, `type` nem `parent`.
- Fatos de manifesto/contrato não levam `inferred`; deduções levam `inferred: true` e `confidence` (`alta`|`média`|`baixa`).
- Papel do repositório: **sempre** decidido pelo usuário (`--as`); a CLI só sugere com motivo. Sistema provável:
  **sugestão com motivos**, nunca suposição.
- Erros: `E_SCAN_SOURCE`, `E_SCAN_ROLE`, `E_SCAN_TARGET` (mensagem começa com o código).
- Git neste repositório (WSL) exige `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$PWD"`;
  nunca alterar a config global. Branch `feat/repo-reading`.
- Commits terminam com:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_012eJ1PPQxdtFU6UuAMv3U9Q`

## Decisões de detalhe (não estavam no spec; revisar)

1. **Publicar em um tópico vira `archimate:flow` (produtor → tópico)**, não `uses`; assinar continua `flow` (tópico →
   consumidor). Com `uses`, o produtor *dependeria* do tópico e a cadeia produtor → consumidor não existiria. E a visão
   de impacto passa a seguir `flow` por padrão (`viewpoint: "impact"` acrescenta `flow` ao `via` padrão) — é o que faz
   o critério de sucesso 3 valer. Nenhum exemplo atual tem `flow`, então nada muda neles.
2. **AsyncAPI 2.x**: `subscribe` no documento = mensagens que a aplicação **envia** (→ `publish`); `publish` = mensagens
   que ela **recebe** (→ `subscribe`). 3.x: `send` → `publish`, `receive` → `subscribe`.
3. **Banco de dados**: o motor (`tech.postgres-16`) **realiza** o container de banco (`archimate:realization`, porque o
   container com tag `database` é um data-object); fila/cache/storage são **servidos** (`archimate:serving`).
4. **Itens que sumiram**: só elementos (não relações) cujas fontes são todas `repo` deste repositório; relações
   seguem o elemento pela cascata do merge.
5. **`sourceKey` inclui a linha** quando ela existe, para que duas evidências no mesmo arquivo não se fundam.
6. **ConfigMap** gera `env-ref` com `from` = nome do ConfigMap sem os sufixos `-config`/`-configmap`/`-cm`.
7. **Terraform**: só recursos de categorias conhecidas viram fatos; `tf-ref` só entre eles; uma referência que parte
   de um banco não vira relação (evita `serving` inválido para data-object).
8. **Sem `--base` e sem base achada**: aviso em stderr e o delta é gerado para uma base nova; com `--base` inválido → erro.

## Review Focus

1. **Repositório sem nenhum arquivo reconhecido** (ex.: só código, sem graphify) → inventário vazio, resumo com aviso
   de graphify ausente e papel "nenhum deployável"; `--delta` gera só o elemento do repositório. Teste na Task 6.
2. **YAML com vários documentos e âncoras** (`---`, `&`/`*`) num manifesto k8s → todos os documentos lidos, sem erro. Teste na Task 2.
3. **URL com credenciais** (`https://user:token@host/org/repo.git`) → `properties.repo` e `ref` sem credenciais. Teste na Task 1.
4. **Ler o mesmo repositório duas vezes** (mesmo commit) → o segundo plano é "nada mudou". Teste na Task 7.
5. **`--as service` sem `--system`** ou `--system` inexistente na base → `E_SCAN_ROLE` / `E_SCAN_TARGET`, nada escrito. Teste na Task 7.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/vendor/yaml/**`, `scripts/vendor/YAML-LICENSE` | biblioteca `yaml` 2.x (build `browser/dist`) |
| `scripts/lib/scan/git.mjs` | `repoInfo`, `cloneShallow`, `normalizeRepoUrl`, `repoName`, `isGitUrl` |
| `scripts/lib/scan/yaml.mjs` | `readYaml(text) → [{ data, lineOf(...path) }]` |
| `scripts/lib/scan/infra.mjs` | `ENGINES`, `infraOf(image)`, `hostOf(value)`, `tagOf(category)` |
| `scripts/lib/scan/walk.mjs` | `listFiles(root)`, `detect(path, chartDirs)` |
| `scripts/lib/scan/compose.mjs`, `k8s.mjs`, `helm.mjs`, `terraform.mjs`, `openapi.mjs`, `asyncapi.mjs`, `graphify.mjs`, `build.mjs` | extratores |
| `scripts/lib/scan/index.mjs` | `scanDir(root, opts)`, `scanSource(target, opts)` |
| `scripts/lib/scan/summary.mjs` | `summarize(inv, base)`, `formatSummary(s)`, `deployablesOf(inv)` |
| `scripts/lib/scan/to-delta.mjs` | `toDelta(inv, opts)`, `norm`, `repoKey`, `repoElement` |
| `scripts/lib/sources.mjs`, `scripts/gen-schemas.mjs`, `schemas/` | `line` na fonte |
| `scripts/lib/query-archimate.mjs` | `flow` no `via` padrão da visão de impacto |
| `scripts/archlens.mjs` | comando `scan` |
| `tests/fixtures/repos/**` (novo) | mini-repositórios de teste |
| `tests/scan-*.test.mjs` (novos) | testes |
| `examples/repos/**`, `SKILL.md`, `references/repo-reading.md` (novo), `references/merge.md`, `docs/GUIA.md`, `README.md`, `docs/superpowers/roadmap.md` | exemplo e docs |

---

### Task 1: fundação — git, YAML, utilidades de infra, varredura e o extrator de docker-compose

**Files:**
- Create: `scripts/vendor/yaml/**` (cópia de `package/browser/dist/**` do pacote `yaml@2`), `scripts/vendor/YAML-LICENSE`
- Create: `scripts/lib/scan/git.mjs`, `scripts/lib/scan/yaml.mjs`, `scripts/lib/scan/infra.mjs`, `scripts/lib/scan/walk.mjs`, `scripts/lib/scan/compose.mjs`, `scripts/lib/scan/index.mjs`
- Modify: `scripts/lib/sources.mjs` (`sourceKey` com linha), `scripts/gen-schemas.mjs` (`line` na fonte) e regenerar `schemas/`; `README.md` (linha de licença do yaml, junto das de ELK e rough.js)
- Create: `tests/fixtures/repos/pedidos/docker-compose.yml`, `tests/fixtures/repos/pedidos/node_modules/x/compose.yml`, `tests/fixtures/repos/quebrado/compose.yaml`
- Test: `tests/scan-base.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeRepoUrl(url) → string` (sem credenciais, sem `.git` final, sem barra final); `isGitUrl(s) → boolean`;
    `repoName(urlOrPath) → string` (último segmento sem `.git`); `repoInfo(dir) → { commit: string|null, dirty: boolean }`;
    `cloneShallow(url, { ref }) → string` (pasta temporária; lança `E_SCAN_SOURCE: …`)
  - `readYaml(text) → [{ data, lineOf(...path: (string|number)[]) → number }]` (lança em erro de sintaxe)
  - `ENGINES: [{ match, engine, category, label }]`, `infraOf(image) → { engine, category, version? } | null`,
    `hostOf(value) → string|null`, `tagOf(category) → 'database'|'queue'|'cache'|'storage'`
  - `listFiles(root) → [{ path, abs, size }]`; `detect(path, chartDirs: Set) → 'compose'|'helm-chart'|'helm-values'|'terraform'|'graphify'|'build'|'yaml'|'json'|null`
  - `composeFacts(path, text) → facts` (`service`, `infra-image`, `depends-on`, `env-ref`)
  - `scanDir(root, { url?, today? }) → inventory`; `scanSource(target, { ref?, today? }) → inventory`

- [ ] **Step 1: Vendor the yaml library**

```bash
T=$(mktemp -d) && (cd "$T" && npm pack yaml@2 --silent && tar -xzf yaml-*.tgz)
mkdir -p scripts/vendor/yaml && cp -r "$T"/package/browser/dist/* scripts/vendor/yaml/
cp "$T"/package/LICENSE scripts/vendor/YAML-LICENSE
node -e "import('./scripts/vendor/yaml/index.js').then(y => console.log(typeof y.parseAllDocuments, typeof y.LineCounter))"
```

Expected: `function function`. Anote a versão (`$T/package/package.json`) no relatório e na linha de licença do `README.md`.

- [ ] **Step 2: Create the fixtures**

`tests/fixtures/repos/pedidos/docker-compose.yml`:

```yaml
services:
  pedidos-api:
    build: ./api
    ports:
      - "8080:8080"
    environment:
      DB_URL: postgres://app:segredo@pedidos-db:5432/pedidos
      PAGAMENTOS_URL: http://pagamentos:8080/v1
      LOG_LEVEL: info
    depends_on:
      - pedidos-db
  pedidos-db:
    image: postgres:16-alpine
```

`tests/fixtures/repos/pedidos/node_modules/x/compose.yml`: `services: { lixo: { image: nginx } }` (precisa ser ignorado).

`tests/fixtures/repos/quebrado/compose.yaml`: `services: [ isso: não fecha` (YAML inválido).

- [ ] **Step 3: Write the failing tests** — `tests/scan-base.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeRepoUrl, repoName, repoInfo, cloneShallow, isGitUrl } from '../scripts/lib/scan/git.mjs';
import { readYaml } from '../scripts/lib/scan/yaml.mjs';
import { infraOf, hostOf } from '../scripts/lib/scan/infra.mjs';
import { scanDir, scanSource } from '../scripts/lib/scan/index.mjs';
import { sourceKey } from '../scripts/lib/sources.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/repos/${name}/`, import.meta.url));
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'init.defaultBranch=main', ...a], { cwd, encoding: 'utf8' });
const gitRepo = name => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-repo-'));
  cpSync(fixture(name), dir, { recursive: true });
  git(dir, 'init', '-q'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'init');
  return dir;
};

test('repo urls lose credentials and .git; names come from the last segment', () => {
  assert.equal(normalizeRepoUrl('https://user:tok@github.com/org/terminus-assignment-api.git'), 'https://github.com/org/terminus-assignment-api');
  assert.equal(normalizeRepoUrl('git@github.com:org/repo.git'), 'git@github.com:org/repo');
  assert.equal(repoName('https://github.com/org/terminus-assignment-api.git'), 'terminus-assignment-api');
  assert.equal(repoName('/home/u/repos/pedidos/'), 'pedidos');
  assert.ok(isGitUrl('https://x/y.git') && isGitUrl('git@x:y.git') && isGitUrl('file:///tmp/r') && !isGitUrl('/tmp/r'));
});

test('readYaml reads every document with line numbers', () => {
  const docs = readYaml('a: 1\n---\nkind: Service\nmetadata:\n  name: x\n');
  assert.equal(docs.length, 2);
  assert.equal(docs[1].data.metadata.name, 'x');
  assert.equal(docs[1].lineOf('metadata', 'name'), 5);
  assert.throws(() => readYaml('a: [b'));
});

test('infra images and hosts', () => {
  assert.deepEqual(infraOf('postgres:16-alpine'), { engine: 'postgres', category: 'database', version: '16' });
  assert.equal(infraOf('confluentinc/cp-kafka:7.6.0').engine, 'kafka');
  assert.equal(infraOf('ghcr.io/org/pedidos:1.2'), null);
  assert.equal(hostOf('postgres://app:segredo@pedidos-db:5432/pedidos'), 'pedidos-db');
  assert.equal(hostOf('http://pagamentos:8080/v1'), 'pagamentos');
  assert.equal(hostOf('redis:6379'), 'redis');
  assert.equal(hostOf('http://localhost:8080'), null);
  assert.equal(hostOf('info'), null);
});

test('scanDir: compose facts with file and line, node_modules ignored, commit recorded', () => {
  const dir = gitRepo('pedidos');
  const inv = scanDir(dir, { today: '2026-10-03' });
  assert.equal(inv['archlens-inventory'], '1.0');
  assert.equal(inv.repo.name.startsWith('archlens-repo-'), true);
  assert.match(inv.repo.commit, /^[0-9a-f]{40}$/);
  assert.equal(inv.repo.dirty, false);
  assert.equal(inv.files.compose, 1);
  const k = kind => inv.facts.filter(f => f.kind === kind);
  assert.deepEqual(k('service').map(f => [f.name, f.build, f.at.file, f.at.line]), [['pedidos-api', 'api', 'docker-compose.yml', 3]]);
  assert.deepEqual(k('infra-image').map(f => [f.service, f.engine, f.category, f.version]), [['pedidos-db', 'postgres', 'database', '16']]);
  assert.deepEqual(k('depends-on').map(f => [f.from, f.to]), [['pedidos-api', 'pedidos-db']]);
  assert.deepEqual(k('env-ref').map(f => [f.from, f.var, f.host]).sort(), [['pedidos-api', 'DB_URL', 'pedidos-db'], ['pedidos-api', 'PAGAMENTOS_URL', 'pagamentos']]);
  assert.ok(!inv.facts.some(f => f.name === 'lixo'), 'node_modules is ignored');
});

test('an unreadable file becomes a fact and the scan goes on; a folder outside git has no commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-plain-'));
  cpSync(fixture('quebrado'), dir, { recursive: true });
  const inv = scanDir(dir);
  assert.equal(inv.repo.commit, null);
  const bad = inv.facts.find(f => f.kind === 'unreadable');
  assert.equal(bad.at.file, 'compose.yaml');
  assert.ok(bad.error);
});

test('scanSource clones a git url (file://) into a temp folder and records the url', () => {
  const dir = gitRepo('pedidos');
  const inv = scanSource(`file://${dir}`, { today: '2026-10-03' });
  assert.equal(inv.repo.url, `file://${dir}`);
  assert.equal(inv.files.compose, 1);
  assert.throws(() => scanSource('/nao/existe'), /E_SCAN_SOURCE/);
  assert.throws(() => cloneShallow(`file://${dir}-nada`, {}), /E_SCAN_SOURCE/);
});

test('sourceKey keeps two lines of the same file apart', () => {
  assert.notEqual(sourceKey({ kind: 'repo', ref: 'r', path: 'a', line: 1 }), sourceKey({ kind: 'repo', ref: 'r', path: 'a', line: 2 }));
  assert.equal(sourceKey({ kind: 'prompt', ref: 'r' }), 'prompt|r|');
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test tests/scan-base.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/scan/git.mjs'`.

- [ ] **Step 5: Implement**

`scripts/lib/scan/git.mjs`:

```js
// Git access for the repository reader: shallow clone of a url, current commit, normalized repo identity.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';

const scanError = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code });
const run = (cwd, args) => spawnSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf8' });

export const isGitUrl = s => /^(https?|ssh|git|file):\/\//.test(s) || /^[\w.-]+@[\w.-]+:/.test(s);

/** Repo url without credentials, trailing ".git" or "/". */
export function normalizeRepoUrl(url) {
  return String(url).replace(/^([a-z+]+:\/\/)[^@/]+@/i, '$1').replace(/\/+$/, '').replace(/\.git$/, '');
}

export function repoName(urlOrPath) {
  return basename(String(urlOrPath).replace(/[/\\]+$/, '').replace(/\.git$/, '').replace(/^.*:/, m => (m.includes('/') ? m : '')));
}

export function repoInfo(dir) {
  const head = run(dir, ['rev-parse', 'HEAD']);
  if (head.status !== 0) return { commit: null, dirty: false };
  const st = run(dir, ['status', '--porcelain']);
  return { commit: head.stdout.trim(), dirty: st.stdout.trim().length > 0 };
}

/** git clone --depth 1 into a temp folder; the caller removes it (rmSync) when done. */
export function cloneShallow(url, { ref } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'archlens-clone-'));
  const r = run(tmpdir(), ['clone', '-q', '--depth', '1', ...(ref ? ['--branch', ref] : []), url, dir]);
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw scanError('E_SCAN_SOURCE', `não foi possível clonar ${normalizeRepoUrl(url)}: ${(r.stderr || '').trim().split('\n').at(-1)}`);
  }
  return dir;
}

export function assertFolder(path) {
  if (!existsSync(path)) throw scanError('E_SCAN_SOURCE', `pasta não encontrada: ${path}`);
  return resolve(path);
}
export { scanError };
```

(`repoName` deve devolver `repo` para `git@github.com:org/repo.git` também; ajuste a expressão se o teste mostrar o
contrário — o comportamento exigido é o dos testes.)

`scripts/lib/scan/yaml.mjs`:

```js
// YAML with line numbers, on the vendored "yaml" library: every document of a file, and the line of any path.
import { parseAllDocuments, LineCounter } from '../../vendor/yaml/index.js';

export function readYaml(text) {
  const lc = new LineCounter();
  const docs = [...parseAllDocuments(text, { lineCounter: lc, uniqueKeys: false })];
  return docs.map(doc => {
    if (doc.errors.length) throw new Error(doc.errors[0].message);
    return {
      data: doc.toJS({ maxAliasCount: 1000 }),
      lineOf: (...path) => {
        const node = path.length ? doc.getIn(path, true) : doc.contents;
        const off = node?.range?.[0];
        return off == null ? 1 : lc.linePos(off).line;
      },
    };
  }).filter(d => d.data != null);
}
```

`scripts/lib/scan/infra.mjs`:

```js
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
```

`scripts/lib/scan/walk.mjs`:

```js
// The files a repository scan looks at: build/dependency folders and .gitignore entries skipped, types by name.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, dirname, extname, sep } from 'node:path';

const IGNORE_DIRS = new Set(['node_modules', 'vendor', '.git', 'build', 'dist', 'target', '.gradle', '.venv', '.idea', '__pycache__', '.terraform']);

function gitignore(root) {
  const p = join(root, '.gitignore');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('!'))
    .map(l => l.replace(/^\//, '').replace(/\/$/, ''));
}

const ignored = (rel, patterns) => patterns.some(p => (p.startsWith('*.') ? rel.endsWith(p.slice(1))
  : rel === p || rel.startsWith(`${p}/`) || rel.split('/').includes(p)));

export function listFiles(root) {
  const patterns = gitignore(root);
  const out = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || rel === 'graphify-out/cache' || ignored(rel, patterns)) continue;
        walk(abs);
      } else if (e.isFile() && !ignored(rel, patterns)) out.push({ path: rel, abs, size: statSync(abs).size });
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Type of a file by its name (content-based types — k8s, OpenAPI, AsyncAPI — are decided after parsing). */
export function detect(path, chartDirs) {
  const base = basename(path), ext = extname(path).toLowerCase(), dir = dirname(path);
  if (path === 'graphify-out/graph.json') return 'graphify';
  if (path.startsWith('graphify-out/')) return null;
  if (/^(docker-)?compose[\w.-]*\.ya?ml$/i.test(base)) return 'compose';
  if (base === 'Chart.yaml') return 'helm-chart';
  if (/^values[\w.-]*\.ya?ml$/i.test(base) && chartDirs.has(dir)) return 'helm-values';
  if (ext === '.tf') return 'terraform';
  if (['settings.gradle', 'settings.gradle.kts', 'pom.xml', 'go.mod'].includes(base) && dir === '.') return 'build';
  if (base === 'package.json' && dir === '.') return 'build';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  if (ext === '.json' && !/(^|\/)(package-lock|tsconfig|composer)\b/.test(path)) return 'json';
  return null;
}
```

`scripts/lib/scan/compose.mjs`:

```js
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
```

`scripts/lib/scan/index.mjs`:

```js
// Repository scan: walk the files, hand each recognised one to its extractor, collect the facts (inventory).
import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { listFiles, detect } from './walk.mjs';
import { readYaml } from './yaml.mjs';
import { repoInfo, repoName, normalizeRepoUrl, isGitUrl, cloneShallow, assertFolder } from './git.mjs';
import { composeFacts } from './compose.mjs';

const MAX = 2 * 1024 * 1024, MAX_GRAPH = 64 * 1024 * 1024;
const isoToday = () => new Date().toISOString().slice(0, 10);

/** One file → { kind: inventory file counter | null, facts }. Content-typed YAML/JSON is decided here. */
function extract(type, path, text, ctx) {
  if (type === 'compose') return { kind: 'compose', facts: composeFacts(path, text) };
  if (type === 'yaml') readYaml(text); // syntax errors surface as "unreadable"
  return { kind: null, facts: [] };
}

export function scanDir(root, { url, today = isoToday(), helmRender = false } = {}) {
  const info = repoInfo(root);
  const ctx = { root, commit: info.commit, helmRender, chartNames: new Map() };
  const files = { compose: 0, k8s: 0, helm: 0, terraform: 0, openapi: 0, asyncapi: 0, graphify: 0, build: 0, ignored: 0 };
  const facts = [];
  const all = listFiles(root);
  const chartDirs = new Set(all.filter(f => f.path.endsWith('Chart.yaml')).map(f => dirname(f.path)));
  for (const f of all) {
    const type = detect(f.path, chartDirs);
    if (!type || f.size > (type === 'graphify' ? MAX_GRAPH : MAX)) { files.ignored++; continue; }
    try {
      const out = extract(type, f.path, readFileSync(f.abs, 'utf8'), ctx);
      if (!out.kind) { files.ignored++; continue; }
      files[out.kind]++;
      facts.push(...out.facts);
    } catch (e) {
      facts.push({ kind: 'unreadable', error: String(e.message).split('\n')[0], at: { file: f.path, line: 1 } });
    }
  }
  return {
    'archlens-inventory': '1.0',
    repo: { ...(url ? { url: normalizeRepoUrl(url) } : {}), path: root, name: repoName(url ?? root), commit: info.commit, dirty: info.dirty, scannedAt: today },
    files, facts,
  };
}

/** A local folder or a git url (shallow clone in a temp folder, removed afterwards). */
export function scanSource(target, { ref, today, helmRender } = {}) {
  if (!isGitUrl(target)) return scanDir(assertFolder(target), { today, helmRender });
  const dir = cloneShallow(target, { ref });
  try {
    const inv = scanDir(dir, { url: target, today, helmRender });
    return { ...inv, repo: { ...inv.repo, path: normalizeRepoUrl(target) } }; // the temp folder is gone afterwards
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
```

`scripts/lib/sources.mjs`, `sourceKey`:

```js
export function sourceKey(s) {
  return s.ref || s.path ? `${s.kind}|${s.ref ?? ''}|${s.path ?? ''}${s.line != null ? `|${s.line}` : ''}` : `${s.kind}|~${s.excerpt ?? ''}`;
}
```

`scripts/gen-schemas.mjs`, na `source.properties`: `line: { type: 'integer', minimum: 1 }`. Regenere com
`node scripts/gen-schemas.mjs`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/scan-base.test.mjs && npm test`
Expected: PASS (suite inteira).

- [ ] **Step 7: Commit**

```bash
git add scripts/vendor/yaml scripts/vendor/YAML-LICENSE scripts/lib/scan scripts/lib/sources.mjs scripts/gen-schemas.mjs schemas README.md tests/fixtures/repos tests/scan-base.test.mjs
git commit -m "feat(scan): fundação da leitura de repositórios (git, YAML com linhas, varredura, docker-compose)"
```

---

### Task 2: Kubernetes e Helm

**Files:**
- Create: `scripts/lib/scan/k8s.mjs`, `scripts/lib/scan/helm.mjs`
- Modify: `scripts/lib/scan/index.mjs` (`extract`)
- Create: `tests/fixtures/repos/pagamentos/k8s/deploy.yaml`, `tests/fixtures/repos/pagamentos/chart/Chart.yaml`, `tests/fixtures/repos/pagamentos/chart/values.yaml`
- Test: `tests/scan-extractors.test.mjs` (novo)

**Interfaces:**
- Consumes: `readYaml`, `infraOf`, `hostOf` (Task 1).
- Produces: `k8sFacts(path, docs) → facts` (`workload`, `infra-image`, `k8s-service`, `ingress`, `env-ref`);
  `helmChartFacts(path, text) → facts` (`chart`, `infra-image` das dependências conhecidas);
  `helmValuesFacts(path, text, chartName) → facts` (`workload`/`infra-image`, `ingress`, `env-ref`).

- [ ] **Step 1: Create the fixtures**

`tests/fixtures/repos/pagamentos/k8s/deploy.yaml`:

```yaml
x-labels: &labels
  app: pagamentos
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pagamentos
  labels: *labels
spec:
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/acme/pagamentos:2.1.0
          env:
            - name: KAFKA_BROKERS
              value: kafka:9092
            - name: PEDIDOS_URL
              value: http://pedidos-api:8080
---
apiVersion: v1
kind: Service
metadata:
  name: pagamentos
spec:
  selector:
    app: pagamentos
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pagamentos
spec:
  rules:
    - host: pagamentos.acme.com
      http:
        paths:
          - path: /
            backend:
              service:
                name: pagamentos
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: pagamentos-db
spec:
  template:
    spec:
      containers:
        - name: db
          image: postgres:15
```

(O primeiro documento não é k8s — tem âncora — e deve ser ignorado sem erro.)

`tests/fixtures/repos/pagamentos/chart/Chart.yaml`:

```yaml
apiVersion: v2
name: pagamentos
version: 0.1.0
dependencies:
  - name: redis
    version: 18.x
    repository: https://charts.bitnami.com/bitnami
```

`tests/fixtures/repos/pagamentos/chart/values.yaml`:

```yaml
image:
  repository: ghcr.io/acme/pagamentos
  tag: 2.1.0
ingress:
  hosts:
    - host: pay.acme.com
env:
  ANTIFRAUDE_URL: https://antifraude.acme.com/api
```

- [ ] **Step 2: Write the failing tests** — `tests/scan-extractors.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readYaml } from '../scripts/lib/scan/yaml.mjs';
import { k8sFacts } from '../scripts/lib/scan/k8s.mjs';
import { helmChartFacts, helmValuesFacts } from '../scripts/lib/scan/helm.mjs';
import { scanDir } from '../scripts/lib/scan/index.mjs';

const fx = p => fileURLToPath(new URL(`./fixtures/repos/${p}`, import.meta.url));
const read = p => readFileSync(fx(p), 'utf8');
const pick = (facts, kind, ...keys) => facts.filter(f => f.kind === kind).map(f => keys.map(k => f[k]));

test('k8s: workloads, infra workloads, services, ingress and env hosts, every document, anchors ok', () => {
  const facts = k8sFacts('k8s/deploy.yaml', readYaml(read('pagamentos/k8s/deploy.yaml')));
  assert.deepEqual(pick(facts, 'workload', 'kindK8s', 'name', 'image'), [['Deployment', 'pagamentos', 'ghcr.io/acme/pagamentos:2.1.0']]);
  assert.deepEqual(pick(facts, 'infra-image', 'service', 'engine', 'version'), [['pagamentos-db', 'postgres', '15']]);
  assert.deepEqual(pick(facts, 'k8s-service', 'name'), [['pagamentos']]);
  assert.deepEqual(pick(facts, 'ingress', 'host', 'service'), [['pagamentos.acme.com', 'pagamentos']]);
  assert.deepEqual(pick(facts, 'env-ref', 'from', 'var', 'host').sort(), [['pagamentos', 'KAFKA_BROKERS', 'kafka'], ['pagamentos', 'PEDIDOS_URL', 'pedidos-api']]);
  assert.equal(facts.find(f => f.kind === 'workload').at.line, 7, 'line of metadata.name');
});

test('helm: chart with known dependencies, values with image, ingress and env', () => {
  const chart = helmChartFacts('chart/Chart.yaml', read('pagamentos/chart/Chart.yaml'));
  assert.deepEqual(pick(chart, 'chart', 'name', 'dependencies'), [['pagamentos', ['redis']]]);
  assert.deepEqual(pick(chart, 'infra-image', 'service', 'engine'), [['redis', 'redis']]);
  const values = helmValuesFacts('chart/values.yaml', read('pagamentos/chart/values.yaml'), 'pagamentos');
  assert.deepEqual(pick(values, 'workload', 'kindK8s', 'name', 'image'), [['HelmValues', 'pagamentos', 'ghcr.io/acme/pagamentos:2.1.0']]);
  assert.deepEqual(pick(values, 'ingress', 'host', 'service'), [['pay.acme.com', 'pagamentos']]);
  assert.deepEqual(pick(values, 'env-ref', 'from', 'host'), [['pagamentos', 'antifraude.acme.com']]);
});

test('scanDir dispatches k8s and helm files', () => {
  const inv = scanDir(fx('pagamentos'));
  assert.equal(inv.files.k8s, 1);
  assert.equal(inv.files.helm, 2);
  assert.ok(inv.facts.some(f => f.kind === 'chart'));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/scan-extractors.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/scan/k8s.mjs'`.

- [ ] **Step 4: Implement**

`scripts/lib/scan/k8s.mjs`:

```js
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
```

`scripts/lib/scan/helm.mjs`:

```js
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
```

Em `index.mjs`, importe `k8sFacts`, `helmChartFacts`, `helmValuesFacts` e estenda `extract`:

```js
  if (type === 'helm-chart') {
    const facts = helmChartFacts(path, text);
    ctx.chartNames.set(dirname(path), facts[0].name);
    return { kind: 'helm', facts };
  }
  if (type === 'helm-values') return { kind: 'helm', facts: helmValuesFacts(path, text, ctx.chartNames.get(dirname(path)) ?? 'chart') };
  if (type === 'yaml') {
    const docs = readYaml(text);
    if (docs.some(d => d.data?.apiVersion && d.data?.kind)) return { kind: 'k8s', facts: k8sFacts(path, docs) };
    return { kind: null, facts: [] };
  }
```

Garanta que `Chart.yaml` seja processado antes dos `values*.yaml` da mesma pasta (a ordem alfabética de `listFiles`
já põe `Chart.yaml` antes de `values.yaml`, porque maiúsculas vêm antes; confirme com o teste).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/scan-extractors.test.mjs && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/scan tests/fixtures/repos/pagamentos tests/scan-extractors.test.mjs
git commit -m "feat(scan): extratores de Kubernetes e Helm"
```

---

### Task 3: Terraform, OpenAPI e AsyncAPI

**Files:**
- Create: `scripts/lib/scan/terraform.mjs`, `scripts/lib/scan/openapi.mjs`, `scripts/lib/scan/asyncapi.mjs`
- Modify: `scripts/lib/scan/index.mjs` (`extract`)
- Create: `tests/fixtures/repos/infra/main.tf`, `tests/fixtures/repos/pedidos/api/openapi.yaml`, `tests/fixtures/repos/pedidos/api/asyncapi.yaml`, `tests/fixtures/repos/pagamentos/asyncapi.json`
- Test: `tests/scan-extractors.test.mjs`

**Interfaces:**
- Produces: `terraformFacts(path, text) → facts` (`cloud-resource` {type, name, category, attrs}, `tf-ref` {from, to});
  `openapiFacts(path, doc) → facts` (`api` {title, version, servers, operations, tags});
  `asyncapiFacts(path, doc) → facts` (`channel` {name, action: 'publish'|'subscribe', message?}).

- [ ] **Step 1: Create the fixtures**

`tests/fixtures/repos/infra/main.tf`:

```hcl
resource "aws_db_instance" "pedidos" {
  engine         = "postgres"
  engine_version = "16.3"
  instance_class = "db.t4g.medium"
  vpc_security_group_ids = [aws_security_group.db.id]
}

resource "aws_msk_cluster" "eventos" {
  cluster_name  = "eventos"
  kafka_version = "3.6.0"
}

resource "aws_security_group" "db" {
  name = "db-sg"
}

resource "aws_eks_cluster" "principal" {
  name = "principal"
  depends_on = [aws_msk_cluster.eventos]
}
```

`tests/fixtures/repos/pedidos/api/openapi.yaml`:

```yaml
openapi: 3.0.3
info:
  title: API de Pedidos
  version: 1.4.0
servers:
  - url: https://pedidos.acme.com
paths:
  /pedidos:
    get: { tags: [pedidos] }
    post: { tags: [pedidos] }
  /pedidos/{id}:
    get: { tags: [pedidos] }
```

`tests/fixtures/repos/pedidos/api/asyncapi.yaml` (2.x: `subscribe` = a aplicação envia):

```yaml
asyncapi: 2.6.0
info: { title: Eventos de Pedidos, version: 1.0.0 }
channels:
  pedido-criado:
    subscribe:
      message: { name: PedidoCriado }
```

`tests/fixtures/repos/pagamentos/asyncapi.json` (3.x):

```json
{ "asyncapi": "3.0.0", "info": { "title": "Pagamentos", "version": "1.0.0" },
  "channels": { "pedidoCriado": { "address": "pedido-criado" }, "pagamentoAprovado": { "address": "pagamento-aprovado" } },
  "operations": {
    "consumirPedido": { "action": "receive", "channel": { "$ref": "#/channels/pedidoCriado" } },
    "publicarPagamento": { "action": "send", "channel": { "$ref": "#/channels/pagamentoAprovado" } } } }
```

- [ ] **Step 2: Write the failing tests** (acrescentar a `tests/scan-extractors.test.mjs`)

```js
import { terraformFacts } from '../scripts/lib/scan/terraform.mjs';
import { openapiFacts } from '../scripts/lib/scan/openapi.mjs';
import { asyncapiFacts } from '../scripts/lib/scan/asyncapi.mjs';

test('terraform: known categories only, literal attributes, references between them', () => {
  const facts = terraformFacts('main.tf', read('infra/main.tf'));
  assert.deepEqual(pick(facts, 'cloud-resource', 'type', 'name', 'category'), [
    ['aws_db_instance', 'pedidos', 'database'], ['aws_msk_cluster', 'eventos', 'messaging'], ['aws_eks_cluster', 'principal', 'cluster']]);
  const db = facts.find(f => f.name === 'pedidos');
  assert.equal(db.attrs.engine_version, '16.3');
  assert.equal(db.at.line, 1);
  assert.deepEqual(pick(facts, 'tf-ref', 'from', 'to'), [['aws_eks_cluster.principal', 'aws_msk_cluster.eventos']], 'refs to unknown kinds (security group) are dropped');
});

test('openapi: title, version, servers, operation count and tags', () => {
  const [doc] = readYaml(read('pedidos/api/openapi.yaml'));
  const [api] = openapiFacts('api/openapi.yaml', doc);
  assert.deepEqual([api.title, api.version, api.servers, api.operations, api.tags], ['API de Pedidos', '1.4.0', ['https://pedidos.acme.com'], 3, ['pedidos']]);
  assert.equal(api.at.line, 3);
});

test('asyncapi: 2.x subscribe means the app sends; 3.x send/receive', () => {
  const [v2] = readYaml(read('pedidos/api/asyncapi.yaml'));
  assert.deepEqual(pick(asyncapiFacts('api/asyncapi.yaml', v2), 'channel', 'name', 'action', 'message'), [['pedido-criado', 'publish', 'PedidoCriado']]);
  const v3 = { data: JSON.parse(read('pagamentos/asyncapi.json')), lineOf: () => 1 };
  assert.deepEqual(pick(asyncapiFacts('asyncapi.json', v3), 'channel', 'name', 'action').sort(), [['pagamento-aprovado', 'publish'], ['pedido-criado', 'subscribe']]);
});

test('scanDir dispatches terraform, openapi (yaml) and asyncapi (yaml and json)', () => {
  const ped = scanDir(fx('pedidos'));
  assert.equal(ped.files.openapi, 1);
  assert.equal(ped.files.asyncapi, 1);
  assert.equal(scanDir(fx('pagamentos')).files.asyncapi, 1);
  assert.equal(scanDir(fx('infra')).files.terraform, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/scan-extractors.test.mjs` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Implement**

`scripts/lib/scan/terraform.mjs`:

```js
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
```

(A primeira linha de `ATTR` captura `engine_version = "16.3"`; o bloco abre na linha do `resource` — `depth` passa a 1
depois da contagem da própria linha. Ajuste a ordem das operações se o teste das linhas falhar; o exigido é o dos testes.)

`scripts/lib/scan/openapi.mjs`:

```js
// OpenAPI / Swagger: one application interface per document.
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

export function openapiFacts(path, doc) {
  const d = doc.data;
  const ops = Object.values(d.paths ?? {}).flatMap(p => METHODS.filter(m => p?.[m]).map(m => p[m]));
  const servers = d.servers ? d.servers.map(s => s.url) : d.host ? [`${(d.schemes ?? ['https'])[0]}://${d.host}${d.basePath ?? ''}`] : [];
  return [{
    kind: 'api', title: d.info?.title ?? path, version: String(d.info?.version ?? ''), servers, operations: ops.length,
    tags: [...new Set(ops.flatMap(o => o.tags ?? []))], at: { file: path, line: doc.lineOf('info', 'title') },
  }];
}
```

`scripts/lib/scan/asyncapi.mjs`:

```js
// AsyncAPI: channels (topics/queues) the application publishes or subscribes. In 2.x the operation verbs are seen
// from the client: "subscribe" lists what the application sends, "publish" what it receives. 3.x says send/receive.
export function asyncapiFacts(path, doc) {
  const d = doc.data;
  const facts = [];
  if (String(d.asyncapi).startsWith('2')) {
    for (const [name, ch] of Object.entries(d.channels ?? {})) {
      const at = { file: path, line: doc.lineOf('channels', name) };
      if (ch?.subscribe) facts.push({ kind: 'channel', name, action: 'publish', ...msg(ch.subscribe), at });
      if (ch?.publish) facts.push({ kind: 'channel', name, action: 'subscribe', ...msg(ch.publish), at });
    }
  } else {
    for (const [opId, op] of Object.entries(d.operations ?? {})) {
      const key = String(op?.channel?.$ref ?? '').split('/').at(-1);
      const name = d.channels?.[key]?.address ?? key;
      if (!name || !['send', 'receive'].includes(op.action)) continue;
      facts.push({ kind: 'channel', name, action: op.action === 'send' ? 'publish' : 'subscribe', at: { file: path, line: doc.lineOf('operations', opId) } });
    }
  }
  return facts;
}
const msg = op => (op.message?.name ? { message: op.message.name } : {});
```

Em `index.mjs`: importe os três e estenda `extract`:

```js
  if (type === 'terraform') return { kind: 'terraform', facts: terraformFacts(path, text) };
  if (type === 'yaml' || type === 'json') {
    const docs = type === 'json' ? [{ data: JSON.parse(text), lineOf: () => 1 }] : readYaml(text);
    const first = docs[0]?.data ?? {};
    if (first.openapi || first.swagger) return { kind: 'openapi', facts: openapiFacts(path, docs[0]) };
    if (first.asyncapi) return { kind: 'asyncapi', facts: asyncapiFacts(path, docs[0]) };
    if (type === 'yaml' && docs.some(d => d.data?.apiVersion && d.data?.kind)) return { kind: 'k8s', facts: k8sFacts(path, docs) };
    return { kind: null, facts: [] };
  }
```

(substituindo o bloco `yaml` da Task 2). Um `.json` qualquer que não abre como JSON deve contar como `ignored`, não
`unreadable` (envolva o `JSON.parse` dos `.json` num `try` que devolve `{ kind: null }`); YAML inválido continua
`unreadable`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/scan-extractors.test.mjs && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/scan tests/fixtures/repos tests/scan-extractors.test.mjs
git commit -m "feat(scan): extratores de Terraform (HCL mínimo), OpenAPI e AsyncAPI"
```

---

### Task 4: graphify e arquivos de build

**Files:**
- Create: `scripts/lib/scan/build.mjs`, `scripts/lib/scan/graphify.mjs`
- Modify: `scripts/lib/scan/index.mjs` (`extract`)
- Create: `tests/fixtures/repos/app-modular/settings.gradle.kts`, `…/app/build.gradle.kts`, `…/domain/build.gradle.kts`, `…/data/build.gradle.kts`, `…/graphify-out/graph.json`, `tests/fixtures/repos/web-workspaces/package.json`, `…/packages/web/package.json`, `…/packages/ui/package.json`
- Test: `tests/scan-extractors.test.mjs`

**Interfaces:**
- Produces: `gradleModules(text) → string[]`; `buildFacts(path, text, ctx) → facts` (`module` {name, executable},
  `module-dep` {from, to, count}); `graphifyFacts(path, text, ctx) → facts` (`module`, `module-dep`, `flow`
  {label, participants, confidence}, `domain-concept` {label, module, degree}, `graph-stale` {builtAt, commit}).

- [ ] **Step 1: Create the fixtures**

`tests/fixtures/repos/app-modular/settings.gradle.kts`: `rootProject.name = "app-modular"\ninclude(":app", ":domain", ":data")\n`

`…/app/build.gradle.kts`: `plugins { id("com.android.application") }\ndependencies { implementation(project(":domain")); implementation(project(":data")) }\n`

`…/domain/build.gradle.kts`: `plugins { kotlin("jvm") }\n`

`…/data/build.gradle.kts`: `plugins { kotlin("jvm") }\ndependencies { implementation(project(":domain")) }\n`

`…/graphify-out/graph.json` (pequeno, mesmo formato do graphify real):

```json
{ "directed": true, "multigraph": true, "graph": {}, "built_at_commit": "0000000",
  "nodes": [
    { "id": "a1", "label": "MainActivity", "file_type": "code", "source_file": "app/src/Main.kt", "source_location": "L3" },
    { "id": "a2", "label": "TodayViewModel", "file_type": "code", "source_file": "app/src/Today.kt", "source_location": "L5" },
    { "id": "d1", "label": "Treatment", "file_type": "code", "source_file": "domain/src/Treatment.kt", "source_location": "L10" },
    { "id": "d2", "label": "DoseEvent", "file_type": "code", "source_file": "domain/src/DoseEvent.kt", "source_location": "L7" },
    { "id": "d3", "label": "TreatmentTest", "file_type": "code", "source_file": "domain/src/test/TreatmentTest.kt", "source_location": "L1" },
    { "id": "r1", "label": "RoomDoseRepository", "file_type": "code", "source_file": "data/src/Repo.kt", "source_location": "L2" },
    { "id": "k1", "label": "Fluxo de dose", "file_type": "document", "source_file": "docs/spec.md" }
  ],
  "links": [
    { "source": "a2", "target": "d1", "relation": "imports" }, { "source": "a2", "target": "d2", "relation": "calls" },
    { "source": "a1", "target": "a2", "relation": "calls" }, { "source": "r1", "target": "d2", "relation": "implements" },
    { "source": "r1", "target": "d1", "relation": "references" }, { "source": "d3", "target": "d1", "relation": "calls" },
    { "source": "d2", "target": "d1", "relation": "references" }
  ],
  "hyperedges": [
    { "id": "h1", "label": "Registrar dose tomada", "nodes": ["a2", "d2", "r1"], "confidence_score": 0.85, "source_file": "docs/spec.md" }
  ] }
```

`tests/fixtures/repos/web-workspaces/package.json`: `{ "name": "root", "private": true, "workspaces": ["packages/*"] }`

`…/packages/web/package.json`: `{ "name": "@acme/web", "scripts": { "start": "node server.js" }, "dependencies": { "@acme/ui": "*" } }`

`…/packages/ui/package.json`: `{ "name": "@acme/ui" }`

- [ ] **Step 2: Write the failing tests** (acrescentar a `tests/scan-extractors.test.mjs`)

```js
import { gradleModules, buildFacts } from '../scripts/lib/scan/build.mjs';
import { graphifyFacts } from '../scripts/lib/scan/graphify.mjs';

test('gradle: modules, executable by plugin, project() dependencies', () => {
  assert.deepEqual(gradleModules('include(":app", ":domain")\ninclude ":data"\n'), ['app', 'domain', 'data']);
  const facts = buildFacts('settings.gradle.kts', read('app-modular/settings.gradle.kts'), { root: fx('app-modular') });
  assert.deepEqual(pick(facts, 'module', 'name', 'executable'), [['app', true], ['domain', false], ['data', false]]);
  assert.deepEqual(pick(facts, 'module-dep', 'from', 'to').sort(), [['app', 'data'], ['app', 'domain'], ['data', 'domain']]);
});

test('npm workspaces: packages, executable by start/bin, dependencies between them', () => {
  const facts = buildFacts('package.json', read('web-workspaces/package.json'), { root: fx('web-workspaces') });
  assert.deepEqual(pick(facts, 'module', 'name', 'executable').sort(), [['packages/ui', false], ['packages/web', true]]);
  assert.deepEqual(pick(facts, 'module-dep', 'from', 'to'), [['packages/web', 'packages/ui']]);
});

test('graphify: modules, aggregated dependencies, flows, domain concepts, stale graph', () => {
  const facts = graphifyFacts('graphify-out/graph.json', read('app-modular/graphify-out/graph.json'), { root: fx('app-modular'), commit: 'abc1234def' });
  assert.deepEqual(pick(facts, 'module', 'name').sort(), [['app'], ['data'], ['domain']]);
  const deps = Object.fromEntries(facts.filter(f => f.kind === 'module-dep').map(f => [`${f.from}>${f.to}`, f.count]));
  assert.deepEqual(deps, { 'app>domain': 2, 'data>domain': 2 });
  const [flow] = facts.filter(f => f.kind === 'flow');
  assert.deepEqual([flow.label, flow.participants.sort(), flow.confidence], ['Registrar dose tomada', ['app', 'data', 'domain'], 'média']);
  assert.deepEqual(pick(facts, 'domain-concept', 'label', 'module'), [['Treatment', 'domain'], ['DoseEvent', 'domain']], 'tests excluded, most connected first');
  assert.equal(facts.find(f => f.kind === 'domain-concept').at.line, 10);
  assert.deepEqual(pick(facts, 'graph-stale', 'builtAt', 'commit'), [['0000000', 'abc1234def']]);
});

test('scanDir: graphify and build files are counted', () => {
  const inv = scanDir(fx('app-modular'));
  assert.equal(inv.files.graphify, 1);
  assert.equal(inv.files.build, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/scan-extractors.test.mjs` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Implement**

`scripts/lib/scan/build.mjs`:

```js
// Build files: modules of a multi-module repository (Gradle, Maven, npm workspaces, Go) and the dependencies
// between them. Used for modules when there is no graphify graph, and for the "executable" flag in any case.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXECUTABLE_GRADLE = /com\.android\.application|plugins\.android\.application|id\s*\(?\s*["']application["']|org\.springframework\.boot|apply\s+plugin:\s*["']application["']/;
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null);

export function gradleModules(text) {
  const out = [];
  for (const m of text.matchAll(/include\s*\(?([^)\n]+)\)?/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^["']|["']$/g, '').replace(/^:/, '').replace(/:/g, '/');
      if (name) out.push(name);
    }
  }
  return out;
}

export function buildFacts(path, text, ctx) {
  const facts = [];
  const at = (file, line = 1) => ({ file, line });
  if (path.startsWith('settings.gradle')) {
    for (const m of gradleModules(text)) {
      const file = existsSync(join(ctx.root, m, 'build.gradle.kts')) ? `${m}/build.gradle.kts` : `${m}/build.gradle`;
      const bt = read(join(ctx.root, file)) ?? '';
      facts.push({ kind: 'module', name: m, executable: EXECUTABLE_GRADLE.test(bt), at: at(path) });
      bt.split('\n').forEach((l, i) => {
        for (const d of l.matchAll(/project\(\s*["']:([^"']+)["']\s*\)/g)) facts.push({ kind: 'module-dep', from: m, to: d[1].replace(/:/g, '/'), count: 1, at: at(file, i + 1) });
      });
    }
  } else if (path === 'pom.xml') {
    for (const [, m] of text.matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)) {
      const child = read(join(ctx.root, m, 'pom.xml')) ?? '';
      facts.push({ kind: 'module', name: m, executable: /spring-boot-maven-plugin|maven-shade-plugin|<mainClass>/.test(child), at: at(path) });
    }
  } else if (path === 'package.json') {
    const root = JSON.parse(text);
    const globs = Array.isArray(root.workspaces) ? root.workspaces : root.workspaces?.packages ?? [];
    const dirs = globs.flatMap(g => (g.endsWith('/*')
      ? (existsSync(join(ctx.root, g.slice(0, -2))) ? readdirSync(join(ctx.root, g.slice(0, -2)), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => `${g.slice(0, -2)}/${e.name}`) : [])
      : [g]));
    const pkgs = dirs.map(d => ({ dir: d, pkg: JSON.parse(read(join(ctx.root, d, 'package.json')) ?? 'null') })).filter(x => x.pkg);
    const byName = new Map(pkgs.map(x => [x.pkg.name, x.dir]));
    for (const { dir, pkg } of pkgs) {
      facts.push({ kind: 'module', name: dir, executable: !!(pkg.bin || pkg.scripts?.start), at: at(`${dir}/package.json`) });
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (byName.has(dep)) facts.push({ kind: 'module-dep', from: dir, to: byName.get(dep), count: 1, at: at(`${dir}/package.json`) });
      }
    }
  } else if (path === 'go.mod') {
    const name = /^module\s+(\S+)/m.exec(text)?.[1]?.split('/').at(-1) ?? 'main';
    facts.push({ kind: 'module', name, executable: existsSync(join(ctx.root, 'main.go')) || existsSync(join(ctx.root, 'cmd')), at: at(path) });
  }
  return facts;
}
```

`scripts/lib/scan/graphify.mjs`:

```js
// graphify (graphify-out/graph.json): build modules seen in the code graph, dependencies between them (aggregated),
// business flows (hyperedges), domain concepts (most connected domain nodes) and whether the graph is stale.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gradleModules } from './build.mjs';

const DEP_RELATIONS = new Set(['imports', 'calls', 'references', 'implements', 'inherits']);
const NOT_MODULES = new Set(['docs', 'doc', 'graphify-out', '.github', 'scripts', 'tools']);
const confidence = s => (s >= 0.9 ? 'alta' : s >= 0.7 ? 'média' : 'baixa');

function moduleNames(root, nodes) {
  for (const f of ['settings.gradle.kts', 'settings.gradle']) {
    const p = join(root, f);
    if (existsSync(p)) return new Set(gradleModules(readFileSync(p, 'utf8')));
  }
  return new Set(nodes.filter(n => n.file_type === 'code' && n.source_file?.includes('/')).map(n => n.source_file.split('/')[0]).filter(d => !NOT_MODULES.has(d)));
}

export function graphifyFacts(path, text, ctx) {
  const g = JSON.parse(text);
  const nodes = g.nodes ?? [], links = g.links ?? g.edges ?? [];
  const mods = moduleNames(ctx.root, nodes);
  const modOf = file => {
    if (!file) return null;
    const parts = file.split('/');
    for (let i = parts.length - 1; i >= 1; i--) if (mods.has(parts.slice(0, i).join('/'))) return parts.slice(0, i).join('/');
    return null;
  };
  const byId = new Map(nodes.map(n => [n.id, n]));
  const at = { file: path, line: 1 };
  const facts = [];
  const seen = new Set(nodes.filter(n => n.file_type === 'code').map(n => modOf(n.source_file)).filter(Boolean));
  for (const m of [...mods].filter(m => seen.has(m))) facts.push({ kind: 'module', name: m, executable: false, at });
  const deps = new Map();
  for (const l of links) {
    if (!DEP_RELATIONS.has(l.relation)) continue;
    const a = modOf(byId.get(l.source)?.source_file), b = modOf(byId.get(l.target)?.source_file);
    if (a && b && a !== b) deps.set(`${a}>${b}`, (deps.get(`${a}>${b}`) ?? 0) + 1);
  }
  for (const [k, count] of deps) { const [from, to] = k.split('>'); facts.push({ kind: 'module-dep', from, to, count, at }); }
  for (const h of g.hyperedges ?? g.graph?.hyperedges ?? []) {
    const participants = [...new Set((h.nodes ?? []).map(id => modOf(byId.get(id)?.source_file)).filter(Boolean))];
    facts.push({ kind: 'flow', label: h.label ?? h.id, participants, confidence: confidence(h.confidence_score ?? 1), at: { file: h.source_file ?? path, line: 1 } });
  }
  const degree = new Map();
  for (const l of links) for (const id of [l.source, l.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const concepts = nodes.filter(n => n.file_type === 'code' && /domain|dominio|core|model/i.test(modOf(n.source_file) ?? '') && !/test/i.test(n.source_file ?? ''))
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, 10);
  for (const n of concepts) {
    facts.push({ kind: 'domain-concept', label: n.label, module: modOf(n.source_file), degree: degree.get(n.id) ?? 0,
      at: { file: n.source_file, line: Number(/L(\d+)/.exec(n.source_location ?? '')?.[1] ?? 1) } });
  }
  if (g.built_at_commit && ctx.commit && !ctx.commit.startsWith(g.built_at_commit) && !g.built_at_commit.startsWith(ctx.commit)) {
    facts.push({ kind: 'graph-stale', builtAt: g.built_at_commit, commit: ctx.commit, at });
  }
  return facts;
}
```

(Na fixture, `app>domain` tem contagem 2 — `imports` + `calls` — e `data>domain` 2 — `implements` + `references`;
`app>app` e o teste em `domain/src/test` não contam. Os conceitos de domínio devem sair `Treatment` e `DoseEvent`
nessa ordem.)

Em `index.mjs`, estenda `extract`:

```js
  if (type === 'graphify') return { kind: 'graphify', facts: graphifyFacts(path, text, ctx) };
  if (type === 'build') return { kind: 'build', facts: buildFacts(path, text, ctx) };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/scan-extractors.test.mjs && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/scan tests/fixtures/repos tests/scan-extractors.test.mjs
git commit -m "feat(scan): graphify (módulos, dependências, fluxos, conceitos) e arquivos de build"
```

---

### Task 5: resumo, papel sugerido e candidatos na base

**Files:**
- Create: `scripts/lib/scan/summary.mjs`
- Create: `scripts/lib/scan/to-delta.mjs` (só `norm`, `repoKey`, `repoElement` nesta task; `toDelta` na Task 6)
- Test: `tests/scan-delta.test.mjs` (novo)

**Interfaces:**
- Consumes: inventário (Tasks 1–4); `similarity`, `aliasKey` de `scripts/lib/match.mjs`; `c4KindOf`, `ancestors` de `scripts/lib/model.mjs`; `normalizeModel`.
- Produces:
  - `norm(s) → string`; `repoKey(repo) → string`; `repoElement(base, inv) → element|null`
  - `deployablesOf(inv) → string[]`
  - `summarize(inv, base|null) → { repo, counts, files, role: { suggested: 'system'|'service', why }, existing: { id, name, by: 'repo'|'name', score?, role? }|null, systems: [{ id, name, why: string[] }], warnings: string[] }`
  - `formatSummary(s) → string` (texto em português para o terminal)

- [ ] **Step 1: Write the failing tests** — `tests/scan-delta.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel } from '../scripts/lib/model.mjs';
import { summarize, deployablesOf, formatSummary } from '../scripts/lib/scan/summary.mjs';
import { norm, repoKey } from '../scripts/lib/scan/to-delta.mjs';

const inv = (facts, repo = {}) => ({ 'archlens-inventory': '1.0', repo: { path: '/r/terminus-assignment-api', name: 'terminus-assignment-api', commit: 'abcdef1234', dirty: false, scannedAt: '2026-10-03', ...repo },
  files: { compose: 0, k8s: 0, helm: 0, terraform: 0, openapi: 0, asyncapi: 0, graphify: 0, build: 0, ignored: 0 }, facts });
const at = { file: 'x', line: 1 };
const terminus = (extra = {}) => normalizeModel({ archlens: '1.0', name: 'T', model: { elements: [
  { id: 'terminus', type: 'c4:softwareSystem', name: 'Terminus', children: [
    { id: 'terminus.assignment', type: 'c4:container', name: 'Assignment API' },
    { id: 'terminus.scheduler', type: 'c4:container', name: 'Scheduler' }] },
  { id: 'topic.assignment-requested', type: 'c4:container', name: 'assignment-requested', tags: ['topic'] },
  { id: 'billing', type: 'c4:softwareSystem', name: 'Billing' }, ...(extra.elements ?? [])],
  relationships: [{ from: 'terminus.scheduler', to: 'topic.assignment-requested', type: 'archimate:flow' }] } });

test('norm and repoKey', () => {
  assert.equal(norm('Pedidos API (v2)'), 'pedidos-api-v2');
  assert.equal(norm('Ação'), 'acao');
  assert.equal(repoKey({ url: 'https://u:t@github.com/o/r.git', path: 'x' }), 'https://github.com/o/r');
  assert.equal(repoKey({ path: '/r/x' }), '/r/x');
});

test('suggested role: one deployable → service, two or more → system, none → service with a note', () => {
  assert.equal(summarize(inv([{ kind: 'service', name: 'api', at }]), null).role.suggested, 'service');
  const s = summarize(inv([{ kind: 'service', name: 'api', at }, { kind: 'module', name: 'worker', executable: true, at }]), null);
  assert.equal(s.role.suggested, 'system');
  assert.match(s.role.why, /2 deployáveis/);
  assert.match(summarize(inv([]), null).role.why, /nenhum deployável/);
  assert.deepEqual(deployablesOf(inv([{ kind: 'service', name: 'api', at }, { kind: 'workload', name: 'api', at }])), ['api']);
});

test('existing element: by properties.repo first, then by name similarity', () => {
  const byName = summarize(inv([]), terminus());
  assert.deepEqual([byName.existing.id, byName.existing.by], ['terminus.assignment', 'name']);
  const known = terminus({ elements: [{ id: 'terminus.x', type: 'c4:container', name: 'Outro', parent: 'terminus', properties: { repo: '/r/terminus-assignment-api', repoRole: 'service' } }] });
  const byRepo = summarize(inv([{ kind: 'service', name: 'a', at }, { kind: 'service', name: 'b', at }]), known);
  assert.deepEqual([byRepo.existing.id, byRepo.existing.by, byRepo.existing.role], ['terminus.x', 'repo', 'service']);
  assert.ok(byRepo.warnings.some(w => /registrado como service/.test(w)));
});

test('probable systems come with reasons (name prefix, topic) and are never chosen for the user', () => {
  const s = summarize(inv([{ kind: 'channel', name: 'assignment-requested', action: 'subscribe', at }]), terminus());
  assert.equal(s.systems[0].id, 'terminus');
  assert.ok(s.systems[0].why.some(w => /prefixo|começa com/.test(w)));
  assert.ok(s.systems[0].why.some(w => /tópico assignment-requested/.test(w)));
  assert.ok(!s.systems.some(x => x.id === 'billing'));
  assert.equal(s.role.suggested, 'service', 'still only a suggestion');
});

test('warnings: graphify missing, stale graph, dirty tree, outside git, unreadable files', () => {
  const w = summarize(inv([{ kind: 'graph-stale', builtAt: '1', commit: '2', at }, { kind: 'unreadable', error: 'x', at }], { dirty: true, commit: null }), null).warnings.join('\n');
  assert.match(w, /graphify ausente/);
  assert.match(w, /desatualizado/);
  assert.match(w, /não commitadas/);
  assert.match(w, /fora de git/);
  assert.match(w, /1 arquivo/);
  assert.match(formatSummary(summarize(inv([]), terminus())), /terminus\.assignment/);
});
```

(Para o aviso "graphify ausente", use `inv.files.graphify === 0`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scan-delta.test.mjs` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implement**

`scripts/lib/scan/to-delta.mjs` (início; `toDelta` entra na Task 6):

```js
// Inventory + role + base → delta (rules in references/repo-reading.md). Pure: no I/O.
import { normalizeRepoUrl } from './git.mjs';

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const repoKey = repo => (repo.url ? normalizeRepoUrl(repo.url) : repo.path);

/** The element of the base already standing for this repository (properties.repo), or null. */
export function repoElement(base, inv) {
  if (!base) return null;
  const key = repoKey(inv.repo);
  return [...base.elements.values()].find(e => e.properties?.repo === key) ?? null;
}
```

`scripts/lib/scan/summary.mjs`:

```js
// What the skill shows before asking the repository's role: counts, warnings, the suggested role and why, the base
// element that may already stand for the repository, and probable systems with their reasons. It never decides.
import { similarity, aliasKey } from '../match.mjs';
import { c4KindOf, ancestors } from '../model.mjs';
import { norm, repoElement } from './to-delta.mjs';

export function deployablesOf(inv) {
  const names = new Map();
  for (const f of inv.facts) {
    if (f.kind === 'service' || f.kind === 'workload' || (f.kind === 'module' && f.executable)) if (!names.has(norm(f.name))) names.set(norm(f.name), f.name);
  }
  return [...names.values()];
}

export function summarize(inv, base) {
  const counts = {};
  for (const f of inv.facts) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  const deps = deployablesOf(inv);
  const role = deps.length >= 2
    ? { suggested: 'system', why: `${deps.length} deployáveis (${deps.join(', ')}): o repositório parece ser um sistema com containers` }
    : { suggested: 'service', why: deps.length ? `1 deployável (${deps[0]}): o repositório parece ser um serviço` : 'nenhum deployável identificado' };
  const warnings = [];
  if (!inv.files.graphify) warnings.push('graphify ausente: rode o graphify no repositório para enriquecer componentes, conceitos e fluxos');
  if (counts['graph-stale']) warnings.push('graphify desatualizado: o grafo foi gerado em outro commit; rode o graphify de novo');
  if (inv.repo.dirty) warnings.push('o repositório tem alterações não commitadas; a proveniência aponta para o commit atual');
  if (!inv.repo.commit) warnings.push('pasta fora de git: a proveniência fica sem commit');
  if (counts.unreadable) warnings.push(`${counts.unreadable} arquivo(s) não puderam ser lidos (fatos "unreadable" no inventário)`);
  let existing = null;
  const systems = [];
  if (base) {
    const el = repoElement(base, inv);
    if (el) {
      existing = { id: el.id, name: el.name, by: 'repo', role: el.properties.repoRole ?? null };
      if (el.properties.repoRole === 'service' && deps.length >= 2) warnings.push(`registrado como service, mas o inventário tem ${deps.length} deployáveis: confirme o papel`);
    } else {
      for (const e of base.elements.values()) {
        if (!['softwareSystem', 'container'].includes(c4KindOf(base, e))) continue;
        const score = Math.max(...[e.name, e.id, ...e.aliases].map(n => similarity(inv.repo.name, n)));
        if (score >= 0.6 && (!existing || score > existing.score)) existing = { id: e.id, name: e.name, by: 'name', score: +score.toFixed(2) };
      }
    }
    systems.push(...probableSystems(inv, base));
  }
  return { repo: inv.repo, counts, files: inv.files, role, existing, systems, warnings };
}

function probableSystems(inv, base) {
  const why = new Map();
  const add = (id, reason) => { if (!id) return; if (!why.has(id)) why.set(id, []); if (!why.get(id).includes(reason)) why.get(id).push(reason); };
  const kind = e => c4KindOf(base, e);
  const systemOf = id => [id, ...ancestors(base, id)].find(x => base.elements.get(x) && kind(base.elements.get(x)) === 'softwareSystem');
  const first = aliasKey(inv.repo.name).split(' ')[0];
  for (const e of base.elements.values()) {
    if (kind(e) !== 'softwareSystem') continue;
    if ([e.name, e.id, ...e.aliases].some(n => aliasKey(n).split(' ')[0] === first)) add(e.id, `nome: o repositório começa com «${first}-» (prefixo)`);
  }
  for (const f of inv.facts.filter(f => f.kind === 'channel')) {
    const tid = `topic.${norm(f.name)}`;
    for (const r of base.relationships) {
      const other = r.from === tid ? r.to : r.to === tid ? r.from : null;
      if (other) add(systemOf(other), `tópico ${f.name} ligado a ${other}`);
    }
  }
  for (const f of inv.facts.filter(f => f.kind === 'env-ref')) {
    const hit = [...base.elements.values()].find(e => e.id.endsWith(`.${norm(f.host)}`) || e.aliases.some(a => aliasKey(a) === aliasKey(f.host)));
    if (hit) add(systemOf(hit.id), `chama ${f.host} (${hit.id})`);
  }
  for (const f of inv.facts.filter(f => f.kind === 'domain-concept')) {
    const obj = [...base.elements.values()].find(e => aliasKey(e.name) === aliasKey(f.label));
    if (!obj) continue;
    for (const r of base.relationships) if (r.to === obj.id || r.from === obj.id) add(systemOf(r.to === obj.id ? r.from : r.to), `conceito ${f.label} já modelado (${obj.id})`);
  }
  return [...why].map(([id, reasons]) => ({ id, name: base.elements.get(id).name, why: reasons })).sort((a, b) => b.why.length - a.why.length);
}

export function formatSummary(s) {
  const lines = [`Repositório ${s.repo.name}${s.repo.commit ? ` @ ${s.repo.commit.slice(0, 7)}` : ''}`];
  lines.push(`  arquivos: ${Object.entries(s.files).filter(([k, n]) => n && k !== 'ignored').map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhum reconhecido'}`);
  lines.push(`  fatos: ${Object.entries(s.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhum'}`);
  lines.push(`  papel sugerido: ${s.role.suggested} — ${s.role.why}`);
  if (s.existing) lines.push(`  já na base: ${s.existing.name} (${s.existing.id})${s.existing.by === 'repo' ? `, lido antes como ${s.existing.role}` : `, semelhança de nome ${s.existing.score}`}`);
  for (const x of s.systems) lines.push(`  sistema provável: ${x.name} (${x.id}) — ${x.why.join('; ')}`);
  for (const w of s.warnings) lines.push(`  aviso: ${w}`);
  lines.push('  próximo passo: confirme o papel e rode "archlens scan … --as system|service [--system <id>] [--id <id>] --delta d.json"');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scan-delta.test.mjs && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scan/summary.mjs scripts/lib/scan/to-delta.mjs tests/scan-delta.test.mjs
git commit -m "feat(scan): resumo do inventário com papel sugerido e candidatos na base"
```

---

### Task 6: do inventário ao delta

**Files:**
- Modify: `scripts/lib/scan/to-delta.mjs` (`toDelta`)
- Modify: `scripts/lib/query-archimate.mjs` (`flow` no `via` padrão da visão de impacto)
- Test: `tests/scan-delta.test.mjs`, `tests/query.test.mjs`

**Interfaces:**
- Consumes: `norm`, `repoKey`, `repoElement` (Task 5); `ENGINES`, `tagOf` (Task 1); `aliasKey`.
- Produces: `toDelta(inv, { role: 'system'|'service', system?: string, id?: string, base?: model|null }) → delta`
  (`{ 'archlens-delta': '1.0', source: { kind: 'repo', ref }, summary, model: { elements, relationships }, ops? }`).

- [ ] **Step 1: Write the failing tests** (acrescentar a `tests/scan-delta.test.mjs`)

```js
import { toDelta } from '../scripts/lib/scan/to-delta.mjs';
import { validateModel } from '../scripts/lib/validate.mjs';
import { planMerge, applyPlan } from '../scripts/lib/merge.mjs';
import { resolveView } from '../scripts/lib/query.mjs';

const a = (file, line) => ({ file, line });
const pedidosFacts = [
  { kind: 'service', name: 'pedidos-api', build: 'api', ports: ['8080'], at: a('docker-compose.yml', 3) },
  { kind: 'infra-image', service: 'pedidos-db', engine: 'postgres', category: 'database', version: '16', at: a('docker-compose.yml', 12) },
  { kind: 'depends-on', from: 'pedidos-api', to: 'pedidos-db', at: a('docker-compose.yml', 10) },
  { kind: 'env-ref', from: 'pedidos-api', var: 'PAGAMENTOS_URL', host: 'pagamentos', at: a('docker-compose.yml', 6) },
  { kind: 'api', title: 'API de Pedidos', version: '1.4.0', servers: [], operations: 3, tags: [], at: a('api/openapi.yaml', 3) },
  { kind: 'channel', name: 'pedido-criado', action: 'publish', message: 'PedidoCriado', at: a('api/asyncapi.yaml', 4) },
];
const el = (d, id) => d.model.elements.find(e => e.id === id);
const rel = (d, from, to) => d.model.relationships.find(r => r.from === from && r.to === to);
const applyNew = (delta, base = null) => {
  const plan = planMerge(base, delta);
  for (const it of plan.items) if (it.resolution == null) it.resolution = it.class === 'possible-duplicate' ? 'different' : it.class === 'conflict' ? 'take' : 'yes';
  return applyPlan(base, plan).raw;
};

test('service role: the repo is one container in the given system; infra, api and topic around it', () => {
  const d = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  assert.equal(d['archlens-delta'], '1.0');
  assert.deepEqual(d.source, { kind: 'repo', ref: '/r/pedidos@abcdef1' });
  const own = el(d, 'loja.pedidos');
  assert.deepEqual([own.type, own.parent, own.properties], ['c4:container', 'loja', { repo: '/r/pedidos', repoRole: 'service' }]);
  assert.deepEqual(el(d, 'loja.pedidos-pedidos-db').tags, ['database']);
  assert.deepEqual([el(d, 'tech.postgres-16').type, el(d, 'tech.postgres-16').name], ['archimate:system-software', 'PostgreSQL 16']);
  assert.equal(rel(d, 'tech.postgres-16', 'loja.pedidos-pedidos-db').type, 'archimate:realization');
  assert.equal(rel(d, 'loja.pedidos', 'loja.pedidos-pedidos-db').type, 'uses');
  assert.equal(rel(d, 'loja.pedidos', 'loja.pedidos.api-api-de-pedidos').type, 'archimate:realization');
  assert.equal(rel(d, 'loja.pedidos', 'topic.pedido-criado').type, 'archimate:flow', 'publishing is a flow to the topic');
  const ext = el(d, 'ext.pagamentos');
  assert.deepEqual([ext.external, ext.inferred, ext.confidence], [true, true, 'baixa']);
  const r = rel(d, 'loja.pedidos', 'ext.pagamentos');
  assert.deepEqual([r.type, r.inferred, r.description], ['uses', true, 'via PAGAMENTOS_URL']);
  assert.deepEqual(own.sources[0], { kind: 'repo', ref: '/r/pedidos@abcdef1', path: '.', line: 1 });
  assert.deepEqual(el(d, 'loja.pedidos-pedidos-db').sources[0], { kind: 'repo', ref: '/r/pedidos@abcdef1', path: 'docker-compose.yml', line: 12 });
  assert.ok(!('inferred' in own) && !('inferred' in el(d, 'loja.pedidos-pedidos-db')), 'manifest facts are not inferred');
  assert.deepEqual(validateModel(applyNew(d)).errors, []);
});

test('system role: deployables are containers, libraries become components of their main user, graphify flows and concepts', () => {
  const facts = [
    { kind: 'module', name: 'app', executable: true, at: a('settings.gradle.kts', 1) },
    { kind: 'module', name: 'domain', executable: false, at: a('settings.gradle.kts', 1) },
    { kind: 'module', name: 'wear', executable: true, at: a('settings.gradle.kts', 1) },
    { kind: 'module-dep', from: 'app', to: 'domain', count: 312, at: a('graphify-out/graph.json', 1) },
    { kind: 'module-dep', from: 'wear', to: 'domain', count: 20, at: a('graphify-out/graph.json', 1) },
    { kind: 'module-dep', from: 'wear', to: 'app', count: 11, at: a('graphify-out/graph.json', 1) },
    { kind: 'flow', label: 'Registrar dose tomada', participants: ['app', 'domain'], confidence: 'média', at: a('docs/spec.md', 1) },
    { kind: 'domain-concept', label: 'Treatment', module: 'domain', degree: 129, at: a('domain/src/Treatment.kt', 10) },
  ];
  const d = toDelta(inv(facts, { path: '/r/medi', name: 'medi-reminder-app' }), { role: 'system' });
  assert.deepEqual([el(d, 'medi-reminder-app').type, el(d, 'medi-reminder-app').properties.repoRole], ['c4:softwareSystem', 'system']);
  assert.equal(el(d, 'medi-reminder-app.app').type, 'c4:container');
  const lib = el(d, 'medi-reminder-app.app.domain');
  assert.deepEqual([lib.type, lib.parent, lib.inferred], ['c4:component', 'medi-reminder-app.app', true]);
  assert.equal(rel(d, 'medi-reminder-app.wear', 'medi-reminder-app.app').description, '11 referência(s) no código');
  assert.ok(rel(d, 'medi-reminder-app.wear', 'medi-reminder-app.app.domain'));
  assert.ok(!rel(d, 'medi-reminder-app.app', 'medi-reminder-app.app.domain'), 'no uses from a container to its own component');
  const proc = el(d, 'proc.registrar-dose-tomada');
  assert.deepEqual([proc.type, proc.inferred, proc.confidence], ['archimate:business-process', true, 'média']);
  assert.equal(rel(d, 'medi-reminder-app.app', 'proc.registrar-dose-tomada').type, 'archimate:serving');
  assert.equal(el(d, 'obj.treatment').type, 'archimate:business-object');
  assert.equal(rel(d, 'medi-reminder-app.app.domain', 'obj.treatment').type, 'archimate:access');
  assert.deepEqual(validateModel(applyNew(d)).errors, []);
});

test('a known module of the base is enriched, never recreated (terminus.assignment)', () => {
  const base = terminus();
  const d = toDelta(inv([{ kind: 'service', name: 'api', build: '.', ports: [], at: a('compose.yml', 2) }]), { role: 'service', system: 'terminus', id: 'terminus.assignment', base });
  const own = el(d, 'terminus.assignment');
  assert.ok(!('name' in own) && !('type' in own) && !('parent' in own), 'existing element: only id + enrichment');
  assert.equal(own.properties.repoRole, 'service');
  const sys = el(d, 'terminus');
  assert.ok(!('name' in sys) && !('type' in sys), 'the existing system goes out only with the provenance');
});

test('re-reading: what vanished from this repo becomes a retired question; other sources are untouched', () => {
  const first = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  const raw = applyNew(first);
  raw.model.elements.push({ id: 'loja.manual', type: 'c4:container', name: 'Manual', parent: 'loja', sources: [{ kind: 'prompt', ref: 'r1' }] });
  const base = normalizeModel(raw);
  const without = pedidosFacts.filter(f => f.kind !== 'api');
  const second = toDelta(inv(without, { path: '/r/pedidos', name: 'pedidos', commit: 'fffffff999' }), { role: 'service', system: 'loja', base });
  const ops = second.ops ?? [];
  assert.deepEqual(ops.map(o => [o.op, o.id, o.status]), [['status', 'loja.pedidos.api-api-de-pedidos', 'retired']]);
  assert.match(ops[0].reason, /não encontrado em \/r\/pedidos@fffffff/);
  const same = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja', base: normalizeModel(applyNew(first)) });
  assert.equal(same.ops, undefined);
  assert.deepEqual(Object.keys(planMerge(applyNew(first), same).summary), ['unchanged'], 'same commit, nothing changes');
});

test('an empty repository gives only the repository element', () => {
  const d = toDelta(inv([], { path: '/r/vazio', name: 'vazio' }), { role: 'service', system: 'loja' });
  assert.deepEqual(d.model.elements.map(e => e.id).sort(), ['loja', 'loja.vazio']);
});

test('producer and consumer repos are linked by the topic; the producer impact reaches the consumer', () => {
  const prod = toDelta(inv(pedidosFacts, { path: '/r/pedidos', name: 'pedidos' }), { role: 'service', system: 'loja' });
  let raw = applyNew(prod);
  const cons = toDelta(inv([{ kind: 'workload', kindK8s: 'Deployment', name: 'pagamentos', at: a('k8s/deploy.yaml', 8) },
    { kind: 'channel', name: 'pedido-criado', action: 'subscribe', at: a('asyncapi.json', 1) }], { path: '/r/pagamentos', name: 'pagamentos' }),
  { role: 'service', system: 'financeiro', base: normalizeModel(raw) });
  raw = applyNew(cons, raw);
  const m = normalizeModel(raw);
  assert.ok(m.relationships.some(r => r.from === 'topic.pedido-criado' && r.to === 'financeiro.pagamentos' && r.type === 'flow'));
  const impact = resolveView(m, { key: 'i', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.pedidos' });
  assert.ok(impact.nodes.some(n => n.id === 'financeiro.pagamentos'), 'consumer appears as dependent of the producer');
});
```

Em `tests/query.test.mjs`, acrescente:

```js
test('the impact viewpoint follows flow by default; other viewpoints do not', () => {
  const r = JSON.parse(readFileSync(new URL('./fixtures/shop.json', import.meta.url)));
  r.model.elements.push({ id: 'topic.x', type: 'c4:container', name: 'x', tags: ['topic'] }, { id: 'consumidor', type: 'c4:softwareSystem', name: 'Consumidor' });
  r.model.relationships.push({ from: 'loja.api', to: 'topic.x', type: 'archimate:flow' }, { from: 'topic.x', to: 'consumidor', type: 'archimate:flow' });
  const m = normalizeModel(r);
  assert.ok(resolveView(m, { key: 'i', notation: 'archimate', viewpoint: 'impact', anchor: 'loja.api' }).nodes.some(n => n.id === 'consumidor'));
  assert.ok(!resolveView(m, { key: 'l', notation: 'archimate', viewpoint: 'layered', anchor: 'loja.api', traverse: { mode: 'dependents' } }).nodes.some(n => n.id === 'consumidor'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scan-delta.test.mjs tests/query.test.mjs` — Expected: FAIL (`toDelta` inexistente; impacto sem `flow`).

- [ ] **Step 3: Implement**

`scripts/lib/query-archimate.mjs`: onde o `via` é montado,
`const via = new Set(spec.traverse?.via ?? (viewpoint === 'impact' ? [...DEFAULT_VIA, 'flow'] : DEFAULT_VIA));`

`scripts/lib/scan/to-delta.mjs`, acrescente os imports `import { ENGINES, tagOf } from './infra.mjs';` e
`import { aliasKey } from '../match.mjs';` e:

```js
const DEFAULT_ROOT_AT = { file: '.', line: 1 };

export function toDelta(inv, { role, system, id, base = null } = {}) {
  const key = repoKey(inv.repo);
  const ref = `${key}@${(inv.repo.commit ?? 'sem-commit').slice(0, 7)}`;
  const facts = inv.facts;
  const inBase = x => !!base?.elements.has(x);
  const elements = new Map();
  const rels = [];
  const relSeen = new Set();
  const src = (at, excerpt) => ({ kind: 'repo', ref, path: at.file, line: at.line, ...(excerpt ? { excerpt } : {}) });
  // Elements already in the base: only id + enrichment (no name/type/parent, so no false conflicts).
  const put = (el, at, excerpt) => {
    const s = src(at, excerpt);
    const cur = elements.get(el.id);
    if (cur) {
      if (!cur.sources.some(x => x.path === s.path && x.line === s.line)) cur.sources.push(s);
      return el.id;
    }
    const body = inBase(el.id) ? Object.fromEntries(Object.entries(el).filter(([k]) => !['name', 'type', 'parent'].includes(k))) : el;
    elements.set(el.id, { ...body, sources: [s] });
    return el.id;
  };
  const link = (from, to, type, at, { excerpt, ...extra } = {}) => {
    if (!from || !to || from === to) return;
    if (elements.get(to)?.parent === from || base?.elements.get(to)?.parent === from) return; // container → own component
    const k = `${from}|${type}|${to}`;
    if (relSeen.has(k)) return;
    relSeen.add(k);
    rels.push({ from, to, type, ...extra, sources: [src(at, excerpt)] });
  };
  const childId = (parent, name) => {
    const k = aliasKey(name);
    const hit = base && [...base.elements.values()].find(e => e.parent === parent
      && (aliasKey(e.name) === k || e.aliases.some(x => aliasKey(x) === k) || e.id === `${parent}.${norm(name)}`));
    return hit?.id ?? `${parent}.${norm(name)}`;
  };
  const existing = repoElement(base, inv);

  // the repository: a system (role system) or one container of a system (role service)
  let sysId, ownId = null;
  if (role === 'system') {
    sysId = id ?? existing?.id ?? norm(inv.repo.name);
    put({ id: sysId, type: 'c4:softwareSystem', name: inv.repo.name, properties: { repo: key, repoRole: 'system' } }, DEFAULT_ROOT_AT);
  } else {
    sysId = system;
    // always part of this reading (for an existing system only the provenance goes out), so it is never "vanished"
    put({ id: sysId, type: 'c4:softwareSystem', name: sysId }, DEFAULT_ROOT_AT);
    ownId = id ?? existing?.id ?? `${sysId}.${norm(inv.repo.name)}`;
    put({ id: ownId, type: 'c4:container', parent: sysId, name: inv.repo.name, properties: { repo: key, repoRole: 'service' } }, DEFAULT_ROOT_AT);
  }

  // modules (graphify and build facts merged by name)
  const modules = new Map();
  for (const f of facts.filter(x => x.kind === 'module')) {
    const m = modules.get(f.name);
    modules.set(f.name, { name: f.name, executable: !!(m?.executable || f.executable), at: m?.at ?? f.at });
  }
  const modDeps = facts.filter(x => x.kind === 'module-dep');

  // deployables (role system): compose services, k8s/helm workloads, executable modules — merged by name
  const deploy = new Map();
  if (role === 'system') {
    for (const f of facts.filter(x => x.kind === 'service' || x.kind === 'workload')) {
      const k = norm(f.name);
      if (!deploy.has(k)) deploy.set(k, { name: f.name, dir: f.build ?? null, at: f.at, technology: f.image });
    }
    for (const m of modules.values()) {
      if (!m.executable) continue;
      const d = deploy.get(norm(m.name));
      if (d) d.dir ??= m.name; else deploy.set(norm(m.name), { name: m.name, dir: m.name, at: m.at });
    }
    for (const d of deploy.values()) {
      d.id = childId(sysId, d.name);
      put({ id: d.id, type: 'c4:container', parent: sysId, name: d.name, ...(d.technology ? { technology: d.technology } : {}) }, d.at);
    }
  }
  const deployables = [...deploy.values()];
  const ownerOf = file => {
    if (role === 'service') return ownId;
    const hit = deployables.filter(d => d.dir != null && (d.dir === '' || file === d.dir || file.startsWith(`${d.dir}/`))).sort((x, y) => y.dir.length - x.dir.length)[0];
    return hit?.id ?? (deployables.length === 1 ? deployables[0].id : sysId);
  };
  const deployId = name => deploy.get(norm(name))?.id;

  // modules → elements
  const modEl = new Map();
  for (const m of modules.values()) {
    if (role === 'service') {
      const mid = `${ownId}.${norm(m.name)}`;
      put({ id: mid, type: 'c4:component', parent: ownId, name: m.name }, m.at);
      modEl.set(m.name, mid);
    } else if (m.executable) {
      modEl.set(m.name, deployId(m.name));
    } else {
      const users = modDeps.filter(d => d.to === m.name && modules.get(d.from)?.executable).sort((x, y) => y.count - x.count);
      if (users.length) {
        const parent = deployId(users[0].from);
        const mid = `${parent}.${norm(m.name)}`;
        put({ id: mid, type: 'c4:component', parent, name: m.name, inferred: true, confidence: 'média' }, m.at, `usado sobretudo por ${users[0].from}`);
        modEl.set(m.name, mid);
      } else {
        const mid = childId(sysId, m.name);
        put({ id: mid, type: 'c4:container', parent: sysId, name: m.name, tags: ['library'] }, m.at);
        modEl.set(m.name, mid);
      }
    }
  }
  for (const d of modDeps) link(modEl.get(d.from), modEl.get(d.to), 'uses', d.at, { description: `${d.count} referência(s) no código` });

  // infrastructure: compose/k8s/helm engines and Terraform resources
  const infra = new Map();
  const infraIdOf = name => (role === 'service' ? `${ownId}-${norm(name)}` : childId(sysId, name));
  const engine = (eng, version, at) => {
    const label = ENGINES.find(e => e.engine === eng)?.label ?? eng;
    return put({ id: `tech.${norm(eng)}${version ? `-${norm(version)}` : ''}`, type: 'archimate:system-software', name: version ? `${label} ${version}` : label }, at);
  };
  for (const f of facts.filter(x => x.kind === 'infra-image')) {
    const iid = put({ id: infraIdOf(f.service), type: 'c4:container', parent: sysId, name: f.service, tags: [tagOf(f.category)] }, f.at);
    infra.set(f.service, iid);
    link(engine(f.engine, f.version, f.at), iid, f.category === 'database' ? 'archimate:realization' : 'archimate:serving', f.at);
  }
  for (const f of facts.filter(x => x.kind === 'cloud-resource')) {
    const rk = `${f.type}.${f.name}`;
    if (f.category === 'cluster') {
      const nid = put({ id: `tech.${norm(f.type)}-${norm(f.name)}`, type: 'archimate:node', name: f.name, technology: f.type }, f.at);
      infra.set(rk, nid);
      for (const d of deployables) link(nid, d.id, 'archimate:serving', f.at);
      if (ownId) link(nid, ownId, 'archimate:serving', f.at);
      continue;
    }
    infra.set(rk, put({ id: infraIdOf(f.name), type: 'c4:container', parent: sysId, name: f.name, technology: f.type, tags: [tagOf(f.category)] }, f.at));
  }
  const cloud = new Map(facts.filter(x => x.kind === 'cloud-resource').map(f => [`${f.type}.${f.name}`, f]));
  for (const f of facts.filter(x => x.kind === 'tf-ref')) {
    if (cloud.get(f.from)?.category === 'database') continue; // serving cannot target a data object
    link(infra.get(f.to), infra.get(f.from), 'archimate:serving', f.at);
  }

  // relations between what runs: depends_on and hosts in configuration
  const runId = name => deployId(name) ?? infra.get(name) ?? (role === 'service' ? ownId : null);
  const baseHost = host => {
    if (!base) return null;
    const k = aliasKey(host);
    return [...base.elements.values()].find(e => e.id === norm(host) || e.id.endsWith(`.${norm(host)}`) || e.aliases.some(x => aliasKey(x) === k))?.id ?? null;
  };
  for (const f of facts.filter(x => x.kind === 'depends-on')) link(runId(f.from), runId(f.to), 'uses', f.at, { description: 'depends_on' });
  for (const f of facts.filter(x => x.kind === 'env-ref')) {
    const from = runId(f.from);
    if (!from) continue;
    let to = deployId(f.host) ?? infra.get(f.host) ?? baseHost(f.host);
    if (!to) to = put({ id: `ext.${norm(f.host)}`, type: 'c4:softwareSystem', name: f.host, external: true, inferred: true, confidence: 'baixa' }, f.at, `host em ${f.var}`);
    link(from, to, 'uses', f.at, { description: `via ${f.var}`, inferred: true, excerpt: `${f.var} → ${f.host}` });
  }

  // contracts: APIs (interfaces) and channels (topics)
  for (const f of facts.filter(x => x.kind === 'api')) {
    const owner = ownerOf(f.at.file);
    const aid = put({ id: `${owner}.api-${norm(f.title)}`, type: 'archimate:application-interface', name: f.title,
      properties: { version: f.version, operations: f.operations } }, f.at);
    link(owner, aid, 'archimate:realization', f.at);
  }
  for (const f of facts.filter(x => x.kind === 'channel')) {
    const tid = put({ id: `topic.${norm(f.name)}`, type: 'c4:container', name: f.name, tags: ['topic'] }, f.at);
    const owner = ownerOf(f.at.file);
    if (f.action === 'publish') link(owner, tid, 'archimate:flow', f.at, { description: `publica ${f.message ?? f.name}` });
    else link(tid, owner, 'archimate:flow', f.at, { description: `assina ${f.message ?? f.name}` });
  }

  // graphify: business flows and domain concepts (deductions)
  for (const f of facts.filter(x => x.kind === 'flow')) {
    const pid = put({ id: `proc.${norm(f.label).slice(0, 60)}`, type: 'archimate:business-process', name: f.label, inferred: true, confidence: f.confidence }, f.at);
    const parts = [...new Set(f.participants.map(m => modEl.get(m)).filter(Boolean))];
    for (const p of parts.length ? parts : [ownId ?? sysId]) link(p, pid, 'archimate:serving', f.at);
  }
  for (const f of facts.filter(x => x.kind === 'domain-concept')) {
    const data = /data|infra|persist/i.test(f.module ?? '');
    const oid = put({ id: `obj.${norm(f.label)}`, type: data ? 'archimate:data-object' : 'archimate:business-object', name: f.label, inferred: true, confidence: 'média' }, f.at);
    link(modEl.get(f.module) ?? ownId ?? sysId, oid, 'archimate:access', f.at);
  }

  // what vanished: base elements whose only sources are this repository and that this reading did not produce
  const ops = [];
  if (base) {
    for (const e of base.elements.values()) {
      if (elements.has(e.id) || e.status === 'retired' || !e.sources.length) continue;
      if (e.sources.every(s => s.kind === 'repo' && String(s.ref ?? '').startsWith(`${key}@`))) {
        ops.push({ op: 'status', id: e.id, status: 'retired', reason: `não encontrado em ${ref}` });
      }
    }
  }
  return {
    'archlens-delta': '1.0',
    source: { kind: 'repo', ref },
    summary: `Leitura de ${inv.repo.name}${inv.repo.commit ? `@${inv.repo.commit.slice(0, 7)}` : ''}`,
    model: { elements: [...elements.values()], relationships: rels },
    ...(ops.length ? { ops } : {}),
  };
}
```

Se `validateModel` acusar alguma combinação (o teste "service role" e o "system role" aplicam o delta e validam),
ajuste o tipo da relação para a forma válida do ArchiMate e registre no relatório — não remova a relação.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scan-delta.test.mjs tests/query.test.mjs && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/scan/to-delta.mjs scripts/lib/query-archimate.mjs tests/scan-delta.test.mjs tests/query.test.mjs
git commit -m "feat(scan): delta a partir do inventário (papéis, ids, proveniência, tópicos, retired); impacto segue flow"
```

---

### Task 7: comando `archlens scan`

**Files:**
- Modify: `scripts/archlens.mjs` (import de `scanSource`, `summarize`, `formatSummary`, `toDelta`; caso `scan`; ajuda)
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `scanSource` (Task 1), `summarize`/`formatSummary` (Task 5), `toDelta` (Task 6), `resolveBase`/`openStore`, `normalizeModel`.
- Produces: `archlens scan <pasta|url> [--ref] [--base] [--out] [--json] [--helm-render]` e
  `archlens scan … --as system|service [--system] [--id] --delta d.json [--from inventario.json]`.

- [ ] **Step 1: Write the failing tests** (acrescentar a `tests/cli.test.mjs`; reaproveite `run`, `mkdtempSync`, etc.)

```js
import { cpSync } from 'node:fs';
import { spawnSync as sp } from 'node:child_process';

const repoCopy = name => {
  const dir = mkdtempSync(join(tmpdir(), `archlens-${name}-`));
  cpSync(fileURLToPath(new URL(`./fixtures/repos/${name}/`, import.meta.url)), dir, { recursive: true });
  const g = (...a) => sp('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'init.defaultBranch=main', ...a], { cwd: dir });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'init');
  return dir;
};

test('scan without --as prints the summary (text and pure --json) and writes the inventory with --out', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const r = run(['scan', repo, '--base', 'architecture', '--out', 'inv.json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /papel sugerido: service/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'inv.json'), 'utf8'))['archlens-inventory'], '1.0');
  const j = run(['scan', repo, '--base', 'architecture', '--json'], dir);
  assert.equal(JSON.parse(j.stdout).role.suggested, 'service');
});

test('scan --delta needs a role; service needs an existing system; nothing is written on error', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const noRole = run(['scan', repo, '--base', 'architecture', '--delta', 'd.json'], dir);
  assert.equal(noRole.status, 1);
  assert.match(noRole.stderr, /E_SCAN_ROLE/);
  const noSys = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--delta', 'd.json'], dir);
  assert.match(noSys.stderr, /E_SCAN_ROLE/);
  const badSys = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'nada', '--delta', 'd.json'], dir);
  assert.equal(badSys.status, 1);
  assert.match(badSys.stderr, /E_SCAN_TARGET/);
  assert.ok(!existsSync(join(dir, 'd.json')));
});

test('scan → merge → apply on a base; reading the same commit again changes nothing', () => {
  const repo = repoCopy('pedidos');
  const dir = setup();
  const s = run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja', '--delta', 'd.json'], dir);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(run(['merge', 'architecture', 'd.json', '--plan', 'p.json'], dir).status, 0);
  const plan = JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8'));
  for (const it of plan.items) if (it.resolution == null) it.resolution = it.class === 'possible-duplicate' ? 'different' : 'take';
  writeFileSync(join(dir, 'p.json'), JSON.stringify(plan));
  assert.equal(run(['merge', 'architecture', '--apply', 'p.json'], dir).status, 0);
  assert.equal(run(['check'], dir).status, 0);
  run(['scan', repo, '--base', 'architecture', '--as', 'service', '--system', 'loja', '--delta', 'd2.json'], dir);
  const again = run(['merge', 'architecture', 'd2.json', '--plan', 'p2.json', '--json'], dir);
  assert.deepEqual(Object.keys(JSON.parse(again.stdout).summary), ['unchanged']);
});

test('scan reads a git url (file://) and --from reuses an inventory; no base found → warning', () => {
  const repo = repoCopy('pedidos');
  const empty = mkdtempSync(join(tmpdir(), 'archlens-'));
  const r = run(['scan', `file://${repo}`, '--out', 'inv.json', '--as', 'service', '--system', 'loja', '--delta', 'd.json'], empty);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /nenhuma base encontrada/);
  const d = JSON.parse(readFileSync(join(empty, 'd.json'), 'utf8'));
  assert.equal(d.source.ref.startsWith(`file://${repo}@`), true);
  const again = run(['scan', '--from', 'inv.json', '--as', 'service', '--system', 'loja', '--delta', 'd2.json'], empty);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(empty, 'd2.json'), 'utf8')), d);
  const bad = run(['scan', '/nao/existe'], empty);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /E_SCAN_SOURCE/);
});
```

(O `setup()` existente cria `architecture/` com o fixture `shop.json`, cujo sistema `loja` existe.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli.test.mjs` — Expected: FAIL (`comando desconhecido "scan"`).

- [ ] **Step 3: Implement**

Em `scripts/archlens.mjs`, imports:

```js
import { scanSource } from './lib/scan/index.mjs';
import { summarize, formatSummary } from './lib/scan/summary.mjs';
import { toDelta } from './lib/scan/to-delta.mjs';
```

Novo caso no `switch` (`scan` não entra em `BASE_CMDS`; ele abre a base sozinho):

```js
    case 'scan': {
      const usage = 'uso: archlens scan <pasta|url-git> [--ref r] [--base b] [--out inventario.json] [--json]\n'
        + '      archlens scan <pasta|url-git> --as system|service [--system <id>] [--id <id>] --delta d.json [--from inventario.json]';
      const val = k => (args[k] && args[k] !== true ? args[k] : undefined);
      if (!file && !val('from')) fail(usage);
      let base = null;
      try {
        const loaded = openStore(resolveBase(val('base'))).load();
        base = loaded.raw ? normalizeModel(loaded.raw) : null;
      } catch (e) {
        if (val('base')) fail(e.message);
        console.warn('  aviso: nenhuma base encontrada; o delta será para uma base nova. Use --base para apontar a base existente.');
      }
      if (args.delta) {
        const role = val('as');
        if (!['system', 'service'].includes(role)) fail('E_SCAN_ROLE: informe o papel do repositório com --as system|service (rode sem --delta para ver a sugestão)');
        if (role === 'service' && !val('system')) fail('E_SCAN_ROLE: com --as service, informe o sistema com --system <id>');
        const kindOf = x => (base?.elements.get(x) ? c4KindOf(base, base.elements.get(x)) : null);
        if (base && role === 'service' && !base.elements.has(val('system'))) fail(`E_SCAN_TARGET: o sistema "${val('system')}" não existe na base`);
        if (base && val('system') && base.elements.has(val('system')) && kindOf(val('system')) !== 'softwareSystem') fail(`E_SCAN_TARGET: "${val('system')}" não é um software system`);
        if (base && val('id') && base.elements.has(val('id')) && kindOf(val('id')) !== (role === 'system' ? 'softwareSystem' : 'container')) {
          fail(`E_SCAN_TARGET: "${val('id')}" na base não é um ${role === 'system' ? 'software system' : 'container'}`);
        }
      }
      let inv;
      try { inv = val('from') ? readJson(val('from')) : scanSource(file, { ref: val('ref'), helmRender: !!args['helm-render'] }); } catch (e) { fail(e.message); }
      if (val('out')) atomicWrite(val('out'), JSON.stringify(inv, null, 2) + '\n');
      if (!args.delta) {
        const s = summarize(inv, base);
        console.log(args.json ? JSON.stringify(s, null, 2) : formatSummary(s));
        break;
      }
      if (args.delta === true) fail(usage);
      const delta = toDelta(inv, { role: val('as'), system: val('system'), id: val('id'), base });
      atomicWrite(args.delta, JSON.stringify(delta, null, 2) + '\n');
      console.log(`✓ delta em ${args.delta}: ${delta.model.elements.length} elemento(s), ${delta.model.relationships.length} relação(ões)${delta.ops ? `, ${delta.ops.length} sugestão(ões) de retired para confirmar` : ''}`);
      console.log(`  próximo passo: archlens merge <base> ${args.delta} --plan plano.json`);
      break;
    }
```

(Importe `c4KindOf` de `./lib/model.mjs` se ainda não estiver importado.) Na `HELP`, em Comandos:

```
  scan      <pasta|url> [--base b] [--out inv.json] [--json]   lê um repositório: inventário e papel sugerido
            <pasta|url> --as system|service [--system id] [--id id] --delta d.json [--from inv.json]   monta o delta
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cli.test.mjs && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/archlens.mjs tests/cli.test.mjs
git commit -m "feat(cli): archlens scan (resumo, inventário, delta, URL git, --from)"
```

---

### Task 8: exemplo, skill e documentação

**Files:**
- Create: `examples/repos/pedidos/**`, `examples/repos/pagamentos/**`, `examples/repos/infra/**` (cópias das fixtures de teste correspondentes, mais um `README.md` curto em cada)
- Create (via CLI): `examples/repos/architecture/**`, `examples/repos/ARCHITECTURE.md`, `examples/repos/*.json` (deltas e planos)
- Create: `references/repo-reading.md`; Modify: `SKILL.md`, `references/merge.md`, `docs/GUIA.md`, `README.md`
- Test: `tests/examples.test.mjs` (o exemplo novo entra no laço existente)

**Interfaces:**
- Consumes: tudo das Tasks 1–7 pela CLI.

- [ ] **Step 1: Build the example through the real flow**

Copie `tests/fixtures/repos/{pedidos,pagamentos,infra}` para `examples/repos/` (sem `node_modules`). Para cada um, rode a
partir de `examples/repos/` (a base nova nasce em `examples/repos/architecture/`):

```bash
cd examples/repos
node ../../scripts/archlens.mjs scan pedidos --base architecture --as service --system loja --delta delta-pedidos.json
node ../../scripts/archlens.mjs merge ARCHITECTURE.md delta-pedidos.json --plan plano-pedidos.json
# responder as perguntas do plano (se houver) e aplicar
node ../../scripts/archlens.mjs merge ARCHITECTURE.md --apply plano-pedidos.json
node ../../scripts/archlens.mjs scan pagamentos --base architecture --as service --system financeiro --delta delta-pagamentos.json
# … plano e apply
node ../../scripts/archlens.mjs scan infra --base architecture --as system --id infra-cloud --delta delta-infra.json
# … plano e apply
```

(Como as pastas estão dentro do repositório do archlens, o commit registrado é o do próprio archlens; está ok para o
exemplo — registre isso no `README.md` do exemplo.) Acrescente por delta uma visão salva
`{ "key": "impacto-pedidos", "notation": "archimate", "viewpoint": "impact", "anchor": "loja.pedidos", "title": "Impacto de Pedidos" }`
e rode `node ../../scripts/archlens.mjs build architecture` e `… check architecture`. Confira que a visão de impacto mostra
`financeiro.pagamentos`.

Acrescente `'repos'` à lista de exemplos de `tests/examples.test.mjs` e ao script `examples` do `package.json`.

- [ ] **Step 2: Write `references/repo-reading.md`**

Seções, em português, curtas e diretas:
1. **Quando usar e o fluxo** (`scan --base` → resumo → perguntar papel e sistema com a sugestão e os motivos →
   `scan --delta` → refinar nomes de negócio → merge).
2. **Fontes lidas e fatos** (a tabela do spec, seção 1), com a nota sobre AsyncAPI 2.x (`subscribe` = a aplicação envia).
3. **Papel do repositório** (microsserviço → serviço; monolito/monolito modular → sistema; sempre perguntado; registrado
   em `properties.repo`/`repoRole`).
4. **Mapeamento** (system e service, como no spec, seção 2), com a decisão: publicar = `flow` produtor → tópico.
5. **Ids, proveniência e confiança** (formato dos ids; `sources` com `ref`, `path`, `line`; o que é `inferred`).
6. **Correlação entre repositórios e visão de impacto** (tópicos globais; hosts; o impacto segue `flow`).
7. **Nova leitura** (atualiza; o que sumiu vira pergunta de `retired`; outras fontes intocadas).
8. **Graphify** (o que é aproveitado: módulos, dependências, fluxos, conceitos; comunidades só no relatório; grafo
   desatualizado; como rodar o graphify no repositório).
9. **Limites** (HCL parcial; templates Helm só com `--helm-render` e `helm` instalado; monorepo com vários sistemas: uma
   leitura por pasta; credenciais vêm do git do usuário).

- [ ] **Step 3: Update the skill and the docs**

`SKILL.md`, passo 3 do Fluxo, acrescente o item:

```
   - **repositório (pasta ou URL git)**: `archlens scan <repo> --base <base>` e mostre o resumo; pergunte o papel
     (sistema ou serviço) e o sistema, comentando a sugestão e os motivos — **nunca assuma pelo nome**; depois
     `archlens scan <repo> --base <base> --as system|service [--system <id>] [--id <id>] --delta d.json`; troque nomes
     técnicos por nomes de negócio (técnicos em `aliases`) e siga para o plano. Sem graphify, sugira rodá-lo no
     repositório. Detalhes em `references/repo-reading.md`.
```

Em "Erros comuns": "**Assumir o sistema pelo nome do repositório**: `terminus-*` é só um indício; pergunte." e
"**Aplicar sem olhar os `retired` sugeridos** por uma nova leitura: confirme um a um." Na lista de Referências,
acrescente `references/repo-reading.md`.

`references/merge.md`: fonte `repo` (`ref` com commit, `path`, `line`); itens `retired` vindos de nova leitura entram como
`ops` e pedem confirmação.

`docs/GUIA.md`: parágrafo "Ler repositórios" com o exemplo do `terminus-assignment-api` (resumo → pergunta → delta →
merge) e o exemplo `examples/repos`.

`README.md`: no item das funcionalidades, "Lê repositórios (compose, k8s/Helm, Terraform, OpenAPI/AsyncAPI, graphify)
e gera deltas com proveniência".

- [ ] **Step 4: Run everything**

Run: `npm test && node scripts/archlens.mjs check examples/loja-online/architecture && node scripts/archlens.mjs check examples/telemedicina/architecture && node scripts/archlens.mjs check examples/repos/architecture`
Expected: PASS e três `✓`.

- [ ] **Step 5: Commit**

```bash
git add -A examples/repos tests/examples.test.mjs package.json SKILL.md references docs/GUIA.md README.md
git commit -m "docs: leitura de repositórios na skill, referência nova e exemplo examples/repos"
```
