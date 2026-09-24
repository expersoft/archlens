// Plain-language help for relationships: one explanation per edge, plus the glossary shown in the page.
// Phrasing avoids grammatical gender, since element names can be anything ("há impacto em X").
import { ELEMENT_TYPES, supportDirection } from './registry.mjs';

const aspect = t => ELEMENT_TYPES[t]?.aspect;
const layer = t => ELEMENT_TYPES[t]?.layer;

/**
 * Explain one view edge. `nodes` maps id → { name, type }.
 * @returns {{ title, sentence, meaning, reading, impact, c4, derived }} (empty strings when not applicable)
 */
export function explainEdge(edge, nodes, notation) {
  const A = nodes[edge.from]?.name ?? edge.from;
  const B = nodes[edge.to]?.name ?? edge.to;
  const ta = nodes[edge.from]?.type, tb = nodes[edge.to]?.type;
  const g = GLOSSARY.types[edge.type] ?? GLOSSARY.types.association;
  let sentence, meaning = g.meaning, reading = g.reading, c4 = '';

  switch (edge.type) {
    case 'uses': {
      sentence = `${A} usa ${B}.`;
      const parts = [`${A} chama ou depende de ${B}`];
      if (edge.label) parts.push(`para: ${edge.label}`);
      meaning = parts.join(', ') + (edge.technology ? ` [${edge.technology}]` : '') + '.';
      if (edge.count > 1) meaning += ` Agrega ${edge.count} relações entre elementos internos.`;
      break;
    }
    case 'composition':
      sentence = `${A} contém ${B} como parte integrante.`;
      meaning = `${B} faz parte de ${A} e não existe sem ${A}.`;
      break;
    case 'aggregation':
      sentence = `${A} agrega ${B}.`;
      meaning = `${B} faz parte de ${A}, mas pode existir sem ${A} (ou fazer parte de outros).`;
      break;
    case 'assignment':
      if (tb === 'business-role' && ta === 'business-actor') {
        sentence = `${A} desempenha o papel ${B}.`;
        meaning = `Quem é ${A} atua como ${B}.`;
      } else if (tb === 'artifact' || (layer(ta) === 'technology' && aspect(tb) === 'passive')) {
        sentence = `${B} roda em ${A}.`;
        meaning = `Implantação (deploy) de ${B} em ${A}.`;
      } else if (aspect(tb) === 'behavior') {
        sentence = `${A} executa ${B}.`;
        meaning = `${A} é quem realiza o comportamento ${B}.`;
      } else {
        sentence = `${A} é responsável por ${B}.`;
      }
      break;
    case 'realization':
      if (layer(tb) === 'motivation') {
        sentence = ['requirement', 'constraint', 'principle'].includes(tb) ? `${A} atende a ${B}.` : `${A} contribui para ${B}.`;
        meaning = `${A} é um meio concreto de alcançar ${B}.`;
      } else if (ta === 'data-object' && tb === 'business-object') {
        sentence = `${A} realiza ${B}.`;
        meaning = `${A} é a representação em dados, no sistema, da informação de negócio ${B}.`;
      } else {
        sentence = `${A} realiza ${B}.`;
        meaning = `${B} é a descrição mais abstrata (o quê); ${A} é quem a implementa de fato (o como).`;
      }
      break;
    case 'serving':
      sentence = `${A} serve ${B}.`;
      meaning = `${B} usa a funcionalidade oferecida por ${A}.`;
      c4 = `Equivale a dizer "${B} usa ${A}" (como no "usa" do C4, com a seta no sentido oposto).`;
      break;
    case 'access': {
      const at = edge.accessType ?? 'readwrite';
      sentence = at === 'read' ? `${A} lê ${B}.` : at === 'write' ? `${A} grava ${B}.` : at === 'readwrite' ? `${A} lê e grava ${B}.` : `${A} acessa ${B}.`;
      meaning = `${A} usa o dado ${B}${at === 'access' ? ' (leitura/escrita não especificada)' : ''}.`;
      reading = at === 'read' ? 'Na leitura a seta aponta para quem lê (o dado "vai" até o leitor).'
        : at === 'write' ? 'Na escrita a seta aponta para o dado.'
        : at === 'readwrite' ? 'Leitura e escrita: setas nas duas pontas.' : 'Sem setas: acesso não especificado.';
      break;
    }
    case 'influence':
      sentence = `${A} influencia ${B}.`;
      break;
    case 'triggering':
      sentence = `${A} dispara ${B}.`;
      meaning = `${B} começa quando ${A} termina (relação temporal/causal).`;
      break;
    case 'flow':
      sentence = `${A} passa informação para ${B}.`;
      meaning = `Há transferência de informação, valor ou material de ${A} para ${B}.`;
      break;
    case 'specialization':
      sentence = `${A} é um tipo de ${B}.`;
      meaning = `${A} herda as características de ${B} e as especializa.`;
      break;
    default:
      sentence = `${A} está associado a ${B}.`;
  }

  let impact = '';
  if (edge.type === 'uses') impact = `Se ${B} falhar, há impacto em ${A}.`;
  else if (edge.type === 'triggering' || edge.type === 'flow') impact = `${B} depende de ${A} para acontecer.`;
  else {
    const d = supportDirection(edge);
    if (d) impact = `Se ${nodes[d[0]]?.name ?? d[0]} falhar, há impacto em ${nodes[d[1]]?.name ?? d[1]}.`;
  }

  const derived = edge.derived
    ? `Relação indireta, deduzida pelo encadeamento: ${A} → ${(edge.via || []).join(' → ')} → ${B}. Os elementos do meio estão ocultos nesta visão.`
    : '';
  const title = `${edge.derived ? 'Relação derivada · ' : ''}${g.label}`;
  return { title, sentence, meaning, reading, impact, c4, derived };
}

