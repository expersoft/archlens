import type { Usage } from './api';

/** One call to the agent: when it started and ended (browser clock) and the tokens the provider reported. */
export interface CallLog {
  startedAt: number;
  endedAt: number;
  usage?: Usage;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR');
const count = (n: number) => n.toLocaleString('pt-BR');
const seconds = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;

/** The total is input + output, the sum `plan.maxTokens` caps; cache is shown as the provider reports it. */
function tokens({ input, output, cacheRead }: Usage) {
  const parts = [`entrada ${count(input)}`, `saída ${count(output)}`, ...(cacheRead ? [`cache ${count(cacheRead)}`] : [])];
  return `${count(input + output)} tokens (${parts.join(', ')})`;
}

export function callText({ startedAt, endedAt, usage }: CallLog) {
  return [`${clock(startedAt)} → ${clock(endedAt)}`, seconds(endedAt - startedAt), ...(usage ? [tokens(usage)] : [])].join(' · ');
}

/** The discreet line at the foot of a call; the full date is in the tooltip, since a saved conversation outlives the day. */
export function CallFooter({ call }: { call: CallLog }) {
  return <p className="call-log" title={new Date(call.startedAt).toLocaleString('pt-BR')}>{callText(call)}</p>;
}
