# Lançadores do archlens (bin/archlens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um comando `archlens` (sh para Linux, macOS e Git Bash; `.cmd` para Windows) que acha o Node e roda a CLI,
para ninguém (pessoa ou skill) precisar digitar `node scripts/archlens.mjs`.

**Architecture:** Dois lançadores em `bin/`, sem lógica do archlens: resolvem a pasta do repositório (seguindo links
simbólicos), escolhem o Node (`ARCHLENS_NODE` ou o do PATH), conferem a versão mínima e repassam argumentos, entrada,
saída e código de saída para `scripts/archlens.mjs`. As skills, as referências e a documentação passam a usar o lançador.
O núcleo não muda.

**Tech Stack:** POSIX sh, cmd.exe, Node ≥ 18 (`node:test` para os testes).

**Spec:** decisão da conversa de 2026-11-03 — alternativa 3 da avaliação de empacotamento ("lançadores no repositório"),
escolhida "por ora". A alternativa 4 (zip com Node embutido em `runtime/`) fica para depois e só acrescentará um candidato
à busca do Node; este plano não a implementa.

## Global Constraints

- **O núcleo não muda:** nada em `scripts/lib/`, nos formatos ou no comportamento dos comandos. Só muda o texto de uso
  do `help` (Task 3).
- **Node mínimo: 18** (o mesmo de `engines` no `package.json`).
- **Ordem da busca do Node:** 1) `ARCHLENS_NODE` (caminho de um executável), 2) `node` no `PATH`. Nada mais.
- **Mensagens em português**, no stderr, prefixadas com `archlens: ` (como o `fail()` da CLI):
  - sem Node: `archlens: Node.js não encontrado. Instale o Node 18 ou mais novo (https://nodejs.org) ou aponte ARCHLENS_NODE para o executável.` — código de saída **127**;
  - `ARCHLENS_NODE` inválido: `archlens: ARCHLENS_NODE não aponta para um executável: <valor>` — código **127**;
  - Node antigo: `archlens: o archlens precisa do Node 18 ou mais novo (encontrado: <versão>, em <caminho>).` — código **1**.
- **Repasse fiel:** todos os argumentos (com espaços e aspas), stdin/stdout/stderr e o código de saída do Node. No sh,
  `exec` (os sinais chegam direto ao Node, então o Ctrl+C do `serve` continua funcionando).
- **Fins de linha** fixados por `.gitattributes`: `bin/archlens` sempre LF; `bin/*.cmd` sempre CRLF. `bin/archlens` é
  versionado executável (modo `100755`).
- **`package.json` `"bin"` continua apontando para `scripts/archlens.mjs`:** o `cmd-shim` do npm no Windows lê o shebang, e
  um alvo `#!/bin/sh` quebraria o `npm link`/`npm i -g`.
- **Skills:** a CLI passa a ser `"$ARCHLENS/bin/archlens" <comando>`. A definição `ARCHLENS="$(realpath "$SKILL_DIR/../..")"`
  não muda.
- **AGENTS.md:** mudar as skills e `references/` pede avaliar o archlens-ask (ele não executa a CLI: sem impacto, mas rodar
  `npm run check-ask`) e, por tocar a skill `archlens-query` e `references/views.md`, rodar `npm --prefix apps/gui run prompt`
  e `npm run gui:test`.
- Histórico (`docs/plans/`, `docs/superpowers/`) não é reescrito.

## Review Focus

1. **Link simbólico para o lançador** (`ln -s <repo>/bin/archlens ~/.local/bin/archlens`): deve achar o repositório real,
   inclusive com link relativo e link para link — no macOS sem `readlink -f`.
2. **Argumentos com aspas e espaços**, como `--spec '{"key":"x","anchor":"a b"}'` e caminhos com espaço: chegam idênticos.
3. **Código de saída** de um comando que falha (ex.: base inexistente) é o mesmo pelo lançador e pelo `node` direto.
4. **Repositório com espaço no caminho** (`/tmp/meu repo/archlens`): o lançador funciona.
5. **Windows com `core.autocrlf=true`**: o `bin/archlens` continua LF (o Git Bash do Claude Code o executa) e o `.cmd`
   continua CRLF.

---

### Task 1: Lançador POSIX `bin/archlens`

**Files:**
- Create: `bin/archlens`
- Create: `.gitattributes`
- Test: `tests/launcher.test.mjs`

