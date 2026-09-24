# Entrada em texto livre (exemplo)

> Pedido original do usuário para a skill, antes de qualquer modelagem.

A Clínica Vida quer oferecer teleconsultas. O paciente agenda pelo app ou pelo site, paga com
cartão e recebe um link de videochamada. O médico atende pelo portal médico, registra o prontuário
eletrônico e emite receita digital assinada com certificado ICP-Brasil.

O sistema de agendamento é interno, feito em Node.js com PostgreSQL. As videochamadas usam um
provedor externo (Twilio). O prontuário fica no PEP legado (Tasy), que roda no datacenter da
clínica. Lembretes são enviados por WhatsApp. Tudo que é novo roda na AWS em contêineres (ECS).

Quero:
1. o diagrama C4 de contexto e o de containers da plataforma;
2. um ArchiMate mostrando tudo que sustenta a oferta "Teleconsulta", do negócio à infraestrutura;
3. a matriz de impacto da API de Agendamento.
