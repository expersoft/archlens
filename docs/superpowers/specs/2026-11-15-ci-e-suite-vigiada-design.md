# CI no GitHub Actions e suíte vigiada (P01)

**Data:** 2026-11-15 · **Linha:** v0 (`develop-v2`) · **Brief:** `docs/superpowers/roadmap-produto/P01-ci-e-suite-verde.md`

## Intenção

Todo PR é verificado sozinho, e a suíte passa numa árvore limpa mesmo quando alguém edita os exemplos. As regras que
o `AGENTS.md` pedia à mão (derivados em dia, suítes rodadas) passam a ser impostas pelo CI. É o primeiro plano do
roadmap porque todos os outros dependem dele, e entra na v0 para a linha v1 herdar tudo na bifurcação.

O dono pediu para seguir com padrões, sem rodada de perguntas. **Toda decisão abaixo marcada "(padrão)" é escolha de
quem implementou, não algo que o dono aprovou**; cada uma pode ser revista no PR.

## Ponto de partida medido

Worktree limpa de `develop-v2` em `688fac5`, Node 22.23:

| Verificação | Resultado |
|---|---|
| `npm test` | 858 testes, 856 passam, 2 pulados, 137 s |
| `test:server` da GUI | 351 passam, 69 s |
| `test:web` da GUI | 386 passam, 41 arquivos |
| `check-ask`, `check-plugin`, `prompt:check`, `typecheck`, schemas | em dia |
| `npm audit --audit-level=high` (raiz e GUI) | sem achados |

Com `examples/loja-online/` editado (modelo alterado e uma pasta `notes/` nova), 7 testes quebram, sempre os mesmos:

| Teste | Causa | Tratamento |
|---|---|---|
| 3 snapshots em `tests/query-md.test.mjs` | Comparam a saída sobre o exemplo com `tests/fixtures/query-*.md` | Base congelada em `tests/fixtures/loja-online/` |
| `read_notes` em `apps/gui/server/plan-tools.test.mjs` | Supõe que o exemplo não tem notas | O teste remove `notes/` da cópia temporária antes de começar |
| 3 em `apps/gui/eval/compare.test.mjs` | Comparam o exemplo com o gabarito do archlens-ask, que é **gerado** do exemplo | Nenhum: é a falha certa. `check-ask` também falha nesse estado, e `npm run ask` resolve |

34 arquivos de teste citam `examples/`. Os demais usam o exemplo como entrada e conferem propriedades, não um
retrato; não quebraram na medição e ficam como estão.

## Decisões

1. **Fixtures congeladas.** `tests/fixtures/loja-online/architecture/` guarda só os quatro arquivos da base
   (`archlens.json`, `model.json`, `views.json`, `changelog.json`), sem diagramas. Só muda junto com os snapshots.
2. **Lint: Biome, só o linter (padrão).** Uma dependência de desenvolvimento, sem plugins, 256 arquivos em menos de
   um segundo. Regras recomendadas, como catraca: as 106 violações de hoje foram lidas, nenhuma é defeito
   (`[^]` em regex, atribuição em expressão, `forEach` com retorno, chaves por índice no React, acessibilidade em
   elementos clicáveis). As regras já violadas viram aviso ou são desligadas em `biome.json`; qualquer regra nova
   bloqueia. Nenhuma linha de código de produto muda neste ciclo.
3. **Formatador desligado (padrão, e o ponto que mais merece revisão).** O brief pedia aplicar o formatador antes da
   bifurcação. O código tem estilo denso e deliberado (638 linhas acima de 120 colunas só em `scripts/lib/`, objetos
   compactos no `package.json`); formatar reescreveria quase todos os 256 arquivos e apagaria o `git blame`. Isso é
   uma decisão de estilo do dono, não um padrão seguro. Se a resposta for "sim, formatar", tem de ser um PR próprio
   e anterior ao P00.
