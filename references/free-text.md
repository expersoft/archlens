# Do texto livre ao modelo

Objetivo: um modelo **fiel ao que foi dito**, com as lacunas visíveis. Não invente arquitetura para
deixar o diagrama bonito.

## Procedimento

1. **Liste os substantivos com papel arquitetural**, em uma passada:
   - pessoas e papéis ("o paciente", "o médico", "o operador") → `c4:person` (vira business-actor)
   - sistemas nomeados ou "o sistema de X" → `c4:softwareSystem` (`external: true` se é de terceiro/SaaS)
   - apps, sites, APIs, workers, bancos, filas **dentro** do seu sistema → `c4:container`
     (banco, cache e índice levam `tags: ["database"]`)
   - módulos internos citados ("o controller de checkout") → `c4:component`
   - ofertas ("vender online", "teleconsulta") → `archimate:product`
   - serviços prestados ao cliente → `archimate:business-service`
   - atividades de negócio com verbo ("agendar", "faturar", "expedir") → `archimate:business-process`
   - documentos e informações de negócio ("pedido", "receita") → `archimate:business-object`
   - infraestrutura ("AWS ECS", "datacenter", "Kafka", "PostgreSQL") → node / system-software /
     technology-service / communication-network
   - metas e requisitos ("reduzir abandono", "p95 < 2s") → goal / requirement
2. **Liste os verbos entre eles** → relações:
   - "X chama/usa/consulta/envia para Y" → `uses` (consumidor → provedor), com `description` e `technology`
   - "o processo usa o sistema" → crie um `application-service` realizado pelo container e que serve o processo
   - "roda em", "hospedado em" → tecnologia `serving` o container (ou technology-service realizado pelo nó)
   - "grava/lê X" → `access` com `accessType`
   - "depois de A vem B" → `triggering`
3. **Registre a evidência:** `source` com o trecho literal que justificou o elemento.
4. **Marque inferências:** tudo que você deduziu e não leu leva `inferred: true` e `confidence`:
   - `alta`: implicação quase certa ("agenda pelo app" ⇒ existe um app)
   - `média`: comum, mas pode ser diferente ("paga com cartão" ⇒ gateway externo)
   - `baixa`: palpite estrutural ("AWS + datacenter" ⇒ VPN)
5. **Escreva `assumptions`:** uma frase por premissa relevante, em linguagem de negócio.
6. **Conecte as camadas** (veja `archimate.md`). Sem isso, as visões de suporte e impacto ficam vazias.
7. **Pergunte só o que bloqueia.** Se uma resposta muda a estrutura (interno ou externo? um sistema
   ou dois?), pergunte. Se muda um rótulo, assuma e registre em `assumptions`.

## Sinais de alerta

- Mais de ~30% dos elementos inferidos: o texto é vago. Mostre o modelo e peça confirmação antes
  de gerar muitas visões.
- Um container sem nenhuma relação: provavelmente falta um verbo no texto. Pergunte ou remova.
- Um processo sem application service: a visão de suporte vai parar no negócio. Verifique se o
  texto indica qual sistema o apoia.

O exemplo completo está em `examples/telemedicina/`: `entrada.md`, o `model.json` gerado e o
`ARCHITECTURE.md` com a seção de premissas.
