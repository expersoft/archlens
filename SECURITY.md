# Segurança

## Versões que recebem correção

A linha **0.x** (branch `develop-v2`, publicada em `main`) recebe correções de segurança. A linha 1.0 herda as mesmas
correções quando for aberta.

## Como relatar uma falha

Use os **Security advisories** do GitHub deste repositório (aba *Security* → *Report a vulnerability*). O relato fica
privado até a correção sair. Não abra uma issue pública para falha de segurança.

Ajuda muito dizer: a versão (`archlens --version`), o modo de uso (CLI ou plugin, GUI local, GUI em servidor), os
passos para reproduzir e o que um atacante consegue com a falha.

## O que o archlens assume

O modelo de ameaças está em [`docs/modelo-de-ameacas.md`](docs/modelo-de-ameacas.md): o que é protegido, de quem, por
quais barreiras, e os riscos conhecidos e aceitos. O principal deles: **a GUI ainda não tem login**. Quem alcança a
porta do servidor usa a GUI com tudo o que ela pode fazer. Não exponha a GUI fora de uma rede em que você confia.
