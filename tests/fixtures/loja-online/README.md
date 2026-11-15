# Base congelada para testes de snapshot

Cópia de `examples/loja-online/architecture` (só os arquivos da base: manifesto, modelo, visões e changelog) no momento em que
os snapshots `tests/fixtures/query-*.md` foram gerados. `examples/` é documentação viva e pode mudar; esta pasta só
muda junto com os snapshots.

Para atualizar: copie os quatro arquivos do exemplo, rode `UPDATE_SNAPSHOTS=1 node --test tests/query-md.test.mjs` e
revise o diff dos snapshots.