4. **Matriz de Node: 20, 22 e 24, na raiz e na GUI.** A suíte da raiz passa em Node 20 (856 de 858, medido). Em
   **Node 18 falham 6 testes**, todos pelo mesmo motivo: com o `playwright-core` 1.63 instalado, `archlens build`
   termina com "Playwright requires Node.js 20 or higher". O `engines: >=18` do `package.json` promete mais do que
   funciona, e o Node 18 saiu de suporte em abril de 2025. Este ciclo não mexe em código de produto: a matriz parte
   do 20 e o achado fica registrado em "O que fica para o dono". A GUI já exigia Node 20 (vitest 4). Subir o piso
   para 22 é decisão do P02.
5. **Jobs.** `Lint e derivados` (lint, `check-plugin`, `check-ask`, `check-schemas`, `prompt:check`, `npm audit`);
   `Núcleo e CLI` (matriz, sem navegador); `GUI` (matriz: typecheck, build, servidor, vitest);
   `Testes com Chromium` (suíte da raiz com navegador e cobertura, depois o e2e da GUI; Chromium em cache);
   `Lançadores no Windows` (`tests/launcher.test.mjs`).
6. **Gatilhos.** Todo `pull_request`, qualquer que seja o destino (cobre a futura branch da v1 sem depender do nome),
   e `push` em `main` e `develop-v2`.
7. **Cobertura informativa.** `node --test --experimental-test-coverage` no job com Chromium; a linha de total vai
   para o resumo do job e o `lcov.info` para os artefatos. Sem limiar e sem comentário no PR (padrão: evita dar ao
   workflow permissão de escrita).
8. **`test:gbrain` fora do CI de PR (padrão).** Workflow próprio, manual e semanal. O agendamento só dispara a
   partir da `main`.
9. **Avaliação com LLM fora deste ciclo (padrão).** Custa dinheiro e exige um secret; fica para quando houver um
   teto de custo decidido.
10. **Suíte mais rápida: nada agora.** `node --test` já roda os arquivos em paralelo; 137 s não justificam mexer.
    Os testes de navegador já se pulam sozinhos sem Chromium, o que separa os jobs sem alterar os testes.
11. **Scripts novos:** `lint`, `coverage`, `check-schemas` (regenera e exige diff vazio) e `ci` (lint, derivados e
    suíte da raiz, para rodar antes do PR).

## O que a primeira execução no GitHub revelou

1. **A suíte da raiz depende das dependências da GUI.** Sem `npm --prefix apps/gui ci`, 7 testes de `archlens serve`
   em `tests/cli.test.mjs` falham com `Cannot find package '@anthropic-ai/sdk'`. O job `Núcleo e CLI` passou a
   instalar as duas árvores. Vale para quem clona o repositório: `npm ci` na raiz não basta para `npm test`.
2. **Defeito do conector gbrain (modo git) com git 2.56.** O teste "the user's clone keeps its branch, working tree
   and index" (`tests/gbrain-git.test.mjs`) falha no runner (Ubuntu 26.04, git 2.56.1) e passa com git 2.34, 2.47 e
   2.54. Causa isolada num contêiner: a partir do git 2.56, `git push <url>` atualiza a ref de acompanhamento
   (`refs/remotes/origin/<branch>`) do remote cuja URL coincide. `store/gbrain-git.mjs` empurra pela URL justamente
   para não mexer nessas refs. Os `fetch --refmap=` continuam sem tocá-las. É defeito de produto, fora do escopo
   deste ciclo: fica para um PR de correção na v0, e até lá os jobs que rodam a suíte da raiz ficam vermelhos.

## Fora do escopo

Release automatizado (P14), TypeScript (P02), testes novos de funcionalidade, correção das violações de lint
rebaixadas, Dependabot.

## O que fica para o dono

- Ligar a proteção de branch em `develop-v2` e `main` com os checks listados no `README.md` (exige permissão de
  administrador no repositório).
- Decidir sobre o formatador (decisão 3) antes do P00.
- Node 18 (decisão 4): subir `engines` para `>=20` (e a checagem de versão dos lançadores em `bin/`), ou fazer o
  `build` degradar sem navegador em Node 18. A primeira é a recomendada.
- Critério "três execuções seguidas": só se confere no GitHub, reexecutando o workflow no PR.

## Obrigações do repositório

archlens-ask: sem impacto (nenhum tipo, travessia, formato ou texto copiado muda). GUI: `npm run gui:test` rodado;
só um teste do servidor mudou.
