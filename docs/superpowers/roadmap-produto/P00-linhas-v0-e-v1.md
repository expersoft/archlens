# P00 — Linhas v0 e v1: branch, forward-merge e política

**Linha:** v0 e v1 · **Tamanho:** P · **Depende de:** P01 · **Desbloqueia:** todo plano da linha v1

## Objetivo

Abrir a linha da versão 1.0.0 numa branch paralela a `develop-v2`, garantir que toda mudança da linha 0.x chegue a
ela sem depender de memória, e deixar escrito o que cada linha pode receber.

## Evidência

- Decisão do dono (2026-11-14): 1.0.0 numa branch nova; `develop-v2` mantém as versões 0.x; o que entra em
  `develop-v2` tem de ser incorporado à nova major.
- Fluxo atual: PRs para `develop-v2`; a versão sai por PR e tag; `main` recebe o release (`README.md`, "Publicar uma
  versão"). O marketplace do plugin lê a branch padrão (`main`).
- Arquivos que divergem por definição entre as linhas: `package.json` e `package-lock.json` (versão),
  `CHANGELOG.md`, `.claude-plugin/plugin.json` e `marketplace.json` (sincronizados por `scripts/sync-plugin.mjs`),
  `portable/archlens-ask/REFERENCE.md` (cita a versão; `check-ask` falha se estiver defasado).
- Planos da v1 que mudam a estrutura dos arquivos: P02 (64 módulos `.mjs` → `.ts`), P03 (parte `render.mjs` e
  `scripts/archlens.mjs`), P04 (contrato assíncrono em todo o núcleo).
- O nome `develop-v2` é histórico (segunda geração do desenvolvimento) e guarda as versões 0.x; uma branch chamada
  "v1" ao lado dele confunde.

## Escopo

1. **Nome e criação da branch** da linha v1, a partir de `develop-v2` depois de P01 (e, de preferência, P07)
   estarem mergeados. Versão `1.0.0-alpha.0` no `package.json`.
2. **Forward-merge automático:** workflow que, a cada push em `develop-v2`, abre (ou atualiza) um PR
   `develop-v2 → linha v1` com merge de verdade (preserva a ancestralidade; nada de cherry-pick). O CI da v1 roda
   nele. Um PR de forward-merge aberto há mais de N dias gera alerta.
3. **Resolução previsível dos conflitos certos:** para os arquivos de versão e gerados, a v1 mantém os seus e
   regenera (`sync-plugin`, `npm run ask`); o `CHANGELOG.md` da v1 ganha as entradas da 0.x numa seção própria.
   Automatizar com um script de pós-merge ou um driver de merge em `.gitattributes`.
4. **Política da v0**, escrita no `AGENTS.md` e no `CONTRIBUTING.md`: só correção de defeito e de segurança; nada de
   funcionalidade nova; toda correção nasce na v0 e chega à v1 pelo merge (nunca o contrário).
5. **Guia de porte manual:** quando a correção toca um arquivo que a v1 partiu ou reescreveu, o PR de forward-merge
   lista o que precisa ser refeito, e isso é resolvido no próprio PR.
6. **Regras para a v1 não dificultar o merge:** renomear em commit separado e sem alteração de conteúdo; não
   reorganizar pastas enquanto a v0 existir; não reformatar em massa (o formatador do P01 é aplicado na v0 antes da
   bifurcação).
7. **Compatibilidade do formato da base:** a v1 lê e grava o formato 2.0 de modo que a v0 continue lendo. Um teste
   nas duas linhas abre as mesmas fixtures.
8. **Pré-lançamentos da v1:** tags `v1.0.0-alpha.N`/`beta.N`, e a forma de instalar o plugin a partir delas sem
   passar pela `main`.
9. **Critério de 1.0.0** e **fim da v0** (data ou condição), e o que acontece com `develop-v2` e `main` nesse dia.
10. **Proteção de branch** e CI obrigatório nas duas linhas.

## Fora do escopo

Qualquer mudança de código de produto. O release automatizado em si (P14).

## Critérios de aceite

- Um commit de teste em `develop-v2` gera sozinho um PR para a linha v1, e esse PR passa no CI depois do script de
  resolução.
- `npm run check-plugin` e `npm run check-ask` passam nas duas linhas depois de um forward-merge.
- O `AGENTS.md` das duas linhas diz qual linha recebe o quê.
- Existe um teste que falha se a v1 gravar uma base que a v0 não lê.

## Decisões a fechar no brainstorm

- **Nome da branch** (`develop-v1`, `next`, `v1`). Considerar renomear `develop-v2` para algo como `maint-0.x`, com o
  custo de atualizar links e hábitos.
- Quais planos de funcionalidade, se algum, ainda saem numa 0.7 (por exemplo exportações), contra a regra "v0 só
  recebe correção".
- Frequência aceitável de forward-merge parado e quem é o responsável por resolvê-lo.
- Quando fazer o P03: cedo (ganha-se testabilidade, paga-se porte manual de toda correção em `render.mjs`) ou só
  perto do fim da v0.
- Data ou critério de fim da v0.
- A `main` no dia da 1.0.0: passa a apontar para a v1, e a 0.x fica numa branch de manutenção.

## Obrigações do repositório

archlens-ask: sem impacto no conteúdo; o `REFERENCE.md` é regenerado em cada forward-merge. GUI: sem impacto.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md` (seção 3) e `P00-linhas-v0-e-v1.md`. Confirme que P01 já está em
> `develop-v2`. Conduza o brainstorm das decisões abertas, começando pelo nome da branch e pela política da v0. Antes
> de propor o script de resolução, faça um forward-merge de ensaio numa worktree para ver os conflitos reais.