**Interfaces:**
- Produces: `bin/archlens [args…]` — mesmo uso de `node scripts/archlens.mjs [args…]`; variável `ARCHLENS_NODE`.

- [ ] **Step 1: Write the failing tests** em `tests/launcher.test.mjs` (pulados no Windows com `{ skip: process.platform === 'win32' }`):

```js
const BIN = join(ROOT, 'bin', 'archlens');
const run = (args, env = {}, opts = {}) => spawnSync(BIN, args, { encoding: 'utf8', env: { ...process.env, ...env }, ...opts });

test('help pelo lançador é o help da CLI', () => {
  const r = run(['help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^archlens — /);
});

test('código de saída e stderr iguais ao node direto', () => {
  const direct = spawnSync(process.execPath, [join(ROOT, 'scripts/archlens.mjs'), 'query', '/nao/existe', '--view', 'x'], { encoding: 'utf8' });
  const r = run(['query', '/nao/existe', '--view', 'x'], { ARCHLENS_NODE: process.execPath });
  assert.notEqual(direct.status, 0);
  assert.equal(r.status, direct.status);
  assert.equal(r.stderr, direct.stderr);
});

test('argumentos com aspas e espaços chegam intactos', () => {
  // um script de Node falso que imprime argv, via ARCHLENS_NODE apontando para um sh que ecoa "$@" um por linha
  // asserção: as linhas impressas são exatamente ['<repo>/scripts/archlens.mjs', 'render', '--spec', '{"key":"x","anchor":"a b"}', 'c d']
});

test('link simbólico (relativo e em cadeia) acha o repositório', () => {
  // tmp/a/archlens -> <repo>/bin/archlens ; tmp/b/arch -> ../a/archlens (relativo)
  // asserção: spawnSync(tmp/b/arch, ['help']).status === 0 e stdout começa com 'archlens — '
});

test('repositório com espaço no caminho', () => {
  // cópia mínima: tmp/'meu repo'/bin/archlens (copiado) + link 'meu repo'/scripts -> <repo>/scripts
  // asserção: help sai 0
});

test('sem node no PATH: mensagem e 127', () => {
  const r = run(['help'], { PATH: '/nao-existe', ARCHLENS_NODE: '' });
  assert.equal(r.status, 127);
  assert.equal(r.stderr, 'archlens: Node.js não encontrado. Instale o Node 18 ou mais novo (https://nodejs.org) ou aponte ARCHLENS_NODE para o executável.\n');
});

test('ARCHLENS_NODE inválido: mensagem e 127', () => {
  const r = run(['help'], { ARCHLENS_NODE: '/nao/existe/node' });
  assert.equal(r.status, 127);
  assert.equal(r.stderr, 'archlens: ARCHLENS_NODE não aponta para um executável: /nao/existe/node\n');
});

test('Node antigo: mensagem com versão e caminho, 1', () => {
  // ARCHLENS_NODE = sh falso que responde '16.20.2' ao pedido de versão
  // asserção: status 1 e stderr === `archlens: o archlens precisa do Node 18 ou mais novo (encontrado: 16.20.2, em ${fake}).\n`
});

test('bin/archlens é versionado executável e com LF', () => {
  const mode = spawnSync('git', ['ls-files', '-s', 'bin/archlens'], { cwd: ROOT, encoding: 'utf8' }).stdout.split(' ')[0];
  assert.equal(mode, '100755');
  assert.ok(!readFileSync(BIN, 'utf8').includes('\r'));
});
```

