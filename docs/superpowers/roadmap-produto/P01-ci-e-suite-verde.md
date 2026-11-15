# P01 — CI no GitHub Actions e suíte verde

**Trilha:** Engenharia · **Tamanho:** P · **Depende de:** nada · **Desbloqueia:** todos os outros

## Objetivo

Todo PR para `develop-v2` e `main` é verificado automaticamente, e a suíte passa numa árvore limpa. As regras que hoje
o `AGENTS.md` pede à mão passam a ser impostas pelo CI.

## Evidência

- Não existe `.github/workflows`.
- Em 2026-11-14, em `develop-v2` (`823da71`) com mudanças locais em `examples/loja-online/`:
  - `npm test`: 710 testes, 706 passam, **3 falham**, 1 pulado, ~114 s. Falham em `tests/query-md.test.mjs`:
    "container view matches the snapshot", "product-support view matches the snapshot", "impact view renders the
    matrix as a markdown table". Esse teste lê `examples/loja-online/architecture`, que está modificado localmente:
    causa provável, não confirmada.
  - `npm --prefix apps/gui run test:server`: 231 testes, **4 falham**: "same selection with a different spec passes",
    "derived edge may differ in type", "dry run scores every automatic question" (em `apps/gui/eval/`) e
    "read_notes devolve as notas atuais como conteúdo externo". Causa não investigada.
- Sem eslint, prettier ou biome na raiz e em `apps/gui/`.
- Os checks de derivados existem mas só rodam à mão: `npm run check-ask`, `npm run check-plugin`,
  `npm --prefix apps/gui run prompt:check`, `npm run schemas`.

## Escopo

1. **Diagnosticar e corrigir as 7 falhas.** Primeiro passo: rodar as duas suítes numa árvore limpa (`git stash` não;
   use uma worktree nova) para separar o que é defeito do que é efeito das mudanças locais. Use
   `superpowers:systematic-debugging`.
2. **Fixtures congeladas.** Testes de snapshot não devem ler `examples/` (documentação viva). Copiar o necessário para
   `tests/fixtures/` ou gerar a base no teste. `tests/examples.test.mjs` continua cobrindo os exemplos.
3. **Workflow de PR** (`.github/workflows/ci.yml`): matriz Node 18, 20, 22 em Linux; um job em Windows para os
   lançadores (`bin/archlens.cmd`, `tests/launcher.test.mjs`). Passos: `npm ci`, `npm test`, `npm run check-ask`,
   `npm run check-plugin`, schemas atualizados, `npm run gui:build`, `npm run gui:test`, `prompt:check`, `typecheck`,
   `npm audit --audit-level=high` nos dois pacotes.
4. **e2e da GUI** (`npm --prefix apps/gui run test:e2e`) num job com Chromium do Playwright em cache.
5. **Lint e formatação.** Escolher uma ferramenta, aplicar com o menor diff possível e ligar no CI.
6. **Suíte mais rápida.** Avaliar concorrência do `node --test` e separar testes que abrem navegador.
7. **Cobertura.** Relatório (`node --test --experimental-test-coverage` ou c8) publicado no PR, sem limiar bloqueante
   no primeiro ciclo.
8. **Proteção de branch** documentada (checks obrigatórios em `develop-v2` e `main`).

## Fora do escopo

Release automatizado (P14), migração para TypeScript (P02), novos testes de funcionalidade.

## Critérios de aceite

- `npm test` e `npm run gui:test` passam numa worktree limpa, três execuções seguidas.
- Um PR que desatualiza `portable/archlens-ask/REFERENCE.md`, os manifestos do plugin ou o prompt da GUI falha no CI.
- Editar `examples/loja-online/` não quebra testes de snapshot.
- O `AGENTS.md` cita o CI como verificação e mantém só o que exige julgamento humano.

## Decisões a fechar no brainstorm

- eslint + prettier ou biome; quanto de reformatação aceitar de uma vez.
- Se `npm run test:gbrain` (precisa de bun e rede) roda no CI, agendado ou só à mão.
- Se a avaliação com LLM (`apps/gui/eval/run.mjs`) roda agendada com chave em secret, e com que teto de custo.
- Versão mínima do Node: P02 pode pedir Node ≥ 22.18; alinhar a matriz com essa decisão.

## Obrigações do repositório

archlens-ask: sem impacto esperado (escrever isso no PR). GUI: `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` e `docs/superpowers/roadmap-produto/P01-ci-e-suite-verde.md`.
> Comece rodando as duas suítes numa worktree limpa e relate as falhas com a saída. Depois conduza o brainstorm das
> decisões abertas do brief e escreva o spec em `docs/superpowers/specs/`.
