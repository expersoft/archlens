# P13 — App desktop (Electron)

**Linha:** v1 · **Tamanho:** M · **Depende de:** P02 (fronteira do núcleo), P07 (isolamento do diagrama), P17 (API remota)

## Objetivo

Um arquiteto instala o archlens como um aplicativo, abre uma pasta de base e usa a GUI, sem terminal, sem Node
instalado e sem `npx playwright install`.

## Evidência

- Hoje o caminho é `npm run gui:build` e `bin/archlens serve architecture --open` (README, seção "GUI"), que exige
  Node, clone do repositório e, para regenerar diagramas ao aplicar, o Chromium do Playwright.
- A GUI já é um servidor HTTP local (`apps/gui/server/`, sem framework) mais um front estático (`apps/gui/dist/`):
  encaixa num processo principal de Electron sem reescrita.
- A checagem visual e os screenshots usam `playwright-core` (`scripts/lib/deliver.mjs`). O Electron traz um Chromium
  próprio.
- A chave do LLM vem de variável de ambiente ou `.env` (`apps/gui/server/envfile.mjs`); não há tela para configurá-la.

## Escopo

1. **Casca Electron** que sobe o servidor da GUI numa porta local livre e abre a janela nele; menu, abrir pasta de
   base, bases recentes, várias bases.
2. **Segurança do Electron:** `contextIsolation` ligado, `nodeIntegration` desligado, `sandbox` ligado, navegação
   externa abrindo no navegador do sistema, CSP de P07 mantida. O diagrama continua isolado do host.
3. **Configuração pela interface:** provedor e modelo do LLM, com a chave guardada no cofre do sistema operacional.
4. **Diagramas sem Playwright:** usar o Chromium do Electron para a checagem visual e os screenshots, ou empacotar o
   necessário. O app precisa conseguir aplicar um plano e regenerar os diagramas sozinho.
5. **Dois modos (R4):** abrir uma base local, como hoje, ou **conectar a um servidor archlens** (P17) com login
   pelo IdP (PKCE com retorno em `localhost`). No modo conectado o app não precisa de credencial de conector nem
   de chave de LLM.
6. **Empacotamento** para Windows, macOS e Linux, com assinatura de código e atualização automática.
7. **Publicação** pelo fluxo de release (em conjunto com P14).

## Fora do escopo

Funcionalidade que não exista na GUI web. Modo offline do LLM. Loja de aplicativos.

## Critérios de aceite

- Numa máquina sem Node, o instalador entrega um app que abre `examples/loja-online/architecture`, navega as visões,
  planeja e aplica uma mudança e regenera os diagramas.
- A chave do LLM não aparece em arquivo de texto nem em log.
- Um teste de fumaça automatizado abre o app empacotado e carrega uma visão, nas três plataformas, no CI.
- O servidor embutido só escuta em `127.0.0.1` e recusa requisições de outras origens (as guardas atuais continuam).

## Decisões a fechar no brainstorm

- **Electron ou Tauri.** O dono pediu Electron; vale confirmar. Electron reaproveita o servidor Node como está e traz
  o Chromium que os diagramas precisam. Tauri gera um app menor, mas exigiria empacotar o Node à parte e não resolve o
  Chromium.
- Onde mora o código (`apps/desktop/`) e como ele consome o núcleo e a GUI (depende da fronteira de P02).
- Assinatura e notarização: certificados que o dono tem ou precisa comprar.
- No modo conectado, o app é só uma janela para a GUI servida pelo servidor, ou embute a GUI e fala com a API v1.
  A primeira é quase gratuita; a segunda permite trabalhar com base local e remota na mesma janela.

## Obrigações do repositório

archlens-ask: sem impacto. GUI: se `deliver`/`build` ganharem um caminho sem Playwright, isso é mudança do núcleo
(avaliar e rodar `npm test` e `npm run gui:test`).

## Prompt de partida

> Leia `docs/superpowers/roadmap-produto/README.md`, `P13-app-desktop-electron.md` e
> `docs/superpowers/specs/2026-10-28-archlens-gui-design.md`. Antes do brainstorm, faça um spike descartável: o
> servidor atual da GUI dentro de uma janela Electron, e um screenshot de diagrama tirado pelo Chromium do Electron.
> Traga o que o spike ensinou.