Os testes "sem node no PATH" precisam que o script use só comandos internos do sh ou caminhos absolutos depois de
perder o `PATH`; se o lançador precisar de `dirname`/`readlink`, o teste passa `PATH` com uma pasta temporária que contém
links só para eles (nunca para `node`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/launcher.test.mjs`
Expected: FAIL (`ENOENT` em `bin/archlens`).

- [ ] **Step 3: Implement `bin/archlens`** (`#!/bin/sh`, POSIX, sem bashismos)

Algoritmo (o resto é escolha do implementador):

```sh
# 1. resolver o próprio caminho seguindo links, sem readlink -f (macOS antigo):
#    self="$0"; enquanto [ -L "$self" ]: alvo=$(readlink "$self"); alvo relativo → prefixar a pasta do link
#    root = pasta de "$self" + "/..", normalizada com (cd … && pwd -P)
# 2. node = ARCHLENS_NODE se não vazio (precisa ser arquivo executável, senão mensagem + exit 127);
#    senão `command -v node` (falhou → mensagem + exit 127)
# 3. versão = "$node" -p 'process.versions.node' ; maior < 18 (ou falha ao rodar) → mensagem + exit 1
# 4. exec "$node" "$root/scripts/archlens.mjs" "$@"
```

`.gitattributes`:

```
bin/archlens text eol=lf
*.cmd text eol=crlf
```

Depois: `chmod +x bin/archlens` e `git add --chmod=+x bin/archlens`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/launcher.test.mjs`
Expected: PASS em todos (no Linux; `sh -n bin/archlens` sem erro).

- [ ] **Step 5: Commit**

```bash
git add .gitattributes bin/archlens tests/launcher.test.mjs
git commit -m "feat(cli): lançador bin/archlens acha o Node e roda a CLI"
```

### Task 2: Lançador Windows `bin/archlens.cmd`

**Files:**
- Create: `bin/archlens.cmd`
- Test: `tests/launcher.test.mjs` (acrescenta)

**Interfaces:**
- Consumes: as mensagens e os códigos de saída das Global Constraints.
- Produces: `archlens.cmd [args…]`, com `bin\` no `PATH` do Windows (cmd e PowerShell acham `.cmd` pelo `PATHEXT`).

- [ ] **Step 1: Write the failing tests** — checagens estáticas (o CI não tem Windows) e, só em `win32`, execução real:

```js
const CMD = join(ROOT, 'bin', 'archlens.cmd');

test('archlens.cmd: CRLF, @echo off, setlocal e caminho relativo à própria pasta', () => {
  const text = readFileSync(CMD, 'utf8');
  assert.ok(text.split('\n').slice(0, -1).every(l => l.endsWith('\r')), 'todas as linhas em CRLF');
  assert.match(text, /^@echo off\r\n/);
  assert.match(text, /setlocal/i);
  assert.ok(text.includes('%~dp0..\\scripts\\archlens.mjs'));
  assert.match(text, /exit \/b/i);
  for (const msg of ['Node.js não encontrado', 'ARCHLENS_NODE não aponta para um executável', 'precisa do Node 18 ou mais novo'])
    assert.ok(text.includes(msg), msg);
});

test('archlens.cmd roda o help e repassa o código de saída', { skip: process.platform !== 'win32' }, () => {
  // spawnSync('cmd.exe', ['/d', '/c', CMD, 'help']) → 0 e stdout começa com 'archlens — '
  // base inexistente → mesmo status que o node direto
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/launcher.test.mjs`
Expected: FAIL (`ENOENT` em `bin/archlens.cmd`).

- [ ] **Step 3: Implement `bin/archlens.cmd`**

Mesmo algoritmo da Task 1, sem a resolução de links (`%~dp0` já é a pasta real do `.cmd`): `ARCHLENS_NODE` (testar com
`if exist`), senão `where node` (primeira linha); versão com `"%NODE%" -p "process.versions.node.split('.')[0]"` lida por
`for /f`; `"%NODE%" "%~dp0..\scripts\archlens.mjs" %*` e `exit /b %ERRORLEVEL%`. O arquivo é salvo em UTF-8 e começa com
`chcp 65001 >nul` dentro do `setlocal` para os acentos das mensagens (restaurar a página de código anterior antes de sair).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/launcher.test.mjs`
Expected: PASS (o teste de execução real aparece como `skipped` fora do Windows).

- [ ] **Step 5: Commit**

```bash
git add bin/archlens.cmd tests/launcher.test.mjs
git commit -m "feat(cli): lançador bin/archlens.cmd para o Windows"
```

### Task 3: Skills, referências, help e documentação usam o lançador

**Files:**
- Modify: `skills/archlens-plan/SKILL.md`, `skills/archlens-apply/SKILL.md`, `skills/archlens-query/SKILL.md` (linha "CLI:")
- Modify: `references/base.md` (seção "CLI"), `references/views.md`, `references/merge.md`, `references/knowledge-doc.md`
- Modify: `scripts/archlens.mjs` (só a linha `Uso:` do `HELP`)
- Modify: `README.md` (bloco inicial, Instalação, GUI), `docs/GUIA.md`, `examples/repos/README.md`, `examples/loja-online-gbrain/README.md`
- Modify: `CHANGELOG.md` (`[Não lançado]` → `### Adicionado`)
- Regenerate: `apps/gui/server/ask/system-prompt.md` (`npm --prefix apps/gui run prompt`)
- Test: `tests/skills.test.mjs`

**Interfaces:**
- Consumes: `bin/archlens` (Task 1).

- [ ] **Step 1: Update the tests** em `tests/skills.test.mjs`:
  - a asserção `text.includes('node "$ARCHLENS/scripts/archlens.mjs"')` vira `text.includes('"$ARCHLENS/bin/archlens"')`,
    com mensagem `${name}: CLI por "$ARCHLENS/bin/archlens"`;
  - no teste do link da skill, o comando vira `${ARCHLENS_DEF}; "$ARCHLENS/bin/archlens" help && test -f "$ARCHLENS/references/base.md"`
    (a asserção negativa com `node "$SKILL_DIR/../../scripts/archlens.mjs"` fica como está);
  - novo teste: nenhum arquivo de `skills/` e `references/` contém `node scripts/archlens.mjs` nem `node "$ARCHLENS/scripts/archlens.mjs"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/skills.test.mjs`
Expected: FAIL nas três asserções novas.

- [ ] **Step 3: Update the texts**
  - **Skills e `references/base.md`:** `CLI: \`"$ARCHLENS/bin/archlens" <comando>\`` (o resto da frase igual). Em `base.md`,
    depois de "Requer Node ≥ 18", acrescentar: "(o lançador acha o `node` do PATH ou o de `ARCHLENS_NODE`)".
  - **Exemplos de comando** em `references/*.md`, README, GUIA e READMEs dos exemplos: `node scripts/archlens.mjs` →
    `bin/archlens` (e `node ../../scripts/archlens.mjs` → `../../bin/archlens`).
  - **`HELP`:** `Uso: archlens <comando> [base] [opções]`.
  - **README, Instalação**, nova subseção "Comando `archlens`":
    - Linux/macOS: `ln -s <repo>/bin/archlens ~/.local/bin/archlens` (ou `<repo>/bin` no `PATH`);
    - Windows: `<repo>\bin` no `PATH` do usuário (o `archlens.cmd` vale no cmd e no PowerShell; o `bin/archlens` vale no Git Bash);
    - alternativa com npm: `npm link` na raiz do repositório;
    - `ARCHLENS_NODE` para escolher outro Node.
  - **CHANGELOG:** "**Comando `archlens`** (`bin/archlens` e `bin/archlens.cmd`): acha o Node (`ARCHLENS_NODE` ou o do
    PATH), confere a versão mínima e roda a CLI; as skills passam a usá-lo."
  - Regenerar o prompt da GUI: `npm --prefix apps/gui run prompt`.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run check-ask && npm run gui:test`
Expected: tudo PASS; `check-ask` limpo; `gui:test` sem prompt desatualizado.
Run: `grep -rn "node scripts/archlens.mjs\|node \"\$ARCHLENS/scripts" skills references README.md docs/GUIA.md examples/*/README.md`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add -A skills references scripts/archlens.mjs README.md docs/GUIA.md examples/repos/README.md examples/loja-online-gbrain/README.md CHANGELOG.md apps/gui/server/ask/system-prompt.md tests/skills.test.mjs
git commit -m "docs: skills, referências e guias usam o comando archlens"
```

## Verificação manual (fora do CI)

- **Windows (cmd e PowerShell):** `bin\archlens.cmd help`; `archlens.cmd query examples\loja-online\architecture --view containers`;
  `serve` e Ctrl+C (confirmar que o "Terminate batch job (S/N)?" do cmd não deixa o Node órfão).
- **Windows (Git Bash, como o Claude Code roda):** `bin/archlens help` num clone com `core.autocrlf=true`.
- **macOS:** link simbólico em `/usr/local/bin` ou `~/.local/bin`.
- **Claude Code:** uma consulta pela skill `archlens-query` usando o lançador, num plugin instalado pelo marketplace
  (confirma que o bit executável sobrevive à instalação).

**PR:** "archlens-ask: sem impacto" (as skills mudam só a forma de chamar a CLI; o archlens-ask não a executa; `check-ask` limpo).