export const GLOSSARY = {
  types: {
    uses: {
      label: 'usa (C4)', notation: 'linha tracejada, seta cheia no destino',
      meaning: 'O consumidor chama ou depende do provedor.', reading: 'A ⇢ B: "A usa B". A seta vai de quem chama para quem é chamado.',
      example: 'Web usa API de Pedidos [REST].',
    },
    composition: {
      label: 'composição', notation: 'linha contínua, losango cheio no todo',
      meaning: 'Todo–parte forte: a parte não existe sem o todo.', reading: 'A ◆— B: "A contém B". O losango fica no todo.',
      example: 'API de Pedidos contém Checkout Controller.',
    },
    aggregation: {
      label: 'agregação', notation: 'linha contínua, losango vazio no todo',
      meaning: 'Todo–parte fraco: a parte pode existir sozinha ou em outros todos.', reading: 'A ◇— B: "A agrega B". O losango fica no todo.',
      example: 'Produto Venda Online agrega o serviço Compra online.',
    },
    assignment: {
      label: 'atribuição', notation: 'linha contínua, ponto na origem e seta cheia no destino',
      meaning: 'Quem executa o quê: ator → papel, ativo → comportamento, nó → artefato implantado.', reading: 'A ●→ B: "A executa / desempenha / hospeda B".',
      example: 'Médico executa Realizar teleconsulta.',
    },
    realization: {
      label: 'realização', notation: 'linha tracejada, triângulo vazio no destino',
      meaning: 'O concreto implementa o abstrato: processo realiza serviço, componente realiza app service, artefato realiza componente.', reading: 'A ┄▷ B: "A realiza B". O triângulo fica no lado abstrato.',
      example: 'Checkout Controller realiza Serviço de Checkout.',
    },
    serving: {
      label: 'serving (serve)', notation: 'linha contínua, seta aberta no destino',
      meaning: 'O provedor oferece funcionalidade para quem a usa.', reading: 'A —> B: "A serve B" = "B usa A". A seta aponta para quem consome, no sentido oposto ao "usa" do C4.',
      example: 'Hospedagem de contêineres serve API de Pedidos.',
    },
    access: {
      label: 'acesso', notation: 'linha pontilhada, seta pequena',
      meaning: 'Comportamento ou componente que lê e/ou grava um dado (objeto passivo).', reading: 'A ··> B: escrita aponta para o dado; leitura aponta para quem lê; leitura+escrita tem setas nas duas pontas.',
      example: 'Checkout grava Pedido.',
    },
    influence: {
      label: 'influência', notation: 'linha tracejada, seta aberta no destino',
      meaning: 'Um elemento de motivação afeta outro (positiva ou negativamente).', reading: 'A ┄> B: "A influencia B".',
      example: 'Requisito p95 < 2s influencia a meta Reduzir abandono.',
    },
    triggering: {
      label: 'disparo', notation: 'linha contínua, seta cheia no destino',
      meaning: 'Ordem temporal ou causal entre comportamentos.', reading: 'A —▶ B: "A dispara B"; B começa depois de A.',
      example: 'Checkout dispara Faturamento.',
    },
    flow: {
      label: 'fluxo', notation: 'linha tracejada, seta cheia no destino',
      meaning: 'Transferência de informação, valor ou material entre comportamentos.', reading: 'A ┄▶ B: "A passa algo para B".',
      example: 'Faturamento passa a nota fiscal para Expedição.',
    },
    specialization: {
      label: 'especialização', notation: 'linha contínua, triângulo vazio no destino',
      meaning: 'A é um tipo mais específico de B (mesmo tipo de elemento).', reading: 'A —▷ B: "A é um tipo de B".',
      example: 'Entrega Expressa é um tipo de Entrega.',
    },
    association: {
      label: 'associação', notation: 'linha contínua fina, sem setas',
      meaning: 'Relação genérica, sem semântica específica.', reading: 'A — B: "A está relacionado a B".',
      example: 'VPN associada ao Cluster.',
    },
  },
  derived: 'Relações derivadas (tracejado claro) aparecem quando elementos intermediários estão ocultos na visão, por camada, collapse ou granularidade. Elas resumem uma cadeia real de relações; o tipo mostrado é o mais fraco da cadeia.',
  confusions: [
    { q: 'serving × "usa" do C4', a: 'Mesma dependência, setas opostas. C4: "Web usa API" (seta Web → API). ArchiMate: "API serve Web" (seta API → Web). A seta do serving aponta para quem consome.' },
    { q: 'realization × serving', a: 'Realization liga o concreto ao abstrato do mesmo "assunto" (o componente implementa o serviço). Serving liga provedor e consumidor (o serviço é usado por um processo).' },
    { q: 'Para onde aponta a seta do access?', a: 'Escrita: para o dado. Leitura: para quem lê. Leitura e escrita: nas duas pontas. A linha é sempre pontilhada.' },
    { q: 'aggregation × composition', a: 'Losango cheio (composição): a parte não existe sem o todo. Losango vazio (agregação): a parte existe sozinha. Nos dois casos o losango fica no todo.' },
    { q: 'assignment × realization', a: 'Assignment diz quem executa (ator → processo, nó → artefato). Realization diz o que implementa o quê (processo → serviço).' },
    { q: 'Por que a análise de impacto sobe pela composição?', a: 'Na composição/agregação a parte sustenta o todo: se o Checkout Controller falha, a API de Pedidos (o todo) é afetada.' },
  ],
};
