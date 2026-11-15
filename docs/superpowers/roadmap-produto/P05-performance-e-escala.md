# P05 — Performance e escala

**Trilha:** Engenharia · **Tamanho:** M · **Depende de:** P01

## Objetivo

Saber, com números, até que tamanho de base o archlens responde bem, fixar orçamentos de tempo vigiados pelo CI e
fechar o débito de latência já medido.

## Evidência

- **Medido** em `docs/superpowers/specs/2026-10-28-diagram-latency-tech-debt.md`: uma consulta pela skill leva ~30 s,
  dos quais ~88% são turnos do modelo e ~3,7 s são da CLI. As propostas M1–M4 (lado do modelo) e C1–C5 (lado da CLI)
  estão abertas.
- `scripts/lib/deliver.mjs` ainda percorre os viewports em série e usa `waitForTimeout(120)` por visão.
- **Não medido, risco inferido do código:**
  - `apps/gui/server/bases.mjs`: cada base local é relida e tem o hash recalculado a cada 5 s (`pollMs`);
  - o layout com ELK (`scripts/lib/layout.mjs`) roda na thread principal do servidor da GUI;
  - `layout.style: "auto"` calcula três estilos por visão;
  - toda chamada da CLI lê e normaliza a base inteira;
  - os exemplos têm 13–32 KB; não existe base grande de teste.
- `npm test` leva ~114 s.

## Escopo

1. **Gerador de base sintética** (parâmetros: sistemas, containers, relações, camadas) e três tamanhos de referência,
   por exemplo 200, 2 000 e 20 000 elementos.
2. **Benchmarks** de `validate`, `resolve`, `render`, `build`, `plan`, `apply` e das rotas `catalog`, `view`, `find`
   da GUI. Resultado em arquivo, comparável entre commits.
3. **Orçamentos** definidos a partir da primeira medição, com um job de CI que alerta em regressão.
4. **Débito de latência, lado da CLI:** C1 (viewports em paralelo), C2 (screenshot mais barato), C3 (sinal de pronto
   em vez de espera fixa), C4 (pular estilos que não podem ganhar no `auto`), C5 (um navegador para todas as visões).
5. **Débito de latência, lado do modelo:** M1 (`archlens find`), M2 (`resolve --format brief`), M3 (referências sob
   demanda na skill), M4 (`views --match`).
6. **GUI:** observar mudanças por evento ou por data de modificação antes de reler tudo; layout fora da thread
   principal (pool de workers) se a medição mostrar bloqueio.
7. **Corrigir o que a medição apontar** como gargalo real com bases grandes. Não otimizar o que não foi medido.

## Fora do escopo

Leitura parcial da base pelo contrato do store (P04). Mudar o algoritmo de layout.

## Critérios de aceite

- Existe um comando que gera a base sintética e outro que roda os benchmarks e grava o resultado.
- O documento de débito ganha uma seção "depois", repetindo a medição original em `examples/telemedicina`.
- Com a base de 2 000 elementos, a GUI abre o catálogo e uma visão focada dentro do orçamento definido, e uma visão
  pesada não atrasa outras requisições.
- Nenhuma mudança na semântica das visões.

## Decisões a fechar no brainstorm

- Tamanho de base que o produto promete suportar (pergunte ao dono: quantos sistemas tem a maior base esperada?).
- Onde guardar o histórico dos benchmarks e qual variação dispara alerta.
- Se M3 muda a organização do `INSTRUCTIONS.md` do archlens-ask.

## Obrigações do repositório

archlens-ask: M1, M4, C1–C5 sem impacto; M2 sem impacto se o `query --format md` não mudar; M3 pede avaliar o
`INSTRUCTIONS.md`. GUI: mudanças em `render`, `query*`, `view-build` e `store/` pedem `npm run gui:test`.

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P05-performance-e-escala.md` e
> `docs/superpowers/specs/2026-10-28-diagram-latency-tech-debt.md`. Primeiro construa o gerador de base sintética e
> meça; só depois proponha o que otimizar. Traga os números ao brainstorm.
